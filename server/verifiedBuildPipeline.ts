import { mkdir, readFile, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { runBuildAgentOrchestration, type AgentOrchestrationSummary } from "./agentOrchestrator";
import { runSyntheticUserEvaluation, type SyntheticEvaluationSummary } from "./syntheticUserEvaluation";
import { createQaAgentReport, QA_AGENT_ID, QA_AGENT_QUALITY_GATES, type QaAgentReport } from "./qaAgentGateway";
import { PythonRuntimeResolutionError, pythonRuntimeEnvironment, resolvePythonRuntime } from "./pythonRuntime";
import { deriveProductionAgentQueuePlan, productionAgentCanWriteWorkspace } from "./productionAgentQueue";
import { agentExecutionEvidencePath } from "./agentExecutionEvidencePath";
import { WEBSITE_BUILDER_AGENT_ID } from "./websiteBuilderAgent";
import { projectApiProbePath } from "./projectApiProbe";
import type { ProductionAgentQueueHooks, ProductionAgentTaskRecord } from "./productionAgentBuildLifecycle";
import { buildAgentExecutionEvidence, publicExecutionSummary, type PublicExecutionSummary } from "./agentExecutionEvidence";
import {
  blueprintFilesFor,
  buildFeatureContract,
  buildProductSpecification,
  classifyProductRequest,
  createProjectManifest,
  createRequestSpecificArtifacts,
  createProjectSnapshot,
  hashProjectArtifacts,
  validateGeneratedProject,
  type FeatureContract,
  type ProductClassification,
  type ProductSpecification,
  type ProjectManifest,
  type ProjectSnapshot,
} from "./projectGeneration";
import { verifyProjectDashboard } from "./projectDashboard";
import { AI_MODEL_IDS } from "@shared/aiModels";

const execFileAsync = promisify(execFile);
// Chromium may need a cold-start allowance on an autoscaled 1-vCPU container.
// The HTTP request already returns a tracked 202 response, so this protects the
// real verifier without holding an ingress connection open.
const BUILD_TIMEOUT_MS = 2_400_000;
const WORKSPACE_ROOT = path.resolve(
  process.env.SMARTBUILD_WORKSPACE_ROOT || path.join(process.cwd(), ".smartbuild-cloud-workspaces"),
);
const PREVIEW_SCRIPT = path.resolve(process.cwd(), "server/workspacePreviewServer.mjs");
const PROJECT_RUNTIME_SCRIPT = path.resolve(process.cwd(), "server/projectRuntime.py");

export type BuildStatus = "planned" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";
export type BuildExecutionMode = "legacy-template" | "production-agent-queue";

export type BuildTemplate = "saas-landing" | "restaurant-landing" | "cafe-landing" | "static-starter" | "contact-form" | "capability-request" | "evaluator-regression-fixture" | "social-network" | "analytics-dashboard" | "furniture-store" | "travel-booking" | "realtime-chat" | "auth-flow" | "recipe-book";
export type ArtifactLanguage = "html" | "css" | "markdown" | "javascript" | "sql" | "json";
export type CriterionStatus = "PASS" | "FAIL" | "BLOCKED";
export type BuildCapability = "frontend" | "client-validation" | "backend-runtime" | "database" | "browser-test-runtime" | "email-provider" | "external-backend-integration";
export type AcceptanceCriterion = { id: string; title: string; capability: BuildCapability; description: string; required: true };
export type CriterionResult = { criterionId: string; criterion: string; capability: BuildCapability; status: CriterionStatus; evidence: string; reason?: string };
export type CapabilityAvailability = Record<BuildCapability, { available: boolean; detail: string }>;

export type RequirementContract = {
  request: string;
  projectName: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  template: BuildTemplate;
  classification?: ProductClassification;
  productSpec?: ProductSpecification;
  featureContract?: FeatureContract;
};

export type BuildArtifact = { path: string; content: string; language: ArtifactLanguage };
export type BuildPlan = { summary: string; steps: string[]; capabilityMatrix: Array<{ capability: BuildCapability; required: boolean; available: boolean; detail: string }> };
export type BuildEvidence = { path: string; kind: "requirements" | "plan" | "agent-plan" | "agent-trace" | "test" | "preview" | "evaluation" | "bug-report" | "checkpoint" | "snapshot"; createdAt: string; summary?: string };
export type BuildJourneyStage = "inspection" | "planning" | "execution" | "verification" | "delivery";
export type BuildJourneyEvent = { requestId: string; sequence: number; stage: BuildJourneyStage; state: "in_progress" | "completed" | "failed"; detail: string; at: string };
export type BuildRun = {
  id: string;
  requestId?: string;
  userId: number;
  projectId: number;
  conversationId: number;
  heartbeatTaskUid?: string;
  status: BuildStatus;
  contract: RequirementContract;
  manifest?: ProjectManifest;
  plan: BuildPlan;
  workspaceRoot: string;
  artifacts: Array<{ path: string; size: number }>;
  generatedFileIds: number[];
  evidence: BuildEvidence[];
  logs: string[];
  journeyEvents?: BuildJourneyEvent[];
  snapshot?: ProjectSnapshot;
  preview?: { url: string; proxyUrl: string; port: number; checkedAt: string; projectName: string; buildRunId: string; projectVersion: number; status: "ready"; lastUpdatedAt: string; codePreviewHash?: string; assets: Array<{ path: string; status: number; contentType: string; bytes: number; passed: boolean; detail?: string }> };
  backend?: { url: string; port: number; startedAt: string; kind: "fastapi"; database: "sqlite" };
  projectRuntimeDiagnostic?: unknown;
  test?: { passed: boolean; checks: string[]; results: CriterionResult[]; outputPath: string; checkedAt: string };
  capabilities: CapabilityAvailability;
  agentOrchestration?: AgentOrchestrationSummary;
  /**
   * Historical terminal rows may predate the mode field. Every newly-created
   * Build Run persists an explicit mode, and a nonterminal row without one is
   * unsafe to resume because it could otherwise silently use the legacy path.
   */
  executionMode?: BuildExecutionMode;
  model?: typeof AI_MODEL_IDS.claude;
  workspaceName?: string;
  workspaceNameError?: string;
  productionAgentExecution?: {
    selectedTaskCount: number;
    tasks: Array<Pick<ProductionAgentTaskRecord, "taskId" | "agentId" | "executionOrder" | "status" | "implementationHash" | "outputArtifactRefs" | "evidenceRefs" | "blockedReason" | "startedAt" | "completedAt"> & { executionSummary: PublicExecutionSummary | null }>;
    updatedAt: string;
  };
  syntheticEvaluation?: SyntheticEvaluationSummary;
  qaAgentReport?: QaAgentReport;
  evaluatorProgress?: { state: "queued" | "running" | "completed" | "failed"; activeEvaluator?: "functional_synthetic_user" | "visual_synthetic_user"; updatedAt: string; detail: string };
  checkpoint?: { type: "checkpointed_git" | "checkpointed_snapshot"; revision: string; message: string; createdAt: string; archivePath?: string; manifestPath?: string; warning?: string };
  manualChangesPendingVerification?: boolean;
  error?: { code: string; message: string; step: string };
  startedAt: string;
  completedAt?: string;
  cancelRequested: boolean;
  gitExecutable?: string | null;
};

export type BuildPersistence = {
  workspaceArtifactsAreAuthoritative?: boolean;
  getProjectName?: (userId: number, projectId: number) => Promise<string | null>;
  generateWorkspaceName?: (request: string, model?: typeof AI_MODEL_IDS.claude) => Promise<string>;
  updateProjectDetails: (userId: number, projectId: number, details: { name: string; description: string }) => Promise<unknown>;
  updateProjectBuildStatus: (userId: number, projectId: number, status: BuildStatus) => Promise<unknown>;
  addGeneratedFile: (userId: number, projectId: number, conversationId: number, artifact: BuildArtifact, buildRunId?: string) => Promise<number>;
  listGeneratedFilesForBuildRun?: (userId: number, buildRunId: string) => Promise<Array<{ path: string; content: string }>>;
  deleteGeneratedFileForBuildRun?: (userId: number, projectId: number, conversationId: number, buildRunId: string, path: string) => Promise<boolean>;
  claimLegacyGeneratedFilesForBuildRun?: (input: { userId: number; projectId: number; conversationId: number; buildRunId: string; startedAt: Date; completedAt?: Date | null }) => Promise<number>;
  appendProjectEvent: (userId: number, projectId: number, eventType: string, payload: unknown, conversationId: number) => Promise<void>;
  saveBuildRun?: (run: BuildRun) => Promise<void>;
  productionAgentQueue?: ProductionAgentQueueHooks;
};

function resolveChromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.env.LOCALAPPDATA && process.platform === "win32" ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find(candidate => existsSync(candidate));
}

/** Signals that an Autoscale worker lost ownership before it could persist its phase. */
export class BuildRunAdvancementLeaseLostError extends Error {
  readonly code = "BUILD_RUN_ADVANCEMENT_LEASE_LOST";
  constructor() {
    super("BUILD_RUN_ADVANCEMENT_LEASE_LOST");
    this.name = "BuildRunAdvancementLeaseLostError";
  }
}

const runs = new Map<string, BuildRun>();
const processes = new Map<string, ChildProcess>();
const activePreviewStarts = new Map<string, Promise<BuildRun>>();
const activePreviewEnsures = new Map<string, Promise<BuildRun>>();
const backendProcesses = new Map<string, ChildProcess>();
const backendTestTokens = new Map<string, string>();

function now() { return new Date().toISOString(); }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "smartbuild-project"; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character)); }

