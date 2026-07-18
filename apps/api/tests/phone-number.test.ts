import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { maskPhoneNumber, normalizePhoneNumber } from '../src/utils/phone-number.js';

describe('phone-number normalization', () => {
  it('normalizes an international number and constructs its individual JID', () => {
    expect(normalizePhoneNumber('+33 6 12-34 (56) 78')).toEqual({
      input: '+33 6 12-34 (56) 78',
      normalizedNumber: '33612345678',
      jid: '33612345678@s.whatsapp.net',
    });
  });

  it.each([
    '06 12 34 56 78',
    '+33CALLME',
    '+012345678',
    '+123',
    '+1234567890123456',
    '+33/612345678',
  ])('rejects invalid or local input: %s', (input) => {
    expect(() => normalizePhoneNumber(input)).toThrow(AppError);
  });

  it('masks phone numbers for logs', () => {
    expect(maskPhoneNumber('33612345678')).toBe('336******78');
  });
});
