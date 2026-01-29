"use server";

import { auth } from "./auth";

import { db } from "./db";
import { requests, projects, users, companies, workExperience, education, projectViews, systems, assets, integrations, systemDocuments } from "./schema";
import { eq, desc, or, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mockUsers } from "./data";

// ...

export async function getSystems() {
    try {
        const allSystems = await db.query.systems.findMany({
            with: {
                assets: true,
                documents: true,
            }
        });
        // We need to fetch integrations separately or include? 
        // Integrations link asset->system.
        // Let's fetch integrations globally for now as they are lightweight.
        return allSystems;
    } catch (error) {
        console.error("Failed to fetch systems:", error);
        return [];
    }
}

export async function getIntegrations() {
    try {
        return await db.select().from(integrations);
    } catch (error) {
        console.error("Failed to fetch integrations:", error);
        return [];
    }
}

export async function addSystem(data: any) {
    try {
        const [newSystem] = await db.insert(systems).values({
            ...data,
            createdAt: new Date(),
        }).returning();
        revalidatePath("/it-planner");
        return newSystem;
    } catch (error) {
        console.error("Failed to add system:", error);
        throw new Error("Failed to add system");
    }
}

export async function updateSystem(id: string, updates: any) {
    try {
        await db.update(systems).set(updates).where(eq(systems.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to update system:", error);
        throw new Error("Failed to update system");
    }
}

export async function updateSystemPosition(id: string, position: { x: number; y: number }) {
    try {
        await db.update(systems).set({ position }).where(eq(systems.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to update system position:", error);
    }
}

export async function deleteSystem(id: string) {
    try {
        await db.delete(systems).where(eq(systems.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to delete system:", error);
        throw new Error("Failed to delete system");
    }
}

export async function addAsset(systemId: string, asset: any) {
    try {
        const [newAsset] = await db.insert(assets).values({
            ...asset,
            systemId,
        }).returning();
        revalidatePath("/it-planner");
        return newAsset;
    } catch (error) {
        console.error("Failed to add asset:", error);
        throw new Error("Failed to add asset");
    }
}

export async function updateAsset(assetId: string, updates: any) {
    try {
        await db.update(assets).set(updates).where(eq(assets.id, assetId));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to update asset:", error);
        throw new Error("Failed to update asset");
    }
}

export async function verifyAsset(assetId: string) {
    try {
        await db.update(assets).set({ verificationStatus: 'Verified' }).where(eq(assets.id, assetId));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to verify asset:", error);
        throw new Error("Failed to verify asset");
    }
}

export async function addIntegration(data: any) {
    try {
        const [newIntegration] = await db.insert(integrations).values(data).returning();
        revalidatePath("/it-planner");
        return newIntegration;
    } catch (error) {
        console.error("Failed to add integration:", error);
        throw new Error("Failed to add integration");
    }
}

export async function updateIntegration(id: string, updates: any) {
    try {
        await db.update(integrations).set(updates).where(eq(integrations.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to update integration:", error);
        throw new Error("Failed to update integration");
    }
}

export async function removeIntegration(id: string) {
    try {
        await db.delete(integrations).where(eq(integrations.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to remove integration:", error);
        throw new Error("Failed to remove integration");
    }
}

export async function getRequests() {
    try {
        const session = await auth();
        const companyId = (session?.user as any)?.companyId;
        const userId = session?.user?.id;

        if (companyId) {
            const teamUsers = await db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
            const teamUserIds = teamUsers.map(u => u.id);

            if (teamUserIds.length === 0) return [];

            return await db.query.requests.findMany({
                where: (requests, { inArray }) => inArray(requests.creatorId, teamUserIds),
                orderBy: [desc(requests.createdAt)],
            });
        }

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
        const { createdAt, ...sanitizedData } = data;

        if (sanitizedData.creatorId) {
            const existingUser = await db.query.users.findFirst({
                where: eq(users.id, sanitizedData.creatorId)
            });

            if (!existingUser) {
                console.log(`Creator ${sanitizedData.creatorId} not found in DB. Creating placeholder...`);
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
        console.error("Failed to add request details:", error);
        throw new Error("Failed to add request");
    }
}


export async function inviteUser(email: string, name: string, companyId: string) {
    try {
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));

        if (existingUser) {
            if (existingUser.companyId && existingUser.companyId !== companyId) {
                return { error: "User belongs to another company." };
            }
            if (existingUser.companyId === companyId) {
                return { error: "User is already in your team." };
            }
            return { error: "User already exists." };
        }

        const bcrypt = require("bcryptjs");
        const hashedPassword = await bcrypt.hash("password123", 10);

        const [newUser] = await db.insert(users).values({
            email,
            name,
            companyId,
            password: hashedPassword,
            role: "User",
            approvalStatus: "APPROVED"
        }).returning();

        revalidatePath("/team");
        return { success: true, user: newUser };

    } catch (error) {
        console.error("Failed to invite user:", error);
        return { error: "Failed to invite user." };
    }
}

export async function requestCompanyAccess(email: string, name: string, companyId: string) {
    try {
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));

        if (existingUser) {
            if (existingUser.companyId === companyId) {
                return { error: "You are already a member of this company." };
            }
            return { error: "Email already registered. Please contact support." };
        }

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

        revalidatePath("/team");
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
        const dbUser = await getUser(creatorId);
        if (dbUser) return dbUser;

        const mockUser = mockUsers.find(u =>
            u.id.toLowerCase() === lowerId ||
            u.email?.toLowerCase() === lowerId
        );
        if (mockUser) return mockUser;

        if (creatorId.includes("@")) {
            const emailPrefix = creatorId.split('@')[0];
            const lowerPrefix = emailPrefix.toLowerCase();
            const mockByPrefix = mockUsers.find(u => u.id.toLowerCase() === lowerPrefix);
            if (mockByPrefix) return mockByPrefix;

            let name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            if (emailPrefix.startsWith('c')) name = "Customer " + emailPrefix.slice(1);
            if (emailPrefix.startsWith('s')) name = "Specialist " + emailPrefix.slice(1);
            if (emailPrefix.startsWith('a')) name = "Agency " + emailPrefix.slice(1);

            return { id: creatorId, name: name, role: "Guest" };
        }

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

export async function getUserWithProfile(userId: string) {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            with: {
                workExperience: true,
                education: true,
            }
        });
        return { success: true, user };
    } catch (error) {
        console.error("Failed to fetch user with profile:", error);
        return { success: false, error: "Failed to fetch user" };
    }
}

export async function updateUserProfile(userId: string, data: {
    name?: string;
    bio?: string;
    jobTitle?: string;
    skills?: { name: string; category: string }[];
    industry?: string[];
    experience?: string;
    linkedin?: string;
    availability?: string;
    workExperience?: any[];
    education?: any[];
}) {
    console.log(`[Profile Update] Starting update for user ${userId}`, JSON.stringify(data, null, 2));

    try {
        const { workExperience: workData, education: eduData, ...userData } = data;

        const existingUser = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!existingUser) {
            console.log(`[Profile Update] User ${userId} not found in DB. Creating placeholder...`);
            const mockUser = mockUsers.find((u) => u.id === userId);
            try {
                await db.insert(users).values({
                    id: userId,
                    name: mockUser?.name || userData.name || "Guest User",
                    email: mockUser?.email || `${userId}@placeholder.com`,
                    role: (mockUser?.role as any) || "Guest",
                    companyId: mockUser?.company || null,
                    image: mockUser?.avatar || null,
                }).onConflictDoNothing();
            } catch (creationError) {
                console.error(`[Profile Update] Failed to create placeholder user:`, creationError);
                throw new Error("Failed to initialize user record.");
            }
        }

        await db.transaction(async (tx) => {
            if (Object.keys(userData).length > 0) {
                console.log(`[Profile Update] Updating user ${userId} fields:`, Object.keys(userData));
                await tx.update(users)
                    .set(userData as any)
                    .where(eq(users.id, userId));
            }

            if (workData) {
                console.log(`[Profile Update] Updating experience for ${userId}: ${workData.length} items`);
                await tx.delete(workExperience).where(eq(workExperience.userId, userId));

                if (workData.length > 0) {
                    const cleanWorkData = workData.map((w: any) => {
                        const startDate = w.startDate ? new Date(w.startDate) : new Date();
                        if (isNaN(startDate.getTime())) {
                            throw new Error(`Invalid start date for experience at ${w.company}`);
                        }

                        let endDate = null;
                        if (w.endDate && w.endDate !== "Present") {
                            endDate = new Date(w.endDate);
                            if (isNaN(endDate.getTime())) {
                                throw new Error(`Invalid end date for experience at ${w.company}`);
                            }
                        }

                        return {
                            userId,
                            company: w.company,
                            title: w.title,
                            startDate,
                            endDate,
                            description: w.description || null,
                            location: w.location || null,
                        };
                    });

                    await tx.insert(workExperience).values(cleanWorkData);
                }
            }

            if (eduData) {
                console.log(`[Profile Update] Updating education for ${userId}: ${eduData.length} items`);
                await tx.delete(education).where(eq(education.userId, userId));

                if (eduData.length > 0) {
                    const cleanEduData = eduData.map((e: any) => {
                        const startDate = e.startDate ? new Date(e.startDate) : new Date();
                        if (isNaN(startDate.getTime())) {
                            throw new Error(`Invalid start date for education at ${e.school}`);
                        }

                        let endDate = null;
                        if (e.endDate) {
                            endDate = new Date(e.endDate);
                            if (isNaN(endDate.getTime())) {
                                throw new Error(`Invalid end date for education at ${e.school}`);
                            }
                        }

                        return {
                            userId,
                            school: e.school,
                            degree: e.degree || null,
                            fieldOfStudy: e.fieldOfStudy || null,
                            startDate,
                            endDate
                        };
                    });

                    await tx.insert(education).values(cleanEduData);
                }
            }
        });

        const updated = await db.query.users.findFirst({
            where: eq(users.id, userId),
            with: {
                workExperience: true,
                education: true,
            }
        });

        console.log(`[Profile Update] SUCCESS for ${userId}`);

        revalidatePath("/account");
        revalidatePath(`/profile/${userId}`);
        revalidatePath("/profile");
        revalidatePath("/talent");

        return { success: true, user: updated };
    } catch (error: any) {
        console.error(`[Profile Update] FAILED for ${userId}:`, error);

        // Detailed error for debugging
        let errorMessage = error.message || "Unknown error";
        if (error.code) {
            errorMessage += ` (DB Code: ${error.code})`;
        }

        if (error.code === '23505') return { success: false, error: "Data conflict: This record already exists." };
        if (error.code === '23503') return { success: false, error: "Reference error: User or related record not found." };
        if (errorMessage.includes("Invalid date")) return { success: false, error: errorMessage };

        return { success: false, error: `Save failed: ${errorMessage}` };
    }
}

export async function updateUserRole(userId: string, newRole: string) {
    try {
        const session = await auth();
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
        const allUsers = await db.select().from(users);
        const filtered = allUsers.filter(u => {
            const q = query?.toLowerCase() || "";
            const matchesQuery = !q ||
                u.name?.toLowerCase().includes(q) ||
                u.bio?.toLowerCase().includes(q) ||
                u.jobTitle?.toLowerCase().includes(q) ||
                (u.skills as { name: string }[] || []).some(s => s.name.toLowerCase().includes(q));

            const matchesRole = !filters?.role || u.role === filters.role;

            const matchesSkill = !filters?.skill ||
                (u.skills as { name: string }[] || []).some(s => s.name.toLowerCase().includes(filters.skill!.toLowerCase()));

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
    await new Promise(resolve => setTimeout(resolve, 800));
    if (url.includes("gustav-westergren") || url.includes("6282942b")) {
        return {
            success: true,
            data: {
                bio: "Account and project manager with focus on digital solutions...",
                skills: [
                    { name: "Change Management", category: "Project Management" },
                    { name: "Project Management", category: "Project Management" }
                ],
                workExperience: [
                    {
                        company: "Autoliv",
                        title: "Project Manager / Product Owner",
                        startDate: "2019-01-01",
                        endDate: null,
                        description: "Leading digital transformation initiatives within HR and production."
                    },
                    {
                        company: "Top of Minds AB",
                        title: "IT Consultant",
                        startDate: "2011-05-01",
                        endDate: "2019-01-01",
                        description: "Delivering IT solutions and project management for various clients."
                    }
                ],
                education: [
                    {
                        school: "University of Skövde",
                        degree: "Bachelor's degree",
                        fieldOfStudy: "Cognitive Science",
                        startDate: "2007-01-01",
                        endDate: "2010-06-01"
                    }
                ],
                experience: "4 yrs 9 mos at Autoliv, 7 yrs 8 mos at Top of Minds",
                linkedin: url,
                jobTitle: "Senior Solution Architect"
            }
        };
    }
    return {
        success: false,
        error: "LinkedIn blocks automated access. Please enter details manually."
    };
}

// --- Project View Actions ---

export async function getProjectViews(projectId: string) {
    if (!projectId) return [];
    try {
        const views = await db.select().from(projectViews).where(eq(projectViews.projectId, projectId));
        return views;
    } catch (error) {
        console.error("Failed to get project views:", error);
        return [];
    }
}

export async function createProjectView(projectId: string, name: string, type: 'flowchart' | 'lineage') {
    try {
        const [newView] = await db.insert(projectViews).values({
            projectId,
            name,
            type,
            data: type === 'flowchart' ? { nodes: [], edges: [] } : {},
        }).returning();
        revalidatePath("/it-planner");
        return newView;
    } catch (error) {
        console.error("Failed to create project view:", error);
        throw new Error("Failed to create view");
    }
}

export async function deleteProjectView(viewId: string) {
    try {
        await db.delete(projectViews).where(eq(projectViews.id, viewId));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to delete project view:", error);
        throw new Error("Failed to delete view");
    }
}

export async function updateProjectView(viewId: string, data: any) {
    try {
        await db.update(projectViews).set({ data }).where(eq(projectViews.id, viewId));
        revalidatePath("/it-planner");
    } catch (error) {
        console.error("Failed to update project view:", error);
        throw new Error("Failed to update view");
    }
}
