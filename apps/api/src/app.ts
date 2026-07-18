import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import { loadConfig, type AppConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPrismaClient } from './config/prisma.js';
import { AppError, toAppError } from './errors/app-error.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createAuthMiddleware, createCsrfMiddleware } from './modules/auth/auth.middleware.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { MessageService } from './modules/messages/message.service.js';
import { registerMessageRoutes } from './modules/messages/message.routes.js';
import { BaileysWhatsAppProvider } from './modules/whatsapp/baileys-whatsapp-provider.js';
import { ProviderEventBus } from './modules/whatsapp/provider-event-bus.js';
import { registerWhatsAppRoutes } from './modules/whatsapp/whatsapp.routes.js';
import type { WhatsAppProvider } from './modules/whatsapp/whatsapp.types.js';
import { AuditService } from './services/audit.service.js';
import { RateLimitService } from './services/rate-limit.service.js';
import { RetentionService } from './services/retention.service.js';
import { EncryptionService } from './utils/encryption.js';
import { createSocketServer } from './websocket/socket-server.js';

export interface BuildAppOptions {
  config?: AppConfig;
  prisma?: PrismaClient;
  logger?: Logger;
  provider?: WhatsAppProvider;
  eventBus?: ProviderEventBus;
  skipProviderInitialization?: boolean;
  disableRetentionTask?: boolean;
  disableWebsocket?: boolean;
}

function isMutation(request: FastifyRequest): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.url.startsWith('/api/');
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.LOG_LEVEL);
  const prisma = options.prisma ?? createPrismaClient();
  const eventBus = options.eventBus ?? new ProviderEventBus();
  const audit = new AuditService(prisma);
  const encryption = new EncryptionService(config.sessionEncryptionKey);
  const provider = options.provider ?? new BaileysWhatsAppProvider(prisma, encryption, eventBus, audit, logger);
  const auth = new AuthService(prisma, config.SESSION_SECRET);
  const rateLimits = new RateLimitService();
  const messages = new MessageService(prisma, provider, encryption, audit, rateLimits, config, eventBus);
  const retention = new RetentionService(prisma, config.MESSAGE_RETENTION_DAYS, config.IDEMPOTENCY_RETENTION_HOURS, logger);
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
    trustProxy: false,
  });

  app.decorateRequest('admin', null);
  app.decorateRequest('adminSession', null);
  await app.register(cookie);
  await app.register(cors, { origin: config.APP_URL, credentials: true, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  });

  app.addHook('onRequest', async (request, reply) => {
    request.admin = null;
    request.adminSession = null;
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store, max-age=0');
      reply.header('Pragma', 'no-cache');
    }
    if (isMutation(request) && !request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      throw new AppError('VALIDATION_ERROR', 'Mutation endpoints accept application/json only.', 400);
    }
  });

  app.addHook('preSerialization', async (request, _reply, payload) => {
    if (!request.url.startsWith('/api/')) return payload;
    if (payload && typeof payload === 'object' && 'success' in payload && 'requestId' in payload) return payload;
    return { success: true, data: payload, requestId: request.id };
  });

  app.setErrorHandler(async (error, request, reply) => {
    let appError: AppError;
    if (error instanceof ZodError) {
      appError = new AppError('VALIDATION_ERROR', error.issues.map((issue) => issue.message).join(' '), 400);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      appError = new AppError('DUPLICATE_REQUEST', 'A resource with these details already exists.', 409);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      appError = new AppError('INSTANCE_NOT_FOUND', 'The requested resource was not found.', 404);
    } else {
      appError = toAppError(error);
    }
    if (appError.retryAfterSeconds) reply.header('Retry-After', appError.retryAfterSeconds);
    if (appError.statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id, errorCode: appError.code }, 'Request failed');
    } else {
      request.log.warn({ requestId: request.id, errorCode: appError.code }, 'Request rejected');
    }
    return reply.code(appError.statusCode).send({
      success: false,
      error: { code: appError.code, message: appError.message },
      requestId: request.id,
    });
  });

  app.get('/health/live', async () => ({ status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const instances = await prisma.whatsAppInstance.findMany({ select: { id: true, status: true } });
      return {
        status: 'ready',
        database: 'connected',
        configuration: 'valid',
        whatsapp: Object.fromEntries(instances.map((instance) => [instance.id, provider.getStatus(instance.id)])),
      };
    } catch (error) {
      logger.error({ err: error, errorCode: 'READINESS_DATABASE_FAILED' }, 'Readiness check failed');
      reply.code(503);
      return { status: 'not_ready', database: 'unavailable', configuration: 'valid', whatsapp: {} };
    }
  });

  const requireAuth = createAuthMiddleware(auth);
  const requireCsrf = createCsrfMiddleware(auth);
  await registerAuthRoutes(app, { authService: auth, auditService: audit, rateLimits, config });
  await registerWhatsAppRoutes(app, { prisma, provider, audit, requireAuth, requireCsrf });
  await registerMessageRoutes(app, { prisma, messages, requireAuth, requireCsrf });

  if (!options.skipProviderInitialization) await provider.initialize();
  if (!options.disableRetentionTask) retention.start();
  const sockets = options.disableWebsocket
    ? undefined
    : createSocketServer(app.server, { config, prisma, auth, provider, eventBus, logger });

  app.addHook('onClose', async () => {
    retention.stop();
    messages.destroy();
    if (sockets) await sockets.close();
    await provider.destroy();
    await prisma.$disconnect();
  });
  return app;
}
