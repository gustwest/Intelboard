"use server";

import { auth } from "./auth";

import { db } from "./db";
import { requests, projects, users, companies, workExperience, education, projectViews, systems, assets, integrations, systemDocuments, conversations, conversationParticipants, messages, notifications, requestActivity, events, intelboards, intelboardThreads, intelboardPosts, intelboardHubs, intelHubCategories, intelHubFollows } from "./schema";
import { eq, desc, or, and, inArray, sql, like, ilike, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { dbUserToSpecialist } from "./data";
import type { Specialist } from "./data";
import { log } from "./logger";

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
        log.error("Failed to fetch systems", {}, error);
        return [];
    }
}

export async function getIntegrations() {
    try {
        return await db.select().from(integrations);
    } catch (error) {
        log.error("Failed to fetch integrations", {}, error);
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
        log.error("Failed to add system", {}, error);
        throw new Error("Failed to add system");
    }
}

export async function updateSystem(id: string, updates: any) {
    try {
        await db.update(systems).set(updates).where(eq(systems.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to update system", {}, error);
        throw new Error("Failed to update system");
    }
}

export async function updateSystemPosition(id: string, position: { x: number; y: number }) {
    try {
        await db.update(systems).set({ position }).where(eq(systems.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to update system position", {}, error);
    }
}

export async function deleteSystem(id: string) {
    try {
        await db.delete(systems).where(eq(systems.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to delete system", {}, error);
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
        log.error("Failed to add asset", {}, error);
        throw new Error("Failed to add asset");
    }
}

export async function updateAsset(assetId: string, updates: any) {
    try {
        await db.update(assets).set(updates).where(eq(assets.id, assetId));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to update asset", {}, error);
        throw new Error("Failed to update asset");
    }
}

export async function verifyAsset(assetId: string) {
    try {
        await db.update(assets).set({ verificationStatus: 'Verified' }).where(eq(assets.id, assetId));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to verify asset", {}, error);
        throw new Error("Failed to verify asset");
    }
}

export async function addIntegration(data: any) {
    try {
        const [newIntegration] = await db.insert(integrations).values(data).returning();
        revalidatePath("/it-planner");
        return newIntegration;
    } catch (error) {
        log.error("Failed to add integration", {}, error);
        throw new Error("Failed to add integration");
    }
}

export async function updateIntegration(id: string, updates: any) {
    try {
        await db.update(integrations).set(updates).where(eq(integrations.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to update integration", {}, error);
        throw new Error("Failed to update integration");
    }
}

export async function removeIntegration(id: string) {
    try {
        await db.delete(integrations).where(eq(integrations.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to remove integration", {}, error);
        throw new Error("Failed to remove integration");
    }
}

export async function getRequestById(id: string) {
    try {
        const [result] = await db.select().from(requests).where(eq(requests.id, id));
        return result || null;
    } catch (error) {
        log.error("Failed to get request", {}, error);
        return null;
    }
}

export async function getRequests() {
    try {
        const session = await auth();
        const userRole = (session?.user as any)?.role;
        const companyId = (session?.user as any)?.companyId;
        const userId = session?.user?.id;

        // Admin sees ALL requests
        if (userRole === "Admin") {
            return await db.query.requests.findMany({
                orderBy: [desc(requests.createdAt)],
            });
        }

        // Customer: see requests from their company team
        if (companyId) {
            const teamUsers = await db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
            const teamUserIds = teamUsers.map(u => u.id);

            if (teamUserIds.length === 0) return [];

            return await db.query.requests.findMany({
                where: (requests, { inArray }) => inArray(requests.creatorId, teamUserIds),
                orderBy: [desc(requests.createdAt)],
            });
        }

        // Specialist: see requests assigned to them (check both legacy field and array)
        if (userRole === "Specialist" && userId) {
            const all = await db.query.requests.findMany({
                orderBy: [desc(requests.createdAt)],
            });
            return all.filter(r =>
                r.creatorId === userId ||
                r.assignedSpecialistId === userId ||
                (r.assignedSpecialistIds && (r.assignedSpecialistIds as string[]).includes(userId))
            );
        }

        if (!userId) return [];

        // Default: own requests
        return await db.query.requests.findMany({
            where: eq(requests.creatorId, userId),
            orderBy: [desc(requests.createdAt)],
        });

    } catch (error) {
        log.error("Failed to fetch requests", {}, error);
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
                log.info("Creator not found, creating placeholder", { action: "addRequest", userId: sanitizedData.creatorId });
                await db.insert(users).values({
                    id: sanitizedData.creatorId,
                    name: "Guest User",
                    email: `${sanitizedData.creatorId}@placeholder.com`,
                    role: "Guest",
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
        log.error("Failed to add request details", {}, error);
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
        log.error("Failed to invite user", {}, error);
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
        log.error("Failed to request access", {}, error);
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
        log.error("Failed to approve user", {}, error);
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
        log.error("Failed to get company users", {}, e);
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
        log.error("Failed to update request", {}, error);
        throw new Error("Failed to update request");
    }
}

// --- User Actions ---

export async function getUser(id: string) {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user || null;
    } catch (error) {
        log.error("Failed to get user", {}, error);
        return null;
    }
}

export async function getRequestCreator(creatorId: string) {
    if (!creatorId) return null;
    try {
        const dbUser = await getUser(creatorId);
        if (dbUser) return dbUser;

        // Fallback: try lookup by email
        if (creatorId.includes("@")) {
            const [userByEmail] = await db.select().from(users).where(eq(users.email, creatorId));
            if (userByEmail) return userByEmail;

            const emailPrefix = creatorId.split('@')[0];
            let name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            return { id: creatorId, name, role: "Guest" };
        }

        return {
            id: creatorId,
            name: creatorId.charAt(0).toUpperCase() + creatorId.slice(1),
            role: "Guest"
        };
    } catch (error) {
        log.error("Failed to get request creator", {}, error);
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
        log.error("Failed to fetch user with profile", {}, error);
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
    log.info("Profile update started", { action: "updateUserProfile", userId });

    try {
        const { workExperience: workData, education: eduData, ...userData } = data;

        const existingUser = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!existingUser) {
            log.info("User not found, creating placeholder", { action: "updateUserProfile", userId });
            try {
                await db.insert(users).values({
                    id: userId,
                    name: userData.name || "Guest User",
                    email: `${userId}@placeholder.com`,
                    role: "Guest",
                }).onConflictDoNothing();
            } catch (creationError) {
                log.error("Failed to create placeholder user", { action: "updateUserProfile", userId }, creationError);
                throw new Error("Failed to initialize user record.");
            }
        }

        await db.transaction(async (tx) => {
            if (Object.keys(userData).length > 0) {
                log.info("Updating user fields", { action: "updateUserProfile", userId });
                await tx.update(users)
                    .set(userData as any)
                    .where(eq(users.id, userId));
            }

            if (workData) {
                log.info("Updating work experience", { action: "updateUserProfile", userId });
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
                log.info("Updating education", { action: "updateUserProfile", userId });
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

        log.info("Profile update completed", { action: "updateUserProfile", userId });

        revalidatePath("/account");
        revalidatePath(`/profile/${userId}`);
        revalidatePath("/profile");
        revalidatePath("/talent");

        return { success: true, user: updated };
    } catch (error: any) {
        log.error("Profile update failed", { action: "updateUserProfile", userId }, error);

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
        log.error("Failed to update user role", {}, error);
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
        log.error("Failed to search users", {}, error);
        return [];
    }
}

// --- Specialist Actions ---

export async function getSpecialists(): Promise<Specialist[]> {
    try {
        const specialistUsers = await db.select().from(users)
            .where(and(
                eq(users.role, "Specialist"),
                eq(users.approvalStatus, "APPROVED")
            ));
        return specialistUsers.map(dbUserToSpecialist);
    } catch (error) {
        log.error("Failed to fetch specialists", {}, error);
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
        log.error("Failed to fetch projects", {}, error);
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
        log.error("Failed to add project", {}, error);
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
        log.error("Failed to update project", {}, error);
        throw new Error("Failed to update project");
    }
}

export async function deleteProject(id: string) {
    try {
        await db.delete(projects).where(eq(projects.id, id));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to delete project", {}, error);
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
        log.error("Failed to get company", {}, error);
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
        log.error("Failed to get project views", {}, error);
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
        log.error("Failed to create project view", {}, error);
        throw new Error("Failed to create view");
    }
}

export async function deleteProjectView(viewId: string) {
    try {
        await db.delete(projectViews).where(eq(projectViews.id, viewId));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to delete project view", {}, error);
        throw new Error("Failed to delete view");
    }
}

export async function updateProjectView(viewId: string, data: any) {
    try {
        await db.update(projectViews).set({ data }).where(eq(projectViews.id, viewId));
        revalidatePath("/it-planner");
    } catch (error) {
        log.error("Failed to update project view", {}, error);
        throw new Error("Failed to update view");
    }
}

// --- Chat & Notifications ---

export async function getConversations(userId: string) {
    try {
        // Get conversation IDs where user is a participant
        const participantRows = await db.query.conversationParticipants.findMany({
            where: eq(conversationParticipants.userId, userId),
        });
        const conversationIds = participantRows.map(p => p.conversationId);
        if (conversationIds.length === 0) return [];

        // Get all conversations with participants and messages
        const convos = await db.query.conversations.findMany({
            where: inArray(conversations.id, conversationIds),
            with: {
                participants: {
                    with: {
                        user: true,
                    },
                },
                messages: {
                    orderBy: [desc(messages.createdAt)],
                    limit: 1,
                },
            },
            orderBy: [desc(conversations.updatedAt)],
        });

        // Look up request titles for request-type conversations
        const requestIds = convos
            .filter(c => c.type === "request" && c.requestId)
            .map(c => c.requestId!);

        let requestMap: Record<string, string> = {};
        if (requestIds.length > 0) {
            const reqs = await db.query.requests.findMany({
                where: inArray(requests.id, requestIds),
                columns: { id: true, title: true },
            });
            requestMap = Object.fromEntries(reqs.map(r => [r.id, r.title]));
        }

        return convos.map(c => ({
            id: c.id,
            type: c.type,
            title: c.title,
            requestId: c.requestId,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
            participants: c.participants.map(p => ({
                id: p.user?.id || p.userId,
                name: p.user?.name || "Unknown",
                avatar: p.user?.avatar || undefined,
            })),
            lastMessage: c.messages[0] ? {
                id: c.messages[0].id,
                conversationId: c.messages[0].conversationId,
                senderId: c.messages[0].senderId,
                text: c.messages[0].text,
                createdAt: c.messages[0].createdAt.toISOString(),
                readBy: c.messages[0].readBy || [],
            } : undefined,
            unreadCount: c.messages[0] && !(c.messages[0].readBy || []).includes(userId) && c.messages[0].senderId !== userId ? 1 : 0,
            requestTitle: c.requestId ? requestMap[c.requestId] : undefined,
        }));
    } catch (error) {
        log.error("Failed to get conversations", {}, error);
        return [];
    }
}

export async function getMessages(conversationId: string) {
    try {
        const msgs = await db.query.messages.findMany({
            where: eq(messages.conversationId, conversationId),
            with: {
                sender: true,
            },
            orderBy: [messages.createdAt],
        });
        return msgs.map(m => ({
            id: m.id,
            conversationId: m.conversationId,
            senderId: m.senderId,
            senderName: m.sender?.name || "Unknown",
            text: m.text,
            createdAt: m.createdAt.toISOString(),
            readBy: m.readBy || [],
        }));
    } catch (error) {
        log.error("Failed to get messages", {}, error);
        return [];
    }
}

export async function sendMessage(conversationId: string, senderId: string, text: string, senderName?: string) {
    try {
        const [msg] = await db.insert(messages).values({
            conversationId,
            senderId,
            text,
            readBy: [senderId],
        }).returning();

        // Update conversation timestamp
        await db.update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, conversationId));

        // Create notifications for other participants
        const participantRows = await db.query.conversationParticipants.findMany({
            where: eq(conversationParticipants.conversationId, conversationId),
        });

        const otherParticipants = participantRows.filter(p => p.userId !== senderId);
        for (const p of otherParticipants) {
            await db.insert(notifications).values({
                userId: p.userId,
                type: "message",
                title: `New message from ${senderName || "someone"}`,
                body: text.length > 80 ? text.substring(0, 80) + "..." : text,
                relatedId: conversationId,
            });
        }

        revalidatePath("/board");
        return {
            id: msg.id,
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            senderName: senderName || "Unknown",
            text: msg.text,
            createdAt: msg.createdAt.toISOString(),
            readBy: msg.readBy || [],
        };
    } catch (error) {
        log.error("Failed to send message", {}, error);
        throw new Error("Failed to send message");
    }
}

export async function createConversation(
    type: "direct" | "group" | "request",
    participantIds: string[],
    title?: string,
    requestId?: string
) {
    try {
        // For direct conversations, check if one already exists between these two users
        if (type === "direct" && participantIds.length === 2) {
            const existing = await findExistingDirectConversation(participantIds[0], participantIds[1]);
            if (existing) return existing;
        }

        const [convo] = await db.insert(conversations).values({
            type,
            title: title || null,
            requestId: requestId || null,
        }).returning();

        // Add participants
        for (const userId of participantIds) {
            await db.insert(conversationParticipants).values({
                conversationId: convo.id,
                userId,
            });
        }

        revalidatePath("/board");
        return {
            id: convo.id,
            type: convo.type,
            title: convo.title,
            requestId: convo.requestId,
            createdAt: convo.createdAt.toISOString(),
            updatedAt: convo.updatedAt.toISOString(),
        };
    } catch (error) {
        log.error("Failed to create conversation", {}, error);
        throw new Error("Failed to create conversation");
    }
}

export async function addParticipantToConversation(conversationId: string, userId: string) {
    try {
        // Check if already a participant
        const existing = await db.query.conversationParticipants.findFirst({
            where: (cp, { and, eq }) => and(
                eq(cp.conversationId, conversationId),
                eq(cp.userId, userId)
            ),
        });
        if (existing) return { success: true, alreadyExists: true };

        await db.insert(conversationParticipants).values({
            conversationId,
            userId,
        });

        // If the conversation was "direct", upgrade it to "group"
        const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
        if (convo && convo.type === "direct") {
            await db.update(conversations)
                .set({ type: "group" })
                .where(eq(conversations.id, conversationId));
        }

        revalidatePath("/board");
        return { success: true, alreadyExists: false };
    } catch (error) {
        log.error("Failed to add participant", {}, error);
        throw new Error("Failed to add participant");
    }
}

async function findExistingDirectConversation(userId1: string, userId2: string) {
    const user1Convos = await db.query.conversationParticipants.findMany({
        where: eq(conversationParticipants.userId, userId1),
    });
    const user2Convos = await db.query.conversationParticipants.findMany({
        where: eq(conversationParticipants.userId, userId2),
    });

    const user1ConvoIds = new Set(user1Convos.map(p => p.conversationId));
    const sharedConvoIds = user2Convos.filter(p => user1ConvoIds.has(p.conversationId)).map(p => p.conversationId);

    if (sharedConvoIds.length === 0) return null;

    for (const convoId of sharedConvoIds) {
        const convo = await db.query.conversations.findFirst({
            where: and(eq(conversations.id, convoId), eq(conversations.type, "direct")),
        });
        if (convo) {
            return {
                id: convo.id,
                type: convo.type,
                title: convo.title,
                requestId: convo.requestId,
                createdAt: convo.createdAt.toISOString(),
                updatedAt: convo.updatedAt.toISOString(),
            };
        }
    }
    return null;
}

export async function markMessagesRead(conversationId: string, userId: string) {
    try {
        const unreadMsgs = await db.query.messages.findMany({
            where: eq(messages.conversationId, conversationId),
        });

        for (const msg of unreadMsgs) {
            if (!(msg.readBy || []).includes(userId)) {
                await db.update(messages)
                    .set({ readBy: [...(msg.readBy || []), userId] })
                    .where(eq(messages.id, msg.id));
            }
        }
    } catch (error) {
        log.error("Failed to mark messages as read", {}, error);
    }
}

export async function getOrCreateRequestConversation(requestId: string, participantIds: string[]) {
    try {
        // Check if a conversation already exists for this request
        const existing = await db.query.conversations.findFirst({
            where: and(eq(conversations.type, "request"), eq(conversations.requestId, requestId)),
        });
        if (existing) {
            // Ensure all participants are added
            for (const userId of participantIds) {
                const existingParticipant = await db.query.conversationParticipants.findFirst({
                    where: and(
                        eq(conversationParticipants.conversationId, existing.id),
                        eq(conversationParticipants.userId, userId)
                    ),
                });
                if (!existingParticipant) {
                    await db.insert(conversationParticipants).values({
                        conversationId: existing.id,
                        userId,
                    });
                }
            }
            return {
                id: existing.id,
                type: existing.type,
                title: existing.title,
                requestId: existing.requestId,
                createdAt: existing.createdAt.toISOString(),
                updatedAt: existing.updatedAt.toISOString(),
            };
        }
        // Create new
        return await createConversation("request", participantIds, undefined, requestId);
    } catch (error) {
        log.error("Failed to get/create request conversation", {}, error);
        throw error;
    }
}

export async function getNotifications(userId: string) {
    try {
        const notifs = await db.query.notifications.findMany({
            where: eq(notifications.userId, userId),
            orderBy: [desc(notifications.createdAt)],
            limit: 50,
        });
        return notifs.map(n => ({
            id: n.id,
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            relatedId: n.relatedId,
            isRead: n.isRead,
            createdAt: n.createdAt.toISOString(),
        }));
    } catch (error) {
        log.error("Failed to get notifications", {}, error);
        return [];
    }
}

export async function markNotificationRead(notificationId: string) {
    try {
        await db.update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.id, notificationId));
    } catch (error) {
        log.error("Failed to mark notification as read", {}, error);
    }
}

export async function markAllNotificationsRead(userId: string) {
    try {
        await db.update(notifications)
            .set({ isRead: true })
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    } catch (error) {
        log.error("Failed to mark all notifications as read", {}, error);
    }
}

export async function createNotification(
    userId: string,
    type: string,
    title: string,
    body?: string,
    relatedId?: string
) {
    try {
        await db.insert(notifications).values({
            userId,
            type,
            title,
            body: body || null,
            relatedId: relatedId || null,
        });
    } catch (error) {
        log.error("Failed to create notification", {}, error);
    }
}

export async function getAllUsers() {
    try {
        const allUsers = await db.query.users.findMany();
        return allUsers.map(u => ({
            id: u.id,
            name: u.name || "Unknown",
            email: u.email,
            role: u.role,
            avatar: u.avatar,
        }));
    } catch (error) {
        log.error("Failed to get all users", {}, error);
        return [];
    }
}

// ============================================================
// Phase 1: Request Activity Log
// ============================================================

export async function logRequestActivity(
    requestId: string,
    userId: string,
    userName: string,
    action: string,
    details: Record<string, any> = {}
) {
    try {
        await db.insert(requestActivity).values({
            requestId,
            userId,
            userName,
            action,
            details,
        });
    } catch (error) {
        log.error("Failed to log request activity", { action: "logRequestActivity", requestId, userId }, error);
    }
}

export async function getRequestActivity(requestId: string) {
    try {
        return await db.query.requestActivity.findMany({
            where: eq(requestActivity.requestId, requestId),
            orderBy: [desc(requestActivity.createdAt)],
        });
    } catch (error) {
        log.error("Failed to get request activity", { action: "getRequestActivity", requestId }, error);
        return [];
    }
}

// ============================================================
// Phase 2: Specialist Matching & Criteria Flow
// ============================================================

export async function assignSpecialist(requestId: string, specialistId: string) {
    try {
        const session = await auth();
        const adminName = session?.user?.name || "Admin";
        const adminId = session?.user?.id || "system";

        // Get specialist info
        const [specialist] = await db.select().from(users).where(eq(users.id, specialistId));
        if (!specialist) throw new Error("Specialist not found");

        // Get current request to check existing specialists
        const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
        if (!request) throw new Error("Request not found");

        const currentIds: string[] = (request.assignedSpecialistIds as string[]) || [];

        // Already assigned?
        if (currentIds.includes(specialistId)) {
            return { error: "Specialist is already assigned to this request" };
        }

        // Enforce max 3 specialists
        if (currentIds.length >= 3) {
            return { error: "Maximum 3 specialists can be assigned to a request" };
        }

        const updatedIds = [...currentIds, specialistId];

        // Update request — set primary + array
        await db.update(requests).set({
            assignedSpecialistId: updatedIds[0], // primary is first
            assignedSpecialistIds: updatedIds,
            status: request.status === "New" || request.status === "Submitted for Review" ? "Active Efforts" : request.status,
        }).where(eq(requests.id, requestId));

        // Notify specialist — new opportunity
        await db.insert(notifications).values({
            userId: specialistId,
            type: "opportunity",
            title: "New Opportunity Assigned",
            body: `You've been matched to: "${request?.title || "a request"}". Review the details and acceptance criteria.`,
            relatedId: requestId,
        });

        // Log activity
        await logRequestActivity(requestId, adminId, adminName, "specialist_assigned", {
            specialistId,
            specialistName: specialist.name,
        });

        revalidatePath(`/requests/${requestId}`);
        revalidatePath("/board");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        log.error("Failed to assign specialist", { action: "assignSpecialist", requestId }, error);
        return { error: "Failed to assign specialist" };
    }
}

export async function removeSpecialist(requestId: string, specialistId: string) {
    try {
        const session = await auth();
        const adminName = session?.user?.name || "Admin";
        const adminId = session?.user?.id || "system";

        const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
        if (!request) throw new Error("Request not found");

        const currentIds: string[] = (request.assignedSpecialistIds as string[]) || [];
        const updatedIds = currentIds.filter(id => id !== specialistId);

        await db.update(requests).set({
            assignedSpecialistId: updatedIds[0] || null,
            assignedSpecialistIds: updatedIds,
        }).where(eq(requests.id, requestId));

        // Get specialist name for log
        const [specialist] = await db.select().from(users).where(eq(users.id, specialistId));

        await logRequestActivity(requestId, adminId, adminName, "specialist_removed", {
            specialistId,
            specialistName: specialist?.name || "Unknown",
        });

        revalidatePath(`/requests/${requestId}`);
        revalidatePath("/board");
        return { success: true };
    } catch (error) {
        log.error("Failed to remove specialist", { action: "removeSpecialist", requestId }, error);
        return { error: "Failed to remove specialist" };
    }
}

export async function proposeAcceptanceCriteria(requestId: string, criteria: string[]) {
    try {
        const session = await auth();
        const userName = session?.user?.name || "Unknown";
        const userId = session?.user?.id || "system";

        await db.update(requests).set({
            acceptanceCriteria: criteria,
            acStatus: "Proposed",
            actionNeeded: true,
        }).where(eq(requests.id, requestId));

        // Get request creator to notify them
        const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
        if (request?.creatorId) {
            await db.insert(notifications).values({
                userId: request.creatorId,
                type: "status_change",
                title: "Criteria Proposed for Review",
                body: `Acceptance criteria have been proposed for "${request.title}". Please review and approve.`,
                relatedId: requestId,
            });
        }

        await logRequestActivity(requestId, userId, userName, "criteria_proposed", { criteria });
        revalidatePath(`/requests/${requestId}`);
        revalidatePath("/board");
        return { success: true };
    } catch (error) {
        log.error("Failed to propose criteria", { action: "proposeAcceptanceCriteria", requestId }, error);
        return { error: "Failed to propose criteria" };
    }
}

export async function approveAcceptanceCriteria(requestId: string) {
    try {
        const session = await auth();
        const userName = session?.user?.name || "Unknown";
        const userId = session?.user?.id || "system";

        await db.update(requests).set({
            acStatus: "Agreed",
            status: "Scope Approved",
            actionNeeded: false,
        }).where(eq(requests.id, requestId));

        // Notify admin
        const adminUsers = await db.select().from(users).where(eq(users.role, "Admin"));
        for (const admin of adminUsers) {
            await db.insert(notifications).values({
                userId: admin.id,
                type: "status_change",
                title: "Criteria Approved",
                body: `${userName} approved the acceptance criteria for request. Ready for specialist matching.`,
                relatedId: requestId,
            });
        }

        await logRequestActivity(requestId, userId, userName, "criteria_approved", {});
        revalidatePath(`/requests/${requestId}`);
        revalidatePath("/board");
        return { success: true };
    } catch (error) {
        log.error("Failed to approve criteria", { action: "approveAcceptanceCriteria", requestId }, error);
        return { error: "Failed to approve criteria" };
    }
}

// Enhanced addRequest with activity logging
export async function addRequestWithActivity(data: any) {
    try {
        const session = await auth();
        const userName = session?.user?.name || "Unknown";
        const userId = session?.user?.id || data.creatorId || "system";

        // Use existing addRequest
        const result = await addRequest(data);

        if (result?.id) {
            await logRequestActivity(result.id, userId, userName, "created", {
                title: data.title,
                requestType: data.requestType,
            });

            // Notify admins
            const adminUsers = await db.select().from(users).where(eq(users.role, "Admin"));
            for (const admin of adminUsers) {
                await db.insert(notifications).values({
                    userId: admin.id,
                    type: "assignment",
                    title: "New Request Created",
                    body: `${userName} created: "${data.title}". Review and assign a specialist.`,
                    relatedId: result.id,
                });
            }
        }

        return result;
    } catch (error) {
        log.error("Failed to add request with activity", {}, error);
        throw error;
    }
}

// Enhanced updateRequest with activity logging
export async function updateRequestWithActivity(id: string, data: any, changeDescription?: string) {
    try {
        const session = await auth();
        const userName = session?.user?.name || "Unknown";
        const userId = session?.user?.id || "system";

        // Get old state for diff
        const [oldRequest] = await db.select().from(requests).where(eq(requests.id, id));

        const result = await updateRequest(id, data);

        if (result) {
            const details: Record<string, any> = {};
            if (data.status && oldRequest?.status !== data.status) {
                details.oldStatus = oldRequest?.status;
                details.newStatus = data.status;
            }
            if (changeDescription) details.description = changeDescription;

            await logRequestActivity(id, userId, userName, data.status ? "status_changed" : "updated", details);

            // Notify relevant parties on status change
            if (data.status && oldRequest?.status !== data.status) {
                const notifyIds = new Set<string>();
                if (oldRequest?.creatorId) notifyIds.add(oldRequest.creatorId);
                if (oldRequest?.assignedSpecialistId) notifyIds.add(oldRequest.assignedSpecialistId);
                notifyIds.delete(userId); // Don't notify yourself

                for (const nId of notifyIds) {
                    await db.insert(notifications).values({
                        userId: nId,
                        type: "status_change",
                        title: `Request Status Updated`,
                        body: `"${oldRequest?.title}" moved from ${oldRequest?.status} to ${data.status}.`,
                        relatedId: id,
                    });
                }
            }
        }

        return result;
    } catch (error) {
        log.error("Failed to update request with activity", { requestId: id }, error);
        throw error;
    }
}

// ============================================================
// Phase 3: Terms & Payment Agreement
// ============================================================

export async function proposeTerms(requestId: string, terms: { rate: string; duration: string }) {
    try {
        const session = await auth();
        const userName = session?.user?.name || "Unknown";
        const userId = session?.user?.id || "system";

        await db.update(requests).set({
            agreedRate: terms.rate,
            agreedDuration: terms.duration,
            paymentStatus: "terms_proposed",
            termsAcceptedByCustomer: false,
            termsAcceptedBySpecialist: false,
        }).where(eq(requests.id, requestId));

        // Get request to notify parties
        const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
        const notifyIds = new Set<string>();
        if (request?.creatorId) notifyIds.add(request.creatorId);
        if (request?.assignedSpecialistId) notifyIds.add(request.assignedSpecialistId);
        notifyIds.delete(userId);

        for (const nId of notifyIds) {
            await db.insert(notifications).values({
                userId: nId,
                type: "terms",
                title: "Terms Proposed",
                body: `Terms proposed for "${request?.title}": ${terms.rate}, ${terms.duration}. Please review and accept.`,
                relatedId: requestId,
            });
        }

        await logRequestActivity(requestId, userId, userName, "terms_proposed", terms);
        revalidatePath(`/requests/${requestId}`);
        return { success: true };
    } catch (error) {
        log.error("Failed to propose terms", { requestId }, error);
        return { error: "Failed to propose terms" };
    }
}

export async function acceptTerms(requestId: string, role: "customer" | "specialist") {
    try {
        const session = await auth();
        const userName = session?.user?.name || "Unknown";
        const userId = session?.user?.id || "system";

        const field = role === "customer" ? "termsAcceptedByCustomer" : "termsAcceptedBySpecialist";
        await db.update(requests).set({ [field]: true }).where(eq(requests.id, requestId));

        // Check if both accepted
        const [updated] = await db.select().from(requests).where(eq(requests.id, requestId));
        if (updated?.termsAcceptedByCustomer && updated?.termsAcceptedBySpecialist) {
            await db.update(requests).set({
                paymentStatus: "agreed",
                status: "Active Efforts",
            }).where(eq(requests.id, requestId));

            await logRequestActivity(requestId, userId, userName, "terms_accepted", {
                bothAccepted: true,
                rate: updated.agreedRate,
                duration: updated.agreedDuration,
            });
        } else {
            await logRequestActivity(requestId, userId, userName, "terms_accepted", { role });
        }

        revalidatePath(`/requests/${requestId}`);
        return { success: true };
    } catch (error) {
        log.error("Failed to accept terms", { requestId }, error);
        return { error: "Failed to accept terms" };
    }
}

// ============================================================
// Phase 4: Calendar / Events
// ============================================================

export async function createEvent(data: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    requestId?: string;
    attendees: string[];
    location?: string;
    type?: string;
    videoMeeting?: boolean;
    agenda?: string;
    audience?: string;
    recurring?: string;
}) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        const userName = session?.user?.name || "Unknown";
        if (!userId) throw new Error("Not authenticated");

        let meetingUrl: string | undefined;
        let meetingId: string | undefined;

        // Generate Teams meeting link if video meeting requested
        if (data.videoMeeting && data.type === "meeting") {
            const { createTeamsMeeting } = await import("./teams");
            // Get attendee emails for Teams
            const attendeeUsers = data.attendees.length > 0
                ? await db.select({ email: users.email }).from(users).where(inArray(users.id, data.attendees))
                : [];
            const emails = attendeeUsers.map(u => u.email).filter(Boolean) as string[];
            const meeting = await createTeamsMeeting(data.title, data.startTime, data.endTime, emails);
            meetingUrl = meeting.joinUrl;
            meetingId = meeting.meetingId;
        }

        const audience = data.audience || "private";
        const recurring = data.recurring || "none";

        const [newEvent] = await db.insert(events).values({
            title: data.title,
            description: data.description,
            startTime: new Date(data.startTime),
            endTime: new Date(data.endTime),
            requestId: data.requestId,
            createdBy: userId,
            attendees: data.attendees,
            location: data.videoMeeting ? (meetingUrl || "Video Meeting") : data.location,
            type: data.type || "meeting",
            audience,
            recurring,
            agenda: data.agenda,
            meetingUrl,
            meetingId,
            meetingStatus: data.videoMeeting ? "scheduled" : "scheduled",
        }).returning();

        // Build notification body
        const recurringLabel = recurring !== "none" ? ` (Recurring: ${recurring})` : "";
        const audienceLabel = audience === "open" ? " 🌍 Open to all" : audience === "team" ? " 👥 Team" : " 🔒 Private";

        // Notify attendees
        for (const attendeeId of data.attendees) {
            if (attendeeId !== userId) {
                await db.insert(notifications).values({
                    userId: attendeeId,
                    type: "assignment",
                    title: data.videoMeeting ? "Video Meeting Scheduled" : "New Event Scheduled",
                    body: `${userName} invited you to: "${data.title}" on ${new Date(data.startTime).toLocaleDateString()}.${audienceLabel}${recurringLabel}${meetingUrl ? " A video meeting link is included." : ""}`,
                    relatedId: newEvent.id,
                });
            }
        }

        // If audience is open, notify all users who aren't already attendees
        if (audience === "open") {
            const allUsersList = await db.select({ id: users.id }).from(users);
            const notifyIds = allUsersList.map(u => u.id).filter(id => id !== userId && !data.attendees.includes(id));
            for (const uid of notifyIds) {
                await db.insert(notifications).values({
                    userId: uid,
                    type: "info",
                    title: "Open Event Available",
                    body: `${userName} created an open event: "${data.title}" on ${new Date(data.startTime).toLocaleDateString()}.${recurringLabel} Anyone can join!`,
                    relatedId: newEvent.id,
                });
            }
        }

        // Log activity if linked to request
        if (data.requestId) {
            await logRequestActivity(data.requestId, userId, userName, "meeting_scheduled", {
                eventId: newEvent.id,
                title: data.title,
                startTime: data.startTime,
                videoMeeting: data.videoMeeting,
            });
        }

        revalidatePath("/calendar");
        return newEvent;
    } catch (error) {
        log.error("Failed to create event", {}, error);
        throw new Error("Failed to create event");
    }
}

export async function updateMeetingNotes(eventId: string, data: { agenda?: string; meetingNotes?: string }) {
    try {
        await db.update(events).set({
            ...(data.agenda !== undefined && { agenda: data.agenda }),
            ...(data.meetingNotes !== undefined && { meetingNotes: data.meetingNotes }),
        }).where(eq(events.id, eventId));
        revalidatePath("/calendar");
        return { success: true };
    } catch (error) {
        log.error("Failed to update meeting notes", { eventId }, error);
        return { error: "Failed to update notes" };
    }
}

export async function completeMeeting(eventId: string) {
    try {
        // Mark meeting as completed
        await db.update(events).set({ meetingStatus: "completed" }).where(eq(events.id, eventId));

        // Try to fetch transcript from Teams
        const [event] = await db.select().from(events).where(eq(events.id, eventId));
        if (event?.meetingId) {
            const { getMeetingTranscript, getMeetingRecordingStatus } = await import("./teams");
            const transcript = await getMeetingTranscript(event.meetingId);
            const hasRecording = await getMeetingRecordingStatus(event.meetingId);

            await db.update(events).set({
                transcript: transcript || undefined,
                hasRecording,
            }).where(eq(events.id, eventId));
        }

        revalidatePath("/calendar");
        return { success: true };
    } catch (error) {
        log.error("Failed to complete meeting", { eventId }, error);
        return { error: "Failed to complete meeting" };
    }
}

export async function processMeetingNotes(eventId: string) {
    try {
        const [event] = await db.select().from(events).where(eq(events.id, eventId));
        if (!event) throw new Error("Event not found");

        // Gather all text: transcript + manual notes + agenda
        const textParts: string[] = [];
        if (event.agenda) textParts.push(`AGENDA:\n${event.agenda}`);
        if (event.transcript) textParts.push(`TRANSCRIPT:\n${event.transcript}`);
        if (event.meetingNotes) textParts.push(`MANUAL NOTES:\n${event.meetingNotes}`);

        if (textParts.length === 0) {
            return { error: "No notes or transcript to process" };
        }

        const combinedText = textParts.join("\n\n---\n\n");

        // Get attendee names for context
        const attendeeNames = event.attendees.length > 0
            ? (await db.select({ name: users.name }).from(users).where(inArray(users.id, event.attendees))).map(u => u.name)
            : [];

        const prompt = `You are an AI meeting assistant. Analyze the following meeting content for "${event.title}".
Attendees: ${attendeeNames.join(", ") || "Unknown"}
Date: ${new Date(event.startTime).toLocaleDateString()}

${combinedText}

Provide your response in the following JSON format (no markdown, just raw JSON):
{
  "summary": "A concise 2-4 sentence summary of the key discussion points and decisions made.",
  "actionItems": [
    { "text": "Description of what needs to be done", "assignee": "Person's name or null", "dueDate": "YYYY-MM-DD or null" }
  ],
  "nextSteps": "1-2 sentences suggesting what should happen next based on the meeting outcome."
}`;

        // Call Gemini
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            // Mock AI response
            const mockSummary = `Meeting "${event.title}" covered project updates and next steps. Key decisions were made regarding timeline and resource allocation. Follow-up actions were assigned to team members.`;
            const mockItems = [
                { text: "Review project timeline and update milestones", assignee: attendeeNames[0] || undefined, dueDate: undefined },
                { text: "Prepare status report for next meeting", assignee: attendeeNames[1] || undefined, dueDate: undefined },
            ];

            await db.update(events).set({
                aiSummary: mockSummary + "\n\nNext steps: Schedule a follow-up meeting to review progress on action items.",
                aiActionItems: mockItems,
            }).where(eq(events.id, eventId));

            revalidatePath("/calendar");
            return { success: true, summary: mockSummary, actionItems: mockItems };
        }

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3 },
                }),
            }
        );

        const geminiData = await geminiRes.json();
        const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Parse JSON response (handle possible markdown wrapping)
        const jsonStr = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            parsed = { summary: responseText, actionItems: [], nextSteps: "" };
        }

        const fullSummary = parsed.nextSteps
            ? `${parsed.summary}\n\nNext steps: ${parsed.nextSteps}`
            : parsed.summary;

        await db.update(events).set({
            aiSummary: fullSummary,
            aiActionItems: parsed.actionItems || [],
        }).where(eq(events.id, eventId));

        revalidatePath("/calendar");
        return { success: true, summary: fullSummary, actionItems: parsed.actionItems };
    } catch (error) {
        log.error("Failed to process meeting notes", { eventId }, error);
        return { error: "Failed to process meeting notes" };
    }
}

