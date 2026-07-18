import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  SESSION_SECRET: z.string().min(32),
  SESSION_ENCRYPTION_KEY: z.string().optional(),
  STORE_FULL_MESSAGE_TEXT: booleanString,
  MESSAGE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  IDEMPOTENCY_RETENTION_HOURS: z.coerce.number().int().min(1).max(8760).default(24),
  NUMBER_CHECK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  MESSAGE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),
  AUTH_FAILURE_RATE_LIMIT_PER_15_MINUTES: z.coerce.number().int().min(1).default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface AppConfig extends Omit<z.infer<typeof schema>, 'SESSION_ENCRYPTION_KEY'> {
  sessionEncryptionKey: Buffer;
}

function decodeEncryptionKey(value: string | undefined, nodeEnv: string): Buffer {
  if (!value && nodeEnv === 'test') {
    return Buffer.alloc(32, 7);
  }
  if (!value) {
    throw new Error('SESSION_ENCRYPTION_KEY is required and must encode exactly 32 bytes.');
  }

  const key = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY must be a 64-character hex value or base64 encoding of exactly 32 bytes.');
  }
  return key;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }
  const { SESSION_ENCRYPTION_KEY, ...config } = parsed.data;
  return {
    ...config,
    sessionEncryptionKey: decodeEncryptionKey(SESSION_ENCRYPTION_KEY, config.NODE_ENV),
  };
}
