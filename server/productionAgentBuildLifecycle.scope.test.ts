import { describe, expect, it } from "vitest";
import { filterProductionAgentTaskRecords } from "./productionAgentBuildLifecycle";

describe("production agent lifecycle scope filtering", () => {
  const scope = {
    userId: 42,
    projectId: 6720001,
    conversationId: 6510001,
    buildRunId: "run-scope-a",
  } as const;

  const row = (overrides: Partial<{
    userId: number;
    projectId: number;
    conversationId: number;
    buildRunId: string;
    executionMode: string;
  }> = {}) => ({
    userId: scope.userId,
    projectId: scope.projectId,
    conversationId: scope.conversationId,
    buildRunId: scope.buildRunId,
    executionMode: "production",
    ...overrides,
  });

  it("keeps only the exact project/conversation and production-mode rows", () => {
    const records = [
      row({}),
      row({ userId: 99 }),
      row({ projectId: 6720002 }),
      row({ conversationId: 6510002 }),
      row({ buildRunId: "run-scope-b" }),
      row({ executionMode: "dry-run" }),
    ];

    expect(filterProductionAgentTaskRecords(records, scope)).toEqual([records[0]]);
  });

  it("returns no rows for a foreign tuple or non-production mode", () => {
    expect(filterProductionAgentTaskRecords([
      row({ projectId: 6720002 }),
      row({ conversationId: 6510002 }),
      row({ buildRunId: "run-scope-b" }),
      row({ executionMode: "planning" }),
    ], scope)).toEqual([]);
  });
});
