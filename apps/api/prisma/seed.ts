import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const environment = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
}).parse(process.env);

const prisma = new PrismaClient();

try {
  const email = environment.ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await prisma.adminUser.update({ where: { id: existing.id }, data: { isActive: true } });
  } else {
    const passwordHash = await argon2.hash(environment.ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await prisma.adminUser.create({ data: { email, passwordHash, role: 'ADMIN' } });
  }
} finally {
  await prisma.$disconnect();
}
