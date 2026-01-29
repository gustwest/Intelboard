"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

export async function approveUser(userId: string) {
    const session = await auth();
    // In real app, check if session.user.role === 'Admin' and session.user.companyId matches user.companyId

    if (!session?.user) return { error: "Unauthorized" };

    await db.update(users)
        .set({ approvalStatus: "APPROVED" })
        .where(eq(users.id, userId));

    revalidatePath("/dashboard/settings/approvals");
    return { success: true };
}

export async function rejectUser(userId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    await db.update(users)
        .set({ approvalStatus: "REJECTED" })
        .where(eq(users.id, userId));

    revalidatePath("/dashboard/settings/approvals");
    return { success: true };
}
