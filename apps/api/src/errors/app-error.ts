export const ERROR_CODES = [
  'AUTHENTICATION_REQUIRED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'INSTANCE_NOT_FOUND',
  'WHATSAPP_NOT_CONNECTED',
  'WHATSAPP_QR_EXPIRED',
  'WHATSAPP_LOGGED_OUT',
  'WHATSAPP_CONNECTION_FAILED',
  'INVALID_PHONE_NUMBER',
  'NUMBER_NOT_ON_WHATSAPP',
  'NUMBER_CHECK_FAILED',
  'MESSAGE_SEND_FAILED',
  'MESSAGE_SEND_TIMEOUT',
  'DUPLICATE_REQUEST',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}
