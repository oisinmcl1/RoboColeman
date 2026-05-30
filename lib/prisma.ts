// Server-only guard: importing this module from a Client Component is a build
// error. The Prisma Client must never reach the browser.
import 'server-only';

import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Plain PostgreSQL connection over TCP via node-postgres, fed by DATABASE_URL.
// (Deliberately NOT the Neon serverless/WebSocket adapter.)
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

// In dev, Next.js hot-reload re-evaluates this module on every change. Stashing
// the instance on globalThis lets it survive reloads so we don't open a new
// connection pool each time. globalThis is not reset between reloads; module
// scope is.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Only cache in development. In production the module is evaluated once, so a
// plain module-scoped instance is correct and we avoid leaking onto globals.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}