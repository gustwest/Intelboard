import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Fix for Cloud SQL socket connection strings which might be 'postgres://user:pass@/db?host=...'
// The missing host between '@' and '/' can cause Invalid URL errors in some environments,
// but for postgres-js we should preserve it if it's a Unix socket.
let connectionString = process.env.DATABASE_URL;

if (connectionString) {
    if (connectionString.includes('?host=/cloudsql/')) {
        console.log("Cloud SQL Unix socket detected in DATABASE_URL.");
    } else if (connectionString.includes('@/') && !connectionString.includes('localhost')) {
        console.log("Patching empty host in connection string for local development...");
        connectionString = connectionString.replace('@/', '@localhost/');
    }
}

if (!connectionString) {
    if (process.env.NODE_ENV === 'production') {
        console.warn('DATABASE_URL is not set. This might be expected during build time if not provided.');
    }
}

// For queries - use a fallback if missing to avoid crashes on import
console.log("Connecting to database with:", connectionString?.split('@')[1] || "no connection string");
const queryClient = postgres(connectionString || "postgres://localhost/placeholder", {
    onnotice: (notice) => console.log('DB Notice:', notice),
    onparameter: (name, value) => console.log('DB Param:', name, value),
    connect_timeout: 10,
});
export const db = drizzle(queryClient, { schema });

// For migrations and one-off scripts, it's often better to have a separate pool or closing logic
// but for a Next.js app, this export is usually what's needed.
