import { pgTable, text, timestamp, boolean, jsonb, primaryKey, integer } from "drizzle-orm/pg-core";
import { AdapterAccount } from "next-auth/adapters";

export const companies = pgTable("companies", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    domain: text("domain").unique().notNull(), // e.g., "autoliv.com"
    logo: text("logo"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("user", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    password: text("password"), // Hashed password
    role: text("role").default("Guest").notNull(),
    companyId: text("company_id").references(() => companies.id),
    approvalStatus: text("approval_status").default("APPROVED").notNull(), // 'PENDING', 'APPROVED', 'REJECTED'
    avatar: text("avatar"),
    skills: jsonb("skills").$type<string[]>().default([]),
    bio: text("bio"),
    experience: text("experience"),
    industry: jsonb("industry").$type<string[]>().default([]),
    linkedin: text("linkedin"),
    availability: text("availability").default("Available"), // 'Available', 'Busy', 'Open to offers'
});

export const accounts = pgTable(
    "account",
    {
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: text("type").$type<AdapterAccount["type"]>().notNull(),
        provider: text("provider").notNull(),
        providerAccountId: text("providerAccountId").notNull(),
        refresh_token: text("refresh_token"),
        access_token: text("access_token"),
        expires_at: integer("expires_at"),
        token_type: text("token_type"),
        scope: text("scope"),
        id_token: text("id_token"),
        session_state: text("session_state"),
    },
    (account) => ({
        compoundKey: primaryKey({
            columns: [account.provider, account.providerAccountId],
        }),
    })
);

export const sessions = pgTable("session", {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
    "verificationToken",
    {
        identifier: text("identifier").notNull(),
        token: text("token").notNull(),
        expires: timestamp("expires", { mode: "date" }).notNull(),
    },
    (vt) => ({
        compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    })
);

export const requests = pgTable("requests", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    industry: text("industry").notNull(),
    budget: text("budget"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    creatorId: text("creator_id").references(() => users.id),
    assignedSpecialistId: text("assigned_specialist_id"),
    actionNeeded: boolean("action_needed").default(false).notNull(),
    specialistNote: text("specialist_note"),
    linkedProjectId: text("linked_project_id"),
    specialistNDASigned: boolean("specialist_nda_signed").default(false).notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().default([]).notNull(),
    acStatus: text("ac_status"),
    urgency: text("urgency"),
    category: text("category"),
    attributes: jsonb("attributes").$type<Record<string, string>>().default({}).notNull(),
    attachments: jsonb("attachments").$type<string[]>().default([]).notNull(),
    comments: jsonb("comments").$type<any[]>().default([]).notNull(),
});

export const projects = pgTable("projects", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    systemIds: jsonb("system_ids").$type<string[]>().default([]).notNull(),
    ownerId: text("owner_id").notNull(),
    sharedWith: jsonb("shared_with").$type<string[]>().default([]).notNull(),
    notes: text("notes"),
    flowData: jsonb("flow_data").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
