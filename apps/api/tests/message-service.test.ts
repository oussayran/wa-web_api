import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/services/audit.service.js';
import { RateLimitService } from '../src/services/rate-limit.service.js';
import { EncryptionService } from '../src/utils/encryption.js';
import { MessageService } from '../src/modules/messages/message.service.js';
import { ProviderEventBus } from '../src/modules/whatsapp/provider-event-bus.js';
import { FakeDatabase, MockWhatsAppProvider, testConfig } from './helpers/fakes.js';

describe('message idempotency', () => {
  let database: FakeDatabase;
  let provider: MockWhatsAppProvider;

  beforeEach(async () => {
    database = new FakeDatabase();
    await database.seedAdmin();
    await database.client.whatsAppInstance.create({ data: { id: 'default', name: 'Default' } });
    provider = new MockWhatsAppProvider();
    provider.statuses.set('default', 'CONNECTED');
  });

  it('returns the stored result without sending twice', async () => {
    const config = testConfig();
    const service = new MessageService(
      database.client,
      provider,
      new EncryptionService(config.sessionEncryptionKey),
      new AuditService(database.client),
      new RateLimitService(),
      config,
      new ProviderEventBus(),
    );
    const adminUserId = database.users[0]!.id;
    const input = { phoneNumber: '+33612345678', message: 'Consent-based hello', recipientConsentConfirmed: true as const };
    const first = await service.send(input, { adminUserId, instanceId: 'default', idempotencyKey: 'stable-key' });
    provider.statuses.set('default', 'DISCONNECTED');
    const duplicate = await service.send(input, { adminUserId, instanceId: 'default', idempotencyKey: 'stable-key' });

    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ duplicate: true, messageId: first.messageId, recordId: first.recordId });
    expect(provider.sendCount).toBe(1);
    service.destroy();
  });
});