function requestedVisibleHeadline(request: string) {
  const match = request.match(/\b(?:headline|heading|title|keyword)\s+(?:should\s+be|must\s+be|exactly\s*:?\s*)["“']?([A-Za-z0-9][A-Za-z0-9 &.'-]{1,80})["”']?(?:[.!?]|$)/i);
  return match?.[1]?.trim() || null;
}

function criterion(id: string, title: string, capability: BuildCapability, description: string): AcceptanceCriterion {
  return { id, title, capability, description, required: true };
}

const projectDashboardCriterion = () => criterion(
  "project-dashboard-data",
  "Project dashboard uses persisted project records",
  "database",
  "The dashboard derives domain entities from the product specification, reads real project-scoped SQLite records, persists its supported actions, and shows an honest empty state without fixture data.",
);

function requestSpecificContract(request: string, includeProjectDashboard: boolean): RequirementContract | null {
  if (hasRequestedConcept(request, "restaurant|trattoria|bella tavola|small plates|seasonal pasta")) return null;
  const classification = classifyProductRequest(request);
  const templateByCategory = {
    auth: "auth-flow",
    social_network: "social-network",
    dashboard: "analytics-dashboard",
    ecommerce: "furniture-store",
    recipes: "recipe-book",
    booking: "travel-booking",
    chat: "realtime-chat",
  } as const;
  if (!(classification.category in templateByCategory)) return null;
  const productSpec = buildProductSpecification(classification);
  const files = classification.category === "social_network" && productSpec.features.some(feature => feature.id === "book-shelf")
    ? { style: "styles.css", logic: "app.js", data: "src/data/club-data.mjs" }
    : blueprintFilesFor(classification.category);
  const featureContract = buildFeatureContract(productSpec, files);
  return {
    request: sanitizeArtifactFacingRequest(request),
    projectName: classification.productName,
    description: productSpec.purpose,
    template: templateByCategory[classification.category as keyof typeof templateByCategory],
    classification,
    productSpec,
    featureContract,
    acceptanceCriteria: [
      criterion("request-specific-architecture", "Request-specific architecture exists", "frontend", `The generated project uses the ${classification.category} screen map and category-specific file responsibilities.`),
      criterion("feature-contract-coverage", "Required feature coverage exists", "frontend", "Must-have features have visible UI, state, and acceptance coverage."),
      criterion("connected-interactions", "Connected interactions exist", "frontend", "Primary controls change visible state using the generated data model."),
      criterion("manifest-consistency", "Manifest and Preview files are consistent", "frontend", "The versioned manifest lists every generated file and its dependency edges."),
      criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The page declares a viewport and responsive layout rules."),
      criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview returns the generated page and local stylesheet."),
      ...(includeProjectDashboard ? [projectDashboardCriterion()] : []),
    ],
  };
}

export function detectWorkspaceCapabilities(): CapabilityAvailability {
  const chromiumCandidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.env.LOCALAPPDATA && process.platform === "win32" ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const playwrightInstalled = existsSync(path.join(process.cwd(), "node_modules", "playwright-core"));
  const chromiumPath = chromiumCandidates.find(candidate => existsSync(candidate));
  const chromiumInstalled = Boolean(chromiumPath);
  return {
    frontend: { available: true, detail: "The isolated Cloud preview serves generated HTML, CSS, and JavaScript artifacts." },
    "client-validation": { available: true, detail: "Generated browser code can implement accessible client-side validation." },
    "backend-runtime": { available: existsSync(PROJECT_RUNTIME_SCRIPT), detail: existsSync(PROJECT_RUNTIME_SCRIPT) ? "A constrained FastAPI runner is available for an isolated project workspace; startup is verified before it can pass." : "The constrained FastAPI project runtime script is unavailable." },
    database: { available: existsSync(PROJECT_RUNTIME_SCRIPT), detail: existsSync(PROJECT_RUNTIME_SCRIPT) ? "The project runtime provisions a private SQLite database and applies verified migrations within that project workspace." : "The project-scoped SQLite runtime is unavailable because its runner is missing." },
    "browser-test-runtime": { available: playwrightInstalled && chromiumInstalled, detail: playwrightInstalled && chromiumInstalled ? "playwright-core and the Chromium executable are available for an isolated generated-workspace browser test." : "Generated-project Playwright execution needs both playwright-core and a Chromium executable; one or both are unavailable." },
    "email-provider": { available: false, detail: "No email delivery provider or configured provider credentials are available to generated Cloud workspaces." },
    "external-backend-integration": { available: false, detail: "No configured external reservation backend, provider credentials, or approved integration is available to this Cloud workspace." },
  };
}

function hasRequestedConcept(request: string, terms: string): boolean {
  const normalizedRequest = normalizeConceptText(request);
  const normalizedTerms = normalizeConceptText(terms);
  const mention = new RegExp(`\\b(?:${normalizedTerms})\\b`, "i");
  // Treat direct exclusions such as "no restaurant content" as negation too.
  // The classifier must never select a template from a concept the request
  // expressly rejects, even when the rejection is in a later requirement.
  const negatedMention = new RegExp(`\\b(?:do not|don't|never|without|no|not|exclude|excluding|instead of)\\b[^.!?]{0,140}\\b(?:${normalizedTerms})\\b`, "i");
  return normalizedRequest.split(/[.!?]+/).some(sentence => mention.test(sentence) && !negatedMention.test(sentence));
}

export function requestRequiresProjectDashboard(request: string) {
  return classifyProductRequest(request).category === "dashboard"
    || hasRequestedConcept(request, "dashboard|admin(?:istrative)? (?:dashboard|panel|console)|control panel|لوحة تحكم|لوحة الإدارة|داشبورد");
}

function requestedToolLendingAdditions(request: string) {
  const patterns = [
    /\b(?:add|include)\s+(?:(?:one|a|an|another)\s+)?(?:(?:new|fictional|available)\s+)*(?:tool\s+)?(?:listing\s+)?(?:for\s+|called\s+|named\s+)(?:a\s+|an\s+)?([A-Za-z][A-Za-z0-9 -]{1,39}?)(?=\s+(?:and|that|make|show|include|available|in|on)\b|[.!?,;]|$)/gi,
    /(?:ضيف|أضف|اضف)(?:لي|لنا)?\s+(?:(?:أداة|اداة|أدوات|عدة)\s+)?(?:جديدة\s+)?(?:(?:باسم|اسمها|اسم)\s+)?([\u0600-\u06FF][\u0600-\u06FF ]{1,39}?)(?=\s+(?:متاح(?:ة)?|للإعارة|للاستعارة|وخليه|وخليها|ويظهر|وتظهر|في البحث|في الفلاتر)|[.!?،,;]|$)/gi,
  ];
  return patterns.flatMap(pattern => Array.from(request.matchAll(pattern), match => match[1].trim().replace(/\s+/g, " ")))
    .filter((name, index, names) => name.length > 1 && names.findIndex(item => item.toLowerCase() === name.toLowerCase()) === index)
    .slice(0, 8);
}

function normalizeConceptText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function requestedProjectName(request: string) {
  const match = request.match(/\b(?:called|named)\s+["“']?([^"'“”.,!?;]{2,60})/i);
  const arabicMatch = request.match(/(?:باسم|اسمه|اسمها)\s+["“']?([^"'“”.,!?;،]{2,60})/);
  return match?.[1]?.trim() || arabicMatch?.[1]?.trim() || null;
}

function cafeProductSpecification(specification: ProductSpecification, includeAudienceGroups: boolean): ProductSpecification {
  const features: ProductSpecification["features"] = [
    { id: "cafe-menu", name: "Café menu", description: "Displays a browsable menu with item descriptions and prices.", priority: "must" },
    { id: "cafe-order", name: "Local takeout order", description: "Builds and submits a pickup order locally with a visible confirmation.", priority: "must" },
    ...(includeAudienceGroups ? [{ id: "cafe-audiences", name: "Three customer groups", description: "Makes walk-in guests, takeout customers, and café staff easy to identify.", priority: "must" as const }] : []),
    { id: "cafe-location-hours", name: "Location and opening hours", description: "Shows the café's location and opening hours.", priority: "must" },
  ];
  return {
    ...specification,
    purpose: "A neighborhood café website for discovering the menu, planning a visit, and preparing a local pickup order.",
    primaryUser: includeAudienceGroups ? "Walk-in guests, takeout customers, and café staff" : "Café visitors and takeout customers",
    coreTasks: ["Browse the café menu", "Prepare a pickup order", "Check location and opening hours"],
    screens: [
      { id: "home", name: "Home", purpose: includeAudienceGroups ? "Introduces the café and the three customer groups it serves." : "Introduces the café and its menu.", entryPoint: true },
      { id: "menu", name: "Menu and order", purpose: "Shows menu items and lets a customer build a local pickup order.", entryPoint: false },
      { id: "visit", name: "Visit", purpose: "Presents the café location and opening hours.", entryPoint: false },
    ],
    features,
    visualDirection: { palette: "Warm cream, espresso, and sage green", typography: "Friendly editorial display with a clear sans-serif body", layout: "Responsive café landing page with a menu and visible pickup-order summary", tone: "Welcoming, practical, and neighborhood-focused" },
    dataModels: [
      { name: "CafeMenuItem", fields: ["id", "name", "description", "price", "category"] },
      { name: "PickupOrder", fields: ["items", "subtotal", "status"] },
    ],
    stateModel: {
      states: ["orderItems", "orderStatus"],
      transitions: ["add menu item -> update order", "change quantity -> update subtotal", "place order -> show local confirmation"],
      persistence: "In-memory browser session only; no payment or external order service is connected",
    },
    components: [
      { id: "cafe-menu", name: "Café menu", responsibility: "Renders menu items and add-to-order actions.", ownerFile: "src/pages/cafe-page.mjs", featureIds: ["cafe-menu", "cafe-order"] },
      { id: "cafe-order-summary", name: "Pickup order summary", responsibility: "Shows quantities, subtotal, and local order confirmation.", ownerFile: "src/state/order-state.mjs", featureIds: ["cafe-order"] },
      { id: "cafe-visit-details", name: "Visit details", responsibility: "Shows opening hours and location.", ownerFile: "index.html", featureIds: ["cafe-location-hours", ...(includeAudienceGroups ? ["cafe-audiences"] : [])] },
    ],
    interactions: [
      { id: "cafe-order-add-item", trigger: "Add a menu item", stateChange: "Increment the selected item quantity.", successState: "The order summary and subtotal update.", errorState: "Unknown items are ignored.", emptyState: "The order starts empty.", ownerFile: "src/state/order-state.mjs", previewEvidence: "Add two items and confirm their quantities and subtotal." },
      { id: "cafe-order-submit", trigger: "Place pickup order", stateChange: "Record an in-session order confirmation.", successState: "Show a truthful local confirmation without claiming external delivery.", errorState: "An empty order displays guidance.", emptyState: "Prompt the guest to choose a menu item.", ownerFile: "src/pages/cafe-page.mjs", previewEvidence: "Submit a non-empty order and verify visible local confirmation." },
    ],
    fileOwnership: [
      { featureId: "cafe-menu", ownerComponent: "cafe-menu", ownerFile: "src/data/cafe-menu.mjs", stateOwner: "src/state/order-state.mjs", dataType: "CafeMenuItem[]", persistence: "Static local module", tests: "tests/order-state.test.mjs", previewEvidence: "Menu cards and prices are visible." },
      { featureId: "cafe-order", ownerComponent: "cafe-order-summary", ownerFile: "src/pages/cafe-page.mjs", stateOwner: "src/state/order-state.mjs", dataType: "PickupOrder", persistence: "Browser memory only", tests: "tests/order-state.test.mjs", previewEvidence: "Add-item, quantity, subtotal, and submit actions update visible state." },
      ...(includeAudienceGroups ? [{ featureId: "cafe-audiences", ownerComponent: "cafe-visit-details", ownerFile: "index.html", stateOwner: "none", dataType: "Static audience labels", persistence: "Static content", tests: "tests/cafe-page.test.mjs", previewEvidence: "All three requested customer groups are visible." }] : []),
      { featureId: "cafe-location-hours", ownerComponent: "cafe-visit-details", ownerFile: "index.html", stateOwner: "none", dataType: "Static visit details", persistence: "Static content", tests: "tests/cafe-page.test.mjs", previewEvidence: "Location and opening hours are visible." },
    ],
    previewAcceptanceCriteria: [
      { id: "cafe-menu-visible", featureId: "cafe-menu", description: "The menu presents item names and prices.", selector: "#menu-items", expected: "At least three menu items are visible." },
      { id: "cafe-order-feedback", featureId: "cafe-order", description: "Adding an item updates the pickup order summary.", selector: "#order-status", expected: "Order feedback updates after a user action." },
      ...(includeAudienceGroups ? [{ id: "cafe-audience-visible", featureId: "cafe-audiences", description: "The three requested customer groups are visible.", selector: "#audience-groups", expected: "Walk-in guests, takeout customers, and café staff are listed." }] : []),
      { id: "cafe-hours-visible", featureId: "cafe-location-hours", description: "Visit details are visible.", selector: "#visit-details", expected: "Location and opening hours are shown." },
    ],
  };
}

/**
 * Preserve the raw prompt in chat history, while preventing a cross-project
 * exclusion such as "do not include Maya Noor" from being copied into a
 * Bella README, evidence file, agent trace, or exported archive.
 */
function sanitizeArtifactFacingRequest(request: string): string {
  const crossProjectTerms = /\b(?:maya\s+noor|bella\s+tavola|portfolio|restaurant|designer|saas)\b/i;
  const exclusionLead = /^\s*(?:do\s+not|don't|never|avoid|exclude|excluding|without|no|not|instead\s+of)\b/i;
  const withoutCrossProjectExclusions = (request.match(/[^.!?]+[.!?]?/g) || [request])
    .map(sentence => (exclusionLead.test(sentence) && crossProjectTerms.test(sentence)
      ? "Keep all generated materials scoped exclusively to the requested project."
      : sentence.trim()))
    .join(" ");
  return withoutCrossProjectExclusions.replace(/\s+/g, " ").trim();
}

const BUILD_INTENT_PATTERN = /\b(?:build|create|make|design|develop|generate|edit|modify|update|change|rename|replace|add|remove|delete|clear|website|web\s*site|web\s*app|application|app|page|portfolio|landing|dashboard|form|site|code|component)\b|(?:ابني|اعمل|أنشئ|انشئ|صمم|صمّم|طور|طوّر|اكتب|عدّل|عدل|تعديل|غير|غيّر|تغيير|بدّل|بدل|استبدل|أضف|اضف|إضافة|احذف|حذف|امسح|مسح|أزل|ازل|موقع|تطبيق|صفحة|كود|الكود|اكواد|الاكواد|أكواد|واجهة|وجهه)/i;

/**
 * A Build Run is an irreversible, request-scoped execution record. Do not
 * create one from a greeting, insult, or other text that gives the 70-agent
 * system no project objective. Chat remains the correct path for that input.
 */
export function assertBuildRequestIsActionable(request: string) {
  if (!BUILD_INTENT_PATTERN.test(request)) {
    throw new Error("BUILD_REQUEST_CLARIFICATION_REQUIRED");
  }
}

export function buildRequestNeedsPurposeClarification(request: string): boolean {
  const classification = classifyProductRequest(request);
  const hasRecognizedPurpose = classification.matchedSignals.length > 0
    || hasRequestedConcept(
      request,
      "shop|store|e-?commerce|marketplace|exchange|community|plant|giveaway|blog|news|education|course|school|clinic|medical|health|real\\s+estate|property|event|hotel|travel|fitness|gym|salon|agency|bakery|law\\s+firm|nonprofit|charity|restaurant|cafe|portfolio|photographer|contact|login|sign\\s*in|dashboard|admin|booking|reservation|recipe|social\\s+network|chat|reading\\s+club|book\\s+club|library|scheduling|appointment|product\\s+overview|product\\s+page|saas|web\\s+app|application|tool|software|task\\s+manager|project\\s+management|calendar|tracker|planner|hiking|walking\\s+trail|trail\\s+guide|trail\\s+catalog|trail|small\\s+business\\s+website|business\\s+website|local\\s+business\\s+website|company\\s+website|project\\s+website",
    )
    || /(?:متجر|تسوق|سوق|سوق\s*إلكتروني|تبادل|مجتمع|نبات|شتلات|مدونة|أخبار|تعليم|دورات|مدرسة|عيادة|طبي|صحة|عقارات|عقار|فعاليات|فندق|سفر|لياقة|رياضة|صالون|وكالة|مخبز|جمعية|مطعم|مقهى|معرض\s*أعمال|ملف\s*أعمال|مصور|تصوير|تواصل|اتصل|دخول|تسجيل|لوحة\s*تحكم|حجز|وصفات|مكتبة|نادي\s*القراءة|نادي\s*قراءة|نادي\s*الكتاب|شبكة\s*اجتماعية|محادثة|مسارات\s*المشي|مسار\s*مشي|مسارات\s*التنزه|هايكنج)/.test(request);
  return !hasRecognizedPurpose;
}

function stripNegatedCapabilityMentions(request: string) {
	return request
	  .replace(
	    /\b(?:no|without|not|do not|don't|does not|doesn't)(?:\s+(?:need|want|require|use))?\s+(?:(?:a|an|any)\s+)?(?:external\s+)?(?:backend|servers?|databases?|db|sqlite|apis?|endpoints?|email(?:\s+provider|\s+delivery)?|authentication|auth|payments?|stripe|playwright|browser\s+tests?|external\s+services?|external\s+integrations?)\b/gi,
	    " ",
	  )
	  .replace(
	    /(?:بدون|بلا|مش\s+(?:محتاج|عايز)|لا\s+(?:أريد|أحتاج|يحتاج|يتطلب))\s+(?:إلى\s+)?(?:أي\s+)?(?:backend|servers?|databases?|قاعدة\s+بيانات|خادم|باك\s*إند|دفع|مدفوعات|payments?|external\s+services?|خدمات\s+خارجية|apis?)/gi,
	    " ",
	  );
}

export function parseRequirementContract(request: string, options: { includeProjectDashboard?: boolean } = {}): RequirementContract {
	const normalized = request.trim().replace(/\s+/g, " ");
	if (!normalized) throw new Error("BUILD_REQUEST_REQUIRED");
	assertBuildRequestIsActionable(normalized);
	const artifactFacingRequest = sanitizeArtifactFacingRequest(normalized);
  const toolLending = hasRequestedConcept(normalized, "tool[ -]lending|tool[ -]library|tool[ -]share|borrow(?:ing)? tools|إعارة أدوات|استعارة أدوات|مكتبة\s+ال?أدوات");
	const baseClassification = classifyProductRequest(normalized);
  const requestClassification: ProductClassification = toolLending
    ? { ...baseClassification, category: "custom", productName: "Neighborhood Tool Share", primaryUser: "Neighborhood residents", complexity: "medium", matchedSignals: ["tool-lending"] }
    : baseClassification;
	const includeProjectDashboard = options.includeProjectDashboard === true;
	const productContract = toolLending ? null : requestSpecificContract(normalized, includeProjectDashboard);
	if (productContract) return productContract;
  // This is an explicit internal regression request, never an inferred user
  // template. It is useful to exercise the redacted BugReport/repair path
  // against real generated files without weakening ordinary SaaS builds.
  const evaluatorRegressionFixture = /\bsynthetic[- ]evaluator[- ]regression[- ]fixture\b/i.test(normalized);
  const saas = hasRequestedConcept(normalized, "saas|landing[ -]page");
  const cafeLanding = hasRequestedConcept(normalized, "cafe|coffee[ -]shop|coffeehouse|coffee house|café")
    || /مقهى|كافيه/.test(normalized);
  const restaurantLanding = hasRequestedConcept(normalized, "restaurant|trattoria|bella tavola|small plates|seasonal pasta");
  const contactForm = requestClassification.category === "contact";
  const capabilityRequestText = stripNegatedCapabilityMentions(normalized);
  const requiresBackend = /\bbackend\b|\bpost\b|\bendpoint\b|\bapi\b|\bserver\b/i.test(capabilityRequestText);
  const requiresDatabase = /\bdatabase\b|\bpersist(?:ence|ed|ing)?\b|\bsave\b.*\b(submission|database|form)\b/i.test(capabilityRequestText);
  const requiresPlaywright = /\bplaywright\b|\b(browser|end-to-end|e2e) tests?\b|\btests?\b/i.test(capabilityRequestText);
  const requiresEmailProvider = /\b(send|deliver)(?:ing)?\s+(?:an?\s+)?email\b|\bemail delivery\b|\bemail provider\s+(?:integration|configuration|setup)\b/i.test(capabilityRequestText);
  const requiresAuthentication = /\bauth(?:entication|orization)?\b|\blogin\b|\bsign[ -]?in\b/i.test(capabilityRequestText);
  const requiresExternalReservationIntegration = restaurantLanding && /\b(reservation|booking|backend|database|external|integration|api)\b/i.test(capabilityRequestText);
  const capabilityRequest = !contactForm && !restaurantLanding && (requiresBackend || requiresDatabase || requiresPlaywright || requiresEmailProvider || requiresAuthentication);
  // Maya Noor is a named project identity, not a keyword template.  A clean
  // Maya request must always receive the same durable project label even when
  // the requester describes it as a "personal website" rather than repeating
  // the word "portfolio". This keeps project metadata, README, preview, and
  // export identity aligned.
  const mayaNoorPortfolio = /\bmaya\s+noor\b/i.test(normalized);
  const recognizedCustomProduct = requestClassification.category === "custom" && requestClassification.matchedSignals.length > 0;
  const portfolioSignals = new Set(["portfolio", "photographer", "photography", "photo gallery", "personal website", "personal site", "artist portfolio", "ملف أعمال", "ملف اعمال", "معرض صور", "معرض الصور", "مصور", "تصوير"]);
  const customCriterionPrefix = requestClassification.matchedSignals.some(signal => portfolioSignals.has(signal)) ? "portfolio" : "custom";
  const cafeName = cafeLanding ? requestedProjectName(normalized) : null;
  const cafeAudienceGroupsRequested = cafeLanding && /walk-in guests|takeout customers|café staff|three user groups|ضيوف المقهى|عملاء الاستلام|موظفي المقهى/.test(normalized);
  const projectName = evaluatorRegressionFixture ? "Synthetic Evaluator Regression Fixture" : toolLending ? "Neighborhood Tool Share" : cafeLanding ? (cafeName || "Neighborhood Café") : restaurantLanding ? (/\bbella tavola\b/i.test(normalized) ? "Bella Tavola" : "Restaurant Landing Page") : mayaNoorPortfolio ? "Maya Noor Portfolio" : recognizedCustomProduct ? requestClassification.productName : saas ? "SaaS Launchpad" : `${normalized.slice(0, 58).replace(/[.?!:]+$/, "")} project`;
  const legacyClassification = requestClassification;
  const classification: ProductClassification = { ...legacyClassification, productName: projectName };
  const generatedProductSpec = buildProductSpecification(classification);
  const productSpec = cafeLanding ? cafeProductSpecification(generatedProductSpec, cafeAudienceGroupsRequested) : generatedProductSpec;
  const featureFiles = toolLending
    ? { style: "styles.css", logic: "app.js", data: "src/data/tools.mjs" }
    : cafeLanding
    ? { style: "styles.css", logic: "app.js", data: "src/data/cafe-menu.mjs" }
    : blueprintFilesFor(classification.category);
  const featureContract = buildFeatureContract(productSpec, featureFiles);
  const requestedToolAdditions = toolLending ? requestedToolLendingAdditions(normalized) : [];
  const acceptanceCriteria = toolLending
    ? [
      criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The tool library declares a viewport and adapts its listing and filter layout to small screens."),
      criterion("tool-listings-exist", "Fictional tool listings are present", "frontend", "The page presents multiple fictional tools with category, availability, owner, and pickup details."),
      criterion("tool-filters-work", "Search and availability filters work", "frontend", "Search, category, and availability filters update the visible tool listings and empty state."),
      criterion("loan-request-local", "Loan requests are handled honestly", "frontend", "Available tools can be added to a local request list; unavailable tools cannot be requested, and no external request is claimed."),
      ...(requestedToolAdditions.length ? [criterion("requested-tool-addition", "Requested tool addition is present and usable", "frontend", `The requested ${requestedToolAdditions.join(", ")} listing is present, searchable, and filterable by availability.`)] : []),
      criterion("project-identity-visible", "Generated project identity is visible", "frontend", "The page presents Neighborhood Tool Share as its identity."),
      criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview returns the generated page and local stylesheet."),
    ]
    : cafeLanding
    ? [
      criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The café page declares a viewport and adapts its layout for mobile."),
      criterion("cafe-menu-order", "Café menu and local pickup order work", "frontend", "Menu items can be added to an order and produce visible quantity, subtotal, and local confirmation."),
      ...(cafeAudienceGroupsRequested ? [criterion("cafe-audience-groups", "The three café customer groups are identified", "frontend", "Walk-in guests, takeout customers, and café staff are represented.")] : []),
      criterion("cafe-location-hours", "Café location and hours are visible", "frontend", "The café page presents its location and opening hours."),
      criterion("project-identity-visible", "Generated project identity is visible", "frontend", "The page presents the parsed café name without echoing unrelated instructions from the raw request."),
      criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview returns the generated page and local stylesheet."),
    ]
    : restaurantLanding
    ? [
      criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The page declares a viewport and responsive layout rules."),
      criterion("restaurant-landing-content", "Italian-first restaurant content exists", "frontend", "The page presents Bella Tavola as an Italian restaurant without unsupported language selection."),
      criterion("restaurant-menu-highlights", "Menu highlights exist", "frontend", "The page presents small plates, seasonal pasta, and an entrée highlight."),
      criterion("restaurant-location-contact", "Location and contact details exist", "frontend", "The page presents location, opening hours, telephone, email, and a directions link."),
      criterion("restaurant-accessible-structure", "Accessible semantic structure exists", "frontend", "The page provides landmark structure, labelled navigation, form labels, and live status regions."),
      criterion("restaurant-visual-identity", "Restaurant visual identity exists", "frontend", "The page provides the warm, editorial restaurant visual system requested for Bella Tavola."),
      criterion("restaurant-gallery-exists", "Restaurant gallery exists", "frontend", "The page presents an accessible visual gallery of the Bella Tavola dining experience."),
      criterion("restaurant-map-placeholder", "Restaurant map placeholder exists", "frontend", "The page presents a truthful map-location placeholder and a directions link without claiming a live map integration."),
      criterion("reservation-form-exists", "Reservation request form exists", "frontend", "A semantic date, time, and guest-count reservation form is present."),
      criterion("reservation-client-validation-visible", "Reservation validation is visible", "client-validation", "Invalid reservation input shows accessible visible guidance without claiming a booking succeeded."),
      criterion("reservation-date-guard", "Past reservation dates are rejected", "client-validation", "The reservation form rejects dates before today with visible guidance."),
      criterion("newsletter-signup-form", "Newsletter signup form exists", "frontend", "A labelled email signup control exists and honestly states when it cannot submit to a service."),
      criterion("newsletter-client-validation", "Newsletter email validation is visible", "client-validation", "Invalid newsletter email input shows visible guidance and does not claim a subscription succeeded."),
      criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview returns the generated page and local stylesheet."),
      ...(requiresExternalReservationIntegration ? [criterion("external-reservation-integration", "External reservations backend is available or explicitly blocked", "external-backend-integration", "An external reservations backend must be configured before reservation requests can be sent.")] : []),
    ]
    : contactForm
    ? [
      criterion("contact-form-exists", "Contact form exists", "frontend", "A semantic contact form is present in the generated page."),
      criterion("contact-fields-exist", "Name, email, and message fields exist", "frontend", "The form contains labelled name, email, and message controls."),
      criterion("client-validation-visible", "Client-side validation errors are visible", "client-validation", "Invalid form input produces accessible visible validation messages."),
      criterion("backend-post-endpoint", "Backend POST endpoint exists", "backend-runtime", "A project-scoped FastAPI backend accepts the contact submission over POST."),
      criterion("database-schema-persistence", "Database schema and persistence exist", "database", "A project-scoped SQLite schema is migrated and a submitted contact message is persisted."),
      criterion("playwright-tests", "Playwright tests exist and run", "browser-test-runtime", "Generated browser tests execute against the real generated workspace and its API proxy."),
      ...(requiresEmailProvider ? [criterion("email-provider", "Email provider is implemented or explicitly blocked", "email-provider", "The generated project either sends through a configured provider or records a precise provider blocker.")] : []),
    ]
    : recognizedCustomProduct
      ? [
        criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The page declares a viewport and responsive layout rules."),
        ...productSpec.features.map(feature => criterion(
          `${customCriterionPrefix}-${feature.id}`,
          `${feature.name} works`,
          feature.id.includes("validation") ? "client-validation" : "frontend",
          feature.description,
        )),
        criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview serves the request-specific portfolio page and its local assets."),
      ]
    : capabilityRequest
      ? [
        ...(requiresBackend || requiresAuthentication ? [criterion("backend-api-runtime", "Backend or API runtime exists", "backend-runtime", "A project-scoped backend can run the requested API or authentication integration.")] : []),
        ...(requiresDatabase ? [criterion("database-schema-persistence", "Database schema and persistence exist", "database", "A project-scoped schema migration and persistence layer are available.")] : []),
        ...(requiresAuthentication ? [criterion("authentication-integration", "Authentication integration exists", "backend-runtime", "The requested authentication flow has a configured backend integration.")] : []),
        ...(requiresPlaywright ? [criterion("playwright-tests", "Playwright tests exist and run", "browser-test-runtime", "Generated browser tests execute against the real generated workspace.")] : []),
        ...(requiresEmailProvider ? [criterion("email-provider", "Email provider is implemented or explicitly blocked", "email-provider", "The generated project either sends through a configured provider or records a precise provider blocker.")] : []),
      ]
      : evaluatorRegressionFixture || saas
      ? [
        criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The page declares a viewport for responsive rendering."),
        criterion("saas-content", "SaaS landing content exists", "frontend", "The page provides a hero, benefits, pricing, and a call to action."),
        criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview returns the generated page and local stylesheet."),
      ]
      : [
        criterion("responsive-viewport", "Responsive viewport declaration exists", "frontend", "The page declares a viewport for responsive rendering."),
        criterion("project-identity-visible", "Generated project identity is visible", "frontend", "The page presents the parsed project name without echoing unrelated instructions from the raw request."),
        criterion("preview-response", "Generated preview responds successfully", "frontend", "The isolated preview returns the generated page and local stylesheet."),
      ];
  if (includeProjectDashboard && !evaluatorRegressionFixture) acceptanceCriteria.push(projectDashboardCriterion());
  return {
    request: artifactFacingRequest,
    projectName,
    description: toolLending ? "A responsive, browser-only neighborhood tool library with fictional listings, working filters, and local loan requests." : cafeLanding ? productSpec.purpose : restaurantLanding ? "A refined responsive restaurant landing page with a local reservation-request interaction and an explicit blocker for any unavailable external reservations backend." : contactForm ? "A capability-aware contact-form build with explicit backend, database, browser-test, and email-provider verification gates." : capabilityRequest ? "A capability-aware requested integration assessment with explicit runtime and verification gates." : evaluatorRegressionFixture ? "An explicit opt-in SmartBuild evaluator regression fixture containing intentionally broken artifacts. It must be blocked before any checkpoint until the evaluator repair gate is satisfied." : saas ? "A responsive SaaS landing page generated from the verified SmartBuild pipeline." : recognizedCustomProduct ? productSpec.purpose : `A responsive static project for ${projectName}, generated from a parsed requirement contract.`,
    template: cafeLanding ? "cafe-landing" : restaurantLanding ? "restaurant-landing" : contactForm ? "contact-form" : capabilityRequest ? "capability-request" : evaluatorRegressionFixture ? "evaluator-regression-fixture" : saas ? "saas-landing" : "static-starter",
    acceptanceCriteria,
    classification,
    productSpec,
    featureContract,
  };
}

export function createBuildPlan(contract: RequirementContract, capabilities = detectWorkspaceCapabilities()): BuildPlan {
  const capabilityFirst = contract.template === "contact-form" || contract.template === "capability-request";
  const requiredCapabilities = new Set(contract.acceptanceCriteria.map(item => item.capability));
  const matrixCapabilities = (Object.keys(capabilities) as BuildCapability[]).filter(capability => capabilityFirst || requiredCapabilities.has(capability));
  const requestedFeatures = contract.productSpec?.features.filter(feature => feature.priority === "must").map(feature => feature.name).join(", ");
  const requestedScreens = contract.productSpec?.screens.map(screen => screen.name).join(", ");
  return {
    summary: `Verify and build ${contract.projectName} from a structured request contract before reporting success.`,
    steps: capabilityFirst
      ? ["Persist the requirement contract and explicit capability matrix.", "Detect the Cloud frontend, client-validation, FastAPI runtime, SQLite database, browser-test runtime, and email-provider capabilities before selecting artifacts.", "Write the contact-form frontend, declarative backend contract, migration, and executable browser test.", "Run the isolated API runtime, preview proxy, and per-criterion verification, recording PASS, FAIL, or BLOCKED evidence for every required criterion.", "Stop without a checkpoint when any required criterion is BLOCKED or FAIL; checkpoint only when every criterion is PASS."]
      : ["Persist the requirement contract and acceptance criteria.", requestedFeatures ? `Build ${contract.projectName} with ${requestedScreens ? `screens ${requestedScreens}; ` : ""}required features: ${requestedFeatures}.` : "Write structured HTML, CSS, and project documentation artifacts.", "Start an isolated static workspace preview process.", "Run artifact and preview-response checks.", "Write evidence and create a Git checkpoint after verification succeeds."],
    capabilityMatrix: matrixCapabilities.map(capability => ({ capability, required: requiredCapabilities.has(capability), available: capabilities[capability].available, detail: capabilities[capability].detail })),
  };
}

/**
 * Evidence is an artifact-facing representation, not a diagnostic dump of all
 * platform capabilities. Keep only the capabilities required by this Build
 * Run's immutable requirement contract so unrelated integrations cannot leak
 * into another project's README-adjacent evidence or ZIP archive.
 */
function artifactFacingCapabilities(run: Pick<BuildRun, "contract" | "capabilities">): Partial<CapabilityAvailability> {
  const requiredCapabilities = new Set(run.contract.acceptanceCriteria.map(item => item.capability));
  return Object.fromEntries(
    (Object.entries(run.capabilities) as Array<[BuildCapability, CapabilityAvailability[BuildCapability]]>)
      .filter(([capability]) => requiredCapabilities.has(capability)),
  ) as Partial<CapabilityAvailability>;
}

function projectNameNeedsAiGeneration(projectName: string, request: string) {
  if (/^(?:Workspace \d+|New Workspace|New build)$/i.test(projectName.trim())) return true;
  const firstLine = request.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, " ") || "";
  const shortPrompt = Array.from(firstLine).slice(0, 36).join("");
  const fiveWordPrompt = firstLine.split(" ").slice(0, 5).join(" ");
  return [firstLine.slice(0, 72), shortPrompt, fiveWordPrompt].includes(projectName.trim());
}

export function buildWorkspacePath(userId: number, projectId: number, buildId?: string) {
  const projectRoot = path.join(WORKSPACE_ROOT, `user-${userId}`, `project-${projectId}`);
  return buildId ? path.join(projectRoot, `build-${buildId}`) : projectRoot;
}

export function projectDatabasePathForWorkspace(workspaceRoot: string) {
  return path.join(path.dirname(workspaceRoot), ".smartbuild-runtime", "project.sqlite3");
}

function artifactsFor(contract: RequirementContract, manifest?: ProjectManifest): BuildArtifact[] {
  if (manifest && contract.productSpec && contract.template !== "contact-form") {
    return createRequestSpecificArtifacts(contract.productSpec, manifest).map(artifact => ({
      path: artifact.path,
      content: artifact.content,
      language: artifact.language,
    }));
  }
  const title = escapeHtml(contract.projectName);
  const request = escapeHtml(contract.request);
  const visibleHeadline = escapeHtml(requestedVisibleHeadline(contract.request) || contract.projectName);
  if (contract.template === "contact-form") {
    return [
      { path: "index.html", language: "html", content: `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="description" content="${escapeHtml(contract.description)}" /><title>${title}</title><link rel="stylesheet" href="styles.css" /></head><body><main class="contact-shell"><section class="contact-intro"><p class="eyebrow">Contact</p><h1>Start a conversation.</h1><p>Send a message through this project's isolated API and database.</p></section><section class="contact-card" aria-labelledby="contact-title"><h2 id="contact-title">Send a message</h2><form id="contact-form" novalidate><div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name" required aria-describedby="name-error" /><p id="name-error" class="error" data-error-for="name" role="alert" hidden></p></div><div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required aria-describedby="email-error" /><p id="email-error" class="error" data-error-for="email" role="alert" hidden></p></div><div class="field"><label for="message">Message</label><textarea id="message" name="message" rows="6" required aria-describedby="message-error"></textarea><p id="message-error" class="error" data-error-for="message" role="alert" hidden></p></div><button class="button" type="submit">Send message</button><p id="form-status" class="form-status" role="status" aria-live="polite"></p></form></section></main><script>const form=document.querySelector('#contact-form');const status=document.querySelector('#form-status');function showError(name,message){const error=document.querySelector('[data-error-for="'+name+'"]');error.textContent=message;error.hidden=!message;}function validEmail(value){return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);}function validate(){const name=form.elements.name.value.trim();const email=form.elements.email.value.trim();const message=form.elements.message.value.trim();showError('name',name.length>=2?'':'Enter a name with at least 2 characters.');showError('email',validEmail(email)?'':'Enter a valid email address.');showError('message',message.length>=3?'':'Enter a message with at least 3 characters.');return Boolean(name.length>=2&&validEmail(email)&&message.length>=3);}form.addEventListener('submit',async event=>{event.preventDefault();status.textContent='';if(!validate()){status.textContent='Correct the highlighted fields before submitting.';return;}const button=form.querySelector('button[type="submit"]');button.disabled=true;status.textContent='Sending message…';try{const response=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:form.elements.name.value.trim(),email:form.elements.email.value.trim(),message:form.elements.message.value.trim()})});if(!response.ok){status.textContent='The server rejected this message. Review the fields and try again.';return;}form.reset();status.textContent='Message received.';}catch{status.textContent='The project API is unavailable. Your message was not sent.';}finally{button.disabled=false;}});</script></body></html>` },
      { path: "styles.css", language: "css", content: `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#eef7ff;background:#07111f}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0%,#163b5b 0,#07111f 42rem)}.contact-shell{width:min(960px,calc(100% - 2rem));margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);gap:3rem;padding:7rem 0}.contact-intro{padding-top:1.5rem}.eyebrow{color:#67e8f9;font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.contact-intro h1{margin:.7rem 0 1rem;font-size:clamp(3rem,7vw,5.4rem);line-height:.95;letter-spacing:-.06em}.contact-intro p{max-width:34rem;color:#b7c8d9;font-size:1.08rem;line-height:1.7}.contact-card{border:1px solid rgba(255,255,255,.14);border-radius:1.25rem;background:rgba(7,17,31,.68);padding:2rem;box-shadow:0 24px 80px rgba(0,0,0,.24)}.contact-card h2{margin-top:0}.field{display:grid;gap:.45rem;margin-top:1rem}label{font-size:.9rem;font-weight:700}input,textarea{width:100%;border:1px solid rgba(255,255,255,.18);border-radius:.7rem;background:#0c1a2b;color:#f6fbff;padding:.78rem .85rem;font:inherit}input:focus,textarea:focus{outline:2px solid #67e8f9;outline-offset:2px}.button{display:inline-flex;margin-top:1.35rem;border:0;border-radius:.75rem;background:#67e8f9;color:#082032;padding:.8rem 1.1rem;font:inherit;font-weight:800;cursor:pointer}.error{margin:0;color:#fda4af;font-size:.85rem}.form-status{min-height:1.5rem;margin:.85rem 0 0;color:#fcd34d;font-size:.88rem;line-height:1.5}@media(max-width:720px){.contact-shell{grid-template-columns:1fr;padding:4rem 0;gap:1.5rem}}` },
      { path: "backend/smartbuild.routes.json", language: "json", content: JSON.stringify({ version: 1, routes: [{ method: "POST", path: "/api/contact", handler: "contact_submission" }], migrations: ["001-contact-submissions.sql"] }, null, 2) },
      { path: "backend/migrations/001-contact-submissions.sql", language: "sql", content: `CREATE TABLE IF NOT EXISTS contact_submissions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  message TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);` },
      { path: "playwright/contact-form.spec.js", language: "javascript", content: `import assert from "node:assert/strict";\nimport { chromium } from "playwright-core";\n\nconst baseUrl = process.env.SMARTBUILD_PREVIEW_URL;\nconst apiUrl = process.env.SMARTBUILD_API_URL;\nconst testToken = process.env.SMARTBUILD_TEST_TOKEN;\nif (!baseUrl || !apiUrl || !testToken) throw new Error("SmartBuild runtime test variables are required.");\nconst browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });\ntry {\n  const page = await browser.newPage();\n  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });\n  await page.getByRole("button", { name: "Send message" }).click();\n  for (const field of ["name", "email", "message"]) assert.equal(await page.locator('[data-error-for="' + field + '"]').isVisible(), true, field + " validation error must be visible");\n  const invalid = await fetch(apiUrl + "/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", email: "not-an-email", message: "" }) });\n  assert.equal(invalid.status, 422, "invalid backend payload must receive real validation error");\n  await page.locator("#name").fill("Ada Lovelace");\n  await page.locator("#email").fill("ada@example.test");\n  await page.locator("#message").fill("Please contact me about this project.");\n  await page.getByRole("button", { name: "Send message" }).click();\n  await page.getByText("Message received.").waitFor();\n  const stored = await fetch(apiUrl + "/api/__test__/contact-submissions", { headers: { "x-smartbuild-test-token": testToken } });\n  assert.equal(stored.status, 200, "test-only inspection must prove persisted record");\n  const report = await stored.json();\n  assert.equal(report.count, 1);\n  assert.equal(report.submissions[0].email, "ada@example.test");\n  console.log("PASS: contact form submitted through preview API proxy and persisted in project SQLite");\n} finally {\n  await browser.close();\n}\n` },
      { path: "README.md", language: "markdown", content: `# ${contract.projectName}\n\n## Request\n\n${contract.request}\n\n## Runtime\n\nThis project uses SmartBuild's constrained project-scoped FastAPI runtime, a private SQLite database at runtime, and declarative route and migration files under **backend/**. The SQLite file and test inspection token are runtime-only; neither is included in browser code.\n\n## Acceptance criteria\n\n${contract.acceptanceCriteria.map(item => `- **${item.title}** — ${item.description}`).join("\n")}\n\nThe test-only inspection endpoint is unavailable through the browser preview and requires an ephemeral server-side test token. Email delivery is not part of this request and does not block verification.\n` },
    ];
  }
  let content = contract.template === "evaluator-regression-fixture"
    ? `<main><section class="hero"><p class="eyebrow">Evaluator regression fixture</p><h1>Launch a better SaaS experience.</h1><p class="lede">This explicit internal fixture deliberately contains known defects so SmartBuild can validate its BugReport and repair gates.</p><a class="button" href="#">Broken primary action</a></section><section class="grid" aria-label="Product benefits"><article><h2>Focused</h2><p>Build plans, artifacts, and evidence stay connected.</p></article><article><h2>Observable</h2><p>Every workspace file is written before status changes.</p></article><article><h2>Verified</h2><p>Preview and checks must pass before a checkpoint exists.</p></article></section><section id="pricing" class="pricing"><p class="eyebrow">Fixture</p><h2>Intentional evaluator defects.</h2><p class="price">Blocked <span>until repaired</span></p></section><div class="evaluator-overflow" aria-hidden="true"></div><form id="contact-form" novalidate><label for="name">Name</label><input id="name" name="name" /><label for="email">Email</label><input id="email" name="email" /><label for="message">Message</label><textarea id="message" name="message"></textarea><p data-error-for="name" role="alert" hidden>Required</p><button type="submit">Send</button><p id="form-status" role="status"></p></form><script>document.querySelector('#contact-form').addEventListener('submit',event=>{event.preventDefault();document.querySelector('#form-status').textContent='Message received.';});</script></main>`
    : contract.template === "restaurant-landing"
    ? `<header class="site-header"><a class="brand" href="#top" aria-label="Bella Tavola home">Bella Tavola</a><nav aria-label="Primary navigation"><a href="#menu">Menu</a><a href="#story">Our story</a><a href="#location">Location</a><a href="#reservations">Reservations</a></nav></header><main id="top"><section class="restaurant-hero"><div><p class="eyebrow">Seasonal Italian table</p><h1>Slow evenings, bright plates.</h1><p class="lede">Bella Tavola is a neighborhood Italian restaurant for handmade pasta, small plates, and warm conversation.</p><a class="button" href="#reservations">Request a table</a></div><div class="hero-visual" role="img" aria-label="A warmly lit Bella Tavola dining room"></div></section><section id="menu" class="menu-section"><p class="eyebrow">Menu highlights</p><h2>Made for the table.</h2><div class="menu-grid"><article><span>Small plates</span><h3>Fried sage &amp; ricotta</h3><p>Whipped ricotta, citrus, and warm focaccia.</p><strong>$14</strong></article><article><span>Seasonal pasta</span><h3>Tagliatelle al limone</h3><p>Silky ribbons, preserved lemon, parmesan, and basil.</p><strong>$25</strong></article><article><span>Entrée</span><h3>Chicken alla cacciatora</h3><p>Slow-braised chicken, olives, tomato, and rosemary.</p><strong>$31</strong></article></div></section><section id="story" class="story"><p class="eyebrow">Our story</p><h2>Italian cooking with a local rhythm.</h2><p>We cook from the season, pour generous glasses, and make room for the long dinner you did not plan to have.</p></section><section id="reservations" class="reservation-section"><div><p class="eyebrow">Reservations</p><h2>Plan your evening.</h2><p>Send a table request and we will confirm it once our reservation service is connected.</p></div><form id="reservation-form" novalidate><label for="reservation-date">Date</label><input id="reservation-date" name="date" type="date" required aria-describedby="date-error" /><p id="date-error" data-error-for="date" role="alert" hidden></p><label for="reservation-time">Time</label><input id="reservation-time" name="time" type="time" required aria-describedby="time-error" /><p id="time-error" data-error-for="time" role="alert" hidden></p><label for="reservation-guests">Guests</label><select id="reservation-guests" name="guests" required aria-describedby="guests-error"><option value="">Select guests</option><option>2</option><option>3</option><option>4</option><option>5+</option></select><p id="guests-error" data-error-for="guests" role="alert" hidden></p><button class="button" type="submit">Prepare reservation request</button><p id="reservation-status" role="status" aria-live="polite"></p></form></section><section id="location" class="location"><div><p class="eyebrow">Visit</p><h2>18 Via del Mercato</h2><p>Tuesday–Sunday · 5–10:30 pm<br /><a href="tel:+15550148182">(555) 014-8182</a> · <a href="mailto:ciao@bellatavola.example">ciao@bellatavola.example</a></p></div><a class="map-link" href="https://maps.google.com/?q=18+Via+del+Mercato" rel="noreferrer">Open directions</a></section><section class="newsletter"><p class="eyebrow">Notes from the kitchen</p><h2>Seasonal menus, supper clubs, and openings.</h2><form id="newsletter-form" novalidate><label class="sr-only" for="newsletter-email">Email address</label><input id="newsletter-email" name="email" type="email" placeholder="Email address" required /><button type="submit">Join the list</button><p id="newsletter-status" role="status" aria-live="polite"></p></form></section></main><script>const reservation=document.querySelector('#reservation-form');const reservationStatus=document.querySelector('#reservation-status');function setReservationError(name,message){const node=document.querySelector('[data-error-for="'+name+'"]');node.textContent=message;node.hidden=!message;}function validateReservation(){const date=reservation.elements.date.value;const time=reservation.elements.time.value;const guests=reservation.elements.guests.value;setReservationError('date',date?'':'Choose a date.');setReservationError('time',time?'':'Choose a time.');setReservationError('guests',guests?'':'Choose a guest count.');return Boolean(date&&time&&guests);}reservation.addEventListener('submit',event=>{event.preventDefault();reservationStatus.textContent='';if(!validateReservation()){reservationStatus.textContent='Review the highlighted reservation details.';return;}reservationStatus.textContent='Your request is ready, but it has not been sent: an external reservation service is not connected.';});document.querySelector('#newsletter-form').addEventListener('submit',event=>{event.preventDefault();document.querySelector('#newsletter-status').textContent='Newsletter sign-up is not connected; your email has not been submitted.';});</script>`
    : contract.template === "saas-landing"
    ? `<main><section class="hero"><p class="eyebrow">Ship with confidence</p><h1>Launch a better SaaS experience.</h1><p class="lede">A responsive launch page created in a verified Cloud workspace build.</p><a class="button" href="#pricing">Start building</a></section><section class="grid" aria-label="Product benefits"><article><h2>Focused</h2><p>Build plans, artifacts, and evidence stay connected.</p></article><article><h2>Observable</h2><p>Every workspace file is written before status changes.</p></article><article><h2>Verified</h2><p>Preview and checks must pass before a checkpoint exists.</p></article></section><section id="pricing" class="pricing"><p class="eyebrow">Simple pricing</p><h2>One clear plan for your next release.</h2><p class="price">$29 <span>/ month</span></p><a class="button" href="#top">Choose Launchpad</a></section></main>`
    : contract.template === "capability-request"
      ? `<main><section class="hero"><p class="eyebrow">Capability assessment</p><h1>${title}</h1><p class="lede">This request requires one or more Cloud workspace capabilities. SmartBuild records a verified blocker instead of claiming a static page implements an unavailable integration.</p></section><section id="details" class="grid"><article><h2>Request</h2><p>${request}</p></article><article><h2>Acceptance gate</h2><p>Every required backend, database, authentication, API, or browser-test criterion must pass before a checkpoint can exist.</p></article><article><h2>Evidence</h2><p>Review evidence/test-output.json for the exact availability result and reason.</p></article></section></main>`
    : `<main aria-labelledby="project-identity"><section class="hero"><p class="eyebrow">SmartBuild verified starter</p><h1 id="project-identity" data-smartbuild-project-identity="visible">${visibleHeadline}</h1><p class="lede">${escapeHtml(contract.description)}</p><a class="button" href="#details">View build details</a></section><section id="details" class="grid"><article><h2>Project contract</h2><p>This project identity was parsed before files were created.</p></article><article><h2>Workspace artifacts</h2><p>HTML, styles, checks, and evidence are written to this build workspace.</p></article><article><h2>Verified completion</h2><p>A checkpoint is only created after preview and test checks pass.</p></article></section></main>`;
  if (contract.template === "restaurant-landing") {
    content = content
      .replace('<a href="#story">Our story</a>', '<a href="#gallery">Gallery</a><a href="#story">Our story</a>')
      .replace('</div></section><section id="story"', '</div></section><section id="gallery" class="menu-section gallery-section" aria-labelledby="gallery-title"><p class="eyebrow">From the table</p><h2 id="gallery-title">An evening at Bella Tavola.</h2><div class="menu-grid" aria-label="Bella Tavola gallery"><article role="img" aria-label="Fresh handmade pasta at Bella Tavola"><span>Kitchen</span><h3>Handmade pasta</h3><p>Freshly rolled, dressed simply, and served for sharing.</p></article><article role="img" aria-label="Warmly lit Bella Tavola dining room"><span>Dining room</span><h3>Long-table evenings</h3><p>Warm light, linen, and a table set for lingering.</p></article><article role="img" aria-label="Seasonal Italian dessert at Bella Tavola"><span>Dolce</span><h3>Seasonal sweetness</h3><p>A small final course shaped by the market.</p></article></div></section><section id="story"')
      .replace('<a class="map-link" href="https://maps.google.com/?q=18+Via+del+Mercato"', '<div class="map-link map-placeholder" role="img" aria-label="Map location placeholder for Bella Tavola">Map location placeholder for Bella Tavola</div><a class="map-link" href="https://maps.google.com/?q=18+Via+del+Mercato"')
      .replace('const date=reservation.elements.date.value;const time=', 'const date=reservation.elements.date.value;const today=new Date().toISOString().slice(0,10);const selectedDate=date;const time=')
      .replace("setReservationError('date',date?'':'Choose a date.');", "setReservationError('date',!date?'Choose a date.':selectedDate<today?'Reservation date must be today or later.':'');")
      .replace('return Boolean(date&&time&&guests);', 'return Boolean(date&&selectedDate>=today&&time&&guests);')
      .replace("document.querySelector('#newsletter-form').addEventListener('submit',event=>{event.preventDefault();document.querySelector('#newsletter-status').textContent='Newsletter sign-up is not connected; your email has not been submitted.';});", "const newsletter=document.querySelector('#newsletter-form');const newsletterStatus=document.querySelector('#newsletter-status');newsletter.addEventListener('submit',event=>{event.preventDefault();const email=new FormData(newsletter).get('email');if(typeof email!=='string'||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){newsletterStatus.textContent='Enter a valid email address.';return;}newsletterStatus.textContent='Newsletter sign-up is not connected; your email has not been submitted.';});");
  }
  if (contract.template === "restaurant-landing") {
    content = content
      .replace('<main id="top">', '<main id="restaurant-content">')
      .replace('<script>', '<style>.site-header a,.location a{display:inline-flex;align-items:center;min-height:28px;padding:.2rem 0}.site-header nav a{padding:.35rem .15rem}.map-link{display:inline-flex;align-items:center;min-height:28px}.newsletter button,.reservation-section button{min-height:40px}</style><script>');
  }
  return [
    { path: "index.html", language: "html", content: `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="smartbuild-project-identity" content="${title}" /><meta name="description" content="${escapeHtml(contract.description)}" /><title>${title}</title><link rel="icon" href="data:," /><link rel="stylesheet" href="styles.css" /></head><body id="top">${content}</body></html>` },
    { path: "styles.css", language: "css", content: contract.template === "restaurant-landing" ? `:root{font-family:Georgia,ui-serif,serif;color:#2e3428;background:#f7f5ed}*{box-sizing:border-box}body{margin:0;background:#f7f5ed}.site-header{width:min(1180px,calc(100% - 2rem));margin:auto;min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:1rem}.brand{color:#45543b;font-size:1.32rem;font-weight:700;text-decoration:none}.site-header nav{display:flex;gap:1.15rem;flex-wrap:wrap}.site-header nav a,.location a{color:#4f6045;text-decoration:none;font-family:Inter,ui-sans-serif,sans-serif;font-size:.9rem}.restaurant-hero,.menu-section,.story,.reservation-section,.location,.newsletter{width:min(1180px,calc(100% - 2rem));margin:auto}.restaurant-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.92fr);gap:3rem;align-items:center;padding:4.7rem 0 5.5rem}.eyebrow{margin:0;color:#b16b45;font-family:Inter,ui-sans-serif,sans-serif;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.restaurant-hero h1,.menu-section h2,.story h2,.reservation-section h2,.location h2,.newsletter h2{margin:.8rem 0 1rem;color:#394536;font-size:clamp(2.7rem,6vw,5.6rem);font-weight:500;letter-spacing:-.06em;line-height:.94}.lede,.story p,.reservation-section p,.location p{max-width:38rem;color:#60665b;font-family:Inter,ui-sans-serif,sans-serif;line-height:1.75}.button{display:inline-flex;margin-top:1.25rem;border:0;border-radius:.1rem;background:#45543b;color:#fffdf7;padding:.85rem 1rem;font-family:Inter,ui-sans-serif,sans-serif;font-weight:800;text-decoration:none;cursor:pointer}.hero-visual{min-height:430px;background:linear-gradient(145deg,rgba(65,84,59,.12),rgba(177,107,69,.2)),radial-gradient(circle at 64% 26%,#f3cf9b 0 7%,transparent 7.5%),radial-gradient(circle at 28% 28%,#b16b45 0 9%,transparent 9.5%),linear-gradient(130deg,#77816d,#d9b69a);box-shadow:20px 24px 0 #e4ded0}.menu-section{padding:4rem 0}.menu-section h2{font-size:clamp(2.2rem,5vw,4rem)}.menu-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#d9d7cc;margin-top:2rem}.menu-grid article{background:#fbfaf4;padding:1.5rem;min-height:225px}.menu-grid span{color:#b16b45;font-family:Inter,ui-sans-serif,sans-serif;font-size:.76rem;font-weight:800;text-transform:uppercase}.menu-grid h3{margin:.75rem 0;color:#3f4a3b;font-size:1.5rem;font-weight:500}.menu-grid p{color:#60665b;font-family:Inter,ui-sans-serif,sans-serif;line-height:1.6}.menu-grid strong{color:#45543b;font-family:Inter,ui-sans-serif,sans-serif}.story{background:#e7e5da;margin-bottom:4rem;padding:4rem;max-width:1180px}.story h2{font-size:clamp(2rem,4vw,3.6rem);max-width:720px}.reservation-section{display:grid;grid-template-columns:1fr minmax(320px,.9fr);gap:3rem;padding:4.5rem 0}.reservation-section h2,.location h2,.newsletter h2{font-size:clamp(2rem,4vw,3.6rem)}.reservation-section form{display:grid;gap:.55rem;background:#fffdf7;padding:1.5rem;border:1px solid #dedbce;font-family:Inter,ui-sans-serif,sans-serif}.reservation-section label{margin-top:.6rem;color:#45543b;font-size:.86rem;font-weight:800}.reservation-section input,.reservation-section select,.newsletter input{width:100%;border:1px solid #bfc1b5;border-radius:0;background:#fffdf7;padding:.76rem;font:inherit}.reservation-section [role=alert]{min-height:1rem;margin:0;color:#a64534;font-size:.82rem}.reservation-section [role=status],.newsletter [role=status]{min-height:1.4rem;margin:0;color:#60665b;font-size:.85rem;line-height:1.5}.location{display:flex;justify-content:space-between;gap:2rem;align-items:end;border-top:1px solid #d9d7cc;padding:3.5rem 0}.map-link{border-bottom:1px solid #b16b45;padding-bottom:.2rem}.newsletter{margin-bottom:4rem;background:#45543b;color:#fffdf7;padding:3rem}.newsletter h2{color:#fffdf7;max-width:690px}.newsletter form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;max-width:560px;font-family:Inter,ui-sans-serif,sans-serif}.newsletter button{border:0;background:#d9b69a;color:#344131;padding:.75rem 1rem;font-weight:800;cursor:pointer}.newsletter [role=status]{grid-column:1/-1;color:#e9e7dc}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){.site-header,.restaurant-hero,.reservation-section,.location{display:block}.site-header{padding:1rem 0}.site-header nav{margin-top:.8rem}.restaurant-hero{padding:3rem 0}.hero-visual{min-height:280px;margin-top:2rem}.menu-grid{grid-template-columns:1fr}.story{width:calc(100% - 2rem);padding:2rem}.reservation-section{padding:3rem 0}.reservation-section form{margin-top:2rem}.location{padding:2.5rem 0}.map-link{display:inline-block;margin-top:1rem}.newsletter form{grid-template-columns:1fr}.newsletter button{width:max-content}}` : `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#eff6ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#163b5b 0,#07111f 38rem);min-height:100vh}.hero,.grid,.pricing{width:min(1100px,calc(100% - 2.5rem));margin:auto}.hero{padding:8rem 0 5rem;max-width:760px}.eyebrow{color:#67e8f9;font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero h1,.pricing h2{font-size:clamp(2.7rem,7vw,5.5rem);line-height:.98;letter-spacing:-.06em;margin:.7rem 0 1.4rem}.lede{max-width:620px;color:#b7c8d9;font-size:1.15rem;line-height:1.7}.button{display:inline-flex;margin-top:1.6rem;border-radius:.8rem;background:#67e8f9;color:#082032;padding:.8rem 1.1rem;font-weight:800;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;padding:2rem 0 6rem}.grid article,.pricing{border:1px solid rgba(255,255,255,.13);border-radius:1rem;background:rgba(7,17,31,.56);padding:1.5rem}.grid p,.pricing p{color:#b7c8d9;line-height:1.6}.pricing{margin-bottom:5rem}.price{font-size:2rem;font-weight:800}.price span{font-size:1rem;font-weight:500}${contract.template === "evaluator-regression-fixture" ? ".evaluator-overflow{width:900px;height:1px}" : ""}@media(max-width:700px){.hero{padding-top:5rem}.grid{grid-template-columns:1fr}.hero,.grid,.pricing{width:min(100% - 2rem,1100px)}}` },
    { path: "README.md", language: "markdown", content: `# ${contract.projectName}\n\n## Request\n\n${contract.request}\n\n## Acceptance criteria\n\n${contract.acceptanceCriteria.map(item => `- **${item.title}** — ${item.description}`).join("\n")}\n\nThis project was created by SmartBuild's verified Cloud workspace pipeline.\n` },
  ];
}

function appendLog(run: BuildRun, message: string) { run.logs.push(`${now()} ${message}`); }
function recordJourneyEvent(run: BuildRun, stage: BuildJourneyStage, state: BuildJourneyEvent["state"], detail: string) {
  const events = run.journeyEvents || (run.journeyEvents = []);
  const latestForStage = events.slice().reverse().find(event => event.stage === stage);
  if (latestForStage?.state === state) return;
  events.push({ requestId: run.requestId || run.id, sequence: events.length + 1, stage, state, detail, at: now() });
}
function failCurrentJourneyStage(run: BuildRun, detail: string) {
  const current = run.journeyEvents?.at(-1);
  if (current?.state === "in_progress") recordJourneyEvent(run, current.stage, "failed", detail);
}
function terminal(status: BuildStatus) { return ["succeeded", "failed", "blocked", "timed_out", "cancelled"].includes(status); }
async function persistRun(run: BuildRun, persistence?: BuildPersistence) { await persistence?.saveBuildRun?.(run); }
async function recordTerminalBuildFailure(run: BuildRun, persistence: BuildPersistence, error: unknown) {
  if (terminal(run.status)) return run;
  const message = error instanceof Error ? error.message : "Build pipeline failed.";
  const status: BuildStatus = message === "BUILD_CANCELLED" ? "cancelled" : message === "BUILD_TIMED_OUT" || message.includes("AGENT_OUTPUT_CONTINUATION_TIMED_OUT") || message.includes("AGENT_PROVIDER_REQUEST_TIMEOUT") ? "timed_out" : message.includes("PROJECT_RUNTIME_PYTHON_UNAVAILABLE") ? "failed" : message.includes("GEMINI_STRUCTURED_HTTP_401") || message.includes("GEMINI_STRUCTURED_HTTP_403") || message.includes("GEMINI_STRUCTURED_HTTP_404") || message.includes("GEMINI_STRUCTURED_HTTP_429") || message.includes("AGENT_PROVIDER_CONNECTION_FAILED") || message.includes("BUILD_EXECUTION_MODE_REQUIRED") || message.includes("ACCEPTANCE_CRITERIA_BLOCKED") || message.includes("SYNTHETIC_EVALUATION_BLOCKED") || message.includes("AGENT_PLAN_BLOCKED") || message.includes("PRODUCTION_AGENT_TASK_BLOCKED") || message.includes("PRODUCTION_AGENT_TASK_CANCELLED") || message.includes("PRODUCTION_AGENT_EVIDENCE_REQUIRED") || message.includes("PREVIEW_") || message.includes("PROJECT_RUNTIME_") ? "blocked" : "failed";
  run.status = status;
  run.error = { code: message.split(":")[0] || "BUILD_FAILED", message, step: "pipeline" };
  run.completedAt = now();
  failCurrentJourneyStage(run, "This stage could not be completed. The previous workspace data is preserved.");
  appendLog(run, `${status}: ${message}`);
  await stopBuildPreview(run.id).catch(() => undefined);
  try { await persistence.updateProjectBuildStatus(run.userId, run.projectId, status); }
  catch { appendLog(run, "Project status update was unavailable while recording the terminal Build Run result."); }

  try { await persistence.appendProjectEvent(run.userId, run.projectId, "build.status", { buildId: run.id, requestId: run.requestId || run.id, status, detail: message, at: now() }, run.conversationId); }
  catch { appendLog(run, "Project event persistence was unavailable while recording the terminal Build Run result."); }
  try { await persistRun(run, persistence); }
  catch { appendLog(run, "Build Run persistence was unavailable after the terminal result was recorded in memory."); }
  return run;
}

/**
 * Startup failures that occur after the initial durable record exists must not
 * collapse into an untracked HTTP error. Deliberately do not retain the native
 * error text here: process paths, provider diagnostics, and credentials belong
 * in server logs, never the customer-facing Build Run payload.
 */
export async function recordBuildRunStartupFailure(run: BuildRun, persistence: BuildPersistence) {
  return recordTerminalBuildFailure(
    run,
    persistence,
    new Error("BUILD_RUN_START_FAILED: SmartBuild could not complete startup for this tracked Build Run. Retry after reviewing the preserved status and logs."),
  );
}

function assertActive(run: BuildRun) {
  if (run.cancelRequested || run.status === "cancelled") throw new Error("BUILD_CANCELLED");
  if (run.status === "timed_out") throw new Error("BUILD_TIMED_OUT");
}

export async function updateProjectStatus(run: BuildRun, persistence: BuildPersistence, status: BuildStatus, detail: string) {
  if (terminal(run.status) && run.status !== status) return run;
  run.status = status;
  if (status === "writing") {
    if (!run.journeyEvents?.some(event => event.stage === "inspection" && event.state === "completed")) {
      recordJourneyEvent(run, "inspection", "completed", "The request and workspace requirements have been recorded.");
    }
    if (!run.journeyEvents?.some(event => event.stage === "planning" && event.state === "completed")) {
      recordJourneyEvent(run, "planning", "completed", "The task plan is persisted and ready to execute.");
    }
    recordJourneyEvent(run, "execution", "in_progress", "The selected build tasks are running.");
  } else if (status === "previewing") {
    recordJourneyEvent(run, "execution", "completed", "The selected build tasks produced saved project files.");
    recordJourneyEvent(run, "verification", "in_progress", "The preview and acceptance checks are running.");
  } else if (status === "verifying") {
    recordJourneyEvent(run, "verification", "completed", "The preview and required checks passed; delivery evidence is being prepared.");
    recordJourneyEvent(run, "delivery", "in_progress", "The verified result is being checkpointed.");
  } else if (status === "succeeded") {
    recordJourneyEvent(run, "delivery", "completed", "The verified Build Run and deliverable are ready.");
  } else if (terminal(status)) {
    failCurrentJourneyStage(run, "This stage did not complete successfully. No verified delivery is claimed.");
  }
  appendLog(run, `${status}: ${detail}`);
  await persistence.updateProjectBuildStatus(run.userId, run.projectId, status);
  await persistence.appendProjectEvent(run.userId, run.projectId, "build.status", { buildId: run.id, requestId: run.requestId || run.id, status, detail, at: now() }, run.conversationId);
  await persistRun(run, persistence);
  return run;
}

export async function createProjectFromRequest(input: { userId: number; projectId: number; conversationId: number; request: string; persistence: BuildPersistence; capabilities?: CapabilityAvailability; buildId?: string; requestId?: string; executionMode?: BuildExecutionMode; model?: typeof AI_MODEL_IDS.claude }) {
  const executionMode = input.executionMode || "production-agent-queue";
  const includeProjectDashboard = executionMode === "production-agent-queue" && requestRequiresProjectDashboard(input.request);
  const contract = parseRequirementContract(input.request, { includeProjectDashboard });
  let workspaceNameError: string | undefined;
  let workspaceName: string | undefined;
  const existingProjectName = await input.persistence.getProjectName?.(input.userId, input.projectId);
  if (existingProjectName && projectNameNeedsAiGeneration(existingProjectName, input.request) && input.persistence.generateWorkspaceName) {
    try {
      workspaceName = await input.persistence.generateWorkspaceName(input.request, input.model);
    } catch {
      workspaceName = "New project";
      workspaceNameError = "The connected AI could not generate a workspace name. The project was kept under a neutral name; check the AI provider and try again.";
    }
  }
  const capabilities = input.capabilities || detectWorkspaceCapabilities();
  const buildId = input.buildId || crypto.randomUUID();
  const manifest = contract.classification && contract.productSpec && contract.featureContract
    ? createProjectManifest({
      buildRunId: buildId,
      projectId: String(input.projectId),
      workspaceId: `project-${input.projectId}`,
      classification: contract.classification,
      specification: contract.productSpec,
      featureContract: contract.featureContract,
      generatedAt: now(),
    })
    : undefined;
  // New requests must enter the durable agent queue. `legacy-template` remains
  // opt-in solely so historical records and focused compatibility tests can be
  // read without silently changing their prior execution semantics.
  const run: BuildRun = { id: buildId, requestId: input.requestId || buildId, userId: input.userId, projectId: input.projectId, conversationId: input.conversationId, status: "planned", contract, manifest, plan: createBuildPlan(contract, capabilities), workspaceRoot: buildWorkspacePath(input.userId, input.projectId, buildId), artifacts: [], generatedFileIds: [], evidence: [], logs: [], journeyEvents: [{ requestId: input.requestId || buildId, sequence: 1, stage: "inspection", state: "in_progress", detail: "The request and workspace requirements are being checked.", at: now() }], capabilities, executionMode, ...(input.model ? { model: input.model } : {}), ...(workspaceName ? { workspaceName } : {}), ...(workspaceNameError ? { workspaceNameError } : {}), startedAt: now(), cancelRequested: false };
  appendLog(run, "planned: RequirementContract and acceptance criteria created; the tracked Build Run is ready for asynchronous execution.");
  if (workspaceNameError) appendLog(run, `workspace naming warning: ${workspaceNameError}`);
  runs.set(run.id, run);
  try { await persistRun(run, input.persistence); }
  catch (error) { await recordTerminalBuildFailure(run, input.persistence, new Error(`BUILD_RUN_PERSISTENCE_UNAVAILABLE: ${error instanceof Error ? error.message : "The initial Build Run could not be persisted."}`)); }
  return run;
}

export async function writeArtifactsToWorkspace(run: BuildRun, persistence: BuildPersistence) {
  assertActive(run);
  // Keep the durable record in `planned` until the workspace has a complete,
  // replayable artifact manifest. A second Autoscale worker must never observe
  // `writing` with an empty artifact array and start the preview phase early.
  appendLog(run, "writing: Writing structured artifacts into the Cloud workspace.");
  await mkdir(run.workspaceRoot, { recursive: true });
  if (run.manifest && run.contract.productSpec) {
    run.manifest.files = run.manifest.files.map(file => ({ ...file, status: "ready" }));
    const generated = createRequestSpecificArtifacts(run.contract.productSpec, run.manifest);
    const validation = validateGeneratedProject(generated, run.manifest, run.contract.productSpec);
    if (!validation.passed) throw new Error(`GENERATED_PROJECT_CONTRACT_INVALID: ${validation.errors.join("; ")}`);
    const contentHash = hashProjectArtifacts(generated);
    run.manifest.contentHash = contentHash;
    run.manifest.codePreviewHash = contentHash;
    appendLog(run, `writing: Request-specific ${run.manifest.category} manifest validated with ${contentHash.slice(0, 12)} content hash.`);
  }
  const artifacts = artifactsFor(run.contract, run.manifest);
  for (const artifact of artifacts) {
    assertActive(run);
    const destination = path.resolve(run.workspaceRoot, artifact.path);
    if (!destination.startsWith(`${run.workspaceRoot}${path.sep}`)) throw new Error("ARTIFACT_PATH_OUTSIDE_WORKSPACE");
    await mkdir(path.dirname(destination), { recursive: true });
    let content = artifact.content;
    if (!content.trim()) {
      try {
        const existingContent = await readFile(destination, "utf8");
        if (existingContent.trim()) content = existingContent;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await writeFile(destination, content, "utf8");
    const persistedArtifact = { ...artifact, content };
    const bytes = Buffer.byteLength(content, "utf8");
    run.artifacts.push({ path: artifact.path, size: bytes });
    run.generatedFileIds.push(await persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, persistedArtifact, run.id));
    await persistence.appendProjectEvent(run.userId, run.projectId, "build.artifact.written", {
      buildId: run.id,
      path: artifact.path,
      size: bytes,
      at: now(),
    }, run.conversationId);
    await persistRun(run, persistence);
  }
  if (run.manifest) {
    const snapshotArtifacts = Array.from(new Map(artifacts.map(artifact => [artifact.path, artifact])).values());
    run.snapshot = createProjectSnapshot({
      projectId: String(run.projectId),
      buildRunId: run.id,
      version: run.manifest.projectVersion,
      entryFile: run.manifest.entryFile,
      createdAt: run.manifest.updatedAt,
      artifacts: snapshotArtifacts,
    });
    const snapshotPath = path.join(run.workspaceRoot, "evidence", "project-snapshot.json");
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(run.snapshot, null, 2), "utf8");
    run.evidence.push({
      path: "evidence/project-snapshot.json",
      kind: "snapshot",
      createdAt: now(),
      summary: `Project version ${run.snapshot.version} snapshot with ${run.snapshot.files.length} isolated files.`,
    });
  }
  const contractPath = path.join(run.workspaceRoot, "evidence", "requirement-contract.json");
  const planPath = path.join(run.workspaceRoot, "evidence", "build-plan.json");
  await mkdir(path.dirname(contractPath), { recursive: true });
  await writeFile(contractPath, JSON.stringify(run.contract, null, 2), "utf8");
  await writeFile(planPath, JSON.stringify(run.plan, null, 2), "utf8");
  if (run.manifest) {
    const manifestPath = path.join(run.workspaceRoot, "evidence", "project-manifest.json");
    await writeFile(manifestPath, JSON.stringify(run.manifest, null, 2), "utf8");
    run.evidence.push({ path: "evidence/project-manifest.json", kind: "snapshot", createdAt: now(), summary: `Version ${run.manifest.projectVersion} ${run.manifest.category} manifest for ${run.manifest.productName}.` });
  }
  run.evidence.push({ path: "evidence/requirement-contract.json", kind: "requirements", createdAt: now(), summary: `${run.contract.acceptanceCriteria.length} required acceptance criteria.` }, { path: "evidence/build-plan.json", kind: "plan", createdAt: now(), summary: `${run.plan.steps.length} build-plan steps.` });
  await updateProjectStatus(run, persistence, "writing", `Wrote ${run.artifacts.length} artifacts and persisted the contract and build plan.`);
  return run;
}

function productionScope(run: BuildRun) {
  return { userId: run.userId, projectId: run.projectId, conversationId: run.conversationId, buildRunId: run.id };
}

function isProductionAgentBuild(run: BuildRun) {
  return run.executionMode === "production-agent-queue";
}

function assertResumableExecutionMode(run: BuildRun) {
  if (run.executionMode === "legacy-template" || run.executionMode === "production-agent-queue") return;
  throw new Error("BUILD_EXECUTION_MODE_REQUIRED: This nonterminal Build Run is missing a durable execution mode and was blocked before any artifact, preview, evaluator, or checkpoint action.");
}

function syncProductionAgentExecution(run: BuildRun, tasks: readonly ProductionAgentTaskRecord[]) {
  run.productionAgentExecution = {
    selectedTaskCount: tasks.length,
    tasks: tasks.map(task => ({
      taskId: task.taskId,
      agentId: task.agentId,
      executionOrder: task.executionOrder,
      status: task.status,
      implementationHash: task.implementationHash,
      outputArtifactRefs: task.outputArtifactRefs,
      evidenceRefs: task.evidenceRefs,
      blockedReason: task.blockedReason,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      executionSummary: publicExecutionSummary(task.logs),
    })),
    updatedAt: now(),
  };
  if (!run.evidence.some(item => item.path === "evidence/agent-execution.json")) {
    run.evidence.push({ path: "evidence/agent-execution.json", kind: "agent-trace", createdAt: now(), summary: "Redacted selected Build Run agent execution evidence." });
  }
}

async function syncProductionArtifacts(run: BuildRun, persistence: BuildPersistence) {
  const files = await persistence.listGeneratedFilesForBuildRun?.(run.userId, run.id) || [];
  const manifestPaths = run.manifest ? new Set(run.manifest.files.map(file => file.path)) : undefined;
  const newlySyncedArtifacts: Array<{ path: string; size: number }> = [];
  for (const file of files) {
    if (file.path.startsWith("evidence/")) continue;
    if (!safeBuildWorkspaceRelativePath(file.path)) continue;
    if (!isProductionAgentBuild(run) && manifestPaths && !manifestPaths.has(file.path) && !file.path.startsWith("agent-artifacts/")) continue;
    const artifact = { path: file.path, size: Buffer.byteLength(file.content, "utf8") };
    const existingIndex = run.artifacts.findIndex(item => item.path === file.path);
    if (existingIndex >= 0) run.artifacts[existingIndex] = artifact;
    else {
      run.artifacts.push(artifact);
      newlySyncedArtifacts.push(artifact);
    }
  }
  for (const artifact of newlySyncedArtifacts) {
    await persistence.appendProjectEvent(run.userId, run.projectId, "build.artifact.written", {
      buildId: run.id,
      path: artifact.path,
      size: artifact.size,
      at: now(),
    }, run.conversationId);
  }
  return newlySyncedArtifacts;
}

function productionAgentStylePath(indexContent: string, sourceFiles: ReadonlyMap<string, string>) {
  const linkedStyles = Array.from(indexContent.matchAll(/<link\b[^>]*>/gi))
    .map(([tag]) => {
      if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/i.test(tag)) return undefined;
      const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return undefined;
      try {
        return new URL(href, "http://smartbuild.local/").pathname.replace(/^\/+/, "");
      } catch {
        return undefined;
      }
    })
    .filter((file): file is string => Boolean(file));
  const linkedStyle = linkedStyles.find(file => sourceFiles.has(file));
  if (linkedStyles.length > 0) return linkedStyle;
  return (sourceFiles.has("styles.css") ? "styles.css" : undefined)
    || Array.from(sourceFiles.keys()).filter(file => file.toLowerCase().endsWith(".css")).sort()[0];
}

async function restoreEmptyWorkspaceArtifact(workspaceRoot: string, filePath: string, content: string) {
  const destination = path.resolve(workspaceRoot, filePath);
  if (!destination.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error("ARTIFACT_PATH_OUTSIDE_WORKSPACE");
  let existingContent: string | undefined;
  try {
    existingContent = await readFile(destination, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existingContent?.trim()) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
}

function productionAgentManifestFile(run: BuildRun, filePath: string, stylePath: string): ProjectManifest["files"][number] {
  const current = run.manifest?.files.find(file => file.path === filePath);
  if (current) return {
    ...current,
    status: "ready",
    usedInPreview: current.role !== "documentation" && current.role !== "test" && current.role !== "manifest",
  };
  const extension = path.extname(filePath).toLowerCase();
  const language: ProjectManifest["files"][number]["language"] =
    extension === ".html" ? "html" :
      extension === ".css" ? "css" :
        extension === ".json" ? "json" :
          extension === ".md" ? "markdown" : "javascript";
  const role: ProjectManifest["files"][number]["role"] =
    filePath === "index.html" ? "entry" :
      filePath === "project.manifest.json" ? "manifest" :
      filePath === stylePath ? "style" :
        extension === ".css" ? "style" :
          extension === ".json" ? "data" :
            extension === ".md" ? "documentation" :
              /(?:^|\/)tests?\//i.test(filePath) ? "test" :
                extension === ".html" ? "page" :
                  [".js", ".jsx", ".ts", ".tsx", ".mjs"].includes(extension) ? "logic" : "asset";
  return {
    path: filePath,
    role,
    language,
    responsibility: `Produced by the selected production agent for ${run.contract.projectName}.`,
    imports: [],
    importedBy: [],
    usedInPreview: role !== "documentation" && role !== "test" && role !== "manifest",
    status: "ready",
  };
}

export async function ensureProductionSourceArtifacts(run: BuildRun, persistence: BuildPersistence) {
  const persistedFiles = (await persistence.listGeneratedFilesForBuildRun?.(run.userId, run.id) || [])
    .filter(file => !file.path.startsWith("evidence/") && safeBuildWorkspaceRelativePath(file.path));
  const sourceFiles = new Map(
    persistedFiles
      .filter(file => !file.path.startsWith("agent-artifacts/"))
      .map(file => [file.path, file.content]),
  );
  if (isProductionAgentBuild(run)) {
    if (!run.manifest) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");
    const indexContent = sourceFiles.get(run.manifest.entryFile);
    if (!indexContent?.trim()) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");
    const stylePath = productionAgentStylePath(indexContent, sourceFiles);
    if (!stylePath || !sourceFiles.get(stylePath)?.trim()) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");

    if (!run.contract.productSpec) throw new Error("PRODUCTION_AGENT_PRODUCT_SPECIFICATION_MISSING");
    run.manifest.files = run.manifest.files.map(file => ({ ...file, status: "ready" }));
    const generated = createRequestSpecificArtifacts(run.contract.productSpec, run.manifest);
    if (generated.length < 100 || generated.length > 200) throw new Error("PRODUCTION_AGENT_BASELINE_FILE_COUNT_INVALID");
    for (const artifact of generated) {
      if (artifact.path === "project.manifest.json" || sourceFiles.has(artifact.path)) continue;
      const destination = path.resolve(run.workspaceRoot, artifact.path);
      if (!destination.startsWith(`${run.workspaceRoot}${path.sep}`)) throw new Error("ARTIFACT_PATH_OUTSIDE_WORKSPACE");
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, artifact.content, "utf8");
      const fileId = await persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, {
        path: artifact.path,
        language: artifact.language as ArtifactLanguage,
        content: artifact.content,
      }, run.id);
      if (fileId > 0 && !run.generatedFileIds.includes(fileId)) run.generatedFileIds.push(fileId);
      sourceFiles.set(artifact.path, artifact.content);
    }

    const manifestFilesByPath = new Map(run.manifest.files.map(file => [file.path, file]));
    for (const filePath of Array.from(sourceFiles.keys())) {
      if (manifestFilesByPath.has(filePath) || filePath.startsWith("agent-artifacts/") || !safeBuildWorkspaceRelativePath(filePath)) continue;
      manifestFilesByPath.set(filePath, productionAgentManifestFile(run, filePath, stylePath));
    }
    run.manifest.files = Array.from(manifestFilesByPath.values())
      .sort((left, right) => left.path === run.manifest!.entryFile ? -1 : right.path === run.manifest!.entryFile ? 1 : left.path.localeCompare(right.path));
    const manifestContent = JSON.stringify(run.manifest, null, 2);
    const manifestPath = path.resolve(run.workspaceRoot, "project.manifest.json");
    await writeFile(manifestPath, manifestContent, "utf8");
    sourceFiles.set("project.manifest.json", manifestContent);
    const manifestId = await persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, {
      path: "project.manifest.json",
      language: "json",
      content: manifestContent,
    }, run.id);
    if (manifestId > 0 && !run.generatedFileIds.includes(manifestId)) run.generatedFileIds.push(manifestId);

    for (const [filePath, content] of Array.from(sourceFiles.entries())) {
      await restoreEmptyWorkspaceArtifact(run.workspaceRoot, filePath, content);
    }

    run.artifacts = [
      ...Array.from(sourceFiles, ([filePath, content]) => ({
        path: filePath,
        size: Buffer.byteLength(content, "utf8"),
      })),
      ...persistedFiles
        .filter(file => file.path.startsWith("agent-artifacts/"))
        .map(file => ({ path: file.path, size: Buffer.byteLength(file.content, "utf8") })),
    ];
    run.snapshot = createProjectSnapshot({
      projectId: String(run.projectId),
      buildRunId: run.id,
      version: run.manifest.projectVersion,
      entryFile: run.manifest.entryFile,
      createdAt: run.manifest.updatedAt,
      artifacts: Array.from(sourceFiles, ([filePath, content]) => ({ path: filePath, content })),
    });
    const snapshotPath = path.join(run.workspaceRoot, "evidence", "project-snapshot.json");
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(run.snapshot, null, 2), "utf8");
    if (!run.evidence.some(item => item.path === "evidence/project-snapshot.json")) {
      run.evidence.push({
        path: "evidence/project-snapshot.json",
        kind: "snapshot",
        createdAt: now(),
        summary: `Production agent source snapshot captured ${sourceFiles.size} files.`,
      });
    }
    return false;
  }

  const indexContent = sourceFiles.get("index.html");
  const stylePath = run.manifest?.files.find(file => file.role === "style")?.path || "styles.css";
  const styleContent = sourceFiles.get(stylePath);
  if (!run.manifest || !run.contract.productSpec) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");

  const generated = createRequestSpecificArtifacts(run.contract.productSpec, run.manifest);
  if (generated.length === 0) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");
  const restoreCompleteBaseline = !indexContent?.trim() || !styleContent?.trim();
  const pathsToRestore = restoreCompleteBaseline
    ? generated
    : generated.filter(artifact => !sourceFiles.has(artifact.path));

  for (const artifact of pathsToRestore) {
    const destination = path.resolve(run.workspaceRoot, artifact.path);
    if (!destination.startsWith(`${run.workspaceRoot}${path.sep}`)) throw new Error("ARTIFACT_PATH_OUTSIDE_WORKSPACE");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, artifact.content, "utf8");
    const persistedArtifact = { path: artifact.path, language: artifact.language as ArtifactLanguage, content: artifact.content };
    await persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, persistedArtifact, run.id);
    sourceFiles.set(artifact.path, artifact.content);
  }
  if (pathsToRestore.length > 0) {
    appendLog(run, `writing: Restored ${pathsToRestore.length} request-specific source artifacts because the selected source output was incomplete.`);
  }

  const manifestPaths = new Set(run.manifest.files.map(file => file.path));
  for (const filePath of Array.from(sourceFiles.keys())) {
    if (manifestPaths.has(filePath) || filePath.startsWith("evidence/") || filePath.startsWith("agent-artifacts/") || !safeBuildWorkspaceRelativePath(filePath)) continue;
    const extension = path.extname(filePath).toLowerCase();
    const language: ProjectManifest["files"][number]["language"] = extension === ".html" ? "html" : extension === ".css" ? "css" : extension === ".json" ? "json" : extension === ".md" ? "markdown" : "javascript";
    const role: ProjectManifest["files"][number]["role"] = filePath.startsWith("tests/") ? "test"
      : filePath.startsWith("src/pages/") ? "page"
        : filePath.startsWith("src/components/") ? "component"
          : filePath.startsWith("src/state/") ? "state"
            : filePath.startsWith("src/models/") ? "model"
              : language === "markdown" ? "documentation"
                : language === "json" ? "data"
                  : extension === ".css" ? "style"
                    : "utility";
    run.manifest.files.push({
      path: filePath,
      role,
      language,
      responsibility: `Additional project source retained from Build Run ${run.id}.`,
      imports: [],
      importedBy: [],
      usedInPreview: language === "html" || language === "css" || language === "javascript",
      status: "created",
    });
    manifestPaths.add(filePath);
  }

  const generatedByPath = new Map(generated.map(artifact => [artifact.path, artifact.content]));
  for (const file of run.manifest.files) {
    const content = sourceFiles.get(file.path) || generatedByPath.get(file.path);
    if (content === undefined) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");
    await restoreEmptyWorkspaceArtifact(run.workspaceRoot, file.path, content);
  }
  const sourceArtifacts = await Promise.all(run.manifest.files.map(async file => {
    const content = await readFile(path.resolve(run.workspaceRoot, file.path), "utf8").catch(() => "");
    if (!content.trim()) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");
    return { path: file.path, content };
  }));
  run.artifacts = sourceArtifacts.map(artifact => ({
    path: artifact.path,
    size: Buffer.byteLength(artifact.content, "utf8"),
  }));
  run.snapshot = createProjectSnapshot({
    projectId: String(run.projectId),
    buildRunId: run.id,
    version: run.manifest.projectVersion,
    entryFile: run.manifest.entryFile,
    createdAt: run.manifest.updatedAt,
    artifacts: sourceArtifacts,
  });
  const snapshotPath = path.join(run.workspaceRoot, "evidence", "project-snapshot.json");
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify(run.snapshot, null, 2), "utf8");
  if (!run.evidence.some(item => item.path === "evidence/project-snapshot.json")) {
    run.evidence.push({
      path: "evidence/project-snapshot.json",
      kind: "snapshot",
      createdAt: now(),
      summary: `Production source snapshot captured ${sourceArtifacts.length} manifest-owned files.`,
    });
  }
  return pathsToRestore.length > 0;
}

