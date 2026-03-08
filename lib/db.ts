import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { log } from './logger';

let connectionString = process.env.DATABASE_URL;
const dbOptions: any = {};

// Cloud SQL socket connection strings look like:
//   postgres://user:pass@/db?host=/cloudsql/project:region:instance
// Two problems:
//   1. '@/' has no hostname → causes Invalid URL errors
//   2. '?host=' is a URL query param, NOT a postgres.js option
// Fix: extract the socket path, strip it from the URL, pass it to postgres.js explicitly
if (connectionString && connectionString.includes('?host=')) {
    const hostMatch = connectionString.match(/[?&]host=([^&]+)/);
    if (hostMatch) {
        dbOptions.host = hostMatch[1]; // e.g. /cloudsql/project:region:instance
        // Remove the ?host=... from the connection string
        connectionString = connectionString.replace(/[?&]host=[^&]+/, '');
        // Fix missing hostname: @/ → @localhost/
        if (connectionString.includes('@/')) {
            connectionString = connectionString.replace('@/', '@localhost/');
        }
        log.info('Cloud SQL socket connection configured', { socketPath: dbOptions.host });
    }
}

if (!connectionString) {
    if (process.env.NODE_ENV === 'production') {
        log.warn('DATABASE_URL is not set — may be expected during build');
    }
}

// Explicit socket path from env override (takes precedence)
if (process.env.DB_SOCKET_PATH) {
    dbOptions.host = process.env.DB_SOCKET_PATH;
}

log.info("Database connection initialized", {
    host: dbOptions.host || connectionString?.split('@')[1]?.split('/')[0] || "no connection string"
});

const queryClient = postgres(connectionString || "postgres://localhost/placeholder", {
    ...dbOptions,
});
export const db = drizzle(queryClient, { schema });

