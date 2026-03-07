import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
    databaseDir: './tmp-pg-data',
    user: 'intelboard_user',
    password: 'YVGsrjf6Npfhvv+y',
    port: 5432,
    persistent: true,
});

async function main() {
    console.log("🔧 Starting embedded PostgreSQL...");
    await pg.initialise();
    await pg.start();
    console.log("✅ PostgreSQL is running on port 5432");

    // Create the database if it doesn't exist
    try {
        await pg.createDatabase('intelboard_db');
        console.log("✅ Database 'intelboard_db' created");
    } catch (e: any) {
        if (e.message?.includes('already exists')) {
            console.log("ℹ️  Database 'intelboard_db' already exists");
        } else {
            console.log("ℹ️  Database creation note:", e.message);
        }
    }

    console.log("\n🎉 PostgreSQL is ready! Keep this terminal running.");
    console.log("   Connection: postgres://intelboard_user:YVGsrjf6Npfhvv+y@localhost:5432/intelboard_db");
    console.log("   Press Ctrl+C to stop.\n");

    // Keep running until interrupted
    process.on('SIGINT', async () => {
        console.log("\n🛑 Shutting down PostgreSQL...");
        await pg.stop();
        process.exit(0);
    });
}

main().catch(async (err) => {
    console.error("❌ Failed to start PostgreSQL:", err);
    try { await pg.stop(); } catch { }
    process.exit(1);
});
