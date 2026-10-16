import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("SmartBuild agent evidence presentation", () => {
  it("separates the current canonical registry from selected, executed, and skipped Build-Run evidence", () => {
    expect(source).toContain('aria-label="Current agent registry and execution counts"');
    expect(source).toContain("Current canonical agent registry");
    expect(source).toContain("registered</p>");
    expect(source).toContain("selected</p>");
    expect(source).toContain("executed</p>");
    expect(source).toContain("skipped</p>");
    expect(source).toContain('"RUNNING", "SUCCEEDED", "FAILED", "BLOCKED"');
  });

  it("renders a scoped production outcome breakdown without converting a dry-run plan into execution", () => {
    expect(source).toContain('aria-label="Build-Run-scoped agent outcome breakdown"');
    expect(source).toContain('Succeeded ${evidence.totals.succeeded}');
    expect(source).toContain('No production outcome is inferred from this dry-run plan.');
    expect(source).toContain('executionMode === "production"');
  });

  it("labels pre-expansion plans as historical without changing their stored count", () => {
    expect(source).toContain('aria-label="Agent registry context"');
    expect(source).toContain("Historical agent plan");
    expect(source).toContain("before the 300-agent expansion");
    expect(source).toContain("Current canonical registry: 300 registered agents.");
    expect(source).toContain("It is retained unchanged");
  });

  it("labels original and additive reports plus structured work-product manifests without exposing contents", () => {
    expect(source).toContain('aria-label="Scoped agent artifacts"');
    expect(source).toContain('"ORIGINAL_REPORT" ? "Original responsibility report"');
    expect(source).toContain('"ADDITIVE_REPORT" ? "Additive report"');
    expect(source).toContain('"WORK_PRODUCT_MANIFEST" ? "Work-product manifest"');
    expect(source).not.toContain("workProductManifestContent");
    expect(source).not.toContain("originalResponsibilityReportContent");
  });

  it("uses the API-safe artifact path contract and only renders aggregate execution counts", () => {
    expect(source).toContain("artifactDetails: Array<{ path: string");
    expect(source).toContain('aria-label="Safe execution summary"');
    expect(source).toContain('aria-label="Safe Python execution metadata"');
    expect(source).toContain("Persisted counts:");
    expect(source).toContain("Python counts:");
    expect(source).not.toContain("executionSummary.summary");
    expect(source).not.toContain("executionSummary.provider");
    expect(source).not.toContain("executionSummary.pythonExecution.log");
    expect(source).not.toContain("executionSummary.pythonExecution.output");
  });

  it("renders a safe selection code rather than a free-text planning explanation", () => {
    expect(source).toContain('aria-label="Safe agent selection reason"');
    expect(source).toContain("Selection: {agent.selectionReason}");
    expect(source).toContain("selectionReason: string");
    expect(source).not.toContain("selectedReasonExplanation");
  });

  it("shows only the safe implementation fingerprint beside existing execution timing", () => {
    expect(source).toContain('aria-label="Safe agent implementation fingerprint"');
    expect(source).toContain("Implementation fingerprint: {agent.implementationHash}");
    expect(source).toContain("new Date(agent.timestamp).toLocaleString()");
    expect(source).not.toContain("implementationSourcePath");
    expect(source).not.toContain("implementationSourceContent");
  });

  it("uses a Build-Run-scoped unique render key for ambiguous evidence rows", () => {
    expect(source).toContain('key={`${evidence.tuple.buildRunId}:${agent.id}:${agent.sequence ?? "unsequenced"}:${index}`}');
    expect(source).not.toContain("<article key={agent.id}");
  });
});
