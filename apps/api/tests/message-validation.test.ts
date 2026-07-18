import { describe, expect, it } from 'vitest';
import { textMessageSchema } from '../src/utils/message-validation.js';

const valid = {
  phoneNumber: '+33612345678',
  message: '  Hello, this is a test.  ',
  recipientConsentConfirmed: true,
} as const;

describe('text message validation', () => {
  it('trims valid messages', () => {
    expect(textMessageSchema.parse(valid).message).toBe('Hello, this is a test.');
  });

  it.each(['', '   ', '<strong></strong>', `hello\u0000world`, 'x'.repeat(4001)])('rejects unsafe message content', (message) => {
    expect(textMessageSchema.safeParse({ ...valid, message }).success).toBe(false);
  });

  it('requires explicit recipient consent', () => {
    expect(textMessageSchema.safeParse({ ...valid, recipientConsentConfirmed: false }).success).toBe(false);
    expect(textMessageSchema.safeParse({ phoneNumber: valid.phoneNumber, message: valid.message }).success).toBe(false);
  });
});
