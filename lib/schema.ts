import { pgTable, text, timestamp, boolean, jsonb, primaryKey, integer, serial } from "drizzle-orm/pg-core";
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
    assignedSpecialistId: text("assigned_specialist_id"), // legacy / primary specialist
    assignedSpecialistIds: jsonb("assigned_specialist_ids").$type<string[]>().default([]).notNull(),
    requestNumber: serial("request_number").notNull(),
    actionNeeded: boolean("action_needed").default(false).notNull(),
    specialistNote: text("specialist_note"),
    linkedProjectId: text("linked_project_id"),
    specialistNDASigned: boolean("specialist_nda_signed").default(false).notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().default([]).notNull(),
    acStatus: text("ac_status"),
    urgency: text("urgency"),
    requestType: text("request_type"),
    category: text("category"),
    attributes: jsonb("attributes").$type<Record<string, string>>().default({}).notNull(),
    attachments: jsonb("attachments").$type<string[]>().default([]).notNull(),
    comments: jsonb("comments").$type<any[]>().default([]).notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    hourlyRateMin: text("hourly_rate_min"),
    hourlyRateMax: text("hourly_rate_max"),
    salaryMin: text("salary_min"),
    salaryMax: text("salary_max"),
    // Phase 3: Payment & Terms
    agreedRate: text("agreed_rate"),
    agreedDuration: text("agreed_duration"),
    paymentStatus: text("payment_status"), // 'pending' | 'terms_proposed' | 'agreed' | 'paid'
    termsAcceptedByCustomer: boolean("terms_accepted_by_customer").default(false).notNull(),
    termsAcceptedBySpecialist: boolean("terms_accepted_by_specialist").default(false).notNull(),
    consultantRole: text("consultant_role"),
    requiredSkills: jsonb("required_skills").$type<{ name: string; category: string }[]>().default([]).notNull(),
});

// Phase 1: Request Activity Log / Version History
export const requestActivity = pgTable("request_activity", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    requestId: text("request_id").references(() => requests.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    userName: text("user_name").notNull(),
    action: text("action").notNull(), // 'created' | 'status_changed' | 'criteria_proposed' | 'criteria_approved' | 'specialist_assigned' | 'comment_added' | 'terms_proposed' | 'terms_accepted' | 'meeting_scheduled'
    details: jsonb("details").$type<Record<string, any>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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

// --- Chat & Notifications ---

export const conversations = pgTable("conversations", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(), // 'direct' | 'group' | 'request'
    title: text("title"),
    requestId: text("request_id").references(() => requests.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversationParticipants = pgTable("conversation_participants", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
    senderId: text("sender_id").references(() => users.id).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    readBy: jsonb("read_by").$type<string[]>().default([]).notNull(),
});

export const notifications = pgTable("notifications", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // 'message' | 'status_change' | 'comment' | 'assignment' | 'opportunity' | 'terms'
    title: text("title").notNull(),
    body: text("body"),
    relatedId: text("related_id"), // conversationId or requestId
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 4: Calendar / Events
export const events = pgTable("events", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    requestId: text("request_id").references(() => requests.id),
    createdBy: text("created_by").references(() => users.id).notNull(),
    attendees: jsonb("attendees").$type<string[]>().default([]).notNull(),
    acceptedAttendees: jsonb("accepted_attendees").$type<string[]>().default([]).notNull(),
    location: text("location"),
    type: text("type").notNull().default("meeting"), // 'meeting' | 'deadline' | 'milestone'
    audience: text("audience").notNull().default("private"), // 'private' | 'open' | 'team'
    recurring: text("recurring").notNull().default("none"), // 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Meeting / Video fields
    meetingUrl: text("meeting_url"),
    meetingId: text("meeting_id"),
    hasRecording: boolean("has_recording").default(false).notNull(),
    transcript: text("transcript"),
    aiSummary: text("ai_summary"),
    aiActionItems: jsonb("ai_action_items").$type<{ text: string; assignee?: string; dueDate?: string; done?: boolean }[]>().default([]).notNull(),
    agenda: text("agenda"),
    meetingNotes: text("meeting_notes"),
    meetingStatus: text("meeting_status").default("scheduled").notNull(), // 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
});

// --- Chat & Notification Relations ---

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
    participants: many(conversationParticipants),
    messages: many(messages),
    request: one(requests, {
        fields: [conversations.requestId],
        references: [requests.id],
    }),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
    conversation: one(conversations, {
        fields: [conversationParticipants.conversationId],
        references: [conversations.id],
    }),
    user: one(users, {
        fields: [conversationParticipants.userId],
        references: [users.id],
    }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id],
    }),
    sender: one(users, {
        fields: [messages.senderId],
        references: [users.id],
    }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, {
        fields: [notifications.userId],
        references: [users.id],
    }),
}));