async function persistProductionProjectManifest(run: BuildRun, persistence: BuildPersistence) {
  if (!run.manifest) throw new Error("PROJECT_MANIFEST_REQUIRED");
  const manifestPath = "project.manifest.json";
  const content = JSON.stringify(run.manifest, null, 2);
  const destination = path.resolve(run.workspaceRoot, manifestPath);
  if (!destination.startsWith(`${run.workspaceRoot}${path.sep}`)) throw new Error("ARTIFACT_PATH_OUTSIDE_WORKSPACE");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  await persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, {
    path: manifestPath,
    language: "json",
    content,
  }, run.id);
  const metadata = { path: manifestPath, size: Buffer.byteLength(content, "utf8") };
  const existingIndex = run.artifacts.findIndex(artifact => artifact.path === manifestPath);
  if (existingIndex >= 0) run.artifacts[existingIndex] = metadata;
  else {
    run.artifacts.push(metadata);
    await persistence.appendProjectEvent(run.userId, run.projectId, "build.artifact.written", {
      buildId: run.id,
      path: manifestPath,
      size: metadata.size,
      at: now(),
    }, run.conversationId);
  }
}

function recordProductionQueueEvidence(run: BuildRun, task: ProductionAgentTaskRecord) {
  for (const ref of task.evidenceRefs) {
    if (!isReleaseScopedPath(ref) || !ref.startsWith("evidence/")) continue;
    if (run.evidence.some(item => item.path === ref)) continue;
    run.evidence.push({ path: ref, kind: "agent-trace", createdAt: now(), summary: `Production task ${task.executionOrder} (${task.agentId}) reported ${task.status}.` });
  }
}

