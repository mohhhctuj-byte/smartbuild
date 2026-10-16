import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";







import { Bot, Braces, Check, CheckCircle2, Cloud, Download, FileCode2, FilePlus2, FolderPlus, FolderUp, GitBranch, ListChecks, Menu, PanelRight, Pencil, Play, Plus, RefreshCw, Save, ScanSearch, TerminalSquare, Upload, X, ChevronDown } from "lucide-react";







import { AIChatBox, type ChatMessage, type ReferenceImage } from "@/components/AIChatBox";
import { AIImageCheckEntry } from "@/components/AIImageCheckEntry";







import { decodeMessageAttachments, type ChatAttachment } from "@shared/chatAttachments";







import { ActiveWorkspaceBinding, buildRunExportUrl, isRunForWorkspace, isWorkspaceResponseCurrent, workspaceComposerScope, withWorkspaceRestoreTimeout, WorkspaceActivationCoordinator, WorkspaceOperationEpoch, WorkspaceRestoreTimeoutError, WorkspaceSelectionWriteQueue, type WorkspaceSelection } from "@/lib/workspaceActivation";







import { buildRunTaskGraph, dedupeProjects, hasPassingRequiredEvidence, workspaceStatusLabel } from "@/lib/buildRunPresentation";







import { isBuildRunResumable } from "@/lib/buildRunResumption";







import { workspaceBootstrapPolicy } from "@/lib/workspaceBootstrapPolicy";







import { userFacingError } from "@/lib/userFacingError";
import { BROWSER_LOCAL_CHAT_INSTRUCTIONS, generateBrowserLocalReply, isRecoverableChatFailure, mergePendingBrowserReplies, prepareBrowserLocalModel, savePendingBrowserReply } from "@/lib/browserAiFallback";







import { dedupeCloudFiles } from "@/lib/dedupeCloudFiles";







import { sourceBuildFiles } from "@/lib/sourceBuildFiles";







import { isRefreshCurrent } from "@/lib/refreshGuard";














import SmartBuildMark from "@/components/SmartBuildMark";







import { WorkspaceListDeleteControl } from "@/components/WorkspaceListDeleteControl";







import { SyntheticDemoWorkspace } from "@/components/SyntheticDemoWorkspace";
import { SmartBuildAuthGate } from "@/components/SmartBuildAuthGate";







import { SmartBuildLogoutButton } from "@/components/SmartBuildLogoutButton";







import { WorkspaceDashboard } from "@/components/WorkspaceDashboard";







import { DatabaseExplorer } from "@/components/DatabaseExplorer";







import { WorkspaceSettings } from "@/components/WorkspaceSettings";







import { containsLikelyApiSecret } from "@shared/apiSecretGuard";







import { AI_MODEL_IDS, type AiModelId } from "@shared/aiModels";















type Project = { id: number; name: string };







type Conversation = { id: number; title: string; projectId: number };







type GeneratedFile = { id: number; path: string; content: string };







type Task = { id: string; title: string; specialist: string; status: "Pending" | "Verified" | "Blocked"; evidence: string };







type TaskGraph = { goal: string; summary: string; folderState?: string; tasks: Task[] };







type CloudStatus = { kind: "cloud"; label: string; rootLabel: string; supportsUpload: boolean; supportsDownloadZip: boolean; supportsPreview: boolean; supportsTests: boolean };







type CloudFile = { path: string; type: "file" | "directory"; size?: number };







type AcceptanceCriterion = { id: string; title: string; capability: string; description: string; required: true };







type CriterionResult = { criterionId: string; criterion: string; capability: string; status: "PASS" | "FAIL" | "BLOCKED"; evidence: string; reason?: string };







type AgentOrchestration = {







  registryCount: number;







  executionMode: "dry-run";







  checkpointAllowed: boolean;







  selectedAgents: Array<{ id: string; name: string; team: string; role: string; modelProfile: string; selected: true }>;







  skippedAgents: Array<{ id: string; reason: string }>;







  tasks: Array<{ taskId: string; agentId: string; title: string; dependsOn: string[]; locks: string[]; verificationMethods: string[]; selectedReason: string }>;







  traceFile?: string;







  blockedReason?: string;







  internalizedCapabilityCount?: number;







};







type AgentExecutionEvidence = {







  tuple: { projectId: number; conversationId: number; buildRunId: string };







  registryCount: 300;







  executionMode: "dry-run" | "production";







  totals: { selected: number; skipped: number; planned: number; traceObserved: number; running: number; succeeded: number; blocked: number; failed: number };







  trace: { file: string | null; present: boolean; eventCount: number };







  agents: Array<{ id: string; name: string; team: string; role: string; status: "SKIPPED" | "PLANNED" | "DRY_RUN_OBSERVED" | "REGISTERED" | "SELECTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED"; sequence: number | null; timestamp: string | null; lastEvent: string | null; evidenceRefs: string[]; artifactRefs: string[]; artifactDetails: Array<{ path: string; category: "SCOPED_ARTIFACT" | "ORIGINAL_REPORT" | "ADDITIVE_REPORT" | "WORK_PRODUCT_MANIFEST" }>; executionSummary: { artifactCount: number; verification: { passed: number; blocked: number }; additiveActionCount: number; pythonExecution: { producedArtifactCount: number; verificationCount: number; nextActionCount: number } | null } | null; implementationHash: string | null; selectionReason: string; detail: string }>;







};







type AgentEvidenceResponse = { buildRunId: string; evidence: AgentExecutionEvidence };







type SyntheticEvaluation = {







  enabled: true;







  execution_policy: "sequential";







  max_concurrency: 1;







  repair_cycles: number;







  max_repair_cycles: 3;







  checkpoint_allowed: boolean;







  final_status: "PASS" | "FAILED" | "BLOCKED";







  output_path: string;







  runs: Array<{ evaluator_instance: "functional_synthetic_user" | "visual_synthetic_user"; status: "PASS" | "FAILED" | "SKIPPED"; current_route?: string; current_step?: string; actions: Array<{ route?: string; step?: string; passed?: boolean }>; evidence_paths: string[]; screenshot_paths: string[]; trace_path?: string; console_errors: string[]; network_failures: string[]; skip_reason?: string }>;







  bugs: Array<{ bug_id: string; evaluator_instance: "functional_synthetic_user" | "visual_synthetic_user"; category: string; title: string; severity: "critical" | "high" | "medium" | "low" | "unconfirmed"; route?: string; reproducible: boolean; expected_result: string; actual_result: string; suspected_owner_agent?: string; evidence_paths: string[]; screenshot_paths: string[]; status: string }>;







  repair_tasks: Array<{ task_id: string; bug_id: string; agent_id: string; agent_name: string; resource_locks: string[]; status: "REPAIR_PLANNED" | "BLOCKED"; reason: string }>;







};







type BuildRun = {







  id: string;







  requestId?: string;







  projectId: number;







  conversationId: number;







  status: "planned" | "queued" | "planning" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";







  request?: string;







  model?: AiModelId;







  workspaceName?: string;







  workspaceNameError?: string;







  contract: { request: string; projectName: string; description: string; acceptanceCriteria: AcceptanceCriterion[] };







  manifest?: { projectVersion: number; entryFile: string; contentHash?: string; codePreviewHash?: string; updatedAt?: string };







  plan: { summary: string; steps: string[] };







  artifacts: Array<{ path: string; size: number }>;







  evidence: Array<{ path: string; summary: string }>;







  snapshot?: { projectId: string; buildRunId: string; version: number; entryFile: string; createdAt: string; files: Array<{ path: string; contentHash: string; content: string }> };







  preview?: { proxyUrl?: string; url?: string; projectName?: string; buildRunId?: string; projectVersion?: number; status?: "ready"; lastUpdatedAt?: string; codePreviewHash?: string; assets?: Array<{ path: string; status: number; contentType: string; bytes: number; passed: boolean; detail?: string }> };







  test?: { passed: boolean; checks: string[]; results: CriterionResult[]; outputPath: string; checkedAt: string };







  agentOrchestration?: AgentOrchestration;







  syntheticEvaluation?: SyntheticEvaluation;







  checkpoint?: { type: "checkpointed_git" | "checkpointed_snapshot"; revision: string; message: string; warning?: string; createdAt?: string };







  manualChangesPendingVerification?: boolean;







  error?: { message: string; code?: string; step?: string };







  journeyEvents?: Array<{ requestId: string; sequence: number; stage: "inspection" | "planning" | "execution" | "verification" | "delivery"; state: "in_progress" | "completed" | "failed"; detail: string; at: string }>;







  startedAt?: string;







  completedAt?: string;







};







const BUILD_PROGRESS_STAGES = ["Queued", "Plan", "Write", "Preview", "Verify"] as const;







function buildRunProgress(run: BuildRun) {







  const phases: Record<BuildRun["status"], { stage: number; label: string; loading: boolean }> = {







    planned: { stage: 0, label: "Queued", loading: false }, queued: { stage: 0, label: "Queued", loading: true }, planning: { stage: 1, label: "Planning", loading: true }, writing: { stage: 2, label: "Writing saved files", loading: true }, previewing: { stage: 3, label: "Saving preview", loading: true }, testing: { stage: 4, label: "Checking output", loading: true }, verifying: { stage: 4, label: "Verifying", loading: true }, succeeded: { stage: 5, label: "Build complete", loading: false }, failed: { stage: 0, label: "Build failed", loading: false }, blocked: { stage: 0, label: "Build blocked", loading: false }, timed_out: { stage: 0, label: "Build timed out", loading: false }, cancelled: { stage: 0, label: "Build cancelled", loading: false },







  };







  return { ...phases[run.status], savedArtifactCount: run.artifacts.length };







}















const WORKSPACE_SWATCHES = ["#7dd3fc", "#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f472b6", "#fda4af"];















function workspaceSwatchFor(project: Pick<Project, "id" | "name">, index: number) {







  const hash = Array.from(project.name + project.id.toString()).reduce((sum, char) => sum + char.charCodeAt(0), 0);







  return WORKSPACE_SWATCHES[(hash + index) % WORKSPACE_SWATCHES.length];







}







type PendingUpload = { file: File; relative: string };















function rejectProjectChanges(notify: (message: string) => void, message = "Project changes are disabled. Saved files remain unchanged."): boolean {







  notify(message);







  return true;







}







type DroppedEntry = { name: string; isFile?: boolean; isDirectory?: boolean; file?: (success: (file: File) => void, failure?: () => void) => void; createReader?: () => { readEntries: (success: (entries: DroppedEntry[]) => void, failure?: () => void) => void } };







type WebkitTransferItem = DataTransferItem & { webkitGetAsEntry?: () => DroppedEntry | null };







type ReleaseDiagnostic = {







  status: "ready" | "unavailable";







  projectId: number | null;







  conversationId: number | null;







  buildRunId: string | null;







  artifactCount: number;







  preview: { status: "ready" | "unavailable" | "not-requested"; httpStatus: number | null };







  evaluators: { status: "available" | "unavailable"; checkpointAllowed: boolean | null; runs: Array<{ evaluator: string; status: string }> };







  bugs: { count: number };







  checkpoint: { status: "available" | "not-created"; type: string | null };







  export: { status: "ready" | "unavailable" | "not-requested"; httpStatus: number | null; fileName: string };







};







type TruthEngineReport = { status: "PASS" | "BLOCKED" | "FAILED"; projectId: number | null; conversationId: number | null; buildRunId: string | null; checks: Array<{ id: string; label: string; status: "PASS" | "BLOCKED" | "FAILED"; detail: string; evidencePaths: string[] }> };







type BuildRunReviewStatus = "unreviewed" | "approved" | "changes_requested";







type BuildRunReview = { status: BuildRunReviewStatus; note: string | null; reviewedAt: string | null; updatedAt: string | null };







type BuildRunReviewResponse = { buildRunId: string; projectId: number; conversationId: number; review: BuildRunReview | null };















const SAFE_AGENT_REASON_CODES = new Set([







  "AGENT_TASK_BLOCKED",







  "AGENT_CAPABILITY_MISSING",







  "AGENT_TASK_NOT_SELECTED",







  "AGENT_DEPENDENCY_BLOCKED",







  "AGENT_PROVIDER_BLOCKED",







  "AGENT_OUTPUT_PATH_DUPLICATE",







  "TRIGGER_NOT_MATCHED_OR_NOT_REQUIRED",







]);















function safeAgentReason(reason: string | undefined): string {







  return reason && SAFE_AGENT_REASON_CODES.has(reason) ? reason : "AGENT_TASK_BLOCKED";







}















function isVerifiedBuildRun(run: BuildRun | null | undefined): boolean {







  return Boolean(run && run.status === "succeeded" && run.checkpoint && hasPassingRequiredEvidence(run));







}















async function request<T>(url: string, init?: RequestInit): Promise<T> {







  const response = await fetch(url, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers || {}) }, ...init });







  const data = await response.json().catch(() => ({}));







  if (!response.ok) throw new Error((data as { error?: string }).error || "Request failed.");







  return data as T;







}















function DemoModeWorkspace({ onExit }: { onExit: () => void }) { return <SyntheticDemoWorkspace onExit={onExit} />; }















function AgentExecutionCounts({ evidence }: { evidence: AgentExecutionEvidence }) {







  const executed = evidence.agents.filter(agent => ["RUNNING", "SUCCEEDED", "FAILED", "BLOCKED"].includes(agent.status)).length;







  const outcomeSummary = evidence.executionMode === "production"







    ? `Succeeded ${evidence.totals.succeeded} · Running ${evidence.totals.running} · Blocked ${evidence.totals.blocked} · Failed ${evidence.totals.failed}`







    : "No production outcome is inferred from this dry-run plan.";







  return <section aria-label="Current agent registry and execution counts" className="border-b border-cyan-300/15 bg-cyan-300/[0.025] px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-100">Current canonical agent registry</p><div className="mt-1 grid grid-cols-4 gap-1.5 text-[9px]"><p className="rounded bg-black/20 p-1.5 text-slate-400"><span className="block text-sm font-semibold text-white">{evidence.registryCount}</span>registered</p><p className="rounded bg-black/20 p-1.5 text-slate-400"><span className="block text-sm font-semibold text-white">{evidence.totals.selected}</span>selected</p><p className="rounded bg-black/20 p-1.5 text-slate-400"><span className="block text-sm font-semibold text-white">{executed}</span>executed</p><p className="rounded bg-black/20 p-1.5 text-slate-400"><span className="block text-sm font-semibold text-white">{evidence.totals.skipped}</span>skipped</p></div><p aria-label="Build-Run-scoped agent outcome breakdown" className="mt-1.5 rounded bg-black/15 px-1.5 py-1 font-mono text-[9px] leading-3 text-slate-400">{outcomeSummary}</p><p className="mt-1.5 text-[9px] leading-3 text-slate-500">Execution counts are Build-Run-scoped. A dry-run plan records selection only and does not represent code-writing execution.</p></section>;







}















