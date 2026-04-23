import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const adapter = new PrismaPg({
    connectionString,
    max: process.env.NODE_ENV === 'production' ? 10 : 5,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

// Lazy-initialize: don't create the client at import time so that
// Next.js static analysis / page-data collection can proceed without
// a live DATABASE_URL (the real connection is established at request time).
let _client: PrismaClient | undefined = globalForPrisma.prisma;

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (!_client) {
      _client = createClient();
      globalForPrisma.prisma = _client;
    }
    return Reflect.get(_client, prop);
  },
});
