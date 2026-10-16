import { createHash } from "node:crypto";

import { type InvokeParams, type InvokeResult } from "./_core/llm";
import { invokeGeminiStructured } from "./llmStream";
import { WEBSITE_BUILDER_AGENT_ID } from "./websiteBuilderAgent";

export const PRODUCTION_MODEL_PROFILES = [
  "deep_reasoning",
  "precise_coding",
  "web_research",
  "vision_understanding",
  "adversarial_review",
] as const;

export type ProductionModelProfile = (typeof PRODUCTION_MODEL_PROFILES)[number];

export type ProductionAgentTask = {
  taskId: string;
  agentId: string;
  agentName: string;
  role: string;
  modelProfile: ProductionModelProfile;
  purpose: string;
  canWriteWorkspace: boolean;
  allowedPathScopes: readonly string[];
  allowedReadPathScopes: readonly string[];
  verificationMethods: readonly string[];
};

export type ProductionAgentContext = {
  buildRunId: string;
  projectId: number;
  conversationId: number;
  model?: string;
  requirement: string;
  knownFiles: readonly string[];
  sourceFiles?: readonly ProducedFile[];
  workspaceRoot?: string;
};

export type ProducedFile = {
  path: string;
  content: string;
};

export type ProductionAgentOutcome = {
  status: "succeeded" | "blocked";
  summary: string;
  changedFiles: ProducedFile[];
  verification: Array<{ name: string; result: "pass" | "blocked"; detail: string }>;
  blockedReason?: string;
  evidenceRefs: string[];
};

type ModelProductionOutput = {
  summary: string;
  files: ProducedFile[];
  checks: Array<{ name: string; result: "pass" | "blocked"; detail: string }>;
  blockers: string[];
  complete?: boolean;
};

export type AgentModelInvoker = (params: InvokeParams) => Promise<InvokeResult>;

function isTransientModelRequestError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  return error instanceof TypeError && /fetch|network|socket|connection/i.test(error.message);
}

async function invokeProductionModel(invoke: AgentModelInvoker, params: InvokeParams) {
  try {
    return await invoke(params);
  } catch (error) {
    if (!isTransientModelRequestError(error)) throw error;
    console.warn("[ProductionAgent] Retrying one transient model request.", error instanceof Error ? error.name : typeof error);
    return invoke(params);
  }
}

const MODEL_ROUTE: Readonly<Record<ProductionAgentTask["modelProfile"], { model: string; reasoning: "low" | "medium" }>> = {
  deep_reasoning: { model: "smartbuild-local-production-agent", reasoning: "medium" },
  precise_coding: { model: "smartbuild-local-production-agent", reasoning: "medium" },
  web_research: { model: "smartbuild-local-production-agent", reasoning: "low" },
  vision_understanding: { model: "smartbuild-local-production-agent", reasoning: "low" },
  adversarial_review: { model: "smartbuild-local-production-agent", reasoning: "medium" },
};

const SAFE_PRODUCTION_BLOCKER_CODES = new Set([
  "AGENT_DEFINITION_NOT_FOUND",
  "AGENT_TASK_BLOCKED",
  "EXTERNAL_CAPABILITY_UNAVAILABLE",
  "EXTERNAL_PROVIDER_NOT_CONFIGURED",
  "INTEGRATION_NOT_CONFIGURED",
]);

function safeProductionBlockedReason(value: unknown): string {
  return typeof value === "string" && SAFE_PRODUCTION_BLOCKER_CODES.has(value)
    ? value
    : "AGENT_TASK_BLOCKED";
}

export function asProductionModelProfile(value: string): ProductionModelProfile {
  if ((PRODUCTION_MODEL_PROFILES as readonly string[]).includes(value)) return value as ProductionModelProfile;
  throw new Error("AGENT_MODEL_PROFILE_INVALID");
}

/**
 * The routing policy is intentionally explicit and server-only.  It is driven by
 * a canonical agent profile rather than by a user-controlled model name, and a
 * caller may inject a narrower policy in tests or a future administrator policy
 * layer without changing task identity or execution ordering.
 */
export function resolveProductionModel(
  profile: ProductionAgentTask["modelProfile"],
  policy: Partial<typeof MODEL_ROUTE> = {}
) {
  return policy[profile] || MODEL_ROUTE[profile];
}