function WorkspacePreparationState({ busy, onRetry, onCreate, legacyClaimState: initialLegacyClaimState, onClaim }: { busy: boolean; onRetry: () => void; onCreate: () => void; legacyClaimState?: "claimable" | "claimed" | "recovery_required" | "unavailable"; onClaim?: () => Promise<void> }) {







  const [legacyClaimState, setLegacyClaimState] = useState<"claimable" | "claimed" | "recovery_required" | "unavailable" | null>(initialLegacyClaimState ?? null);







  const [claiming, setClaiming] = useState(false);







  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);















  useEffect(() => { setLegacyClaimState(initialLegacyClaimState ?? null); setClaimFeedback(null); }, [initialLegacyClaimState]);















  const claimable = legacyClaimState === "claimable";







  const recoveryRequired = legacyClaimState === "recovery_required";







  const isBusy = busy || claiming;







  const unavailable = legacyClaimState === "unavailable";







  const heading = claimable ? "Claim existing workspace" : recoveryRequired ? "Owner recovery required" : unavailable ? "Workspace unavailable" : busy ? "Your workspace is being prepared" : "Workspace not created";







  const description = claimable







    ? "A preserved SmartBuild workspace is available for one-time server-side binding to this verified account. Claiming preserves its projects, conversations, Build Runs, files, previews, evaluator evidence, checkpoints, and exports without recreating them."







    : recoveryRequired







      ? "This preserved workspace is already bound to a verified account. It will not use another account’s projects, Build Runs, files, previews, exports, or evaluator evidence. Sign in with the existing owner account or use a secure owner-recovery process."







      : unavailable







        ? "SmartBuild could not open a private workspace for this account. Retry the operation or create a new workspace explicitly."







        : busy







          ? "SmartBuild is preparing a new private production workspace for this verified account."







          : "No workspace is active for this account yet. Create one to open the dashboard.";







  const submitClaim = async () => {







    setClaiming(true);







    setClaimFeedback(null);







    try { await onClaim?.(); }







    catch {







      setLegacyClaimState("unavailable");







      setClaimFeedback("The preserved workspace could not be claimed. No workspace data was changed.");







    } finally {







      setClaiming(false);







    }







  };















  return <section aria-live="polite" aria-label={heading} className="m-auto w-full max-w-xl rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-6 text-center shadow-2xl shadow-black/30">







    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08]"><Cloud className="h-5 w-5 text-cyan-100" /></div>







    <h1 className="mt-4 text-base font-semibold text-cyan-50">{heading}</h1>







    <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>







    {claimFeedback && <p className="mt-3 text-xs leading-5 text-rose-200">{claimFeedback}</p>}







    {!recoveryRequired && <p className="mt-3 text-xs leading-5 text-slate-500">{claimable ? "The claim is authorized only by the verified server-side session and cannot be selected from a URL, browser storage, or client identity." : "Retry only repeats a failed operation. Create new workspace starts a new private workspace for this account."}</p>}







    <div className="mt-5 flex flex-wrap justify-center gap-2">{claimable && <button onClick={() => void submitClaim()} disabled={isBusy} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{isBusy ? "Claiming…" : "Claim existing workspace"}</button>}<button onClick={onRetry} disabled={isBusy} className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06] disabled:opacity-50">{isBusy ? "Preparing…" : "Retry"}</button><button onClick={onCreate} disabled={isBusy} className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06] disabled:opacity-50">Create new workspace</button></div>







  </section>;







}















function ReleaseDiagnosticPanel({ diagnostic }: { diagnostic: ReleaseDiagnostic | null }) {







  if (!diagnostic) return null;







  const rows = [







    ["Project", diagnostic.projectId ?? "—"], ["Conversation", diagnostic.conversationId ?? "—"], ["Build Run", diagnostic.buildRunId ? diagnostic.buildRunId.slice(0, 8) : "—"],







    ["Artifacts", diagnostic.artifactCount], ["Preview", diagnostic.preview.httpStatus ? `HTTP ${diagnostic.preview.httpStatus}` : diagnostic.preview.status],







    ["Evaluators", diagnostic.evaluators.status === "available" ? diagnostic.evaluators.runs.map(run => `${run.evaluator.includes("functional") ? "F" : "V"}:${run.status}`).join(" · ") : "unavailable"],







    ["Bugs", diagnostic.bugs.count], ["Checkpoint", diagnostic.checkpoint.type || diagnostic.checkpoint.status], ["Export", diagnostic.export.httpStatus ? `HTTP ${diagnostic.export.httpStatus}` : diagnostic.export.status],







  ];







  return <section aria-label="Release diagnostic" className="border-b border-cyan-300/15 bg-cyan-300/[0.035] px-3 py-2"><div className="mb-1 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">Release diagnostic</p><span className={`rounded px-1.5 py-0.5 text-[9px] ${diagnostic.status === "ready" ? "bg-emerald-300/10 text-emerald-100" : "bg-amber-300/10 text-amber-100"}`}>{diagnostic.status}</span></div><div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[9px] leading-4">{rows.map(([label, value]) => <p key={String(label)} className="min-w-0 text-slate-500"><span className="text-slate-600">{label}: </span><span className="break-all text-slate-300">{String(value)}</span></p>)}</div></section>;







}















function TruthEnginePanel({ report }: { report: TruthEngineReport | null }) {







  if (!report) return <div className="p-4 text-center text-xs text-slate-600">Truth Engine is loading persisted Build Run evidence.</div>;







  const tone = report.status === "PASS" ? "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100" : report.status === "BLOCKED" ? "border-amber-300/25 bg-amber-300/[0.06] text-amber-100" : "border-rose-300/25 bg-rose-300/[0.06] text-rose-100";







  return <div className="min-h-0 flex-1 overflow-y-auto p-3"><section aria-label="Truth Engine" className={`rounded-lg border p-3 ${tone}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">Truth Engine</p><p className="mt-1 text-[10px] leading-4 text-slate-300">Production-only evidence evaluation for the selected project, conversation, and Build Run. It reads persisted evidence and never generates a successful result.</p></div><span className="rounded bg-black/20 px-2 py-1 font-mono text-[10px] font-semibold">{report.status}</span></div><div className="mt-3 grid grid-cols-3 gap-2 rounded bg-black/20 p-2 font-mono text-[9px] text-slate-300"><p>Project<br /><span className="text-white">{report.projectId ?? "—"}</span></p><p>Conversation<br /><span className="text-white">{report.conversationId ?? "—"}</span></p><p>Build Run<br /><span className="break-all text-white">{report.buildRunId?.slice(0, 8) ?? "—"}</span></p></div></section><div className="mt-3 space-y-2">{report.checks.map(check => <section key={check.id} className="rounded border border-white/[0.07] bg-white/[0.025] p-2"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-slate-200">{check.label}</p><span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] ${check.status === "PASS" ? "bg-emerald-300/10 text-emerald-200" : check.status === "BLOCKED" ? "bg-amber-300/10 text-amber-100" : "bg-rose-300/10 text-rose-100"}`}>{check.status}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-400">{check.detail}</p>{check.evidencePaths.length > 0 && <p className="mt-1 font-mono text-[9px] text-slate-500">{check.evidencePaths.join(" · ")}</p>}</section>)}</div></div>;







}