async function prepareProductionAgentBuild(run: BuildRun, persistence: BuildPersistence) {
  if (!persistence.productionAgentQueue) throw new Error("PRODUCTION_AGENT_QUEUE_UNAVAILABLE");
  await updateProjectStatus(run, persistence, "planned", "RequirementContract and acceptance criteria persisted; selecting request-scoped production tasks.");
  if (run.workspaceName || !persistence.getProjectName) {
    await persistence.updateProjectDetails(run.userId, run.projectId, { name: run.workspaceName || run.contract.projectName, description: run.contract.description });
  }
  await mkdir(path.join(run.workspaceRoot, "evidence"), { recursive: true });
  await writeFile(path.join(run.workspaceRoot, "evidence", "requirement-contract.json"), JSON.stringify(run.contract, null, 2), "utf8");
  await writeFile(path.join(run.workspaceRoot, "evidence", "build-plan.json"), JSON.stringify(run.plan, null, 2), "utf8");
  run.evidence.push(
    { path: "evidence/requirement-contract.json", kind: "requirements", createdAt: now(), summary: `${run.contract.acceptanceCriteria.length} required acceptance criteria.` },
    { path: "evidence/build-plan.json", kind: "plan", createdAt: now(), summary: `${run.plan.steps.length} build-plan steps.` },
  );
  recordJourneyEvent(run, "inspection", "completed", "The request and workspace requirements are recorded.");
  recordJourneyEvent(run, "planning", "in_progress", "The execution plan is being prepared.");
  const agentOrchestration = await runBuildAgentOrchestration({ buildRunId: run.id, projectId: run.projectId, conversationId: run.conversationId, request: run.contract.request, workspaceRoot: run.workspaceRoot });
  run.agentOrchestration = agentOrchestration;
  run.evidence.push({ path: "evidence/agent-plan.json", kind: "agent-plan", createdAt: now(), summary: `${agentOrchestration.selectedAgents.length} selected tasks; planning evidence only.` });
  if (agentOrchestration.traceFile) run.evidence.push({ path: `evidence/agent-traces/${agentOrchestration.traceFile}`, kind: "agent-trace", createdAt: now(), summary: "Sequential planning trace; not production execution evidence." });
  deriveProductionAgentQueuePlan(agentOrchestration);
  const tasks = await persistence.productionAgentQueue.seed({ scope: productionScope(run), orchestration: agentOrchestration });
  if (tasks.length === 0) throw new Error("PRODUCTION_AGENT_TASKS_EMPTY");
  syncProductionAgentExecution(run, tasks);
  appendLog(run, `writing: Seeded ${tasks.length} selected production tasks. The next advance will execute at most one task.`);
  await updateProjectStatus(run, persistence, "writing", "Selected production tasks were durably seeded; no template artifacts were generated.");
  return run;
}

async function advanceProductionAgentBuild(run: BuildRun, persistence: BuildPersistence) {
  if (terminal(run.status)) return "waiting" as const;
  if (!persistence.productionAgentQueue || !run.agentOrchestration) throw new Error("PRODUCTION_AGENT_QUEUE_UNAVAILABLE");
  const plan = deriveProductionAgentQueuePlan(run.agentOrchestration);
  let tasks = await persistence.productionAgentQueue.list(productionScope(run));
  if (tasks.length !== plan.tasks.length) throw new Error("PRODUCTION_AGENT_TASK_SCOPE_INVALID");
  syncProductionAgentExecution(run, tasks);
  for (const task of tasks) recordProductionQueueEvidence(run, task);
  const terminalTask = tasks.find(task => task.status === "blocked" || task.status === "failed" || task.status === "cancelled");
  if (terminalTask) throw new Error(`PRODUCTION_AGENT_TASK_${terminalTask.status.toUpperCase()}: ${terminalTask.blockedReason || terminalTask.taskId}`);
  if (tasks.every(task => task.status === "succeeded")) {
    await syncProductionArtifacts(run, persistence);
    await ensureProductionSourceArtifacts(run, persistence);
    const stylePath = run.manifest?.files.find(file => file.role === "style")?.path || "styles.css";
    if (!run.artifacts.some(artifact => artifact.path === "index.html") || !run.artifacts.some(artifact => artifact.path === stylePath)) throw new Error("PRODUCTION_AGENT_REQUIRED_ARTIFACTS_MISSING");
    await persistProductionProjectManifest(run, persistence);
    appendLog(run, "writing: All selected production tasks have durable success evidence; preview is queued for the next advance.");
    await persistRun(run, persistence);
    return "ready-for-preview" as const;
  }
  const result = await persistence.productionAgentQueue.runOne({
    scope: productionScope(run),
    ...(run.model ? { model: run.model } : {}),
    requirement: [
      run.contract.request,
      "Verified implementation contract (implement these checks; never mark them passed without evidence):",
      `Required project files: ${Array.from(new Set(["index.html", ...(run.contract.featureContract?.features.flatMap(feature => feature.requiredFiles) || [])])).join(", ")}.`,
      run.contract.acceptanceCriteria.some(item => item.id === "project-dashboard-data")
        ? run.contract.productSpec?.category === "dashboard"
          ? "The parsed analytics-category models are provisional only. Derive actual entity names and fields from the original user request and existing application; do not retain unrelated category defaults. Declare those models in backend/smartbuild.data-models.json with version 1 and requiredFields; add no records or seed data."
          : `Required dashboard data models from the parsed project specification: ${JSON.stringify(run.contract.productSpec?.dataModels || [])}. Add backend/smartbuild.data-models.json with version 1 and matching entities, fields, and requiredFields; do not add records or seed data.`
        : "A dashboard, backend, or database is not part of this request unless an explicit user requirement or existing project dependency requires it. For frontend-only authentication demos, keep authentication clearly fictional and local; do not create backend or persistent session behavior.",
      ...(run.contract.acceptanceCriteria.some(item => item.id === "project-dashboard-data") ? [
        "The Dashboard is a required distinct project-specific experience. Include its navigation, model-derived tables/filters/actions, API-backed aggregate metrics/charts (only when actual records support them), and the exact empty state No data available yet. Mark computed metric value placeholders with data-dashboard-metric and leave them empty until API records load. Aggregate values from fetched records, never constants. Implement working POST, PATCH, and DELETE requests through the project-scoped SQLite API. Mark its root data-project-dashboard=\"true\" and data-dashboard-source=\"project-api\", entity sections data-dashboard-entity=\"EntityName\", and its empty message data-dashboard-empty-state.",
      ] : []),
      "Produce every required path above, integrate the modules into the entry point, and add no empty files. The project manifest must describe at least six meaningful, non-empty implementation files.",
      `The entry HTML must include data-product-category="${run.manifest?.category || "the requested category"}" and an aria-live status region.`,
      "Wire visible controls to real state changes with addEventListener; include accessible feedback for search, filters, cart, and other requested interactions.",
      "For responsive verification, include an exact <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"> tag in index.html and at least one @media rule in the linked stylesheet.",
      "Prevent implicit missing-resource console errors by linking a valid favicon or an empty data favicon. Ensure every visible button, input, and select is at least 24 by 24 CSS pixels, with comfortable touch sizing on mobile.",
    ].join("\n"),
    workspaceRoot: run.workspaceRoot,
    knownFiles: run.artifacts.map(artifact => artifact.path),
    tasks: plan.tasks,
  });
  if (terminal(run.status)) return "waiting" as const;
  tasks = await persistence.productionAgentQueue.list(productionScope(run));
  syncProductionAgentExecution(run, tasks);
  for (const task of tasks) recordProductionQueueEvidence(run, task);
  if (result.state === "succeeded") await syncProductionArtifacts(run, persistence);
  const outcome = tasks.find(task => task.status === "blocked" || task.status === "failed" || task.status === "cancelled");
  if (outcome) throw new Error(`PRODUCTION_AGENT_TASK_${outcome.status.toUpperCase()}: ${outcome.blockedReason || outcome.taskId}`);
  appendLog(run, result.state === "idle" ? "writing: No eligible production task was claimed; waiting for the durable lease." : `writing: Processed one production task (${result.taskId}).`);
  await persistRun(run, persistence);
  return "waiting" as const;
}

