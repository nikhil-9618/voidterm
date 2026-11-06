import { PrismaClient } from '@prisma/client';

// A single PrismaClient is shared across hot reloads in development so we do
// not exhaust the database connection pool every time a module is re-evaluated.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
