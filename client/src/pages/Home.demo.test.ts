import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");
const demoSource = fs.readFileSync(new URL("../components/SyntheticDemoWorkspace.tsx", import.meta.url), "utf8");

describe("Synthetic Demo Workspace", () => {
  it("is visibly labelled as an isolated synthetic workspace and exposes the full evaluation navigation", () => {
    expect(demoSource).toContain("Demo Workspace — synthetic data only.");
    expect(demoSource).toContain("A verified SmartBuild account is required for production access.");
    ["Chat", "Plan", "Build", "Code", "Preview", "Tests", "Logs", "Changes", "Agents", "Evaluators", "Bugs", "Checkpoints", "Export"].forEach(tab => {
      expect(demoSource).toContain(`label: "${tab}"`);
    });
  });

  it("contains deterministic local-only actions and synthetic fixtures", () => {
    ["sendSamplePrompt", "runSyntheticBuild", "runSyntheticTests", "exportSyntheticManifest", "Orbit Notes", "demo-run-synthetic-v1", "syntheticFiles"].forEach(required => {
      expect(demoSource).toContain(required);
    });
    expect(demoSource).toContain("No model, provider, workspace, file, or external service was called.");
    expect(demoSource).toContain("External integrations: <strong>BLOCKED</strong>");
  });

  it("does not reference production identities, routes, write paths, secrets, or external provider success", () => {
    ["CloudWorkspacePanel", "AIChatBox", "createWorkspace", "buildRunExportUrl", "/api/workspace", "/api/build-runs", "/api/cloud", "SMTP_", "RESEND"].forEach(forbidden => {
      expect(demoSource).not.toContain(forbidden);
    });
    expect(demoSource.match(/fetch\(/g)?.length || 0).toBe(0);
  });

  it("only enters the isolated surface when the user explicitly selected Demo and clears stale selections", () => {
    expect(source).toContain("if (demoModeIsActive) return <DemoModeWorkspace");
    expect(source).toContain("if (demoMode && !isDemoPreferenceSelected())");
    expect(source).toContain("<SyntheticDemoWorkspace onExit={onExit} />");
    expect(source).toContain("setDemoMode(isDemoSession)");
  });
});
