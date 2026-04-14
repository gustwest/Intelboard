'use server'

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq, or, sql, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

export async function createProject(data: { name: string, description?: string }) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const [project] = await db.insert(projects).values({
        name: data.name,
        description: data.description,
        ownerId: session.user.id,
    }).returning();

    revalidatePath('/');
    return project;
}

export async function getUserProjects() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const userId = session.user.id;

    return await db.select().from(projects).where(
        or(
            eq(projects.ownerId, userId),
            sql`${projects.sharedWith} @> ${JSON.stringify([userId])}`
        )
    );
}

export async function deleteProject(id: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    await db.delete(projects).where(
        and(
            eq(projects.id, id),
            eq(projects.ownerId, session.user.id) // Only owner can delete
        )
    );
    revalidatePath('/');
}