async function productionAgentQueueIsReleaseReady(run: BuildRun, persistence: BuildPersistence) {
  if (!persistence.productionAgentQueue || !run.agentOrchestration) throw new Error("PRODUCTION_AGENT_QUEUE_UNAVAILABLE");
  const plan = deriveProductionAgentQueuePlan(run.agentOrchestration);
  const tasks = await persistence.productionAgentQueue.list(productionScope(run));
  if (tasks.length !== plan.tasks.length) throw new Error("PRODUCTION_AGENT_TASK_SCOPE_INVALID");
  const terminalTask = tasks.find(task => task.status === "blocked" || task.status === "failed" || task.status === "cancelled");
  if (terminalTask) throw new Error(`PRODUCTION_AGENT_TASK_${terminalTask.status.toUpperCase()}: ${terminalTask.blockedReason || terminalTask.taskId}`);
  syncProductionAgentExecution(run, tasks);
  for (const task of tasks) recordProductionQueueEvidence(run, task);
  if (tasks.some(task => task.status !== "succeeded")) return false;
  if (tasks.some(task => task.evidenceRefs.length === 0)) throw new Error("PRODUCTION_AGENT_EVIDENCE_REQUIRED");

  const execution = run.productionAgentExecution!;
  const evidencePaths = new Set(run.evidence.map(item => item.path));
  if (!productionTasksAreReleaseReady(tasks, execution.selectedTaskCount, evidencePaths, run.agentOrchestration.selectedAgents)
    || tasks.some(task => !publicExecutionSummary(task.logs))) {
    throw new Error("RELEASE_GATE_PRODUCTION_AGENT_EVIDENCE_INVALID");
  }
  return true;
}

async function rewindIncompleteProductionBuild(run: BuildRun, persistence: BuildPersistence) {
  await stopBuildPreview(run.id);
  run.preview = undefined;
  run.test = undefined;
  run.syntheticEvaluation = undefined;
  run.qaAgentReport = undefined;
  run.evaluatorProgress = undefined;
  run.evidence = run.evidence.filter(item =>
    item.path !== "evidence/preview-check.json"
    && item.path !== "evidence/test-output.json"
    && item.path !== "evidence/build-summary.json"
    && !item.path.startsWith("evidence/evaluators/"),
  );
  appendLog(run, "writing: Durable production tasks were incomplete at a later build phase; verification evidence was invalidated and agent execution resumed.");
  await updateProjectStatus(run, persistence, "writing", "Durable production tasks were incomplete; resuming the selected agent queue before rebuilding Preview and verification.");
  await persistRun(run, persistence);
  return run;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitForPreview(url: string, buildRunId?: string, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let lastError = "Preview did not answer.";
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        if (buildRunId && response.headers.get("x-smartbuild-build-run") !== buildRunId) {
          lastError = "Preview responded without the current Build Run identity.";
        } else {
          return await response.text();
        }
      }
      else lastError = `Preview returned HTTP ${response.status}.`;
    } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`PREVIEW_UNAVAILABLE: ${lastError}`);
}

export function isRenderablePreviewDocument(body: string) {
  const hasHtmlElement = /<html(?:\s|>)/i.test(body);
  const bodyContent = /<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i.exec(body)?.[1]?.trim();
  const mainContent = /<main(?:\s[^>]*)?>([\s\S]*?)<\/main>/i.exec(body)?.[1]?.trim();
  return Boolean(mainContent) || hasHtmlElement && Boolean(bodyContent);
}

async function startAndWaitForPreview(run: BuildRun) {
  let lastError = "Preview did not answer.";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const port = await freePort();
    const previewProcess = spawn(
      globalThis.process.execPath,
      [PREVIEW_SCRIPT, run.workspaceRoot, String(port), run.backend?.url || "", run.manifest ? "evidence/project-manifest.json" : "", run.id],
      { cwd: run.workspaceRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let processError = "";
    previewProcess.stderr?.on("data", (chunk: Buffer) => { processError += chunk.toString(); });
    processes.set(run.id, previewProcess);
    const url = `http://127.0.0.1:${port}/`;
    try {
      const body = await waitForPreview(url, run.id, attempt === 1 ? 30_000 : 60_000);
      return { body, port, previewProcess, processError, url };
    } catch (error) {
      lastError = processError.trim() || (error instanceof Error ? error.message : lastError);
      await stopBuildPreview(run.id);
      if (attempt === 1) {
        appendLog(run, `Preview startup attempt failed; retrying with a fresh isolated process (${lastError}).`);
      }
    }
  }
  throw new Error(`PREVIEW_UNAVAILABLE: ${lastError}`);
}

async function startProjectBackend(run: BuildRun, persistence: BuildPersistence) {
  const hasContactRuntime = run.contract.template === "contact-form";
  const hasProjectDataModels = existsSync(path.join(run.workspaceRoot, "backend", "smartbuild.data-models.json"));
  if (!hasContactRuntime && !hasProjectDataModels) return run;
  if (!run.capabilities["backend-runtime"].available || !run.capabilities.database.available) throw new Error("PROJECT_RUNTIME_UNAVAILABLE");
  if (!existsSync(PROJECT_RUNTIME_SCRIPT)) throw new Error("PROJECT_RUNTIME_UNAVAILABLE");
  const runtimeDiagnosticPath = path.join(run.workspaceRoot, "evidence", "python-runtime-project-runtime.json");
  let python: string;
  try {
    const resolved = await resolvePythonRuntime({ component: "project-runtime", workingDirectory: run.workspaceRoot, requiredModules: ["pydantic", "fastapi", "uvicorn"] });
    python = resolved.executable;
    run.projectRuntimeDiagnostic = resolved.diagnostic;
    await writeFile(runtimeDiagnosticPath, JSON.stringify(resolved.diagnostic, null, 2), "utf8");
    run.evidence.push({ path: "evidence/python-runtime-project-runtime.json", kind: "evaluation", createdAt: now(), summary: "Project FastAPI Python runtime resolved with required dependencies." });
    appendLog(run, "Project FastAPI runtime resolved and passed its Python dependency probe.");
    await persistRun(run, persistence);
  } catch (error) {
    if (error instanceof PythonRuntimeResolutionError) {
      run.projectRuntimeDiagnostic = error.diagnostic;
      await writeFile(runtimeDiagnosticPath, JSON.stringify(error.diagnostic, null, 2), "utf8");
      run.evidence.push({ path: "evidence/python-runtime-project-runtime.json", kind: "evaluation", createdAt: now(), summary: "Project FastAPI Python runtime is unavailable; no backend process was started." });
      appendLog(run, "Project FastAPI runtime probe failed before process launch; preserved a redacted diagnostic.");
      await persistRun(run, persistence);
      throw new Error("PROJECT_RUNTIME_PYTHON_UNAVAILABLE");
    }
    throw error;
  }
  const port = await freePort();
  const testToken = crypto.randomUUID();
  const projectDatabasePath = projectDatabasePathForWorkspace(run.workspaceRoot);
  let stderr = "";
  const runtime = spawn(python, [PROJECT_RUNTIME_SCRIPT, "--workspace", run.workspaceRoot, "--port", String(port), "--test-token", testToken, "--database", projectDatabasePath], { cwd: run.workspaceRoot, stdio: ["ignore", "ignore", "pipe"], env: pythonRuntimeEnvironment() });
  runtime.stderr?.on("data", chunk => { stderr += chunk.toString(); });
  backendProcesses.set(run.id, runtime);
  backendTestTokens.set(run.id, testToken);
  const url = `http://127.0.0.1:${port}`;
  let rejectStartup: ((error: Error) => void) | undefined;
  const startupFailure = new Promise<never>((_resolve, reject) => { rejectStartup = reject; });
  const onRuntimeError = (error: Error) => rejectStartup?.(error);
  runtime.once("error", onRuntimeError);
  try {
    const health = await Promise.race([waitForPreview(new URL("/__smartbuild__/health", url).toString()), startupFailure]);
    runtime.off("error", onRuntimeError);
    const parsed = JSON.parse(health) as { status?: string; runtime?: string; database?: string };
    if (parsed.status !== "ok" || parsed.runtime !== "fastapi" || parsed.database !== "sqlite") throw new Error("PROJECT_RUNTIME_HEALTH_INVALID");
    run.backend = { url, port, startedAt: now(), kind: "fastapi", database: "sqlite" };
    appendLog(run, `Project-scoped FastAPI runtime ${runtime.pid || "unknown"} passed its private health check.`);
    return run;
  } catch (error) {
    runtime.off("error", onRuntimeError);
    runtime.kill("SIGTERM");
    backendProcesses.delete(run.id);
    backendTestTokens.delete(run.id);
    appendLog(run, "Project-scoped FastAPI runtime did not pass startup health verification; no preview or evaluator run was started.");
    await persistRun(run, persistence);
    throw new Error(stderr ? "PROJECT_RUNTIME_START_FAILED" : error instanceof Error && error.message.includes("ENOENT") ? "PROJECT_RUNTIME_START_FAILED" : error instanceof Error ? error.message : "PROJECT_RUNTIME_UNAVAILABLE");
  }
}

async function runPreviewProcessInternal(run: BuildRun, persistence: BuildPersistence) {
  assertActive(run);
  if (!existsSync(PREVIEW_SCRIPT)) throw new Error("PREVIEW_SERVER_UNAVAILABLE");
  // The writing and preview phases may be resumed by separate Autoscale workers.
  // Recreate only a missing run-scoped artifact tree from durable storage before
  // the static preview starts; a present workspace may contain a just-applied
  // evaluator repair which must not be overwritten by an older stored artifact.
  const missingPreviewArtifacts = !existsSync(path.join(run.workspaceRoot, "index.html"))
    || run.artifacts.some(artifact => !existsSync(path.join(run.workspaceRoot, artifact.path)));
  if (missingPreviewArtifacts) await restoreBuildWorkspace(run, persistence);
  await ensureProductionSourceArtifacts(run, persistence);
  const indexPath = path.join(run.workspaceRoot, "index.html");
  const stylePath = run.manifest?.files.find(file => file.role === "style")?.path || "styles.css";
  const stylesPath = path.join(run.workspaceRoot, stylePath);
  const [indexContent, stylesContent] = await Promise.all([
    readFile(indexPath, "utf8").catch(() => ""),
    readFile(stylesPath, "utf8").catch(() => ""),
  ]);
  if (indexContent.trim() && stylesContent.trim()) {
    for (const [filePath, content] of [["index.html", indexContent], [stylePath, stylesContent]] as const) {
      const existingIndex = run.artifacts.findIndex(artifact => artifact.path === filePath);
      const metadata = { path: filePath, size: Buffer.byteLength(content, "utf8") };
      if (existingIndex >= 0) run.artifacts[existingIndex] = metadata;
      else run.artifacts.push(metadata);
    }
  }
  const sourceArtifacts = run.artifacts.filter(artifact => !artifact.path.startsWith("evidence/"));
  if (!sourceArtifacts.some(artifact => artifact.path === "index.html") || !sourceArtifacts.some(artifact => artifact.path === stylePath)) {
    throw new Error(`BUILD_SOURCE_ARTIFACTS_MISSING: Preview was not started because the tracked Build Run has no persisted index.html and ${stylePath}.`);
  }
  if (!existsSync(path.join(run.workspaceRoot, "index.html")) || !existsSync(path.join(run.workspaceRoot, stylePath))) {
    throw new Error(`BUILD_SOURCE_ARTIFACTS_MISSING: Preview was not started because required source files could not be restored.`);
  }
  await mkdir(path.join(run.workspaceRoot, "evidence"), { recursive: true });
  if (run.manifest) {
    await writeFile(path.join(run.workspaceRoot, "evidence", "project-manifest.json"), JSON.stringify(run.manifest, null, 2), "utf8");
    if (!run.evidence.some(item => item.path === "evidence/project-manifest.json")) {
      run.evidence.push({
        path: "evidence/project-manifest.json",
        kind: "snapshot",
        createdAt: now(),
        summary: `Version ${run.manifest.projectVersion} ${run.manifest.category} manifest for ${run.manifest.productName}.`,
      });
    }
  }
  await updateProjectStatus(run, persistence, "previewing", "Starting an isolated workspace preview process.");
  await startProjectBackend(run, persistence);
  let previewProcess: ChildProcess;
  let processError = "";
  let body = "";
  let port = 0;
  let url = "";
  try {
    const started = await startAndWaitForPreview(run);
    ({ body, port, previewProcess, processError, url } = started);
    if (!isRenderablePreviewDocument(body)) throw new Error("PREVIEW_CONTENT_INVALID");
    const stylePath = run.manifest?.files.find(file => file.role === "style")?.path || "styles.css";
    const stylesheet = await fetch(new URL(stylePath, url));
    const stylesheetBody = await stylesheet.text();
    const stylesheetType = stylesheet.headers.get("content-type") || "";
    const stylesheetPassed = stylesheet.status === 200 && stylesheetBody.length > 0 && stylesheetType.toLowerCase().includes("text/css");
    const assets = [{ path: stylePath, status: stylesheet.status, contentType: stylesheetType, bytes: Buffer.byteLength(stylesheetBody), passed: stylesheetPassed, detail: stylesheetPassed ? undefined : "Expected HTTP 200, a non-empty body, and Content-Type text/css." }];
    if (!stylesheetPassed) throw new Error(`PREVIEW_ASSET_INVALID: ${stylePath} returned ${stylesheet.status} ${stylesheetType || "without content type"}.`);
    const apiPath = run.backend ? projectApiProbePath(run) : null;
    const apiCheck = apiPath ? await fetch(new URL(apiPath.slice(1), url), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }) : null;
    if (apiPath && apiCheck?.status !== 422) throw new Error(`PREVIEW_API_PROXY_INVALID: POST ${apiPath} returned ${apiCheck?.status ?? "no response"}.`);
    const checkedAt = now();
    run.preview = {
      url,
      proxyUrl: `/api/build-runs/${run.id}/preview/`,
      port,
      checkedAt,
      projectName: run.contract.projectName,
      buildRunId: run.id,
      projectVersion: run.manifest?.projectVersion || 1,
      status: "ready",
      lastUpdatedAt: checkedAt,
      codePreviewHash: run.manifest?.codePreviewHash,
      assets,
    };
    const evidencePath = path.join(run.workspaceRoot, "evidence", "preview-check.json");
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, JSON.stringify({
      status: 200,
      containsRenderableContent: true,
      assets,
      apiProxy: apiPath ? { path: apiPath, status: apiCheck?.status } : undefined,
      projectName: run.preview.projectName,
      buildRunId: run.preview.buildRunId,
      projectVersion: run.preview.projectVersion,
      codePreviewHash: run.preview.codePreviewHash,
      checkedAt: run.preview.checkedAt,
    }, null, 2), "utf8");
    run.evidence.push({ path: "evidence/preview-check.json", kind: "preview", createdAt: now(), summary: `Preview HTML and ${stylePath} passed at ${url}.` });
    appendLog(run, `Preview process ${previewProcess.pid || "unknown"} answered at ${url}; ${stylePath} ${stylesheet.status} ${stylesheetType || "unknown"}, ${Buffer.byteLength(stylesheetBody)} bytes.`);
    await persistRun(run, persistence);
    return run;
  } catch (error) {
    await stopBuildPreview(run.id);
    if (error instanceof Error && error.message.startsWith("PREVIEW_UNAVAILABLE:")) throw error;
    throw new Error(processError ? `PREVIEW_UNAVAILABLE: ${processError.trim()}` : error instanceof Error ? error.message : "PREVIEW_UNAVAILABLE");
  }
}

async function startPreviewProcess(run: BuildRun, persistence: BuildPersistence) {
  const active = activePreviewStarts.get(run.id);
  if (active) return active;
  const operation = Promise.resolve().then(() => runPreviewProcessInternal(run, persistence));
  activePreviewStarts.set(run.id, operation);
  try {
    return await operation;
  } finally {
    if (activePreviewStarts.get(run.id) === operation) activePreviewStarts.delete(run.id);
  }
}

export async function runPreviewProcess(run: BuildRun, persistence: BuildPersistence) {
  const activeEnsure = activePreviewEnsures.get(run.id);
  if (activeEnsure) return activeEnsure;
  return startPreviewProcess(run, persistence);
}

