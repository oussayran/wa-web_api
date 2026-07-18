import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { AuditService } from '../../services/audit.service.js';
import { AppError } from '../../errors/app-error.js';
import type { WhatsAppProvider } from './whatsapp.types.js';

const instanceIdSchema = z.string().min(1).max(50).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, numbers, hyphens, or underscores.');
const createInstanceSchema = z.object({
  instanceId: instanceIdSchema,
  name: z.string().trim().min(1).max(100),
});

interface WhatsAppRouteDependencies {
  prisma: PrismaClient;
  provider: WhatsAppProvider;
  audit: AuditService;
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

function context(request: FastifyRequest) {
  return {
    adminUserId: request.admin!.id,
    ipAddress: request.ip,
    ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
  };
}

function paramsInstanceId(request: FastifyRequest): string {
  return instanceIdSchema.parse((request.params as { instanceId?: string }).instanceId);
}

export async function registerWhatsAppRoutes(app: FastifyInstance, dependencies: WhatsAppRouteDependencies): Promise<void> {
  const { prisma, provider, audit, requireAuth, requireCsrf } = dependencies;

  app.get('/api/v1/whatsapp/instances', { preHandler: [requireAuth] }, async () => {
    return prisma.whatsAppInstance.findMany({ orderBy: { createdAt: 'asc' } });
  });

  app.post('/api/v1/whatsapp/instances', { preHandler: [requireAuth, requireCsrf] }, async (request, reply) => {
    const input = createInstanceSchema.parse(request.body);
    const instance = await prisma.whatsAppInstance.create({
      data: { id: input.instanceId, name: input.name },
    });
    await audit.record({
      ...context(request),
      action: 'WHATSAPP_INSTANCE_CREATED',
      entityType: 'WhatsAppInstance',
      entityId: instance.id,
    });
    reply.code(201);
    return instance;
  });

  app.get('/api/v1/whatsapp/instances/:instanceId', { preHandler: [requireAuth] }, async (request) => {
    const instanceId = paramsInstanceId(request);
    const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
    if (!instance) throw new AppError('INSTANCE_NOT_FOUND', 'WhatsApp instance not found.', 404);
    return instance;
  });

  app.post('/api/v1/whatsapp/instances/:instanceId/connect', { preHandler: [requireAuth, requireCsrf] }, async (request) => {
    const instanceId = paramsInstanceId(request);
    await provider.createConnection(instanceId);
    await audit.record({ ...context(request), action: 'QR_REQUESTED', entityType: 'WhatsAppInstance', entityId: instanceId });
    return { instanceId, status: provider.getStatus(instanceId) };
  });

  app.post('/api/v1/whatsapp/instances/:instanceId/disconnect', { preHandler: [requireAuth, requireCsrf] }, async (request) => {
    const instanceId = paramsInstanceId(request);
    await provider.disconnect(instanceId);
    return { instanceId, status: provider.getStatus(instanceId) };
  });

  app.post('/api/v1/whatsapp/instances/:instanceId/logout', { preHandler: [requireAuth, requireCsrf] }, async (request) => {
    const instanceId = paramsInstanceId(request);
    await provider.logout(instanceId);
    return { instanceId, status: provider.getStatus(instanceId) };
  });

  app.delete('/api/v1/whatsapp/instances/:instanceId', { preHandler: [requireAuth, requireCsrf] }, async (request) => {
    const instanceId = paramsInstanceId(request);
    await provider.deleteInstance(instanceId);
    await audit.record({
      ...context(request),
      action: 'WHATSAPP_INSTANCE_DELETED',
      entityType: 'WhatsAppInstance',
      entityId: instanceId,
    });
    return { deleted: true, instanceId };
  });
}
