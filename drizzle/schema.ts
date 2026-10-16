import { relations } from "drizzle-orm";
import { boolean, index, int, longtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 96 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** First-party credentials are deliberately separate from durable workspace users. */
export const authAccounts = mysqlTable("authAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  /** The durable workspace identity selected by a verified, server-authorized claim. */
  workspaceUserId: int("workspaceUserId").references(() => users.id),
  email: varchar("email", { length: 320 }).notNull().unique(),
  displayName: varchar("displayName", { length: 160 }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  accountUser: uniqueIndex("auth_accounts_user_unique").on(table.userId),
  accountWorkspaceUser: index("auth_accounts_workspace_user_idx").on(table.workspaceUserId),
}));

/**
 * Immutable audit record for the single authorized reassignment of an orphaned
 * canonical SmartBuild workspace. It contains no credentials or client input.
 */
export const legacyWorkspaceClaims = mysqlTable("legacyWorkspaceClaims", {
  id: int("id").autoincrement().primaryKey(),
  canonicalUserId: int("canonicalUserId").notNull().references(() => users.id),
  claimedByAccountId: int("claimedByAccountId").notNull().references(() => authAccounts.id),
  claimedAt: timestamp("claimedAt").defaultNow().notNull(),
}, table => ({
  canonicalWorkspaceClaimedOnce: uniqueIndex("legacy_workspace_claims_canonical_user_unique").on(table.canonicalUserId),
  accountLegacyClaim: uniqueIndex("legacy_workspace_claims_account_unique").on(table.claimedByAccountId),
}));

export const authOneTimeCodes = mysqlTable("authOneTimeCodes", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().references(() => authAccounts.id),
  purpose: mysqlEnum("purpose", ["verify_email", "password_reset"]).notNull(),
  codeHash: varchar("codeHash", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attemptCount: int("attemptCount").notNull().default(0),
  maxAttempts: int("maxAttempts").notNull().default(5),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  activeCodeLookup: index("auth_codes_account_purpose_created_idx").on(table.accountId, table.purpose, table.createdAt),
  hashLookup: uniqueIndex("auth_codes_hash_unique").on(table.codeHash),
}));

export const authSessions = mysqlTable("authSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  accountId: int("accountId").notNull().references(() => authAccounts.id),
  userId: int("userId").notNull().references(() => users.id),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  sessionUserExpiry: index("auth_sessions_user_expiry_idx").on(table.userId, table.expiresAt),
}));