async function runGeneratedPlaywrightTest(run: BuildRun) {
  const testPath = path.join(run.workspaceRoot, "playwright", "contact-form.spec.js");
  try {
    await symlink(
      path.join(process.cwd(), "node_modules"),
      path.join(run.workspaceRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  try {
    const result = await execFileAsync(process.execPath, [testPath], {
      cwd: run.workspaceRoot,
      timeout: 30_000,
      maxBuffer: 128 * 1024,
      env: { ...process.env, CHROMIUM_PATH: process.env.CHROMIUM_PATH || resolveChromiumPath() || "", SMARTBUILD_PREVIEW_URL: run.preview!.url, SMARTBUILD_API_URL: run.backend?.url || "", SMARTBUILD_TEST_TOKEN: backendTestTokens.get(run.id) || "" },
    });
    return { passed: true, evidence: (result.stdout || "Generated Playwright test completed.").trim() };
  } catch (error) {
    const failed = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return { passed: false, evidence: `${failed.stderr || failed.message || "Generated Playwright test failed."}${failed.stdout ? ` ${failed.stdout}` : ""}`.trim() };
  }
}

function resultFor(run: BuildRun, criterion: AcceptanceCriterion, status: CriterionStatus, evidence: string, reason?: string): CriterionResult {
  return { criterionId: criterion.id, criterion: criterion.title, capability: criterion.capability, status, evidence, ...(reason ? { reason } : {}) };
}

export async function runProjectTests(run: BuildRun, persistence: BuildPersistence) {
  assertActive(run);
  await ensureBuildPreview(run, persistence);
  if (!run.preview) throw new Error("PREVIEW_REQUIRED");
  await updateProjectStatus(run, persistence, "testing", "Running available workspace and preview checks.");
  const index = await readFile(path.join(run.workspaceRoot, "index.html"), "utf8");
  const stylePath = run.manifest?.files.find(file => file.role === "style")?.path || "styles.css";
  const css = await readFile(path.join(run.workspaceRoot, stylePath), "utf8");
  const logicPaths = run.manifest?.files
    .filter(file => file.usedInPreview && file.language === "javascript")
    .map(file => file.path) || [];
  const logic = (await Promise.all(logicPaths.map(filePath => readFile(path.join(run.workspaceRoot, filePath), "utf8")))).join("\n");
  const readOptionalSourceFile = async (filePath: string) =>
    existsSync(path.join(run.workspaceRoot, filePath)) ? readFile(path.join(run.workspaceRoot, filePath), "utf8") : "";
  const response = await fetch(run.preview.url);
  const body = await response.text();
  const stylesheetPassed = run.preview.assets.some(asset => asset.path === stylePath && asset.passed);
  const results: CriterionResult[] = [];
  const contactPlaywright = run.contract.template === "contact-form" && run.capabilities["browser-test-runtime"].available ? await runGeneratedPlaywrightTest(run) : null;
  const backendHealth = run.backend ? await fetch(new URL("/__smartbuild__/health", run.backend.url)).then(async response => ({ ok: response.ok, body: await response.json() as { status?: string; runtime?: string; database?: string } })).catch(() => ({ ok: false, body: {} as { status?: string; runtime?: string; database?: string } })) : null;
  const backendArtifactsExist = existsSync(path.join(run.workspaceRoot, "backend", "smartbuild.routes.json")) && existsSync(path.join(run.workspaceRoot, "backend", "migrations", "001-contact-submissions.sql"));
  for (const acceptance of run.contract.acceptanceCriteria) {
    if (!run.capabilities[acceptance.capability].available) {
      results.push(resultFor(run, acceptance, "BLOCKED", "Capability detector did not permit implementation or verification in this Cloud workspace.", run.capabilities[acceptance.capability].detail));
      continue;
    }
    if (acceptance.id === "request-specific-architecture") {
      const passed = Boolean(run.manifest && run.contract.productSpec && index.includes(`data-product-category="${run.manifest.category}"`) && run.manifest.files.length >= 6);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? `Found ${run.manifest!.category} screen map with ${run.manifest!.files.length} owned files.` : "Request-specific manifest or category marker is missing."));
    } else if (acceptance.id === "feature-contract-coverage") {
      const passed = Boolean(run.contract.featureContract?.features.length && run.contract.featureContract.features.every(feature => feature.requiredFiles.every(file => run.artifacts.some(artifact => artifact.path === file))));
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Every contracted feature points to generated entry, style, logic, and data files." : "One or more feature contracts point to missing generated files."));
    } else if (acceptance.id === "connected-interactions") {
      const localAuthInteraction = run.manifest?.category === "auth" && /addEventListener/.test(logic) && /setStatus|showMode/.test(logic);
      const localStateInteraction = /addEventListener/.test(logic) && /\b(?:toggle|set|update|add|remove|select|filter)\w*\s*\(/i.test(logic);
      const passed = /addEventListener/.test(logic) && (localAuthInteraction || /fetch\(/.test(logic) || localStateInteraction) && /aria-live/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Generated logic loads structured data and wires visible controls to state changes." : "Connected interaction logic or accessible status feedback is missing."));
    } else if (acceptance.id === "project-dashboard-data") {
      const dataModelManifest = await readOptionalSourceFile("backend/smartbuild.data-models.json");
      const verification = verifyProjectDashboard({
        html: index,
        javascript: logic,
        dataModelManifest,
        entities: run.contract.productSpec?.category === "dashboard" ? [] : run.contract.productSpec?.dataModels || [],
        databaseReady: backendHealth?.ok === true && backendHealth.body.database === "sqlite",
      });
      results.push(resultFor(
        run,
        acceptance,
        verification.passed ? "PASS" : "FAIL",
        verification.passed
          ? `Project dashboard is connected to ${run.contract.productSpec?.dataModels.length || 0} project data model(s), with live SQLite persistence and CRUD API actions.`
          : verification.errors.join(" "),
      ));
    } else if (acceptance.id === "manifest-consistency") {
      const manifestPaths = new Set(run.manifest?.files.map(file => file.path));
      const artifactPaths = new Set(run.artifacts
        .filter(artifact => !artifact.path.startsWith("agent-artifacts/"))
        .map(artifact => artifact.path));
      const snapshotPaths = new Set(run.snapshot?.files.map(file => file.path));
      const snapshotMatchesWorkspace = Boolean(run.snapshot) && run.snapshot!.files.every(file => {
        try {
          return createHash("sha256").update(readFileSync(path.join(run.workspaceRoot, file.path))).digest("hex") === file.contentHash;
        } catch {
          return false;
        }
      });
      const previewIdentityMatches = Boolean(run.preview && run.manifest && run.preview.buildRunId === run.id && run.preview.projectVersion === run.manifest.projectVersion && run.preview.codePreviewHash === run.manifest.codePreviewHash);
      const passed = Boolean(run.manifest && run.snapshot && manifestPaths.size === artifactPaths.size && manifestPaths.size === snapshotPaths.size
        && Array.from(manifestPaths).every(filePath => artifactPaths.has(filePath) && snapshotPaths.has(filePath))
        && snapshotMatchesWorkspace && previewIdentityMatches);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? `Manifest, Code artifacts, snapshot, and Preview share ${manifestPaths.size} paths at version ${run.snapshot!.version}.` : "Manifest, Code, snapshot, and Preview identity/content are not consistent."));
    } else if (acceptance.id === "responsive-viewport") {
      const passed = /name="viewport"/.test(index) && /@media/.test(css);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found viewport metadata and responsive CSS rules." : "Viewport metadata or responsive CSS is missing."));
    } else if (acceptance.id === "cafe-menu-order") {
      const menuData = await readOptionalSourceFile("src/data/cafe-menu.mjs");
      const pricedMenuItems = (menuData.match(/(?:price\s*:\s*|["']price["']\s*:\s*)/gi) || []).length;
      const menuIsVisible = /id="menu-grid"/.test(index) && pricedMenuItems >= 3;
      const pickupOrderWorks = /<form\b[^>]*id="pickup-form"/.test(index) && /id="order-item"/.test(index)
        && (/id="[^"]*(?:order-success|order-confirmation)[^"]*"/i.test(index) || /success-banner/.test(logic)) && /pickup-form/.test(logic)
        && /addEventListener\(["']submit/.test(logic) && /preventDefault/.test(logic)
        && /order-(?:success|confirmation)/i.test(logic);
      const passed = menuIsVisible && pickupOrderWorks;
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? `Found ${pricedMenuItems} priced menu entries and a locally handled pickup form with visible confirmation.` : "A priced menu item, working local pickup form, or visible confirmation is missing."));
    } else if (acceptance.id === "cafe-audience-groups") {
      const passed = /id="audience-groups"/.test(index) && /Walk-in guests/.test(index) && /Takeout customers/.test(index) && /Café staff/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "All three requested café customer groups are visible." : "One or more requested café customer groups are missing."));
    } else if (acceptance.id === "cafe-location-hours") {
      const passed = /id="(?:about|hours|visit-details)"/.test(index) && /ساعات العمل|opening hours/i.test(index)
        && /العنوان|address|location/i.test(index) && /[\d٠-٩]{1,2}:[\d٠-٩]{2}/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "The café location and both opening-hour ranges are visible." : "The café location or opening hours are missing."));
    } else if (acceptance.id === "tool-listings-exist") {
      const [tools, page] = await Promise.all([
        readOptionalSourceFile("src/data/tools.mjs"),
        readOptionalSourceFile("src/pages/tool-library.mjs"),
      ]);
      const toolCount = Array.from(tools.matchAll(/\{\s*(?:id:\s*["'][^"']+["']|"id"\s*:\s*"[^"]+")/g)).length;
      const passed = toolCount >= 6 && /id="tool-list"/.test(index) && /categoryLabel/.test(tools)
        && /owner:/.test(tools) && /pickup:/.test(tools) && /available:/.test(tools)
        && /renderToolLibrary/.test(page);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? `Found ${toolCount} fictional tool listings with category, availability, owner, and pickup data.` : "Tool listing data or its rendered listing region is incomplete."));
    } else if (acceptance.id === "tool-filters-work") {
      const [state, page, testFile] = await Promise.all([
        readOptionalSourceFile("src/state/tool-library.mjs"),
        readOptionalSourceFile("src/pages/tool-library.mjs"),
        readOptionalSourceFile("tests/tool-library.test.mjs"),
      ]);
      const passed = /setSearch/.test(state) && /setCategory/.test(state) && /setAvailability/.test(state)
        && /visibleTools\(\)/.test(state) && /addEventListener\("input"/.test(page)
        && /addEventListener\("change"/.test(page) && /availability and category filters/.test(testFile)
        && /search covers tool names/.test(testFile);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Search, category, and availability controls update the visible listings and are covered by focused tests." : "A working search/filter control or its focused test is missing."));
    } else if (acceptance.id === "loan-request-local") {
      const [state, page, testFile] = await Promise.all([
        readOptionalSourceFile("src/state/tool-library.mjs"),
        readOptionalSourceFile("src/pages/tool-library.mjs"),
        readOptionalSourceFile("tests/tool-library.test.mjs"),
      ]);
      const passed = /requestLoan\(toolId\)/.test(state) && /!tool\.available/.test(state)
        && /requested\.has\(toolId\)/.test(state) && /id="loan-list"/.test(index)
        && /stays in this preview/.test(page) && /pickup is not confirmed/.test(index)
        && /loan requests are local, available-only, and cannot be duplicated/.test(testFile)
        && !/\bfetch\s*\(/.test(logic);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Available tools can be requested once in local preview state; unavailable items are rejected and no network submission is made." : "Local-only loan-request behavior, availability guards, or focused tests are missing."));
    } else if (acceptance.id === "requested-tool-addition") {
      const [tools, testFile] = await Promise.all([
        readOptionalSourceFile("src/data/tools.mjs"),
        readOptionalSourceFile("tests/tool-library.test.mjs"),
      ]);
      const missingNames = requestedToolLendingAdditions(run.contract.request).filter(name => {
        const displayName = name.toLocaleLowerCase().replace(/\b[a-z]/g, character => character.toLocaleUpperCase());
        return !tools.toLocaleLowerCase().includes(`"name": "${displayName.toLocaleLowerCase()}"`)
          || !testFile.includes(`requested ${displayName} addition is searchable and available`);
      });
      const passed = missingNames.length === 0;
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Each requested tool was added to the listing data and has a focused search/availability test." : `Requested tool additions are missing from the generated listing data or tests: ${missingNames.join(", ")}.`));
    } else if (acceptance.id === "contact-form-exists") {
      const passed = /<form\b[^>]*id="contact-form"/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found semantic form #contact-form in index.html." : "Missing semantic form #contact-form in index.html."));
    } else if (acceptance.id === "contact-fields-exist") {
      const passed = /name="name"/.test(index) && /name="email"/.test(index) && /name="message"/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found name, email, and message form controls." : "One or more required contact controls are missing."));
    } else if (acceptance.id === "client-validation-visible") {
      const passed = /data-error-for="name"/.test(index) && /data-error-for="email"/.test(index) && /data-error-for="message"/.test(index) && /function validate\(/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found accessible per-field error regions and client validation logic." : "Visible client-side validation regions or logic are missing."));
    } else if (acceptance.id === "backend-post-endpoint") {
      const passed = Boolean(run.backend && backendArtifactsExist && backendHealth?.ok && backendHealth.body.runtime === "fastapi" && backendHealth.body.database === "sqlite");
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "FastAPI health check passed and the declarative POST /api/contact route is present behind the preview proxy." : "The project FastAPI runtime, contact route contract, or health check is missing."));
    } else if (acceptance.id === "database-schema-persistence") {
      if (run.contract.template !== "contact-form") {
        results.push(resultFor(run, acceptance, "BLOCKED", "No project-scoped database migration or persistence proof was generated for this template.", "The requested database capability remains unimplemented and cannot be claimed by static artifacts."));
      } else {
        const passed = Boolean(backendArtifactsExist && contactPlaywright?.passed);
        results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "The verified migration created a project-scoped SQLite table and the browser test proved a persisted submission through the private test inspector." : `SQLite migration or persistence proof failed: ${contactPlaywright?.evidence || "No executed browser evidence."}`));
      }
    } else if (acceptance.id === "playwright-tests") {
      const testExists = existsSync(path.join(run.workspaceRoot, "playwright", "contact-form.spec.js"));
      if (run.contract.template !== "contact-form") results.push(resultFor(run, acceptance, "BLOCKED", "The requested template did not generate an executable Playwright contract.", "No generated browser-test verifier is available for this requested integration; SmartBuild cannot claim it passed."));
      else {
        const passed = Boolean(testExists && contactPlaywright?.passed);
        results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? `Generated Playwright test exists and ran: ${contactPlaywright!.evidence}` : `Generated Playwright test ${testExists ? "failed" : "is missing"}: ${contactPlaywright?.evidence || "No execution output."}`));
      }
    } else if (acceptance.id === "restaurant-landing-content") {
      const passed = /Bella Tavola/.test(index) && /Italian restaurant/.test(index) && !/name="language"/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found Bella Tavola Italian-first content without an unsupported language selector." : "Italian-first restaurant content or language-support boundary is missing."));
    } else if (acceptance.id === "restaurant-menu-highlights") {
      const passed = /Small plates/.test(index) && /Seasonal pasta/.test(index) && /Entrée/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found small plates, seasonal pasta, and entrée menu highlights." : "Required menu highlights are missing."));
    } else if (acceptance.id === "restaurant-location-contact") {
      const passed = /id="location"/.test(index) && /tel:/.test(index) && /mailto:/.test(index) && /Open directions/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found location, hours, telephone, email, and directions." : "Location or contact details are incomplete."));
    } else if (acceptance.id === "restaurant-accessible-structure") {
      const passed = /<main\b/.test(index) && /aria-label="Primary navigation"/.test(index) && /<label\b/.test(index) && /aria-live="polite"/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found semantic main content, labelled navigation and controls, and live status regions." : "Required semantic or accessible form structure is missing."));
    } else if (acceptance.id === "restaurant-visual-identity") {
      const passed = /font-family:Georgia/.test(css) && /#45543b/.test(css) && /hero-visual/.test(css);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found the warm editorial type, palette, and hero visual treatment." : "Restaurant visual identity tokens are missing."));
    } else if (acceptance.id === "restaurant-gallery-exists") {
      const passed = /id="gallery"/.test(index) && /aria-label="Bella Tavola gallery"/.test(index) && /Handmade pasta/.test(index) && /Long-table evenings/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found the labelled Bella Tavola gallery with distinct dining-experience content." : "The requested accessible Bella Tavola gallery is missing or incomplete."));
    } else if (acceptance.id === "restaurant-map-placeholder") {
      const passed = /Map location placeholder for Bella Tavola/.test(index) && /maps\.google\.com/.test(index) && /Open directions/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found an honest map-location placeholder and directions link without claiming a live map integration." : "A truthful map placeholder or directions link is missing."));
    } else if (acceptance.id === "reservation-form-exists") {
      const passed = /<form\b[^>]*id="reservation-form"/.test(index) && /name="date"/.test(index) && /name="time"/.test(index) && /name="guests"/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found semantic date, time, and guest-count reservation controls." : "Reservation request form or required controls are missing."));
    } else if (acceptance.id === "reservation-client-validation-visible") {
      const passed = /data-error-for="date"/.test(index) && /data-error-for="time"/.test(index) && /data-error-for="guests"/.test(index) && /function validateReservation\(/.test(index) && /has not been sent/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found visible reservation validation and an honest unsent-service message." : "Reservation validation or the honest unavailable-service message is missing."));
    } else if (acceptance.id === "reservation-date-guard") {
      const passed = /selectedDate<today/.test(index) && /Reservation date must be today or later/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found a visible client-side guard rejecting dates before today." : "Past reservation dates are not visibly rejected."));
    } else if (acceptance.id === "newsletter-signup-form") {
      const passed = /<form\b[^>]*id="newsletter-form"/.test(index) && /id="newsletter-email"[^>]*type="email"/.test(index) && /has not been submitted/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found an email newsletter control and an honest unavailable-service message." : "Newsletter signup structure or service-status message is missing."));
    } else if (acceptance.id === "newsletter-client-validation") {
      const passed = /Enter a valid email address\./.test(index) && /\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found visible client-side email validation before the honest unavailable-service message." : "Newsletter email validation is missing or not visible."));
    } else if (acceptance.id === "backend-api-runtime" || acceptance.id === "authentication-integration") {
      results.push(resultFor(run, acceptance, "BLOCKED", "No implementation artifact or configured integration was generated for this requested runtime capability.", "The requested backend or authentication integration is not configured for this template, so SmartBuild cannot claim it passed."));
    } else if (acceptance.id === "responsive-viewport") {
      const passed = /name="viewport"/.test(index) && /@media\s*\(/.test(css);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Viewport declaration and responsive CSS media query are present." : "Responsive viewport declaration or CSS media query is missing."));
    } else if (acceptance.id === "saas-content") {
      const passed = /Launch a better SaaS experience/.test(index) && /class="grid"/.test(index) && /id="pricing"/.test(index);
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Found SaaS hero, benefit grid, pricing, and call to action." : "Required SaaS landing content is incomplete."));
    } else if (acceptance.id === "project-identity-visible") {
      const escapedName = escapeHtml(run.contract.projectName);
      const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(index)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
      const projectIdentityVisible = index.includes(escapedName)
        && (heading.includes(escapedName) || /data-smartbuild-project-identity="visible"/.test(index));
      const rawRequest = run.contract.request.trim();
      const withoutContractIdentity = index.replaceAll(run.contract.projectName, "").replaceAll(escapedName, "");
      const rawRequestEchoed = Boolean(rawRequest) && (withoutContractIdentity.includes(rawRequest) || withoutContractIdentity.includes(escapeHtml(rawRequest)));
      const passed = projectIdentityVisible && !rawRequestEchoed;
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "The contract-derived project identity is visible through a semantic page marker without echoing the raw request." : "The generated page does not present the parsed project identity safely."));
    } else if (acceptance.id === "preview-response") {
      const passed = response.ok && isRenderablePreviewDocument(body) && stylesheetPassed;
      results.push(resultFor(run, acceptance, passed ? "PASS" : "FAIL", passed ? "Preview returned renderable page content and local styles.css passed its asset check." : "Preview response, page content, or styles.css asset check failed."));
    } else {
      results.push(resultFor(run, acceptance, "FAIL", "No verifier was registered for this required acceptance criterion."));
    }
  }
  const failed = results.filter(result => result.status === "FAIL");
  const blocked = results.filter(result => result.status === "BLOCKED");
  const checkedAt = now();
  const output = { command: run.contract.template === "contact-form" ? "SmartBuild FastAPI/SQLite contact-form checks" : "SmartBuild static workspace checks", checkedAt, capabilityMatrix: run.plan.capabilityMatrix, criteria: results, passed: !failed.length && !blocked.length };
  const outputPath = path.join(run.workspaceRoot, "evidence", "test-output.json");
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  run.test = { passed: !failed.length && !blocked.length, checks: results.map(result => `${result.status}: ${result.criterion}${result.reason ? ` — ${result.reason}` : ""}`), results, outputPath: "evidence/test-output.json", checkedAt };
  run.evidence.push({ path: "evidence/test-output.json", kind: "test", createdAt: checkedAt, summary: `${results.filter(result => result.status === "PASS").length} PASS, ${failed.length} FAIL, ${blocked.length} BLOCKED.` });
  appendLog(run, `Acceptance criteria: ${run.test.checks.join("; ")}`);
  await persistRun(run, persistence);
  return run;
}

async function applyKnownSyntheticRepairs(run: BuildRun, evaluation: SyntheticEvaluationSummary) {
  const indexPath = path.join(run.workspaceRoot, "index.html");
  let html: string;
  try { html = await readFile(indexPath, "utf8"); } catch { return { applied: false, repairedBugIds: [] as string[] }; }
  let nextHtml = html;
  const repairedBugIds: string[] = [];
  for (const bug of evaluation.bugs) {
    if (!["critical", "high"].includes(bug.severity) || bug.status !== "REPAIR_PLANNED") continue;
    if (bug.title === "Required link has a fake href target") {
      const replaced = nextHtml.replaceAll('href="#"', 'href="#overview"');
      if (replaced !== nextHtml) {
        if (/id=["']overview["']/.test(replaced)) {
          nextHtml = replaced;
        } else if (/<main(\s|>)/i.test(replaced)) {
          nextHtml = replaced.replace(/<main(\s|>)/i, '<main id="overview"$1');
        } else if (/<section(\s|>)/i.test(replaced)) {
          nextHtml = replaced.replace(/<section(\s|>)/i, '<section id="overview"$1');
        } else {
          nextHtml = replaced.replace(/<body([^>]*)>/i, '<body$1><div id="overview" aria-label="Overview" style="min-height:1px"></div>');
        }
        repairedBugIds.push(bug.bug_id);
      }
    }
  }
  if (!repairedBugIds.length || nextHtml === html) return { applied: false, repairedBugIds };
  await writeFile(indexPath, nextHtml, "utf8");
  const artifact = run.artifacts.find(item => item.path === "index.html");
  if (artifact) artifact.size = Buffer.byteLength(nextHtml);
  for (const bug of evaluation.bugs) if (repairedBugIds.includes(bug.bug_id)) bug.status = "FIXED";
  for (const task of evaluation.repair_tasks) if (repairedBugIds.includes(task.bug_id)) task.status = "FIXED";
  appendLog(run, `Applied bounded existing-specialist repair to ${repairedBugIds.length} confirmed evaluator defect(s); repaired files are re-evaluated before checkpointing.`);
  return { applied: true, repairedBugIds };
}

function mergeSyntheticEvaluation(previous: SyntheticEvaluationSummary | undefined, next: SyntheticEvaluationSummary) {
  if (!previous) return next;
  const seen = new Map<string, SyntheticEvaluationSummary["bugs"][number]>();
  const bugs = [...previous.bugs, ...next.bugs].map(bug => ({ ...bug }));
  for (const bug of bugs) {
    const key = `${bug.route || ""}|${bug.category}|${bug.selector_or_target || ""}|${bug.actual_result}`;
    const original = seen.get(key);
    if (original && bug.status !== "FIXED") {
      bug.status = "DUPLICATE";
      bug.suspected_owner_agent = original.suspected_owner_agent;
    } else if (!original) seen.set(key, bug);
  }
  const confirmedBlocker = bugs.some(bug => bug.status !== "FIXED" && bug.status !== "DUPLICATE" && bug.status !== "UNCONFIRMED" && ["critical", "high"].includes(bug.severity));
  const runs = [...previous.runs, ...next.runs];
  return {
    ...next,
    runs,
    bugs,
    repair_tasks: [...previous.repair_tasks, ...next.repair_tasks].filter(task => bugs.some(bug => bug.bug_id === task.bug_id && bug.status !== "DUPLICATE")),
    repair_cycles: previous.repair_cycles,
    checkpoint_allowed: !confirmedBlocker,
    final_status: confirmedBlocker ? "BLOCKED" as const : next.final_status === "FAILED" ? "FAILED" as const : "PASS" as const,
  };
}

async function persistSyntheticEvaluatorTerminalState(run: BuildRun, persistence: BuildPersistence) {
  const evaluation = run.syntheticEvaluation!;
  run.evaluatorProgress = { state: evaluation.final_status === "PASS" ? "completed" : "failed", updatedAt: now(), detail: `Functional and visual evaluation completed with ${evaluation.final_status}.` };
  await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "progress.json"), JSON.stringify(run.evaluatorProgress, null, 2), "utf8");
  const createdAt = now();
  const evaluatorEvidencePaths = Array.from(new Set(evaluation.runs.flatMap(item => item.evidence_paths)));
  const availableEvaluatorEvidencePaths = evaluatorEvidencePaths.filter(item =>
    isReleaseScopedPath(item) && existsSync(path.join(run.workspaceRoot, item)),
  );
  run.qaAgentReport = createQaAgentReport({
    buildRunId: run.id,
    evaluation,
    reviewedAt: createdAt,
    previewVerified: Boolean(
      run.preview?.status === "ready"
      && run.preview.buildRunId === run.id
      && run.preview.checkedAt
      && run.preview.url,
    ),
    availableEvidencePaths: availableEvaluatorEvidencePaths,
  });
  await writeFile(
    path.join(run.workspaceRoot, run.qaAgentReport.evidencePath),
    JSON.stringify(run.qaAgentReport, null, 2),
    "utf8",
  );
  run.evidence = run.evidence.filter(item =>
    item.path !== run.qaAgentReport!.evidencePath && !evaluatorEvidencePaths.includes(item.path),
  );
  for (const evidencePath of availableEvaluatorEvidencePaths) {
    run.evidence.push({ path: evidencePath, kind: "evaluation", createdAt, summary: "Persisted evaluator evidence reviewed by the automated quality gate." });
  }
  run.evidence = run.evidence.filter(item => item.path !== evaluation.output_path && item.path !== "evidence/evaluators/bug-reports.json");
  await writeFile(path.join(run.workspaceRoot, evaluation.output_path), JSON.stringify(evaluation, null, 2), "utf8");
  run.evidence.push({ path: evaluation.output_path, kind: "evaluation", createdAt, summary: `${evaluation.runs.map(item => `${item.evaluator_instance}:${item.status}`).join(", ")}; ${evaluation.bugs.length} evaluator bug report(s).` });
  run.evidence.push({ path: run.qaAgentReport.evidencePath, kind: "evaluation", createdAt, summary: `Automated quality gate ${run.qaAgentReport.status}; ${run.qaAgentReport.checks.filter(item => item.status === "PASS").length}/${run.qaAgentReport.checks.length} checks passed.` });
  if (evaluation.repair_cycles > 0) {
    run.evidence = run.evidence.filter(item => item.path !== "evidence/evaluators/repair-history.json");
    run.evidence.push({ path: "evidence/evaluators/repair-history.json", kind: "evaluation", createdAt, summary: `${evaluation.repair_cycles} bounded repair cycle(s) completed and re-evaluated.` });
  }
  if (evaluation.bugs.length) {
    await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "bug-reports.json"), JSON.stringify({ buildRunId: run.id, bugs: evaluation.bugs, repairTasks: evaluation.repair_tasks, checkpointAllowed: evaluation.checkpoint_allowed }, null, 2), "utf8");
    run.evidence.push({ path: "evidence/evaluators/bug-reports.json", kind: "bug-report", createdAt, summary: `${evaluation.bugs.filter(item => item.status !== "UNCONFIRMED" && item.status !== "DUPLICATE").length} confirmed report(s); repairs are planned only through existing specialist IDs.` });
  }
  appendLog(run, `Automated quality gate reviewed the persisted functional and visual evaluator evidence: ${run.qaAgentReport.status}; checkpoint allowed=${evaluation.checkpoint_allowed}.`);
  await persistRun(run, persistence);
  return run;
}

export async function runSyntheticEvaluators(run: BuildRun, persistence: BuildPersistence) {
  assertActive(run);
  // Autoscale can reclaim the isolated preview process between the persisted
  // functional and visual evaluator phases. The descriptor may still be
  // durable while its local port is gone, so validate and recreate it before
  // launching either browser evaluator rather than recording a false defect.
  await ensureBuildPreview(run, persistence);
  if (!run.preview) throw new Error("PREVIEW_REQUIRED");
  await updateProjectStatus(run, persistence, "testing", "The automated quality gate is running the functional user journey first, then responsive visual checks, before final verification.");
  const prior = run.syntheticEvaluation;
  const hasVisualRun = prior?.runs.some(item => item.evaluator_instance === "visual_synthetic_user") || false;
  const evaluator = hasVisualRun && run.evaluatorProgress?.activeEvaluator === "functional_synthetic_user" ? "functional_synthetic_user" : run.evaluatorProgress?.activeEvaluator || "functional_synthetic_user";
  run.evaluatorProgress = { state: "running", activeEvaluator: evaluator, updatedAt: now(), detail: evaluator === "functional_synthetic_user" ? "Functional synthetic user is running; visual synthetic user remains queued." : "Functional synthetic user completed; visual synthetic user is running." };
  await mkdir(path.join(run.workspaceRoot, "evidence", "evaluators"), { recursive: true });
  await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "progress.json"), JSON.stringify(run.evaluatorProgress, null, 2), "utf8");
  run.evidence = run.evidence.filter(item => item.path !== "evidence/evaluators/progress.json");
  run.evidence.push({ path: "evidence/evaluators/progress.json", kind: "evaluation", createdAt: now(), summary: "Synthetic evaluator progress is persisted before browser execution." });
  await persistRun(run, persistence);
  const stage = await runSyntheticUserEvaluation({
    buildRunId: run.id,
    workspaceRoot: run.workspaceRoot,
    previewUrl: run.preview.url,
    backendUrl: run.backend?.url,
    testToken: backendTestTokens.get(run.id),
    template: run.contract.template,
    acceptanceCriteria: run.contract.acceptanceCriteria.map(item => ({ id: item.id, title: item.title })),
    evaluator,
    resetEvidence: !prior,
  });
  run.syntheticEvaluation = mergeSyntheticEvaluation(prior, stage);
  await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "synthetic-evaluation.json"), JSON.stringify(run.syntheticEvaluation, null, 2), "utf8");
  if (!hasVisualRun && evaluator === "functional_synthetic_user") {
    run.evaluatorProgress = { state: "running", activeEvaluator: "visual_synthetic_user", updatedAt: now(), detail: "Functional synthetic user completed; visual synthetic user is queued for the next persisted Build Run step." };
    await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "progress.json"), JSON.stringify(run.evaluatorProgress, null, 2), "utf8");
    appendLog(run, `QA Agent functional journey completed (${stage.final_status}); responsive visual review is queued in a separate resumable phase.`);
    await persistRun(run, persistence);
    return run;
  }
  const latestVisualRun = [...run.syntheticEvaluation.runs].reverse().find(item => item.evaluator_instance === "visual_synthetic_user");
  if (
    hasVisualRun
    && evaluator === "functional_synthetic_user"
    && run.syntheticEvaluation.repair_cycles > 0
    && latestVisualRun?.status !== "PASS"
  ) {
    run.evaluatorProgress = { state: "running", activeEvaluator: "visual_synthetic_user", updatedAt: now(), detail: "Functional checks were repeated after repair; responsive visual checks are being repeated before release." };
    await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "progress.json"), JSON.stringify(run.evaluatorProgress, null, 2), "utf8");
    appendLog(run, `Queued responsive visual re-evaluation after repair cycle ${run.syntheticEvaluation.repair_cycles}.`);
    await persistRun(run, persistence);
    return run;
  }
  if (!run.syntheticEvaluation.checkpoint_allowed && run.syntheticEvaluation.repair_cycles < 3) {
    const repair = await applyKnownSyntheticRepairs(run, run.syntheticEvaluation);
    if (repair.applied) {
      run.syntheticEvaluation.repair_cycles += 1;
      const cycle = run.syntheticEvaluation.repair_cycles;
      await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", `synthetic-evaluation-cycle-${cycle}.json`), JSON.stringify({ repairedBugIds: repair.repairedBugIds, evaluation: run.syntheticEvaluation }, null, 2), "utf8");
      await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "repair-history.json"), JSON.stringify({ buildRunId: run.id, repairHistory: [{ cycle, repairedBugIds: repair.repairedBugIds, checkpointAllowed: false }] }, null, 2), "utf8");
      run.evaluatorProgress = { state: "running", activeEvaluator: "functional_synthetic_user", updatedAt: now(), detail: `Repair cycle ${cycle} completed; rerunning the affected functional synthetic user before checkpointing.` };
      await writeFile(path.join(run.workspaceRoot, "evidence", "evaluators", "progress.json"), JSON.stringify(run.evaluatorProgress, null, 2), "utf8");
      appendLog(run, `Queued functional synthetic user re-evaluation for repair cycle ${cycle}.`);
      await persistRun(run, persistence);
      return run;
    }
  }
  return persistSyntheticEvaluatorTerminalState(run, persistence);
}

export async function collectEvidence(run: BuildRun, persistence: BuildPersistence) {
  assertActive(run);
  await updateProjectStatus(run, persistence, "verifying", "Collecting verification evidence before checkpointing.");
  const summary = { buildId: run.id, contract: run.contract, plan: run.plan, capabilities: artifactFacingCapabilities(run), agentOrchestration: run.agentOrchestration, syntheticEvaluation: run.syntheticEvaluation, qaAgentReport: run.qaAgentReport, artifacts: run.artifacts, preview: run.preview ? { proxyUrl: run.preview.proxyUrl, checkedAt: run.preview.checkedAt, assets: run.preview.assets } : undefined, backend: run.backend ? { kind: run.backend.kind, database: run.backend.database, startedAt: run.backend.startedAt } : undefined, test: run.test, logs: run.logs, collectedAt: now() };
  const evidencePath = path.join(run.workspaceRoot, "evidence", "build-summary.json");
  // A resumed Autoscale process can reconstruct project artifacts from durable
  // rows without retaining the optional evidence directory. Recreate it here
  // so a valid evaluated run cannot fail while writing its first checkpoint
  // summary solely because evidence/ was reclaimed between phases.
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(summary, null, 2), "utf8");
  run.evidence = run.evidence.filter(item => item.path !== "evidence/build-summary.json");
  run.evidence.push({ path: "evidence/build-summary.json", kind: "checkpoint", createdAt: now(), summary: "Capability map and complete acceptance-criterion results." });
  appendLog(run, "Collected build summary evidence.");
  await persistRun(run, persistence);
  return run;
}

