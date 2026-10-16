import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("Build Run review contract", () => {
  it("persists a review independently with its owner and selected tuple", () => {
    expect(schema).toContain('export const buildRunReviews = mysqlTable("buildRunReviews"');
    expect(schema).toContain('buildRunId: varchar("buildRunId", { length: 64 }).notNull().references(() => buildRuns.id)');
    expect(schema).toContain('userId: int("userId").notNull().references(() => users.id)');
    expect(schema).toContain('projectId: int("projectId").notNull().references(() => projects.id)');
    expect(schema).toContain('conversationId: int("conversationId").notNull().references(() => conversations.id)');
    expect(schema).toContain('mysqlEnum("status", ["unreviewed", "approved", "changes_requested"])');
    expect(schema).toContain('reviewRunUnique: uniqueIndex("buildRunReviews_run_unique").on(table.buildRunId)');
  });

  it("loads and saves a review only through owner-scoped Build Run data helpers", () => {
    expect(db).toContain("getBuildRunReviewForUser(userId: number, buildRunId: string)");
    expect(db).toContain("eq(buildRunReviews.userId, userId)");
    expect(db).toContain("eq(buildRunReviews.buildRunId, buildRunId)");
    expect(db).toContain("saveBuildRunReviewForUser(input:");
    expect(db).toContain("onDuplicateKeyUpdate");
    expect(db).toContain('input.status === "unreviewed" ? null');
  });

  it("requires the authenticated owner and validates review updates against the loaded Build Run", () => {
    expect(server).toContain('app.get("/api/build-runs/:buildId/review"');
    expect(server).toContain('app.put("/api/build-runs/:buildId/review"');
    expect(server).toContain("const user = await requireUser(req, res);");
    expect(server).toContain("const run = await loadDurableBuildRun(user.id, req.params.buildId);");
    expect(server).toContain('status !== "unreviewed" && status !== "approved" && status !== "changes_requested"');
    expect(server).toContain("projectId: run.projectId");
    expect(server).toContain("conversationId: run.conversationId");
    expect(server).not.toContain('app.put("/api/cloud/diff"');
  });
});
