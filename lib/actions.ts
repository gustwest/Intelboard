"use server";

import { auth } from "./auth";

import { db } from "./db";
import { requests, projects, users, companies } from "./schema";
import { eq, desc, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mockUsers } from "./data";

// --- Request Actions ---

export async function getRequests() {
    try {
        const session = await auth();
        // If system admin (implement check later if needed), return all? 
        // For now, if companyId exists, return all company requests.
        // If Guest/No company, return only own?

        const companyId = (session?.user as any)?.companyId;
        const userId = session?.user?.id;

        if (companyId) {
            // Get all requests where creator is in the same company
            // This requires a join. Drizzle query builder:
            const teamUsers = await db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
            const teamUserIds = teamUsers.map(u => u.id);

            if (teamUserIds.length === 0) return []; // Should catch self at least

            return await db.query.requests.findMany({
                where: (requests, { inArray }) => inArray(requests.creatorId, teamUserIds),
                orderBy: [desc(requests.createdAt)],
            });
        }

        // Fallback for guests/individuals: see their own
        if (!userId) return [];

        return await db.query.requests.findMany({
            where: eq(requests.creatorId, userId),
            orderBy: [desc(requests.createdAt)],
        });

    } catch (error) {
        console.error("Failed to fetch requests:", error);
        return [];
    }
}

export async function addRequest(data: any) {
    try {
        // Remove createdAt if present to let the server set it correctly
        const { createdAt, ...sanitizedData } = data;

        // Ensure creator exists to prevent Foreign Key errors
        if (sanitizedData.creatorId) {
            const existingUser = await db.query.users.findFirst({
                where: eq(users.id, sanitizedData.creatorId)
            });

            if (!existingUser) {
                console.log(`Creator ${sanitizedData.creatorId} not found in DB. Creating placeholder...`);
                // Try to find mock details
                const mockDiff = mockUsers.find(u => u.id === sanitizedData.creatorId);

                await db.insert(users).values({
                    id: sanitizedData.creatorId,
                    name: mockDiff?.name || "Guest User",
                    email: mockDiff?.email || `${sanitizedData.creatorId}@placeholder.com`,
                    role: (mockDiff?.role as any) || "Guest",
                    companyId: mockDiff?.company || null,
                    image: mockDiff?.avatar || null,
                }).onConflictDoNothing();
            }
        }

        const [newRequest] = await db.insert(requests).values({
            ...sanitizedData,
            createdAt: new Date(),
        }).returning();
        revalidatePath("/requests");
        return newRequest;
    } catch (error) {
        console.error("Failed to add request details:");
        console.dir(error, { depth: null });
        throw new Error("Failed to add request");
    }
}

export async function getSystems() {
    // Note: 'systems' table is currently only in-memory/Liveblocks. 
    // Return empty for now to satisfy sync logic.
    return [];
}

export async function inviteUser(email: string, name: string, companyId: string) {
    console.log("Inviting user:", email, name, companyId);
    try {
        // 1. Check if user exists
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));

        if (existingUser) {
            // Logic: If user exists but no company, maybe add them? 
            // For now, fail if exists
            if (existingUser.companyId && existingUser.companyId !== companyId) {
                return { error: "User belongs to another company." };
            }
            if (existingUser.companyId === companyId) {
                return { error: "User is already in your team." };
            }
            // Update logic if needed, but for MVP let's assume invite new only
            return { error: "User already exists." };
        }

        // 2. Create User
        // Generate a random password for them? Or send invite link?
        // Since we don't have email sending, we'll set a default password for testing: "password123"
        // In real life, we would create a token and email it.
        const bcrypt = require("bcryptjs");
        const hashedPassword = await bcrypt.hash("password123", 10);

        const [newUser] = await db.insert(users).values({
            email,
            name,
            companyId,
            password: hashedPassword,
            role: "User", // Default role
            approvalStatus: "APPROVED"
        }).returning();

        console.log(`[MOCK EMAIL] To: ${email} | Subject: You've been invited! | Body: Welcome to the team. Login with password123`);

        revalidatePath("/team");
        return { success: true, user: newUser };

    } catch (error) {
        console.error("Failed to invite user:", error);
        return { error: "Failed to invite user." };
    }
}

export async function requestCompanyAccess(email: string, name: string, companyId: string) {
    console.log("Requesting access for:", email, name, companyId);
    try {
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));

        if (existingUser) {
            if (existingUser.companyId === companyId) {
                return { error: "You are already a member of this company." };
            }
            // Allow claiming if guest?
            return { error: "Email already registered. Please contact support." };
        }

        // Logic similar to invite but status is PENDING
        // We'll set a placeholder password or require them to set one later.
        // For MVP, we set a default password that they would supposedly get in email.
        const bcrypt = require("bcryptjs");
        const hashedPassword = await bcrypt.hash("password123", 10);

        const [newUser] = await db.insert(users).values({
            email,
            name,
            companyId,
            password: hashedPassword,
            role: "User",
            approvalStatus: "PENDING"
        }).returning();

        // Simulate email to Admin
        console.log(`[MOCK EMAIL] To: ADMIN (Gustav) | Subject: New Access Request | Body: ${name} (${email}) requested access to Autoliv.`);

        return { success: true, user: newUser };

    } catch (error) {
        console.error("Failed to request access:", error);
        return { error: "Failed to request access." };
    }
}