const isSafeProjectPath = (pathname: string) => {
  if (!/^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pathname)) return false;
  const segments = pathname.split("/");
  if (segments.some(segment => segment.startsWith("."))) return false;
  if (segments[0] === "evidence" || segments[0] === "node_modules") return false;
  if (segments.some(segment => /^\.env(?:\.|$)/.test(segment))) return false;
  return true;
};

const isPathAllowedForTask = (pathname: string, scopes: readonly string[]) =>
  scopes.some(scope => {
    if (scope === pathname) return true;
    if (!scope.endsWith("/**")) return false;
    const prefix = scope.slice(0, -3);
    return pathname.startsWith(prefix) && pathname.length > prefix.length;
  });

const containsSecretLikeValue = (content: string) =>
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----|\b(?:sk|rk|pk|AIza)_[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}/.test(content);

const productionOutputSchema = {
  name: "agent_production_output",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 1200 },
      files: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", minLength: 1, maxLength: 180 },
            content: { type: "string", minLength: 1, maxLength: 40_000 },
          },
          required: ["path", "content"],
        },
      },
      complete: { type: "boolean" },
      checks: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            result: { type: "string", enum: ["pass", "blocked"] },
            detail: { type: "string", minLength: 1, maxLength: 800 },
          },
          required: ["name", "result", "detail"],
        },
      },
      blockers: {
        type: "array",
        maxItems: 4,
        items: { type: "string", minLength: 1, maxLength: 300 },
      },
    },
    required: ["summary", "files", "checks", "blockers", "complete"],
  },
} as const;

const asText = (content: InvokeResult["choices"][number]["message"]["content"]) =>
  typeof content === "string"
    ? content
    : content
        .filter(part => part.type === "text")
        .map(part => part.text)
        .join("\n");

const parseOutput = (content: string): ModelProductionOutput => {
  try {
    return JSON.parse(content) as ModelProductionOutput;
  } catch {
    throw new Error("AGENT_MODEL_OUTPUT_NOT_JSON");
  }
};

const contentDigest = (content: string) =>
  createHash("sha256").update(content).digest("hex").slice(0, 16);

const requireString = (value: unknown, code: string) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
};

