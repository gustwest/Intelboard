import { db } from "../lib/db";
import { companies, users } from "../lib/schema";
import { eq } from "drizzle-orm";

const bcrypt = require("bcryptjs");

async function main() {
    console.log("🌱 Seeding demo accounts (2 corporate customers, 1 admin)...\n");

    const hashedPassword = await bcrypt.hash("password123", 10);
    const adminPassword = await bcrypt.hash("admin123", 10);

    // ─── 1. Autoliv ─────────────────────────────────────────────
    console.log("📌 Autoliv...");
    let autolivId: string;
    const existingAutoliv = await db.query.companies.findFirst({
        where: eq(companies.domain, "autoliv.com"),
    });
    if (existingAutoliv) {
        autolivId = existingAutoliv.id;
        console.log(`  Company exists (${autolivId})`);
        await db.update(companies).set({ name: "Autoliv", logo: "/autoliv-logo.png" }).where(eq(companies.id, autolivId));
    } else {
        const [c] = await db.insert(companies).values({
            name: "Autoliv",
            domain: "autoliv.com",
            logo: "/autoliv-logo.png",
        }).returning();
        autolivId = c.id;
        console.log(`  Created company (${autolivId})`);
    }

    // Autoliv user
    const autolivEmail = "gustav.westergren.external@autoliv.com";
    const existingAutolivUser = await db.query.users.findFirst({ where: eq(users.email, autolivEmail) });
    if (existingAutolivUser) {
        console.log(`  User Gustav already exists. Updating...`);
        await db.update(users).set({
            name: "Gustav Westergren",
            companyId: autolivId,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Account and project manager with focus on digital solutions and IT transformation at Autoliv. Driving innovation in automotive safety technology.",
            jobTitle: "Project Manager / Product Owner",
            skills: [
                { name: "Change Management", category: "Management" },
                { name: "Project Management", category: "Management" },
                { name: "Digital Transformation", category: "Strategy" },
            ],
            industry: ["Auto", "Manufacturing"],
            experience: "7+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Gustav",
        }).where(eq(users.id, existingAutolivUser.id));
    } else {
        await db.insert(users).values({
            id: "cu-autoliv-1",
            name: "Gustav Westergren",
            email: autolivEmail,
            companyId: autolivId,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Account and project manager with focus on digital solutions and IT transformation at Autoliv. Driving innovation in automotive safety technology.",
            jobTitle: "Project Manager / Product Owner",
            skills: [
                { name: "Change Management", category: "Management" },
                { name: "Project Management", category: "Management" },
                { name: "Digital Transformation", category: "Strategy" },
            ],
            industry: ["Auto", "Manufacturing"],
            experience: "7+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Gustav",
        });
        console.log(`  Created Gustav Westergren`);
    }

    // Extra Autoliv employees (keep existing from seed-autoliv if they exist)
    const autolivEmployees = [
        { name: "Anna Andersson", email: "anna.andersson@autoliv.com" },
        { name: "Bjorn Borg", email: "bjorn.borg@autoliv.com" },
    ];
    for (const emp of autolivEmployees) {
        const existing = await db.query.users.findFirst({ where: eq(users.email, emp.email) });
        if (!existing) {
            await db.insert(users).values({
                name: emp.name,
                email: emp.email,
                role: "Customer",
                companyId: autolivId,
                approvalStatus: "APPROVED",
                password: hashedPassword,
                image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name.replace(/ /g, '')}`,
            });
            console.log(`  Created ${emp.name}`);
        } else {
            await db.update(users).set({ companyId: autolivId, role: "Customer", approvalStatus: "APPROVED" }).where(eq(users.id, existing.id));
            console.log(`  ${emp.name} already exists. Updated.`);
        }
    }

    // ─── 2. Volvo Cars ──────────────────────────────────────────
    console.log("\n📌 Volvo Cars...");
    let volvoId: string;
    const existingVolvo = await db.query.companies.findFirst({
        where: eq(companies.domain, "volvocars.com"),
    });
    if (existingVolvo) {
        volvoId = existingVolvo.id;
        console.log(`  Company exists (${volvoId})`);
    } else {
        const [c] = await db.insert(companies).values({
            name: "Volvo Cars",
            domain: "volvocars.com",
        }).returning();
        volvoId = c.id;
        console.log(`  Created company (${volvoId})`);
    }

    // Volvo user
    const volvoEmail = "erik.lindgren@volvocars.com";
    const existingVolvoUser = await db.query.users.findFirst({ where: eq(users.email, volvoEmail) });
    if (existingVolvoUser) {
        console.log(`  User Erik already exists. Updating...`);
        await db.update(users).set({
            name: "Erik Lindgren",
            companyId: volvoId,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Head of IT Strategy at Volvo Cars, responsible for digital innovation and technology partnerships. Focused on electrification, connectivity, and sustainable mobility solutions.",
            jobTitle: "Head of IT Strategy",
            skills: [
                { name: "IT Strategy", category: "Strategy" },
                { name: "Digital Transformation", category: "Strategy" },
                { name: "Vendor Management", category: "Management" },
            ],
            industry: ["Auto", "Tech"],
            experience: "12+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Erik",
        }).where(eq(users.id, existingVolvoUser.id));
    } else {
        await db.insert(users).values({
            id: "cu-volvo-1",
            name: "Erik Lindgren",
            email: volvoEmail,
            companyId: volvoId,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Head of IT Strategy at Volvo Cars, responsible for digital innovation and technology partnerships. Focused on electrification, connectivity, and sustainable mobility solutions.",
            jobTitle: "Head of IT Strategy",
            skills: [
                { name: "IT Strategy", category: "Strategy" },
                { name: "Digital Transformation", category: "Strategy" },
                { name: "Vendor Management", category: "Management" },
            ],
            industry: ["Auto", "Tech"],
            experience: "12+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Erik",
        });
        console.log(`  Created Erik Lindgren`);
    }

    // Extra Volvo employee
    const volvoExtra = { name: "Sofia Bergström", email: "sofia.bergstrom@volvocars.com" };
    const existingVolvoExtra = await db.query.users.findFirst({ where: eq(users.email, volvoExtra.email) });
    if (!existingVolvoExtra) {
        await db.insert(users).values({
            name: volvoExtra.name,
            email: volvoExtra.email,
            role: "Customer",
            companyId: volvoId,
            approvalStatus: "APPROVED",
            password: hashedPassword,
            image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${volvoExtra.name.replace(/ /g, '')}`,
        });
        console.log(`  Created ${volvoExtra.name}`);
    } else {
        console.log(`  ${volvoExtra.name} already exists.`);
    }

    // ─── 3. Micke Lidas ─────────────────────────────────────────
    console.log("\n📌 Micke Lidas...");
    const mickeEmail = "micke.lidas@intelboard.io";
    const existingMicke = await db.query.users.findFirst({ where: eq(users.email, mickeEmail) });
    if (existingMicke) {
        console.log(`  User Micke already exists. Updating...`);
        await db.update(users).set({
            name: "Micke Lidas",
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Technology enthusiast and IT professional with a passion for cloud infrastructure, DevOps, and modern software development practices.",
            jobTitle: "IT Consultant",
            skills: [
                { name: "Cloud Infrastructure", category: "Technology" },
                { name: "DevOps", category: "Technology" },
                { name: "Solution Architecture", category: "Strategy" },
            ],
            industry: ["Tech", "Consulting"],
            experience: "10+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Micke",
        }).where(eq(users.id, existingMicke.id));
    } else {
        await db.insert(users).values({
            id: "cu-micke-1",
            name: "Micke Lidas",
            email: mickeEmail,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Technology enthusiast and IT professional with a passion for cloud infrastructure, DevOps, and modern software development practices.",
            jobTitle: "IT Consultant",
            skills: [
                { name: "Cloud Infrastructure", category: "Technology" },
                { name: "DevOps", category: "Technology" },
                { name: "Solution Architecture", category: "Strategy" },
            ],
            industry: ["Tech", "Consulting"],
            experience: "10+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Micke",
        });
        console.log(`  Created Micke Lidas`);
    }

    // ─── 4. Freddie Tour ────────────────────────────────────────
    console.log("\n📌 Freddie Tour...");
    const freddieEmail = "freddie.tour@intelboard.io";
    const existingFreddie = await db.query.users.findFirst({ where: eq(users.email, freddieEmail) });
    if (existingFreddie) {
        console.log(`  User Freddie already exists. Updating...`);
        await db.update(users).set({
            name: "Freddie Tour",
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Digital transformation leader with deep expertise in enterprise architecture, AI integration, and cybersecurity governance.",
            jobTitle: "Digital Transformation Manager",
            skills: [
                { name: "Enterprise Architecture", category: "Strategy" },
                { name: "AI Integration", category: "Technology" },
                { name: "Cybersecurity", category: "Security" },
            ],
            industry: ["Tech", "Finance"],
            experience: "8+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Freddie",
        }).where(eq(users.id, existingFreddie.id));
    } else {
        await db.insert(users).values({
            id: "cu-freddie-1",
            name: "Freddie Tour",
            email: freddieEmail,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Digital transformation leader with deep expertise in enterprise architecture, AI integration, and cybersecurity governance.",
            jobTitle: "Digital Transformation Manager",
            skills: [
                { name: "Enterprise Architecture", category: "Strategy" },
                { name: "AI Integration", category: "Technology" },
                { name: "Cybersecurity", category: "Security" },
            ],
            industry: ["Tech", "Finance"],
            experience: "8+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Freddie",
        });
        console.log(`  Created Freddie Tour`);
    }

    // ─── 5. Peter Casadei ───────────────────────────────────────
    console.log("\n📌 Peter Casadei...");
    const peterEmail = "peter.casadei@intelboard.io";
    const existingPeter = await db.query.users.findFirst({ where: eq(users.email, peterEmail) });
    if (existingPeter) {
        console.log(`  User Peter already exists. Updating...`);
        await db.update(users).set({
            name: "Peter Casadei",
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Experienced IT strategist and program manager specializing in large-scale migrations, governance frameworks, and cross-functional technology leadership.",
            jobTitle: "IT Program Manager",
            skills: [
                { name: "Program Management", category: "Management" },
                { name: "IT Governance", category: "Strategy" },
                { name: "Cloud Migration", category: "Technology" },
            ],
            industry: ["Tech", "Enterprise"],
            experience: "15+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Peter",
        }).where(eq(users.id, existingPeter.id));
    } else {
        await db.insert(users).values({
            id: "cu-peter-1",
            name: "Peter Casadei",
            email: peterEmail,
            role: "Customer",
            approvalStatus: "APPROVED",
            password: hashedPassword,
            bio: "Experienced IT strategist and program manager specializing in large-scale migrations, governance frameworks, and cross-functional technology leadership.",
            jobTitle: "IT Program Manager",
            skills: [
                { name: "Program Management", category: "Management" },
                { name: "IT Governance", category: "Strategy" },
                { name: "Cloud Migration", category: "Technology" },
            ],
            industry: ["Tech", "Enterprise"],
            experience: "15+ years",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Peter",
        });
        console.log(`  Created Peter Casadei`);
    }

    // ─── 6. Admin ────────────────────────────────────────────────
    console.log("\n📌 Admin...");
    const adminEmail = "admin@intelboard.io";
    const existingAdmin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
    if (existingAdmin) {
        console.log(`  Admin already exists. Updating...`);
        await db.update(users).set({
            name: "IntelBoard Admin",
            role: "Admin",
            approvalStatus: "APPROVED",
            password: adminPassword,
            bio: "Platform administrator responsible for managing specialists, approving requests, and overseeing the IntelBoard ecosystem.",
            jobTitle: "Platform Administrator",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
        }).where(eq(users.id, existingAdmin.id));
    } else {
        await db.insert(users).values({
            id: "admin-1",
            name: "IntelBoard Admin",
            email: adminEmail,
            role: "Admin",
            approvalStatus: "APPROVED",
            password: adminPassword,
            bio: "Platform administrator responsible for managing specialists, approving requests, and overseeing the IntelBoard ecosystem.",
            jobTitle: "Platform Administrator",
            image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
        });
        console.log(`  Created Admin`);
    }

    console.log("\n🎉 All demo accounts seeded successfully!");
    console.log("\n📋 Quick Login Credentials:");
    console.log("  Autoliv:     gustav.westergren.external@autoliv.com / password123");
    console.log("  Volvo Cars:  erik.lindgren@volvocars.com / password123");
    console.log("  Micke:       micke.lidas@intelboard.io / password123");
    console.log("  Freddie:     freddie.tour@intelboard.io / password123");
    console.log("  Peter:       peter.casadei@intelboard.io / password123");
    console.log("  Specialist:  alice.chen@intelboard.io / password123");
    console.log("  Specialist:  bob.smith@intelboard.io / password123");
    console.log("  Admin:       admin@intelboard.io / admin123");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
