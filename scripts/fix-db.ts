import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
    console.log("Checking and updating database schema...");
    try {
        // Add comments column if it doesn't exist
        await db.execute(sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]'::jsonb NOT NULL`);
        console.log("Column 'comments' verified/added.");

        // Ensure other potential columns exist (from previous migrations)
        await db.execute(sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb NOT NULL`);
        console.log("Column 'attachments' verified/added.");

        console.log("Database schema fix complete.");
    } catch (error) {
        console.error("Schema fix failed:", error);
    }
    process.exit(0);
}

main();
