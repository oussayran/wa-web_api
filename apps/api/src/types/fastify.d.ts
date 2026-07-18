import type { AdminRole } from '@prisma/client';
import '@fastify/cookie';

declare module 'fastify' {
  interface FastifyRequest {
    admin: {
      id: string;
      email: string;
      role: AdminRole;
    } | null;
    adminSession: {
      id: string;
      csrfHash: string;
    } | null;
  }
}

export {};