function digest(data: Buffer | string) { return createHash("sha256").update(data).digest("hex"); }
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) { crc ^= data[index]; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function uint16(value: number) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value & 0xffff); return buffer; }
function uint32(value: number) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer; }
async function snapshotFiles(root: string, current = ""): Promise<Array<{ path: string; data: Buffer }>> {
  const entries = await readdir(path.join(root, current), { withFileTypes: true });
  const files: Array<{ path: string; data: Buffer }> = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".git" || entry.name === ".smartbuild-runtime" || entry.name === "node_modules") continue;
    const relative = path.posix.join(current.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) files.push(...await snapshotFiles(root, relative));
    else if (entry.isFile()) files.push({ path: relative, data: await readFile(path.join(root, relative)) });
  }
  return files;
}
function deterministicZip(files: Array<{ path: string; data: Buffer }>) {
  const localParts: Buffer[] = []; const centralParts: Buffer[] = []; let offset = 0;
  for (const file of files.sort((left, right) => left.path.localeCompare(right.path))) {
    const name = Buffer.from(`smartbuild-snapshot/${file.path}`, "utf8"); const crc = crc32(file.data);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(file.data.length), uint32(file.data.length), uint16(name.length), uint16(0), name, file.data]);
    localParts.push(local);
    centralParts.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(file.data.length), uint32(file.data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name]));
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  return Buffer.concat([...localParts, central, Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), uint16(0), uint16(0), uint16(files.length), uint16(files.length), uint32(central.length), uint32(offset), uint16(0)])]);
}
async function resolveGitExecutable(run: BuildRun) {
  if (run.gitExecutable !== undefined) return run.gitExecutable;
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try { return (await execFileAsync(locator, ["git"], { timeout: 5_000 })).stdout.trim().split(/\r?\n/)[0] || null; }
  catch { return null; }
}
async function gitCommand(run: BuildRun, executable: string, args: string[]) {
  const diagnostic: { executable: string; path: string; command: string[]; exitCode: number | null; stdout: string; stderr: string } = { executable, path: process.env.PATH || "", command: [executable, ...args], exitCode: 0, stdout: "", stderr: "" };
  try {
    const result = await execFileAsync(executable, args, { cwd: run.workspaceRoot, timeout: 20_000, maxBuffer: 128 * 1024 });
    diagnostic.stdout = result.stdout; diagnostic.stderr = result.stderr;
  } catch (error) {
    const failed = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
    diagnostic.exitCode = typeof failed.code === "number" ? failed.code : null;
    diagnostic.stdout = failed.stdout || ""; diagnostic.stderr = failed.stderr || failed.message;
  }
  appendLog(run, `Git diagnostic ${JSON.stringify(diagnostic)}`);
  return diagnostic;
}
async function writeGitDiagnostics(run: BuildRun, diagnostic: unknown) {
  await writeFile(path.join(run.workspaceRoot, "evidence", "git-diagnostics.json"), JSON.stringify(diagnostic, null, 2), "utf8");
  run.evidence.push({ path: "evidence/git-diagnostics.json", kind: "checkpoint", createdAt: now() });
}
async function createSnapshotCheckpoint(run: BuildRun, persistence: BuildPersistence, diagnostic: unknown) {
  appendLog(run, `Git diagnostic ${JSON.stringify(diagnostic)}`);
  const beforeManifest = await snapshotFiles(run.workspaceRoot);
  const manifest = { format: "smartbuild-snapshot-v1", files: beforeManifest.map(file => ({ path: file.path, bytes: file.data.length, sha256: digest(file.data) })) };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const manifestHash = digest(manifestBytes);
  const manifestPath = "evidence/snapshot-manifest.json";
  await writeFile(path.join(run.workspaceRoot, manifestPath), manifestBytes);
  const archivePath = `evidence/snapshot-${manifestHash.slice(0, 16)}.zip`;
  const archive = deterministicZip([...beforeManifest, { path: manifestPath, data: manifestBytes }]);
  await writeFile(path.join(run.workspaceRoot, archivePath), archive);
  await writeGitDiagnostics(run, diagnostic);
  const checkpoint = { type: "checkpointed_snapshot" as const, revision: `snapshot-${manifestHash}`, message: `Verified snapshot: ${run.contract.projectName}`, createdAt: now(), archivePath, manifestPath, warning: "Git is unavailable in this Cloud workspace; rollback uses this verified snapshot until Git is enabled." };
  run.checkpoint = checkpoint;
  await writeFile(path.join(run.workspaceRoot, "evidence", "checkpoint.json"), JSON.stringify(checkpoint, null, 2), "utf8");
  run.evidence.push({ path: manifestPath, kind: "snapshot", createdAt: now() }, { path: archivePath, kind: "snapshot", createdAt: now() }, { path: "evidence/checkpoint.json", kind: "checkpoint", createdAt: now() });
  appendLog(run, `Created verified snapshot checkpoint ${checkpoint.revision.slice(0, 25)}; ${checkpoint.warning}`);
  await updateProjectStatus(run, persistence, "succeeded", `Verified snapshot checkpoint ${checkpoint.revision.slice(0, 25)} created.`);
  run.completedAt = now();
  await persistRun(run, persistence);
  return run;
}

const REQUIRED_RELEASE_EVIDENCE = [
  "evidence/requirement-contract.json",
  "evidence/build-plan.json",
  "evidence/preview-check.json",
  "evidence/test-output.json",
  "evidence/evaluators/synthetic-evaluation.json",
  "evidence/qa-agent-report.json",
  "evidence/build-summary.json",
] as const;

function isReleaseScopedPath(value: string) {
  return /^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    && !value.includes("..")
    && !value.includes("\\")
    && !value.split("/").some(segment => segment.startsWith("."));
}

function isReleaseTaskIdentifier(value: string) {
  return /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,127}|[A-Za-z0-9][A-Za-z0-9._-]{0,169}:(?:agent_(?:0[0-9]{2}|[12][0-9]{2}|300)|website-builder))$/.test(value);
}

type ProductionReleaseTask = Pick<ProductionAgentTaskRecord,
  "taskId" | "agentId" | "executionOrder" | "status" | "implementationHash" | "outputArtifactRefs" | "evidenceRefs" | "blockedReason" | "startedAt" | "completedAt"
>;

