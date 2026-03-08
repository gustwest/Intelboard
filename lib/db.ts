import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { log } from './logger';

// Fix for Cloud SQL socket connection strings which might be 'postgres://user:pass@/db?host=...'
// The missing host causes Invalid URL errors, so we patch it to 'postgres://user:pass@localhost/db?host=...'
let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('@/') && connectionString.includes('?host=')) {
    connectionString = connectionString.replace('@/', '@localhost/');
    log.info('Patched Cloud SQL connection string for Unix socket compatibility');
}

if (!connectionString) {
    if (process.env.NODE_ENV === 'production') {
        log.warn('DATABASE_URL is not set — may be expected during build');
    }
}

// For queries - use a fallback if missing to avoid crashes on import
log.info("Database connection initialized", { host: connectionString?.split('@')[1]?.split('?')[0] || "no connection string" });

const dbOptions: any = {};
if (process.env.DB_SOCKET_PATH) {
    dbOptions.host = process.env.DB_SOCKET_PATH;
}

const queryClient = postgres(connectionString || "postgres://localhost/placeholder", {
    ...dbOptions,
});
export const db = drizzle(queryClient, { schema });

// For migrations and one-off scripts, it's often better to have a separate pool or closing logic
// but for a Next.js app, this export is usually what's needed.
