
import { db } from "../lib/db";
import { companies, users } from "../lib/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Seeding Autoliv data...");

    // 1. Ensure Company Exists
    const domain = "autoliv.com";
    const companyName = "Autoliv";
    const logoPath = "/autoliv-logo.png";

    let companyId: string;

    const existingCompany = await db.query.companies.findFirst({
        where: eq(companies.domain, domain),
    });

    if (existingCompany) {
        console.log(`Company ${companyName} already exists (ID: ${existingCompany.id}). Updating logo...`);
        await db.update(companies)
            .set({ logo: logoPath, name: companyName })
            .where(eq(companies.id, existingCompany.id));
        companyId = existingCompany.id;
    } else {
        console.log(`Creating company ${companyName}...`);
        const [newCompany] = await db.insert(companies).values({
            name: companyName,
            domain: domain,
            logo: logoPath
        }).returning();
        companyId = newCompany.id;
    }

    // 2. Main Account Holder (Admin)
    const adminEmail = "gustav.westergren.external@autoliv.com";
    const adminName = "Gustav Westergren";

    // Simple password hashing for demo (password123)
    // In real app use bcrypt.hash("password123", 10)
    // For manual seed we can mock it or use same approach if bcrypt available
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash("password123", 10);

    const existingAdmin = await db.query.users.findFirst({
        where: eq(users.email, adminEmail),
    });

    if (existingAdmin) {
        console.log(`Admin user ${adminName} already exists. Updating company link...`);
        await db.update(users).set({
            companyId: companyId,
            role: "Admin",
            approvalStatus: "APPROVED",
            password: hashedPassword
        }).where(eq(users.id, existingAdmin.id));
    } else {
        console.log(`Creating admin user ${adminName}...`);
        await db.insert(users).values({
            name: adminName,
            email: adminEmail,
            role: "Admin",
            companyId: companyId,
            approvalStatus: "APPROVED",
            password: hashedPassword,
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Gustav"
        });
    }

    // 3. Dummy Employees
    const employees = [
        { name: "Anna Andersson", email: "anna.andersson@autoliv.com" },
        { name: "Bjorn Borg", email: "bjorn.borg@autoliv.com" },
        { name: "Cecilia Carlsson", email: "cecilia.carlsson@autoliv.com" }
    ];

    for (const emp of employees) {
        const existingEmp = await db.query.users.findFirst({
            where: eq(users.email, emp.email),
        });

        if (!existingEmp) {
            console.log(`Creating employee ${emp.name}...`);
            await db.insert(users).values({
                name: emp.name,
                email: emp.email,
                role: "User", // Standard user role
                companyId: companyId,
                approvalStatus: "APPROVED", // Pre-approved
                password: hashedPassword,
                image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`
            });
        } else {
            console.log(`Employee ${emp.name} already exists. Updating company...`);
            await db.update(users).set({
                companyId: companyId,
                approvalStatus: "APPROVED"
            }).where(eq(users.id, existingEmp.id));
        }
    }

    console.log("Seeding complete!");
    process.exit(0);
}

main().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
});