export async function getEvents(userId?: string) {
    try {
        const allEvents = await db.select({
            id: events.id,
            title: events.title,
            description: events.description,
            startTime: events.startTime,
            endTime: events.endTime,
            requestId: events.requestId,
            createdBy: events.createdBy,
            attendees: events.attendees,
            location: events.location,
            type: events.type,
            audience: events.audience,
            recurring: events.recurring,
            createdAt: events.createdAt,
            meetingUrl: events.meetingUrl,
            meetingId: events.meetingId,
            hasRecording: events.hasRecording,
            transcript: events.transcript,
            aiSummary: events.aiSummary,
            aiActionItems: events.aiActionItems,
            agenda: events.agenda,
            meetingNotes: events.meetingNotes,
            meetingStatus: events.meetingStatus,
            creatorName: users.name,
        }).from(events)
            .leftJoin(users, eq(events.createdBy, users.id))
            .orderBy(desc(events.startTime));

        if (userId) {
            return allEvents.filter(e =>
                e.createdBy === userId ||
                e.attendees.includes(userId) ||
                e.audience === "open"
            );
        }
        return allEvents;
    } catch (error) {
        log.error("Failed to get events", {}, error);
        return [];
    }
}

export async function updateEvent(id: string, data: any) {
    try {
        const [updated] = await db.update(events).set(data).where(eq(events.id, id)).returning();
        revalidatePath("/calendar");
        return updated;
    } catch (error) {
        log.error("Failed to update event", { eventId: id }, error);
        throw new Error("Failed to update event");
    }
}

