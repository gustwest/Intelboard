import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Fix for Cloud SQL socket connection strings which might be 'postgres://user:pass@/db?host=...'
// The empty host between '@' and '/' causes 'Invalid URL' errors in Node.js.
// We must provide a placeholder host like 'localhost' even if using a Unix socket.
let connectionString = process.env.DATABASE_URL;

if (connectionString && connectionString.includes('@/')) {
    console.log("[db] Patching empty host in connection string...");
    connectionString = connectionString.replace('@/', '@localhost/');
}

if (connectionString) {
    const masked = connectionString.replace(/:([^@]+)@/, ':****@');
    console.log("[db] Connecting with patched URL:", masked);
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
