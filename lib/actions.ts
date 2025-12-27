"use server";

import { db } from "./db";
import { requests, projects, users } from "./schema";
import { eq, desc, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mockUsers } from "./data";

// --- Request Actions ---

export async function getRequests() {
    console.log("[getRequests] Fetching all requests from DB...");
    try {
        const result = await db.query.requests.findMany({
            orderBy: [desc(requests.createdAt)],
        });
        console.log(`[getRequests] Successfully fetched ${result.length} requests.`);
        return result;
    } catch (error) {
        console.error("[getRequests] Failed to fetch requests:", error);
        return [];
    }
}

export async function addRequest(data: any) {
    console.log("[addRequest] Attempting to add new request:", { id: data.id, title: data.title, creatorId: data.creatorId });
    try {
        // Remove createdAt if present to let the server set it correctly
        const { createdAt, ...sanitizedData } = data;

        // Ensure creator exists to prevent Foreign Key errors
        if (sanitizedData.creatorId) {
            const existingUser = await db.query.users.findFirst({
                where: eq(users.id, sanitizedData.creatorId)
            });

            if (!existingUser) {
                console.log(`[addRequest] Creator ${sanitizedData.creatorId} not found in DB. Creating placeholder...`);
                // Try to find mock details
                const mockDiff = mockUsers.find(u => u.id === sanitizedData.creatorId);

                await db.insert(users).values({
                    id: sanitizedData.creatorId,
                    name: mockDiff?.name || "Guest User",
                    email: mockDiff?.email || `${sanitizedData.creatorId}@placeholder.com`,
                    role: (mockDiff?.role as any) || "Guest",
                    company: mockDiff?.company || null,
                    image: mockDiff?.avatar || null,
                }).onConflictDoNothing();
            } else {
                console.log(`[addRequest] Found existing creator: ${existingUser.name} (${existingUser.role})`);
            }
        }

        console.log("[addRequest] Inserting data into database...");
        const [newRequest] = await db.insert(requests).values({
            ...sanitizedData,
            createdAt: new Date(),
        }).returning();

        console.log("[addRequest] Successfully inserted request:", newRequest.id);

        revalidatePath("/requests");
        return newRequest;
    } catch (error) {
        console.error("[addRequest] CRITICAL ERROR:");
        console.dir(error, { depth: null });
        throw new Error("Failed to add request");
    }
}

export async function getSystems() {
    // Note: 'systems' table is currently only in-memory/Liveblocks. 
    // Return empty for now to satisfy sync logic.
    return [];
}

export async function updateRequest(id: string, data: any) {
    try {
        const [updated] = await db.update(requests)
            .set(data)
            .where(eq(requests.id, id))
            .returning();
        revalidatePath(`/requests/${id}`);
        revalidatePath("/requests");
        return updated;
    } catch (error) {
        console.error("Failed to update request:", error);
        throw new Error("Failed to update request");
    }
}

// --- User Actions ---

export async function getUser(id: string) {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user || null;
    } catch (error) {
        console.error("Failed to get user:", error);
        return null;
    }
}

export async function getRequestCreator(creatorId: string) {
    if (!creatorId) return null;

    const lowerId = creatorId.toLowerCase();

    try {
        // 1. Check DB
        const dbUser = await getUser(creatorId);
        if (dbUser) return dbUser;

        // 2. Check Mock Users (by ID or Email, case-insensitive)
        const mockUser = mockUsers.find(u =>
            u.id.toLowerCase() === lowerId ||
            u.email?.toLowerCase() === lowerId
        );
        if (mockUser) return mockUser;

        // 3. Check pseudo-email IDs (special case for local dev)
        if (creatorId.includes("@")) {
            const emailPrefix = creatorId.split('@')[0];
            const lowerPrefix = emailPrefix.toLowerCase();

            // Try to find a mock user whose ID is the prefix (case-insensitive)
            const mockByPrefix = mockUsers.find(u => u.id.toLowerCase() === lowerPrefix);
            if (mockByPrefix) return mockByPrefix;

            // Generate a readable name from the prefix (e.g. 'c1' -> 'Customer 1')
            let name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            if (emailPrefix.startsWith('c')) name = "Customer " + emailPrefix.slice(1);
            if (emailPrefix.startsWith('s')) name = "Specialist " + emailPrefix.slice(1);
            if (emailPrefix.startsWith('a')) name = "Agency " + emailPrefix.slice(1);

            return {
                id: creatorId,
                name: name,
                role: "Guest"
            };
        }

        // 4. Last resort: just return the ID capitalized
        return {
            id: creatorId,
            name: creatorId.charAt(0).toUpperCase() + creatorId.slice(1),
            role: "Guest"
        };
    } catch (error) {
        console.error("Failed to get request creator:", error);
        return null;
    }
}

// --- Project Actions ---

export async function getProjects() {
    try {
        return await db.query.projects.findMany({
            orderBy: [desc(projects.createdAt)],
        });
    } catch (error) {
        console.error("Failed to fetch projects:", error);
        return [];
    }
}

export async function addProject(data: any) {
    try {
        const [newProject] = await db.insert(projects).values({
            flowData: { nodes: [], edges: [] },
            ...data,
            createdAt: new Date(),
        }).returning();
        revalidatePath("/it-planner");
        return newProject;
    } catch (error) {
        console.error("Failed to add project:", error);
        throw new Error("Failed to add project");
    }
}

export async function updateProject(id: string, data: any) {
    try {
        const [updated] = await db.update(projects)
            .set(data)
            .where(eq(projects.id, id))
            .returning();
        revalidatePath("/it-planner");
        return updated;
    } catch (error) {
        console.error("Failed to update project:", error);
        throw new Error("Failed to update project");
    }
}

export async function deleteProject(id: string) {
    try {
        await db.delete(projects).where(eq(projects.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to delete project:", error);
        throw new Error("Failed to delete project");
    }
}
