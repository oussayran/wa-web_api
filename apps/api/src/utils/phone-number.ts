import { AppError } from '../errors/app-error.js';

export interface NormalizedPhoneNumber {
  input: string;
  normalizedNumber: string;
  jid: string;
}

export function normalizePhoneNumber(input: string): NormalizedPhoneNumber {
  const value = input.trim();
  if (!value.startsWith('+')) {
    throw new AppError('INVALID_PHONE_NUMBER', 'Use an international number beginning with + and a country code.', 400);
  }
  if (/[A-Za-z]/.test(value) || !/^\+[0-9\s().-]+$/.test(value)) {
    throw new AppError('INVALID_PHONE_NUMBER', 'The phone number contains unsupported characters.', 400);
  }

  const normalizedNumber = value.slice(1).replace(/[\s().-]/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(normalizedNumber)) {
    throw new AppError('INVALID_PHONE_NUMBER', 'The phone number must contain a country code and 8 to 15 digits.', 400);
  }
  return {
    input,
    normalizedNumber,
    jid: `${normalizedNumber}@s.whatsapp.net`,
  };
}

export function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length <= 5) return '***';
  return `${phoneNumber.slice(0, 3)}${'*'.repeat(Math.max(3, phoneNumber.length - 5))}${phoneNumber.slice(-2)}`;
}
