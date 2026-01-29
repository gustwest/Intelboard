
import { db } from "../lib/db";
import { users, companies } from "../lib/schema";
import { getCompanyByDomain, getCompanyUsers } from "../lib/actions";
import { eq } from "drizzle-orm";

async function main() {
    console.log("--- Debugging DB Content ---");

    // 1. Check Company
    const company = await getCompanyByDomain("autoliv.com");
    console.log("Company 'autoliv.com':", company);

    if (company) {
        // 2. Check Users
        const companyUsers = await getCompanyUsers(company.id);
        console.log(`Found ${companyUsers.length} users for company ${company.id}:`);
        companyUsers.forEach(u => console.log(`- ${u.name} (Status: ${u.approvalStatus})`));
    } else {
        console.log("CRITICAL: Company not found!");
        // List all companies
        const allCompanies = await db.select().from(companies);
        console.log("All Companies:", allCompanies);
    }

    console.log("--- End Debug ---");
    process.exit(0);
}

main().catch(console.error);
