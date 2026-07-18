import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/env.js';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../modules/auth/auth.service.js';
import { SESSION_COOKIE } from '../modules/auth/auth.middleware.js';
import type { ProviderEventBus } from '../modules/whatsapp/provider-event-bus.js';
import type { WhatsAppProvider } from '../modules/whatsapp/whatsapp.types.js';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export function createSocketServer(
  server: HttpServer,
  dependencies: {
    config: AppConfig;
    prisma: PrismaClient;
    auth: AuthService;
    provider: WhatsAppProvider;
    eventBus: ProviderEventBus;
    logger: Logger;
  },
): { io: SocketServer; close: () => Promise<void> } {
  const { config, prisma, auth, provider, eventBus, logger } = dependencies;
  const io = new SocketServer(server, {
    cors: { origin: config.APP_URL, credentials: true },
    maxHttpBufferSize: 250_000,
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const authenticated = await auth.authenticate(cookies[SESSION_COOKIE]);
      if (!authenticated) return next(new Error('Authentication required'));
      socket.data.adminId = authenticated.admin.id;
      return next();
    } catch {
      return next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`admin:${String(socket.data.adminId)}`);
    socket.on('whatsapp.subscribe', async (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const instanceId = (payload as { instanceId?: unknown }).instanceId;
      if (typeof instanceId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(instanceId)) return;
      const exists = await prisma.whatsAppInstance.count({ where: { id: instanceId } });
      if (!exists) return;
      socket.join(`instance:${instanceId}`);
      socket.emit('whatsapp.status', {
        event: 'whatsapp.status',
        instanceId,
        status: provider.getStatus(instanceId),
        timestamp: new Date().toISOString(),
      });
      const qr = provider.getQrSnapshot(instanceId);
      if (qr) socket.emit('whatsapp.qr', { event: 'whatsapp.qr', instanceId, ...qr });
    });
  });

  const unsubscribe = eventBus.subscribe((event) => {
    // All users are administrators in this single-tenant MVP; instance rooms prevent unrelated subscriptions.
    io.to(`instance:${event.instanceId}`).emit(event.event, event);
  });

  return {
    io,
    close: async () => {
      unsubscribe();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      logger.debug({ component: 'socket.io' }, 'Socket server closed');
    },
  };
}
