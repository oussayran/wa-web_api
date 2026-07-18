import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { MessageDirection, MessageStatus, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { textMessageSchema } from '../../utils/message-validation.js';
import { normalizePhoneNumber } from '../../utils/phone-number.js';
import type { MessageService } from './message.service.js';

const instanceIdSchema = z.string().min(1).max(50).regex(/^[a-z0-9][a-z0-9_-]*$/);
const checkNumberSchema = z.object({ phoneNumber: z.string().min(1).max(40) });
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(MessageStatus).optional(),
});

interface MessageRouteDependencies {
  prisma: PrismaClient;
  messages: MessageService;
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

function instanceId(request: FastifyRequest): string {
  return instanceIdSchema.parse((request.params as { instanceId?: string }).instanceId);
}

function requestContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
  };
}

function serializeMessage(message: {
  id: string;
  recipientNumber: string;
  senderNumber: string | null;
  textPreview: string | null;
  status: MessageStatus;
  direction: MessageDirection;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
}) {
  return {
    id: message.id,
    direction: message.direction,
    recipient: message.recipientNumber,
    sender: message.senderNumber,
    preview: message.textPreview,
    status: message.status,
    error: message.errorMessage ? { code: message.errorCode, message: message.errorMessage } : null,
    createdAt: message.createdAt.toISOString(),
    sentAt: message.sentAt?.toISOString() ?? null,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
    readAt: message.readAt?.toISOString() ?? null,
  };
}

export async function registerMessageRoutes(app: FastifyInstance, dependencies: MessageRouteDependencies): Promise<void> {
  const { prisma, messages, requireAuth, requireCsrf } = dependencies;

  app.post('/api/v1/whatsapp/instances/:instanceId/check-number', { preHandler: [requireAuth, requireCsrf] }, async (request) => {
    const targetInstance = instanceId(request);
    const input = checkNumberSchema.parse(request.body);
    normalizePhoneNumber(input.phoneNumber);
    return messages.checkNumber(request.admin!.id, targetInstance, input.phoneNumber, requestContext(request));
  });

  app.post('/api/v1/whatsapp/instances/:instanceId/messages/text', { preHandler: [requireAuth, requireCsrf] }, async (request) => {
    const targetInstance = instanceId(request);
    const input = textMessageSchema.parse(request.body);
    const idempotencyHeader = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader;
    return messages.send(input, {
      adminUserId: request.admin!.id,
      instanceId: targetInstance,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...requestContext(request),
    });
  });

  app.get('/api/v1/whatsapp/instances/:instanceId/messages', { preHandler: [requireAuth] }, async (request) => {
    const targetInstance = instanceId(request);
    if (await prisma.whatsAppInstance.count({ where: { id: targetInstance } }) === 0) {
      throw new AppError('INSTANCE_NOT_FOUND', 'WhatsApp instance not found.', 404);
    }
    const query = paginationSchema.parse(request.query);
    const where = { instanceId: targetInstance, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.message.count({ where }),
    ]);
    return {
      items: items.map(serializeMessage),
      pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  });

  app.get('/api/v1/whatsapp/instances/:instanceId/messages/:messageId', { preHandler: [requireAuth] }, async (request) => {
    const targetInstance = instanceId(request);
    if (await prisma.whatsAppInstance.count({ where: { id: targetInstance } }) === 0) {
      throw new AppError('INSTANCE_NOT_FOUND', 'WhatsApp instance not found.', 404);
    }
    const messageId = z.string().uuid().parse((request.params as { messageId?: string }).messageId);
    const message = await prisma.message.findFirst({ where: { id: messageId, instanceId: targetInstance } });
    if (!message) throw new AppError('INSTANCE_NOT_FOUND', 'Message not found.', 404);
    return serializeMessage(message);
  });
}
