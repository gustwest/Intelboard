
import { pgTable, text, timestamp, boolean, uuid, jsonb, integer } from 'drizzle-orm/pg-core';

// --- Users ---
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    role: text('role').default('user').notNull(),
    avatar: text('avatar'),
    createdAt: timestamp('created_at').defaultNow(),
});

// --- Projects ---
export const projects = pgTable('projects', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => users.id).notNull(),
    sharedWith: jsonb('shared_with').default([]), // List of User IDs
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Systems ---
export const systems = pgTable('systems', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: text('type').notNull(), // SystemType
    description: text('description'),
    positionX: integer('position_x').default(0),
    positionY: integer('position_y').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Join table for Projects <-> Systems
export const projectSystems = pgTable('project_systems', {
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'cascade' }).notNull(),
});

// --- Assets ---
export const assets = pgTable('assets', {
    id: uuid('id').primaryKey().defaultRandom(),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // Table, View, etc.
    description: text('description'),
    schema: text('schema'),
    status: text('status').default('Planned'), // Existing | Planned
    verificationStatus: text('verification_status').default('Unverified'), // Verified | Unverified
    // Storing columns as JSONB for flexibility, or could use a separate table
    columns: jsonb('columns'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Documents ---
export const documents = pgTable('documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    type: text('type'), // MIME type
    content: text('content'), // Storing as text (metadata or base64 if small). 
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    uploadedAt: timestamp('uploaded_at').defaultNow(),
});

// --- Integrations ---
export const integrations = pgTable('integrations', {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceAssetId: uuid('source_asset_id').references(() => assets.id, { onDelete: 'cascade' }),
    targetSystemId: uuid('target_system_id').references(() => systems.id, { onDelete: 'cascade' }),
    description: text('description'),
    technology: text('technology'),
    mode: text('mode'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
