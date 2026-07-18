import { randomUUID } from 'node:crypto';
import { Prisma, type Message, type MessageStatus, type PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env.js';
import { AppError, ERROR_CODES, toAppError, type ErrorCode } from '../../errors/app-error.js';
import type { AuditService } from '../../services/audit.service.js';
import type { RateLimitService } from '../../services/rate-limit.service.js';
import { EncryptionService } from '../../utils/encryption.js';
import { createTextPreview, type TextMessageInput } from '../../utils/message-validation.js';
import { normalizePhoneNumber } from '../../utils/phone-number.js';
import type { ProviderEventBus } from '../whatsapp/provider-event-bus.js';
import type { SendMessageResult, WhatsAppNumberCheckResult, WhatsAppProvider } from '../whatsapp/whatsapp.types.js';

export interface SendContext {
  adminUserId: string;
  instanceId: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface StoredSendResult extends SendMessageResult {
  recordId: string;
  duplicate: boolean;
}

export class MessageService {
  private readonly unsubscribe: () => void;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: WhatsAppProvider,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    private readonly rateLimits: RateLimitService,
    private readonly config: AppConfig,
    eventBus: ProviderEventBus,
  ) {
    this.unsubscribe = eventBus.subscribe((event) => {
      if (event.event === 'message.status') {
        void this.applyProviderStatus(event.externalMessageId, event.status, new Date(event.timestamp));
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  async checkNumber(adminUserId: string, instanceId: string, phoneNumber: string, request?: { ipAddress?: string; userAgent?: string }): Promise<WhatsAppNumberCheckResult> {
    await this.ensureInstance(instanceId);
    this.rateLimits.consume(`number:${adminUserId}`, this.config.NUMBER_CHECK_RATE_LIMIT_PER_MINUTE, 60_000);
    const result = await this.provider.checkNumber(instanceId, phoneNumber);
    await this.audit.record({
      adminUserId,
      action: 'NUMBER_CHECKED',
      entityType: 'WhatsAppInstance',
      entityId: instanceId,
      safeMetadata: { exists: result.exists },
      ...(request?.ipAddress ? { ipAddress: request.ipAddress } : {}),
      ...(request?.userAgent ? { userAgent: request.userAgent } : {}),
    });
    return result;
  }

  async send(input: TextMessageInput, context: SendContext): Promise<StoredSendResult> {
    const normalized = normalizePhoneNumber(input.phoneNumber);
    const idempotencyKey = context.idempotencyKey?.trim() || randomUUID();
    if (idempotencyKey.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      throw new AppError('VALIDATION_ERROR', 'Idempotency-Key contains unsupported characters.', 400);
    }

    const existing = await this.findIdempotent(context.adminUserId, context.instanceId, idempotencyKey);
    if (existing) return this.resultFromExisting(existing);
    await this.ensureInstance(context.instanceId);
    if (this.provider.getStatus(context.instanceId) !== 'CONNECTED') {
      throw new AppError('WHATSAPP_NOT_CONNECTED', 'The WhatsApp instance is not connected.', 503);
    }
    this.rateLimits.consume(`message:${context.instanceId}`, this.config.MESSAGE_RATE_LIMIT_PER_MINUTE, 60_000);

    let record: Message;
    try {
      record = await this.prisma.message.create({
        data: {
          instanceId: context.instanceId,
          adminUserId: context.adminUserId,
          recipientNumber: normalized.normalizedNumber,
          recipientJid: normalized.jid,
          textPreview: createTextPreview(input.message),
          encryptedText: this.config.STORE_FULL_MESSAGE_TEXT ? this.encryption.encryptPacked(input.message) : null,
          idempotencyKey,
          consentConfirmed: input.recipientConsentConfirmed,
          status: 'QUEUED',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.findIdempotent(context.adminUserId, context.instanceId, idempotencyKey);
        if (duplicate) return this.resultFromExisting(duplicate);
      }
      throw error;
    }

    await this.audit.record({
      ...this.auditContext(context),
      action: 'MESSAGE_SEND_REQUESTED',
      entityType: 'Message',
      entityId: record.id,
      safeMetadata: { consentConfirmed: true },
    });

    try {
      const checked = await this.checkNumber(context.adminUserId, context.instanceId, input.phoneNumber, context);
      if (!checked.exists || !checked.jid) {
        throw new AppError('NUMBER_NOT_ON_WHATSAPP', 'The recipient is not available on WhatsApp.', 422);
      }
      await this.prisma.message.update({ where: { id: record.id }, data: { recipientJid: checked.jid } });
      const result = await this.provider.sendText(context.instanceId, checked.jid, input.message);
      await this.prisma.message.update({
        where: { id: record.id },
        data: { status: 'ACCEPTED', externalMessageId: result.messageId },
      });
      await this.audit.record({
        ...this.auditContext(context),
        action: 'MESSAGE_SEND_SUCCEEDED',
        entityType: 'Message',
        entityId: record.id,
        safeMetadata: { status: 'ACCEPTED' },
      });
      return { ...result, recordId: record.id, duplicate: false };
    } catch (error) {
      const appError = toAppError(error);
      await this.prisma.message.update({
        where: { id: record.id },
        data: { status: 'FAILED', errorCode: appError.code, errorMessage: appError.message, failedAt: new Date() },
      });
      await this.audit.record({
        ...this.auditContext(context),
        action: 'MESSAGE_SEND_FAILED',
        entityType: 'Message',
        entityId: record.id,
        safeMetadata: { errorCode: appError.code },
      });
      throw appError;
    }
  }

  private async findIdempotent(adminUserId: string, instanceId: string, idempotencyKey: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { adminUserId_instanceId_idempotencyKey: { adminUserId, instanceId, idempotencyKey } },
    });
  }

  private async ensureInstance(instanceId: string): Promise<void> {
    if (await this.prisma.whatsAppInstance.count({ where: { id: instanceId } }) === 0) {
      throw new AppError('INSTANCE_NOT_FOUND', 'WhatsApp instance not found.', 404);
    }
  }

  private resultFromExisting(message: Message): StoredSendResult {
    if (message.status === 'FAILED') {
      const code = this.isErrorCode(message.errorCode) ? message.errorCode : 'MESSAGE_SEND_FAILED';
      throw new AppError(
        code,
        message.errorMessage ?? 'The original send request failed.',
        code === 'NUMBER_NOT_ON_WHATSAPP' ? 422 : code === 'VALIDATION_ERROR' || code === 'INVALID_PHONE_NUMBER' ? 400 : 503,
      );
    }
    return {
      success: true,
      messageId: message.externalMessageId ?? message.id,
      status: message.status,
      recipient: message.recipientNumber,
      createdAt: message.createdAt.toISOString(),
      recordId: message.id,
      duplicate: true,
    };
  }

  private isErrorCode(value: string | null): value is ErrorCode {
    return value !== null && (ERROR_CODES as readonly string[]).includes(value);
  }

  private async applyProviderStatus(externalMessageId: string, status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', at: Date): Promise<void> {
    const allowed: Record<typeof status, MessageStatus[]> = {
      SENT: ['QUEUED', 'ACCEPTED'],
      DELIVERED: ['QUEUED', 'ACCEPTED', 'SENT'],
      READ: ['QUEUED', 'ACCEPTED', 'SENT', 'DELIVERED'],
      FAILED: ['QUEUED', 'ACCEPTED'],
    };
    await this.prisma.message.updateMany({
      where: { externalMessageId, status: { in: allowed[status] } },
      data: {
        status,
        ...(status === 'SENT' ? { sentAt: at } : {}),
        ...(status === 'DELIVERED' ? { deliveredAt: at } : {}),
        ...(status === 'READ' ? { readAt: at } : {}),
        ...(status === 'FAILED' ? { failedAt: at, errorCode: 'MESSAGE_SEND_FAILED', errorMessage: 'WhatsApp reported a send failure.' } : {}),
      },
    });
  }

  private auditContext(context: SendContext) {
    return {
      adminUserId: context.adminUserId,
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    };
  }
}
