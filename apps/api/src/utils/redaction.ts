import { maskPhoneNumber } from './phone-number.js';

const sensitiveKey = /password|cookie|authorization|qr|credential|secret|encryption|message|text|payload/i;

export function redactSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redactSensitiveData(entry),
      ]),
    );
  }
  if (typeof value === 'string' && /^\+?\d{8,15}$/.test(value)) {
    return maskPhoneNumber(value.replace(/^\+/, ''));
  }
  return value;
}