export const authRateLimits = mysqlTable("authRateLimits", {
  id: int("id").autoincrement().primaryKey(),
  action: mysqlEnum("action", ["signup", "verify_email", "resend_verification", "login", "forgot_password", "reset_password", "smtp_send"]).notNull(),
  subjectHash: varchar("subjectHash", { length: 128 }).notNull(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  attemptCount: int("attemptCount").notNull().default(0),
  blockedUntil: timestamp("blockedUntil"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  actionSubject: uniqueIndex("auth_rate_limits_action_subject_unique").on(table.action, table.subjectHash),
}));

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  buildStatus: mysqlEnum("buildStatus", ["idle", "planned", "writing", "previewing", "testing", "verifying", "succeeded", "failed", "blocked", "timed_out", "cancelled"]).default("idle").notNull(),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ownerArchiveUpdated: index("projects_owner_archive_updated_idx").on(table.userId, table.archivedAt, table.updatedAt),
}));

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 180 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => conversations.id),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const generatedFiles = mysqlTable("generatedFiles", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  conversationId: int("conversationId").references(() => conversations.id),
  buildRunId: varchar("buildRunId", { length: 64 }),
  userId: int("userId").notNull().references(() => users.id),
  path: varchar("path", { length: 255 }).notNull(),
  language: varchar("language", { length: 40 }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const uploads = mysqlTable("uploads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").references(() => projects.id),
  conversationId: int("conversationId").references(() => conversations.id),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const localFolderBindings = mysqlTable("localFolderBindings", {
  userId: int("userId").primaryKey().references(() => users.id),
  root: varchar("root", { length: 1024 }).notNull(),
  folderName: varchar("folderName", { length: 255 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectEvents = mysqlTable("projectEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").notNull().references(() => projects.id),
  conversationId: int("conversationId").references(() => conversations.id),
  eventType: varchar("eventType", { length: 96 }).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const projectSecrets = mysqlTable("projectSecrets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  ciphertext: longtext("ciphertext").notNull(),
  iv: varchar("iv", { length: 32 }).notNull(),
  authTag: varchar("authTag", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  projectNameUnique: uniqueIndex("project_secrets_project_name_unique").on(table.projectId, table.name),
  ownerProject: index("project_secrets_owner_project_idx").on(table.userId, table.projectId),
}));

export const buildRuns = mysqlTable("buildRuns", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").notNull().references(() => projects.id),
  conversationId: int("conversationId").notNull().references(() => conversations.id),
  heartbeatTaskUid: varchar("heartbeatTaskUid", { length: 128 }),
  advanceLeaseToken: varchar("advanceLeaseToken", { length: 64 }),
  advanceLeaseExpiresAt: timestamp("advanceLeaseExpiresAt"),
  status: mysqlEnum("status", ["planned", "writing", "previewing", "testing", "verifying", "succeeded", "failed", "blocked", "timed_out", "cancelled"]).notNull(),
  workspaceRoot: varchar("workspaceRoot", { length: 1024 }).notNull(),
  payload: longtext("payload").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ownerProjectUpdated: index("buildRuns_owner_project_updated_idx").on(table.userId, table.projectId, table.updatedAt),
  ownerConversationUpdated: index("buildRuns_owner_conversation_updated_idx").on(table.userId, table.conversationId, table.updatedAt),
  heartbeatTask: uniqueIndex("buildRuns_heartbeat_task_uid_unique").on(table.heartbeatTaskUid),
  advanceLeaseExpiry: index("buildRuns_advance_lease_expiry_idx").on(table.advanceLeaseExpiresAt),
}));

/**
 * Durable, Build-Run-scoped execution state for the canonical 70-agent
 * registry.  Historical dry-run Build Runs do not receive rows here; rows are
 * created only by the production executor for a newly requested Build Run.
 */
export const buildRunAgentTasks = mysqlTable("buildRunAgentTasks", {
  id: int("id").autoincrement().primaryKey(),
  buildRunId: varchar("buildRunId", { length: 64 }).notNull().references(() => buildRuns.id),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").notNull().references(() => projects.id),
  conversationId: int("conversationId").notNull().references(() => conversations.id),
  taskId: varchar("taskId", { length: 160 }).notNull(),
  agentId: varchar("agentId", { length: 32 }).notNull(),
  executionOrder: int("executionOrder").notNull(),
  executionMode: mysqlEnum("executionMode", ["dry-run", "production"]).notNull(),
  status: mysqlEnum("status", ["planned", "running", "succeeded", "blocked", "failed", "cancelled"]).notNull().default("planned"),
  attempt: int("attempt").notNull().default(0),
  selectedReason: varchar("selectedReason", { length: 1000 }).notNull(),
  blockedReason: varchar("blockedReason", { length: 512 }),
  outputArtifactRefs: longtext("outputArtifactRefs"),
  evidenceRefs: longtext("evidenceRefs"),
  logs: longtext("logs"),
  implementationHash: varchar("implementationHash", { length: 128 }),
  leaseToken: varchar("leaseToken", { length: 64 }),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  runTaskUnique: uniqueIndex("buildRunAgentTasks_run_task_unique").on(table.buildRunId, table.taskId),
  runOrderUnique: uniqueIndex("buildRunAgentTasks_run_order_unique").on(table.buildRunId, table.executionOrder),
  ownerRunStatus: index("buildRunAgentTasks_owner_run_status_idx").on(table.userId, table.buildRunId, table.status),
  runLeaseExpiry: index("buildRunAgentTasks_run_lease_expiry_idx").on(table.buildRunId, table.leaseExpiresAt),
}));

/**
 * Owner-authored review state is deliberately separate from Build Run execution
 * and artifacts. A row is created only after an explicit owner action.
 */
export const buildRunReviews = mysqlTable("buildRunReviews", {
  id: int("id").autoincrement().primaryKey(),
  buildRunId: varchar("buildRunId", { length: 64 }).notNull().references(() => buildRuns.id),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").notNull().references(() => projects.id),
  conversationId: int("conversationId").notNull().references(() => conversations.id),
  status: mysqlEnum("status", ["unreviewed", "approved", "changes_requested"]).notNull().default("unreviewed"),
  note: varchar("note", { length: 1000 }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  reviewRunUnique: uniqueIndex("buildRunReviews_run_unique").on(table.buildRunId),
  ownerRunReview: index("buildRunReviews_owner_run_idx").on(table.userId, table.buildRunId),
  ownerTupleReview: index("buildRunReviews_owner_tuple_idx").on(table.userId, table.projectId, table.conversationId),
}));

export const workspaceSelections = mysqlTable("workspaceSelections", {
  userId: int("userId").primaryKey().references(() => users.id),
  projectId: int("projectId").references(() => projects.id),
  conversationId: int("conversationId").references(() => conversations.id),
  buildRunId: varchar("buildRunId", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const researchSources = mysqlTable("researchSources", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  projectId: int("projectId").references(() => projects.id),
  conversationId: int("conversationId").references(() => conversations.id),
  query: varchar("query", { length: 240 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  snippet: text("snippet"),
  source: varchar("source", { length: 128 }).notNull().default("Web"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ conversationQuery: uniqueIndex("researchSources_conversation_url_unique").on(table.conversationId, table.url) }));

export const siteAnalyticsSessions = mysqlTable("siteAnalyticsSessions", {
  sessionKey: varchar("sessionKey", { length: 64 }).primaryKey(),
  visitorKey: varchar("visitorKey", { length: 64 }).notNull(),
  accountId: int("accountId").references(() => authAccounts.id),
  guestUserId: int("guestUserId").references(() => users.id),
  startedAt: timestamp("startedAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").notNull(),
  endedAt: timestamp("endedAt"),
  durationSeconds: int("durationSeconds").notNull().default(0),
}, table => ({
  visitorActivity: index("site_analytics_visitor_activity_idx").on(table.visitorKey, table.startedAt),
  accountActivity: index("site_analytics_account_activity_idx").on(table.accountId, table.startedAt),
  guestActivity: index("site_analytics_guest_activity_idx").on(table.guestUserId, table.startedAt),
  recentActivity: index("site_analytics_recent_activity_idx").on(table.lastSeenAt),
}));

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  conversations: many(conversations),
  messages: many(messages),
  generatedFiles: many(generatedFiles),
  uploads: many(uploads),
  researchSources: many(researchSources),
  projectEvents: many(projectEvents),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  conversations: many(conversations),
  generatedFiles: many(generatedFiles),
  uploads: many(uploads),
  researchSources: many(researchSources),
  projectEvents: many(projectEvents),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  project: one(projects, { fields: [conversations.projectId], references: [projects.id] }),
  messages: many(messages),
  generatedFiles: many(generatedFiles),
  uploads: many(uploads),
  researchSources: many(researchSources),
  projectEvents: many(projectEvents),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type WorkspaceMessage = typeof messages.$inferSelect;
export type GeneratedFile = typeof generatedFiles.$inferSelect;
export type DurableBuildRun = typeof buildRuns.$inferSelect;
export type BuildRunReview = typeof buildRunReviews.$inferSelect;
export type WorkspaceSelection = typeof workspaceSelections.$inferSelect;
