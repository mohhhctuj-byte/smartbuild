import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { authAccounts, authOneTimeCodes, authRateLimits, authSessions, buildRunAgentTasks, buildRunReviews, buildRuns, conversations, generatedFiles, legacyWorkspaceClaims, localFolderBindings, messages, projectEvents, projectSecrets, projects, researchSources, siteAnalyticsSessions, uploads, users, workspaceSelections, type BuildRunReview, type DurableBuildRun, type User } from "../drizzle/schema";
import { legacyWorkspaceClaimPolicy, type LegacyWorkspaceClaimState } from "./legacyWorkspaceClaimPolicy";
import { assertSequentialProductionAgentTaskPlan, nextSequentialProductionTaskId, type AgentQueueRecord } from "./agentTaskQueuePolicy";
import { acquireLocalStateLock } from "./localStateLock";
import { isUntitledProjectName } from "./workspace";

let database: ReturnType<typeof drizzle> | null = null;

type MemoryUserRecord = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

type MemoryAuthAccountRecord = {
  id: number;
  userId: number | null;
  workspaceUserId: number | null;
  email: string;
  displayName: string | null;
  passwordHash: string;
  emailVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MemoryAuthCodeRecord = {
  id: number;
  accountId: number;
  purpose: "verify_email" | "password_reset";
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
  usedAt: Date | null;
  createdAt: Date;
};

type MemoryAuthSessionRecord = {
  id: string;
  accountId: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};
type MemoryProjectRecord = { id: number; userId: number; name: string; description: string | null; buildStatus: "idle"; archivedAt: Date | null; createdAt: Date; updatedAt: Date };
type MemoryConversationRecord = { id: number; userId: number; projectId: number; title: string; createdAt: Date; updatedAt: Date };
type MemoryMessageRecord = { id: number; userId: number; conversationId: number; role: "user" | "assistant" | "system"; content: string; createdAt: Date };
type MemoryProjectEventRecord = { id: number; userId: number; projectId: number; conversationId: number | null; eventType: string; payload: string; createdAt: Date };
type MemoryProjectSecretRecord = { id: number; userId: number; projectId: number; name: string; provider: string; ciphertext: string; iv: string; authTag: string; createdAt: Date; updatedAt: Date };
type MemorySiteAnalyticsSession = { sessionKey: string; visitorKey: string; accountId: number | null; guestUserId: number | null; startedAt: Date; lastSeenAt: Date; endedAt: Date | null; durationSeconds: number };

type MemoryRateLimitRecord = {
  action: AuthRateLimitAction;
  subjectHash: string;
  windowStartedAt: Date;
  attemptCount: number;
  blockedUntil: Date | null;
};

const memoryAuthState = {
  nextUserId: 1,
  usersById: new Map<number, MemoryUserRecord>(),
  usersByOpenId: new Map<string, number>(),
  nextAccountId: 1,
  accountsById: new Map<number, MemoryAuthAccountRecord>(),
  accountsByEmail: new Map<string, number>(),
  nextCodeId: 1,
  codesById: new Map<number, MemoryAuthCodeRecord>(),
  sessionsByTokenHash: new Map<string, MemoryAuthSessionRecord>(),
  rateLimits: new Map<string, MemoryRateLimitRecord>(),
  nextProjectId: 1,
  projectsById: new Map<number, MemoryProjectRecord>(),
  nextConversationId: 1,
  conversationsById: new Map<number, MemoryConversationRecord>(),
  nextMessageId: 1,
  messagesById: new Map<number, MemoryMessageRecord>(),
  nextProjectEventId: 1,
  projectEventsById: new Map<number, MemoryProjectEventRecord>(),
  nextProjectSecretId: 1,
  projectSecretsById: new Map<number, MemoryProjectSecretRecord>(),
  siteAnalyticsSessionsByKey: new Map<string, MemorySiteAnalyticsSession>(),
  selectionsByUserId: new Map<number, { userId: number; projectId: number | null; conversationId: number | null; buildRunId: string | null; updatedAt: Date }>(),
};

const memoryAuthStateFile = path.resolve(process.env.AUTH_STATE_FILE || ".data/smartbuild-auth.json");
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  process.once("exit", acquireLocalStateLock(memoryAuthStateFile));
}
type PersistedMemoryAuthState = {
  nextUserId: number; users: MemoryUserRecord[]; nextAccountId: number; accounts: MemoryAuthAccountRecord[];
  nextCodeId: number; codes: MemoryAuthCodeRecord[]; sessions: MemoryAuthSessionRecord[];
  rateLimits: MemoryRateLimitRecord[];
  nextProjectId?: number; projects?: MemoryProjectRecord[]; nextConversationId?: number; conversations?: MemoryConversationRecord[];
  nextMessageId?: number; messages?: MemoryMessageRecord[];
  nextProjectEventId?: number; projectEvents?: MemoryProjectEventRecord[];
  nextProjectSecretId?: number; projectSecrets?: MemoryProjectSecretRecord[];
  siteAnalyticsSessions?: MemorySiteAnalyticsSession[];
  selections?: Array<{ userId: number; projectId: number | null; conversationId: number | null; buildRunId: string | null; updatedAt: string | Date }>;
};
function reviveDate(value: string | Date) { return value instanceof Date ? value : new Date(value); }
function loadMemoryAuthState() {
  try {
    const raw = JSON.parse(fs.readFileSync(memoryAuthStateFile, "utf8")) as PersistedMemoryAuthState;
    memoryAuthState.nextUserId = raw.nextUserId || 1;
    raw.users?.forEach(item => { const value = { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt), lastSignedIn: reviveDate(item.lastSignedIn) }; memoryAuthState.usersById.set(value.id, value); memoryAuthState.usersByOpenId.set(value.openId, value.id); });
    memoryAuthState.nextAccountId = raw.nextAccountId || 1;
    raw.accounts?.forEach(item => { const value = { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt), verifiedAt: item.verifiedAt ? reviveDate(item.verifiedAt) : null }; memoryAuthState.accountsById.set(value.id, value); memoryAuthState.accountsByEmail.set(value.email, value.id); });
    memoryAuthState.nextCodeId = raw.nextCodeId || 1;
    raw.codes?.forEach(item => { const value = { ...item, createdAt: reviveDate(item.createdAt), expiresAt: reviveDate(item.expiresAt), usedAt: item.usedAt ? reviveDate(item.usedAt) : null }; memoryAuthState.codesById.set(value.id, value); });
    raw.sessions?.forEach(item => { const value = { ...item, createdAt: reviveDate(item.createdAt), lastSeenAt: reviveDate(item.lastSeenAt), expiresAt: reviveDate(item.expiresAt), revokedAt: item.revokedAt ? reviveDate(item.revokedAt) : null }; memoryAuthState.sessionsByTokenHash.set(value.tokenHash, value); });
    raw.rateLimits?.forEach(item => memoryAuthState.rateLimits.set(authMemoryKey(item.action, item.subjectHash), { ...item, windowStartedAt: reviveDate(item.windowStartedAt), blockedUntil: item.blockedUntil ? reviveDate(item.blockedUntil) : null }));
    raw.projects?.forEach(item => memoryAuthState.projectsById.set(item.id, { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt), archivedAt: item.archivedAt ? reviveDate(item.archivedAt) : null }));
    memoryAuthState.nextProjectId = Math.max(raw.nextProjectId || 1, ...Array.from(memoryAuthState.projectsById.keys()).map(id => id + 1));
    raw.conversations?.forEach(item => memoryAuthState.conversationsById.set(item.id, { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt) }));
    memoryAuthState.nextConversationId = Math.max(raw.nextConversationId || 1, ...Array.from(memoryAuthState.conversationsById.keys()).map(id => id + 1));
    raw.messages?.forEach(item => memoryAuthState.messagesById.set(item.id, { ...item, createdAt: reviveDate(item.createdAt) }));
    memoryAuthState.nextMessageId = Math.max(raw.nextMessageId || 1, ...Array.from(memoryAuthState.messagesById.keys()).map(id => id + 1));
    raw.projectEvents?.forEach(item => memoryAuthState.projectEventsById.set(item.id, { ...item, createdAt: reviveDate(item.createdAt) }));
    memoryAuthState.nextProjectEventId = Math.max(raw.nextProjectEventId || 1, ...Array.from(memoryAuthState.projectEventsById.keys()).map(id => id + 1));
    raw.projectSecrets?.forEach(item => memoryAuthState.projectSecretsById.set(item.id, { ...item, createdAt: reviveDate(item.createdAt), updatedAt: reviveDate(item.updatedAt) }));
    memoryAuthState.nextProjectSecretId = Math.max(raw.nextProjectSecretId || 1, ...Array.from(memoryAuthState.projectSecretsById.keys()).map(id => id + 1));
    raw.siteAnalyticsSessions?.forEach(item => memoryAuthState.siteAnalyticsSessionsByKey.set(item.sessionKey, {
      ...item,
      guestUserId: item.guestUserId ?? null,
      startedAt: reviveDate(item.startedAt),
      lastSeenAt: reviveDate(item.lastSeenAt),
      endedAt: item.endedAt ? reviveDate(item.endedAt) : null,
    }));
    raw.selections?.forEach(item => memoryAuthState.selectionsByUserId.set(item.userId, { ...item, updatedAt: reviveDate(item.updatedAt) }));
  } catch { /* First run or unreadable optional local state. */ }
}
function persistMemoryAuthState() {
  if (hasDatabase()) return;
  fs.mkdirSync(path.dirname(memoryAuthStateFile), { recursive: true });
  const payload: PersistedMemoryAuthState = {
    nextUserId: memoryAuthState.nextUserId, users: Array.from(memoryAuthState.usersById.values()), nextAccountId: memoryAuthState.nextAccountId,
    accounts: Array.from(memoryAuthState.accountsById.values()), nextCodeId: memoryAuthState.nextCodeId,
    codes: Array.from(memoryAuthState.codesById.values()), sessions: Array.from(memoryAuthState.sessionsByTokenHash.values()),
    rateLimits: Array.from(memoryAuthState.rateLimits.values()),
    nextProjectId: memoryAuthState.nextProjectId, projects: Array.from(memoryAuthState.projectsById.values()),
    nextConversationId: memoryAuthState.nextConversationId, conversations: Array.from(memoryAuthState.conversationsById.values()),
    nextMessageId: memoryAuthState.nextMessageId, messages: Array.from(memoryAuthState.messagesById.values()),
    nextProjectEventId: memoryAuthState.nextProjectEventId, projectEvents: Array.from(memoryAuthState.projectEventsById.values()),
    nextProjectSecretId: memoryAuthState.nextProjectSecretId, projectSecrets: Array.from(memoryAuthState.projectSecretsById.values()),
    siteAnalyticsSessions: Array.from(memoryAuthState.siteAnalyticsSessionsByKey.values()),
    selections: Array.from(memoryAuthState.selectionsByUserId.values()),
  };
  const temporary = `${memoryAuthStateFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload));
  fs.renameSync(temporary, memoryAuthStateFile);
}
loadMemoryAuthState();

function hasDatabase() {
  return Boolean(database);
}

function authMemoryKey(action: AuthRateLimitAction, subjectHash: string) {
  return `${action}:${subjectHash}`;
}

export async function getDb() {
  if (!database && process.env.DATABASE_URL) database = drizzle(process.env.DATABASE_URL);
  return database;
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  if (!hasDatabase()) {
    const id = memoryAuthState.usersByOpenId.get(openId);
    return id === undefined ? undefined : memoryAuthState.usersById.get(id) as User | undefined;
  }
  const findUser = async () => {
    const db = await getDb();
    if (!db) return undefined;
    return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  };
  try {
    return await findUser();
  } catch (error) {
    const code = typeof error === "object" && error && "cause" in error && typeof error.cause === "object" && error.cause && "code" in error.cause ? String(error.cause.code) : "";
    if (!/PROTOCOL_CONNECTION_LOST|ECONNRESET|ETIMEDOUT/.test(code)) throw error;
    database = null;
    return findUser();
  }
}

export async function getUserById(userId: number): Promise<User | undefined> {
  if (!hasDatabase()) {
    return memoryAuthState.usersById.get(userId) as User | undefined;
  }
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
}

/**
 * Reads the historical SmartBuild owner only when both immutable Release Gate
 * Build Runs still share one user and retain their exact durable tuples.
 * It never creates or changes projects, selections, or Build Runs.
 */
export async function getCanonicalReleaseGateOwner(): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ user: users, run: buildRuns })
    .from(buildRuns)
    .innerJoin(users, eq(buildRuns.userId, users.id))
    .where(or(
      and(eq(buildRuns.id, "0e5e85c2-859f-40e2-bff5-5632c3c84ca6"), eq(buildRuns.projectId, 6720001), eq(buildRuns.conversationId, 6510001), eq(buildRuns.status, "succeeded")),
      and(eq(buildRuns.id, "6074749d-1c80-4507-a216-fcff5491de46"), eq(buildRuns.projectId, 6720002), eq(buildRuns.conversationId, 6510002), eq(buildRuns.status, "blocked")),
    ));
  if (rows.length !== 2 || rows[0].user.id !== rows[1].user.id) return undefined;
  return rows[0].user;
}

/** Reports claim eligibility without revealing another account’s identity. */
export async function getLegacyWorkspaceClaimState(accountId: number): Promise<{ state: LegacyWorkspaceClaimState; canonicalUserId?: number }> {
  const db = await getDb();
  const account = await getAuthAccountById(accountId);
  const canonical = await getCanonicalReleaseGateOwner();
  const initialState = legacyWorkspaceClaimPolicy({ account, canonicalUserId: canonical?.id });
  if (!db || !account || !canonical) return { state: "unavailable" };
  if (initialState === "claimed") return { state: initialState, canonicalUserId: canonical.id };

  const claim = (await db.select().from(legacyWorkspaceClaims).where(eq(legacyWorkspaceClaims.canonicalUserId, canonical.id)).limit(1))[0];
  const verifiedOwner = (await db.select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.emailVerified, true), or(eq(authAccounts.userId, canonical.id), eq(authAccounts.workspaceUserId, canonical.id))))
    .limit(1))[0];
  return { state: legacyWorkspaceClaimPolicy({ account, canonicalUserId: canonical.id, claimExists: Boolean(claim), verifiedOwnerExists: Boolean(verifiedOwner) }), canonicalUserId: canonical.id };
}

/**
 * Atomically binds an orphaned canonical workspace to one verified account.
 * No project, conversation, Build Run, artifact, preview, evidence, bug,
 * checkpoint, export, or persistent workspace row is recreated or altered.
 */
export async function claimLegacyWorkspaceForAccount(accountId: number): Promise<{ state: LegacyWorkspaceClaimState; canonicalUserId?: number }> {
  const db = await getDb();
  if (!db) return { state: "unavailable" };
  const eligibility = await getLegacyWorkspaceClaimState(accountId);
  if (eligibility.state !== "claimable" || !eligibility.canonicalUserId) return eligibility;

  try {
    await db.transaction(async tx => {
      const canonicalRows = await tx.select({ user: users, run: buildRuns })
        .from(buildRuns)
        .innerJoin(users, eq(buildRuns.userId, users.id))
        .where(or(
          and(eq(buildRuns.id, "0e5e85c2-859f-40e2-bff5-5632c3c84ca6"), eq(buildRuns.projectId, 6720001), eq(buildRuns.conversationId, 6510001), eq(buildRuns.status, "succeeded")),
          and(eq(buildRuns.id, "6074749d-1c80-4507-a216-fcff5491de46"), eq(buildRuns.projectId, 6720002), eq(buildRuns.conversationId, 6510002), eq(buildRuns.status, "blocked")),
        ));
      const canonical = canonicalRows.length === 2 && canonicalRows[0]!.user.id === canonicalRows[1]!.user.id ? canonicalRows[0]!.user : undefined;
      const account = (await tx.select().from(authAccounts).where(eq(authAccounts.id, accountId)).limit(1))[0];
      if (!canonical || !account?.emailVerified || canonical.id !== eligibility.canonicalUserId) throw new Error("LEGACY_CLAIM_NOT_AVAILABLE");
      const existingClaim = (await tx.select().from(legacyWorkspaceClaims).where(eq(legacyWorkspaceClaims.canonicalUserId, canonical.id)).limit(1))[0];
      const verifiedOwner = (await tx.select({ id: authAccounts.id }).from(authAccounts)
        .where(and(eq(authAccounts.emailVerified, true), or(eq(authAccounts.userId, canonical.id), eq(authAccounts.workspaceUserId, canonical.id))))
        .limit(1))[0];
      if (existingClaim || verifiedOwner) throw new Error("LEGACY_CLAIM_RECOVERY_REQUIRED");
      await tx.update(authAccounts).set({ workspaceUserId: canonical.id }).where(eq(authAccounts.id, accountId));
      await tx.insert(legacyWorkspaceClaims).values({ canonicalUserId: canonical.id, claimedByAccountId: accountId });
    });
    return { state: "claimed", canonicalUserId: eligibility.canonicalUserId };
  } catch (error) {
    if (error instanceof Error && /LEGACY_CLAIM_(NOT_AVAILABLE|RECOVERY_REQUIRED)|Duplicate entry/.test(error.message)) {
      return { state: "recovery_required", canonicalUserId: eligibility.canonicalUserId };
    }
    throw error;
  }
}

export async function upsertUser(user: { openId: string; name?: string | null; email?: string | null; loginMethod?: string | null; role?: "user" | "admin"; lastSignedIn?: Date }): Promise<User | undefined> {
  if (!hasDatabase()) {
    const existingId = memoryAuthState.usersByOpenId.get(user.openId);
    const now = new Date();
    if (existingId !== undefined) {
      const existing = memoryAuthState.usersById.get(existingId)!;
      const updated: MemoryUserRecord = {
        ...existing,
        name: user.name ?? existing.name,
        email: user.email ?? existing.email,
        loginMethod: user.loginMethod ?? existing.loginMethod,
        role: user.role ?? existing.role,
        lastSignedIn: user.lastSignedIn ?? existing.lastSignedIn,
        updatedAt: now,
      };
      memoryAuthState.usersById.set(existingId, updated);
      persistMemoryAuthState();
      return updated as User;
    }
    const record: MemoryUserRecord = {
      id: memoryAuthState.nextUserId++,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.role ?? "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    };
    memoryAuthState.usersById.set(record.id, record);
    memoryAuthState.usersByOpenId.set(record.openId, record.id);
    persistMemoryAuthState();
    return record as User;
  }
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(users).values({
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? "user",
    lastSignedIn: user.lastSignedIn ?? new Date(),
  }).onDuplicateKeyUpdate({ set: {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? "user",
    lastSignedIn: user.lastSignedIn ?? new Date(),
  } });
  return getUserByOpenId(user.openId);
}

export async function createPersonalWorkspaceUser(openId: string) {
  await upsertUser({ openId, name: "Personal workspace", loginMethod: "personal-session", role: "user", lastSignedIn: new Date() });
  return getUserByOpenId(openId);
}

export type ProjectArchiveFilter = "active" | "archived" | "all";

export async function listProjects(userId: number, archive: ProjectArchiveFilter = "active") {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryAuthState.projectsById.values())
      .filter(project => project.userId === userId && (archive === "all" || archive === "archived" ? archive === "all" || Boolean(project.archivedAt) : !project.archivedAt))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  const owner = eq(projects.userId, userId);
  const where = archive === "archived"
    ? and(owner, isNotNull(projects.archivedAt))
    : archive === "all"
      ? owner
      : and(owner, isNull(projects.archivedAt));
  return db.select().from(projects).where(where).orderBy(desc(projects.updatedAt));
}

export async function getProjectForUser(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return memoryAuthState.projectsById.get(projectId)?.userId === userId ? memoryAuthState.projectsById.get(projectId) : undefined;
  return (await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1))[0];
}

export async function listProjectSecrets(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return Array.from(memoryAuthState.projectSecretsById.values())
    .filter(secret => secret.userId === userId && secret.projectId === projectId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return db.select().from(projectSecrets)
    .where(and(eq(projectSecrets.userId, userId), eq(projectSecrets.projectId, projectId)))
    .orderBy(desc(projectSecrets.updatedAt));
}

export async function createProjectSecret(userId: number, projectId: number, secret: { name: string; provider: string; ciphertext: string; iv: string; authTag: string }) {
  const db = await getDb();
  if (!db) {
    const duplicate = Array.from(memoryAuthState.projectSecretsById.values()).some(item => item.userId === userId && item.projectId === projectId && item.name === secret.name);
    if (duplicate) throw new Error("PROJECT_SECRET_NAME_EXISTS");
    const now = new Date();
    const record: MemoryProjectSecretRecord = { id: memoryAuthState.nextProjectSecretId++, userId, projectId, ...secret, createdAt: now, updatedAt: now };
    memoryAuthState.projectSecretsById.set(record.id, record);
    persistMemoryAuthState();
    return record;
  }
  const inserted = await db.insert(projectSecrets).values({ userId, projectId, ...secret }).$returningId();
  return (await db.select().from(projectSecrets).where(eq(projectSecrets.id, inserted[0]!.id)).limit(1))[0];
}

export async function updateProjectSecret(userId: number, projectId: number, secretId: number, secret: { name: string; provider: string; ciphertext: string; iv: string; authTag: string }) {
  const db = await getDb();
  if (!db) {
    const record = memoryAuthState.projectSecretsById.get(secretId);
    if (!record || record.userId !== userId || record.projectId !== projectId) return undefined;
    const duplicate = Array.from(memoryAuthState.projectSecretsById.values()).some(item => item.id !== secretId && item.userId === userId && item.projectId === projectId && item.name === secret.name);
    if (duplicate) throw new Error("PROJECT_SECRET_NAME_EXISTS");
    Object.assign(record, secret, { updatedAt: new Date() });
    persistMemoryAuthState();
    return record;
  }
  const existing = (await db.select({ id: projectSecrets.id })
    .from(projectSecrets)
    .where(and(eq(projectSecrets.id, secretId), eq(projectSecrets.userId, userId), eq(projectSecrets.projectId, projectId)))
    .limit(1))[0];
  if (!existing) return undefined;
  await db.update(projectSecrets).set({ ...secret, updatedAt: new Date() })
    .where(and(eq(projectSecrets.id, secretId), eq(projectSecrets.userId, userId), eq(projectSecrets.projectId, projectId)));
  return (await db.select().from(projectSecrets)
    .where(and(eq(projectSecrets.id, secretId), eq(projectSecrets.userId, userId), eq(projectSecrets.projectId, projectId)))
    .limit(1))[0];
}

export async function deleteProjectSecret(userId: number, projectId: number, secretId: number) {
  const db = await getDb();
  if (!db) {
    const record = memoryAuthState.projectSecretsById.get(secretId);
    if (!record || record.userId !== userId || record.projectId !== projectId) return false;
    memoryAuthState.projectSecretsById.delete(secretId);
    persistMemoryAuthState();
    return true;
  }
  const removed = await db.delete(projectSecrets).where(and(
    eq(projectSecrets.id, secretId),
    eq(projectSecrets.userId, userId),
    eq(projectSecrets.projectId, projectId),
  ));
  return Number(removed[0]?.affectedRows || 0) > 0;
}

export async function createProject(userId: number, name: string, description?: string) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const project: MemoryProjectRecord = { id: memoryAuthState.nextProjectId++, userId, name: name.slice(0, 160), description: description?.slice(0, 4000) ?? null, buildStatus: "idle", archivedAt: null, createdAt: now, updatedAt: now };
    memoryAuthState.projectsById.set(project.id, project);
    persistMemoryAuthState();
    return project;
  }
  const inserted = await db.insert(projects).values({ userId, name: name.slice(0, 160), description: description?.slice(0, 4000) }).$returningId();
  return getProjectForUser(userId, inserted[0]!.id);
}

export async function updateProjectDetails(userId: number, projectId: number, details: { name: string; description: string }) {
  const db = await getDb();
  if (!db) {
    const project = memoryAuthState.projectsById.get(projectId);
    if (!project || project.userId !== userId) return undefined;
    project.name = details.name.slice(0, 160);
    project.description = details.description.slice(0, 4000);
    project.updatedAt = new Date();
    persistMemoryAuthState();
    return project;
  }
  await db.update(projects).set({ name: details.name.slice(0, 160), description: details.description.slice(0, 4000), updatedAt: new Date() }).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return getProjectForUser(userId, projectId);
}

export async function updateProjectNameIfUntitled(userId: number, projectId: number, name: string) {
  const project = await getProjectForUser(userId, projectId);
  if (!project || !isUntitledProjectName(project.name)) return undefined;
  const db = await getDb();
  if (!db) {
    const current = memoryAuthState.projectsById.get(projectId);
    if (!current || current.userId !== userId || current.name !== project.name) return undefined;
    current.name = name.slice(0, 160);
    current.updatedAt = new Date();
    persistMemoryAuthState();
    return current;
  }
  await db.update(projects)
    .set({ name: name.slice(0, 160), updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(projects.name, project.name)));
  const updated = await getProjectForUser(userId, projectId);
  return updated?.name === name ? updated : undefined;
}

/**
 * Archives one project without touching its conversations, Build Runs,
 * generated files, evidence, exports, or workspace directory. A selection of
 * that project is cleared so an archived project cannot remain the active UI.
 */
export async function archiveProjectForUser(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const project = memoryAuthState.projectsById.get(projectId);
    if (!project || project.userId !== userId) return undefined;
    project.archivedAt = new Date();
    project.updatedAt = new Date();
    const selection = memoryAuthState.selectionsByUserId.get(userId);
    if (selection?.projectId === projectId) memoryAuthState.selectionsByUserId.delete(userId);
    persistMemoryAuthState();
    return project;
  }
  return db.transaction(async tx => {
    const project = (await tx.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1))[0];
    if (!project) return undefined;
    if (!project.archivedAt) {
      await tx.update(projects).set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      await tx.update(workspaceSelections)
        .set({ projectId: null, conversationId: null, buildRunId: null, updatedAt: new Date() })
        .where(and(eq(workspaceSelections.userId, userId), eq(workspaceSelections.projectId, projectId)));
    }
    return (await tx.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1))[0];
  });
}

/** Restores an archived project for its same owner without creating or copying data. */
export async function restoreArchivedProjectForUser(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const project = memoryAuthState.projectsById.get(projectId);
    if (!project || project.userId !== userId) return undefined;
    project.archivedAt = null;
    project.updatedAt = new Date();
    persistMemoryAuthState();
    return project;
  }
  await db.update(projects).set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), isNotNull(projects.archivedAt)));
  return getProjectForUser(userId, projectId);
}

export type DeletedProjectResult = {
  projectId: number;
  workspaceRoots: string[];
};

/**
 * Permanently removes one project owned by the authenticated user. The caller
 * must ask for explicit confirmation at the UI boundary. This deliberately
 * leaves user-wide records (account, sessions, and local-folder preferences)
 * untouched and never accepts a project identifier without the owner scope.
 */
export async function deleteProjectForUser(userId: number, projectId: number): Promise<DeletedProjectResult | undefined> {
  const db = await getDb();
  if (!db) {
    const project = memoryAuthState.projectsById.get(projectId);
    if (!project || project.userId !== userId) return undefined;
    memoryAuthState.projectsById.delete(projectId);
    const conversationIds = new Set<number>();
    for (const [id, conversation] of Array.from(memoryAuthState.conversationsById.entries())) {
      if (conversation.projectId === projectId && conversation.userId === userId) {
        conversationIds.add(id);
        memoryAuthState.conversationsById.delete(id);
      }
    }
    for (const [id, message] of Array.from(memoryAuthState.messagesById.entries())) {
      if (message.userId === userId && conversationIds.has(message.conversationId)) memoryAuthState.messagesById.delete(id);
    }
    for (const [id, event] of Array.from(memoryAuthState.projectEventsById.entries())) {
      if (event.projectId === projectId && event.userId === userId) memoryAuthState.projectEventsById.delete(id);
    }
    for (const [id, secret] of Array.from(memoryAuthState.projectSecretsById.entries())) {
      if (secret.projectId === projectId && secret.userId === userId) memoryAuthState.projectSecretsById.delete(id);
    }
    const selection = memoryAuthState.selectionsByUserId.get(userId);
    if (selection?.projectId === projectId || (selection?.conversationId !== null && selection?.conversationId !== undefined && conversationIds.has(selection.conversationId))) {
      memoryAuthState.selectionsByUserId.delete(userId);
    }
    persistMemoryAuthState();
    return { projectId, workspaceRoots: [] };
  }

  return db.transaction(async tx => {
    const project = (await tx.select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1))[0];
    if (!project) return undefined;

    const runs = await tx.select({ id: buildRuns.id, workspaceRoot: buildRuns.workspaceRoot })
      .from(buildRuns)
      .where(and(eq(buildRuns.projectId, projectId), eq(buildRuns.userId, userId)));
    const runIds = runs.map(run => run.id);

    const conversationRows = await tx.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.projectId, projectId), eq(conversations.userId, userId)));
    const conversationIds = conversationRows.map(conversation => conversation.id);

    // Clear the user's active tuple before removing its project, conversation,
    // or Build Run. A stale selection can retain only a conversation or run
    // reference, so clear every owner-scoped selection that points to this
    // project's complete durable tuple. Existing migrations do not cascade.
    const selectionTargets = [
      eq(workspaceSelections.projectId, projectId),
      ...(conversationIds.length ? [inArray(workspaceSelections.conversationId, conversationIds)] : []),
      ...(runIds.length ? [inArray(workspaceSelections.buildRunId, runIds)] : []),
    ];
    await tx.delete(workspaceSelections).where(and(
      eq(workspaceSelections.userId, userId),
      or(...selectionTargets),
    ));

    // Delete leaf records first because existing migrations intentionally do
    // not cascade; every query is additionally scoped to the owner.
    if (runIds.length) await tx.delete(buildRunAgentTasks).where(and(eq(buildRunAgentTasks.userId, userId), inArray(buildRunAgentTasks.buildRunId, runIds)));
    if (runIds.length) await tx.delete(buildRunReviews).where(and(eq(buildRunReviews.userId, userId), inArray(buildRunReviews.buildRunId, runIds)));
    await tx.delete(generatedFiles).where(and(eq(generatedFiles.projectId, projectId), eq(generatedFiles.userId, userId)));
    await tx.delete(projectEvents).where(and(eq(projectEvents.projectId, projectId), eq(projectEvents.userId, userId)));
    await tx.delete(projectSecrets).where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.userId, userId)));
    await tx.delete(researchSources).where(and(eq(researchSources.projectId, projectId), eq(researchSources.userId, userId)));
    await tx.delete(uploads).where(and(eq(uploads.projectId, projectId), eq(uploads.userId, userId)));
    if (runIds.length) await tx.delete(buildRuns).where(and(eq(buildRuns.userId, userId), inArray(buildRuns.id, runIds)));

    if (conversationIds.length) await tx.delete(messages).where(and(eq(messages.userId, userId), inArray(messages.conversationId, conversationIds)));
    await tx.delete(conversations).where(and(eq(conversations.projectId, projectId), eq(conversations.userId, userId)));
    await tx.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    return { projectId, workspaceRoots: runs.map(run => run.workspaceRoot) };
  });
}

export type ProjectBuildStatus = "idle" | "planned" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";

export async function updateProjectBuildStatus(userId: number, projectId: number, buildStatus: ProjectBuildStatus) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(projects).set({ buildStatus, updatedAt: new Date() }).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return getProjectForUser(userId, projectId);
}

export type DurableBuildRunInput = {
  id: string;
  userId: number;
  projectId: number;
  conversationId: number;
  heartbeatTaskUid?: string | null;
  status: Exclude<ProjectBuildStatus, "idle">;
  workspaceRoot: string;
  payload: string;
  startedAt: Date;
  completedAt?: Date | null;
};

export async function createDurableBuildRun(input: DurableBuildRunInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(buildRuns).values({ ...input, heartbeatTaskUid: input.heartbeatTaskUid ?? null, completedAt: input.completedAt ?? null });
  return getDurableBuildRunForUser(input.userId, input.id);
}

export async function updateDurableBuildRun(input: DurableBuildRunInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(buildRuns).set({
    projectId: input.projectId,
    conversationId: input.conversationId,
    heartbeatTaskUid: input.heartbeatTaskUid ?? null,
    status: input.status,
    workspaceRoot: input.workspaceRoot,
    payload: input.payload,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? null,
    updatedAt: new Date(),
  }).where(and(eq(buildRuns.id, input.id), eq(buildRuns.userId, input.userId)));
  return getDurableBuildRunForUser(input.userId, input.id);
}

/**
 * Saves a Build Run payload only while the supplied worker still owns its
 * advancement lease. This fences stale Autoscale workers from writing an old
 * in-memory snapshot over a later phase after a competing worker takes over.
 */
export function affectedRowsFromDatabaseResult(result: unknown): number {
  if (Array.isArray(result)) return affectedRowsFromDatabaseResult(result[0]);
  if (!result || typeof result !== "object") return 0;
  const value = result as Record<string, unknown>;
  for (const key of ["affectedRows", "affected_rows", "rowsAffected"]) {
    const candidate = Number(value[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  for (const key of ["result", "header", "data", "meta"]) {
    if (key in value) {
      const nested = affectedRowsFromDatabaseResult(value[key]);
      if (nested > 0) return nested;
    }
  }
  return 0;
}

export async function updateDurableBuildRunWithAdvancementLease(input: DurableBuildRunInput, leaseToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.update(buildRuns).set({
    projectId: input.projectId,
    conversationId: input.conversationId,
    heartbeatTaskUid: input.heartbeatTaskUid ?? null,
    status: input.status,
    workspaceRoot: input.workspaceRoot,
    payload: input.payload,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? null,
    updatedAt: new Date(),
  }).where(and(
    eq(buildRuns.id, input.id),
    eq(buildRuns.userId, input.userId),
    eq(buildRuns.advanceLeaseToken, leaseToken),
  ));
  // mysql2/Drizzle may return a ResultSetHeader, a tuple, or a wrapped result
  // depending on the execution path. Normalize the redacted row count only;
  // never serialize the driver object into Build Run logs.
  return affectedRowsFromDatabaseResult(result) === 1;
}

/**
 * Persist the scheduler reference without touching the serialized Build Run
 * payload. The create route installs the heartbeat after the initial `planned`
 * snapshot has been written; rewriting that old payload here could otherwise
 * overwrite a concurrently persisted writing/previewing phase.
 */
export async function updateDurableBuildRunHeartbeatTask(userId: number, buildRunId: string, heartbeatTaskUid: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(buildRuns).set({ heartbeatTaskUid, updatedAt: new Date() }).where(and(eq(buildRuns.id, buildRunId), eq(buildRuns.userId, userId)));
  return getDurableBuildRunForUser(userId, buildRunId);
}

/**
 * Claims one short advancement window for a Build Run. Unlike the in-process
 * map, this conditional update is visible to separate Autoscale workers.
 */
export async function claimDurableBuildRunAdvancement(userId: number, buildRunId: string, leaseToken: string, leaseDurationMs: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseDurationMs);
  await db.update(buildRuns).set({ advanceLeaseToken: leaseToken, advanceLeaseExpiresAt: expiresAt, updatedAt: now }).where(and(
    eq(buildRuns.id, buildRunId),
    eq(buildRuns.userId, userId),
    or(isNull(buildRuns.advanceLeaseExpiresAt), lte(buildRuns.advanceLeaseExpiresAt, now)),
  ));
  const record = await getDurableBuildRunForUser(userId, buildRunId);
  return record?.advanceLeaseToken === leaseToken;
}

export async function renewDurableBuildRunAdvancement(userId: number, buildRunId: string, leaseToken: string, leaseDurationMs: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const result = await db.update(buildRuns).set({
    advanceLeaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
    updatedAt: now,
  }).where(and(
    eq(buildRuns.id, buildRunId),
    eq(buildRuns.userId, userId),
    eq(buildRuns.advanceLeaseToken, leaseToken),
    gte(buildRuns.advanceLeaseExpiresAt, now),
  ));
  return affectedRowsFromDatabaseResult(result) === 1;
}

/** Releases only the caller's lease so an older worker cannot unlock a newer claimant. */
export async function releaseDurableBuildRunAdvancement(userId: number, buildRunId: string, leaseToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(buildRuns).set({ advanceLeaseToken: null, advanceLeaseExpiresAt: null, updatedAt: new Date() }).where(and(
    eq(buildRuns.id, buildRunId),
    eq(buildRuns.userId, userId),
    eq(buildRuns.advanceLeaseToken, leaseToken),
  ));
}

export async function getDurableBuildRunForUser(userId: number, buildRunId: string): Promise<DurableBuildRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(buildRuns).where(and(eq(buildRuns.id, buildRunId), eq(buildRuns.userId, userId))).limit(1))[0];
}

export async function getDurableBuildRunById(buildRunId: string): Promise<DurableBuildRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(buildRuns).where(eq(buildRuns.id, buildRunId)).limit(1))[0];
}

export async function getDurableBuildRunForHeartbeatTask(taskUid: string): Promise<DurableBuildRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(buildRuns).where(eq(buildRuns.heartbeatTaskUid, taskUid)).limit(1))[0];
}

export async function listDurableBuildRuns(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(buildRuns).where(and(eq(buildRuns.userId, userId), eq(buildRuns.projectId, projectId))).orderBy(desc(buildRuns.updatedAt));
}

export type DurableAgentTaskStatus = "planned" | "running" | "succeeded" | "blocked" | "failed" | "cancelled";

export type DurableAgentTaskSeed = {
  taskId: string;
  agentId: string;
  executionOrder: number;
  selectedReason: string;
  implementationHash: string;
};

export type DurableAgentTaskScope = {
  userId: number;
  projectId: number;
  conversationId: number;
  buildRunId: string;
};

const asStoredJson = (value: readonly string[]) => JSON.stringify(Array.from(new Set(value)).slice(0, 100));

/**
 * Seeds only selected production tasks. Existing rows are left immutable so a
 * retry or process restart cannot reset a completed task back to planned.
 */
export async function seedDurableBuildRunAgentTasks(scope: DurableAgentTaskScope, tasks: readonly DurableAgentTaskSeed[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  assertSequentialProductionAgentTaskPlan(tasks);
  await db.transaction(async tx => {
    for (const task of tasks) {
      const existing = (await tx.select({ id: buildRunAgentTasks.id })
        .from(buildRunAgentTasks)
        .where(and(eq(buildRunAgentTasks.buildRunId, scope.buildRunId), eq(buildRunAgentTasks.taskId, task.taskId)))
        .limit(1))[0];
      if (existing) continue;
      await tx.insert(buildRunAgentTasks).values({
        buildRunId: scope.buildRunId,
        userId: scope.userId,
        projectId: scope.projectId,
        conversationId: scope.conversationId,
        taskId: task.taskId,
        agentId: task.agentId,
        executionOrder: task.executionOrder,
        executionMode: "production",
        status: "planned",
        selectedReason: task.selectedReason.slice(0, 1000),
        implementationHash: task.implementationHash.slice(0, 128),
      });
    }
  });
  return listDurableBuildRunAgentTasks(scope.userId, scope.buildRunId);
}

export async function listDurableBuildRunAgentTasks(userId: number, buildRunId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(buildRunAgentTasks)
    .where(and(eq(buildRunAgentTasks.userId, userId), eq(buildRunAgentTasks.buildRunId, buildRunId)))
    .orderBy(asc(buildRunAgentTasks.executionOrder));
}

export type BuildRunReviewStatus = "unreviewed" | "approved" | "changes_requested";

/** A review is visible only to the same owner and Build Run that created it. */
export async function getBuildRunReviewForUser(userId: number, buildRunId: string): Promise<BuildRunReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(buildRunReviews).where(and(
    eq(buildRunReviews.userId, userId),
    eq(buildRunReviews.buildRunId, buildRunId),
  )).limit(1))[0];
}

export async function saveBuildRunReviewForUser(input: {
  userId: number;
  projectId: number;
  conversationId: number;
  buildRunId: string;
  status: BuildRunReviewStatus;
  note?: string | null;
}): Promise<BuildRunReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const note = input.status === "unreviewed" ? null : input.note?.trim().slice(0, 1000) || null;
  const reviewedAt = input.status === "unreviewed" ? null : now;
  await db.insert(buildRunReviews).values({
    userId: input.userId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    buildRunId: input.buildRunId,
    status: input.status,
    note,
    reviewedAt,
  }).onDuplicateKeyUpdate({ set: { status: input.status, note, reviewedAt, updatedAt: now } });
  return getBuildRunReviewForUser(input.userId, input.buildRunId);
}

/**
 * Reclaims only an expired in-progress task belonging to this same durable
 * Build Run. This gives a reserved worker a safe restart point without
 * allowing one Run to see or advance another Run's work.
 */
export async function recoverExpiredDurableBuildRunAgentTasks(scope: DurableAgentTaskScope, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(buildRunAgentTasks).set({
    status: "planned",
    leaseToken: null,
    leaseExpiresAt: null,
    startedAt: null,
    updatedAt: now,
  }).where(and(
    eq(buildRunAgentTasks.userId, scope.userId),
    eq(buildRunAgentTasks.projectId, scope.projectId),
    eq(buildRunAgentTasks.conversationId, scope.conversationId),
    eq(buildRunAgentTasks.buildRunId, scope.buildRunId),
    eq(buildRunAgentTasks.executionMode, "production"),
    eq(buildRunAgentTasks.status, "running"),
    lte(buildRunAgentTasks.leaseExpiresAt, now),
  ));
}

/** Claims one task only. The conditional update is the concurrency fence. */
export async function claimNextDurableBuildRunAgentTask(scope: DurableAgentTaskScope, leaseToken: string, leaseDurationMs: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  await recoverExpiredDurableBuildRunAgentTasks(scope, now);
  const candidates = await db.select().from(buildRunAgentTasks).where(and(
    eq(buildRunAgentTasks.userId, scope.userId),
    eq(buildRunAgentTasks.projectId, scope.projectId),
    eq(buildRunAgentTasks.conversationId, scope.conversationId),
    eq(buildRunAgentTasks.buildRunId, scope.buildRunId),
    eq(buildRunAgentTasks.executionMode, "production"),
  )).orderBy(asc(buildRunAgentTasks.executionOrder));
  const nextTaskId = nextSequentialProductionTaskId(candidates as AgentQueueRecord[]);
  const next = candidates.find(task => task.taskId === nextTaskId);
  if (!next) return undefined;

  const result = await db.update(buildRunAgentTasks).set({
    status: "running",
    attempt: sql`${buildRunAgentTasks.attempt} + 1`,
    leaseToken,
    leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
    startedAt: now,
    updatedAt: now,
  }).where(and(
    eq(buildRunAgentTasks.id, next.id),
    eq(buildRunAgentTasks.userId, scope.userId),
    eq(buildRunAgentTasks.buildRunId, scope.buildRunId),
    eq(buildRunAgentTasks.status, "planned"),
  ));
  if (affectedRowsFromDatabaseResult(result) !== 1) return undefined;
  return (await db.select().from(buildRunAgentTasks).where(and(
    eq(buildRunAgentTasks.id, next.id),
    eq(buildRunAgentTasks.userId, scope.userId),
    eq(buildRunAgentTasks.buildRunId, scope.buildRunId),
    eq(buildRunAgentTasks.leaseToken, leaseToken),
  )).limit(1))[0];
}

export async function renewDurableBuildRunAgentTaskLease(scope: DurableAgentTaskScope, taskId: string, leaseToken: string, leaseDurationMs: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const result = await db.update(buildRunAgentTasks).set({
    leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
    updatedAt: now,
  }).where(and(
    eq(buildRunAgentTasks.userId, scope.userId),
    eq(buildRunAgentTasks.projectId, scope.projectId),
    eq(buildRunAgentTasks.conversationId, scope.conversationId),
    eq(buildRunAgentTasks.buildRunId, scope.buildRunId),
    eq(buildRunAgentTasks.taskId, taskId),
    eq(buildRunAgentTasks.status, "running"),
    eq(buildRunAgentTasks.leaseToken, leaseToken),
    gte(buildRunAgentTasks.leaseExpiresAt, now),
  ));
  return affectedRowsFromDatabaseResult(result) === 1;
}

export async function completeDurableBuildRunAgentTask(scope: DurableAgentTaskScope, taskId: string, leaseToken: string, result: {
  status: Exclude<DurableAgentTaskStatus, "planned" | "running">;
  outputArtifactRefs?: readonly string[];
  evidenceRefs?: readonly string[];
  blockedReason?: string;
  logs?: readonly string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const update = await db.update(buildRunAgentTasks).set({
    status: result.status,
    outputArtifactRefs: result.outputArtifactRefs ? asStoredJson(result.outputArtifactRefs) : null,
    evidenceRefs: result.evidenceRefs ? asStoredJson(result.evidenceRefs) : null,
    logs: result.logs ? asStoredJson(result.logs.map(log => log.slice(0, 800))) : null,
    blockedReason: result.blockedReason?.slice(0, 512) ?? null,
    leaseToken: null,
    leaseExpiresAt: null,
    completedAt: now,
    updatedAt: now,
  }).where(and(
    eq(buildRunAgentTasks.userId, scope.userId),
    eq(buildRunAgentTasks.projectId, scope.projectId),
    eq(buildRunAgentTasks.conversationId, scope.conversationId),
    eq(buildRunAgentTasks.buildRunId, scope.buildRunId),
    eq(buildRunAgentTasks.taskId, taskId),
    eq(buildRunAgentTasks.status, "running"),
    eq(buildRunAgentTasks.leaseToken, leaseToken),
  ));
  return affectedRowsFromDatabaseResult(update) === 1;
}

export async function saveWorkspaceSelection(userId: number, selection: { projectId?: number | null; conversationId?: number | null; buildRunId?: string | null }) {
  const db = await getDb();
  if (!db) {
    const value = { userId, projectId: selection.projectId ?? null, conversationId: selection.conversationId ?? null, buildRunId: selection.buildRunId ?? null, updatedAt: new Date() };
    memoryAuthState.selectionsByUserId.set(userId, value);
    persistMemoryAuthState();
    return value;
  }
  await db.insert(workspaceSelections).values({ userId, projectId: selection.projectId ?? null, conversationId: selection.conversationId ?? null, buildRunId: selection.buildRunId ?? null }).onDuplicateKeyUpdate({ set: {
    projectId: selection.projectId ?? null,
    conversationId: selection.conversationId ?? null,
    buildRunId: selection.buildRunId ?? null,
    updatedAt: new Date(),
  } });
  return getWorkspaceSelection(userId);
}

export async function getWorkspaceSelection(userId: number) {
  const db = await getDb();
  if (!db) return memoryAuthState.selectionsByUserId.get(userId);
  return (await db.select().from(workspaceSelections).where(eq(workspaceSelections.userId, userId)).limit(1))[0];
}

export async function listConversations(userId: number, projectId: number) {
  const db = await getDb();
  return db ? db.select().from(conversations).where(and(eq(conversations.userId, userId), eq(conversations.projectId, projectId))).orderBy(desc(conversations.updatedAt))
    : Array.from(memoryAuthState.conversationsById.values()).filter(item => item.userId === userId && item.projectId === projectId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function createConversation(userId: number, projectId: number, title: string) {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const conversation: MemoryConversationRecord = { id: memoryAuthState.nextConversationId++, userId, projectId, title: title.slice(0, 180), createdAt: now, updatedAt: now };
    memoryAuthState.conversationsById.set(conversation.id, conversation);
    persistMemoryAuthState();
    return conversation;
  }
  const inserted = await db.insert(conversations).values({ userId, projectId, title: title.slice(0, 180) }).$returningId();
  return (await db.select().from(conversations).where(eq(conversations.id, inserted[0]!.id)).limit(1))[0];
}

export async function updateConversationTitle(userId: number, conversationId: number, title: string) {
  const db = await getDb();
  if (!db) {
    const conversation = memoryAuthState.conversationsById.get(conversationId);
    if (!conversation || conversation.userId !== userId) return undefined;
    conversation.title = title.slice(0, 180);
    conversation.updatedAt = new Date();
    persistMemoryAuthState();
    return conversation;
  }
  await db.update(conversations).set({ title: title.slice(0, 180), updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return getConversationForUser(userId, conversationId);
}

export async function updateConversationTitleIfUntitled(userId: number, conversationId: number, title: string) {
  const untitledNames = ["New build", "New conversation"];
  const db = await getDb();
  if (!db) {
    const conversation = memoryAuthState.conversationsById.get(conversationId);
    if (!conversation || conversation.userId !== userId || !untitledNames.includes(conversation.title)) return undefined;
    conversation.title = title.slice(0, 180);
    conversation.updatedAt = new Date();
    persistMemoryAuthState();
    return conversation;
  }
  await db.update(conversations)
    .set({ title: title.slice(0, 180), updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId), inArray(conversations.title, untitledNames)));
  return getConversationForUser(userId, conversationId);
}

export async function getConversationForUser(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return memoryAuthState.conversationsById.get(conversationId)?.userId === userId ? memoryAuthState.conversationsById.get(conversationId) : undefined;
  return (await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1))[0];
}

export async function getConversationMessages(userId: number, conversationId: number) {
  const db = await getDb();
  return db ? db.select().from(messages).where(and(eq(messages.userId, userId), eq(messages.conversationId, conversationId))).orderBy(asc(messages.createdAt), asc(messages.id))
    : Array.from(memoryAuthState.messagesById.values()).filter(item => item.userId === userId && item.conversationId === conversationId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function addMessage(userId: number, conversationId: number, role: "user" | "assistant" | "system", content: string) {
  const db = await getDb();
  if (!db) {
    memoryAuthState.messagesById.set(memoryAuthState.nextMessageId++, { id: memoryAuthState.nextMessageId - 1, userId, conversationId, role, content, createdAt: new Date() });
    const conversation = memoryAuthState.conversationsById.get(conversationId);
    if (conversation?.userId === userId) conversation.updatedAt = new Date();
    persistMemoryAuthState();
    return;
  }
  await db.insert(messages).values({ userId, conversationId, role, content });
  await db.update(conversations).set({ updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

export async function addGeneratedFile(userId: number, projectId: number, conversationId: number, path: string, language: string, content: string, buildRunId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const storedPath = path.slice(0, 255);
  const storedLanguage = language.slice(0, 40);
  if (buildRunId) {
    const [existing] = await db.select({ id: generatedFiles.id }).from(generatedFiles).where(and(
      eq(generatedFiles.userId, userId),
      eq(generatedFiles.projectId, projectId),
      eq(generatedFiles.conversationId, conversationId),
      eq(generatedFiles.buildRunId, buildRunId),
      eq(generatedFiles.path, storedPath),
    )).orderBy(desc(generatedFiles.id)).limit(1);
    if (existing) {
      await db.update(generatedFiles).set({ language: storedLanguage, content }).where(and(
        eq(generatedFiles.id, existing.id),
        eq(generatedFiles.userId, userId),
        eq(generatedFiles.projectId, projectId),
        eq(generatedFiles.buildRunId, buildRunId),
      ));
      return existing.id;
    }
  }
  const inserted = await db.insert(generatedFiles).values({ userId, projectId, conversationId, buildRunId: buildRunId || null, path: storedPath, language: storedLanguage, content }).$returningId();
  return inserted[0]!.id;
}

export async function listGeneratedFiles(userId: number, projectId: number, conversationId?: number, buildRunId?: string | null) {
  const db = await getDb();
  if (!db) return [];
  const clauses = [eq(generatedFiles.userId, userId), eq(generatedFiles.projectId, projectId)];
  if (conversationId) clauses.push(eq(generatedFiles.conversationId, conversationId));
  if (buildRunId !== undefined) clauses.push(buildRunId ? eq(generatedFiles.buildRunId, buildRunId) : isNull(generatedFiles.buildRunId));
  return db.select().from(generatedFiles).where(and(...clauses)).orderBy(asc(generatedFiles.path));
}

export async function listGeneratedFilesForBuildRun(userId: number, buildRunId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generatedFiles).where(and(eq(generatedFiles.userId, userId), eq(generatedFiles.buildRunId, buildRunId))).orderBy(asc(generatedFiles.path));
}

export async function deleteGeneratedFilesForBuildRun(userId: number, buildRunId: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ path: generatedFiles.path }).from(generatedFiles).where(and(
    eq(generatedFiles.userId, userId),
    eq(generatedFiles.buildRunId, buildRunId),
  ));
  await db.delete(generatedFiles).where(and(eq(generatedFiles.userId, userId), eq(generatedFiles.buildRunId, buildRunId)));
  return rows.map(row => row.path);
}

export async function deleteGeneratedFileForBuildRun(userId: number, projectId: number, conversationId: number, buildRunId: string, filePath: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.delete(generatedFiles).where(and(
    eq(generatedFiles.userId, userId),
    eq(generatedFiles.projectId, projectId),
    eq(generatedFiles.conversationId, conversationId),
    eq(generatedFiles.buildRunId, buildRunId),
    eq(generatedFiles.path, filePath),
  ));
  return Number(result[0]?.affectedRows || 0) > 0;
}

export async function deleteLegacyGeneratedFilesForConversation(userId: number, projectId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ path: generatedFiles.path }).from(generatedFiles).where(and(
    eq(generatedFiles.userId, userId),
    eq(generatedFiles.projectId, projectId),
    eq(generatedFiles.conversationId, conversationId),
    isNull(generatedFiles.buildRunId),
  ));
  await db.delete(generatedFiles).where(and(
    eq(generatedFiles.userId, userId),
    eq(generatedFiles.projectId, projectId),
    eq(generatedFiles.conversationId, conversationId),
    isNull(generatedFiles.buildRunId),
  ));
  return rows.map(row => row.path);
}

export async function deleteDurableBuildRunForUser(userId: number, projectId: number, buildRunId: string) {
  const db = await getDb();
  if (!db) return false;
  await db.transaction(async tx => {
    await tx.delete(buildRunAgentTasks).where(and(eq(buildRunAgentTasks.userId, userId), eq(buildRunAgentTasks.projectId, projectId), eq(buildRunAgentTasks.buildRunId, buildRunId)));
    await tx.delete(buildRunReviews).where(and(eq(buildRunReviews.userId, userId), eq(buildRunReviews.buildRunId, buildRunId)));
    await tx.delete(generatedFiles).where(and(eq(generatedFiles.userId, userId), eq(generatedFiles.projectId, projectId), eq(generatedFiles.buildRunId, buildRunId)));
    await tx.delete(buildRuns).where(and(eq(buildRuns.userId, userId), eq(buildRuns.projectId, projectId), eq(buildRuns.id, buildRunId)));
  });
  return true;
}

/**
 * Older deployments wrote generated files before Build Run ownership existed.
 * Claim only files from the exact project, conversation, and recorded run time
 * window so failed/other-conversation artifacts cannot leak into a restored run.
 */
export async function claimLegacyGeneratedFilesForBuildRun(input: {
  userId: number;
  projectId: number;
  conversationId: number;
  buildRunId: string;
  startedAt: Date;
  completedAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) return 0;
  const end = input.completedAt || new Date();
  const result = await db.update(generatedFiles).set({ buildRunId: input.buildRunId }).where(and(
    eq(generatedFiles.userId, input.userId),
    eq(generatedFiles.projectId, input.projectId),
    eq(generatedFiles.conversationId, input.conversationId),
    isNull(generatedFiles.buildRunId),
    gte(generatedFiles.createdAt, input.startedAt),
    lte(generatedFiles.createdAt, end),
  ));
  return Number(result[0]?.affectedRows || 0);
}

export async function updateGeneratedFile(userId: number, fileId: number, content: string, path?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(generatedFiles).set({ content, ...(path ? { path: path.slice(0, 255) } : {}) }).where(and(eq(generatedFiles.id, fileId), eq(generatedFiles.userId, userId)));
}

export async function createUpload(userId: number, fileKey: string, url: string, mimeType: string, sizeBytes: number, projectId?: number, conversationId?: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(uploads).values({ userId, fileKey, url, mimeType, sizeBytes, projectId, conversationId });
}

export async function listUploads(userId: number, conversationId: number) {
  const db = await getDb();
  return db ? db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.conversationId, conversationId))).orderBy(desc(uploads.createdAt)) : [];
}

export async function addResearchSources(userId: number, query: string, rows: Array<{ title: string; url: string; snippet?: string; source?: string }>, projectId?: number, conversationId?: number) {
  const db = await getDb();
  if (!db || !rows.length) return;
  for (const row of rows) {
    await db.insert(researchSources).values({ userId, projectId, conversationId, query, title: row.title.slice(0, 500), url: row.url.slice(0, 1024), snippet: row.snippet?.slice(0, 4000), source: row.source || "Web" }).onDuplicateKeyUpdate({ set: { snippet: row.snippet?.slice(0, 4000), query } });
  }
}

export async function getLocalFolderBinding(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(localFolderBindings).where(eq(localFolderBindings.userId, userId)).limit(1))[0];
}

export async function saveLocalFolderBinding(userId: number, root: string, folderName: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(localFolderBindings).values({ userId, root: root.slice(0, 1024), folderName: folderName.slice(0, 255) }).onDuplicateKeyUpdate({ set: { root: root.slice(0, 1024), folderName: folderName.slice(0, 255), updatedAt: new Date() } });
}

export async function deleteLocalFolderBinding(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(localFolderBindings).where(eq(localFolderBindings.userId, userId));
}

export async function listResearchSources(userId: number, conversationId: number) {
  const db = await getDb();
  return db ? db.select().from(researchSources).where(and(eq(researchSources.userId, userId), eq(researchSources.conversationId, conversationId))).orderBy(desc(researchSources.createdAt)) : [];
}

export async function appendProjectEvent(userId: number, projectId: number, eventType: string, payload: unknown, conversationId?: number) {
  const db = await getDb();
  if (!db) {
    memoryAuthState.projectEventsById.set(memoryAuthState.nextProjectEventId++, {
      id: memoryAuthState.nextProjectEventId - 1,
      userId,
      projectId,
      conversationId: conversationId ?? null,
      eventType: eventType.slice(0, 96),
      payload: JSON.stringify(payload ?? null),
      createdAt: new Date(),
    });
    persistMemoryAuthState();
    return;
  }
  await db.insert(projectEvents).values({
    userId,
    projectId,
    conversationId,
    eventType: eventType.slice(0, 96),
    payload: JSON.stringify(payload ?? null),
  });
}

export async function listProjectEvents(userId: number, projectId: number, conversationId?: number, eventType?: string) {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryAuthState.projectEventsById.values())
      .filter(event => event.userId === userId && event.projectId === projectId && (conversationId === undefined || event.conversationId === conversationId) && (eventType === undefined || event.eventType === eventType))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
  const clauses = [eq(projectEvents.userId, userId), eq(projectEvents.projectId, projectId)];
  if (conversationId !== undefined) clauses.push(eq(projectEvents.conversationId, conversationId));
  if (eventType !== undefined) clauses.push(eq(projectEvents.eventType, eventType));
  return db.select().from(projectEvents).where(and(...clauses)).orderBy(asc(projectEvents.createdAt), asc(projectEvents.id));
}

export type AuthCodePurpose = "verify_email" | "password_reset";
export type AuthRateLimitAction = "signup" | "verify_email" | "resend_verification" | "login" | "forgot_password" | "reset_password" | "smtp_send";
export type AuthAccount = typeof authAccounts.$inferSelect;

export async function getAuthAccountByEmail(email: string): Promise<AuthAccount | undefined> {
  if (!hasDatabase()) {
    const id = memoryAuthState.accountsByEmail.get(email.toLowerCase());
    return id === undefined ? undefined : memoryAuthState.accountsById.get(id) as AuthAccount | undefined;
  }
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0];
}

export async function getAuthAccountById(id: number): Promise<AuthAccount | undefined> {
  if (!hasDatabase()) {
    return memoryAuthState.accountsById.get(id) as AuthAccount | undefined;
  }
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(authAccounts).where(eq(authAccounts.id, id)).limit(1))[0];
}

export async function createAuthAccount(email: string, passwordHash: string, displayName?: string): Promise<AuthAccount | undefined> {
  if (!hasDatabase()) {
    const key = email.toLowerCase();
    const id = memoryAuthState.nextAccountId++;
    const account: MemoryAuthAccountRecord = {
      id,
      userId: null,
      workspaceUserId: null,
      email: key,
      displayName: displayName?.trim().replace(/\s+/g, " ").slice(0, 160) || null,
      passwordHash,
      emailVerified: false,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryAuthState.accountsById.set(id, account);
    memoryAuthState.accountsByEmail.set(key, id);
    persistMemoryAuthState();
    return account as AuthAccount;
  }
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(authAccounts).values({ email, displayName: displayName?.trim().replace(/\s+/g, " ").slice(0, 160) || null, passwordHash, emailVerified: false });
  return getAuthAccountById(Number(result[0].insertId));
}

export async function updateAuthAccountDisplayName(accountId: number, displayName: string) {
  const name = displayName.trim().replace(/\s+/g, " ").slice(0, 160);
  if (!name) return getAuthAccountById(accountId);
  if (!hasDatabase()) {
    const account = memoryAuthState.accountsById.get(accountId);
    if (!account) return undefined;
    const updated = { ...account, displayName: name, updatedAt: new Date() };
    memoryAuthState.accountsById.set(accountId, updated);
    persistMemoryAuthState();
    return updated as AuthAccount;
  }
  const db = await getDb();
  if (!db) return undefined;
  await db.update(authAccounts).set({ displayName: name, updatedAt: new Date() }).where(eq(authAccounts.id, accountId));
  return getAuthAccountById(accountId);
}

export async function markAuthAccountVerified(accountId: number, userId: number) {
  if (!hasDatabase()) {
    const account = memoryAuthState.accountsById.get(accountId);
    if (!account) return undefined;
    const updated: MemoryAuthAccountRecord = { ...account, userId, workspaceUserId: account.workspaceUserId ?? userId, emailVerified: true, verifiedAt: new Date(), updatedAt: new Date() };
    memoryAuthState.accountsById.set(accountId, updated);
    persistMemoryAuthState();
    return updated as AuthAccount;
  }
  const db = await getDb();
  if (!db) return undefined;
  await db.update(authAccounts).set({ emailVerified: true, verifiedAt: new Date(), userId }).where(eq(authAccounts.id, accountId));
  return getAuthAccountById(accountId);
}

export async function updateAuthAccountPassword(accountId: number, passwordHash: string) {
  if (!hasDatabase()) {
    const account = memoryAuthState.accountsById.get(accountId);
    if (!account) return;
    memoryAuthState.accountsById.set(accountId, { ...account, passwordHash, updatedAt: new Date() });
    persistMemoryAuthState();
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.update(authAccounts).set({ passwordHash }).where(eq(authAccounts.id, accountId));
}

export async function replaceAuthCode(input: { accountId: number; purpose: AuthCodePurpose; codeHash: string; expiresAt: Date; maxAttempts: number }) {
  if (!hasDatabase()) {
    const existing = Array.from(memoryAuthState.codesById.values()).filter(code => code.accountId === input.accountId && code.purpose === input.purpose && code.usedAt === null);
    for (const code of existing) {
      memoryAuthState.codesById.set(code.id, { ...code, usedAt: new Date() });
    }
    const record: MemoryAuthCodeRecord = {
      id: memoryAuthState.nextCodeId++,
      accountId: input.accountId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      usedAt: null,
      createdAt: new Date(),
    };
    memoryAuthState.codesById.set(record.id, record);
    persistMemoryAuthState();
    return record;
  }
  const db = await getDb();
  if (!db) return undefined;
  await db.update(authOneTimeCodes).set({ usedAt: new Date() }).where(and(eq(authOneTimeCodes.accountId, input.accountId), eq(authOneTimeCodes.purpose, input.purpose), isNull(authOneTimeCodes.usedAt)));
  const result = await db.insert(authOneTimeCodes).values(input);
  return (await db.select().from(authOneTimeCodes).where(eq(authOneTimeCodes.id, Number(result[0].insertId))).limit(1))[0];
}

export async function getActiveAuthCode(accountId: number, purpose: AuthCodePurpose) {
  if (!hasDatabase()) {
    const candidates = Array.from(memoryAuthState.codesById.values())
      .filter(code => code.accountId === accountId && code.purpose === purpose && code.usedAt === null)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return candidates[0];
  }
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(authOneTimeCodes).where(and(eq(authOneTimeCodes.accountId, accountId), eq(authOneTimeCodes.purpose, purpose), isNull(authOneTimeCodes.usedAt))).orderBy(desc(authOneTimeCodes.createdAt)).limit(1))[0];
}

export async function incrementAuthCodeAttempts(codeId: number) {
  if (!hasDatabase()) {
    const code = memoryAuthState.codesById.get(codeId);
    if (!code) return;
    memoryAuthState.codesById.set(codeId, { ...code, attemptCount: code.attemptCount + 1 });
    persistMemoryAuthState();
    return;
  }
  const db = await getDb();
  if (!db) return;
  const code = (await db.select().from(authOneTimeCodes).where(eq(authOneTimeCodes.id, codeId)).limit(1))[0];
  if (code) await db.update(authOneTimeCodes).set({ attemptCount: code.attemptCount + 1 }).where(eq(authOneTimeCodes.id, codeId));
}

export async function consumeAuthCode(codeId: number) {
  if (!hasDatabase()) {
    const code = memoryAuthState.codesById.get(codeId);
    if (!code) return;
    memoryAuthState.codesById.set(codeId, { ...code, usedAt: new Date() });
    persistMemoryAuthState();
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.update(authOneTimeCodes).set({ usedAt: new Date() }).where(eq(authOneTimeCodes.id, codeId));
}

export async function createAuthSession(input: { id: string; accountId: number; userId: number; tokenHash: string; expiresAt: Date }) {
  if (!hasDatabase()) {
    const session: MemoryAuthSessionRecord = {
      id: input.id,
      accountId: input.accountId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastSeenAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    };
    memoryAuthState.sessionsByTokenHash.set(input.tokenHash, session);
    persistMemoryAuthState();
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.insert(authSessions).values(input);
}

export async function getFirstPartySessionUser(tokenHash: string) {
  if (!hasDatabase()) {
    const session = memoryAuthState.sessionsByTokenHash.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return undefined;
    const account = memoryAuthState.accountsById.get(session.accountId);
    if (!account || !account.emailVerified) return undefined;
    const userId = account.workspaceUserId ?? account.userId ?? session.userId;
    const user = memoryAuthState.usersById.get(userId) ?? memoryAuthState.usersById.get(session.userId);
    if (!user) return undefined;
    session.lastSeenAt = new Date();
    persistMemoryAuthState();
    return user as User;
  }
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const row = await db.select({ user: users, session: authSessions, account: authAccounts })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .innerJoin(authAccounts, eq(authSessions.accountId, authAccounts.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gte(authSessions.expiresAt, now), eq(authAccounts.emailVerified, true)))
    .limit(1);
  if (!row[0]) return undefined;
  await db.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, row[0].session.id));
  const workspaceUserId = row[0].account.workspaceUserId ?? row[0].account.userId;
  if (!workspaceUserId) return undefined;
  return workspaceUserId === row[0].user.id ? row[0].user : getUserById(workspaceUserId);
}

export async function getFirstPartySessionAccount(tokenHash: string): Promise<AuthAccount | undefined> {
  if (!hasDatabase()) {
    const session = memoryAuthState.sessionsByTokenHash.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return undefined;
    const account = memoryAuthState.accountsById.get(session.accountId);
    if (!account || !account.emailVerified) return undefined;
    return account as AuthAccount;
  }
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  return (await db.select({ account: authAccounts })
    .from(authSessions)
    .innerJoin(authAccounts, eq(authSessions.accountId, authAccounts.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gte(authSessions.expiresAt, now), eq(authAccounts.emailVerified, true)))
    .limit(1))[0]?.account;
}

export async function revokeAuthSession(tokenHash: string) {
  if (!hasDatabase()) {
    const session = memoryAuthState.sessionsByTokenHash.get(tokenHash);
    if (!session) return;
    memoryAuthState.sessionsByTokenHash.set(tokenHash, { ...session, revokedAt: new Date() });
    persistMemoryAuthState();
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
}

export async function clearAuthRateLimit(input: { action: AuthRateLimitAction; subjectHash: string }) {
  if (!hasDatabase()) {
    memoryAuthState.rateLimits.delete(authMemoryKey(input.action, input.subjectHash));
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.delete(authRateLimits).where(and(eq(authRateLimits.action, input.action), eq(authRateLimits.subjectHash, input.subjectHash)));
}

export async function takeAuthRateLimit(input: { action: AuthRateLimitAction; subjectHash: string; windowMs: number; maxAttempts: number; now?: Date }) {
  if (!hasDatabase()) {
    const now = input.now ?? new Date();
    const key = authMemoryKey(input.action, input.subjectHash);
    const existing = memoryAuthState.rateLimits.get(key);
    if (!existing) {
      memoryAuthState.rateLimits.set(key, { action: input.action, subjectHash: input.subjectHash, windowStartedAt: now, attemptCount: 1, blockedUntil: null });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.blockedUntil && existing.blockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000)) };
    }
    if (now.getTime() - existing.windowStartedAt.getTime() >= input.windowMs) {
      memoryAuthState.rateLimits.set(key, { ...existing, windowStartedAt: now, attemptCount: 1, blockedUntil: null });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const nextAttempts = existing.attemptCount + 1;
    if (nextAttempts > input.maxAttempts) {
      const blockedUntil = new Date(existing.windowStartedAt.getTime() + input.windowMs);
      memoryAuthState.rateLimits.set(key, { ...existing, attemptCount: nextAttempts, blockedUntil });
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)) };
    }
    memoryAuthState.rateLimits.set(key, { ...existing, attemptCount: nextAttempts });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const db = await getDb();
  if (!db) return { allowed: false, retryAfterSeconds: 60 };
  const now = input.now ?? new Date();
  const existing = (await db.select().from(authRateLimits).where(and(eq(authRateLimits.action, input.action), eq(authRateLimits.subjectHash, input.subjectHash))).limit(1))[0];
  if (!existing) {
    await db.insert(authRateLimits).values({ action: input.action, subjectHash: input.subjectHash, windowStartedAt: now, attemptCount: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.blockedUntil && existing.blockedUntil > now) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000)) };
  if (now.getTime() - existing.windowStartedAt.getTime() >= input.windowMs) {
    await db.update(authRateLimits).set({ windowStartedAt: now, attemptCount: 1, blockedUntil: null }).where(eq(authRateLimits.id, existing.id));
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const nextAttempts = existing.attemptCount + 1;
  if (nextAttempts > input.maxAttempts) {
    const blockedUntil = new Date(existing.windowStartedAt.getTime() + input.windowMs);
    await db.update(authRateLimits).set({ attemptCount: nextAttempts, blockedUntil }).where(eq(authRateLimits.id, existing.id));
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)) };
  }
  await db.update(authRateLimits).set({ attemptCount: nextAttempts }).where(eq(authRateLimits.id, existing.id));
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordSiteAnalyticsActivity(input: { sessionKey: string; visitorKey: string; accountId: number | null; guestUserId?: number | null; ended: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  const guestUserId = input.accountId !== null ? null : input.guestUserId ?? null;
  if (!hasDatabase()) {
    const previous = memoryAuthState.siteAnalyticsSessionsByKey.get(input.sessionKey);
    if (input.accountId !== null) {
      for (const [key, session] of Array.from(memoryAuthState.siteAnalyticsSessionsByKey.entries())) {
        if (session.visitorKey === input.visitorKey && session.accountId === null && session.guestUserId === null) {
          memoryAuthState.siteAnalyticsSessionsByKey.set(key, { ...session, accountId: input.accountId });
        }
      }
    } else if (guestUserId !== null) {
      for (const [key, session] of Array.from(memoryAuthState.siteAnalyticsSessionsByKey.entries())) {
        if (session.visitorKey === input.visitorKey && session.accountId === null && session.guestUserId === null) {
          memoryAuthState.siteAnalyticsSessionsByKey.set(key, { ...session, guestUserId });
        }
      }
    }
    const elapsedSeconds = previous && !previous.endedAt
      ? Math.min(60, Math.max(0, Math.floor((now.getTime() - previous.lastSeenAt.getTime()) / 1000)))
      : 0;
    memoryAuthState.siteAnalyticsSessionsByKey.set(input.sessionKey, {
      sessionKey: input.sessionKey,
      visitorKey: input.visitorKey,
      accountId: input.accountId ?? previous?.accountId ?? null,
      guestUserId: input.accountId !== null ? null : guestUserId ?? previous?.guestUserId ?? null,
      startedAt: previous?.startedAt ?? now,
      lastSeenAt: now,
      endedAt: input.ended ? now : null,
      durationSeconds: (previous?.durationSeconds ?? 0) + elapsedSeconds,
    });
    persistMemoryAuthState();
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Analytics database is unavailable.");
  if (input.accountId !== null) {
    await db.update(siteAnalyticsSessions)
      .set({ accountId: input.accountId })
      .where(and(eq(siteAnalyticsSessions.visitorKey, input.visitorKey), isNull(siteAnalyticsSessions.accountId), isNull(siteAnalyticsSessions.guestUserId)));
  } else if (guestUserId !== null) {
    await db.update(siteAnalyticsSessions)
      .set({ guestUserId })
      .where(and(eq(siteAnalyticsSessions.visitorKey, input.visitorKey), isNull(siteAnalyticsSessions.accountId), isNull(siteAnalyticsSessions.guestUserId)));
  }
  const previous = (await db.select().from(siteAnalyticsSessions)
    .where(eq(siteAnalyticsSessions.sessionKey, input.sessionKey)).limit(1))[0];
  const elapsedSeconds = previous && !previous.endedAt
    ? Math.min(60, Math.max(0, Math.floor((now.getTime() - previous.lastSeenAt.getTime()) / 1000)))
    : 0;
  if (previous) {
    await db.update(siteAnalyticsSessions).set({
      accountId: input.accountId ?? previous.accountId,
      guestUserId: input.accountId !== null ? null : guestUserId ?? previous.guestUserId,
      lastSeenAt: now,
      endedAt: input.ended ? now : null,
      durationSeconds: previous.durationSeconds + elapsedSeconds,
    }).where(eq(siteAnalyticsSessions.sessionKey, input.sessionKey));
    return;
  }
  await db.insert(siteAnalyticsSessions).values({
    sessionKey: input.sessionKey,
    visitorKey: input.visitorKey,
    accountId: input.accountId,
    guestUserId,
    startedAt: now,
    lastSeenAt: now,
    endedAt: input.ended ? now : null,
    durationSeconds: 0,
  });
}

export async function getSiteAnalyticsDashboard() {
  type Visitor = { key: string; type: "registered" | "guest" | "anonymous"; accountId: number | null; name: string | null; email: string | null; firstSeenAt: Date; lastSeenAt: Date; visits: number; durationSeconds: number };
  type Registration = { name: string | null; email: string; verified: boolean; createdAt: Date };
  type Session = { key: string; type: "registered" | "guest" | "anonymous"; name: string | null; email: string | null; startedAt: Date; lastSeenAt: Date; endedAt: Date | null; durationSeconds: number };
  type DayActivity = { date: string; sessions: number; visitors: number };
  const db = await getDb();
  let visitors: Visitor[];
  let registrations: Registration[];
  let sessions: Session[];
  let activityByDay: DayActivity[];
  let totalSessions: number;

  if (!db) {
    const groups = new Map<string, Visitor>();
    const dailyActivity = new Map<string, { sessions: number; visitorKeys: Set<string> }>();
    const sessionRows = Array.from(memoryAuthState.siteAnalyticsSessionsByKey.values());
    for (const session of sessionRows) {
      const type = session.accountId !== null ? "registered" : session.guestUserId !== null ? "guest" : "anonymous";
      const key = session.accountId !== null ? `account:${session.accountId}` : session.guestUserId !== null ? `guest:${session.guestUserId}` : `visitor:${session.visitorKey}`;
      const account = session.accountId === null ? null : memoryAuthState.accountsById.get(session.accountId);
      const userId = account?.userId ?? account?.workspaceUserId ?? session.guestUserId;
      const name = account?.displayName ?? (userId === undefined || userId === null ? null : memoryAuthState.usersById.get(userId)?.name ?? null);
      const group = groups.get(key);
      if (group) {
        if (session.startedAt < group.firstSeenAt) group.firstSeenAt = session.startedAt;
        if (session.lastSeenAt > group.lastSeenAt) group.lastSeenAt = session.lastSeenAt;
        group.visits += 1;
        group.durationSeconds += session.durationSeconds;
        if (!group.name && name) group.name = name;
      } else {
        groups.set(key, {
          key,
          type,
          accountId: session.accountId,
          name,
          email: account?.email ?? null,
          firstSeenAt: session.startedAt,
          lastSeenAt: session.lastSeenAt,
          visits: 1,
          durationSeconds: session.durationSeconds,
        });
      }
      const day = session.startedAt.toISOString().slice(0, 10);
      const activity = dailyActivity.get(day) ?? { sessions: 0, visitorKeys: new Set<string>() };
      activity.sessions += 1;
      activity.visitorKeys.add(key);
      dailyActivity.set(day, activity);
    }
    visitors = Array.from(groups.values()).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    registrations = Array.from(memoryAuthState.accountsById.values())
      .map(account => {
        const userId = account.userId ?? account.workspaceUserId;
        return {
          name: account.displayName ?? (userId === null ? null : memoryAuthState.usersById.get(userId)?.name ?? null),
          email: account.email,
          verified: account.emailVerified,
          createdAt: account.createdAt,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    sessions = sessionRows.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 200).map(session => {
      const account = session.accountId === null ? null : memoryAuthState.accountsById.get(session.accountId);
      const userId = account?.userId ?? account?.workspaceUserId ?? session.guestUserId;
      return {
        key: session.sessionKey,
        type: session.accountId !== null ? "registered" as const : session.guestUserId !== null ? "guest" as const : "anonymous" as const,
        name: account?.displayName ?? (userId === undefined || userId === null ? null : memoryAuthState.usersById.get(userId)?.name ?? null),
        email: account?.email ?? null,
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        endedAt: session.endedAt,
        durationSeconds: session.durationSeconds,
      };
    });
    activityByDay = Array.from(dailyActivity, ([date, activity]) => ({
      date,
      sessions: activity.sessions,
      visitors: activity.visitorKeys.size,
    })).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
    totalSessions = memoryAuthState.siteAnalyticsSessionsByKey.size;
  } else {
    const visitorIdentity = sql<string>`COALESCE(CONCAT('account:', ${siteAnalyticsSessions.accountId}), CONCAT('guest:', ${siteAnalyticsSessions.guestUserId}), CONCAT('visitor:', ${siteAnalyticsSessions.visitorKey}))`;
    const analyticsUserId = sql<number | null>`COALESCE(${authAccounts.userId}, ${authAccounts.workspaceUserId}, ${siteAnalyticsSessions.guestUserId})`;
    const sessionType = sql<"registered" | "guest" | "anonymous">`CASE WHEN ${siteAnalyticsSessions.accountId} IS NOT NULL THEN 'registered' WHEN ${siteAnalyticsSessions.guestUserId} IS NOT NULL THEN 'guest' ELSE 'anonymous' END`;
    const rows = await db.select({
      key: visitorIdentity,
      type: sessionType,
      accountId: siteAnalyticsSessions.accountId,
      name: sql<string | null>`COALESCE(${authAccounts.displayName}, ${users.name})`,
      email: authAccounts.email,
      firstSeenAt: sql<Date>`MIN(${siteAnalyticsSessions.startedAt})`,
      lastSeenAt: sql<Date>`MAX(${siteAnalyticsSessions.lastSeenAt})`,
      visits: sql<number>`COUNT(*)`,
      durationSeconds: sql<number>`SUM(${siteAnalyticsSessions.durationSeconds})`,
    }).from(siteAnalyticsSessions)
      .leftJoin(authAccounts, eq(siteAnalyticsSessions.accountId, authAccounts.id))
      .leftJoin(users, eq(users.id, analyticsUserId))
      .groupBy(visitorIdentity, sessionType, siteAnalyticsSessions.accountId, authAccounts.displayName, users.name, authAccounts.email)
      .orderBy(desc(sql`MAX(${siteAnalyticsSessions.lastSeenAt})`));
    visitors = rows.map(row => ({
      ...row,
      visits: Number(row.visits),
      durationSeconds: Number(row.durationSeconds),
    }));
    registrations = await db.select({
      name: sql<string | null>`COALESCE(${authAccounts.displayName}, ${users.name})`,
      email: authAccounts.email,
      verified: authAccounts.emailVerified,
      createdAt: authAccounts.createdAt,
    }).from(authAccounts)
      .leftJoin(users, eq(users.id, analyticsUserId))
      .orderBy(desc(authAccounts.createdAt));
    sessions = await db.select({
      key: siteAnalyticsSessions.sessionKey,
      type: sessionType,
      name: sql<string | null>`COALESCE(${authAccounts.displayName}, ${users.name})`,
      email: authAccounts.email,
      startedAt: siteAnalyticsSessions.startedAt,
      lastSeenAt: siteAnalyticsSessions.lastSeenAt,
      endedAt: siteAnalyticsSessions.endedAt,
      durationSeconds: siteAnalyticsSessions.durationSeconds,
    }).from(siteAnalyticsSessions)
      .leftJoin(authAccounts, eq(siteAnalyticsSessions.accountId, authAccounts.id))
      .leftJoin(users, eq(users.id, analyticsUserId))
      .orderBy(desc(siteAnalyticsSessions.startedAt))
      .limit(200);
    const dayRows = await db.select({
      date: sql<string>`DATE_FORMAT(${siteAnalyticsSessions.startedAt}, '%Y-%m-%d')`,
      sessions: sql<number>`COUNT(*)`,
      visitors: sql<number>`COUNT(DISTINCT ${visitorIdentity})`,
    }).from(siteAnalyticsSessions)
      .where(gte(siteAnalyticsSessions.startedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
      .groupBy(sql`DATE(${siteAnalyticsSessions.startedAt})`)
      .orderBy(sql`DATE(${siteAnalyticsSessions.startedAt})`);
    activityByDay = dayRows.map(row => ({ date: row.date, sessions: Number(row.sessions), visitors: Number(row.visitors) }));
    totalSessions = Number((await db.select({ count: sql<number>`COUNT(*)` }).from(siteAnalyticsSessions))[0]?.count ?? 0);
  }

  const totalDurationSeconds = visitors.reduce((sum, visitor) => sum + visitor.durationSeconds, 0);
  return {
    summary: {
      uniqueVisitors: visitors.length,
      totalSessions,
      returningVisitors: visitors.filter(visitor => visitor.visits > 1).length,
      guestVisitors: visitors.filter(visitor => visitor.type === "guest").length,
      registeredVisitors: visitors.filter(visitor => visitor.type === "registered").length,
      anonymousVisitors: visitors.filter(visitor => visitor.type === "anonymous").length,
      registrations: registrations.length,
      verifiedRegistrations: registrations.filter(account => account.verified).length,
      averageSessionSeconds: totalSessions ? Math.round(totalDurationSeconds / totalSessions) : 0,
    },
    visitors: visitors.slice(0, 200),
    sessions: sessions.map(session => ({
      ...session,
      startedAt: session.startedAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    })),
    activityByDay,
    recentRegistrations: registrations.slice(0, 50),
  };
}
