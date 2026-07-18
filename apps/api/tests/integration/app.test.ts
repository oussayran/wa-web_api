import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';
import { FakeDatabase, MockWhatsAppProvider, testConfig } from '../helpers/fakes.js';

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
  requestId: string;
}

interface AuthState {
  cookie: string;
  csrf: string;
}

function body<T>(response: { json(): unknown }): Envelope<T> {
  return response.json() as Envelope<T>;
}

describe('administrator API integration', () => {
  let app: FastifyInstance;
  let database: FakeDatabase;
  let provider: MockWhatsAppProvider;

  beforeEach(async () => {
    database = new FakeDatabase();
    await database.seedAdmin();
    provider = new MockWhatsAppProvider();
    app = await buildApp({
      config: testConfig({ NUMBER_CHECK_RATE_LIMIT_PER_MINUTE: 2 }),
      prisma: database.client,
      provider,
      logger: createLogger('silent'),
      skipProviderInitialization: true,
      disableRetentionTask: true,
      disableWebsocket: true,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(): Promise<AuthState> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-horse-battery' },
    });
    expect(response.statusCode).toBe(200);
    const payload = body<{ admin: { email: string }; csrfToken: string }>(response);
    const setCookies = response.headers['set-cookie'];
    const values = Array.isArray(setCookies) ? setCookies : [setCookies!];
    return { cookie: values.map((value) => value.split(';')[0]).join('; '), csrf: payload.data.csrfToken };
  }

  async function createInstance(auth: AuthState): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/instances',
      headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
      payload: { instanceId: 'default', name: 'Default account' },
    });
    expect(response.statusCode).toBe(201);
  }

  it('logs in with a secure cookie and returns the administrator', async () => {
    const auth = await login();
    expect(auth.cookie).toContain('wa_admin_session=');
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: auth.cookie } });
    expect(body<{ admin: { email: string } }>(response).data.admin.email).toBe('admin@example.com');
  });

  it('rejects unauthenticated administration access', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/whatsapp/instances' });
    expect(response.statusCode).toBe(401);
    expect(body<never>(response).error?.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('creates an instance and rejects a send while disconnected', async () => {
    const auth = await login();
    await createInstance(auth);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/instances/default/messages/text',
      headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'idempotency-key': 'disconnected-send' },
      payload: { phoneNumber: '+33612345678', message: 'Hello', recipientConsentConfirmed: true },
    });
    expect(response.statusCode).toBe(503);
    expect(body<never>(response).error?.code).toBe('WHATSAPP_NOT_CONNECTED');
  });

  it('validates number checks and rate limits repeated lookup', async () => {
    const auth = await login();
    await createInstance(auth);
    provider.statuses.set('default', 'CONNECTED');
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/instances/default/check-number',
      headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
      payload: { phoneNumber: '0612345678' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(body<never>(invalid).error?.code).toBe('INVALID_PHONE_NUMBER');

    for (let index = 0; index < 2; index += 1) {
      const accepted = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/instances/default/check-number',
        headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
        payload: { phoneNumber: '+33612345678' },
      });
      expect(accepted.statusCode).toBe(200);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/instances/default/check-number',
      headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
      payload: { phoneNumber: '+33612345678' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('deduplicates sends and paginates message history', async () => {
    const auth = await login();
    await createInstance(auth);
    provider.statuses.set('default', 'CONNECTED');
    const send = (key: string, message: string) => app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/instances/default/messages/text',
      headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'idempotency-key': key },
      payload: { phoneNumber: '+33612345678', message, recipientConsentConfirmed: true },
    });
    const first = await send('same-key', 'First message');
    const duplicate = await send('same-key', 'First message');
    expect(first.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(200);
    expect(body<{ duplicate: boolean }>(duplicate).data.duplicate).toBe(true);
    expect(provider.sendCount).toBe(1);

    await send('second-key', 'Second message');
    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/whatsapp/instances/default/messages?page=1&limit=1&status=ACCEPTED',
      headers: { cookie: auth.cookie },
    });
    const page = body<{ items: unknown[]; pagination: { page: number; limit: number; total: number; pages: number } }>(history).data;
    expect(page.items).toHaveLength(1);
    expect(page.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
  });
});
