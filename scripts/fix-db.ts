import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { mockUsers } from "../lib/data";
import { users } from "../lib/schema";

async function main() {
    console.log("Checking and updating database schema...");
    try {
        // 1. Ensure projects table exists
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS projects (
                id text PRIMARY KEY,
                name text NOT NULL,
                description text,
                system_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
                owner_id text NOT NULL,
                shared_with jsonb DEFAULT '[]'::jsonb NOT NULL,
                notes text,
                flow_data jsonb DEFAULT '{}'::jsonb NOT NULL,
                created_at timestamp DEFAULT NOW() NOT NULL
            )
        `);
        console.log("Table 'projects' verified/created.");

        // 2. Add new columns to requests table if they don't exist
        const columns = [
            { name: "linked_project_id", type: "text" },
            { name: "acceptance_criteria", type: "jsonb DEFAULT '[]'::jsonb NOT NULL" },
            { name: "ac_status", type: "text" },
            { name: "urgency", type: "text" },
            { name: "category", type: "text" },
            { name: "attributes", type: "jsonb DEFAULT '{}'::jsonb NOT NULL" },
            { name: "attachments", type: "jsonb DEFAULT '[]'::jsonb NOT NULL" },
            { name: "comments", type: "jsonb DEFAULT '[]'::jsonb NOT NULL" },
            { name: "action_needed", type: "boolean DEFAULT false NOT NULL" },
            { name: "specialist_nda_signed", type: "boolean DEFAULT false NOT NULL" }
        ];

        for (const col of columns) {
            await db.execute(sql.raw(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`));
            console.log(`Column '${col.name}' verified/added to requests.`);
        }

        // 3. Ensure projects table columns exist
        const projectColumns = [
            { name: "system_ids", type: "jsonb DEFAULT '[]'::jsonb NOT NULL" },
            { name: "notes", type: "text" },
            { name: "flow_data", type: "jsonb DEFAULT '{}'::jsonb NOT NULL" }
        ];

        for (const col of projectColumns) {
            await db.execute(sql.raw(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`));
            console.log(`Column '${col.name}' verified/added to projects.`);
        }

        // 4. Seed Mock Users
        console.log("Seeding mock users...");
        for (const user of mockUsers) {
            await db.insert(users).values({
                id: user.id || user.email,
                name: user.name,
                email: user.email,
                role: user.role,
                company: (user as any).company || null,
                avatar: (user as any).avatar || null,
            }).onConflictDoUpdate({
                target: users.id,
                set: {
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    company: (user as any).company || null,
                    avatar: (user as any).avatar || null,
                }
            });
        }
        console.log("Mock users seeded/updated.");

        console.log("Database schema fix and seeding complete.");
    } catch (error) {
        console.error("Schema fix failed:", error);
    }
    process.exit(0);
}

main();
