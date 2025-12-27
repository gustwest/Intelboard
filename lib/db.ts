import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

function getOptions() {
    if (!connectionString) {
        return { url: "postgres://localhost/placeholder", options: {} };
    }

    // 1. Detect Cloud SQL Unix socket
    // Pattern: postgres://user:pass@/dbname?host=/cloudsql/INSTANCE_CONNECTION_NAME
    if (connectionString.includes('?host=/cloudsql/')) {
        console.log("[db] Cloud SQL Unix socket detected.");
        const [base, query] = connectionString.split('?');
        const params = new URLSearchParams(query);
        const socketPath = params.get('host');

        // Match user, password, and database from: postgres://user:pass@/dbname
        const match = base.match(/postgres:\/\/([^:]+):([^@]+)@\/(.+)/);
        if (match) {
            const [, user, password, database] = match;
            console.log(`[db] Using Unix socket: ${socketPath}`);
            return {
                url: "",
                options: {
                    host: socketPath as string,
                    user,
                    password,
                    database,
                    onnotice: (notice: any) => console.log('DB Notice:', notice),
                    onparameter: (name: any, value: any) => console.log('DB Param:', name, value),
                    connect_timeout: 10,
                }
            };
        }
    }

    // 2. Standard URL (possibly with @/ for local)
    let finalUrl = connectionString;
    if (finalUrl.includes('@/') && !finalUrl.includes('localhost')) {
        console.log("[db] Patching empty host for standard URL parser...");
        finalUrl = finalUrl.replace('@/', '@localhost/');
    }

    const masked = finalUrl.replace(/:([^@]+)@/, ':****@');
    console.log("[db] Connecting with URL:", masked);

    return {
        url: finalUrl,
        options: {
            onnotice: (notice: any) => console.log('DB Notice:', notice),
            onparameter: (name: any, value: any) => console.log('DB Param:', name, value),
            connect_timeout: 10,
        }
    };
}

const { url, options } = getOptions();
const queryClient = url ? postgres(url, options) : postgres(options);

export const db = drizzle(queryClient, { schema });

// For migrations and one-off scripts, it's often better to have a separate pool or closing logic
// but for a Next.js app, this export is usually what's needed.
