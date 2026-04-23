import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis;

function createClient() {
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
// Next.js static analysis can proceed without a live DATABASE_URL.
// Cache on globalThis in ALL environments to avoid new pools per request.
let _client = globalForPrisma.prisma;

const prisma = new Proxy({}, {
  get(_target, prop) {
    if (!_client) {
      _client = createClient();
      globalForPrisma.prisma = _client;
    }
    return Reflect.get(_client, prop);
  },
});

export default prisma;