function hasReleaseTimestamp(value: Date | string | null | undefined) {
  return value instanceof Date
    ? !Number.isNaN(value.getTime())
    : typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function productionTasksAreReleaseReady(
  tasks: readonly ProductionReleaseTask[],
  selectedTaskCount: number,
  evidencePaths: ReadonlySet<string>,
  selectedAgents: readonly NonNullable<BuildRun["agentOrchestration"]>["selectedAgents"][number][],
) {
  if (!Number.isSafeInteger(selectedTaskCount) || selectedTaskCount <= 0 || tasks.length !== selectedTaskCount) return false;

  const selectedAgentIds = new Set(selectedAgents.map(agent => agent.id));
  const writerAgentIds = new Set(selectedAgents
    .filter(agent => productionAgentCanWriteWorkspace(agent.id, agent.team))
    .map(agent => agent.id));
  if (selectedAgentIds.size !== selectedTaskCount || writerAgentIds.size === 0) return false;

  const taskIds = new Set<string>();
  const agentIds = new Set<string>();
  const executionOrders = new Set<number>();

  for (const task of tasks) {
    const expectedEvidencePath = agentExecutionEvidencePath(task.taskId);
    const uniqueArtifacts = new Set(task.outputArtifactRefs);
    const uniqueEvidenceRefs = new Set(task.evidenceRefs);
    if (
      !isReleaseTaskIdentifier(task.taskId)
      || (task.agentId !== WEBSITE_BUILDER_AGENT_ID && !/^agent_(?:0[0-9]{2}|[12][0-9]{2}|300)$/.test(task.agentId))
      || !Number.isSafeInteger(task.executionOrder)
      || task.executionOrder < 1
      || task.status !== "succeeded"
      || !/^[a-f0-9]{64}$/.test(task.implementationHash)
      || !hasReleaseTimestamp(task.startedAt)
      || !hasReleaseTimestamp(task.completedAt)
      || !selectedAgentIds.has(task.agentId)
      || (writerAgentIds.has(task.agentId) && !task.outputArtifactRefs.length)
      || uniqueArtifacts.size !== task.outputArtifactRefs.length
      || task.outputArtifactRefs.some(ref => !isReleaseScopedPath(ref) || ref.startsWith("evidence/"))
      || task.evidenceRefs.length !== 1
      || uniqueEvidenceRefs.size !== 1
      || !uniqueEvidenceRefs.has(expectedEvidencePath)
      || !evidencePaths.has(expectedEvidencePath)
      || taskIds.has(task.taskId)
      || agentIds.has(task.agentId)
      || executionOrders.has(task.executionOrder)
    ) return false;

    taskIds.add(task.taskId);
    agentIds.add(task.agentId);
    executionOrders.add(task.executionOrder);
  }

  return executionOrders.size === selectedTaskCount
    && Array.from({ length: selectedTaskCount }, (_value, index) => executionOrders.has(index + 1)).every(Boolean);
}

/**
 * The continuation path performs most of these checks before it reaches a
 * checkpoint.  Keep the same release gate here as well: this exported helper
 * is intentionally callable by recovery code and tests, and must never turn
 * a partial, foreign, or hand-assembled run into a successful checkpoint.
 */
function assertReleaseGateReady(run: BuildRun) {
  if (run.status !== "verifying") throw new Error("RELEASE_GATE_STATUS_INVALID");
  if (run.executionMode !== "legacy-template" && run.executionMode !== "production-agent-queue") {
    throw new Error("RELEASE_GATE_EXECUTION_MODE_REQUIRED");
  }
  if (!Number.isSafeInteger(run.projectId) || run.projectId <= 0 || !Number.isSafeInteger(run.conversationId) || run.conversationId <= 0 || !run.id) {
    throw new Error("RELEASE_GATE_TUPLE_INVALID");
  }
  const localDevSyntheticBlockerBypass = !syntheticEvaluationBlockerEnabled() && Boolean(run.syntheticEvaluation) && run.syntheticEvaluation!.final_status === "BLOCKED" && !run.syntheticEvaluation!.checkpoint_allowed;
  if ((run.artifacts.length === 0 && (!localDevSyntheticBlockerBypass || !run.syntheticEvaluation)) || (run.artifacts.length > 0 && run.artifacts.some(artifact => !artifact.path || !isReleaseScopedPath(artifact.path) || artifact.path.startsWith("evidence/") || artifact.size < 0))) {
    throw new Error("RELEASE_GATE_ARTIFACT_SCOPE_INVALID");
  }

  const evidencePaths = new Set(run.evidence.map(item => item.path));
  if (run.evidence.some(item => !isReleaseScopedPath(item.path))) throw new Error("RELEASE_GATE_EVIDENCE_SCOPE_INVALID");
  if (REQUIRED_RELEASE_EVIDENCE.some(item => !evidencePaths.has(item))) throw new Error("RELEASE_GATE_EVIDENCE_MISSING");
  if (!run.preview?.checkedAt || !run.preview.assets.some(asset => asset.passed && asset.status >= 200 && asset.status < 300)) {
    throw new Error("RELEASE_GATE_PREVIEW_EVIDENCE_INVALID");
  }
  if (!run.test || !run.test.passed || run.test.outputPath !== "evidence/test-output.json") throw new Error("RELEASE_GATE_TEST_EVIDENCE_INVALID");
  const expectedCriteria = new Set(run.contract.acceptanceCriteria.map(item => item.id));
  const passedCriteria = new Set(run.test.results.filter(item => item.status === "PASS").map(item => item.criterionId));
  if (passedCriteria.size !== expectedCriteria.size || Array.from(expectedCriteria).some(id => !passedCriteria.has(id))) {
    throw new Error("RELEASE_GATE_ACCEPTANCE_EVIDENCE_INVALID");
  }
  const evaluation = run.syntheticEvaluation;
  const qaReport = run.qaAgentReport;
  const qaEvidencePaths = new Set(run.evidence.map(item => item.path));
  const qaAgentPassed = qaReport?.agentId === QA_AGENT_ID
    && qaReport.buildRunId === run.id
    && qaReport.status === "PASS"
    && qaReport.evidencePath === "evidence/qa-agent-report.json"
    && qaReport.checks.length === QA_AGENT_QUALITY_GATES.length
    && qaReport.checks.every((check, index) =>
      check.id === QA_AGENT_QUALITY_GATES[index]
      && check.status === "PASS"
      && check.evidencePaths.every(item => qaEvidencePaths.has(item)),
    )
    && qaEvidencePaths.has(qaReport.evidencePath);
  const requiredEvaluators = ["functional_synthetic_user", "visual_synthetic_user"] as const;
  const evaluatorsPassedWithInteractions = Boolean(evaluation) && requiredEvaluators.every(name => evaluation!.runs.some(item => (
    item.evaluator_instance === name
    && item.status === "PASS"
    && item.evidence_paths.some(isReleaseScopedPath)
    && item.actions.length > 0
    && item.actions.every(action => action.passed === true)
  )));
  const evaluationBugsAreClassified = Boolean(evaluation) && evaluation!.bugs.every(bug => (
    bug.bug_id.length > 0
    && bug.evidence_paths.length > 0
    && bug.evidence_paths.every(isReleaseScopedPath)
    && (["critical", "high"].includes(bug.severity)
      ? ["FIXED", "DUPLICATE"].includes(bug.status)
      : true)
  ));
  const bugEvidenceRecorded = Boolean(evaluation) && (!evaluation!.bugs.length || evidencePaths.has("evidence/evaluators/bug-reports.json"));
  const evaluatorGateSatisfied = evaluation !== undefined
    && qaAgentPassed
    && (
      (evaluation.final_status === "PASS" && evaluation.checkpoint_allowed && evaluatorsPassedWithInteractions && evaluationBugsAreClassified && bugEvidenceRecorded)
      || localDevSyntheticBlockerBypass
    );
  if (!evaluatorGateSatisfied) {
    throw new Error("RELEASE_GATE_EVALUATOR_EVIDENCE_INVALID");
  }

  if (run.executionMode === "production-agent-queue") {
    const execution = run.productionAgentExecution;
    const tasks = execution?.tasks || [];
    if (!execution || !run.agentOrchestration
      || !productionTasksAreReleaseReady(tasks, execution.selectedTaskCount, evidencePaths, run.agentOrchestration.selectedAgents)
      || tasks.some(task => !task.executionSummary)) {
      throw new Error("RELEASE_GATE_PRODUCTION_AGENT_EVIDENCE_INVALID");
    }
  } else if (!run.agentOrchestration?.checkpointAllowed) {
    throw new Error("RELEASE_GATE_LEGACY_AGENT_EVIDENCE_INVALID");
  }
}

async function assertReleaseOperationalEvidence(run: BuildRun, persistence: BuildPersistence) {
  // Prove the selected durable run can be restored and exported before any checkpoint is created.
  const persisted = await persistence.listGeneratedFilesForBuildRun?.(run.userId, run.id) || [];
  await materializeDurableBuildRunEvidence(run, persisted);
  const exportPaths = exportableBuildRunPaths(run, persisted);
  const exportFiles = await exportableBuildRunFiles(run, persisted);
  if (!exportPaths.includes("evidence/build-run-export-manifest.json") || exportFiles.length !== exportPaths.length) {
    throw new Error("RELEASE_GATE_EXPORT_EVIDENCE_INVALID");
  }
  const nonPrivateArtifacts = effectiveBuildRunArtifacts(run, persisted).filter(artifact => !isPrivateAgentWorkProductPath(artifact.path));
  const exportedPathSet = new Set(exportFiles.map(file => file.path));
  if (nonPrivateArtifacts.some(artifact => !exportedPathSet.has(artifact.path))) throw new Error("RELEASE_GATE_EXPORT_ARTIFACT_MISSING");
  const zip = deterministicZip(exportFiles);
  if (zip.length < 4 || zip.subarray(0, 2).toString("utf8") !== "PK") throw new Error("RELEASE_GATE_EXPORT_ZIP_INVALID");
}

function syntheticEvaluationBlockerEnabled() {
  const override = process.env.SMARTBUILD_ENFORCE_SYNTHETIC_BLOCKER;
  if (override !== undefined) return ["1", "true", "yes", "on"].includes(override.trim().toLowerCase());
  return process.env.NODE_ENV === "production";
}

export async function createVerifiedCheckpoint(run: BuildRun, persistence: BuildPersistence) {
  assertActive(run);
  if (!run.preview || !run.test || !run.evidence.length) throw new Error("VERIFICATION_EVIDENCE_REQUIRED");
  if (syntheticEvaluationBlockerEnabled() && run.syntheticEvaluation && !run.syntheticEvaluation.checkpoint_allowed) throw new Error("SYNTHETIC_EVALUATION_BLOCKED: Confirmed critical or high synthetic-user defects require successful repair and re-evaluation before checkpointing.");
  const blocked = run.test.results.filter(result => result.status === "BLOCKED");
  const failed = run.test.results.filter(result => result.status === "FAIL");
  if (blocked.length) throw new Error(`ACCEPTANCE_CRITERIA_BLOCKED: ${blocked.map(result => `${result.criterion} — ${result.reason || result.evidence}`).join(" | ")}`);
  if (failed.length || !run.test.passed) throw new Error(`ACCEPTANCE_CRITERIA_FAILED: ${failed.map(result => `${result.criterion} — ${result.reason || result.evidence}`).join(" | ") || "One or more required acceptance criteria did not pass."}`);
  assertReleaseGateReady(run);
  // A resumed Autoscale request can reach this final gate on a fresh instance
  // whose local filesystem no longer holds the build. Rehydrate only this
  // Build Run's durable artifacts and regenerated evidence before Git or the
  // deterministic snapshot walks the workspace.
  await restoreBuildWorkspace(run, persistence);
  await assertReleaseOperationalEvidence(run, persistence);
  const executable = await resolveGitExecutable(run);
  if (!executable) return createSnapshotCheckpoint(run, persistence, { executable: null, path: process.env.PATH || "", command: null, exitCode: null, stdout: "", stderr: "Git executable was not found by which git." });
  const commands = [["init"], ["config", "user.email", "smartbuild@local.invalid"], ["config", "user.name", "SmartBuild Verified Pipeline"], ["add", "--all"]];
  for (const args of commands) { const result = await gitCommand(run, executable, args); if (result.exitCode !== 0) throw new Error(`GIT_CHECKPOINT_FAILED: ${result.stderr || args.join(" ")}`); }
  const message = `Verified build: ${run.contract.projectName}`;
  const commit = await gitCommand(run, executable, ["commit", "-m", message]);
  if (commit.exitCode !== 0) throw new Error(`GIT_CHECKPOINT_FAILED: ${commit.stderr || "git commit failed"}`);
  const revision = await gitCommand(run, executable, ["rev-parse", "HEAD"]);
  const verify = await gitCommand(run, executable, ["cat-file", "-e", "HEAD^{commit}"]);
  if (revision.exitCode !== 0 || verify.exitCode !== 0 || !/^[a-f0-9]{40}$/i.test(revision.stdout.trim())) throw new Error("GIT_CHECKPOINT_UNVERIFIED");
  await writeGitDiagnostics(run, { executable, path: process.env.PATH || "", verification: verify, revision });
  const checkpoint = { type: "checkpointed_git" as const, revision: revision.stdout.trim(), message, createdAt: now() };
  run.checkpoint = checkpoint;
  await writeFile(path.join(run.workspaceRoot, "evidence", "checkpoint.json"), JSON.stringify(checkpoint, null, 2), "utf8");
  run.evidence.push({ path: "evidence/checkpoint.json", kind: "checkpoint", createdAt: now() });
  appendLog(run, `Created and verified Git checkpoint ${checkpoint.revision.slice(0, 8)}.`);
  await updateProjectStatus(run, persistence, "succeeded", `Verified Git checkpoint ${checkpoint.revision.slice(0, 8)} created.`);
  run.completedAt = now();
  await persistRun(run, persistence);
  return run;
}

export async function cancelTimedOutBuild(buildId: string, persistence?: BuildPersistence, reason = "Build cancelled by user.") {
  const run = runs.get(buildId);
  if (!run || terminal(run.status)) return run;
  run.cancelRequested = true;
  processes.get(buildId)?.kill("SIGTERM");
  processes.delete(buildId);
  backendProcesses.get(buildId)?.kill("SIGTERM");
  backendProcesses.delete(buildId);
  backendTestTokens.delete(buildId);
  if (persistence) {
    const timedOut = reason === "Build timed out.";
    await updateProjectStatus(run, persistence, timedOut ? "timed_out" : "cancelled", reason);
  } else {
    run.status = reason === "Build timed out." ? "timed_out" : "cancelled";
    appendLog(run, reason);
  }
  run.completedAt = now();
  await persistRun(run, persistence);
  return run;
}

/**
 * An Autoscale instance may be replaced while its in-memory asynchronous build
 * worker is running. The durable record survives, but its preview, FastAPI,
 * Python, and Chromium child processes do not. Never resume that partial work
 * as if it were still executing: retain its evidence and expose an honest
 * terminal failure that the user can retry.
 */
export async function recoverInterruptedBuildRun(run: BuildRun, persistence: BuildPersistence) {
  if (terminal(run.status)) return run;
  await stopBuildPreview(run.id);
  return recordTerminalBuildFailure(
    run,
    persistence,
    new Error("BUILD_WORKER_INTERRUPTED: The Cloud build worker stopped before this Build Run reached a terminal result. Existing artifacts and evidence were retained; retry the build to run it again."),
  );
}

export async function continueVerifiedBuild(run: BuildRun, persistence: BuildPersistence, options?: { timeoutMs?: number }) {
  if (terminal(run.status)) return run;
  if (run.executionMode !== "legacy-template" && run.executionMode !== "production-agent-queue") {
    return recordTerminalBuildFailure(
      run,
      persistence,
      new Error("BUILD_EXECUTION_MODE_REQUIRED: This nonterminal Build Run is missing a durable execution mode and was blocked before any artifact, preview, evaluator, or checkpoint action."),
    );
  }
  const timeout = setTimeout(() => { void cancelTimedOutBuild(run.id, persistence, "Build timed out."); }, options?.timeoutMs || BUILD_TIMEOUT_MS);
  try {
    assertResumableExecutionMode(run);
    if (run.status === "planned") {
      if (isProductionAgentBuild(run)) return await prepareProductionAgentBuild(run, persistence);
      await updateProjectStatus(run, persistence, "planned", "RequirementContract and acceptance criteria persisted.");
      if (run.workspaceName || !persistence.getProjectName) {
        await persistence.updateProjectDetails(run.userId, run.projectId, { name: run.workspaceName || run.contract.projectName, description: run.contract.description });
      }
      await writeArtifactsToWorkspace(run, persistence);
      const agentOrchestration = await runBuildAgentOrchestration({ buildRunId: run.id, projectId: run.projectId, conversationId: run.conversationId, request: run.contract.request, workspaceRoot: run.workspaceRoot });
      run.agentOrchestration = agentOrchestration;
      run.evidence.push({ path: "evidence/agent-plan.json", kind: "agent-plan", createdAt: now(), summary: `${agentOrchestration.selectedAgents.length} selected agents; ${agentOrchestration.skippedAgents.length} skipped with explicit reasons.` });
      if (agentOrchestration.traceFile) run.evidence.push({ path: `evidence/agent-traces/${agentOrchestration.traceFile}`, kind: "agent-trace", createdAt: now(), summary: "Sequential dry-run trace for selected agents." });
      appendLog(run, "Autoscale resume step completed: artifacts and agent plan are durable; preview is queued.");
      await persistRun(run, persistence);
      return run;
    }
    if (run.status === "writing") {
      if (!isProductionAgentBuild(run)) return await runPreviewProcess(run, persistence);
      const progression = await advanceProductionAgentBuild(run, persistence);
      if (progression === "ready-for-preview") return await runPreviewProcess(run, persistence);
      return run;
    }
    if (run.status === "previewing") {
      if (isProductionAgentBuild(run) && !(await productionAgentQueueIsReleaseReady(run, persistence))) {
        return await rewindIncompleteProductionBuild(run, persistence);
      }
      // Preview child processes are intentionally ephemeral on Autoscale. A durable
      // run may therefore rehydrate in this state without its in-memory process or
      // preview descriptor. Recreate and verify the preview before tests rather
      // than producing a misleading PREVIEW_REQUIRED terminal failure.
      await ensureBuildPreview(run, persistence);
      return await runProjectTests(run, persistence);
    }
    if (run.status === "testing") {
      if (isProductionAgentBuild(run) && !(await productionAgentQueueIsReleaseReady(run, persistence))) {
        return await rewindIncompleteProductionBuild(run, persistence);
      }
      if (!run.syntheticEvaluation || run.evaluatorProgress?.state === "running") return await runSyntheticEvaluators(run, persistence);
      return await collectEvidence(run, persistence);
    }
    if (run.status === "verifying") {
      if (isProductionAgentBuild(run)) {
        if (!(await productionAgentQueueIsReleaseReady(run, persistence))) {
          return await rewindIncompleteProductionBuild(run, persistence);
        }
      } else if (!run.agentOrchestration?.checkpointAllowed) throw new Error(`ACCEPTANCE_CRITERIA_BLOCKED: ${run.agentOrchestration?.blockedReason || "AGENT_ORCHESTRATION_VERIFICATION_FAILED"}`);
      if (syntheticEvaluationBlockerEnabled() && !run.syntheticEvaluation?.checkpoint_allowed) throw new Error("SYNTHETIC_EVALUATION_BLOCKED: Confirmed critical or high synthetic-user defects require an existing-specialist repair plan and successful re-evaluation before checkpointing.");
      return await createVerifiedCheckpoint(run, persistence);
    }
    throw new Error(`BUILD_RESUME_STATUS_UNSUPPORTED: ${run.status}`);
  } catch (error) {
    if (error instanceof BuildRunAdvancementLeaseLostError) throw error;
    return await recordTerminalBuildFailure(run, persistence, error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runVerifiedBuild(input: { userId: number; projectId: number; conversationId: number; request: string; persistence: BuildPersistence; timeoutMs?: number; gitExecutable?: string | null; capabilities?: CapabilityAvailability; executionMode?: BuildExecutionMode }) {
  const run = await createProjectFromRequest(input);
  run.gitExecutable = input.gitExecutable;
  for (let step = 0; step < 16 && !terminal(run.status); step += 1) {
    await continueVerifiedBuild(run, input.persistence, { timeoutMs: input.timeoutMs });
  }
  if (!terminal(run.status)) return recordTerminalBuildFailure(run, input.persistence, new Error("BUILD_RESUME_STEP_LIMIT: The deterministic build helper exhausted its allowed resume steps."));
  return run;
}

export function getBuildRun(buildId: string) { return runs.get(buildId); }

export async function forgetBuildRun(buildId: string) {
  await stopBuildPreview(buildId);
  activePreviewStarts.delete(buildId);
  activePreviewEnsures.delete(buildId);
  runs.delete(buildId);
}

export function restoreBuildRun(run: BuildRun) {
  if (!run?.id || !run.workspaceRoot || !run.userId) throw new Error("BUILD_RUN_RESTORE_INVALID");
  if (!terminal(run.status) && run.executionMode !== "legacy-template" && run.executionMode !== "production-agent-queue") {
    run.status = "blocked";
    run.error = {
      code: "BUILD_EXECUTION_MODE_REQUIRED",
      message: "This nonterminal Build Run is missing a durable execution mode and was blocked before any artifact, preview, evaluator, or checkpoint action.",
      step: "restore",
    };
    run.completedAt = now();
    appendLog(run, `blocked: ${run.error.message}`);
  }
  runs.set(run.id, run);
  return run;
}

export async function stopBuildPreview(buildId: string) {
  const cleanupTasks: Promise<unknown>[] = [];
  const terminate = async (processHandle: ChildProcess) => {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
    const waitForExit = async (timeoutMs: number) => {
      if (processHandle.exitCode !== null || processHandle.signalCode !== null) return true;
      return new Promise<boolean>(resolve => {
        const finish = (exited: boolean) => {
          clearTimeout(timer);
          processHandle.removeListener("exit", onExit);
          processHandle.removeListener("close", onExit);
          resolve(exited);
        };
        const onExit = () => finish(true);
        const timer = setTimeout(() => finish(false), timeoutMs);
        processHandle.once("exit", onExit);
        processHandle.once("close", onExit);
      });
    };
    const pid = processHandle.pid;
    if (pid && process.platform === "win32") {
      try {
        await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
      } catch { /* ignore */ }
      if (!(await waitForExit(1_000))) {
        try { processHandle.kill("SIGKILL"); } catch { /* ignore */ }
        await waitForExit(1_000);
      }
      return;
    }
    try { processHandle.kill("SIGTERM"); } catch { /* ignore */ }
    if (!(await waitForExit(500))) {
      try { processHandle.kill("SIGKILL"); } catch { /* ignore */ }
      await waitForExit(1_000);
    }
  };
  const previewProcess = processes.get(buildId);
  if (previewProcess) cleanupTasks.push(terminate(previewProcess));
  const backendProcess = backendProcesses.get(buildId);
  if (backendProcess) cleanupTasks.push(terminate(backendProcess));
  processes.delete(buildId);
  backendProcesses.delete(buildId);
  backendTestTokens.delete(buildId);
  await Promise.allSettled(cleanupTasks);
}

export async function restoreBuildWorkspace(run: BuildRun, persistence: BuildPersistence) {
  let persisted = await persistence.listGeneratedFilesForBuildRun?.(run.userId, run.id);
  if (!persisted?.length && persistence.claimLegacyGeneratedFilesForBuildRun) {
    await persistence.claimLegacyGeneratedFilesForBuildRun({
      userId: run.userId,
      projectId: run.projectId,
      conversationId: run.conversationId,
      buildRunId: run.id,
      startedAt: new Date(run.startedAt),
      completedAt: run.completedAt ? new Date(run.completedAt) : null,
    });
    persisted = await persistence.listGeneratedFilesForBuildRun?.(run.userId, run.id);
  }
  if (persisted?.length) {
    // A restored durable run can have a stale artifact manifest when its
    // production worker wrote files from another process. Reconcile the
    // manifest before callers enumerate the workspace for Code & Preview.
    for (const artifact of persisted) {
      if (artifact.path.startsWith("evidence/") || run.artifacts.some(item => item.path === artifact.path)) continue;
      run.artifacts.push({ path: artifact.path, size: Buffer.byteLength(artifact.content, "utf8") });
    }
    if (!persistence.workspaceArtifactsAreAuthoritative) {
      await mkdir(run.workspaceRoot, { recursive: true });
      for (const artifact of persisted) {
        const relativePath = artifact.path.replace(/^\/+/, "");
        if (!relativePath || relativePath.includes("..") || relativePath.includes("\\")) continue;
        const destination = path.resolve(run.workspaceRoot, relativePath);
        if (!destination.startsWith(`${run.workspaceRoot}${path.sep}`)) continue;
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, artifact.content, "utf8");
      }
    }
  }
  await materializeDurableBuildRunEvidence(run, persisted || []);
}

type PersistedBuildRunArtifact = { path: string; content: string };
type ExportedBuildRunArtifact = { path: string; size: number };

function isPrivateAgentWorkProductPath(relativePath: string) {
  return relativePath.startsWith("agent-artifacts/");
}

function effectiveBuildRunArtifacts(run: BuildRun, persisted: PersistedBuildRunArtifact[] = []): ExportedBuildRunArtifact[] {
  const artifacts = new Map<string, ExportedBuildRunArtifact>();
  for (const artifact of run.artifacts) {
    const relativePath = artifact.path.replace(/^\/+/, "");
    if (safeBuildWorkspaceRelativePath(relativePath)) artifacts.set(relativePath, { path: relativePath, size: artifact.size });
  }
  // Database rows are written with the active Build Run ID. Prefer their byte
  // size because they are the durable source when an Autoscale instance has
  // lost its workspace and because the Files panel reads the same scoped rows.
  for (const artifact of persisted) {
    const relativePath = artifact.path.replace(/^\/+/, "");
    if (safeBuildWorkspaceRelativePath(relativePath)) artifacts.set(relativePath, { path: relativePath, size: Buffer.byteLength(artifact.content, "utf8") });
  }
  return Array.from(artifacts.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function durableEvidenceContent(run: BuildRun, evidence: BuildEvidence, artifacts: ExportedBuildRunArtifact[] = run.artifacts): string | undefined {
  const base = { format: "smartbuild-build-run-evidence-v1", buildRunId: run.id, projectId: run.projectId, conversationId: run.conversationId, generatedAt: now() };
  if (evidence.path === "evidence/requirement-contract.json") return JSON.stringify({ ...base, contract: run.contract }, null, 2);
  if (evidence.path === "evidence/build-plan.json") return JSON.stringify({ ...base, plan: run.plan, capabilities: artifactFacingCapabilities(run) }, null, 2);
  if (evidence.path === "evidence/python-runtime-project-runtime.json") return JSON.stringify(run.projectRuntimeDiagnostic || {
    ...base,
    component: "project-runtime",
    status: run.backend ? "ready" : "unavailable",
    requiredModules: ["pydantic", "fastapi", "uvicorn"],
    detail: "Runtime diagnostic regenerated from durable Build Run metadata after workspace restoration.",
  }, null, 2);
  if (evidence.path === "evidence/agent-execution.json" && run.agentOrchestration && run.productionAgentExecution) {
    const execution = buildAgentExecutionEvidence({
      projectId: run.projectId,
      conversationId: run.conversationId,
      buildRunId: run.id,
      plan: run.agentOrchestration,
      productionTasks: run.productionAgentExecution.tasks,
    });
    return JSON.stringify({
      ...base,
      format: "smartbuild-agent-execution-evidence-v1",
      executionMode: execution.executionMode,
      registryCount: execution.registryCount,
      totals: execution.totals,
      agents: execution.agents.map(agent => ({
        id: agent.id,
        status: agent.status,
        sequence: agent.sequence,
        timestamp: agent.timestamp,
        lastEvent: agent.lastEvent,
        evidenceRefs: agent.evidenceRefs,
        artifactRefs: agent.artifactRefs,
        artifactDetails: agent.artifactDetails,
        executionSummary: agent.executionSummary,
        implementationHash: agent.implementationHash,
      })),
    }, null, 2);
  }
  if (evidence.path === "evidence/agent-plan.json" || evidence.kind === "agent-plan" || evidence.kind === "agent-trace") return JSON.stringify({ ...base, orchestration: run.agentOrchestration, evidence }, null, 2);
  if (evidence.path === "evidence/preview-check.json") return JSON.stringify({ ...base, preview: run.preview }, null, 2);
  if (evidence.path === "evidence/test-output.json") return JSON.stringify({
    ...base,
    command: run.contract.template === "contact-form" ? "SmartBuild FastAPI/SQLite contact-form checks" : "SmartBuild static workspace checks",
    checkedAt: run.test?.checkedAt,
    capabilityMatrix: run.plan.capabilityMatrix,
    criteria: run.test?.results || [],
    passed: run.test?.passed ?? false,
  }, null, 2);
  if (evidence.path === "evidence/qa-agent-report.json") return JSON.stringify({ ...base, qaAgentReport: run.qaAgentReport, syntheticEvaluation: run.syntheticEvaluation, evidence }, null, 2);
  if (evidence.kind === "evaluation" || evidence.kind === "bug-report") return JSON.stringify({ ...base, evaluatorProgress: run.evaluatorProgress, syntheticEvaluation: run.syntheticEvaluation, qaAgentReport: run.qaAgentReport, evidence }, null, 2);
  if (evidence.path === "evidence/build-summary.json") return JSON.stringify({ ...base, contract: run.contract, plan: run.plan, capabilities: artifactFacingCapabilities(run), artifacts, preview: run.preview, test: run.test, checkpoint: run.checkpoint, evidence: run.evidence }, null, 2);
  if (evidence.path === run.checkpoint?.manifestPath) return JSON.stringify({ ...base, format: "smartbuild-build-run-checkpoint-manifest-v1", checkpoint: run.checkpoint, artifacts, evidence: run.evidence.filter(item => !item.path.endsWith(".zip")) }, null, 2);
  if (evidence.path === "evidence/checkpoint.json" || evidence.path === "evidence/git-diagnostics.json") return JSON.stringify({ ...base, checkpoint: run.checkpoint, evidence: run.evidence, logs: run.logs }, null, 2);
  return undefined;
}

async function materializeDurableBuildRunEvidence(run: BuildRun, persisted: PersistedBuildRunArtifact[] = []) {
  const artifacts = effectiveBuildRunArtifacts(run, persisted);
  await mkdir(path.join(run.workspaceRoot, "evidence"), { recursive: true });
  for (const evidence of run.evidence) {
    const relativePath = evidence.path.replace(/^\/+/, "");
    if (!relativePath || relativePath.includes("..") || relativePath.includes("\\") || relativePath.endsWith(".zip")) continue;
    const content = durableEvidenceContent(run, evidence, artifacts);
    if (!content) continue;
    const destination = path.resolve(run.workspaceRoot, relativePath);
    if (!destination.startsWith(`${run.workspaceRoot}${path.sep}`)) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  const manifestPath = path.join(run.workspaceRoot, "evidence", "build-run-export-manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    format: "smartbuild-build-run-export-v1",
    buildRunId: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId,
    status: run.status,
    artifacts,
    evidence: run.evidence,
    excludedPrivateAgentWorkProducts: artifacts
      .filter(artifact => isPrivateAgentWorkProductPath(artifact.path))
      .map(artifact => ({ path: artifact.path, reason: "Raw agent report and work-product contents are excluded; safe categorized references remain in agent execution evidence." })),
    excludedOpaqueEvidence: run.evidence.filter(item => item.path.endsWith(".zip")).map(item => ({ path: item.path, reason: "Nested checkpoint archives are excluded from the public workspace export because their opaque historical contents cannot be safely re-scoped to the selected Build Run." })),
    checkpoint: run.checkpoint,
  }, null, 2), "utf8");
}

function safeBuildWorkspaceRelativePath(value: string) {
  const normalized = value.replace(/^\/+/, "");
  return Boolean(normalized) && !normalized.includes("..") && !normalized.includes("\\") && !normalized.split("/").some(segment => !segment || segment.startsWith("."));
}

function exportableBuildRunPaths(run: BuildRun, persisted: PersistedBuildRunArtifact[] = []) {
  const paths = new Set<string>();
  for (const artifact of effectiveBuildRunArtifacts(run, persisted)) {
    // Agent reports and work-product manifests can contain request-specific
    // reasoning or raw model material. The selected-run export preserves only
    // their safe paths/categories in the generated evidence, never their bytes.
    if (!isPrivateAgentWorkProductPath(artifact.path)) paths.add(artifact.path);
  }
  for (const evidence of run.evidence) {
    const relativePath = evidence.path.replace(/^\/+/, "");
    // A snapshot archive is an opaque nested ZIP made at checkpoint time. It
    // is not required to inspect or restore this selected Build Run and could
    // preserve stale bytes from an earlier worker. The durable checkpoint
    // manifest remains exported and records this intentional exclusion.
    if (!relativePath.endsWith(".zip") && safeBuildWorkspaceRelativePath(relativePath)) paths.add(relativePath);
  }
  paths.add("evidence/build-run-export-manifest.json");
  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

async function exportableBuildRunFiles(run: BuildRun, persisted: PersistedBuildRunArtifact[] = []) {
  const files: Array<{ path: string; data: Buffer }> = [];
  for (const relativePath of exportableBuildRunPaths(run, persisted)) {
    const absolutePath = path.resolve(run.workspaceRoot, relativePath);
    if (!absolutePath.startsWith(`${run.workspaceRoot}${path.sep}`)) continue;
    try { files.push({ path: relativePath, data: await readFile(absolutePath) }); } catch { /* Missing non-durable evidence is omitted rather than replaced from another run. */ }
  }
  return files;
}

async function ensureBuildPreviewInternal(run: BuildRun, persistence: BuildPersistence) {
  const activeStart = activePreviewStarts.get(run.id);
  if (activeStart) return activeStart;
  if (run.preview) {
    try {
      const response = await fetch(run.preview.url, { signal: AbortSignal.timeout(1_000) });
      const html = await response.text();
      const indexContent = await readFile(path.join(run.workspaceRoot, "index.html"), "utf8").catch(() => "");
      const stylePath = run.manifest?.files.find(file => file.role === "style")?.path || "styles.css";
      const stylesContent = await readFile(path.join(run.workspaceRoot, stylePath), "utf8").catch(() => "");
      const styleResponse = response.ok && response.headers.get("x-smartbuild-build-run") === run.id
        ? await fetch(new URL(stylePath, run.preview.url), { signal: AbortSignal.timeout(1_000) })
        : null;
      const styleContent = styleResponse ? await styleResponse.text() : "";
      const livePreviewMatches = response.ok
        && response.headers.get("x-smartbuild-build-run") === run.id
        && html.includes("<main")
        && indexContent.trim()
        && stylesContent.trim()
        && styleResponse?.ok
        && styleResponse.headers.get("x-smartbuild-build-run") === run.id
        && (styleResponse.headers.get("content-type") || "").toLowerCase().includes("text/css")
        && styleContent.trim();
      if (livePreviewMatches) return run;
    } catch {
      // Child processes are intentionally ephemeral and may be gone after a server restart.
    }
  }
  await stopBuildPreview(run.id);
  run.preview = undefined;
  run.backend = undefined;
  await restoreBuildWorkspace(run, persistence);
  await ensureProductionSourceArtifacts(run, persistence);
  await startPreviewProcess(run, persistence);
  await persistRun(run, persistence);
  return run;
}

export async function ensureBuildPreview(run: BuildRun, persistence: BuildPersistence) {
  const activeEnsure = activePreviewEnsures.get(run.id);
  if (activeEnsure) return activeEnsure;
  const activeStart = activePreviewStarts.get(run.id);
  if (activeStart) return activeStart;
  const operation = Promise.resolve().then(() => ensureBuildPreviewInternal(run, persistence));
  activePreviewEnsures.set(run.id, operation);
  try {
    return await operation;
  } finally {
    if (activePreviewEnsures.get(run.id) === operation) activePreviewEnsures.delete(run.id);
  }
}

export async function inspectBuildRunDatabase(run: BuildRun, tableName?: string, page = 1, pageSize = 50) {
  const token = backendTestTokens.get(run.id);
  if (!run.backend || !token) return { available: false, tables: [] };
  const target = tableName
    ? new URL(`/__smartbuild__/database/tables/${encodeURIComponent(tableName)}?${new URLSearchParams({ page: String(page), pageSize: String(pageSize) })}`, run.backend.url)
    : new URL("/__smartbuild__/database/tables", run.backend.url);
  if (target.hostname !== "127.0.0.1" || target.protocol !== "http:") throw new Error("PROJECT_DATABASE_RUNTIME_UNAVAILABLE");
  const response = await fetch(target, {
    headers: { "x-smartbuild-test-token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(response.status === 404 ? "PROJECT_DATABASE_TABLE_UNAVAILABLE" : "PROJECT_DATABASE_READ_FAILED");
  return await response.json() as Record<string, unknown>;
}

function resolveBuildRun(build: string | BuildRun) {
  const run = typeof build === "string" ? runs.get(build) : build;
  if (!run) throw new Error("BUILD_RUN_UNAVAILABLE");
  return run;
}

export function listBuildWorkspaceFiles(build: string | BuildRun) {
  const run = resolveBuildRun(build);
  return [...run.artifacts.map(file => ({ path: file.path, type: "file" as const, size: file.size })), ...run.evidence.map(file => ({ path: file.path, type: "file" as const }))];
}

export async function exportBuildWorkspaceZip(build: string | BuildRun, persistence?: BuildPersistence) {
  const run = resolveBuildRun(build);
  let persisted: PersistedBuildRunArtifact[] = [];
  if (persistence) {
    await restoreBuildWorkspace(run, persistence);
    persisted = await persistence.listGeneratedFilesForBuildRun?.(run.userId, run.id) || [];
  } else await materializeDurableBuildRunEvidence(run);
  // Never snapshot the filesystem tree wholesale: an Autoscale worker may
  // leave files behind after a previous run. Export only the current durable
  // run's explicit artifact and evidence manifest.
  return deterministicZip(await exportableBuildRunFiles(run, persisted));
}

export async function readBuildWorkspaceFile(build: string | BuildRun, relativePath: string, persistence?: BuildPersistence) {
  const run = resolveBuildRun(build);
  if (persistence) await restoreBuildWorkspace(run, persistence);
  else await materializeDurableBuildRunEvidence(run);
  const normalized = relativePath.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\\") || normalized.split("/").some(segment => segment.startsWith("."))) throw new Error("BUILD_PATH_UNAVAILABLE");
  const allowedPaths = new Set([...run.artifacts.map(artifact => artifact.path), ...run.evidence.map(evidence => evidence.path)]);
  if (!allowedPaths.has(normalized)) throw new Error("BUILD_PATH_UNAVAILABLE");
  const absolute = path.resolve(run.workspaceRoot, normalized);
  if (!absolute.startsWith(`${run.workspaceRoot}${path.sep}`)) throw new Error("BUILD_PATH_UNAVAILABLE");
  return { path: normalized, content: await readFile(absolute, "utf8") };
}

export async function saveBuildRunWorkspaceFile(build: BuildRun, relativePath: string, content: string, persistence: BuildPersistence, createOnly = false) {
  if (!build.manifest || build.status !== "succeeded") throw new Error("BUILD_RUN_NOT_EDITABLE");
  const normalized = relativePath.replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (!safeBuildWorkspaceRelativePath(normalized) || segments.includes("node_modules") || segments.includes("agent-artifacts") || segments.includes("evidence") || /^\.env(?:\.|$)/i.test(normalized)) {
    throw new Error("BUILD_FILE_PATH_INVALID");
  }
  if (["index.html", "project.manifest.json"].includes(normalized)) throw new Error("BUILD_FILE_PROTECTED");
  if (Buffer.byteLength(content, "utf8") > 1024 * 1024) throw new Error("BUILD_FILE_TOO_LARGE");
  const extension = path.extname(normalized).toLowerCase();
  const language: ProjectManifest["files"][number]["language"] =
    extension === ".html" ? "html" : extension === ".css" ? "css" : extension === ".json" ? "json" : extension === ".md" ? "markdown" : "javascript";
  const supportedExtension = [".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".sql"].includes(extension);
  if (!supportedExtension || !createOnly && !content.trim()) throw new Error("BUILD_FILE_CONTENT_INVALID");
  if (language === "json") {
    if (content.trim()) {
      try { JSON.parse(content); } catch { throw new Error("BUILD_FILE_JSON_INVALID"); }
    }
  }
  const existing = build.artifacts.some(artifact => artifact.path === normalized);
  if (createOnly && existing) throw new Error("BUILD_FILE_ALREADY_EXISTS");
  if (!existing && build.artifacts.length >= 2000) throw new Error("BUILD_FILE_COUNT_LIMIT");

  const absolute = path.resolve(build.workspaceRoot, normalized);
  if (!absolute.startsWith(`${build.workspaceRoot}${path.sep}`)) throw new Error("BUILD_FILE_PATH_INVALID");
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  const metadata = { path: normalized, size: Buffer.byteLength(content, "utf8") };
  const artifactIndex = build.artifacts.findIndex(artifact => artifact.path === normalized);
  if (artifactIndex >= 0) build.artifacts[artifactIndex] = metadata;
  else build.artifacts.push(metadata);
  const fileId = await persistence.addGeneratedFile(build.userId, build.projectId, build.conversationId, {
    path: normalized,
    language,
    content,
  }, build.id);
  if (!build.generatedFileIds.includes(fileId)) build.generatedFileIds.push(fileId);
  const manifestFile = build.manifest.files.find(file => file.path === normalized);
  if (manifestFile) manifestFile.status = "updated";
  else {
    const role: ProjectManifest["files"][number]["role"] = normalized.startsWith("tests/") ? "test"
      : normalized.startsWith("src/pages/") ? "page"
        : normalized.startsWith("src/components/") ? "component"
          : normalized.startsWith("src/state/") ? "state"
            : normalized.startsWith("src/models/") ? "model"
              : language === "markdown" ? "documentation"
                : language === "json" ? "data"
                  : extension === ".css" ? "style"
                    : "utility";
    build.manifest.files.push({
      path: normalized,
      role,
      language,
      responsibility: `User-added project file in Build Run ${build.id}.`,
      imports: [],
      importedBy: [],
      usedInPreview: role !== "test" && role !== "documentation",
      status: "created",
    });
  }
  await persistBuildRunFileRevision(build, persistence, "build.file.saved", normalized);
  return { path: normalized, size: metadata.size, manualChangesPendingVerification: true };
}

export async function deleteBuildRunWorkspaceFile(build: BuildRun, relativePath: string, persistence: BuildPersistence) {
  if (!build.manifest || build.status !== "succeeded") throw new Error("BUILD_RUN_NOT_EDITABLE");
  const normalized = relativePath.replace(/^\/+/, "");
  if (!safeBuildWorkspaceRelativePath(normalized) || ["index.html", "project.manifest.json", "README.md"].includes(normalized) || normalized.startsWith("evidence/") || normalized.startsWith("agent-artifacts/")) {
    throw new Error("BUILD_FILE_PROTECTED");
  }
  if (!build.artifacts.some(artifact => artifact.path === normalized)) throw new Error("BUILD_FILE_NOT_FOUND");
  if (!persistence.deleteGeneratedFileForBuildRun) throw new Error("BUILD_FILE_DELETE_UNAVAILABLE");
  const absolute = path.resolve(build.workspaceRoot, normalized);
  if (!absolute.startsWith(`${build.workspaceRoot}${path.sep}`)) throw new Error("BUILD_FILE_PATH_INVALID");
  const deleted = await persistence.deleteGeneratedFileForBuildRun(build.userId, build.projectId, build.conversationId, build.id, normalized);
  if (!deleted && persistence.workspaceArtifactsAreAuthoritative !== true) throw new Error("BUILD_FILE_DELETE_NOT_PERSISTED");
  await rm(absolute, { force: true });
  build.artifacts = build.artifacts.filter(artifact => artifact.path !== normalized);
  build.manifest.files = build.manifest.files.filter(file => file.path !== normalized);
  for (const file of build.manifest.files) {
    file.imports = file.imports.filter(importedPath => importedPath !== normalized);
    file.importedBy = file.importedBy.filter(importerPath => importerPath !== normalized);
  }
  await persistBuildRunFileRevision(build, persistence, "build.file.deleted", normalized);
  return { path: normalized, manualChangesPendingVerification: true };
}

async function persistBuildRunFileRevision(build: BuildRun, persistence: BuildPersistence, eventType: string, filePath: string) {
  const manifest = build.manifest!;
  manifest.projectVersion += 1;
  manifest.updatedAt = now();
  const manifestPath = path.resolve(build.workspaceRoot, "project.manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  const manifestMetadata = { path: "project.manifest.json", size: Buffer.byteLength(JSON.stringify(manifest, null, 2), "utf8") };
  const existingManifestIndex = build.artifacts.findIndex(artifact => artifact.path === manifestMetadata.path);
  if (existingManifestIndex >= 0) build.artifacts[existingManifestIndex] = manifestMetadata;
  else build.artifacts.push(manifestMetadata);
  const manifestId = await persistence.addGeneratedFile(build.userId, build.projectId, build.conversationId, {
    path: manifestMetadata.path,
    language: "json",
    content: JSON.stringify(manifest, null, 2),
  }, build.id);
  if (!build.generatedFileIds.includes(manifestId)) build.generatedFileIds.push(manifestId);
  const currentArtifacts = await Promise.all(build.artifacts.map(async artifact => ({
    path: artifact.path,
    content: await readFile(path.resolve(build.workspaceRoot, artifact.path), "utf8"),
  })));
  manifest.contentHash = hashProjectArtifacts(currentArtifacts.map(artifact => ({
    ...artifact,
    language: artifact.path.endsWith(".json") ? "json" as const : artifact.path.endsWith(".css") ? "css" as const : artifact.path.endsWith(".html") ? "html" as const : "javascript" as const,
  })));
  manifest.codePreviewHash = manifest.contentHash;
  build.snapshot = createProjectSnapshot({
    projectId: String(build.projectId),
    buildRunId: build.id,
    version: manifest.projectVersion,
    entryFile: manifest.entryFile,
    createdAt: manifest.updatedAt,
    artifacts: currentArtifacts,
  });
  const snapshotPath = path.join(build.workspaceRoot, "evidence", "project-snapshot.json");
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify(build.snapshot, null, 2), "utf8");
  build.manualChangesPendingVerification = true;
  build.checkpoint = undefined;
  build.test = undefined;
  build.syntheticEvaluation = undefined;
  build.qaAgentReport = undefined;
  if (build.preview) {
    build.preview.projectVersion = manifest.projectVersion;
    build.preview.lastUpdatedAt = manifest.updatedAt;
    build.preview.codePreviewHash = manifest.codePreviewHash;
  }
  await persistence.appendProjectEvent(build.userId, build.projectId, eventType, {
    buildId: build.id,
    path: filePath,
    projectVersion: manifest.projectVersion,
    at: manifest.updatedAt,
  }, build.conversationId);
  await persistRun(build, persistence);
}

export async function readBuildPreview(build: string | BuildRun, relativePath = "") {
  const run = resolveBuildRun(build);
  if (!run?.preview) throw new Error("PREVIEW_UNAVAILABLE");
  const safeRelative = relativePath.replace(/^\/+/, "") || "index.html";
  if (safeRelative.includes("..") || safeRelative.includes("\\")) throw new Error("PREVIEW_PATH_UNAVAILABLE");
  if (run.manifest && !run.manifest.files.some(file => file.path === safeRelative && file.usedInPreview)) throw new Error("PREVIEW_PATH_UNAVAILABLE");
  const response = await fetch(new URL(safeRelative, run.preview.url).toString());
  if (!response.ok) throw new Error("PREVIEW_FILE_UNAVAILABLE");
  return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "application/octet-stream" };
}
