
'use server'

import { db } from '@/lib/db';
import { systems, assets, projectSystems, projects, users } from '@/db/schema';
import { eq, inArray, sql, and, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { System, Asset } from '@/store/useStore';
import { auth } from '@/auth';

// Helper to map DB result to Store System type
// Note: This is a simplified mapper. Real implementation might need more parsing.
// function mapDbSystemToStore(sys: typeof systems.$inferSelect, sysAssets: typeof assets.$inferSelect[]): System { ... }

export async function createSystem(data: any) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");
    const userId = session.user.id;

    // Verify project access if linking to a project
    if (data.projectId) {
        const projectAccess = await db.select().from(projects).where(
            and(
                eq(projects.id, data.projectId),
                or(
                    eq(projects.ownerId, userId),
                    sql`${projects.sharedWith} @> ${JSON.stringify([userId])}`
                )
            )
        );
        if (projectAccess.length === 0) throw new Error("Unauthorized access to project");
    }

    // data matches basic system structure
    const [newSystem] = await db.insert(systems).values({
        name: data.name,
        type: data.type,
        description: data.description,
        positionX: data.position.x,
        positionY: data.position.y,
    }).returning();

    // If there is a project context, link it
    if (data.projectId) {
        await db.insert(projectSystems).values({
            projectId: data.projectId,
            systemId: newSystem.id,
        });
    }

    revalidatePath('/');
    return newSystem;
}


// Helper to verify system access
async function verifySystemAccess(systemId: string, userId: string) {
    const result = await db.select({ id: systems.id })
        .from(systems)
        .innerJoin(projectSystems, eq(systems.id, projectSystems.systemId))
        .innerJoin(projects, eq(projectSystems.projectId, projects.id))
        .where(and(
            eq(systems.id, systemId),
            or(
                eq(projects.ownerId, userId),
                sql`${projects.sharedWith} @> ${JSON.stringify([userId])}`
            )
        ));
    return result.length > 0;
}

export async function getSystemsForProject(projectId: string) {
    const session = await auth();
    if (!session?.user?.id) return [];

    // Check project access
    const projectAccess = await db.select().from(projects).where(
        and(
            eq(projects.id, projectId),
            or(
                eq(projects.ownerId, session.user.id),
                sql`${projects.sharedWith} @> ${JSON.stringify([session.user.id])}`
            )
        )
    );
    if (projectAccess.length === 0) return [];

    const rows = await db.select()
        .from(systems)
        .leftJoin(projectSystems, eq(systems.id, projectSystems.systemId))
        .where(eq(projectSystems.projectId, projectId));

    return rows.map(r => r.systems);
}

export async function updateSystemPosition(id: string, x: number, y: number) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    if (!await verifySystemAccess(id, session.user.id)) throw new Error("Unauthorized access to system");

    await db.update(systems)
        .set({ positionX: x, positionY: y, updatedAt: new Date() })
        .where(eq(systems.id, id));
}

export async function addAssetToSystem(systemId: string, assetData: any) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    if (!await verifySystemAccess(systemId, session.user.id)) throw new Error("Unauthorized access to system");

    const [newAsset] = await db.insert(assets).values({
        systemId,
        name: assetData.name,
        type: assetData.type,
        description: assetData.description,
        schema: assetData.schema,
        status: assetData.status,
        columns: assetData.columns
    }).returning();

    revalidatePath('/');
    return newAsset;
}
