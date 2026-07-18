import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { AuditService } from '../../services/audit.service.js';
import type { RateLimitService } from '../../services/rate-limit.service.js';
import type { AuthService } from './auth.service.js';
import { CSRF_COOKIE, SESSION_COOKIE, createAuthMiddleware, createCsrfMiddleware } from './auth.middleware.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface AuthRouteDependencies {
  authService: AuthService;
  auditService: AuditService;
  rateLimits: RateLimitService;
  config: AppConfig;
}

function requestContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
  };
}

function setSessionCookies(reply: FastifyReply, session: { token: string; csrfToken: string; expiresAt: Date }, secure: boolean) {
  const options = {
    path: '/',
    sameSite: 'lax' as const,
    secure,
    expires: session.expiresAt,
  };
  reply.setCookie(SESSION_COOKIE, session.token, { ...options, httpOnly: true });
  reply.setCookie(CSRF_COOKIE, session.csrfToken, { ...options, httpOnly: false });
}

export async function registerAuthRoutes(app: FastifyInstance, dependencies: AuthRouteDependencies): Promise<void> {
  const { authService, auditService, rateLimits, config } = dependencies;
  const requireAuth = createAuthMiddleware(authService);
  const requireCsrf = createCsrfMiddleware(authService);

  app.post('/api/v1/auth/login', async (request, reply) => {
    const key = `auth:${request.ip}`;
    rateLimits.assertAllowed(key, config.AUTH_FAILURE_RATE_LIMIT_PER_15_MINUTES);
    const input = loginSchema.parse(request.body);
    const session = await authService.login(input.email, input.password);
    if (!session) {
      try {
        rateLimits.consume(key, config.AUTH_FAILURE_RATE_LIMIT_PER_15_MINUTES, 15 * 60 * 1000);
      } finally {
        await auditService.record({ action: 'LOGIN_FAILED', ...requestContext(request) });
      }
      throw new AppError('AUTHENTICATION_REQUIRED', 'Invalid email or password.', 401);
    }
    rateLimits.clear(key);
    setSessionCookies(reply, session, config.NODE_ENV === 'production');
    await auditService.record({ adminUserId: session.admin.id, action: 'LOGIN_SUCCESS', ...requestContext(request) });
    return { admin: session.admin, csrfToken: session.csrfToken };
  });

  app.get('/api/v1/auth/me', { preHandler: [requireAuth] }, async (request) => ({ admin: request.admin }));

  app.post('/api/v1/auth/logout', { preHandler: [requireAuth, requireCsrf] }, async (request, reply) => {
    await authService.logout(request.adminSession!.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return { loggedOut: true };
  });
}