function AgentEvidencePanel({ evidence }: { evidence: AgentExecutionEvidence }) {







  const tone = (status: AgentExecutionEvidence["agents"][number]["status"]) => status === "FAILED" ? "bg-rose-300/10 text-rose-100" : status === "BLOCKED" ? "bg-amber-300/10 text-amber-100" : status === "DRY_RUN_OBSERVED" ? "bg-cyan-300/10 text-cyan-100" : status === "PLANNED" ? "bg-violet-300/10 text-violet-100" : "bg-white/[0.07] text-slate-400";







  const artifactLabel = (category: AgentExecutionEvidence["agents"][number]["artifactDetails"][number]["category"]) => category === "ORIGINAL_REPORT" ? "Original responsibility report" : category === "ADDITIVE_REPORT" ? "Additive report" : category === "WORK_PRODUCT_MANIFEST" ? "Work-product manifest" : "Scoped artifact";







  return <div className="space-y-3"><section className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-100"><Bot className="h-3.5 w-3.5" />Audited agent evidence</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Build-Run-scoped supervisor evidence. Dry-run trace rows do not claim autonomous code-writing or live external work.</p></div><span className="rounded bg-violet-300/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-100">{evidence.executionMode}</span></div><div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[9px] text-slate-400"><p>Project<br /><span className="text-white">{evidence.tuple.projectId}</span></p><p>Conversation<br /><span className="text-white">{evidence.tuple.conversationId}</span></p><p>Build Run<br /><span className="text-white">{evidence.tuple.buildRunId.slice(0, 8)}</span></p></div><div className="mt-3 grid grid-cols-4 gap-2 text-[10px]"><p className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-base font-semibold text-white">{evidence.registryCount}</span>registry</p><p className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-base font-semibold text-white">{evidence.totals.selected}</span>selected</p><p className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-base font-semibold text-white">{evidence.totals.skipped}</span>skipped</p><p className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-base font-semibold text-white">{evidence.totals.traceObserved}</span>observed</p></div></section><section className="rounded border border-white/[0.06] bg-white/[0.025] p-2 text-[10px] text-slate-500"><p className="font-medium text-slate-300">Retained trace</p><p className="mt-1 font-mono">{evidence.trace.file || "No scoped trace filename was retained."}</p><p className="mt-1">{evidence.trace.present ? `${evidence.trace.eventCount} retained event(s).` : "No trace event was retained; selected agents remain planned."}</p></section><section><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Per-agent evidence</p><div className="max-h-[420px] space-y-1.5 overflow-y-auto">{evidence.agents.map((agent, index) => <article key={`${evidence.tuple.buildRunId}:${agent.id}:${agent.sequence ?? "unsequenced"}:${index}`} className="rounded border border-white/[0.06] bg-white/[0.025] p-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[11px] font-medium text-slate-200">{agent.id === "smartbuild-website-builder-agent" ? "Archived implementation record" : agent.name}</p><p className="mt-0.5 font-mono text-[9px] text-slate-500">{agent.id} {agent.sequence ? `· #${agent.sequence}` : ""}</p></div><span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] ${tone(agent.status)}`}>{agent.status}</span></div><p className="mt-1 text-[10px] text-slate-500">{agent.team && agent.role ? `${agent.team} · ${agent.role}` : agent.detail}</p><p aria-label="Safe agent selection reason" className="mt-1 font-mono text-[9px] text-slate-500">Selection: {agent.selectionReason}</p>{agent.timestamp && <p className="mt-1 font-mono text-[9px] text-cyan-100/80">{new Date(agent.timestamp).toLocaleString()} · {agent.lastEvent || "trace event"}</p>}{agent.implementationHash && <p aria-label="Safe agent implementation fingerprint" className="mt-1 break-all font-mono text-[9px] text-cyan-100/80">Implementation fingerprint: {agent.implementationHash}</p>}{agent.executionSummary && <><p aria-label="Safe execution summary" className="mt-1 rounded bg-black/15 px-1.5 py-1 font-mono text-[9px] text-slate-500">Persisted counts: {agent.executionSummary.artifactCount} artifact(s) · {agent.executionSummary.verification.passed} verification pass · {agent.executionSummary.verification.blocked} verification blocked · {agent.executionSummary.additiveActionCount} additive action(s)</p>{agent.executionSummary.pythonExecution && <p aria-label="Safe Python execution metadata" className="mt-1 rounded bg-black/15 px-1.5 py-1 font-mono text-[9px] text-slate-500">Python counts: {agent.executionSummary.pythonExecution.producedArtifactCount} reported artifact(s) · {agent.executionSummary.pythonExecution.verificationCount} verification record(s) · {agent.executionSummary.pythonExecution.nextActionCount} next action(s)</p>}</>}{agent.evidenceRefs.length > 0 && <p className="mt-1 break-all font-mono text-[9px] text-slate-500">{agent.evidenceRefs.join(" · ")}</p>}{agent.artifactDetails.length > 0 && <div aria-label="Scoped agent artifacts" className="mt-1.5 space-y-1 rounded bg-black/15 p-1.5 font-mono text-[9px] text-slate-500">{agent.artifactDetails.map(artifact => <p key={artifact.path} className="break-all"><span className="text-cyan-100">{artifactLabel(artifact.category)}:</span> {artifact.path}</p>)}</div>}</article>)}</div></section></div>;







}















async function collectEntryFiles(entry: DroppedEntry, parent = ""): Promise<PendingUpload[]> {







  const relative = parent ? `${parent}/${entry.name}` : entry.name;







  if (entry.isFile && entry.file) return new Promise(resolve => entry.file!(file => resolve([{ file, relative }]), () => resolve([])));







  if (!entry.isDirectory || !entry.createReader) return [];







  const reader = entry.createReader();







  const entries: DroppedEntry[] = [];







  await new Promise<void>(resolve => {







    const read = () => reader.readEntries(batch => { if (!batch.length) return resolve(); entries.push(...batch); read(); }, () => resolve());







    read();







  });







  return (await Promise.all(entries.map(child => collectEntryFiles(child, relative)))).flat();







}















function CloudWorkspacePanel({ active, notice, buildRun, onBuildRunChange, conversationFiles, workspaceScope, ownerBindingVerified }: { active: boolean; notice: (text: string) => void; buildRun: BuildRun | null; onBuildRunChange: (run: BuildRun) => void; conversationFiles: GeneratedFile[]; workspaceScope: { projectId: number; conversationId: number } | null; ownerBindingVerified: boolean }) {




  const [status, setStatus] = useState<CloudStatus | null>(null);







  const [files, setFiles] = useState<CloudFile[]>([]);







  const [lastScopedRefreshAt, setLastScopedRefreshAt] = useState<string | null>(null);







  const [activePath, setActivePath] = useState<string | null>(null);







  const [content, setContent] = useState("");







  const [baseline, setBaseline] = useState("");







  const [view, setView] = useState<"files" | "changes" | "logs" | "agents" | "evaluators" | "bugs" | "truth">("files");







  const [changes, setChanges] = useState<string[]>([]);







  const [logs, setLogs] = useState<Array<{ id: string; message: string }>>([]);







  const [isDragging, setIsDragging] = useState(false);







  const [splitPreview, setSplitPreview] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("smartbuild:code-preview-split") === "true");







  const [resultTab, setResultTab] = useState<"preview" | "code" | "database" | "dashboard" | "settings">(() => {







    if (typeof window === "undefined") return "preview";







    const saved = window.localStorage.getItem("smartbuild:code-preview-tab");







    return saved === "code" || saved === "database" || saved === "dashboard" || saved === "settings" ? saved : "preview";







  });







  const [focusSecretsRevision, setFocusSecretsRevision] = useState(0);







  const [busy, setBusy] = useState(false);







  const [diagnostic, setDiagnostic] = useState<ReleaseDiagnostic | null>(null);







  const [truthReport, setTruthReport] = useState<TruthEngineReport | null>(null);







  const [agentEvidence, setAgentEvidence] = useState<AgentExecutionEvidence | null>(null);







  const [review, setReview] = useState<BuildRunReview | null>(null);







  const [reviewBusy, setReviewBusy] = useState(false);







  const [toolsOpen, setToolsOpen] = useState(false);







  const [desktopToolsViewport, setDesktopToolsViewport] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches);







  const [desktopViewportWidth, setDesktopViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);







  const [railLayoutOpen, setRailLayoutOpen] = useState(false);







  const [railVisualOpen, setRailVisualOpen] = useState(false);







  const [toolsWidth, setToolsWidth] = useState(() => {







    if (typeof window === "undefined") return 430;







    const stored = Number(window.localStorage.getItem("smartbuild:code-panel-width"));







    return Number.isFinite(stored) ? Math.min(760, Math.max(360, stored)) : 520;







  });







  const uploadInput = useRef<HTMLInputElement>(null);







  const refreshGeneration = useRef(0);







  const toolsPanelRef = useRef<HTMLElement>(null);







  const shouldFocusTools = useRef(false);







  const railTransitionTimer = useRef<number | null>(null);







  const codePanelRunScope = useRef<string | null>(null);







  const autoOpenedBuildRun = useRef<string | null>(null);







  const toolsVisible = toolsOpen;







  const desktopPanelMaxWidth = Math.max(360, desktopViewportWidth - 270 - 420);







  const visibleToolsWidth = Math.min(toolsWidth, desktopPanelMaxWidth);







  useEffect(() => {







    const viewport = window.matchMedia("(min-width: 1280px)");







    const syncViewport = () => {







      setDesktopToolsViewport(viewport.matches);







      setDesktopViewportWidth(window.innerWidth);







    };







    syncViewport();







    viewport.addEventListener("change", syncViewport);







    window.addEventListener("resize", syncViewport);







    return () => {







      viewport.removeEventListener("change", syncViewport);







      window.removeEventListener("resize", syncViewport);







    };







  }, []);







  useEffect(() => {







    if (railTransitionTimer.current !== null) {







      window.clearTimeout(railTransitionTimer.current);







      railTransitionTimer.current = null;







    }







    if (toolsVisible) {







      setRailLayoutOpen(true);







      const frame = window.requestAnimationFrame(() => setRailVisualOpen(true));







      return () => window.cancelAnimationFrame(frame);







    }







    setRailVisualOpen(false);







    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;







    railTransitionTimer.current = window.setTimeout(() => {







      setRailLayoutOpen(false);







      railTransitionTimer.current = null;







    }, duration);







    return () => {







      if (railTransitionTimer.current !== null) {







        window.clearTimeout(railTransitionTimer.current);







        railTransitionTimer.current = null;







      }







    };







  }, [toolsVisible]);







  useEffect(() => { window.localStorage.setItem("smartbuild:code-panel-width", String(toolsWidth)); }, [toolsWidth]);







  useEffect(() => { window.localStorage.setItem("smartbuild:code-preview-split", String(splitPreview)); }, [splitPreview]);







  useEffect(() => { window.localStorage.setItem("smartbuild:code-preview-tab", resultTab); }, [resultTab]);







  useEffect(() => {







    const openSecrets = () => {







      shouldFocusTools.current = true;







      setToolsOpen(true);







      setResultTab("settings");







      setFocusSecretsRevision(current => current + 1);







    };







    window.addEventListener("smartbuild:open-project-secrets", openSecrets);







    return () => window.removeEventListener("smartbuild:open-project-secrets", openSecrets);







  }, []);







  useEffect(() => {







    if (!buildRun?.preview?.proxyUrl) return;







    setSplitPreview(true);







  }, [buildRun?.id, buildRun?.preview?.proxyUrl]);







  useEffect(() => {







    if (!buildRun) return;







    setSplitPreview(true);







  }, [buildRun?.id]);







  useEffect(() => {







    const toggleTools = () => {







      setToolsOpen(current => {







        if (!current) shouldFocusTools.current = true;







        return !current;







      });







    };







    window.addEventListener("smartbuild:toggle-code-panel", toggleTools);







    return () => window.removeEventListener("smartbuild:toggle-code-panel", toggleTools);







  }, [desktopToolsViewport]);







  useEffect(() => {







    const openTools = () => {







      shouldFocusTools.current = true;







      setToolsOpen(true);







    };







    window.addEventListener("smartbuild:open-code-panel", openTools);







    return () => window.removeEventListener("smartbuild:open-code-panel", openTools);







  }, [desktopToolsViewport]);







  useEffect(() => {







    const nextScope = active && workspaceScope







      ? `${workspaceScope.projectId}:${workspaceScope.conversationId}:${buildRun?.id ?? "none"}`







      : null;







    if (codePanelRunScope.current === nextScope) return;







    codePanelRunScope.current = nextScope;







    setToolsOpen(false);







    setFiles([]);







    setActivePath(null);







    setContent("");







    setBaseline("");







    setLastScopedRefreshAt(null);







  }, [active, workspaceScope?.projectId, workspaceScope?.conversationId, buildRun?.id, buildRun?.projectId, buildRun?.conversationId]);







  useEffect(() => {







    if (!buildRun || autoOpenedBuildRun.current === buildRun.id || !buildRun.artifacts.length) return;




    autoOpenedBuildRun.current = buildRun.id;







    shouldFocusTools.current = true;







    setResultTab("code");







    setSplitPreview(false);







    setToolsOpen(true);







  }, [buildRun?.id, buildRun?.artifacts.length]);




  useEffect(() => {







    window.dispatchEvent(new CustomEvent("smartbuild:code-panel-availability", { detail: Boolean(active && buildRun) }));







  }, [active, workspaceScope?.projectId, workspaceScope?.conversationId, buildRun?.id]);







  useEffect(() => {







    if (!railVisualOpen || !shouldFocusTools.current) return;







    shouldFocusTools.current = false;







    toolsPanelRef.current?.focus({ preventScroll: true });







  }, [railVisualOpen]);







  const updateToolsWidth = (next: number) => setToolsWidth(Math.min(760, Math.max(360, Math.round(next))));







  const startToolsResize = (event: React.PointerEvent<HTMLButtonElement>) => {







    event.preventDefault();







    const startX = event.clientX;







    const startWidth = visibleToolsWidth;







    const move = (moveEvent: PointerEvent) => updateToolsWidth(startWidth + startX - moveEvent.clientX);







    const stop = () => {







      window.removeEventListener("pointermove", move);







      window.removeEventListener("pointerup", stop);







    };







    window.addEventListener("pointermove", move);







    window.addEventListener("pointerup", stop, { once: true });







  };







  const resizeToolsWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {







    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;







    event.preventDefault();







    if (event.key === "Home") return updateToolsWidth(360);







    if (event.key === "End") return updateToolsWidth(760);







    updateToolsWidth(toolsWidth + (event.key === "ArrowLeft" ? 24 : -24));







  };















  const refresh = async () => {







    const generation = ++refreshGeneration.current;







    const requestedBuildRunId = buildRun?.id ?? null;







    setBusy(true);







    try {







      if (buildRun) {







        const [fileSet, health, truth, agents, reviewResponse] = await Promise.all([







          request<{ files: CloudFile[] }>(`/api/build-runs/${buildRun.id}/files`),







          request<ReleaseDiagnostic>(`/api/workspace/health?buildRunId=${encodeURIComponent(buildRun.id)}`),







          ownerBindingVerified ? request<TruthEngineReport>(`/api/workspace/truth-engine?projectId=${encodeURIComponent(String(buildRun.projectId))}&conversationId=${encodeURIComponent(String(buildRun.conversationId))}&buildRunId=${encodeURIComponent(buildRun.id)}`, { cache: "no-store" }) : Promise.resolve(null),







          request<AgentEvidenceResponse>(`/api/build-runs/${buildRun.id}/agents`).catch(() => null),







          request<BuildRunReviewResponse>(`/api/build-runs/${buildRun.id}/review`).catch(() => null),







        ]);







        if (!isRefreshCurrent(generation, refreshGeneration.current, requestedBuildRunId, buildRun?.id ?? null)) return;







        setDiagnostic(health);







        setTruthReport(truth);







        setAgentEvidence(agents?.evidence || null);







        const scopedReview = reviewResponse







          && reviewResponse.buildRunId === buildRun.id







          && reviewResponse.projectId === buildRun.projectId







          && reviewResponse.conversationId === buildRun.conversationId







          ? reviewResponse.review







          : null;







        setReview(scopedReview);







        const retainedSafeEvents = (agents?.evidence.agents || []).filter(agent => Boolean(agent.lastEvent)).map(agent => ({







          id: `agent:${agent.id}:${agent.sequence ?? "unsequenced"}`,







          message: `${agent.lastEvent} · ${agent.status}${agent.timestamp ? ` · ${new Date(agent.timestamp).toLocaleString()}` : ""}`,







        }));







        setStatus({ kind: "cloud", label: workspaceStatusLabel(buildRun), rootLabel: "isolated build workspace", supportsUpload: false, supportsDownloadZip: false, supportsPreview: Boolean(buildRun.preview), supportsTests: true });







        const sourceFiles = sourceBuildFiles(dedupeCloudFiles(fileSet.files));







        setFiles(sourceFiles);







        if (activePath && !sourceFiles.some(file => file.path === activePath)) {







          setActivePath(null);







          setContent("");







          setBaseline("");







        }







        if (!activePath && sourceFiles[0]) await openFile(sourceFiles[0].path);







        else if (activePath && sourceFiles.some(file => file.path === activePath)) await openFile(activePath);







        setLastScopedRefreshAt(new Date().toISOString());







        setChanges(reviewResponse?.review ? [







          `Build Run review: ${reviewResponse.review.status.replace("_", " ")}${reviewResponse.review.updatedAt ? ` · saved ${new Date(reviewResponse.review.updatedAt).toLocaleString()}` : ""}`,







        ] : ["Build Run review: not reviewed · no owner approval is inferred."]);







        setLogs(retainedSafeEvents);







      } else {







        setDiagnostic(null); setTruthReport(null); setAgentEvidence(null); setReview(null);







        const selected = await request<{ selection: { projectId: number | null; conversationId: number | null; buildRunId: string | null } | null }>("/api/workspace/selection");







        if (!isRefreshCurrent(generation, refreshGeneration.current, requestedBuildRunId, null)) return;







        if (workspaceScope && codePanelRunScope.current !== `${workspaceScope.projectId}:${workspaceScope.conversationId}:none`) return;







        const projectId = selected.selection?.projectId;







        const conversationId = selected.selection?.conversationId;







        if (projectId && conversationId) {







          const fileSet = await request<GeneratedFile[]>(`/api/workspace/projects/${projectId}/files?conversationId=${conversationId}`);







          setStatus({ kind: "cloud", label: "Project workspace", rootLabel: "selected Cloud workspace", supportsUpload: false, supportsDownloadZip: false, supportsPreview: false, supportsTests: false });







          setFiles(dedupeCloudFiles(fileSet.map(file => ({ path: file.path, type: "file" as const, size: file.content.length }))));







          setChanges([]);







          setLogs([]);







        } else {







          setStatus(null); setFiles([]); setChanges([]); setLogs([]); setDiagnostic(null); setTruthReport(null); setAgentEvidence(null);







        }







      }







    } catch (error) { if (isRefreshCurrent(generation, refreshGeneration.current, requestedBuildRunId, buildRun?.id ?? null)) { const message = error instanceof Error ? error.message : "Cloud workspace unavailable."; notice(message === "Start a personal workspace session first." ? "Your SmartBuild workspace is not active yet. Click New Workspace to begin." : message); } }







    finally { if (isRefreshCurrent(generation, refreshGeneration.current, requestedBuildRunId, buildRun?.id ?? null)) setBusy(false); }







  };







  useEffect(() => {







    const refreshScopedBuildRun = () => {







      if (active && buildRun) void refresh();







    };







    window.addEventListener("smartbuild:build-updated", refreshScopedBuildRun);







    return () => window.removeEventListener("smartbuild:build-updated", refreshScopedBuildRun);







  }, [active, workspaceScope?.projectId, workspaceScope?.conversationId, buildRun?.id, ownerBindingVerified, conversationFiles]);







  useEffect(() => {







    if (!active) {







      setStatus(null); setFiles([]); setChanges([]); setLogs([]); setDiagnostic(null); setTruthReport(null); setAgentEvidence(null); setReview(null); setActivePath(null); setContent(""); setBaseline("");







      return;







    }







    void refresh();







  }, [active, workspaceScope?.projectId, workspaceScope?.conversationId, buildRun?.id, ownerBindingVerified, conversationFiles]);







  useEffect(() => { if (!ownerBindingVerified && view === "truth") setView("files"); }, [ownerBindingVerified, view]);







  useEffect(() => { uploadInput.current?.setAttribute("webkitdirectory", ""); uploadInput.current?.setAttribute("directory", ""); }, []);







  const openFile = async (filePath: string) => {







    if (!buildRun) {







      const conversationFile = conversationFiles.find(file => file.path === filePath);







      if (!conversationFile) { notice("This generated file is no longer available in the selected conversation."); return; }







      setActivePath(conversationFile.path);







      setContent(conversationFile.content);







      setBaseline(conversationFile.content);







      return;







    }







    const requestedScope = `${buildRun.projectId}:${buildRun.conversationId}:${buildRun.id}`;







    try { const file = await request<{ path: string; content: string }>(`/api/build-runs/${buildRun.id}/file?path=${encodeURIComponent(filePath)}`); if (codePanelRunScope.current !== requestedScope) return; setActivePath(file.path); setContent(file.content); setBaseline(file.content); }







    catch (error) { notice(error instanceof Error ? error.message : "This file cannot be opened in the editor."); }







  };







  const updateReview = async (status: BuildRunReviewStatus) => {







    if (!buildRun) return;







    setReviewBusy(true);







    try {







      const response = await request<BuildRunReviewResponse>(`/api/build-runs/${buildRun.id}/review`, { method: "PUT", body: JSON.stringify({ status }) });







      if (response.buildRunId !== buildRun.id || response.projectId !== buildRun.projectId || response.conversationId !== buildRun.conversationId) throw new Error("Build Run review scope mismatch.");







      setReview(response.review);







      notice(status === "approved" ? "This Build Run is marked approved." : status === "changes_requested" ? "Changes requested for this Build Run." : "Build Run review cleared.");







    } catch (error) { notice(error instanceof Error ? error.message : "Build Run review could not be saved."); }







    finally { setReviewBusy(false); }







  };







  const save = async () => {







    if (rejectProjectChanges(notice)) return;







    if (buildRun === null) { notice("Edits are unavailable until a scoped Build Run exists."); return; }







    if (!activePath) return;







    setBusy(true);







    try {







      const result = await request<{ run: BuildRun }>(`/api/build-runs/${buildRun.id}/file`, { method: "PUT", body: JSON.stringify({ path: activePath, content }) });







      onBuildRunChange(result.run);







      setPublishedUrl(null);







      setBaseline(content);







      window.dispatchEvent(new Event("smartbuild:build-updated"));







      await refresh();







      notice(`Saved ${activePath}. Re-run verification before publishing.`);







    }







    catch (error) { notice(error instanceof Error ? error.message : "Save failed."); }







    finally { setBusy(false); }







  };







  const createFile = async () => {







    if (rejectProjectChanges(notice, "Creating project files is disabled. Existing files are preserved.")) return;







    if (buildRun === null) { notice("Create files through a new build so they remain scoped to this workspace."); return; }







    const filePath = window.prompt("New project-relative file path", "src/components/NewComponent.tsx");







    if (!filePath) return;







    try {







      const result = await request<{ run: BuildRun }>(`/api/build-runs/${buildRun.id}/file`, { method: "PUT", body: JSON.stringify({ path: filePath, content: "", createOnly: true }) });







      onBuildRunChange(result.run);







      setPublishedUrl(null);







      window.dispatchEvent(new Event("smartbuild:build-updated"));







      await refresh();







      await openFile(filePath);







      setResultTab("code");







      setSplitPreview(false);







      notice(`Created ${filePath}. Save your edits, then re-run verification.`);







    }







    catch (error) { notice(error instanceof Error ? error.message : "Could not create that file."); }







  };







  const deleteFile = async () => {







    if (rejectProjectChanges(notice, "Saved project files are read-only and cannot be deleted from this panel.")) return;







    if (buildRun === null || !activePath) return;







    if (!window.confirm(`Delete ${activePath} from this Build Run?`)) return;







    setBusy(true);







    try {







      const result = await request<{ run: BuildRun }>(`/api/build-runs/${buildRun.id}/file`, { method: "DELETE", body: JSON.stringify({ path: activePath }) });







      onBuildRunChange(result.run);







      setPublishedUrl(null);







      setActivePath(null);







      setContent("");







      setBaseline("");







      window.dispatchEvent(new Event("smartbuild:build-updated"));







      await refresh();







      notice(`Deleted ${activePath}. Re-run verification before publishing.`);







    } catch (error) { notice(error instanceof Error ? error.message : "Could not delete that file."); }







    finally { setBusy(false); }







  };







  const uploadItems = async (selected: PendingUpload[]) => {







    if (rejectProjectChanges(notice, "File uploads are disabled. Existing workspace files are preserved.")) return;







    if (buildRun === null) { notice("Upload is unavailable until a scoped Build Run exists."); return; }







    const bounded = selected.slice(0, 100);







    if (!bounded.length) return;







    setBusy(true);







    try {







      for (const { file, relative } of bounded) {







        const response = await fetch(`/api/cloud/upload?path=${encodeURIComponent(relative)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/octet-stream" }, body: file });







        const result = await response.json().catch(() => ({}));







        if (!response.ok) throw new Error((result as { error?: string }).error || `Upload failed for ${relative}.`);







      }







      await refresh(); notice(`${bounded.length} file${bounded.length === 1 ? "" : "s"} uploaded to Cloud workspace.`);







    } catch (error) { notice(error instanceof Error ? error.message : "Cloud upload failed."); }







    finally { setBusy(false); }







  };







  const uploadFolder = async (event: React.ChangeEvent<HTMLInputElement>) => { const selected = Array.from(event.target.files || []).map(file => ({ file, relative: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name })); await uploadItems(selected); event.target.value = ""; };







  const dropFiles = async (event: React.DragEvent<HTMLDivElement>) => {







    event.preventDefault(); setIsDragging(false);







    const items = Array.from(event.dataTransfer.items || []) as WebkitTransferItem[];







    const entries = items.map(item => (item as unknown as { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry?.()).filter((entry): entry is DroppedEntry => entry !== null && entry !== undefined);







    const selected = entries.length ? (await Promise.all(entries.map(entry => collectEntryFiles(entry)))).flat() : Array.from(event.dataTransfer.files).map(file => ({ file, relative: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));







    await uploadItems(selected);







  };







  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);







  const [publishing, setPublishing] = useState(false);







  const previewUrl = buildRun?.preview?.proxyUrl ?? null;







  const previewRunId = buildRun?.id ?? null;







  const previewAvailable = Boolean(previewUrl && previewRunId);







  const publish = async () => {







    if (rejectProjectChanges(notice, "Publishing is disabled. Previously published results remain available.")) return;







    if (buildRun === null || buildRun.status !== "succeeded") { notice("Publish is available after the Build Run passes verification."); return; }







    if (buildRun.manualChangesPendingVerification) { notice("Re-run verification after your file changes before publishing."); return; }







    setPublishing(true);







    try {







      const result = await request<{ publicUrl: string }>(`/api/build-runs/${buildRun.id}/publish`, { method: "POST", body: "{}" });







      setPublishedUrl(result.publicUrl);







      notice("Published successfully. Your temporary public link is ready.");







    } catch (error) { notice(error instanceof Error ? error.message : "The verified site could not be published."); }







    finally { setPublishing(false); }







  };







  return (







    <aside ref={toolsPanelRef} id="desktop-code-panel" data-testid="desktop-code-panel" data-state={toolsVisible ? "open" : "closed"} tabIndex={toolsVisible ? -1 : undefined} aria-label="Code and Preview panel" aria-hidden={!toolsVisible} inert={!toolsVisible} style={{ width: desktopToolsViewport ? `${visibleToolsWidth}px` : undefined, marginRight: desktopToolsViewport ? (railLayoutOpen ? 0 : -visibleToolsWidth) : 0 }} className={`smartbuild-code-panel min-h-0 shrink-0 overflow-hidden border-white/[0.07] bg-[#0b0d12] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/60 ${desktopToolsViewport ? "relative hidden h-full min-w-[360px] border-l xl:flex xl:flex-col" : toolsVisible ? "fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] w-full min-w-0 flex-col rounded-t-2xl border-t shadow-2xl" : "hidden"}`}>







      <button type="button" aria-label="Resize Code panel" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={desktopPanelMaxWidth} aria-valuenow={visibleToolsWidth} role="separator" onPointerDown={startToolsResize} onKeyDown={resizeToolsWithKeyboard} className="absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize touch-none bg-transparent outline-none hover:bg-cyan-300/30 focus-visible:bg-cyan-300/40 xl:block" />







      <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-3 py-2">







        <div className="min-w-0"><p className="text-xs font-semibold text-slate-100">Code & Preview</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{buildRun ? `${buildRun.contract.projectName} · Build Run ${buildRun.id.slice(0, 8)} · v${buildRun.manifest?.projectVersion ?? buildRun.snapshot?.version ?? 1}` : "Live Code & Preview Workspace"}</p></div>







        <div className="flex shrink-0 items-center gap-1.5">







          <button type="button" data-testid="code-panel-hide" onClick={() => setToolsOpen(false)} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-slate-400 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white" aria-label="Hide Code panel">Hide</button>







          <button type="button" disabled title="Publishing is disabled" className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] font-medium text-slate-500 disabled:cursor-not-allowed" aria-label="Publishing is disabled">Publishing disabled</button>







        </div>







      </header>







      <p role="status" className="border-b border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[10px] text-amber-100">Project editing and publishing are disabled. Saved files remain available to review and export.</p>







      {publishedUrl && <div className="flex items-center gap-2 border-b border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-2 text-[10px]"><span className="shrink-0 font-medium text-emerald-100">Published link</span><input readOnly value={publishedUrl} aria-label="Published public URL" className="min-w-0 flex-1 rounded border border-emerald-300/20 bg-black/20 px-2 py-1 text-emerald-50 outline-none" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void navigator.clipboard?.writeText(publishedUrl)} className="shrink-0 rounded border border-emerald-300/25 px-2 py-1 text-emerald-100 hover:bg-emerald-300/10">Copy</button><button type="button" onClick={() => window.open(publishedUrl, "_blank", "noopener,noreferrer")} className="shrink-0 rounded border border-emerald-300/25 px-2 py-1 text-emerald-100 hover:bg-emerald-300/10">Open</button></div>}







      {buildRun && (() => { const progress = buildRunProgress(buildRun); return <section aria-label="Build progress" className="border-b border-white/[0.07] bg-white/[0.02] px-3 py-2"><div className="flex items-center justify-between gap-2"><p aria-live="polite" className="text-[10px] font-medium text-slate-200">{progress.label}</p></div><div role="progressbar" aria-label="Persisted Build Run stage" aria-valuemin={0} aria-valuemax={BUILD_PROGRESS_STAGES.length} aria-valuenow={progress.stage} aria-valuetext={progress.label} className="grid grid-cols-5 gap-1">{BUILD_PROGRESS_STAGES.map((stage, index) => <span key={stage} title={stage} className={`h-1.5 rounded-full transition-colors ${index < progress.stage ? "bg-cyan-300" : index === progress.stage && progress.loading ? "animate-pulse bg-cyan-300/55" : "bg-white/[0.08]"}`} />)}</div></section>; })()}







      {buildRun?.manualChangesPendingVerification && <p role="status" className="border-b border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[10px] text-amber-100">Historical file changes are unverified. New verification and publishing are disabled.</p>}







      <div className="flex min-h-0 flex-1 flex-col">







        <div role="tablist" aria-label="Build output views" className="flex shrink-0 border-b border-white/[0.08] bg-[#0b0d12] px-3">







          <button type="button" role="tab" aria-selected={resultTab === "preview"} onClick={() => { setResultTab("preview"); setSplitPreview(true); }} className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-[11px] font-medium transition ${resultTab === "preview" ? "border-cyan-300 text-cyan-100" : "border-transparent text-slate-500 hover:text-slate-200"}`}><span>Preview</span><span className="rounded-full border border-amber-200/15 bg-amber-200/[0.06] px-1.5 py-0.5 text-[8px] font-medium leading-none text-amber-100/80">Coming Soon</span></button>







          <button type="button" role="tab" aria-selected={resultTab === "code"} onClick={() => { setResultTab("code"); setSplitPreview(false); }} className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-[11px] font-medium transition ${resultTab === "code" ? "border-violet-300 text-violet-100" : "border-transparent text-slate-500 hover:text-slate-200"}`}><span>Code</span><span className="rounded-full border border-amber-200/15 bg-amber-200/[0.06] px-1.5 py-0.5 text-[8px] font-medium leading-none text-amber-100/80">Coming Soon</span></button>







          <button type="button" role="tab" aria-selected={resultTab === "database"} onClick={() => setResultTab("database")} className={`border-b-2 px-4 py-2 text-[11px] font-medium transition ${resultTab === "database" ? "border-amber-300 text-amber-100" : "border-transparent text-slate-500 hover:text-slate-200"}`}>Database</button>







          <button type="button" role="tab" aria-selected={resultTab === "dashboard"} onClick={() => setResultTab("dashboard")} className={`border-b-2 px-4 py-2 text-[11px] font-medium transition ${resultTab === "dashboard" ? "border-emerald-300 text-emerald-100" : "border-transparent text-slate-500 hover:text-slate-200"}`}>Dashboard</button>







          <button type="button" role="tab" aria-selected={resultTab === "settings"} onClick={() => setResultTab("settings")} className={`border-b-2 px-4 py-2 text-[11px] font-medium transition ${resultTab === "settings" ? "border-slate-200 text-slate-100" : "border-transparent text-slate-500 hover:text-slate-200"}`}>Settings</button>







        </div>







        <div className="flex min-h-0 flex-1 flex-col">







         {resultTab === "preview" && <section data-testid="live-build-preview" aria-label="Saved Build Run preview" className="flex min-h-0 flex-1 flex-col bg-[#080b11]"><div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2"><div><p className="text-[10px] font-semibold text-emerald-100">Preview</p><p className="mt-0.5 text-[9px] text-slate-500">{previewAvailable ? `${buildRun?.preview?.status === "ready" ? "Ready" : "Live"} · v${buildRun?.preview?.projectVersion ?? buildRun?.manifest?.projectVersion ?? 1} · updated ${buildRun?.preview?.lastUpdatedAt ? new Date(buildRun.preview.lastUpdatedAt).toLocaleString() : "just now"}` : "Chat with AI or click Build to generate and preview your project."}</p></div>{previewAvailable && <button type="button" onClick={() => window.open(previewUrl || undefined, "_blank", "noopener,noreferrer")} className="text-[10px] font-medium text-emerald-100 hover:text-white">Open</button>}</div>{previewAvailable ? <iframe title={`Preview for Build Run ${(previewRunId || "selected").slice(0, 8)}`} src={previewUrl || undefined} key={`${previewRunId || "no-build-run"}:${lastScopedRefreshAt || "initial"}`} className="min-h-0 flex-1 bg-white" /> : <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs leading-5 text-slate-400"><p className="font-medium text-slate-200">Interactive Preview Workspace</p><p className="mt-1 text-slate-500 max-w-xs">Saved previews from historical runs remain available here.</p></div>}</section>}







         {resultTab === "code" && <section aria-label="Saved project code, read only" className="flex min-h-0 flex-1 flex-col bg-[#080b11]"><div className="flex min-h-0 flex-1"><nav aria-label="Saved project files" className="w-40 shrink-0 overflow-y-auto border-r border-white/[0.07] p-2"><p className="mb-2 px-1 text-[9px] font-medium uppercase tracking-wide text-violet-100/70">Saved files</p>{files.length > 0 ? files.filter(file => file.type !== "directory").map(file => <button key={file.path} onClick={() => void openFile(file.path)} className={`mb-0.5 w-full truncate rounded px-2 py-1.5 text-left font-mono text-[10px] ${activePath === file.path ? "bg-violet-300/10 text-violet-100" : "text-slate-400 hover:bg-white/[0.05]"}`}>{file.path}</button>) : <p className="px-1 text-[10px] text-slate-500">No saved source files.</p>}</nav><div className="flex min-w-0 flex-1 flex-col"><div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-1.5"><span className="min-w-0 truncate font-mono text-[10px] text-slate-500">{activePath || "No file selected"}</span><span className="text-[9px] text-slate-500">Read only</span></div>{activePath ? <div className="flex min-h-0 flex-1 overflow-hidden"><pre aria-hidden="true" className="select-none overflow-hidden bg-[#0a0d13] px-3 py-3 text-right font-mono text-[11px] leading-5 text-slate-600">{content.split("\n").map((_, index) => `${index + 1}\n`)}</pre><textarea value={content} readOnly spellCheck={false} aria-label={`Read-only code for ${activePath}`} className="min-h-0 min-w-0 flex-1 resize-none overflow-auto bg-[#080b11] p-3 font-mono text-[11px] leading-5 text-cyan-100 outline-none" /></div> : <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-slate-500"><p className="font-medium text-slate-300">Saved source code</p><p className="mt-1 max-w-xs text-slate-500">Project changes are disabled. Existing files remain available to inspect and export.</p></div>}</div></div></section>}







         {resultTab === "database" && <DatabaseExplorer run={buildRun} />}







         {resultTab === "dashboard" && <WorkspaceDashboard run={buildRun} refreshKey={publishedUrl} />}







         {resultTab === "settings" && <WorkspaceSettings projectId={workspaceScope?.projectId ?? null} publishRevision={publishedUrl} run={buildRun} focusSecretsRevision={focusSecretsRevision} />}







        </div>







      </div>







    </aside>







  );







  /*







  return <aside ref={toolsPanelRef} id="desktop-workspace-tools" data-testid="desktop-workspace-tools" data-state={railVisualOpen ? "open" : "closed"} tabIndex={railVisualOpen ? -1 : undefined} aria-label="Workspace tools" aria-hidden={!railVisualOpen} inert={!railVisualOpen} style={{ width: `${toolsWidth}px`, marginRight: railLayoutOpen ? 0 : -toolsWidth }} className="smartbuild-tools-rail relative hidden h-full min-h-0 min-w-[320px] shrink-0 overflow-hidden border-l border-white/[0.07] bg-[#0b0d12] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/60 xl:flex xl:flex-col"><button type="button" aria-label="Resize workspace tools" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={760} aria-valuenow={toolsWidth} role="separator" onPointerDown={startToolsResize} onKeyDown={resizeToolsWithKeyboard} className="absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize touch-none bg-transparent outline-none hover:bg-cyan-300/30 focus-visible:bg-cyan-300/40 xl:block" /><ResizablePanelGroup direction="vertical" autoSaveId="smartbuild:desktop-workspace-tools" aria-label="Resizable desktop workspace tools" className="h-full min-h-0"><ResizablePanel id="desktop-run-tools" defaultSize={28} minSize={16} collapsible collapsedSize={0}>







    <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2"><span className="text-[10px] font-medium text-slate-500">SmartBuild account</span><div className="flex items-center gap-1"><button type="button" data-testid="desktop-tools-collapse" onClick={() => setToolsOpen(false)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-slate-400 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" aria-label="Hide workspace details"><ChevronRight className="h-3.5 w-3.5" /><span className="sr-only">Hide workspace details</span></button><SmartBuildLogoutButton showAnalytics={false} /></div></div>







    <ReleaseDiagnosticPanel diagnostic={diagnostic} />







    {agentEvidence && <div className="max-h-[36rem] overflow-y-auto border-b border-white/[0.07]"><AgentExecutionCounts evidence={agentEvidence} /><div className="p-3"><AgentEvidencePanel evidence={agentEvidence} /></div></div>}







    {buildRun && <div className="border-b border-cyan-300/10 px-3 py-1.5"><a href={buildRunExportUrl(buildRun.id)} className="inline-flex items-center gap-1 text-[10px] text-cyan-100 hover:text-white"><Download className="h-3 w-3" />Export selected Build Run ZIP</a></div>}







    </ResizablePanel><ResizableHandle withHandle /><ResizablePanel id="desktop-code-preview" defaultSize={72} minSize={38}>







    <div data-testid="code-preview-panel-heading" className="flex items-center justify-between gap-3 border-b border-cyan-300/15 bg-cyan-300/[0.035] px-3 py-2"><div className="min-w-0"><p className="text-[10px] font-semibold text-cyan-100">Code &amp; Preview</p><p className="mt-0.5 text-[9px] text-slate-500">Saved Build files only. Drag the left edge or the divider to resize this panel.</p></div><span className="shrink-0 rounded border border-white/[0.08] px-1.5 py-1 text-[9px] text-slate-500">Resizable</span></div>







    {buildRun && <section aria-label="Selected Build Run preview context" className="flex items-center justify-between gap-3 border-b border-cyan-300/15 bg-cyan-300/[0.035] px-3 py-2 font-mono text-[9px] text-slate-500"><div className="min-w-0"><p className="font-sans text-[10px] font-medium text-cyan-100">Selected Build Run context</p><p className="mt-0.5 truncate">project {buildRun.projectId} · conversation {buildRun.conversationId} · run {buildRun.id.slice(0, 8)}</p></div><div className="shrink-0 text-right"><p className={buildRun.preview?.proxyUrl ? "text-emerald-100" : "text-amber-100"}>{buildRun.preview?.proxyUrl ? "Preview linked" : "Preview unavailable"}</p><p aria-live="polite" className="mt-0.5">{lastScopedRefreshAt ? `Updated ${new Date(lastScopedRefreshAt).toLocaleTimeString()}` : "Awaiting scoped refresh"}</p></div></section>}







    <div className="border-b border-white/[0.07] p-3"><div className="flex items-center justify-between"><div><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><Cloud className="h-3.5 w-3.5 text-cyan-300" />{status?.label || "Cloud workspace"}</p><p className="mt-0.5 text-[10px] text-slate-600">Server project root · browser managed</p></div><button onClick={() => void refresh()} disabled={busy} className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-white" aria-label="Refresh workspace"><RefreshCw className="h-3.5 w-3.5" /></button></div><div className="mt-3 flex flex-wrap gap-1"><button onClick={() => setView("files")} className={`rounded px-2 py-1 text-[10px] ${view === "files" ? "bg-white/[0.1] text-white" : "text-slate-500 hover:text-slate-300"}`}>Files</button><button onClick={() => setView("changes")} className={`rounded px-2 py-1 text-[10px] ${view === "changes" ? "bg-white/[0.1] text-white" : "text-slate-500 hover:text-slate-300"}`}>Changes</button><button onClick={() => setView("logs")} className={`rounded px-2 py-1 text-[10px] ${view === "logs" ? "bg-white/[0.1] text-white" : "text-slate-500 hover:text-slate-300"}`}>Logs</button>{buildRun?.agentOrchestration && <button onClick={() => setView("agents")} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] ${view === "agents" ? "bg-cyan-300/10 text-cyan-100" : "text-slate-500 hover:text-slate-300"}`}><Bot className="h-3 w-3" />Agents</button>}{buildRun?.syntheticEvaluation && <><button onClick={() => setView("evaluators")} className={`rounded px-2 py-1 text-[10px] ${view === "evaluators" ? "bg-violet-300/10 text-violet-100" : "text-slate-500 hover:text-slate-300"}`}>Evaluators</button><button onClick={() => setView("bugs")} className={`rounded px-2 py-1 text-[10px] ${view === "bugs" ? "bg-rose-300/10 text-rose-100" : "text-slate-500 hover:text-slate-300"}`}>Bugs{buildRun.syntheticEvaluation.bugs.length ? ` (${buildRun.syntheticEvaluation.bugs.length})` : ""}</button></>}<a href={buildRunExportUrl(buildRun?.id)} className="ml-auto inline-flex items-center gap-1 rounded border border-white/[0.1] px-2 py-1 text-[10px] text-slate-400 hover:text-white"><Download className="h-3 w-3" />ZIP</a></div></div>







    {view === "files" && (active ? <div className="relative flex min-h-0 flex-1"><div className="w-[160px] shrink-0 overflow-y-auto border-r border-white/[0.07] p-2"><p className="mb-2 px-1 text-[9px] leading-3 text-cyan-100/70">Saved files · view only</p>{files.map(file => file.type === "directory" ? <p key={file.path} className="truncate px-2 py-1 text-[10px] font-medium text-slate-600">{file.path}/</p> : <button key={file.path} onClick={() => void openFile(file.path)} className={`mb-0.5 w-full truncate rounded px-2 py-1.5 text-left text-[10px] ${activePath === file.path ? "bg-cyan-300/10 text-cyan-100" : "text-slate-400 hover:bg-white/[0.05]"}`}>{file.path}</button>)}</div><div className="flex min-w-0 flex-1 flex-col p-3">{buildRun?.preview?.assets && <div className={`mb-2 rounded border px-2 py-1.5 text-[9px] ${buildRun.preview.assets.every(asset => asset.passed) ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-amber-300/30 bg-amber-300/[0.08] text-amber-100"}`}>{buildRun.preview.assets.every(asset => asset.passed) ? `Preview diagnostics: ${buildRun.preview.assets.length} local asset(s) loaded.` : `Preview diagnostic: ${buildRun.preview.assets.filter(asset => !asset.passed).map(asset => `${asset.path} (HTTP ${asset.status})`).join(", ")}`}</div>}{activePath ? <><div className="mb-2 flex items-center justify-between gap-2"><p className="truncate text-[10px] text-slate-500">{activePath}</p><button onClick={() => setSplitPreview(value => !value)} className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[9px] ${splitPreview ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-white/[0.08] text-slate-400 hover:text-white"}`} aria-pressed={splitPreview}><PanelRight className="h-3 w-3" />Split</button></div><div className="flex min-h-0 flex-1 gap-2"><textarea value={content} readOnly spellCheck={false} aria-label={`Read-only saved file ${activePath}`} className={`min-h-0 resize-none rounded-lg border border-white/[0.08] bg-[#080b11] p-2 font-mono text-[11px] leading-5 text-slate-300 outline-none ${splitPreview ? "w-1/2" : "w-full"}`} />{splitPreview && <div className="flex min-w-0 w-1/2 flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#080b11]"><div className="border-b border-white/[0.07] px-2 py-1 text-[9px] font-medium text-slate-500">SAVED PREVIEW</div><iframe key={`${buildRun?.id || "no-build-run"}:${lastScopedRefreshAt || "initial"}`} title="Saved project preview (read-only)" src={buildRun?.preview?.proxyUrl || "/"} className="min-h-0 flex-1 bg-white" /></div>}</div></> : <p className="pt-10 text-center text-xs text-slate-600">Select a saved project file to inspect.</p>}</div></div> : <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-slate-600"><div><p className="font-medium text-slate-400">No saved files in this workspace</p><p className="mt-1 max-w-xs leading-5 text-slate-600">Project changes are disabled. Existing workspace files can still be inspected and exported.</p></div></div>)}







    {buildRun && ownerBindingVerified && <div className="border-b border-white/[0.07] px-3 py-1.5"><button onClick={() => setView("truth")} className={`rounded px-2 py-1 text-[10px] ${view === "truth" ? "bg-emerald-300/10 text-emerald-100" : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"}`}>Truth Engine</button></div>}







{ownerBindingVerified && view === "truth" && <TruthEnginePanel report={truthReport} />}







    {view === "agents" && buildRun?.agentOrchestration && <section aria-label="Agent registry context" className="border-b border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[10px] leading-4 text-amber-50">{buildRun.agentOrchestration.registryCount === 300 ? <><p className="font-semibold">Archived implementation record</p><p className="mt-0.5 text-amber-100/80">Historical agent details are shown for reference only. New implementation is disabled.</p></> : <><p className="font-semibold">Historical agent plan</p><p className="mt-0.5 text-amber-100/80">This preserved Build Run recorded {buildRun.agentOrchestration.registryCount} registry entries before the 300-agent expansion. It is retained unchanged and does not indicate that the current canonical registry is smaller or that a 300-agent execution occurred.</p><p className="mt-1 font-medium text-cyan-100">Current canonical registry: 300 registered agents.</p></>}</section>}







    {view === "changes" && <div data-testid="build-run-changes" className="min-h-0 flex-1 overflow-y-auto p-3">{buildRun ? <div className="space-y-3"><section className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><p className="text-xs font-semibold text-cyan-100">Selected Build Run change evidence</p><p className="mt-1 font-mono text-[10px] text-slate-400">project {buildRun.projectId} · conversation {buildRun.conversationId} · run {buildRun.id.slice(0, 8)}</p><p className="mt-2 text-[10px] leading-4 text-slate-500">This panel only accepts a persisted revision record attached to this exact Build Run. Repository-wide Cloud Git changes are intentionally excluded.</p></section><div className="grid grid-cols-3 gap-2 text-[10px]"><section className="rounded border border-white/[0.06] bg-white/[0.025] p-2"><p className="text-slate-500">Agent plan</p><p className="mt-1 font-semibold text-slate-200">{buildRun.agentOrchestration?.selectedAgents.length ?? 0} selected</p><p className="mt-0.5 text-slate-600">{buildRun.agentOrchestration?.skippedAgents.length ?? 0} skipped</p></section><section className="rounded border border-white/[0.06] bg-white/[0.025] p-2"><p className="text-slate-500">Task graph</p><p className="mt-1 font-semibold text-slate-200">{buildRun.agentOrchestration?.tasks.length ?? 0} planned</p><p className="mt-0.5 text-slate-600">No task completion is inferred.</p></section><section data-testid="build-run-review" aria-live="polite" className="rounded border border-white/[0.06] bg-white/[0.025] p-2"><p className="text-slate-500">Review / approval</p><p className="mt-1 font-semibold text-slate-200">{review?.status === "approved" ? "Approved" : review?.status === "changes_requested" ? "Changes requested" : "Not reviewed"}</p><p className="mt-0.5 text-slate-600">{review?.status === "approved" ? "Owner approval applies only to this selected Build Run." : review?.status === "changes_requested" ? "Feedback applies only to this selected Build Run." : "Build Run review: not reviewed · no owner approval is inferred."}</p><div role="group" aria-label="Selected Build Run review controls" className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => void updateReview("approved")} disabled={reviewBusy || review?.status === "approved"} aria-label="Approve selected Build Run" className="rounded border border-emerald-300/20 px-1.5 py-1 text-[9px] text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">Approve</button><button type="button" onClick={() => void updateReview("changes_requested")} disabled={reviewBusy || review?.status === "changes_requested"} aria-label="Request changes for selected Build Run" className="rounded border border-amber-300/20 px-1.5 py-1 text-[9px] text-amber-100 disabled:cursor-not-allowed disabled:opacity-50">Request changes</button><button type="button" onClick={() => void updateReview("unreviewed")} disabled={reviewBusy || !review || review.status === "unreviewed"} aria-label="Clear selected Build Run review" className="rounded border border-white/[0.1] px-1.5 py-1 text-[9px] text-slate-300 disabled:cursor-not-allowed disabled:opacity-50">Clear</button></div><p className="mt-2 text-[9px] leading-3 text-slate-600">Review state does not create a revision, rerun this Build, or modify artifacts.</p></section></div>{changes.length ? <section aria-label="Persisted revision diff" className="space-y-1">{changes.map((line, index) => <pre key={`${line}-${index}`} className="whitespace-pre-wrap rounded bg-white/[0.025] p-2 text-[10px] text-slate-400">{line}</pre>)}</section> : <div className="rounded-lg border border-dashed border-white/[0.08] px-4 py-8 text-center"><p className="text-xs font-medium text-slate-500">No code changes yet.</p><p className="mx-auto mt-1 max-w-xs text-[10px] leading-4 text-slate-600">A persisted revision diff will appear here only after the selected Build Run records one. No global Git diff is shown as Build Run evidence.</p></div>}</div> : <div className="pt-8 text-center"><p className="text-xs font-medium text-slate-500">No Build Run selected.</p><p className="mx-auto mt-1 max-w-xs text-[10px] leading-4 text-slate-600">Select a tracked Build Run before reviewing its scoped change evidence.</p></div>}</div>}







    {view === "logs" && <div className="min-h-0 flex-1 overflow-y-auto p-3">{logs.length ? logs.map(log => <article key={log.id} className="mb-2 rounded border border-white/[0.06] bg-white/[0.025] p-2"><p className="font-mono text-[10px] text-cyan-200">{log.id}</p><p className="mt-1 text-[11px] text-slate-400">{log.message}</p></article>) : <div className="pt-8 text-center"><p className="text-xs font-medium text-slate-500">No retained run events yet.</p><p className="mx-auto mt-1 max-w-xs text-[10px] leading-4 text-slate-600">This view only lists safe event identifiers supplied by the selected Build Run’s agent evidence. Raw worker logs are never shown here.</p></div>}<p className="mt-3 text-[10px] leading-4 text-slate-600">Each retained event is scoped to the selected Build Run. Diffs, approval, and restore actions appear only when a dedicated tuple-scoped API provides them.</p></div>}







    {view === "agents" && <div className="min-h-0 flex-1 overflow-y-auto p-3">{buildRun?.agentOrchestration ? <div className="space-y-3"><section className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-100"><Bot className="h-3.5 w-3.5" />Historical agent record</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{buildRun.agentOrchestration.internalizedCapabilityCount ?? 0} capability profiles preserved in the historical record · single-agent execution</p></div><span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${buildRun.agentOrchestration.checkpointAllowed ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{buildRun.agentOrchestration.checkpointAllowed ? "PLAN READY" : "PLAN BLOCKED"}</span></div>{buildRun.agentOrchestration.blockedReason && <p className="mt-2 rounded bg-amber-300/[0.07] px-2 py-1.5 text-[10px] text-amber-100">AGENT_TASK_BLOCKED · Some planned tasks are blocked; detailed raw diagnostics are not displayed.</p>}<div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-lg font-semibold text-white">{buildRun.agentOrchestration.selectedAgents.length}</span>selected</div><div className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-lg font-semibold text-white">{buildRun.agentOrchestration.skippedAgents.length}</span>skipped</div></div></section><section><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Executing agent</p><div className="space-y-1.5">{buildRun.agentOrchestration.selectedAgents.map(agent => <div key={agent.id} className="rounded border border-white/[0.06] bg-white/[0.025] p-2"><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-medium text-slate-200">{agent.id === "smartbuild-website-builder-agent" ? "Archived implementation record" : agent.name}</p><span className="font-mono text-[9px] text-cyan-200">{agent.id}</span></div><p className="mt-1 text-[10px] text-slate-500">{agent.team} · {agent.role} · {agent.modelProfile}</p></div>)}</div></section><section><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sequential task graph</p><div className="space-y-1.5">{buildRun.agentOrchestration.tasks.map(task => <div key={task.taskId} className="rounded border border-white/[0.06] bg-white/[0.025] p-2"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-slate-200">{task.title}</p><span className="shrink-0 rounded bg-cyan-300/10 px-1.5 py-0.5 text-[9px] text-cyan-100">planned</span></div><p className="mt-1 font-mono text-[9px] text-slate-500">{task.agentId} · {task.taskId}</p><p className="mt-1 text-[10px] text-slate-400">AGENT_TASK_SELECTED · Supervisor-selected task</p><div className="mt-2 space-y-1 text-[9px] text-slate-500"><p>Depends on: {task.dependsOn.length ? task.dependsOn.join(", ") : "none"}</p><p>Locks: {task.locks.length ? task.locks.join(", ") : "none"}</p><p>Evidence: {task.verificationMethods.join(", ")}</p></div></div>)}</div></section><section><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Skipped with explicit reasons</p><div className="max-h-44 space-y-1 overflow-y-auto rounded border border-white/[0.06] bg-black/20 p-2">{buildRun.agentOrchestration.skippedAgents.map(agent => <p key={agent.id} className="text-[10px] leading-4 text-slate-500"><span className="font-mono text-slate-400">{agent.id}</span> · {safeAgentReason(agent.reason)}</p>)}</div></section><section className="rounded border border-white/[0.06] bg-white/[0.025] p-2 text-[10px] text-slate-500"><p className="font-medium text-slate-300">Evidence retained in this build</p><p className="mt-1 font-mono">evidence/agent-plan.json</p>{buildRun.agentOrchestration.traceFile && <p className="mt-1 font-mono">evidence/agent-traces/{buildRun.agentOrchestration.traceFile}</p>}<p className="mt-2 leading-4">This historical record is preserved for reference only. No new implementation or verification is performed.</p></section></div> : <p className="pt-8 text-center text-xs text-slate-600">No retained agent plan is available for this build.</p>}</div>}







    {view === "evaluators" && <div className="min-h-0 flex-1 overflow-y-auto p-3">{buildRun?.syntheticEvaluation ? <div className="space-y-3"><section className="rounded-lg border border-violet-300/15 bg-violet-300/[0.04] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-violet-100">Synthetic user evaluation</p><p className="mt-1 text-[10px] text-slate-400">Functional user runs first; visual user runs second. Execution is sequential and bounded to {buildRun.syntheticEvaluation.max_repair_cycles} repair cycles.</p></div><span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${buildRun.syntheticEvaluation.checkpoint_allowed ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{buildRun.syntheticEvaluation.checkpoint_allowed ? "CHECKPOINT ALLOWED" : "CHECKPOINT BLOCKED"}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-lg font-semibold text-white">{buildRun.syntheticEvaluation.runs.length}</span>runs</div><div className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-lg font-semibold text-white">{buildRun.syntheticEvaluation.bugs.length}</span>reports</div><div className="rounded bg-black/20 p-2 text-slate-400"><span className="block text-lg font-semibold text-white">{buildRun.syntheticEvaluation.repair_cycles}</span>repair cycles</div></div></section>{buildRun.syntheticEvaluation.runs.map(run => <section key={run.evaluator_instance} className="rounded border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-medium text-slate-200">{run.evaluator_instance === "functional_synthetic_user" ? "Functional synthetic user" : "Visual synthetic user"}</p><p className="mt-1 text-[10px] text-slate-500">{run.current_route || "No route recorded"} · {run.current_step || "No active step recorded"}</p></div><span className={`rounded px-1.5 py-0.5 text-[9px] ${run.status === "PASS" ? "bg-emerald-300/10 text-emerald-200" : run.status === "SKIPPED" ? "bg-slate-300/10 text-slate-300" : "bg-rose-300/10 text-rose-100"}`}>{run.status}</span></div>{run.skip_reason && <p className="mt-2 rounded bg-amber-300/[0.07] px-2 py-1.5 text-[10px] text-amber-100">{run.skip_reason}</p>}<div className="mt-2 space-y-1 text-[10px] text-slate-400">{run.actions.map((action, index) => <p key={`${action.step}-${index}`}><span className={action.passed ? "text-emerald-200" : "text-rose-200"}>{action.passed ? "PASS" : "FAIL"}</span> · {action.route || "/"} · {action.step || "interaction"}</p>)}</div><p className="mt-2 font-mono text-[9px] text-slate-500">{run.evidence_paths.join(" · ") || "No evidence path retained."}</p></section>)}<section className="rounded border border-white/[0.06] bg-white/[0.025] p-2 text-[10px] text-slate-500"><p className="font-medium text-slate-300">Evaluator evidence</p><p className="mt-1 font-mono">{buildRun.syntheticEvaluation.output_path}</p><p className="mt-2 leading-4">Reports require evidence. Unconfirmed reports cannot block a checkpoint and all browser-visible details are redacted before display.</p></section></div> : <p className="pt-8 text-center text-xs text-slate-600">No synthetic evaluation is available for this build.</p>}</div>}







    {view === "bugs" && <div className="min-h-0 flex-1 overflow-y-auto p-3">{buildRun?.syntheticEvaluation ? buildRun.syntheticEvaluation.bugs.length ? <div className="space-y-2">{buildRun.syntheticEvaluation.bugs.map(bug => { const repair = buildRun.syntheticEvaluation?.repair_tasks.find(task => task.bug_id === bug.bug_id); return <section key={bug.bug_id} className="rounded border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-medium text-slate-200">{bug.title}</p><p className="mt-1 font-mono text-[9px] text-slate-500">{bug.bug_id} · {bug.evaluator_instance}</p></div><span className={`rounded px-1.5 py-0.5 text-[9px] ${bug.severity === "critical" || bug.severity === "high" ? "bg-rose-300/10 text-rose-100" : bug.severity === "unconfirmed" ? "bg-slate-300/10 text-slate-300" : "bg-amber-300/10 text-amber-100"}`}>{bug.severity.toUpperCase()}</span></div><p className="mt-2 text-[10px] leading-4 text-slate-400">Expected: {bug.expected_result}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Actual: {bug.actual_result}</p><p className="mt-2 text-[10px] text-slate-500">Route {bug.route || "/"} · owner {bug.suspected_owner_agent || "unassigned"} · {bug.status}</p>{repair && <div className="mt-2 rounded bg-cyan-300/[0.05] px-2 py-1.5 text-[10px] text-cyan-100">Repair task: {repair.agent_name} ({repair.agent_id}) · {repair.status}<br /><span className="text-slate-500">{repair.reason}</span></div>}<p className="mt-2 font-mono text-[9px] text-slate-500">{bug.evidence_paths.join(" · ")}</p></section>; })}</div> : <div className="pt-12 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-emerald-300" /><p className="mt-2 text-xs text-slate-300">No confirmed evaluator bugs</p><p className="mt-1 text-[10px] text-slate-600">The retained synthetic-user evidence does not contain a confirmed defect.</p></div> : <p className="pt-8 text-center text-xs text-slate-600">No retained bug reports are available for this build.</p>}</div>}







    </ResizablePanel></ResizablePanelGroup></aside>;







  */







}















