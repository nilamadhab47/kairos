import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __kairoPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__kairoPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__kairoPrisma = prisma;
}

export * from '@prisma/client';
