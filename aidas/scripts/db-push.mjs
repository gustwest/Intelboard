/**
 * db-push.mjs — Runtime schema sync for Cloud Run containers.
 * Runs `prisma db push` against the live DATABASE_URL at container startup.
 */
import { execSync } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set — skipping schema push');
  process.exit(0);
}

try {
  console.log('🔄 Syncing database schema...');
  execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
    stdio: 'inherit',
    env: { ...process.env },
    timeout: 30000,
  });
  console.log('✅ Schema sync complete');
} catch (err) {
  console.error('⚠️  Schema sync failed (non-fatal):', err.message);
  // Non-fatal — the app can still start with an existing schema
}
