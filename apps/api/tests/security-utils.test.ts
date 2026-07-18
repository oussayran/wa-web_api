import { describe, expect, it } from 'vitest';
import { AppError, toAppError } from '../src/errors/app-error.js';
import { EncryptionService } from '../src/utils/encryption.js';
import { redactSensitiveData } from '../src/utils/redaction.js';

describe('security utilities', () => {
  it('encrypts with random IVs and decrypts authenticated data', () => {
    const encryption = new EncryptionService(Buffer.alloc(32, 4));
    const first = encryption.encrypt(Buffer.from('sensitive state'));
    const second = encryption.encrypt(Buffer.from('sensitive state'));
    expect(first.iv).not.toEqual(second.iv);
    expect(first.encryptedPayload).not.toEqual(Buffer.from('sensitive state'));
    expect(encryption.decrypt(first).toString()).toBe('sensitive state');
  });

  it('rejects modified ciphertext', () => {
    const encryption = new EncryptionService(Buffer.alloc(32, 4));
    const encrypted = encryption.encrypt(Buffer.from('sensitive state'));
    encrypted.encryptedPayload[0] = encrypted.encryptedPayload[0]! ^ 1;
    expect(() => encryption.decrypt(encrypted)).toThrow();
  });

  it('redacts nested secrets, messages, QR data, and masks phone numbers', () => {
    expect(redactSensitiveData({
      password: 'unsafe',
      nested: { qrImageDataUrl: 'data:image/png', phone: '33612345678' },
      message: 'full message',
    })).toEqual({
      password: '[REDACTED]',
      nested: { qrImageDataUrl: '[REDACTED]', phone: '336******78' },
      message: '[REDACTED]',
    });
  });

  it('preserves typed errors and safely maps unknown errors', () => {
    const known = new AppError('WHATSAPP_NOT_CONNECTED', 'Not connected.', 503);
    expect(toAppError(known)).toBe(known);
    expect(toAppError(new Error('database password leaked'))).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      statusCode: 500,
    });
  });
});
