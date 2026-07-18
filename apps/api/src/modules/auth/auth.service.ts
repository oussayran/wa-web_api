import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { AdminRole, PrismaClient } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$sdIJPj6QHMftgbs1WQFRRQ$zY2rZkPZOsA643YhkyOgdhx0q9p+rq2DBJgp5PyCudQ';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  admin: AuthenticatedAdmin;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secret: string,
  ) {}

  private hash(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  async login(email: string, password: string): Promise<CreatedSession | null> {
    const user = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    const passwordMatches = await argon2.verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
    if (!user || !user.isActive || !passwordMatches) return null;

    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.prisma.adminSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(token),
        csrfHash: this.hash(csrfToken),
        expiresAt,
      },
    });
    return {
      token,
      csrfToken,
      expiresAt,
      admin: { id: user.id, email: user.email, role: user.role },
    };
  }

  async authenticate(token: string | undefined): Promise<{
    admin: AuthenticatedAdmin;
    session: { id: string; csrfHash: string };
  } | null> {
    if (!token) return null;
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
      if (session) await this.prisma.adminSession.delete({ where: { id: session.id } });
      return null;
    }
    return {
      admin: { id: session.user.id, email: session.user.email, role: session.user.role },
      session: { id: session.id, csrfHash: session.csrfHash },
    };
  }

  verifyCsrf(csrfToken: string | undefined, expectedHash: string): void {
    if (!csrfToken) throw new AppError('FORBIDDEN', 'CSRF validation failed.', 403);
    const actual = Buffer.from(this.hash(csrfToken));
    const expected = Buffer.from(expectedHash);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AppError('FORBIDDEN', 'CSRF validation failed.', 403);
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { id: sessionId } });
  }
}
