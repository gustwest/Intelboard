"use server";

import { db } from "@/lib/db";
import { users, companies } from "@/lib/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

export async function registerUser(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password || !name) {
        return { error: "Missing fields" };
    }

    // 1. Check if user already exists
    const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
    });

    if (existingUser) {
        return { error: "User already exists" };
    }

    // 2. Detect Company
    const domain = email.split("@")[1];
    const company = await db.query.companies.findFirst({
        where: eq(companies.domain, domain),
    });

    let companyId = null;
    let approvalStatus = "APPROVED"; // Default for public/non-corporate users

    if (company) {
        companyId = company.id;
        approvalStatus = "PENDING"; // Enforce approval for matched corporate domains
    }

    // 3. Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create User
    await db.insert(users).values({
        name,
        email,
        password: hashedPassword,
        companyId,
        approvalStatus,
        role: company ? "Customer" : "Guest", // Or logic based on domain
    });

    // 5. Redirect or Return Success
    if (approvalStatus === "PENDING") {
        return { success: true, message: "Account created. Pending company approval." };
    }

    return { success: true, message: "Account created successfully." };
}