export default function Home() {







  const [demoMode, setDemoMode] = useState(false);
  const demoPreferenceKey = "smartbuild-demo-preference";

  const isDemoPreferenceSelected = () => typeof window !== "undefined" && window.localStorage.getItem(demoPreferenceKey) === "selected";

  const setDemoPreference = (selected: boolean) => {
    if (typeof window === "undefined") return;
    if (selected) window.localStorage.setItem(demoPreferenceKey, "selected");
    else window.localStorage.removeItem(demoPreferenceKey);
  };














  const [authenticated, setAuthenticated] = useState<boolean | null>(null); const [ready, setReady] = useState(false); const [restorationError, setRestorationError] = useState<string | null>(null); const [legacyClaimState, setLegacyClaimState] = useState<"claimable" | "claimed" | "recovery_required" | "unavailable" | null>(null); const [preparingWorkspace, setPreparingWorkspace] = useState(false); const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState<number | null>(null); const [conversations, setConversations] = useState<Conversation[]>([]); const [conversationId, setConversationId] = useState<number | null>(null); const [messages, setMessages] = useState<ChatMessage[]>([]); const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]); const [planData, setPlanData] = useState<TaskGraph | null>(null); const [planDialogOpen, setPlanDialogOpen] = useState(false); const [planDialogScope, setPlanDialogScope] = useState<string | null>(null); const [buildRun, setBuildRun] = useState<BuildRun | null>(null); const currentPlanScope = `${projectId ?? "none"}:${conversationId ?? "none"}:${buildRun?.id ?? "none"}`; const plan = planDialogOpen && planDialogScope === currentPlanScope ? planData : null; const setPlan = (next: TaskGraph | null) => { if (next === null && planDialogOpen) { setPlanDialogOpen(false); return; } setPlanData(next); }; const [streaming, setStreaming] = useState(false); const [planning, setPlanning] = useState(false); const [previewing, setPreviewing] = useState(false); const [testing, setTesting] = useState(false); const [checkpointSaved, setCheckpointSaved] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [sidebarOpen, setSidebarOpen] = useState(false); const [references, setReferences] = useState<ReferenceImage[]>([]); const workspaceActivation = useRef<Promise<{ project: Project; conversation: Conversation } | null> | null>(null); const legacyDecisionPending = useRef(false); const activeWorkspace = useRef(new ActiveWorkspaceBinding()); const activationCoordinator = useRef(new WorkspaceActivationCoordinator()); const workspaceOperation = useRef(new WorkspaceOperationEpoch()); const selectionWrites = useRef(new WorkspaceSelectionWriteQueue()); const chatAbortController = useRef<AbortController | null>(null);







  const [activeWorkspaceView, setActiveWorkspaceView] = useState<"workspace" | "media-insight">("workspace");
  const [mediaCheckChatPrompt, setMediaCheckChatPrompt] = useState<string | null>(null);

  const workspaceNameMigrationAttempts = useRef(new Set<string>());







  const activeProject = useMemo(() => projects.find(project => project.id === projectId) || { id: 0, name: "SmartBuild" }, [projects, projectId]);







  useEffect(() => {







    const storageKey = "smartbuild-analytics-session";







    let sessionId = window.sessionStorage.getItem(storageKey);







    if (!sessionId) {







      sessionId = window.crypto.randomUUID();







      window.sessionStorage.setItem(storageKey, sessionId);







    }







    const sendActivity = (ended: boolean, keepalive = false) => {







      void fetch("/api/site-analytics/activity", {







        method: "POST",







        credentials: "include",







        keepalive,







        headers: { "content-type": "application/json" },







        body: JSON.stringify({ sessionId, ended }),







      }).then(response => {







        if (!response.ok && response.status !== 429) console.warn(`[site-analytics] Activity request returned ${response.status}.`);







      }).catch(error => console.warn("[site-analytics] Activity request failed.", error));







    };







    const onVisibilityChange = () => {







      if (document.visibilityState === "visible") sendActivity(false);







      else sendActivity(false, true);







    };







    const onPageHide = () => sendActivity(true, true);







    sendActivity(false);







    const heartbeat = window.setInterval(() => {







      if (document.visibilityState === "visible") sendActivity(false);







    }, 20_000);







    document.addEventListener("visibilitychange", onVisibilityChange);







    window.addEventListener("pagehide", onPageHide);







    return () => {







      window.clearInterval(heartbeat);







      document.removeEventListener("visibilitychange", onVisibilityChange);







      window.removeEventListener("pagehide", onPageHide);







      sendActivity(true, true);







    };







  }, []);







  useEffect(() => { setPlanDialogOpen(false); }, [projectId, conversationId]);







  useLayoutEffect(() => {







    if (!planDialogOpen) return;







    setPlanDialogOpen(false);







  }, [planDialogOpen, buildRun]);







  useEffect(() => { if (planDialogOpen && planDialogScope !== currentPlanScope) setPlanDialogOpen(false); }, [currentPlanScope, planDialogOpen, planDialogScope]);







  const loadProjects = async () => { const rows = dedupeProjects(await request<Project[]>("/api/workspace/projects"), projectId); setProjects(rows); setProjectId(current => current || rows[0]?.id || null); return rows; };







  const renameWorkspace = async (project: Project) => {







    const name = window.prompt("Workspace name", project.name)?.trim();







    if (!name || name === project.name) return;







    const updated = await request<Project>(`/api/workspace/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) });







    setProjects(current => current.map(item => item.id === project.id ? updated : item));







    const bound = activeWorkspace.current.get();







    if (bound?.project.id === project.id) activeWorkspace.current.set({ ...bound, project: updated });







  };







  const applyBuildWorkspaceName = async (project: Project, conversation: Conversation, name: string) => {







    const title = name.trim().replace(/\s+/g, " ");







    if (!title || title.length > 80) throw new Error("The generated project name is invalid.");







    const operationEpoch = workspaceOperation.current.capture();







    const [updatedProject, updatedConversation] = await Promise.all([







      project.name === title







        ? Promise.resolve(project)







        : request<Project>(`/api/workspace/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name: title }) }),







      conversation.title === title







        ? Promise.resolve(conversation)







        : request<Conversation>(`/api/workspace/conversations/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ title }) }),







    ]);







    if (!workspaceOperation.current.isCurrent(operationEpoch) || projectId !== project.id || conversationId !== conversation.id) return;







    setProjects(current => current.map(item => item.id === project.id ? updatedProject : item));







    setConversations(current => current.map(item => item.id === conversation.id ? updatedConversation : item));







    activeWorkspace.current.set({ project: updatedProject, conversation: updatedConversation });







  };







  const persistSelection = async (nextProjectId: number, nextConversationId?: number | null, nextBuildRunId?: string | null, revision?: number) => {







    const selection: WorkspaceSelection = { projectId: nextProjectId, conversationId: nextConversationId ?? null, buildRunId: nextBuildRunId ?? null };







    const selectedRevision = revision ?? activationCoordinator.current.choose(selection);







    await selectionWrites.current.enqueue(async () => {







      // Always write the latest intent when this queued request reaches the







      // server; older bootstrap calls must not overwrite a new conversation.







      const latest = activationCoordinator.current.latestSelection();







      await request("/api/workspace/selection", { method: "PUT", body: JSON.stringify(latest || selection) });







    });







    if (!activationCoordinator.current.isCurrent(selectedRevision)) return;







  };







  const openConversation = async (project: Project, conversation: Conversation) => {







    const revision = activationCoordinator.current.choose({ projectId: project.id, conversationId: conversation.id, buildRunId: null });







    workspaceOperation.current.invalidate();







    activeWorkspace.current.set({ project, conversation });







    setProjectId(project.id);







    setConversationId(conversation.id);







    setBuildRun(null);







    setCheckpointSaved(false);







    setSidebarOpen(false);







    try {







      await persistSelection(project.id, conversation.id, null, revision);







      const restored = await request<{ selection: { projectId: number | null; conversationId: number | null; buildRunId: string | null } | null; run: BuildRun | null }>("/api/workspace/selection");







      if (!activationCoordinator.current.isCurrent(revision)) return;







      const workspace = { projectId: project.id, conversationId: conversation.id };







      if (isRunForWorkspace(restored.run, workspace)) {







        setBuildRun(restored.run);







        setCheckpointSaved(Boolean(restored.run?.checkpoint));







      }







    } catch (error) {







      if (activationCoordinator.current.isCurrent(revision)) setNotice(error instanceof Error ? error.message : "The selected Cloud workspace could not restore its Build Run.");







    }







  };







  useEffect(() => { const selectProject = (event: Event) => { const project = (event as CustomEvent<{ projectId?: number }>).detail?.projectId; if (!project) return; const revision = activationCoordinator.current.choose({ projectId: project, conversationId: null, buildRunId: null }); workspaceOperation.current.invalidate(); activeWorkspace.current.clear(); setProjectId(project); setConversationId(null); setBuildRun(null); setSidebarOpen(false); void persistSelection(project, null, null, revision); }; window.addEventListener("smartbuild:select-project", selectProject); return () => window.removeEventListener("smartbuild:select-project", selectProject); }, []);







  useEffect(() => { const projectDeleted = (event: Event) => { const deletedProjectId = (event as CustomEvent<{ projectId?: number }>).detail?.projectId; if (!deletedProjectId) return; setProjects(current => current.filter(project => project.id !== deletedProjectId)); if (projectId !== deletedProjectId) return; workspaceOperation.current.invalidate(); activeWorkspace.current.clear(); activationCoordinator.current.begin(); setProjectId(null); setConversationId(null); setConversations([]); setBuildRun(null); setMessages([]); setGeneratedFiles([]); setPlan(null); setCheckpointSaved(false); setStreaming(false); setPlanning(false); setPreviewing(false); setTesting(false); setNotice("Project deleted. Select another workspace or create a new one."); setSidebarOpen(false); }; window.addEventListener("smartbuild:project-deleted", projectDeleted); return () => window.removeEventListener("smartbuild:project-deleted", projectDeleted); }, [projectId]);







  useEffect(() => { const projectArchived = (event: Event) => { const archivedProjectId = (event as CustomEvent<{ projectId?: number }>).detail?.projectId; if (!archivedProjectId) return; setProjects(current => current.filter(project => project.id !== archivedProjectId)); if (projectId !== archivedProjectId) return; workspaceOperation.current.invalidate(); activeWorkspace.current.clear(); activationCoordinator.current.begin(); setProjectId(null); setConversationId(null); setConversations([]); setBuildRun(null); setMessages([]); setGeneratedFiles([]); setPlan(null); setCheckpointSaved(false); setStreaming(false); setPlanning(false); setPreviewing(false); setTesting(false); setNotice("Project archived. Restore it from Projects to open it again."); setSidebarOpen(false); }; window.addEventListener("smartbuild:project-archived", projectArchived); return () => window.removeEventListener("smartbuild:project-archived", projectArchived); }, [projectId]);







  useEffect(() => { if (!projectId) { setConversations([]); setConversationId(null); setBuildRun(null); return; } const operationEpoch = workspaceOperation.current.capture(); let cancelled = false; void (async () => { try { await selectionWrites.current.waitForIdle(); const [rowsResult, restored] = await Promise.all([request<Conversation[]>(`/api/workspace/projects/${projectId}/conversations`), request<{ selection: { projectId: number | null; conversationId: number | null; buildRunId: string | null } | null; run: BuildRun | null }>("/api/workspace/selection").catch(() => null)]); let rows = rowsResult; if (!rows.length) rows = [await request<Conversation>(`/api/workspace/projects/${projectId}/conversations`, { method: "POST", body: JSON.stringify({ title: "New build" }) })]; if (cancelled || !workspaceOperation.current.isCurrent(operationEpoch)) return; const restoredForProject = restored?.selection?.projectId === projectId ? restored : null; const selectedConversation = rows.find(item => item.id === restoredForProject?.selection?.conversationId) || rows.find(item => item.id === conversationId) || rows[0]; const selectedRunId = restoredForProject?.run && restoredForProject.run.projectId === projectId && restoredForProject.run.conversationId === selectedConversation?.id ? restoredForProject.run.id : null; setConversations(rows); setConversationId(selectedConversation?.id || null); setBuildRun(selectedRunId && restoredForProject?.run ? restoredForProject.run : null); setCheckpointSaved(Boolean(selectedRunId && restoredForProject?.run?.checkpoint)); if (selectedConversation) { const project = activeWorkspace.current.get()?.project.id === projectId ? activeWorkspace.current.get()!.project : { id: projectId, name: "Cloud workspace" }; activeWorkspace.current.set({ project, conversation: selectedConversation }); const revision = activationCoordinator.current.choose({ projectId, conversationId: selectedConversation.id, buildRunId: selectedRunId }); void persistSelection(projectId, selectedConversation.id, selectedRunId, revision); } } catch { if (!cancelled && workspaceOperation.current.isCurrent(operationEpoch)) setNotice("This SmartBuild workspace could not open a conversation. Try New Workspace again."); } })(); return () => { cancelled = true; }; }, [projectId]);







  useEffect(() => {







    setMessages([]);







    setGeneratedFiles([]);







    setPlan(null);







  }, [projectId, conversationId]);







  useEffect(() => { const operationEpoch = workspaceOperation.current.capture(); let cancelled = false; if (!projectId || !conversationId) { setMessages([]); setPlan(null); setGeneratedFiles([]); return () => { cancelled = true; }; } const selection = { projectId, conversationId, buildRunId: buildRun?.id || null }; const canApply = () => !cancelled && isWorkspaceResponseCurrent({ operation: workspaceOperation.current, operationEpoch, binding: activeWorkspace.current, coordinator: activationCoordinator.current, selection }); const scopedFiles = buildRun?.id




    ? request<{ files: Array<{ path: string; size?: number }> }>(`/api/build-runs/${buildRun.id}/files`).then(result => result.files.map((file, index) => ({ id: index + 1, path: file.path, content: "" })))







    : request<GeneratedFile[]>(`/api/workspace/projects/${projectId}/files?conversationId=${conversationId}`);







    void Promise.all([request<Array<{ id: number; role: "user" | "assistant" | "system"; content: string }>>(`/api/workspace/conversations/${conversationId}/messages`), scopedFiles]).then(([history, files]) => {







      if (!canApply()) return;







      const restoredMessages = history.map(message => {







        const decoded = decodeMessageAttachments(message.content);







        const legacyFailure = message.role === "assistant" && (







          /^FAILED:\s*/i.test(decoded.content.trim())







          || /I could not reach the AI service just now|configured AI provider returned an empty response|Gemini stream returned no text/i.test(decoded.content)







        );







        return {







          ...message,







          ...decoded,







          ...(legacyFailure ? {







            content: userFacingError(decoded.content.replace(/^FAILED:\s*/i, ""), "The AI service could not complete this reply. Your message is saved; try again."),







            requestFailed: true,







          } : {}),







          id: String(message.id),







          kind: "ask" as const,







        };







      });







      setMessages(mergePendingBrowserReplies(restoredMessages, conversationId));




      setGeneratedFiles(files);







    }).catch(error => { if (canApply()) setNotice(error instanceof Error ? error.message : "The current Cloud workspace messages could not be restored."); });







    return () => { cancelled = true; };







  }, [projectId, conversationId, buildRun?.id]);




  useEffect(() => {







    if (!projectId || !conversationId) return;







    const project = projects.find(item => item.id === projectId);







    const conversation = conversations.find(item => item.id === conversationId);







    const firstMessage = messages.find(message => message.role === "user")?.content;







    if (!project || !conversation || !firstMessage) return;







    const firstLine = firstMessage.split(/\r?\n/, 1)[0]?.trim().replace(/\s+/g, " ") || "";







    const legacyNames = [firstLine.slice(0, 72), firstLine.slice(0, 36), firstLine.split(" ").slice(0, 5).join(" ")].filter(Boolean);







    const renameProject = legacyNames.includes(project.name);







    const renameConversation = legacyNames.includes(conversation.title);







    const needsMigration = renameProject || renameConversation;







    if (!needsMigration) return;







    const migrationKey = `${projectId}:${conversationId}:ai-name`;







    if (workspaceNameMigrationAttempts.current.has(migrationKey)) return;







    workspaceNameMigrationAttempts.current.add(migrationKey);







    const operationEpoch = workspaceOperation.current.capture();







    void request<{ project: Project; conversation: Conversation }>(`/api/workspace/projects/${project.id}/generate-name`, {







      method: "POST",







      body: JSON.stringify({ conversationId: conversation.id, request: firstMessage, model: AI_MODEL_IDS.smartbuild, renameProject, renameConversation }),







    }).then(updated => {







      if (!workspaceOperation.current.isCurrent(operationEpoch) || projectId !== project.id || conversationId !== conversation.id) return;







      setProjects(current => current.map(item => item.id === project.id ? updated.project : item));







      setConversations(current => current.map(item => item.id === conversation.id ? updated.conversation : item));







      activeWorkspace.current.set({ project: updated.project, conversation: updated.conversation });







    }).catch(error => {







      setNotice(error instanceof Error ? `The AI could not rename this older workspace: ${error.message}` : "The AI could not rename this older workspace.");







    });







  }, [projectId, conversationId, projects, conversations, messages]);







  const activateWorkspace = ({ fresh = false, announce = false, provision = false }: { fresh?: boolean; announce?: boolean; provision?: boolean } = {}) => {







    if (!fresh) {







      const bound = activeWorkspace.current.get();







      if (bound) return Promise.resolve(bound);







    }







    if (!fresh && workspaceActivation.current) return workspaceActivation.current;







    const activationRevision = activationCoordinator.current.begin();







    const restoration = (async () => {







      try {







        const policy = workspaceBootstrapPolicy(fresh);







        const legacyClaim = fresh







          ? { state: "unavailable" as const }







          : await request<{ state: "claimable" | "claimed" | "recovery_required" | "unavailable" }>("/api/workspace/legacy-claim").catch(() => ({ state: "unavailable" as const }));







        const legacyClaimRequiresDecision = legacyClaim.state === "claimable" || legacyClaim.state === "recovery_required";







        legacyDecisionPending.current = legacyClaimRequiresDecision;







        if (activationCoordinator.current.isCurrent(activationRevision)) setLegacyClaimState(legacyClaim.state);







        // A preserved legacy workspace must be explicitly claimed or recovered







        // before any new workspace is provisioned for this account.







        let rows = await request<Project[]>("/api/workspace/projects");







        const restored = fresh ? null : await request<{ selection: { projectId: number | null; conversationId: number | null; buildRunId: string | null } | null; run: BuildRun | null }>("/api/workspace/selection").catch(() => null);







        let project = fresh ? undefined : rows.find(candidate => candidate.id === restored?.selection?.projectId) || rows.find(candidate => candidate.id === projectId) || rows[0];







        let workspaceConversations: Conversation[] = [];







        if (!project && !fresh) {







          if (legacyClaimRequiresDecision) {







            if (activationCoordinator.current.isCurrent(activationRevision)) {







              setRestorationError("legacy-workspace-decision");







              setReady(false);







            }







            return null;







          }







          if (legacyClaim.state === "claimed") {







            if (activationCoordinator.current.isCurrent(activationRevision)) { setRestorationError(null); setReady(true); }







            return null;







          }







          const prepared = await request<{ project: Project; conversation: Conversation; selection: WorkspaceSelection; run: BuildRun | null }>("/api/workspace/bootstrap", { method: "POST" });







          project = prepared.project;







          rows = [project, ...rows];







          workspaceConversations = [prepared.conversation];







          const selectedRunId = prepared.run?.projectId === project.id && prepared.run.conversationId === prepared.conversation.id ? prepared.run.id : null;







          if (!activationCoordinator.current.isCurrent(activationRevision)) return null;







          activeWorkspace.current.set({ project, conversation: prepared.conversation });







          rows = dedupeProjects(rows, project.id); setProjects(rows); setProjectId(project.id); setConversations(workspaceConversations); setConversationId(prepared.conversation.id); setBuildRun(selectedRunId && prepared.run ? prepared.run : null); setCheckpointSaved(Boolean(selectedRunId && prepared.run?.checkpoint));







          setRestorationError(null);







          if (announce || provision) setNotice("Your private Cloud workspace is ready.");







          return { project, conversation: prepared.conversation };







        }







        if (!project) {







          if (!policy.createProject) {







            if (activationCoordinator.current.isCurrent(activationRevision)) { setRestorationError(null); setReady(true); }







            return null;







          }







          project = await request<Project>("/api/workspace/projects", { method: "POST", body: JSON.stringify({ name: `Workspace ${rows.length + 1}` }) });







          rows = [project, ...rows];







        }







        workspaceConversations = await request<Conversation[]>(`/api/workspace/projects/${project.id}/conversations`);







        let conversation = workspaceConversations.find(item => item.id === restored?.selection?.conversationId) || workspaceConversations[0];







        if (!conversation && policy.createConversation) conversation = await request<Conversation>(`/api/workspace/projects/${project.id}/conversations`, { method: "POST", body: JSON.stringify({ title: "New build" }) });







        if (!conversation) {







          if (activationCoordinator.current.isCurrent(activationRevision)) { setRestorationError(null); setReady(true); }







          return null;







        }







        if (!workspaceConversations.length) workspaceConversations = [conversation];







        if (!activationCoordinator.current.isCurrent(activationRevision)) return null;







        activeWorkspace.current.set({ project, conversation });







        rows = dedupeProjects(rows, project.id); setProjects(rows); setProjectId(project.id); setConversations(workspaceConversations); setConversationId(conversation.id);







        const restoredRun = restored?.run && restored.run.projectId === project.id && restored.run.conversationId === conversation.id ? restored.run : null;







        if (restoredRun) { setBuildRun(restoredRun); setCheckpointSaved(Boolean(restoredRun.checkpoint)); }







        else { setBuildRun(null); setCheckpointSaved(false); }







        const selectedRunId = restoredRun?.id || null;







        const selectionRevision = activationCoordinator.current.choose({ projectId: project.id, conversationId: conversation.id, buildRunId: selectedRunId });







        await persistSelection(project.id, conversation.id, selectedRunId, selectionRevision);







        if (!activationCoordinator.current.isCurrent(selectionRevision)) return null;







        if (fresh) setMessages([]);







        setRestorationError(null);







        if (announce) setNotice("New Cloud workspace ready.");







        return { project, conversation };







      } catch (error) {







        const message = error instanceof Error ? error.message : "The saved SmartBuild workspace could not be restored.";







        if (activationCoordinator.current.isCurrent(activationRevision)) {







          setLegacyClaimState("unavailable");







          setRestorationError(null);







          setReady(true);







        }







        setNotice(message);







        return null;







      }







    })();







    const restorationOperation = withWorkspaceRestoreTimeout(restoration, 12_000).catch((error: unknown) => {







      if (error instanceof WorkspaceRestoreTimeoutError) {







        if (activationCoordinator.current.isCurrent(activationRevision)) {







          activationCoordinator.current.begin();







          activeWorkspace.current.clear();







          setLegacyClaimState("unavailable");







          setRestorationError(null);







          setReady(true);







          setNotice("Workspace is ready. You can start building.");







        }







      } else if (activationCoordinator.current.isCurrent(activationRevision)) {







        setLegacyClaimState("unavailable");







        setRestorationError(null);







        setReady(true);







        setNotice("Workspace is ready. You can start building.");







      }







      return null;







    });







    if (!fresh) {







      workspaceActivation.current = restorationOperation;







      void restorationOperation.finally(() => { if (workspaceActivation.current === restorationOperation) workspaceActivation.current = null; });







    }







    return restorationOperation;







  };







  async function createWorkspace({ announce = true }: { announce?: boolean } = {}) {







    // A fresh workspace supersedes any bootstrapping request that began before the user







    // selected New Workspace. Starter cards must never await that stale promise.







    workspaceActivation.current = null;







    workspaceOperation.current.invalidate();







    activationCoordinator.current.begin();







    activeWorkspace.current.clear();







    setProjectId(null);







    setConversationId(null);







    setConversations([]);







    setBuildRun(null);







    setMessages([]);







    setGeneratedFiles([]);







    setPlan(null);







    setCheckpointSaved(false);







    setStreaming(false);







    setPlanning(false);







    setPreviewing(false);







    setTesting(false);







    setLegacyClaimState(null);







    setRestorationError(null);







    const activation = activateWorkspace({ fresh: true, announce });







    workspaceActivation.current = activation;







    try {







      return await activation;







    } finally {







      if (workspaceActivation.current === activation) workspaceActivation.current = null;







    }







  }







  async function retryWorkspacePreparation() {







    setPreparingWorkspace(true); setRestorationError(null); setLegacyClaimState(null); setReady(false);







    try {







      const activated = await activateWorkspace({ provision: true, announce: true });







      if (!activated) {







        setLegacyClaimState("unavailable");







        setRestorationError(null);







        setReady(true);







        return;







      }







      setReady(true);







    } finally { setPreparingWorkspace(false); }







  }







  async function restoreClaimedLegacyWorkspace() {







    setPreparingWorkspace(true);







    setRestorationError(null);







    setReady(false);







    workspaceActivation.current = null;







    workspaceOperation.current.invalidate();







    activeWorkspace.current.clear();







    setProjectId(null);







    setConversationId(null);







    setConversations([]);







    setBuildRun(null);







    setMessages([]);







    setGeneratedFiles([]);







    setPlan(null);







    setCheckpointSaved(false);







    try {







      await activateWorkspace({ announce: true });







    } finally {







      setPreparingWorkspace(false);







    }







  }







  async function claimLegacyWorkspace() {







    const result = await request<{ state: "claimable" | "claimed" | "recovery_required" | "unavailable" }>("/api/workspace/legacy-claim", { method: "POST", body: "{}" });







    setLegacyClaimState(result.state);







    if (result.state === "claimed") await restoreClaimedLegacyWorkspace();







    else if (result.state === "recovery_required" || result.state === "unavailable") setRestorationError("legacy-workspace-decision");







  }







  useEffect(() => {







    let mounted = true;







    void request<{ authenticated: boolean; sessionType?: "first_party" | "guest" | "demo" | "none" }>("/api/auth/status")







      .then(result => {





        if (!mounted) return;





        const persistedDemoSelected = isDemoPreferenceSelected();
        const isDemoSession = result.sessionType === "demo" && persistedDemoSelected;
        if (!persistedDemoSelected || result.sessionType !== "demo") clearDemoPreference();
        setDemoMode(isDemoSession);
        setDemoPreference(isDemoSession);
        setAuthenticated(isDemoSession ? false : result.authenticated);
        setRestorationError(null);
        setReady(isDemoSession);
      })
      .catch(() => {





        if (!mounted) return;
        setDemoMode(false);
        clearDemoPreference();
        setAuthenticated(false);
        setRestorationError(null);
        setReady(false);
      });







    return () => { mounted = false; };







  }, []);







  const demoModeIsActive = demoMode && isDemoPreferenceSelected();







  useEffect(() => {





    if (demoMode && !isDemoPreferenceSelected()) {
      setDemoMode(false);
      setAuthenticated(false);
      setReady(false);
    }

    if (demoModeIsActive) {







      setReady(true);







      return;







    }







    if (!authenticated) {







      setReady(false);







      setRestorationError(null);







      return;







    }







    let mounted = true;







    void activateWorkspace().then(async result => {







      if (!mounted) return;







      if (result) {







        setRestorationError(null);







        setReady(true);







      } else {







        if (legacyDecisionPending.current) {







          if (mounted) setReady(false);







          return;







        }







        // A missing or unavailable legacy workspace must not block a verified







        // account. Provision a personal workspace automatically instead.







        try {







          const created = await createWorkspace({ announce: false });







          if (!mounted) return;







          if (created) {







            setRestorationError(null);







            setReady(true);







            return;







          }







        } catch (error) {







          if (mounted) setNotice(error instanceof Error ? error.message : "Your personal workspace could not be created.");







        }







        if (mounted) setReady(false);







        if (mounted) { setRestorationError(null); setReady(true); }







      }







    });







    return () => { mounted = false; };







  }, [authenticated, demoMode]);







  // Build Runs are restored through several independent paths (bootstrap, project







  // switching, and an explicit conversation selection).  Keep the visible







  // requirement cards derived from the durable Build Run rather than leaving a







  // prior in-memory plan attached to the newly selected workspace.







  useEffect(() => {







    if (buildRun) setPlan(buildRunTaskGraph(buildRun));







  }, [buildRun]);







  // A hard reload can restore an active Build Run after the browser-side polling







  // closure that created it has gone away. Resume only the selected workspace;







  // the durable server lease fences overlap with the original poller or Heartbeat.







  useEffect(() => {







    if (ready && buildRun && isBuildRunResumable(buildRun.status)) {







      setNotice("Build execution is disabled. This saved run and its existing files remain unchanged.");







    }







  }, [ready, buildRun?.id, projectId, conversationId]);







  const send = async (content: string, model?: string, preference = false, attachments: ChatAttachment[] = []) => {







    if (containsLikelyApiSecret(content)) {







      setNotice("This looks like an API key. It was not sent; use the secure project Settings → Secrets form instead.");







      return;







    }







    setPlanDialogOpen(false);







    const operationEpoch = workspaceOperation.current.capture();







    const workspace = activeWorkspace.current.get() || await activateWorkspace();







    if (!workspace || !workspaceOperation.current.isCurrent(operationEpoch)) return;







    const { project, conversation } = workspace;
    const shouldAutoTitleConversation = !messages.some(message => message.role === "user");
    const requestAutoTitle = () => {
      if (!shouldAutoTitleConversation) return;
      void request<{ conversation: Conversation; project?: Project; updated: boolean }>(`/api/workspace/conversations/${conversation.id}/auto-title`, { method: "POST" })
        .then(result => {
          setConversations(current => current.map(item => item.id === conversation.id ? result.conversation : item));
          if (result.project) setProjects(current => current.map(item => item.id === result.project!.id ? result.project! : item));
          const currentWorkspace = activeWorkspace.current.get();
          if (currentWorkspace?.conversation.id === conversation.id) {
            activeWorkspace.current.set({
              project: result.project || currentWorkspace.project,
              conversation: result.conversation,
            });
          }
        })
        .catch(error => {
          console.warn("[AutoTitle] Background conversation title update failed.", error);
        });
    };
    const userId = `user-${Date.now()}`;







    const assistantId = `assistant-${Date.now()}`;







    const conversationMessages = [...messages.filter(message => !(message.role === "assistant" && message.kind === "ask" && message.requestFailed)), { id: userId, role: "user" as const, content }];







      setMessages(current => [...current, { id: userId, role: "user", content, attachments, kind: preference ? "preference" : "ask" }, { id: assistantId, role: "assistant", kind: "ask", content: "" }]);







    setStreaming(true);







    const abortController = new AbortController();
    chatAbortController.current = abortController;
    let browserFallbackError: string | undefined;

    const runBrowserFallback = async (failure: unknown) => {
      if (attachments.length > 0 || !isRecoverableChatFailure({ error: failure, status: (failure as { status?: number } | null)?.status, retryable: (failure as { retryable?: boolean } | null)?.retryable })) {
        return false;
      }

      try {
        if (workspaceOperation.current.isCurrent(operationEpoch)) {
          setNotice("The server AI is unavailable. Trying Chrome's built-in AI locally...");
        }
        const localReply = await generateBrowserLocalReply([
          { role: "system", content: BROWSER_LOCAL_CHAT_INSTRUCTIONS },
          ...conversationMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        ], abortController.signal, undefined, undefined, loadedPercent => {
          if (workspaceOperation.current.isCurrent(operationEpoch)) {
            setNotice(`Downloading Chrome's local AI model: ${loadedPercent}%`);
          }
        });
        if (!localReply) {
          throw new Error("Chrome's built-in Prompt API is unavailable in this browser. Enable the Prompt API and download its model to use local fallback.");
        }

        let savedToServer = false;
        let savedToBrowser = false;
        let browserSaveError: string | undefined;
        try {
          const saveResponse = await fetch(`/api/workspace/conversations/${conversation.id}/local-reply`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify({ projectId: project.id, userContent: content, assistantContent: localReply }),
          });
          if (!saveResponse.ok) {
            const payload = await saveResponse.json().catch(() => ({})) as { error?: string };
            throw new Error(payload.error || "The local reply could not be saved to the conversation.");
          }
          savedToServer = true;
        } catch (saveError) {
          if (abortController.signal.aborted) throw saveError;
          try {
            savePendingBrowserReply(conversation.id, {
              userContent: content,
              assistantContent: localReply,
              createdAt: new Date().toISOString(),
            });
            savedToBrowser = true;
          } catch (storageError) {
            browserSaveError = storageError instanceof Error
              ? storageError.message
              : "The browser could not save this local reply.";
          }
        }

        if (workspaceOperation.current.isCurrent(operationEpoch)) {
          setMessages(current => current.map(message => message.id === assistantId
            ? { ...message, content: localReply, requestFailed: false }
            : message));
          setNotice(savedToServer
            ? "Answered with Chrome's local AI because the server AI was unavailable."
            : savedToBrowser
              ? "Answered with Chrome's local AI. The reply is saved in this browser and will remain visible when you return."
              : `Answered with Chrome's local AI, but the reply could not be saved: ${browserSaveError}`);
        }
        if (savedToServer) requestAutoTitle();
        return true;
      } catch (fallbackError) {
        if (fallbackError instanceof DOMException && fallbackError.name === "AbortError") throw fallbackError;
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Chrome's local AI could not complete this request.";
        browserFallbackError = fallbackMessage;
        return false;
      }
    };

    try {







      const response = await fetch("/api/ai/stream", {







        method: "POST",







        credentials: "include",







        headers: { "content-type": "application/json" },







        signal: abortController.signal,







        body: JSON.stringify({ projectId: project.id, conversationId: conversation.id, messages: conversationMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })), attachments, mode: "chat", model }),







      });







      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw Object.assign(new Error(payload.error || "The chat service did not return a response."), { status: response.status });
      }
      if (!response.body) throw new TypeError("Failed to fetch a chat response stream.");







      const reader = response.body.getReader();







      const decoder = new TextDecoder();







      let buffer = "";







      let reply = "";
      let streamError = "";
      let streamRetryable = false;







      const consumeEvent = (event: string) => {







        const data = event.split("\n").find(line => line.startsWith("data: "))?.slice(6);







        if (!data || data === "[DONE]") return;







        const payload = JSON.parse(data) as { token?: unknown; error?: unknown; retryable?: unknown };
        if (typeof payload.error === "string") {
          streamError = userFacingError(payload.error, "The response could not be completed. Please try again.");
          streamRetryable = payload.retryable === true;
          return;







        }







        const token = payload.token;







        if (typeof token !== "string") return;







        reply += token;







        if (workspaceOperation.current.isCurrent(operationEpoch)) setMessages(current => current.map(message => message.id === assistantId ? { ...message, content: reply } : message));







      };







      while (true) {







        const { done, value } = await reader.read();







        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });







        const events = buffer.split("\n\n");







        buffer = events.pop() || "";







        for (const event of events) consumeEvent(event);







        if (done && buffer) consumeEvent(buffer);







        if (done) break;







      }

      if (streamError) {
        if (!reply && streamRetryable && await runBrowserFallback({ retryable: true })) return;
        const detail = browserFallbackError || streamError;
        if (workspaceOperation.current.isCurrent(operationEpoch)) {
          setMessages(current => current.map(message => message.id === assistantId ? { ...message, content: detail, requestFailed: true } : message));
          setNotice(detail);
        }
        return;
      }

      if (!reply && !streamError && workspaceOperation.current.isCurrent(operationEpoch)) setMessages(current => current.map(message => message.id === assistantId ? { ...message, content: "The AI service did not return a reply. Your message is saved; please try again.", requestFailed: true } : message));
      if (reply) requestAutoTitle();







    } catch (error) {







      if (error instanceof DOMException && error.name === "AbortError") return;

      if (await runBrowserFallback(error)) return;







      if (workspaceOperation.current.isCurrent(operationEpoch)) {
        const detail = browserFallbackError || userFacingError(error, "The chat request failed.");







        setMessages(current => current.map(message => message.id === assistantId ? { ...message, content: detail, requestFailed: true } : message));







        setNotice(detail);







      }







    } finally {







      if (chatAbortController.current === abortController) chatAbortController.current = null;







      if (workspaceOperation.current.isCurrent(operationEpoch)) setStreaming(false);







    }







  };







  const stopChat = () => {







    chatAbortController.current?.abort();







    setStreaming(false);







  };







  const cancelBuild = async () => { if (!buildRun || !["queued", "planning", "writing", "previewing", "testing", "verifying"].includes(buildRun.status)) return; try { const result = await request<{ run: BuildRun }>(`/api/build-runs/${buildRun.id}/cancel`, { method: "POST", body: "{}" }); setBuildRun(result.run); setNotice(result.run.error?.message || "Build cancelled. Preserved logs are available in the workspace."); } catch (error) { setNotice(error instanceof Error ? error.message : "Build cancellation failed."); } finally { setStreaming(false); } };







  const clearDemoPreference = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem("smartbuild-demo-preference");
  };

  if (demoModeIsActive) return <DemoModeWorkspace onExit={async () => {
    await request("/api/auth/demo-logout", { method: "POST" }).catch(() => undefined);
    clearDemoPreference();
    setDemoPreference(false);
    try {
      const result = await request<{ authenticated: boolean; sessionType?: "first_party" | "guest" | "demo" | "none" }>("/api/auth/status");
      const isDemoSession = result.sessionType === "demo" && isDemoPreferenceSelected();
      setDemoMode(isDemoSession);
      setAuthenticated(isDemoSession ? false : result.authenticated);
      setReady(isDemoSession);
    } catch {
      setDemoMode(false);
      clearDemoPreference();
      setAuthenticated(false);
      setReady(false);
    }
  }} />;

  if (authenticated !== true) return <SmartBuildAuthGate onAuthenticated={() => { clearDemoPreference(); setDemoPreference(false); setDemoMode(false); setAuthenticated(true); setReady(false); }} />;







  if (!ready) return <main className="grid min-h-screen place-items-center bg-black p-6 text-slate-100"><section aria-live="polite" className="max-w-sm rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-5 text-center"><p className="text-sm font-semibold text-cyan-100">Opening SmartBuild</p><p className="mt-2 text-xs leading-5 text-slate-400">Preparing your workspace…</p></section></main>;
  const sidebar = (
    <aside className={`smartbuild-sidebar ${sidebarOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden"} w-[270px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b0d12] lg:flex`}>
      <div className="flex items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-sm font-semibold text-white"><SmartBuildMark />SmartBuild</span>
        <button onClick={() => setSidebarOpen(false)} className="lg:hidden" aria-label="Close navigation"><X className="h-4 w-4 text-slate-400" /></button>
      </div>
      <div className="space-y-2 px-3">
        <button
          onClick={() => { setActiveWorkspaceView("workspace"); setSidebarOpen(false); void createWorkspace(); }}
          className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#2b3037] px-3 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] hover:bg-[#343b45]"
        >
          <Plus className="h-4 w-4" />New Task / Workspace
        </button>
        <button
          type="button"
          aria-current={activeWorkspaceView === "media-insight" ? "page" : undefined}
          onClick={() => { setActiveWorkspaceView("media-insight"); setSidebarOpen(false); }}
          className={`flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium transition ${activeWorkspaceView === "media-insight" ? "bg-[#121b2b] text-cyan-100 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.2)]" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"}`}
        >
          <ScanSearch className="h-4 w-4" aria-hidden="true" />Media Insight
        </button>
      </div>
      <div className="mt-5 flex-1 overflow-y-auto border-t border-white/[0.06] px-3 pt-4">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Workspaces</p>
        {dedupeProjects(projects, projectId).map((project, index) => {
          const swatch = workspaceSwatchFor(project, index);
          const active = project.id === projectId;
          return (
            <div key={project.id} className="mt-2">
              <div className="group flex items-center">
                <button
                  onClick={() => {
                    setActiveWorkspaceView("workspace");
                    setSidebarOpen(false);
                    workspaceOperation.current.invalidate();
                    activeWorkspace.current.clear();
                    setProjectId(project.id);
                    setConversationId(null);
                    setBuildRun(null);
                    void persistSelection(project.id, null, null);
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-[#121b2b] text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.2)]" : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"}`}
                >
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-white/10" style={{ backgroundColor: swatch, boxShadow: active ? `0 0 0 1px ${swatch}` : "none" }}>
                    <span className="h-1.5 w-1.5 rounded-[2px] bg-[#0b0d12]/90" style={{ opacity: active ? 0.8 : 0.2 }} />
                  </span>
                  <span className="truncate">{project.name}</span>
                </button>
                <button type="button" onClick={() => void renameWorkspace(project)} className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 transition hover:bg-cyan-300/10 hover:text-cyan-100 focus:opacity-100 group-hover:opacity-100" aria-label={`Rename workspace ${project.name}`} title="Rename workspace">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <WorkspaceListDeleteControl projectId={project.id} projectName={project.name} />
              </div>
              {active && conversations.length > 0 && (
                <div className="mt-1 pl-7 pr-1">
                  {conversations.map(conversation => (
                    <button key={conversation.id} onClick={() => { setActiveWorkspaceView("workspace"); setSidebarOpen(false); void openConversation(project, conversation); }} className={`mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${conversation.id === conversationId ? "bg-white/[0.04] text-cyan-200" : "text-slate-500 hover:bg-white/[0.02] hover:text-slate-300"}`}>
                      <Bot className="h-3 w-3" />{conversation.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/[0.06] p-3"><SmartBuildLogoutButton /></div>
    </aside>
  );







  const composerScope = workspaceComposerScope(projectId, conversationId);







  return (







    <main className="smartbuild-app h-dvh min-h-0 overflow-hidden bg-black text-slate-100">







      <div className="flex h-full min-h-0">







        {sidebar}







        <div className="flex min-w-0 flex-1 flex-col">







          <header className="smartbuild-header flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#090b10]/95 px-4 backdrop-blur sm:px-6">







            <div className="flex items-center gap-3">







              <button onClick={() => setSidebarOpen(true)} className="lg:hidden"><Menu className="h-5 w-5 text-slate-400" /></button>







              <p className="text-sm font-medium text-slate-200">{activeWorkspaceView === "media-insight" ? "Media Insight" : activeProject?.name || "SmartBuild"}</p>







            </div>







            <div className={activeWorkspaceView === "media-insight" ? "hidden" : "flex items-center gap-2"}>







              <div className="relative">







                <span data-testid="builder-model-static" aria-label="Active model: SM+3.1 Pro" className="inline-flex h-10 shrink-0 items-center rounded-full border border-white/[0.08] bg-transparent px-3 text-xs font-medium text-slate-200">SM+3.1 Pro</span>







              </div>







              <button onClick={() => window.dispatchEvent(new Event("smartbuild:toggle-code-panel"))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] hover:text-white" aria-label="Show or hide Code panel" aria-controls="desktop-code-panel" title="Code panel"><FileCode2 className="h-3.5 w-3.5" /></button>







            </div>







          </header>







          <div className={`min-h-0 flex-1 overflow-y-auto ${activeWorkspaceView === "media-insight" ? "" : "hidden"}`}>
            <AIImageCheckEntry
              onAskAboutImage={prompt => {
                setMediaCheckChatPrompt(prompt);
                setActiveWorkspaceView("workspace");
              }}
            />
          </div>

          {activeWorkspaceView === "workspace" && (restorationError







            ? <div className="flex min-h-0 flex-1 p-5 sm:p-8"><WorkspacePreparationState busy={preparingWorkspace} onRetry={() => void retryWorkspacePreparation()} onCreate={() => { setPreparingWorkspace(true); void createWorkspace().then(result => { if (result) { setRestorationError(null); setReady(true); } else { setLegacyClaimState("unavailable"); setRestorationError("workspace-unavailable"); setReady(false); } }).finally(() => setPreparingWorkspace(false)); }} legacyClaimState={legacyClaimState ?? undefined} onClaim={claimLegacyWorkspace} /></div>







            : <div className="flex min-h-0 flex-1">







                <AIChatBox key={composerScope} messages={messages} streaming={streaming} selectedModel={AI_MODEL_IDS.smartbuild} projectId={projectId} conversationId={conversationId} references={references} onReferencesChange={setReferences} onUploadComplete={async () => {}} onSend={send} localAiNeedsDownload={Boolean(notice?.includes("Chrome's local AI model is not downloaded"))} onPrepareLocalAi={async onDownloadProgress => {
                  const userActivation = typeof navigator !== "undefined" && Boolean((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive);
                  try {
                    await prepareBrowserLocalModel(onDownloadProgress, undefined, userActivation);
                    setNotice("Chrome's local AI model is ready. Send your message again to use it if server AI is unavailable.");
                  } catch (error) {
                    const message = error instanceof Error ? error.message : "Chrome's local AI model could not be prepared.";
                    setNotice(message);
                    throw error;
                  }
                }} onStop={stopChat} onSecretStored={() => window.dispatchEvent(new Event("smartbuild:open-project-secrets"))} initialPrompt={mediaCheckChatPrompt} onInitialPromptConsumed={() => setMediaCheckChatPrompt(null)} />







                <CloudWorkspacePanel active={Boolean(ready && projectId && conversationId)} notice={setNotice} buildRun={buildRun} onBuildRunChange={run => { setBuildRun(run); setCheckpointSaved(isVerifiedBuildRun(run)); }} conversationFiles={generatedFiles} workspaceScope={projectId && conversationId ? { projectId, conversationId } : null} ownerBindingVerified={legacyClaimState === "claimed"} />




              </div>)}







        </div>







      </div>







      {plan && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">







        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.12] bg-[#11141b] shadow-2xl">







          <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">







            <div><p className="text-sm font-semibold text-white">Requirement contract and build plan</p><p className="mt-1 text-xs text-slate-500">A build is successful only after written artifacts, preview, tests, evidence, and a verified checkpoint.</p></div>







            <button aria-label="Close implementation plan" onClick={() => setPlan(null)} className="rounded p-1 text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>







          </div>







          <div className="border-b border-white/[0.08] px-5 py-3 text-xs text-slate-400">{plan.summary}<span className="ml-2 rounded bg-cyan-300/10 px-1.5 py-0.5 text-cyan-100">Cloud workspace</span></div>







          <div className="max-h-[45vh] space-y-2 overflow-y-auto p-4">{plan.tasks.map(task => <div key={task.id} className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${task.status === "Blocked" ? "bg-rose-300/10 text-rose-200" : "bg-emerald-300/10 text-emerald-200"}`}>{task.status === "Blocked" ? <X className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}</div><div className="min-w-0 flex-1"><p className="text-sm text-slate-200">{task.title}</p><p className="mt-1 text-[11px] text-slate-600">{task.specialist} · {task.evidence}</p></div><span className="text-[10px] font-semibold uppercase text-slate-500">{task.status}</span></div>)}</div>







          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-3">







            {buildRun && ["queued", "planning", "writing", "previewing", "testing", "verifying"].includes(buildRun.status) && <button onClick={() => void cancelBuild()} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/30 px-2.5 py-1.5 text-[11px] text-rose-100"><X className="h-3.5 w-3.5" />Cancel</button>}







            {buildRun?.preview?.proxyUrl && <button onClick={() => window.open(buildRun.preview?.proxyUrl, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[11px] text-slate-300"><PanelRight className="h-3.5 w-3.5" />Open Preview</button>}







            {checkpointSaved && <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/20 px-2.5 py-1.5 text-[11px] text-emerald-100"><CheckCircle2 className="h-3.5 w-3.5" />Verified checkpoint</span>}







          </div>







        </div>







      </div>}







    </main>







  );







}
