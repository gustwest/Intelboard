const { config } = require("dotenv");
config({ path: ".env.local" }); // Load env vars from .env.local

import { db } from "../lib/db";
import { users } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Checking for admin user...");
    const adminEmail = "admin@intelboard.com";

    try {
        const [user] = await db.select().from(users).where(eq(users.email, adminEmail));

        if (user) {
            console.log("Admin user found:", user);
        } else {
            console.log("Admin user NOT found in DB.");
        }
    } catch (error) {
        console.error("Database error:", error);
    }
    process.exit(0);
}

main();