export async function deleteEvent(id: string) {
    try {
        await db.delete(events).where(eq(events.id, id));
        revalidatePath("/calendar");
    } catch (error) {
        log.error("Failed to delete event", { eventId: id }, error);
        throw new Error("Failed to delete event");
    }
}

// --- Intelboard Forums ---

export async function createIntelboard(data: {
    title: string;
    description?: string;
    category?: string;
    visibility?: string;
    invitedRoles?: string[];
    memberIds?: string[];
}) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        const userName = session?.user?.name || "Unknown";
        if (!userId) throw new Error("Not authenticated");

        const [board] = await db.insert(intelboards).values({
            title: data.title,
            description: data.description,
            category: data.category,
            visibility: data.visibility || "open",
            invitedRoles: data.invitedRoles || [],
            memberIds: [...new Set([...(data.memberIds || []), userId])],
            createdBy: userId,
        }).returning();

        for (const memberId of (data.memberIds || [])) {
            if (memberId !== userId) {
                await db.insert(notifications).values({
                    userId: memberId,
                    type: "assignment",
                    title: "Invited to Intelboard",
                    body: `${userName} invited you to "${data.title}".`,
                    relatedId: board.id,
                });
            }
        }

        revalidatePath("/intelboards");
        return board;
    } catch (error) {
        log.error("Failed to create intelboard", {}, error);
        throw new Error("Failed to create intelboard");
    }
}

