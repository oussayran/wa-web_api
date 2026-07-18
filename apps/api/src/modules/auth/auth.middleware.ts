import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from './auth.service.js';
import { AppError } from '../../errors/app-error.js';

export const SESSION_COOKIE = 'wa_admin_session';
export const CSRF_COOKIE = 'wa_csrf';

export function createAuthMiddleware(authService: AuthService) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authenticated = await authService.authenticate(request.cookies[SESSION_COOKIE]);
    if (!authenticated) {
      throw new AppError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401);
    }
    request.admin = authenticated.admin;
    request.adminSession = authenticated.session;
  };
}

export function createCsrfMiddleware(authService: AuthService) {
  return async function requireCsrf(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.adminSession) {
      throw new AppError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401);
    }
    const header = request.headers['x-csrf-token'];
    authService.verifyCsrf(Array.isArray(header) ? header[0] : header, request.adminSession.csrfHash);
  };
}
