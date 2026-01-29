import { pgTable, text, timestamp, boolean, jsonb, primaryKey, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
    // Skills is now: { name: string, category: string }[]
    skills: jsonb("skills").$type<{ name: string; category: string }[]>().default([]),
    bio: text("bio"),
    jobTitle: text("job_title"),
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

export const workExperience = pgTable("work_experience", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"), // Null means "Present"
    description: text("description"),
    location: text("location"),
});

export const education = pgTable("education", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    school: text("school").notNull(),
    degree: text("degree"),
    fieldOfStudy: text("field_of_study"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
});

export const projectViews = pgTable("project_views", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'flowchart' | 'lineage'
    data: jsonb("data").$type<any>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const systems = pgTable("systems", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    position: jsonb("position").$type<{ x: number; y: number }>().default({ x: 0, y: 0 }).notNull(),
    ownerId: text("owner_id").notNull(),
    sharedWith: jsonb("shared_with").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const assets = pgTable("assets", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    systemId: text("system_id").references(() => systems.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    schema: text("schema"),
    status: text("status").default("Existing").notNull(),
    verificationStatus: text("verification_status").default("Unverified"),
    columns: jsonb("columns").$type<{ name: string; type: string }[]>().default([]),
});

export const integrations = pgTable("integrations", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sourceAssetId: text("source_asset_id").references(() => assets.id, { onDelete: "cascade" }).notNull(),
    targetSystemId: text("target_system_id").references(() => systems.id, { onDelete: "cascade" }).notNull(),
    description: text("description"),
    technology: text("technology"),
    mode: text("mode"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemDocuments = pgTable("system_documents", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    systemId: text("system_id").references(() => systems.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    content: text("content"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// --- Relations ---

export const systemsRelations = relations(systems, ({ many }) => ({
    assets: many(assets),
    documents: many(systemDocuments),
    outgoingIntegrations: many(integrations, { relationName: "targetSystem" }), // Wait, target is SYSTEM. Incoming.
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
    system: one(systems, {
        fields: [assets.systemId],
        references: [systems.id],
    }),
    outgoingIntegrations: many(integrations, { relationName: "sourceAsset" }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
    sourceAsset: one(assets, {
        fields: [integrations.sourceAssetId],
        references: [assets.id],
        relationName: "sourceAsset"
    }),
    targetSystem: one(systems, {
        fields: [integrations.targetSystemId],
        references: [systems.id],
        relationName: "targetSystem"
    }),
}));

export const projectViewsRelations = relations(projectViews, ({ one }) => ({
    project: one(projects, {
        fields: [projectViews.projectId],
        references: [projects.id],
    }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
    views: many(projectViews),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
    workExperience: many(workExperience),
    education: many(education),
    company: one(companies, {
        fields: [users.companyId],
        references: [companies.id],
    }),
}));

export const workExperienceRelations = relations(workExperience, ({ one }) => ({
    user: one(users, {
        fields: [workExperience.userId],
        references: [users.id],
    }),
}));

export const educationRelations = relations(education, ({ one }) => ({
    user: one(users, {
        fields: [education.userId],
        references: [users.id],
    }),
}));