export async function getIntelboards() {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        const userRole = session?.user?.role || "Guest";

        const allBoards = await db.select().from(intelboards)
            .where(eq(intelboards.status, "active"))
            .orderBy(desc(intelboards.createdAt));

        return allBoards.filter(b => {
            if (b.visibility === "open") return true;
            if (b.memberIds.includes(userId || "")) return true;
            if (b.invitedRoles.includes(userRole)) return true;
            if (b.createdBy === userId) return true;
            return false;
        });
    } catch (error) {
        log.error("Failed to get intelboards", {}, error);
        return [];
    }
}

export async function getIntelboard(id: string) {
    try {
        const [board] = await db.select().from(intelboards).where(eq(intelboards.id, id));
        if (!board) return null;

        const threads = await db.select().from(intelboardThreads)
            .where(eq(intelboardThreads.intelboardId, id))
            .orderBy(desc(intelboardThreads.lastActivityAt));

        const threadIds = threads.map(t => t.id);
        const posts = threadIds.length > 0
            ? await db.select().from(intelboardPosts).where(inArray(intelboardPosts.threadId, threadIds))
            : [];
        const hubs = await db.select().from(intelboardHubs)
            .where(eq(intelboardHubs.intelboardId, id))
            .orderBy(desc(intelboardHubs.createdAt));

        const memberUsers = board.memberIds.length > 0
            ? await db.select({ id: users.id, name: users.name, avatar: users.avatar, role: users.role })
                .from(users).where(inArray(users.id, board.memberIds))
            : [];

        const [creator] = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
            .from(users).where(eq(users.id, board.createdBy));

        const threadsWithCounts = threads.map(t => ({
            ...t,
            postCount: posts.filter(p => p.threadId === t.id).length,
            hubCount: hubs.filter(h => h.threadId === t.id).length,
            lastPost: posts.filter(p => p.threadId === t.id).sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0] || null,
        }));

        return {
            ...board,
            threads: threadsWithCounts,
            hubs,
            members: memberUsers,
            creator,
            totalPosts: posts.length,
        };
    } catch (error) {
        log.error("Failed to get intelboard", { id }, error);
        return null;
    }
}

