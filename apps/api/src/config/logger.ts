import { pino, type Logger } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.message',
        '*.text',
        '*.qr',
        '*.qrImageDataUrl',
        '*.encryptedPayload',
        '*.sessionEncryptionKey',
        '*.SESSION_ENCRYPTION_KEY',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(request: { id?: string; method?: string; url?: string }) {
        return { id: request.id, method: request.method, url: request.url };
      },
    },
  });
}
