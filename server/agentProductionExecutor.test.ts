import { describe, expect, it, vi } from "vitest";

import {
  buildProductionAgentPrompt,
  executeProductionAgent,
  resolveProductionModel,
  validateProductionOutput,
  type ProductionAgentContext,
  type ProductionAgentTask,
} from "./agentProductionExecutor";

const writer: ProductionAgentTask = {
  taskId: "task-ui",
  agentId: "agent_005",
  agentName: "Functional Component Engineer",
  role: "Builds functional interface behavior.",
  modelProfile: "precise_coding",
  purpose: "Implement the request-scoped interface.",
  canWriteWorkspace: true,
  allowedPathScopes: ["index.html", "styles.css", "client/**", "components/**"],
  verificationMethods: ["structured-evidence"],
};

const reviewer: ProductionAgentTask = { ...writer, taskId: "task-review", agentId: "agent_009", canWriteWorkspace: false };
const context: ProductionAgentContext = {
  buildRunId: "run-a", projectId: 1, conversationId: 2, requirement: "Create an accessible product page.", knownFiles: [],
};

describe("production agent executor", () => {
  it("accepts scoped produced files and derives content-addressed evidence", () => {
    const outcome = validateProductionOutput(writer, {
      summary: "Implemented the product page.",
      files: [{ path: "client/App.tsx", content: "export function App(){ return <main /> }" }],
      checks: [{ name: "scope", result: "pass", detail: "The file remains under the approved project root." }],
      blockers: [],
    });
    expect(outcome.status).toBe("succeeded");
    expect(outcome.evidenceRefs).toHaveLength(2);
    expect(outcome.evidenceRefs[0]).toMatch(/^agent-review:agent_005:task-ui:[a-f0-9]{16}$/);
    expect(outcome.evidenceRefs[1]).toMatch(/^agent-output:agent_005:task-ui:[a-f0-9]{16}$/);
  });

  it("accepts large scoped file batches without imposing a file-count limit", () => {
    const files = Array.from({ length: 100 }, (_, index) => ({
      path: `client/generated/module-${index}.ts`,
      content: `export const module${index} = ${index};`,
    }));
    const output = {
      summary: "Implemented a modular project.",
      files,
      checks: [{ name: "scope", result: "pass" as const, detail: "All files remain in the approved scope." }],
      blockers: [],
    };

    expect(validateProductionOutput(writer, output).changedFiles).toHaveLength(100);
  });

  it("continues in batches until the project is complete, without a total file-count ceiling", async () => {
    const makeBatch = (start: number, count: number, complete: boolean) => ({
      summary: `Implemented files ${start} through ${start + count - 1}.`,
      files: Array.from({ length: count }, (_, offset) => {
        const index = start + offset;
        return { path: `client/generated/module-${index}.ts`, content: `export const module${index} = ${index};` };
      }),
      checks: [{ name: `batch-${start}`, result: "pass", detail: "Every emitted source file passed scoped-output validation." }],
      blockers: [],
      complete,
    });
    const invoke = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(makeBatch(0, 50, false)) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(makeBatch(50, 50, false)) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(makeBatch(100, 10, true)) } }] });

    const outcome = await executeProductionAgent(writer, context, invoke);

    expect(outcome.status).toBe("succeeded");
    expect(outcome.changedFiles).toHaveLength(110);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls[1]?.[0].messages[1]?.content).toContain("50 unique project files have been produced so far");
    expect(invoke.mock.calls[2]?.[0].messages[1]?.content).toContain("100 unique project files have been produced so far");
  });

  it("retries one transient provider connection failure before parsing output", async () => {
    const output = {
      summary: "Implemented the requested page.",
      files: [{ path: "client/App.tsx", content: "export function App(){ return <main /> }" }],
      checks: [{ name: "scope", result: "pass", detail: "The output remains inside the approved scope." }],
      blockers: [],
      complete: true,
    };
    const invoke = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(output) } }] });

    const outcome = await executeProductionAgent(writer, context, invoke);

    expect(outcome.status).toBe("succeeded");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent Gemini quota response", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("GEMINI_STRUCTURED_HTTP_429"));

    await expect(executeProductionAgent(writer, context, invoke)).rejects.toThrow("GEMINI_STRUCTURED_HTTP_429");
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("stops with an explicit error if an incomplete batch makes no file progress", async () => {
    const output = {
      summary: "Still implementing the project.",
      files: [{ path: "client/App.tsx", content: "export function App(){ return <main /> }" }],
      checks: [{ name: "scope", result: "pass", detail: "The output is scoped." }],
      blockers: [],
      complete: false,
    };
    const invoke = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(output) } }],
    });

    await expect(executeProductionAgent(writer, context, invoke)).rejects.toThrow("AGENT_OUTPUT_CONTINUATION_NO_PROGRESS");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("rejects a write from a non-writing agent", () => {
    expect(() => validateProductionOutput(reviewer, {
      summary: "Review complete.",
      files: [{ path: "README.md", content: "unexpected" }],
      checks: [{ name: "scope", result: "pass", detail: "Reviewed." }],
      blockers: [],
    })).toThrow("AGENT_WRITE_SCOPE_DENIED");
  });

  it("rejects path traversal and secret-like output", () => {
    expect(() => validateProductionOutput(writer, {
      summary: "Unsafe output.", files: [{ path: "../.env", content: "safe" }],
      checks: [{ name: "scope", result: "pass", detail: "No." }], blockers: [],
    })).toThrow("AGENT_PATH_SCOPE_DENIED");
    expect(() => validateProductionOutput(writer, {
      summary: "Unsafe output.", files: [{ path: "client/config.ts", content: "const key = 'sk_12345678901234567890'" }],
      checks: [{ name: "scope", result: "pass", detail: "No." }], blockers: [],
    })).toThrow("AGENT_OUTPUT_CONTAINS_SECRET_PATTERN");
  });

  it("rejects a safe path that is outside the selected agent's team scope", () => {
    expect(() => validateProductionOutput(writer, {
      summary: "Attempted a server-side change.",
      files: [{ path: "server/index.ts", content: "export {}" }],
      checks: [{ name: "scope", result: "pass", detail: "The file has safe syntax but is not a frontend responsibility." }],
      blockers: [],
    })).toThrow("AGENT_PATH_SCOPE_DENIED");
  });

  it("requires explicit approval before package or database changes", () => {
    const websiteTask = {
      ...writer,
      agentId: "smartbuild-website-builder-agent",
      allowedPathScopes: ["client/**", "server/**", "package.json", "drizzle/**"],
    };
    for (const path of ["package.json", "server/db.ts", "drizzle/0001_schema.sql", "migrations/0002.sql"]) {
      expect(() => validateProductionOutput(websiteTask, {
        summary: "Implement the requested feature.",
        files: [{ path, content: "export const changed = true;" }],
        checks: [{ name: "output", result: "pass", detail: "The output is structurally valid." }],
        blockers: [],
        complete: true,
      })).toThrow("AGENT_APPROVAL_REQUIRED");
    }
  });

  it("rejects secret-like data in agent summaries and review checks", () => {
    expect(() => validateProductionOutput(writer, {
      summary: "Review found sk_abcdefghijklmnopqrstuvwxyz", files: [],
      checks: [{ name: "scope", result: "pass", detail: "Scoped." }], blockers: [],
    })).toThrow("AGENT_OUTPUT_CONTAINS_SECRET_PATTERN");
  });

  it("uses the structured-output contract without BYOK fields", async () => {
    const invoke = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        summary: "Implemented the product page.",
        files: [{ path: "client/App.tsx", content: "export function App(){ return <main /> }" }],
        checks: [{ name: "scope", result: "pass", detail: "The file remains scoped." }], blockers: [],
        complete: true,
      }) } }],
    });
    const outcome = await executeProductionAgent(writer, context, invoke);
    expect(outcome.status).toBe("succeeded");
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      model: "smartbuild-local-production-agent", outputSchema: expect.objectContaining({ strict: true }), reasoning: { effort: "medium" },
    }));
    const modelRequest = invoke.mock.calls[0][0] as Record<string, unknown>;
    expect(modelRequest).not.toHaveProperty("byok");
    expect(modelRequest).not.toHaveProperty("apiKey");
    expect(modelRequest).not.toHaveProperty("token");
    expect(modelRequest).toMatchObject({
      maxTokens: 12_000,
      outputSchema: { schema: { properties: { complete: { type: "boolean" }, files: { type: "array" } } } },
    });
    expect(((modelRequest.outputSchema as { schema: { properties: { files: { maxItems?: number } } } }).schema.properties.files)).not.toHaveProperty("maxItems");
  });

  it("uses Gemini for production builds by default, without provider fallback", async () => {
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    const originalGeminiKeys = process.env.GEMINI_API_KEYS;
    const originalGeminiModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = "unit-test-gemini-key";
    delete process.env.GEMINI_API_KEYS;
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        summary: "Implemented locally.",
        files: [{ path: "client/App.tsx", content: "export function App(){ return <main /> }" }],
        checks: [{ name: "scope", result: "pass", detail: "Output is scoped." }],
        blockers: [],
        complete: true,
      }) }] } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const outcome = await executeProductionAgent(writer, context);
      expect(outcome.status).toBe("succeeded");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(requestUrl.origin).toBe("https://generativelanguage.googleapis.com");
      expect(requestUrl.pathname).toContain(":generateContent");
      expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("unit-test-gemini-key");
      expect(requestUrl.search).toBe("");
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
        generationConfig: { responseMimeType: "application/json" },
      });
    } finally {
      vi.unstubAllGlobals();
      if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalGeminiKey;
      if (originalGeminiKeys === undefined) delete process.env.GEMINI_API_KEYS;
      else process.env.GEMINI_API_KEYS = originalGeminiKeys;
      if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = originalGeminiModel;
    }
  });

  it("writes no files when a scoped agent reports a blocker", () => {
    const outcome = validateProductionOutput(writer, {
      summary: "A configured external integration is required.", files: [],
      checks: [{ name: "provider", result: "blocked", detail: "No configured provider is available." }],
      blockers: ["EXTERNAL_PROVIDER_NOT_CONFIGURED"],
    });
    expect(outcome).toMatchObject({ status: "blocked", changedFiles: [], blockedReason: "EXTERNAL_PROVIDER_NOT_CONFIGURED" });
  });

  it("normalizes a free-form model blocker before it can reach the durable worker", () => {
    const outcome = validateProductionOutput(writer, {
      summary: "A dependency cannot be used.", files: [],
      checks: [{ name: "provider", result: "blocked", detail: "The provider is unavailable." }],
      blockers: ["provider rejected recipient@example.test"],
    });
    expect(outcome).toMatchObject({ status: "blocked", blockedReason: "AGENT_TASK_BLOCKED" });
    expect(JSON.stringify(outcome)).not.toContain("recipient@example.test");
  });

  it("builds a constrained prompt with explicit output scopes and verification contract without embedding credentials", () => {
    const prompt = buildProductionAgentPrompt(writer, context);
    expect(prompt).toContain("safe project root");
    expect(prompt).toContain("Never force a project into a three-file starter");
    expect(prompt).toContain("Match the user's requested finish level");
    expect(prompt).toContain("Extract the user's explicit goals, constraints, and requested unchanged behavior");
    expect(prompt).toContain("trace the affected component or function and its relevant imports, callers, shared state, data contracts, routes, and tests");
    expect(prompt).toContain("do not rewrite an entire page for a local edit");
    expect(prompt).toContain("Never replace real integrations or persisted behavior with mock/sample data");
    expect(prompt).toContain("Review the proposed diff against the requested scope");
    expect(prompt).toContain("compare the proposed files against each item");
    expect(prompt).toContain("Never claim a preview, browser interaction, build, or test passed");
    expect(prompt).toContain("Allowed output scopes: index.html, styles.css, client/**, components/**.");
    expect(prompt).toContain("Required verification contract: structured-evidence.");
    expect(prompt).toContain("Never emit API keys");
    expect(prompt).not.toContain("server/**");
  });

  it("includes current source code so edit tasks can preserve and modify existing files", () => {
    const prompt = buildProductionAgentPrompt(writer, {
      ...context,
      sourceFiles: [{ path: "src/App.tsx", content: "export const App = () => <main>Existing project</main>;" }],
    });

    expect(prompt).toContain("--- src/App.tsx ---");
    expect(prompt).toContain("Existing project");
    expect(prompt).toContain("modify the relevant existing files in place");
  });

  it("routes each canonical model profile through an explicit server-side policy", () => {
    expect(resolveProductionModel("precise_coding")).toEqual({ model: "smartbuild-local-production-agent", reasoning: "medium" });
    expect(resolveProductionModel("deep_reasoning")).toEqual({ model: "smartbuild-local-production-agent", reasoning: "medium" });
    expect(resolveProductionModel("adversarial_review", { adversarial_review: { model: "local-review-model", reasoning: "low" } }))
      .toEqual({ model: "local-review-model", reasoning: "low" });
  });
});