export async function joinIntelboard(id: string) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Not authenticated");

        const [board] = await db.select().from(intelboards).where(eq(intelboards.id, id));
        if (!board) throw new Error("Intelboard not found");
        if (board.visibility !== "open") throw new Error("Cannot join invite-only board");

        const updatedMembers = [...new Set([...board.memberIds, userId])];
        await db.update(intelboards).set({ memberIds: updatedMembers }).where(eq(intelboards.id, id));

        revalidatePath("/intelboards");
        return { success: true };
    } catch (error) {
        log.error("Failed to join intelboard", { id }, error);
        return { error: "Failed to join" };
    }
}

export async function createThread(intelboardId: string, title: string, description?: string) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        const userName = session?.user?.name || "Unknown";
        if (!userId) throw new Error("Not authenticated");

        const [thread] = await db.insert(intelboardThreads).values({
            intelboardId,
            title,
            description,
            createdBy: userId,
        }).returning();

        const [board] = await db.select().from(intelboards).where(eq(intelboards.id, intelboardId));
        if (board) {
            for (const memberId of board.memberIds) {
                if (memberId !== userId) {
                    await db.insert(notifications).values({
                        userId: memberId,
                        type: "info",
                        title: "New Thread",
                        body: `${userName} started "${title}" in ${board.title}.`,
                        relatedId: thread.id,
                    });
                }
            }
        }

        revalidatePath("/intelboards");
        return thread;
    } catch (error) {
        log.error("Failed to create thread", { intelboardId }, error);
        throw new Error("Failed to create thread");
    }
}

