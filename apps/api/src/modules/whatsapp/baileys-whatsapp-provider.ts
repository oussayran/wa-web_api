import QRCode from 'qrcode';
import type { Logger } from 'pino';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  Browsers,
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  getContentType,
  initAuthCreds,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type ConnectionState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import { AppError } from '../../errors/app-error.js';
import { EncryptionService } from '../../utils/encryption.js';
import { InstanceMutexes } from '../../utils/mutex.js';
import { maskPhoneNumber, normalizePhoneNumber } from '../../utils/phone-number.js';
import type { AuditService } from '../../services/audit.service.js';
import { ProviderEventBus } from './provider-event-bus.js';
import { isConnectionTransitionAllowed } from './connection-state.js';
import { getReconnectDelay, MAX_RECONNECT_ATTEMPTS } from './reconnect-policy.js';
import type {
  ConnectionStatus,
  QrSnapshot,
  SendMessageResult,
  WhatsAppNumberCheckResult,
  WhatsAppProvider,
} from './whatsapp.types.js';

const QR_TTL_MS = 60_000;
const MAX_QR_DATA_URL_LENGTH = 200_000;
const SEND_TIMEOUT_MS = 30_000;

interface QrState extends QrSnapshot {
  timer: NodeJS.Timeout;
}

interface StoredAuthRecord {
  encryptedPayload: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  encryptionVersion: number;
}

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private readonly sockets = new Map<string, WASocket>();
  private readonly statuses = new Map<string, ConnectionStatus>();
  private readonly qrStates = new Map<string, QrState>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly explicitStops = new Set<string>();
  private readonly mutexes = new InstanceMutexes();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
    private readonly events: ProviderEventBus,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  async initialize(): Promise<void> {
    const instances = await this.prisma.whatsAppInstance.findMany({
      include: { _count: { select: { authState: true } } },
    });
    for (const instance of instances) this.statuses.set(instance.id, instance.status);
    const resumable = instances.filter((instance) =>
      instance._count.authState > 0 && !['DISCONNECTED', 'LOGGED_OUT'].includes(instance.status));
    await Promise.allSettled(resumable.map((instance) => this.createConnection(instance.id)));
  }

  getStatus(instanceId: string): ConnectionStatus {
    return this.statuses.get(instanceId) ?? 'DISCONNECTED';
  }

  getQrSnapshot(instanceId: string): QrSnapshot | undefined {
    const qr = this.qrStates.get(instanceId);
    if (!qr || new Date(qr.expiresAt).getTime() <= Date.now()) return undefined;
    return { qrImageDataUrl: qr.qrImageDataUrl, expiresAt: qr.expiresAt };
  }

  async connect(instanceId: string): Promise<void> {
    return this.createConnection(instanceId);
  }

  async createConnection(instanceId: string): Promise<void> {
    await this.mutexes.for(instanceId).runExclusive(async () => {
      await this.ensureInstance(instanceId);
      this.clearReconnectTimer(instanceId);
      this.explicitStops.delete(instanceId);
      const current = this.sockets.get(instanceId);
      if (current && ['INITIALIZING', 'CONNECTING', 'WAITING_FOR_QR', 'CONNECTED', 'RECONNECTING'].includes(this.getStatus(instanceId))) {
        if (this.getStatus(instanceId) !== 'WAITING_FOR_QR' || this.getQrSnapshot(instanceId)) return;
        this.sockets.delete(instanceId);
        await current.end(undefined).catch(() => undefined);
      } else if (current) {
        this.sockets.delete(instanceId);
        await current.end(undefined).catch(() => undefined);
      }
      await this.openSocket(instanceId);
    });
  }

  private async openSocket(instanceId: string): Promise<void> {
    await this.setStatus(instanceId, 'INITIALIZING');
    const { state, saveCreds } = await this.loadAuthenticationState(instanceId);
    const versionResult = await fetchLatestBaileysVersion();
    if (versionResult.error) {
      this.logger.warn({ instanceId, errorCode: 'BAILEYS_VERSION_LOOKUP_FAILED' }, 'Using Baileys fallback WhatsApp version');
    }

    // rc13 exports makeWASocket as ESM and wraps the supplied key store with transactions internally.
    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger.child({ component: 'baileys-key-store' })),
      },
      version: versionResult.version,
      browser: Browsers.appropriate('WhatsApp Connector'),
      logger: this.logger.child({ component: 'baileys', instanceId }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 30_000,
      connectTimeoutMs: 30_000,
      qrTimeout: QR_TTL_MS,
    });
    this.sockets.set(instanceId, socket);
    await this.setStatus(instanceId, 'CONNECTING');

    socket.ev.on('creds.update', async (update) => {
      if (this.sockets.get(instanceId) !== socket) return;
      Object.assign(state.creds, update);
      await saveCreds().catch((error: unknown) => {
        this.logger.error({ err: error, instanceId, errorCode: 'AUTH_STATE_SAVE_FAILED' }, 'Could not save WhatsApp credentials');
      });
    });
    socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(instanceId, socket, update).catch((error: unknown) => {
        void this.handleProviderError(instanceId, error);
      });
    });
    socket.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        if (!key.fromMe || !key.id || update.status === undefined || update.status === null) continue;
        const status = this.mapMessageStatus(update.status);
        if (status) {
          this.events.emit({
            event: 'message.status',
            instanceId,
            externalMessageId: key.id,
            status,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key?.fromMe || !msg.key?.id || !msg.message) continue;
        const content = getContentType(msg.message);
        if (!content) continue;
        const text = msg.message.conversation
          || (msg.message.extendedTextMessage?.text ?? '')
          || (msg.message.imageMessage?.caption ?? '')
          || (msg.message.videoMessage?.caption ?? '')
          || '';
        if (!text) continue;
        const msgKeyId = msg.key.id;
        const senderJid = msg.key.participant
          ? jidNormalizedUser(msg.key.participant)
          : jidNormalizedUser(msg.key.remoteJid!);
        const stripDevice = (jid: string): string => jid.replace(/:(\d+)(@|$)/, '$2');
        void (async () => {
          let senderNumber: string;
          if (senderJid.endsWith('@s.whatsapp.net')) {
            senderNumber = senderJid.split('@')[0]!;
          } else {
            senderNumber = senderJid.replace(/@lid$/, '');
            try {
              const pnJid = await socket.signalRepository?.lidMapping?.getPNForLID(senderJid);
              if (pnJid?.endsWith('@s.whatsapp.net')) {
                senderNumber = pnJid.split('@')[0]!;
              }
            } catch { /* fallback to LID digits */ }
          }
          senderNumber = stripDevice(senderNumber);
          this.logger.info({ instanceId, senderJid, senderNumber, preview: text.slice(0, 20) }, 'message.new emitted');
          this.events.emit({
            event: 'message.new',
            instanceId,
            externalMessageId: msgKeyId,
            senderJid,
            senderNumber,
            text,
            timestamp: new Date().toISOString(),
          });
        })();
      }
    });
  }

  private async handleConnectionUpdate(
    instanceId: string,
    socket: WASocket,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    if (this.sockets.get(instanceId) !== socket) return;
    if (update.qr) await this.publishQr(instanceId, update.qr);
    if (update.connection === 'connecting' && this.getStatus(instanceId) !== 'WAITING_FOR_QR') {
      await this.setStatus(instanceId, this.getStatus(instanceId) === 'RECONNECTING' ? 'RECONNECTING' : 'CONNECTING');
    }
    if (update.connection === 'open') {
      this.clearQr(instanceId);
      this.clearReconnectTimer(instanceId);
      const accountJid = socket.user?.phoneNumber ?? socket.user?.id;
      const normalizedJid = accountJid ? jidNormalizedUser(accountJid) : undefined;
      const connectedPhone = normalizedJid?.endsWith('@s.whatsapp.net') ? normalizedJid.split('@')[0] : undefined;
      await this.prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          status: 'CONNECTED',
          connectedJid: normalizedJid ?? null,
          connectedPhone: connectedPhone ?? null,
          lastConnectedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
          reconnectAttempts: 0,
        },
      });
      this.statuses.set(instanceId, 'CONNECTED');
      const timestamp = new Date().toISOString();
      this.events.emit({ event: 'whatsapp.status', instanceId, status: 'CONNECTED', timestamp });
      this.events.emit({
        event: 'whatsapp.connected',
        instanceId,
        status: 'CONNECTED',
        ...(connectedPhone ? { connectedPhone } : {}),
        timestamp,
      });
      await this.audit.record({ action: 'WHATSAPP_CONNECTED', entityType: 'WhatsAppInstance', entityId: instanceId });
    }
    if (update.connection === 'close') await this.handleClose(instanceId, socket, update.lastDisconnect?.error);
  }

  private async handleClose(instanceId: string, socket: WASocket, error: unknown): Promise<void> {
    if (this.sockets.get(instanceId) !== socket) return;
    this.sockets.delete(instanceId);
    this.clearQr(instanceId);
    const reason = this.disconnectCode(error);
    if (this.explicitStops.has(instanceId)) return;
    await this.audit.record({
      action: 'WHATSAPP_DISCONNECTED',
      entityType: 'WhatsAppInstance',
      entityId: instanceId,
      safeMetadata: { disconnectCode: reason },
    });

    const invalidSession = [DisconnectReason.loggedOut, DisconnectReason.badSession, DisconnectReason.multideviceMismatch].includes(reason);
    if (invalidSession) {
      await this.prisma.whatsAppAuthState.deleteMany({ where: { instanceId } });
      await this.setStatus(instanceId, 'LOGGED_OUT', 'WHATSAPP_LOGGED_OUT', 'The linked session is no longer valid.');
      await this.audit.record({ action: 'WHATSAPP_LOGGED_OUT', entityType: 'WhatsAppInstance', entityId: instanceId });
      this.events.emit({ event: 'whatsapp.disconnected', instanceId, status: 'LOGGED_OUT', timestamp: new Date().toISOString() });
      return;
    }
    if (reason === DisconnectReason.connectionReplaced || reason === DisconnectReason.forbidden) {
      await this.setStatus(instanceId, 'ERROR', 'WHATSAPP_CONNECTION_FAILED', 'The connection was replaced or refused.');
      return;
    }
    await this.scheduleReconnect(instanceId);
  }

  private async scheduleReconnect(instanceId: string): Promise<void> {
    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
    if (!instance || this.explicitStops.has(instanceId)) return;
    const attempt = instance.reconnectAttempts + 1;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      await this.setStatus(instanceId, 'ERROR', 'WHATSAPP_CONNECTION_FAILED', 'Maximum reconnect attempts reached.');
      return;
    }
    await this.prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: { status: 'RECONNECTING', reconnectAttempts: attempt, lastDisconnectedAt: new Date() },
    });
    this.statuses.set(instanceId, 'RECONNECTING');
    this.events.emit({ event: 'whatsapp.status', instanceId, status: 'RECONNECTING', timestamp: new Date().toISOString() });
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(instanceId);
      void this.createConnection(instanceId).catch((error: unknown) => this.handleProviderError(instanceId, error));
    }, getReconnectDelay(attempt));
    timer.unref();
    this.reconnectTimers.set(instanceId, timer);
  }

  private async publishQr(instanceId: string, rawQr: string): Promise<void> {
    const qrImageDataUrl = await QRCode.toDataURL(rawQr, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
    if (qrImageDataUrl.length > MAX_QR_DATA_URL_LENGTH) {
      throw new AppError('WHATSAPP_CONNECTION_FAILED', 'Generated QR payload exceeded the safety limit.', 500);
    }
    this.clearQr(instanceId);
    const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
    const timer = setTimeout(() => this.clearQr(instanceId), QR_TTL_MS);
    timer.unref();
    this.qrStates.set(instanceId, { qrImageDataUrl, expiresAt, timer });
    await this.setStatus(instanceId, 'WAITING_FOR_QR');
    this.events.emit({ event: 'whatsapp.qr', instanceId, qrImageDataUrl, expiresAt });
  }

  async checkNumber(instanceId: string, phoneNumber: string): Promise<WhatsAppNumberCheckResult> {
    const normalized = normalizePhoneNumber(phoneNumber);
    const socket = this.requireConnectedSocket(instanceId);
    let result: Awaited<ReturnType<WASocket['onWhatsApp']>>;
    try {
      result = await socket.onWhatsApp(normalized.normalizedNumber);
    } catch (error) {
      this.logger.warn({ err: error, instanceId, recipient: maskPhoneNumber(normalized.normalizedNumber) }, 'WhatsApp number lookup failed');
      throw new AppError('NUMBER_CHECK_FAILED', 'WhatsApp could not verify this number right now.', 503);
    }
    const match = result?.[0];
    if (!match?.exists) {
      return {
        input: phoneNumber,
        normalizedNumber: normalized.normalizedNumber,
        exists: false,
        reason: 'The number is not available on WhatsApp.',
      };
    }
    const jid = jidNormalizedUser(match.jid);
    if (!jid.endsWith('@s.whatsapp.net')) {
      throw new AppError('NUMBER_CHECK_FAILED', 'WhatsApp returned an unsupported recipient type.', 503);
    }
    return { input: phoneNumber, normalizedNumber: normalized.normalizedNumber, exists: true, jid };
  }

  async sendText(instanceId: string, recipient: string, text: string): Promise<SendMessageResult> {
    return this.mutexes.for(instanceId).runExclusive(async () => {
      const socket = this.requireConnectedSocket(instanceId);
      if (!/^\d{8,15}@s\.whatsapp\.net$/.test(recipient)) {
        throw new AppError('INVALID_PHONE_NUMBER', 'Only individual WhatsApp recipients are supported.', 400);
      }
      let timeout: NodeJS.Timeout | undefined;
      try {
        const response = await Promise.race([
          socket.sendMessage(recipient, { text }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new AppError('MESSAGE_SEND_TIMEOUT', 'The send operation timed out.', 503)), SEND_TIMEOUT_MS);
          }),
        ]);
        const messageId = response?.key.id;
        if (!messageId) throw new AppError('MESSAGE_SEND_FAILED', 'WhatsApp did not accept the message.', 503);
        return {
          success: true,
          messageId,
          status: 'ACCEPTED',
          recipient: recipient.split('@')[0]!,
          createdAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        this.logger.error({ err: error, instanceId, recipient: maskPhoneNumber(recipient.split('@')[0]!) }, 'WhatsApp message send failed');
        throw new AppError('MESSAGE_SEND_FAILED', 'WhatsApp could not accept the message.', 503);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });
  }

  async sendTextMessage(instanceId: string, recipient: string, text: string): Promise<SendMessageResult> {
    return this.sendText(instanceId, recipient, text);
  }

  async disconnect(instanceId: string): Promise<void> {
    await this.mutexes.for(instanceId).runExclusive(async () => {
      await this.ensureInstance(instanceId);
      this.explicitStops.add(instanceId);
      this.clearReconnectTimer(instanceId);
      this.clearQr(instanceId);
      const socket = this.sockets.get(instanceId);
      this.sockets.delete(instanceId);
      if (socket) await socket.end(undefined).catch(() => undefined);
      await this.setStatus(instanceId, 'DISCONNECTED');
      await this.audit.record({ action: 'WHATSAPP_DISCONNECTED', entityType: 'WhatsAppInstance', entityId: instanceId });
      this.events.emit({ event: 'whatsapp.disconnected', instanceId, status: 'DISCONNECTED', timestamp: new Date().toISOString() });
    });
  }

  async logout(instanceId: string): Promise<void> {
    await this.mutexes.for(instanceId).runExclusive(async () => {
      await this.ensureInstance(instanceId);
      this.explicitStops.add(instanceId);
      this.clearReconnectTimer(instanceId);
      this.clearQr(instanceId);
      const socket = this.sockets.get(instanceId);
      this.sockets.delete(instanceId);
      if (socket) await socket.logout('Administrator logged out the linked session').catch(() => undefined);
      await this.prisma.whatsAppAuthState.deleteMany({ where: { instanceId } });
      await this.setStatus(instanceId, 'LOGGED_OUT');
      await this.audit.record({ action: 'WHATSAPP_LOGGED_OUT', entityType: 'WhatsAppInstance', entityId: instanceId });
      this.events.emit({ event: 'whatsapp.disconnected', instanceId, status: 'LOGGED_OUT', timestamp: new Date().toISOString() });
    });
  }

  async removeAuthState(instanceId: string): Promise<void> {
    await this.mutexes.for(instanceId).runExclusive(async () => {
      if (this.sockets.has(instanceId)) {
        throw new AppError('WHATSAPP_CONNECTION_FAILED', 'Disconnect or log out the instance before removing credentials.', 409);
      }
      await this.prisma.whatsAppAuthState.deleteMany({ where: { instanceId } });
    });
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.mutexes.for(instanceId).runExclusive(async () => {
      const instance = await this.prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
      if (!instance) throw new AppError('INSTANCE_NOT_FOUND', 'WhatsApp instance not found.', 404);
      if (!['DISCONNECTED', 'LOGGED_OUT', 'ERROR'].includes(instance.status) || this.sockets.has(instanceId)) {
        throw new AppError('WHATSAPP_CONNECTION_FAILED', 'Disconnect or log out the instance before deleting it.', 409);
      }
      this.clearReconnectTimer(instanceId);
      this.clearQr(instanceId);
      await this.prisma.whatsAppInstance.delete({ where: { id: instanceId } });
      this.statuses.delete(instanceId);
      this.explicitStops.delete(instanceId);
    });
  }

  async destroy(): Promise<void> {
    for (const instanceId of this.sockets.keys()) this.explicitStops.add(instanceId);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    for (const state of this.qrStates.values()) clearTimeout(state.timer);
    await Promise.allSettled([...this.sockets.values()].map((socket) => socket.end(undefined)));
    this.sockets.clear();
    this.reconnectTimers.clear();
    this.qrStates.clear();
  }

  private requireConnectedSocket(instanceId: string): WASocket {
    const socket = this.sockets.get(instanceId);
    if (!socket || this.getStatus(instanceId) !== 'CONNECTED') {
      throw new AppError('WHATSAPP_NOT_CONNECTED', 'The WhatsApp instance is not connected.', 503);
    }
    return socket;
  }

  private async ensureInstance(instanceId: string): Promise<void> {
    const count = await this.prisma.whatsAppInstance.count({ where: { id: instanceId } });
    if (!count) throw new AppError('INSTANCE_NOT_FOUND', 'WhatsApp instance not found.', 404);
  }

  private async setStatus(instanceId: string, status: ConnectionStatus, errorCode?: string, errorMessage?: string): Promise<void> {
    const current = this.getStatus(instanceId);
    if (!isConnectionTransitionAllowed(current, status)) {
      this.logger.warn({ instanceId, fromStatus: current, toStatus: status }, 'Unexpected WhatsApp state transition');
    }
    this.statuses.set(instanceId, status);
    await this.prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status,
        ...(status === 'DISCONNECTED' || status === 'LOGGED_OUT' || status === 'ERROR' ? { lastDisconnectedAt: new Date() } : {}),
        ...(errorCode ? { lastErrorCode: errorCode } : {}),
        ...(errorMessage ? { lastErrorMessage: errorMessage } : {}),
      },
    });
    const timestamp = new Date().toISOString();
    this.events.emit({ event: 'whatsapp.status', instanceId, status, timestamp });
    if (status === 'ERROR') {
      this.events.emit({
        event: 'whatsapp.error',
        instanceId,
        code: errorCode ?? 'WHATSAPP_CONNECTION_FAILED',
        message: errorMessage ?? 'The WhatsApp connection failed.',
        timestamp,
      });
    }
  }

  private async handleProviderError(instanceId: string, error: unknown): Promise<void> {
    this.logger.error({ err: error, instanceId, errorCode: 'WHATSAPP_CONNECTION_FAILED' }, 'WhatsApp provider error');
    await this.setStatus(instanceId, 'ERROR', 'WHATSAPP_CONNECTION_FAILED', 'The WhatsApp connection failed.');
  }

  private disconnectCode(error: unknown): number {
    const candidate = error as Error & { output?: { statusCode?: number }; statusCode?: number };
    return candidate?.output?.statusCode ?? candidate?.statusCode ?? DisconnectReason.connectionClosed;
  }

  private mapMessageStatus(status: proto.WebMessageInfo.Status): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | undefined {
    if (status === proto.WebMessageInfo.Status.ERROR) return 'FAILED';
    if (status === proto.WebMessageInfo.Status.SERVER_ACK) return 'SENT';
    if (status === proto.WebMessageInfo.Status.DELIVERY_ACK) return 'DELIVERED';
    if (status === proto.WebMessageInfo.Status.READ || status === proto.WebMessageInfo.Status.PLAYED) return 'READ';
    return undefined;
  }

  private clearQr(instanceId: string): void {
    const existing = this.qrStates.get(instanceId);
    if (existing) clearTimeout(existing.timer);
    this.qrStates.delete(instanceId);
  }

  private clearReconnectTimer(instanceId: string): void {
    const timer = this.reconnectTimers.get(instanceId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(instanceId);
  }

  private serialize(value: unknown): Buffer {
    return Buffer.from(JSON.stringify(value, BufferJSON.replacer), 'utf8');
  }

  private deserialize<T>(record: StoredAuthRecord): T {
    const plaintext = this.encryption.decrypt({
      encryptedPayload: Buffer.from(record.encryptedPayload),
      iv: Buffer.from(record.iv),
      authTag: Buffer.from(record.authTag),
      encryptionVersion: record.encryptionVersion,
    });
    return JSON.parse(plaintext.toString('utf8'), BufferJSON.reviver) as T;
  }

  private async loadAuthenticationState(instanceId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const credentialsRecord = await this.prisma.whatsAppAuthState.findUnique({
      where: { instanceId_authKey: { instanceId, authKey: 'creds' } },
    });
    const creds = credentialsRecord
      ? this.deserialize<AuthenticationCreds>(credentialsRecord)
      : initAuthCreds();

    const keys: SignalKeyStore = {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const records = await this.prisma.whatsAppAuthState.findMany({
          where: { instanceId, authKey: { in: ids.map((id) => `${type}:${id}`) } },
        });
        const byKey = new Map(records.map((record) => [record.authKey, record]));
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const record = byKey.get(`${type}:${id}`);
          if (!record) continue;
          let value = this.deserialize<SignalDataTypeMap[T]>(record);
          // rc13 still requires protobuf reconstruction for app-state keys after BufferJSON revival.
          if (type === 'app-state-sync-key') {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as proto.Message.IAppStateSyncKeyData) as unknown as SignalDataTypeMap[T];
          }
          result[id] = value;
        }
        return result;
      },
      set: async (data: SignalDataSet) => {
        const operations: Array<(client: Prisma.TransactionClient) => Promise<unknown>> = [];
        for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
          const entries = data[category];
          if (!entries) continue;
          for (const [id, value] of Object.entries(entries)) {
            const authKey = `${category}:${id}`;
            if (value === null) {
              operations.push((client) => client.whatsAppAuthState.deleteMany({ where: { instanceId, authKey } }));
            } else {
              const encrypted = this.encryption.encrypt(this.serialize(value));
              operations.push((client) => client.whatsAppAuthState.upsert({
                where: { instanceId_authKey: { instanceId, authKey } },
                create: { instanceId, authKey, ...encrypted },
                update: encrypted,
              }));
            }
          }
        }
        await this.prisma.$transaction(async (transaction) => {
          for (const operation of operations) await operation(transaction);
        });
      },
      clear: async () => {
        await this.prisma.whatsAppAuthState.deleteMany({ where: { instanceId, authKey: { not: 'creds' } } });
      },
    };

    return {
      state: { creds, keys },
      saveCreds: async () => {
        const encrypted = this.encryption.encrypt(this.serialize(creds));
        await this.prisma.whatsAppAuthState.upsert({
          where: { instanceId_authKey: { instanceId, authKey: 'creds' } },
          create: { instanceId, authKey: 'creds', ...encrypted },
          update: encrypted,
        });
      },
    };
  }
}
