import { describe, expect, it } from "vitest";
import { createProjectReportCsv, createProjectReportPdf, safeReportFileName } from "./projectReport";

const snapshot = {
  project: { id: 1, name: "Demo project", description: "A report fixture", createdAt: "2026-08-17T08:00:00.000Z" },
  conversations: [{ title: "New build", updatedAt: "2026-08-17T08:01:00.000Z" }],
  generatedFiles: [{ path: "client/src/App.tsx", language: "tsx" }],
  events: [{ eventType: "checkpoint.saved", createdAt: "2026-08-17T08:02:00.000Z" }],
  messageCount: 2,
  sourceCount: 1,
  uploadCount: 0,
  generatedAt: new Date("2026-08-17T08:03:00.000Z"),
};

describe("SmartBuild project reports", () => {
  it("creates a quoted CSV report from actual project summaries", () => {
    const csv = createProjectReportCsv(snapshot);
    expect(csv).toContain('"project","name","Demo project"');
    expect(csv).toContain('"summary","generated files","1"');
    expect(csv).toContain('"generated file","client/src/App.tsx","tsx"');
  });

  it("creates a valid PDF envelope without raw conversation content", () => {
    const pdf = createProjectReportPdf(snapshot).toString("utf8");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("SmartBuild project report");
    expect(pdf).toContain("Generated files: 1");
  });

  it("uses a safe report filename", () => {
    expect(safeReportFileName("Demo Project / 2026")).toBe("demo-project-2026");
    expect(safeReportFileName("***")).toBe("smartbuild-project");
  });
});