export async function getThread(id: string) {
    try {
        const [thread] = await db.select().from(intelboardThreads).where(eq(intelboardThreads.id, id));
        if (!thread) return null;

        const posts = await db.select().from(intelboardPosts)
            .where(eq(intelboardPosts.threadId, id))
            .orderBy(intelboardPosts.createdAt);

        const authorIds = [...new Set(posts.map(p => p.authorId))];
        const authors = authorIds.length > 0
            ? await db.select({ id: users.id, name: users.name, avatar: users.avatar, role: users.role, jobTitle: users.jobTitle })
                .from(users).where(inArray(users.id, authorIds))
            : [];
        const authorMap = Object.fromEntries(authors.map(a => [a.id, a]));

        const hubs = await db.select().from(intelboardHubs)
            .where(eq(intelboardHubs.threadId, id))
            .orderBy(desc(intelboardHubs.createdAt));

        const postsWithAuthors = posts.map(p => ({
            ...p,
            author: authorMap[p.authorId] || { id: p.authorId, name: "Unknown" },
        }));

        return { ...thread, posts: postsWithAuthors, hubs };
    } catch (error) {
        log.error("Failed to get thread", { id }, error);
        return null;
    }
}

export async function createPost(threadId: string, content: string, parentPostId?: string) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Not authenticated");

        const [post] = await db.insert(intelboardPosts).values({
            threadId,
            authorId: userId,
            content,
            parentPostId: parentPostId || null,
        }).returning();

        await db.update(intelboardThreads).set({
            lastActivityAt: new Date(),
        }).where(eq(intelboardThreads.id, threadId));

        revalidatePath("/intelboards");
        return post;
    } catch (error) {
        log.error("Failed to create post", { threadId }, error);
        throw new Error("Failed to create post");
    }
}

export async function startHub(data: {
    threadId?: string;
    intelboardId: string;
    title: string;
    instant?: boolean;
    startTime?: string;
}) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        const userName = session?.user?.name || "Unknown";
        if (!userId) throw new Error("Not authenticated");

        const { createTeamsMeeting } = await import("./teams");
        const now = new Date();
        const endTime = new Date(now.getTime() + 60 * 60 * 1000);
        const meeting = await createTeamsMeeting(
            data.title,
            data.startTime || now.toISOString(),
            endTime.toISOString(),
            []
        );

        const [hub] = await db.insert(intelboardHubs).values({
            threadId: data.threadId || null,
            intelboardId: data.intelboardId,
            title: data.title,
            meetingUrl: meeting.joinUrl,
            meetingId: meeting.meetingId,
            status: data.instant ? "live" : "scheduled",
            startTime: data.startTime ? new Date(data.startTime) : (data.instant ? now : null),
            createdBy: userId,
        }).returning();

        const [board] = await db.select().from(intelboards).where(eq(intelboards.id, data.intelboardId));
        if (board) {
            for (const memberId of board.memberIds) {
                if (memberId !== userId) {
                    await db.insert(notifications).values({
                        userId: memberId,
                        type: "assignment",
                        title: data.instant ? "🔴 Hub is Live!" : "Hub Scheduled",
                        body: data.instant
                            ? `${userName} started a live hub "${data.title}" in ${board.title}. Join now!`
                            : `${userName} scheduled a hub "${data.title}" in ${board.title}.`,
                        relatedId: hub.id,
                    });
                }
            }
        }

        revalidatePath("/intelboards");
        return hub;
    } catch (error) {
        log.error("Failed to start hub", {}, error);
        throw new Error("Failed to start hub");
    }
}

export async function rsvpToHub(hubId: string, status: 'accepted' | 'declined' | 'maybe') {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        const userName = session?.user?.name || "Unknown";
        if (!userId) throw new Error("Not authenticated");

        const [hub] = await db.select().from(intelboardHubs).where(eq(intelboardHubs.id, hubId));
        if (!hub) throw new Error("Hub not found");

        // Update or add RSVP
        const existingRsvps = (hub.rsvps || []) as { userId: string; status: 'accepted' | 'declined' | 'maybe'; respondedAt: string }[];
        const filtered = existingRsvps.filter(r => r.userId !== userId);
        const updatedRsvps = [...filtered, { userId, status, respondedAt: new Date().toISOString() }];

        await db.update(intelboardHubs).set({ rsvps: updatedRsvps }).where(eq(intelboardHubs.id, hubId));

        // Notify hub creator if someone accepts
        if (status === 'accepted' && hub.createdBy !== userId) {
            await db.insert(notifications).values({
                userId: hub.createdBy,
                type: "info",
                title: "Hub RSVP",
                body: `${userName} accepted the invite to "${hub.title}".`,
                relatedId: hubId,
            });
        }

        revalidatePath("/intelboards");
        return { success: true };
    } catch (error) {
        log.error("Failed to RSVP", { hubId }, error);
        return { error: "Failed to RSVP" };
    }
}

