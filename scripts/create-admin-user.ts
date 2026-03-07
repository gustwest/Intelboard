const { config } = require("dotenv");
config({ path: ".env.local" });

const bcrypt = require("bcryptjs");
const { eq } = require("drizzle-orm");

async function main() {
    console.log("Starting admin user creation...");

    // Dynamic import to ensure env vars are loaded first
    const { db } = await import("../lib/db");
    const { users } = await import("../lib/schema");

    const adminEmail = "admin@intelboard.com";
    const password = "password";
    const hashedPassword = await bcrypt.hash(password, 10);

    const [existing] = await db.select().from(users).where(eq(users.email, adminEmail));

    if (existing) {
        console.log("Admin user already exists. Updating password...");
        await db.update(users)
            .set({
                password: hashedPassword,
                role: "Admin",
                approvalStatus: "APPROVED"
            })
            .where(eq(users.email, adminEmail));
        console.log("Admin user updated.");
    } else {
        console.log("Creating new admin user...");
        await db.insert(users).values({
            id: "admin1",
            name: "IntelBoard Admin",
            email: adminEmail,
            role: "Admin",
            password: hashedPassword,
            approvalStatus: "APPROVED",
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=IntelBoardAdmin"
        });
        console.log("Admin user created.");
    }

    process.exit(0);
}

main().catch(err => {
    console.error("Script failed:", err);
    process.exit(1);
});
