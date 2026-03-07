"use server";

import { auth } from "./auth";

import { db } from "./db";
import { requests, projects, users, companies, workExperience, education, projectViews, systems, assets, integrations, systemDocuments, conversations, conversationParticipants, messages, notifications } from "./schema";
import { eq, desc, or, and, inArray, sql } from "drizzle-orm";
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

        // Specialist: see requests assigned to them
        if (userRole === "Specialist" && userId) {
            return await db.query.requests.findMany({
                where: or(
                    eq(requests.creatorId, userId),
                    eq(requests.assignedSpecialistId, userId)
                ),
                orderBy: [desc(requests.createdAt)],
            });
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