export async function getHubWithDetails(hubId: string) {
    try {
        const [hub] = await db.select().from(intelboardHubs).where(eq(intelboardHubs.id, hubId));
        if (!hub) return null;

        // Get RSVP user details
        const rsvpList = (hub.rsvps || []) as { userId: string; status: string; respondedAt: string }[];
        const rsvpUserIds = rsvpList.map(r => r.userId);
        const rsvpUsers = rsvpUserIds.length > 0
            ? await db.select({ id: users.id, name: users.name, avatar: users.avatar, role: users.role })
                .from(users).where(inArray(users.id, rsvpUserIds))
            : [];
        const userMap = Object.fromEntries(rsvpUsers.map(u => [u.id, u]));

        const rsvpsWithUsers = rsvpList.map(r => ({
            ...r,
            user: userMap[r.userId] || { id: r.userId, name: "Unknown" },
        }));

        // Get hub comments (posts with hubId)
        const comments = await db.select().from(intelboardPosts)
            .where(eq(intelboardPosts.hubId, hubId))
            .orderBy(intelboardPosts.createdAt);

        const commentAuthorIds = [...new Set(comments.map(c => c.authorId))];
        const commentAuthors = commentAuthorIds.length > 0
            ? await db.select({ id: users.id, name: users.name, avatar: users.avatar, role: users.role })
                .from(users).where(inArray(users.id, commentAuthorIds))
            : [];
        const authorMap = Object.fromEntries(commentAuthors.map(a => [a.id, a]));

        const commentsWithAuthors = comments.map(c => ({
            ...c,
            author: authorMap[c.authorId] || { id: c.authorId, name: "Unknown" },
        }));

        // Get creator info
        const [creator] = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
            .from(users).where(eq(users.id, hub.createdBy));

        return {
            ...hub,
            rsvpsWithUsers,
            comments: commentsWithAuthors,
            creator,
            accepted: rsvpList.filter(r => r.status === 'accepted').length,
            declined: rsvpList.filter(r => r.status === 'declined').length,
            maybe: rsvpList.filter(r => r.status === 'maybe').length,
        };
    } catch (error) {
        log.error("Failed to get hub details", { hubId }, error);
        return null;
    }
}

export async function createHubComment(hubId: string, content: string) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Not authenticated");

        // Get the hub's thread ID for the post
        const [hub] = await db.select().from(intelboardHubs).where(eq(intelboardHubs.id, hubId));
        if (!hub) throw new Error("Hub not found");

        const [post] = await db.insert(intelboardPosts).values({
            threadId: hub.threadId || hub.intelboardId, // fallback if no thread
            authorId: userId,
            content,
            hubId,
        }).returning();

        revalidatePath("/intelboards");
        return post;
    } catch (error) {
        log.error("Failed to create hub comment", { hubId }, error);
        throw new Error("Failed to create hub comment");
    }
}

// Get upcoming hubs (scheduled + live) for dashboard display
export async function getUpcomingHubs() {
    try {
        const hubs = await db.select({
            id: intelboardHubs.id,
            title: intelboardHubs.title,
            status: intelboardHubs.status,
            startTime: intelboardHubs.startTime,
            endTime: intelboardHubs.endTime,
            meetingUrl: intelboardHubs.meetingUrl,
            rsvps: intelboardHubs.rsvps,
            createdBy: intelboardHubs.createdBy,
            createdAt: intelboardHubs.createdAt,
            intelboardId: intelboardHubs.intelboardId,
            threadId: intelboardHubs.threadId,
            creatorName: users.name,
            intelboardTitle: intelboards.title,
        }).from(intelboardHubs)
            .leftJoin(users, eq(intelboardHubs.createdBy, users.id))
            .leftJoin(intelboards, eq(intelboardHubs.intelboardId, intelboards.id))
            .where(inArray(intelboardHubs.status, ["scheduled", "live"]))
            .orderBy(desc(intelboardHubs.createdAt));

        return hubs;
    } catch (error) {
        log.error("Failed to get upcoming hubs", {}, error);
        return [];
    }
}

// ================================================================
// Intel Hub — Hierarchical Knowledge Base
// ================================================================

export async function getHubCategories(userId?: string) {
    try {
        log.info("Fetching hub categories", { userId: userId || "anonymous" });
        const cats = await db.select().from(intelHubCategories).orderBy(asc(intelHubCategories.depth), asc(intelHubCategories.title));
        log.info("Hub categories fetched", { count: cats.length, userId: userId || "anonymous" });

        // If user provided, get their follows
        let followedIds: string[] = [];
        if (userId) {
            const follows = await db.select({ categoryId: intelHubFollows.categoryId })
                .from(intelHubFollows)
                .where(eq(intelHubFollows.userId, userId));
            followedIds = follows.map(f => f.categoryId);
            log.info("User follows loaded", { userId, followCount: followedIds.length });
        }

        return cats.map(c => ({ ...c, isFollowed: followedIds.includes(c.id) }));
    } catch (error) {
        log.error("Failed to get hub categories", { userId: userId || "anonymous" }, error);
        return [];
    }
}

export async function getHubCategory(slug: string, userId?: string) {
    try {
        log.info("Fetching hub category", { slug, userId: userId || "anonymous" });
        const [category] = await db.select().from(intelHubCategories).where(eq(intelHubCategories.slug, slug));
        if (!category) {
            log.warn("Hub category not found", { slug });
            return null;
        }
        log.info("Hub category found", { slug, categoryId: category.id, depth: category.depth });

        // Get children
        const children = await db.select().from(intelHubCategories)
            .where(eq(intelHubCategories.parentId, category.id))
            .orderBy(asc(intelHubCategories.title));

        // Get ancestors (breadcrumb path)
        const ancestors: typeof category[] = [];
        let current = category;
        while (current.parentId) {
            const [parent] = await db.select().from(intelHubCategories).where(eq(intelHubCategories.id, current.parentId));
            if (!parent) break;
            ancestors.unshift(parent);
            current = parent;
        }

        // Get linked intelboards
        const linkedBoards = await db.select().from(intelboards)
            .where(eq(intelboards.categoryId, category.id));

        // Check if user follows
        let isFollowed = false;
        if (userId) {
            const [follow] = await db.select().from(intelHubFollows)
                .where(and(eq(intelHubFollows.userId, userId), eq(intelHubFollows.categoryId, category.id)));
            isFollowed = !!follow;
        }

        // Get follower count from children too
        const childrenWithFollowState = userId ? await Promise.all(children.map(async c => {
            const [follow] = await db.select().from(intelHubFollows)
                .where(and(eq(intelHubFollows.userId, userId), eq(intelHubFollows.categoryId, c.id)));
            return { ...c, isFollowed: !!follow };
        })) : children.map(c => ({ ...c, isFollowed: false }));

        return { ...category, isFollowed, children: childrenWithFollowState, ancestors, linkedBoards };
    } catch (error) {
        log.error("Failed to get hub category", { slug }, error);
        return null;
    }
}

export async function createHubCategory(data: {
    title: string;
    slug: string;
    description?: string;
    icon?: string;
    color?: string;
    parentId?: string;
}) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Not authenticated");

        // Calculate depth from parent
        let depth = 0;
        if (data.parentId) {
            const [parent] = await db.select().from(intelHubCategories).where(eq(intelHubCategories.id, data.parentId));
            if (parent) depth = parent.depth + 1;
        }

        const [cat] = await db.insert(intelHubCategories).values({
            title: data.title,
            slug: data.slug,
            description: data.description,
            icon: data.icon,
            color: data.color,
            parentId: data.parentId || null,
            depth,
            createdBy: userId,
        }).returning();

        revalidatePath("/intel-hub");
        return cat;
    } catch (error) {
        log.error("Failed to create hub category", { title: data.title }, error);
        throw new Error("Failed to create hub category");
    }
}