export async function approveUserAccess(userId: string) {
    try {
        const [updated] = await db.update(users)
            .set({ approvalStatus: "APPROVED" })
            .where(eq(users.id, userId))
            .returning();

        // Notify user
        console.log(`[MOCK EMAIL] To: ${updated.email} | Subject: Access Approved! | Body: You can now login.`);

        revalidatePath("/team"); // or wherever admin manages this
        return { success: true, user: updated };
    } catch (error) {
        console.error("Failed to approve user:", error);
        return { error: "Failed to approve user." };
    }
}

export async function getCompanyUsers(companyId: string) {
    if (!companyId) return [];
    try {
        return await db.select().from(users)
            .where(eq(users.companyId, companyId))
            .orderBy(users.name);
    } catch (e) {
        console.error("Failed to get company users:", e);
        return [];
    }
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

export async function updateUserProfile(userId: string, data: {
    name?: string;
    bio?: string;
    jobTitle?: string;
    skills?: string[];
    industry?: string[];
    experience?: string;
    linkedin?: string;
    availability?: string;
}) {
    try {
        const [updated] = await db.update(users)
            .set(data)
            .where(eq(users.id, userId))
            .returning();

        revalidatePath("/account");
        revalidatePath(`/profile/${userId}`);
        return { success: true, user: updated };
    } catch (error) {
        console.error("Failed to update user profile:", error);
        return { error: "Failed to update profile." };
    }
}

export async function updateUserRole(userId: string, newRole: string) {
    try {
        const session = await auth();
        // Security check: Only Admins can change roles
        const requesterId = session?.user?.id;
        if (!requesterId) return { error: "Unauthorized" };

        const [requester] = await db.select().from(users).where(eq(users.id, requesterId));
        if (requester?.role !== "Admin") {
            return { error: "Only Admins can change user roles." };
        }

        const [updated] = await db.update(users)
            .set({ role: newRole as any })
            .where(eq(users.id, userId))
            .returning();

        revalidatePath("/account");
        revalidatePath("/team");
        return { success: true, user: updated };
    } catch (error) {
        console.error("Failed to update user role:", error);
        return { error: "Failed to update user role." };
    }
}

export async function searchUsers(query: string, filters?: { role?: string; skill?: string }) {
    try {
        // Basic search implementation
        // For real app, use full text search or filtered queries
        const allUsers = await db.select().from(users);

        const filtered = allUsers.filter(u => {
            const matchesQuery = !query ||
                u.name?.toLowerCase().includes(query.toLowerCase()) ||
                u.bio?.toLowerCase().includes(query.toLowerCase());

            const matchesRole = !filters?.role || u.role === filters.role;

            const matchesSkill = !filters?.skill ||
                (u.skills as string[] || []).some(s => s.toLowerCase().includes(filters.skill!.toLowerCase()));

            return matchesQuery && matchesRole && matchesSkill;
        });

        return filtered;
    } catch (error) {
        console.error("Failed to search users:", error);
        return [];
    }
}

// --- Project Actions ---

export async function getProjects() {
    try {
        const session = await auth();
        const companyId = (session?.user as any)?.companyId;
        const userId = session?.user?.id;

        if (companyId) {
            const teamUsers = await db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
            const teamUserIds = teamUsers.map(u => u.id);

            return await db.query.projects.findMany({
                where: (projects, { inArray }) => inArray(projects.ownerId, teamUserIds),
                orderBy: [desc(projects.createdAt)],
            });
        }

        if (!userId) return [];

        return await db.query.projects.findMany({
            where: eq(projects.ownerId, userId),
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

export async function getCompanyByDomain(domain: string) {
    try {
        const company = await db.query.companies.findFirst({
            where: eq(companies.domain, domain),
        });
        return company;
    } catch (error) {
        console.error("Failed to get company:", error);
        return null;
    }
}
// --- Scraper Actions ---

export async function scrapeLinkedInProfile(url: string) {
    // Simulating a delay for "scraping"
    await new Promise(resolve => setTimeout(resolve, 500)); // Reduced to 500ms

    // Check for specific user's URL to return "real" data for the demo
    if (url.includes("gustav-westergren") || url.includes("6282942b")) {
        return {
            success: true,
            data: {
                bio: "Account and project manager with focus on digital solutions. Since way back I've been hooked on digital services, both privately and professionally. I love innovation and smart solutions that literally change the way we live, interact and perceive things in our world.",
                skills: ["Change Management", "Project Management", "Coaching", "Communication", "Digital Solutions", "Innovation", "Agile Methodologies"],
                experience: "Project Manager and Product Owner at Autoliv (4 yrs 9 mos), IT Consultant at Top of Minds AB (7 yrs 8 mos)",
                industry: ["Information Technology", "Automotive"],
                linkedin: url
            }
        };
    }

    // Default mock response for other URLs
    return {
        success: true,
        data: {
            bio: "Experienced Full Stack Developer with a demonstrated history of working in the computer software industry. Skilled in React, Node.js, and Cloud Architecture.",
            skills: ["React", "Node.js", "TypeScript", "Next.js", "PostgreSQL", "AWS"],
            experience: "7 years",
            industry: ["Technology", "Software Development"],
            linkedin: url
        }
    };
}