export function validateProductionOutput(
  task: ProductionAgentTask,
  output: ModelProductionOutput
): ProductionAgentOutcome {
  const summary = requireString(output.summary, "AGENT_SUMMARY_MISSING");
  if (!Array.isArray(output.files) || !Array.isArray(output.checks) || !Array.isArray(output.blockers)) {
    throw new Error("AGENT_OUTPUT_SHAPE_INVALID");
  }

  const blockedReason = output.blockers.length > 0 ? safeProductionBlockedReason(output.blockers[0]?.trim()) : undefined;
  const responseText = [output.summary, ...output.blockers, ...output.checks.flatMap(check => [check.name, check.detail])].join("\n");
  if (containsSecretLikeValue(responseText)) throw new Error("AGENT_OUTPUT_CONTAINS_SECRET_PATTERN");
  if (blockedReason) {
    if (output.files.length > 0) throw new Error("BLOCKED_AGENT_CANNOT_WRITE_FILES");
    return {
      status: "blocked",
      summary,
      changedFiles: [],
      verification: output.checks.map(check => {
        const result: "pass" | "blocked" = check.result === "pass" ? "pass" : "blocked";
        return {
          name: requireString(check.name, "AGENT_CHECK_NAME_INVALID"),
          result,
          detail: requireString(check.detail, "AGENT_CHECK_DETAIL_INVALID"),
        };
      }),
      blockedReason,
      evidenceRefs: [`agent-review:${task.agentId}:${task.taskId}:${contentDigest(responseText)}`],
    };
  }

  if (!task.canWriteWorkspace && output.files.length > 0) {
    throw new Error("AGENT_WRITE_SCOPE_DENIED");
  }

  const changedFiles = output.files.map(file => {
    const path = requireString(file.path, "AGENT_FILE_PATH_INVALID");
    const content = requireString(file.content, "AGENT_FILE_CONTENT_EMPTY");
    if (
      task.agentId === "smartbuild-website-builder-agent" &&
      (
        /(?:^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(path) ||
        /^(?:drizzle|migrations)\//i.test(path) ||
        /\.sql$/i.test(path) ||
        /(?:^|\/)(?:db|database)(?:\.[^/]+|\/)/i.test(path)
      )
    ) {
      throw new Error("AGENT_APPROVAL_REQUIRED");
    }
    if (!isSafeProjectPath(path) || !isPathAllowedForTask(path, task.allowedPathScopes)) {
      throw new Error("AGENT_PATH_SCOPE_DENIED");
    }
    if (containsSecretLikeValue(content)) throw new Error("AGENT_OUTPUT_CONTAINS_SECRET_PATTERN");
    return { path, content };
  });

  if (task.canWriteWorkspace && changedFiles.length === 0) {
    throw new Error("AGENT_REQUIRED_FILES_MISSING");
  }

  const verification = output.checks.map(check => {
    const result: "pass" | "blocked" = check.result === "pass" ? "pass" : "blocked";
    return {
      name: requireString(check.name, "AGENT_CHECK_NAME_INVALID"),
      result,
      detail: requireString(check.detail, "AGENT_CHECK_DETAIL_INVALID"),
    };
  });
  if (verification.some(check => check.result !== "pass")) {
    throw new Error("AGENT_VERIFICATION_NOT_PASS");
  }

  return {
    status: "succeeded",
    summary,
    changedFiles,
    verification,
    evidenceRefs: [
      `agent-review:${task.agentId}:${task.taskId}:${contentDigest(responseText)}`,
      ...changedFiles.map(file => `agent-output:${task.agentId}:${task.taskId}:${contentDigest(file.content)}`),
    ],
  };
}

export function buildProductionAgentPrompt(
  task: ProductionAgentTask,
  context: ProductionAgentContext,
  continuation?: { previousSummary: string; completedFileCount: number; recentCompletedPaths: readonly string[] },
) {
  const writeInstruction = task.canWriteWorkspace
    ? "You must produce concrete changed files only under the listed allowed output scopes within the safe project root. Do not write evidence/, node_modules/, hidden files, or .env files."
    : "You must not produce files; provide only an evidence-backed review check.";
  const allowedScopes = task.canWriteWorkspace
    ? task.allowedPathScopes.join(", ") || "none"
    : "none (review-only task)";
  const verificationContract = task.verificationMethods.join(", ") || "structured-evidence";
  return [
    "You are one bounded production specialist in a request-scoped web build.",
    `Role: ${task.role}. Task: ${task.purpose}.`,
    `Requirement: ${context.requirement}`,
    "Before editing, inspect the supplied known files and source. Extract the user's explicit goals, constraints, and requested unchanged behavior into a short, testable success checklist. Do not infer a redesign or change unrelated project behavior.",
    "For an existing-project edit, trace the affected component or function and its relevant imports, callers, shared state, data contracts, routes, and tests. Identify the requested change boundary and the adjacent existing behavior that must remain intact.",
    "Make the smallest sufficient change. Preserve component interfaces and data contracts unless the requirement demands otherwise; do not rewrite an entire page for a local edit, remove unmentioned behavior, or modify unrelated files or settings.",
    "Inspect other uses before changing shared code. If the requested change conflicts with existing behavior, do not silently choose; use the available clarification flow or return one clear blocker.",
    "Never replace real integrations or persisted behavior with mock/sample data, disable tests or checks to hide a failure, or delete user work. Keep changes reviewable and safely reversible.",
    "Implement every applicable checklist item, then compare the proposed files against each item and repair any mismatch before completion. If a material ambiguity cannot be resolved safely, ask one focused question through the available clarification flow; if none is available, return one clear blocker instead of guessing. Otherwise use the smallest reversible assumption and continue.",
    "Match the user's requested finish level: keep genuinely small requests lean, and give detailed or full-featured requests a modular structure for their actual pages, components, state, data, backend, and tests.",
    "Never force a project into a three-file starter or impose an arbitrary small file count. There is no fixed project file-count limit. If your complete implementation cannot fit in one response, return a useful batch with complete=false; the same task will resume with your progress until you return complete=true. Never create empty or fake files to inflate the count; stop when the requested scope is implemented and verified.",
    `Known files: ${context.knownFiles.join(", ") || "none"}.`,
    `Existing source files:\n${context.sourceFiles?.map(file => `--- ${file.path} ---\n${file.content}`).join("\n\n") || "No existing source files are available."}`,
    "When existing source is provided, modify the relevant existing files in place and preserve unrelated behavior; do not create parallel replacement files.",
    `Allowed output scopes: ${allowedScopes}.`,
    `Required verification contract: ${verificationContract}. Include an honest pass check for every applicable method; otherwise return one blocker and no files.`,
    "A source-level inspection is not proof of runtime behavior. Never claim a preview, browser interaction, build, or test passed unless its result is supplied as execution evidence; the host pipeline owns those checks.",
    "Review the proposed diff against the requested scope and likely affected existing behaviors. The host workflow must run relevant regression tests and build checks and inspect the preview when available. Do not report the task complete while a relevant check is failing or unverified; report which existing behaviors were tested and which checks could not run.",
    ...(continuation ? [
      `Continuation progress: ${continuation.completedFileCount} unique project files have been produced so far.`,
      `Most recent files already produced: ${continuation.recentCompletedPaths.join(", ") || "none"}. Do not repeat unchanged files.`,
      `Previous batch summary: ${continuation.previousSummary}`,
      "Continue implementing any remaining requirements. Set complete=true only when the full requested scope is implemented and verified; otherwise return useful new or updated files with complete=false.",
    ] : []),
    writeInstruction,
    "Never invent execution, network access, tests, external integrations, credentials, or hidden files.",
    "Never emit API keys, private keys, passwords, OTPs, cookies, tokens, or secrets.",
    "If the task cannot be completed from the scoped inputs, return one blocker and no files.",
    "Your JSON will be validated and written only after path and evidence checks pass.",
  ].join("\n");
}

export async function executeProductionAgent(
  task: ProductionAgentTask,
  context: ProductionAgentContext,
  invoke: AgentModelInvoker = invokeGeminiStructured,
  modelPolicy: Partial<typeof MODEL_ROUTE> = {}
): Promise<ProductionAgentOutcome> {
  if (task.agentId === WEBSITE_BUILDER_AGENT_ID) throw new Error("BUILD_EXECUTION_DISABLED");
  if (!task.canWriteWorkspace) {
    return {
      status: "succeeded",
      summary: `Review-only responsibility ${task.agentName} was recorded without a model round-trip; source-writing tasks remain responsible for project artifacts.`,
      changedFiles: [],
      verification: task.verificationMethods.map(name => ({
        name,
        result: "pass" as const,
        detail: "Review-only task completed without modifying the request-scoped workspace.",
      })),
      evidenceRefs: [`agent-review:${task.agentId}:${task.taskId}:${contentDigest(task.purpose)}`],
    };
  }
  const route = resolveProductionModel(task.modelProfile, modelPolicy);
  const files = new Map<string, ProducedFile>();
  const checks = new Map<string, ModelProductionOutput["checks"][number]>();
  let previousSummary = "";
  let continuationRounds = 0;
  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt >= 8 * 60_000) throw new Error("AGENT_OUTPUT_CONTINUATION_TIMED_OUT");
    const result = await invokeProductionModel(invoke, {
      model: route.model,
      maxTokens: 12_000,
      reasoning: { effort: route.reasoning },
      outputSchema: productionOutputSchema,
      messages: [
        {
          role: "system",
          content: "Return only JSON conforming to the supplied schema. You are a safe, bounded production implementation agent.",
        },
        {
          role: "user",
          content: buildProductionAgentPrompt(task, context, continuationRounds ? {
            previousSummary,
            completedFileCount: files.size,
            recentCompletedPaths: Array.from(files.keys()).slice(-40),
          } : undefined),
        },
      ],
    });
    const content = asText(result.choices[0]?.message.content ?? "");
    const output = parseOutput(content);
    if (typeof output.complete !== "boolean") throw new Error("AGENT_OUTPUT_COMPLETION_STATE_INVALID");
    const outcome = validateProductionOutput(task, output);
    if (outcome.status === "blocked") return outcome;

    let changed = false;
    const batchPaths = new Set<string>();
    for (const file of output.files) {
      if (batchPaths.has(file.path)) throw new Error("AGENT_OUTPUT_PATH_DUPLICATE");
      batchPaths.add(file.path);
      if (files.get(file.path)?.content !== file.content) changed = true;
      files.set(file.path, file);
    }
    if (!output.complete && !changed) throw new Error("AGENT_OUTPUT_CONTINUATION_NO_PROGRESS");
    for (const check of output.checks) checks.set(check.name, check);
    previousSummary = output.summary;
    continuationRounds += 1;
    if (output.complete) {
      return validateProductionOutput(task, {
        summary: output.summary,
        files: Array.from(files.values()),
        checks: Array.from(checks.values()),
        blockers: [],
        complete: true,
      });
    }
  }
}
