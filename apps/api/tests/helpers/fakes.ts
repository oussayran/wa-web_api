import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { AdminRole, ConnectionStatus as PrismaConnectionStatus, MessageStatus, PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../src/config/env.js';
import { normalizePhoneNumber } from '../../src/utils/phone-number.js';
import type {
  ConnectionStatus,
  QrSnapshot,
  SendMessageResult,
  WhatsAppNumberCheckResult,
  WhatsAppProvider,
} from '../../src/modules/whatsapp/whatsapp.types.js';

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeSession {
  id: string;
  tokenHash: string;
  csrfHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeInstance {
  id: string;
  name: string;
  status: PrismaConnectionStatus;
  connectedPhone: string | null;
  connectedJid: string | null;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  reconnectAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMessage {
  id: string;
  instanceId: string;
  adminUserId: string;
  direction: 'OUTBOUND';
  recipientNumber: string;
  recipientJid: string;
  textPreview: string | null;
  encryptedText: Uint8Array | null;
  externalMessageId: string | null;
  idempotencyKey: string;
  status: MessageStatus;
  errorCode: string | null;
  errorMessage: string | null;
  consentConfirmed: boolean;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  updatedAt: Date;
}

export class FakeDatabase {
  users: FakeUser[] = [];
  sessions: FakeSession[] = [];
  instances: FakeInstance[] = [];
  messages: FakeMessage[] = [];
  audits: unknown[] = [];

  async seedAdmin(email = 'admin@example.com', password = 'correct-horse-battery'): Promise<FakeUser> {
    const now = new Date();
    const user: FakeUser = {
      id: randomUUID(),
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 4096, timeCost: 1 }),
      role: 'ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  client: PrismaClient;

  constructor() {
    const self = this;
    this.client = {
      adminUser: {
        findUnique: async ({ where }: { where: { email: string } }) => self.users.find((user) => user.email === where.email) ?? null,
      },
      adminSession: {
        create: async ({ data }: { data: Omit<FakeSession, 'id' | 'createdAt' | 'updatedAt'> }) => {
          const now = new Date();
          const session = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
          self.sessions.push(session);
          return session;
        },
        findUnique: async ({ where, include }: { where: { tokenHash: string }; include?: { user: boolean } }) => {
          const session = self.sessions.find((entry) => entry.tokenHash === where.tokenHash);
          if (!session) return null;
          return include ? { ...session, user: self.users.find((user) => user.id === session.userId)! } : session;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const session = self.sessions.find((entry) => entry.id === where.id)!;
          self.sessions = self.sessions.filter((entry) => entry.id !== where.id);
          return session;
        },
        deleteMany: async ({ where }: { where: { id?: string; expiresAt?: { lt: Date } } }) => {
          const before = self.sessions.length;
          self.sessions = self.sessions.filter((entry) => {
            if (where.id) return entry.id !== where.id;
            if (where.expiresAt) return entry.expiresAt >= where.expiresAt.lt;
            return false;
          });
          return { count: before - self.sessions.length };
        },
      },
      auditLog: {
        create: async ({ data }: { data: unknown }) => {
          const entry = { id: randomUUID(), createdAt: new Date(), ...data as object };
          self.audits.push(entry);
          return entry;
        },
      },
      whatsAppInstance: {
        findMany: async (args?: { where?: unknown; select?: { id: boolean; status: boolean }; orderBy?: unknown }) => {
          const values = [...self.instances];
          if (args?.select) return values.map(({ id, status }) => ({ id, status }));
          return values;
        },
        findUnique: async ({ where }: { where: { id: string } }) => self.instances.find((entry) => entry.id === where.id) ?? null,
        count: async ({ where }: { where: { id: string } }) => self.instances.filter((entry) => entry.id === where.id).length,
        create: async ({ data }: { data: { id: string; name: string } }) => {
          const now = new Date();
          const instance: FakeInstance = {
            ...data,
            status: 'DISCONNECTED',
            connectedPhone: null,
            connectedJid: null,
            lastConnectedAt: null,
            lastDisconnectedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            reconnectAttempts: 0,
            createdAt: now,
            updatedAt: now,
          };
          self.instances.push(instance);
          return instance;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<FakeInstance> }) => {
          const instance = self.instances.find((entry) => entry.id === where.id);
          if (!instance) throw new Error('Instance not found');
          Object.assign(instance, data, { updatedAt: new Date() });
          return instance;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const instance = self.instances.find((entry) => entry.id === where.id)!;
          self.instances = self.instances.filter((entry) => entry.id !== where.id);
          self.messages = self.messages.filter((entry) => entry.instanceId !== where.id);
          return instance;
        },
      },
      whatsAppAuthState: {
        deleteMany: async () => ({ count: 0 }),
      },
      message: {
        findUnique: async ({ where }: { where: { adminUserId_instanceId_idempotencyKey: { adminUserId: string; instanceId: string; idempotencyKey: string } } }) => {
          const key = where.adminUserId_instanceId_idempotencyKey;
          return self.messages.find((entry) => entry.adminUserId === key.adminUserId && entry.instanceId === key.instanceId && entry.idempotencyKey === key.idempotencyKey) ?? null;
        },
        create: async ({ data }: { data: Partial<FakeMessage> & Pick<FakeMessage, 'instanceId' | 'adminUserId' | 'recipientNumber' | 'recipientJid' | 'idempotencyKey' | 'consentConfirmed'> }) => {
          const now = new Date();
          const message: FakeMessage = {
            id: randomUUID(),
            direction: 'OUTBOUND',
            textPreview: null,
            encryptedText: null,
            externalMessageId: null,
            status: 'QUEUED',
            errorCode: null,
            errorMessage: null,
            createdAt: now,
            sentAt: null,
            deliveredAt: null,
            readAt: null,
            failedAt: null,
            updatedAt: now,
            ...data,
          };
          self.messages.push(message);
          return message;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<FakeMessage> }) => {
          const message = self.messages.find((entry) => entry.id === where.id)!;
          Object.assign(message, data, { updatedAt: new Date() });
          return message;
        },
        updateMany: async ({ where, data }: { where: { externalMessageId?: string; status?: { in: MessageStatus[] } }; data: Partial<FakeMessage> }) => {
          const matching = self.messages.filter((entry) =>
            (!where.externalMessageId || entry.externalMessageId === where.externalMessageId)
            && (!where.status || where.status.in.includes(entry.status)));
          matching.forEach((entry) => Object.assign(entry, data, { updatedAt: new Date() }));
          return { count: matching.length };
        },
        findMany: async ({ where, skip = 0, take = 20 }: { where: { instanceId: string; status?: MessageStatus }; skip?: number; take?: number }) => self.messages
          .filter((entry) => entry.instanceId === where.instanceId && (!where.status || entry.status === where.status))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
        count: async ({ where }: { where: { instanceId: string; status?: MessageStatus } }) => self.messages
          .filter((entry) => entry.instanceId === where.instanceId && (!where.status || entry.status === where.status)).length,
      },
      $transaction: async (value: unknown) => {
        if (typeof value === 'function') return (value as (client: PrismaClient) => Promise<unknown>)(self.client);
        return Promise.all(value as Promise<unknown>[]);
      },
      $queryRaw: async () => [{ '?column?': 1 }],
      $disconnect: async () => undefined,
    } as unknown as PrismaClient;
  }
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly statuses = new Map<string, ConnectionStatus>();
  sendCount = 0;

  initialize = async () => undefined;
  destroy = async () => undefined;
  getQrSnapshot = (_instanceId: string): QrSnapshot | undefined => undefined;
  getStatus = (instanceId: string): ConnectionStatus => this.statuses.get(instanceId) ?? 'DISCONNECTED';
  createConnection = async (instanceId: string) => { this.statuses.set(instanceId, 'CONNECTING'); };
  connect = this.createConnection;
  disconnect = async (instanceId: string) => { this.statuses.set(instanceId, 'DISCONNECTED'); };
  logout = async (instanceId: string) => { this.statuses.set(instanceId, 'LOGGED_OUT'); };
  removeAuthState = async (_instanceId: string) => undefined;
  deleteInstance = async (instanceId: string) => { this.statuses.delete(instanceId); };

  async checkNumber(_instanceId: string, phoneNumber: string): Promise<WhatsAppNumberCheckResult> {
    const normalized = normalizePhoneNumber(phoneNumber);
    return { input: phoneNumber, normalizedNumber: normalized.normalizedNumber, exists: true, jid: normalized.jid };
  }

  async sendText(_instanceId: string, recipient: string, _text: string): Promise<SendMessageResult> {
    this.sendCount += 1;
    return {
      success: true,
      messageId: `mock-${this.sendCount}`,
      status: 'ACCEPTED',
      recipient: recipient.split('@')[0]!,
      createdAt: new Date().toISOString(),
    };
  }

  sendTextMessage = this.sendText.bind(this);
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    API_PORT: 3000,
    APP_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://unused',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'correct-horse-battery',
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters',
    STORE_FULL_MESSAGE_TEXT: false,
    MESSAGE_RETENTION_DAYS: 30,
    IDEMPOTENCY_RETENTION_HOURS: 24,
    NUMBER_CHECK_RATE_LIMIT_PER_MINUTE: 10,
    MESSAGE_RATE_LIMIT_PER_MINUTE: 5,
    AUTH_FAILURE_RATE_LIMIT_PER_15_MINUTES: 5,
    LOG_LEVEL: 'silent',
    sessionEncryptionKey: Buffer.alloc(32, 9),
    ...overrides,
  };
}