export const requestActivityRelations = relations(requestActivity, ({ one }) => ({
    request: one(requests, {
        fields: [requestActivity.requestId],
        references: [requests.id],
    }),
    user: one(users, {
        fields: [requestActivity.userId],
        references: [users.id],
    }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
    request: one(requests, {
        fields: [events.requestId],
        references: [requests.id],
    }),
    creator: one(users, {
        fields: [events.createdBy],
        references: [users.id],
    }),
}));

// --- Intelboard Forums ---

export const intelboards = pgTable("intelboards", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"), // topic area
    visibility: text("visibility").default("open").notNull(), // 'open' | 'invite_only'
    invitedRoles: jsonb("invited_roles").$type<string[]>().default([]).notNull(),
    memberIds: jsonb("member_ids").$type<string[]>().default([]).notNull(),
    createdBy: text("created_by").references(() => users.id).notNull(),
    status: text("status").default("active").notNull(), // 'active' | 'archived'
    categoryId: text("category_id"), // link to intel_hub_categories
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intelboardThreads = pgTable("intelboard_threads", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    intelboardId: text("intelboard_id").references(() => intelboards.id).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdBy: text("created_by").references(() => users.id).notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    status: text("status").default("open").notNull(), // 'open' | 'resolved' | 'closed'
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intelboardPosts = pgTable("intelboard_posts", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").references(() => intelboardThreads.id).notNull(),
    authorId: text("author_id").references(() => users.id).notNull(),
    content: text("content").notNull(),
    parentPostId: text("parent_post_id"), // nullable, for nested replies
    hubId: text("hub_id"), // nullable, for hub-specific pre-meeting discussion
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const intelboardHubs = pgTable("intelboard_hubs", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").references(() => intelboardThreads.id),
    intelboardId: text("intelboard_id").references(() => intelboards.id).notNull(),
    title: text("title").notNull(),
    meetingUrl: text("meeting_url"),
    meetingId: text("meeting_id"),
    status: text("status").default("scheduled").notNull(), // 'scheduled' | 'live' | 'completed'
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    transcript: text("transcript"),
    aiSummary: text("ai_summary"),
    aiActionItems: jsonb("ai_action_items").$type<{ text: string; assignee?: string; dueDate?: string; done?: boolean }[]>().default([]).notNull(),
    notes: text("notes"),
    rsvps: jsonb("rsvps").$type<{ userId: string; status: 'accepted' | 'declined' | 'maybe'; respondedAt: string }[]>().default([]).notNull(),
    createdBy: text("created_by").references(() => users.id).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Intelboard Relations ---

export const intelboardsRelations = relations(intelboards, ({ one, many }) => ({
    creator: one(users, { fields: [intelboards.createdBy], references: [users.id] }),
    threads: many(intelboardThreads),
    hubs: many(intelboardHubs),
}));

export const intelboardThreadsRelations = relations(intelboardThreads, ({ one, many }) => ({
    intelboard: one(intelboards, { fields: [intelboardThreads.intelboardId], references: [intelboards.id] }),
    creator: one(users, { fields: [intelboardThreads.createdBy], references: [users.id] }),
    posts: many(intelboardPosts),
    hubs: many(intelboardHubs),
}));

export const intelboardPostsRelations = relations(intelboardPosts, ({ one }) => ({
    thread: one(intelboardThreads, { fields: [intelboardPosts.threadId], references: [intelboardThreads.id] }),
    author: one(users, { fields: [intelboardPosts.authorId], references: [users.id] }),
}));

export const intelboardHubsRelations = relations(intelboardHubs, ({ one }) => ({
    thread: one(intelboardThreads, { fields: [intelboardHubs.threadId], references: [intelboardThreads.id] }),
    intelboard: one(intelboards, { fields: [intelboardHubs.intelboardId], references: [intelboards.id] }),
    creator: one(users, { fields: [intelboardHubs.createdBy], references: [users.id] }),
}));

// --- Intel Hub: Hierarchical Knowledge Base ---

export const intelHubCategories = pgTable("intel_hub_categories", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    slug: text("slug").unique().notNull(),
    description: text("description"),
    icon: text("icon"), // emoji or lucide icon name
    color: text("color"), // hex or tailwind color
    parentId: text("parent_id"), // self-referencing for hierarchy
    depth: integer("depth").default(0).notNull(), // 0=root, 1=sub, 2=subsub
    followerCount: integer("follower_count").default(0).notNull(),
    isHot: boolean("is_hot").default(false),
    hotRank: integer("hot_rank").default(0),
    hotLabel: text("hot_label"),              // e.g. "🔥 Hottest", "⚡ Rising"
    // Wikipedia definition fields
    wikiTitle: text("wiki_title"),
    wikiSummary: text("wiki_summary"),
    wikiContent: text("wiki_content"),        // full article plain-text
    wikiUrl: text("wiki_url"),
    wikiImageUrl: text("wiki_image_url"),
    wikiFetchedAt: timestamp("wiki_fetched_at"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const intelHubFollows = pgTable("intel_hub_follows", {
    userId: text("user_id").references(() => users.id).notNull(),
    categoryId: text("category_id").references(() => intelHubCategories.id).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.categoryId] }),
}));

export const intelHubCategoriesRelations = relations(intelHubCategories, ({ one, many }) => ({
    parent: one(intelHubCategories, { fields: [intelHubCategories.parentId], references: [intelHubCategories.id], relationName: "parent_children" }),
    children: many(intelHubCategories, { relationName: "parent_children" }),
    creator: one(users, { fields: [intelHubCategories.createdBy], references: [users.id] }),
}));

// --- Ratings (generic, any content type) ---

export const ratings = pgTable("ratings", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    targetId: text("target_id").notNull(),
    targetType: text("target_type").notNull(), // 'event' | 'thread' | 'post' | 'user'
    score: integer("score").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ratingsRelations = relations(ratings, ({ one }) => ({
    user: one(users, { fields: [ratings.userId], references: [users.id] }),
}));

// --- Category Skill Self-Assessment ---

export const categorySkillRatings = pgTable("category_skill_ratings", {
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    categoryId: text("category_id").references(() => intelHubCategories.id, { onDelete: "cascade" }).notNull(),
    level: integer("level").notNull(), // 1=Beginner, 2=Elementary, 3=Intermediate, 4=Advanced, 5=Expert
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.categoryId] }),
}));

export const categorySkillRatingsRelations = relations(categorySkillRatings, ({ one }) => ({
    user: one(users, { fields: [categorySkillRatings.userId], references: [users.id] }),
    category: one(intelHubCategories, { fields: [categorySkillRatings.categoryId], references: [intelHubCategories.id] }),
}));

// --- Category Experiences (user-written involvement / challenges) ---

export const categoryExperiences = pgTable("category_experiences", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    categoryId: text("category_id").references(() => intelHubCategories.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categoryExperiencesRelations = relations(categoryExperiences, ({ one }) => ({
    user: one(users, { fields: [categoryExperiences.userId], references: [users.id] }),
    category: one(intelHubCategories, { fields: [categoryExperiences.categoryId], references: [intelHubCategories.id] }),
}));
