
import { db } from "../lib/db";
import { companies } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Seeding company...");

    const domain = "autoliv.com";
    const name = "Autoliv Inc.";

    const existing = await db.query.companies.findFirst({
        where: eq(companies.domain, domain),
    });

    if (existing) {
        console.log(`Company ${name} already exists.`);
        return;
    }

    await db.insert(companies).values({
        name,
        domain,
    });

    console.log(`Company ${name} created successfully.`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