export async function followHubCategory(categoryId: string) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Not authenticated");

        // Check existing follow
        const [existing] = await db.select().from(intelHubFollows)
            .where(and(eq(intelHubFollows.userId, userId), eq(intelHubFollows.categoryId, categoryId)));

        if (existing) {
            // Unfollow
            await db.delete(intelHubFollows)
                .where(and(eq(intelHubFollows.userId, userId), eq(intelHubFollows.categoryId, categoryId)));
            await db.update(intelHubCategories)
                .set({ followerCount: sql`GREATEST(0, ${intelHubCategories.followerCount} - 1)` })
                .where(eq(intelHubCategories.id, categoryId));
            revalidatePath("/intel-hub");
            return { followed: false };
        } else {
            // Follow
            await db.insert(intelHubFollows).values({ userId, categoryId });
            await db.update(intelHubCategories)
                .set({ followerCount: sql`${intelHubCategories.followerCount} + 1` })
                .where(eq(intelHubCategories.id, categoryId));

            // Send notification
            const [cat] = await db.select().from(intelHubCategories).where(eq(intelHubCategories.id, categoryId));
            if (cat) {
                const user = await db.select().from(users).where(eq(users.id, userId));
                log.info("User followed hub category", { userId, categoryTitle: cat.title });
            }

            revalidatePath("/intel-hub");
            return { followed: true };
        }
    } catch (error) {
        log.error("Failed to follow hub category", { categoryId }, error);
        throw new Error("Failed to follow hub category");
    }
}

export async function searchHubCategories(query: string) {
    try {
        const results = await db.select().from(intelHubCategories)
            .where(or(
                ilike(intelHubCategories.title, `%${query}%`),
                ilike(intelHubCategories.description, `%${query}%`)
            ))
            .orderBy(asc(intelHubCategories.depth), asc(intelHubCategories.title))
            .limit(20);

        return results;
    } catch (error) {
        log.error("Failed to search hub categories", { query }, error);
        return [];
    }
}

export async function seedHubCategories() {
    try {
        // Check if already seeded
        const existing = await db.select().from(intelHubCategories).limit(1);
        if (existing.length > 0) {
            log.info("Hub categories already seeded, skipping");
            return { seeded: false, message: "Already seeded" };
        }

        const session = await auth();
        const userId = session?.user?.id || "system";

        // Hierarchy: IT → 10 subs → sub-subs
        const categories: { title: string; slug: string; description: string; icon: string; color: string; parentSlug?: string }[] = [
            // L0: Root
            { title: "IT & Technology", slug: "it-technology", description: "Information Technology, systems, and digital infrastructure", icon: "💻", color: "blue" },

            // L1: 10 sub-categories under IT
            { title: "Cloud Architecture", slug: "cloud-architecture", description: "Cloud platforms, migration strategies, and hybrid infrastructure", icon: "☁️", color: "sky", parentSlug: "it-technology" },
            { title: "Data Engineering", slug: "data-engineering", description: "Data pipelines, storage, transformation, and data quality", icon: "🔄", color: "cyan", parentSlug: "it-technology" },
            { title: "Cybersecurity", slug: "cybersecurity", description: "Security operations, threat management, and compliance", icon: "🛡️", color: "red", parentSlug: "it-technology" },
            { title: "DevOps & CI/CD", slug: "devops-cicd", description: "Continuous integration, delivery, and infrastructure automation", icon: "⚙️", color: "orange", parentSlug: "it-technology" },
            { title: "Software Development", slug: "software-development", description: "Application development, coding practices, and architecture patterns", icon: "🧑‍💻", color: "violet", parentSlug: "it-technology" },
            { title: "AI & Machine Learning", slug: "ai-machine-learning", description: "Artificial intelligence, ML models, and data science", icon: "🤖", color: "purple", parentSlug: "it-technology" },
            { title: "Business Intelligence", slug: "business-intelligence", description: "Reporting, analytics, dashboards, and data-driven decisions", icon: "📊", color: "amber", parentSlug: "it-technology" },
            { title: "IT Governance", slug: "it-governance", description: "IT strategy, policies, compliance frameworks, and risk management", icon: "📋", color: "slate", parentSlug: "it-technology" },
            { title: "Networking", slug: "networking", description: "Network architecture, protocols, SDN, and connectivity", icon: "🌐", color: "emerald", parentSlug: "it-technology" },
            { title: "Infrastructure", slug: "infrastructure", description: "Servers, storage, on-premise systems, and capacity planning", icon: "🏗️", color: "stone", parentSlug: "it-technology" },

            // L2: Sub-subs under Cloud Architecture
            { title: "AWS", slug: "aws", description: "Amazon Web Services — EC2, S3, Lambda, RDS, and more", icon: "🔶", color: "orange", parentSlug: "cloud-architecture" },
            { title: "Azure", slug: "azure", description: "Microsoft Azure — VMs, App Services, Functions, and governance", icon: "🔷", color: "blue", parentSlug: "cloud-architecture" },
            { title: "GCP", slug: "gcp", description: "Google Cloud Platform — Compute Engine, BigQuery, Cloud Run", icon: "🟢", color: "green", parentSlug: "cloud-architecture" },

            // L2: Sub-subs under Data Engineering
            { title: "ETL Pipelines", slug: "etl-pipelines", description: "Extract, Transform, Load — Airflow, dbt, Fivetran, and orchestration", icon: "🔗", color: "teal", parentSlug: "data-engineering" },
            { title: "Data Lakes", slug: "data-lakes", description: "Centralized data storage — Delta Lake, Iceberg, and data mesh", icon: "🏞️", color: "cyan", parentSlug: "data-engineering" },

            // L2: Sub-subs under Software Development
            { title: "Frontend", slug: "frontend", description: "UI development — React, Next.js, Vue, accessibility, and design systems", icon: "🎨", color: "pink", parentSlug: "software-development" },
            { title: "Backend", slug: "backend", description: "Server-side — APIs, databases, microservices, and system design", icon: "🔧", color: "indigo", parentSlug: "software-development" },
            { title: "Mobile", slug: "mobile", description: "iOS, Android, React Native, Flutter, and cross-platform development", icon: "📱", color: "lime", parentSlug: "software-development" },

            // L2: Sub-subs under Cybersecurity
            { title: "Threat Intelligence", slug: "threat-intelligence", description: "Threat monitoring, incident response, and vulnerability management", icon: "🕵️", color: "red", parentSlug: "cybersecurity" },
            { title: "Identity & Access", slug: "identity-access", description: "IAM, SSO, MFA, and zero-trust architecture", icon: "🔑", color: "yellow", parentSlug: "cybersecurity" },

            // L2: Sub-subs under AI & Machine Learning
            { title: "LLMs & NLP", slug: "llms-nlp", description: "Large language models, natural language processing, and text AI", icon: "💬", color: "purple", parentSlug: "ai-machine-learning" },
            { title: "Computer Vision", slug: "computer-vision", description: "Image recognition, object detection, and visual AI", icon: "👁️", color: "fuchsia", parentSlug: "ai-machine-learning" },
        ];

        // Resolve slugs to IDs in order
        const slugToId: Record<string, string> = {};

        for (const cat of categories) {
            const parentId = cat.parentSlug ? slugToId[cat.parentSlug] : null;
            let depth = 0;
            if (parentId) {
                const [parent] = await db.select().from(intelHubCategories).where(eq(intelHubCategories.id, parentId));
                if (parent) depth = parent.depth + 1;
            }

            const [inserted] = await db.insert(intelHubCategories).values({
                title: cat.title,
                slug: cat.slug,
                description: cat.description,
                icon: cat.icon,
                color: cat.color,
                parentId,
                depth,
                createdBy: userId,
            }).returning();

            slugToId[cat.slug] = inserted.id;
        }

        log.info("Seeded hub categories", { count: categories.length });
        revalidatePath("/intel-hub");
        return { seeded: true, count: categories.length };
    } catch (error) {
        log.error("Failed to seed hub categories", {}, error);
        throw new Error("Failed to seed hub categories");
    }
}
