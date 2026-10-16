import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const composerSource = fs.readFileSync(path.join(process.cwd(), "client/src/components/AIChatBox.tsx"), "utf8");
const imageCheckSource = fs.readFileSync(path.join(process.cwd(), "client/src/components/AIImageCheckEntry.tsx"), "utf8");
const logoutSource = fs.readFileSync(path.join(process.cwd(), "client/src/components/SmartBuildLogoutButton.tsx"), "utf8");
const compactChatSource = fs.readFileSync(path.join(process.cwd(), "client/src/lib/compactChat.ts"), "utf8");
const discoverySource = fs.readFileSync(path.join(process.cwd(), "client/src/components/SmartBuildDiscovery.tsx"), "utf8");
const stylesSource = fs.readFileSync(path.join(process.cwd(), "client/src/index.css"), "utf8");
const workspaceServerSource = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
const databaseSource = fs.readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");

describe("SmartBuild auth-aware workspace routing", () => {
  it("shows SM+3.1 Pro as the only selectable chat model without a top-header Export button", () => {
    const header = source.slice(source.indexOf('<header className="smartbuild-header'), source.indexOf("</header>", source.indexOf('<header className="smartbuild-header')));
    expect(header).toContain('data-testid="builder-model-static"');
    expect(header).toContain('aria-label="Active model: SM+3.1 Pro"');
    expect(header).toContain(">SM+3.1 Pro</span>");
    expect(header).toContain('rounded-full');
    expect(source).not.toContain("Claude Sonnet 5.5");
    expect(source).not.toContain("builder-model-option-claude");
    expect(source).toContain("selectedModel={AI_MODEL_IDS.smartbuild}");
    expect(source).toContain("model: AI_MODEL_IDS.smartbuild");
    const send = source.slice(source.indexOf("const send = async"), source.indexOf("const stopChat"));
    expect(send).toContain('messages.filter(message => !(message.role === "assistant" && message.kind === "ask" && message.requestFailed))');
    expect(send).toContain("const conversationMessages = [...messages.filter(");
    expect(send).toContain("messages: conversationMessages.map");
    expect(send).toContain("mode: \"chat\", model");
    expect(header).not.toContain(">Export</a>");
    expect(stylesSource).not.toContain("smartbuild-accent-sweep");
    expect(stylesSource).not.toContain(".smartbuild-app .smartbuild-header::after");
  });

  it("uses an AI-generated workspace name and migrates legacy prompt-based names", () => {
    expect(source).toContain("const needsMigration = renameProject || renameConversation");
    expect(source).toContain("model: AI_MODEL_IDS.smartbuild");
    expect(source).not.toContain("autoNameWorkspace");
    expect(source).not.toContain("workspaceTitleFromMessage");
    const generatedNameRoute = workspaceServerSource.slice(
      workspaceServerSource.indexOf('app.post("/api/workspace/projects/:projectId/generate-name"'),
      workspaceServerSource.indexOf('app.get("/api/workspace/projects/:projectId/settings"'),
    );
    expect(generatedNameRoute).toContain("conversation.projectId !== projectId");
    expect(generatedNameRoute).toContain("if (!renameProject && !renameConversation)");
    expect(generatedNameRoute).toContain("renameProject ? updateProjectDetails");
    expect(generatedNameRoute).toContain("renameConversation ? updateConversationTitle");
  });

  it("rejects implementation requests before adding progress claims or contacting the build API", () => {
    expect(source).not.toContain("const startBuild = async");
    expect(source).not.toContain('fetch("/api/build-runs"');
    expect(source).not.toContain("buildAcknowledgment");
    expect(source).not.toContain('kind: "build-status"');
    const buildRoute = workspaceServerSource.slice(workspaceServerSource.indexOf('app.post("/api/build-runs"'), workspaceServerSource.indexOf('app.post("/api/build-runs/:buildId/resume"'));
    expect(buildRoute).toContain("BUILD_CREATION_DISABLED");
    expect(buildRoute).not.toContain("Website Builder Agent");
    expect(buildRoute).not.toContain("Clarification");
    expect(databaseSource).toContain(".orderBy(asc(messages.createdAt), asc(messages.id))");
  });

  it("does not present implementation progress or clarification UI and keeps historical messages visible", () => {
    expect(composerSource).not.toContain("requestJourney");
    expect(composerSource).not.toContain("Build progress");
    expect(composerSource).not.toContain("Clarification options");
    expect(composerSource).not.toContain("submitClarification");
    expect(composerSource).toContain("{messages.map((message, index) =>");
    expect(composerSource).toContain("{message.content.trim() && <p className=\"whitespace-pre-wrap\">{message.content}</p>}");
  });

  it("shows the original branded workspace entrance on an empty new workspace", () => {
    expect(composerSource).toContain('className="smartbuild-entrance mx-auto flex h-full max-w-3xl flex-col justify-center');
    expect(composerSource).toContain("<SmartBuildMark size={28} />");
    expect(composerSource).toContain("Workspace ready");
    expect(composerSource).toContain("Start with an idea or a question");
    expect(composerSource).not.toContain("AIImageCheckEntry");
    expect(source).toContain("<AIImageCheckEntry");
  });

  it("keeps AI Image Check local and never fabricates an analysis result", () => {
    expect(imageCheckSource).toContain("Content understanding is not proof of authenticity.");
    expect(imageCheckSource).toContain("No AI-generation detector is connected.");
    expect(imageCheckSource).toContain("GIF preview only; animation is not analyzed.");
    expect(imageCheckSource).not.toContain("AI-generation clues found");
    expect(imageCheckSource).not.toContain("No strong AI-generation clues found");
    expect(imageCheckSource).not.toContain("No Content Credentials were found in this file.");
  });

  it("keeps Media Insight outside project workspaces and preserves its follow-up chat action", () => {
    expect(source).toContain("aria-current={activeWorkspaceView === \"media-insight\" ? \"page\" : undefined}");
    expect(source).toContain("<ScanSearch className=\"h-4 w-4\" aria-hidden=\"true\" />Media Insight");
    expect(source).toContain("activeWorkspaceView === \"media-insight\" ? \"Media Insight\"");
    expect(source).toContain("<AIImageCheckEntry");
    expect(source).toContain("initialPrompt={mediaCheckChatPrompt}");
    expect(source).toContain("onInitialPromptConsumed={() => setMediaCheckChatPrompt(null)}");
    expect(composerSource).not.toContain("AIImageCheckEntry");
  });

  it("does not expose a retry action for historical implementation runs", () => {
    expect(source).not.toContain("const retryBuild = async");
    expect(source).not.toContain("const retryJourney = async");
  });

  it("uses the server auth-status source of truth before restoration and after leaving Demo", () => {
    expect(source).toContain('"/api/auth/status"');
    expect(source).toContain("const isDemoSession = result.sessionType === \"demo\" && persistedDemoSelected");
    expect(source).toContain("if (!persistedDemoSelected || result.sessionType !== \"demo\") clearDemoPreference();");
    expect(source).toContain("setAuthenticated(isDemoSession ? false : result.authenticated)");
    expect(source).toContain('request("/api/auth/demo-logout", { method: "POST" })');
  });

  it("keeps Sign out in the sidebar footer and not on the chat composer", () => {
    expect(source).toContain('<SmartBuildLogoutButton />');
    expect(composerSource).not.toContain('import { SmartBuildLogoutButton } from "@/components/SmartBuildLogoutButton"');
    expect(composerSource).not.toContain("<SmartBuildLogoutButton />");
    expect(logoutSource).toContain('fetch("/api/auth/logout", { method: "POST", credentials: "include"');
    expect(logoutSource).toContain("if (!response.ok) throw new Error(\"SIGN_OUT_UNAVAILABLE\")");
    expect(logoutSource).toContain('window.location.assign("/")');
    expect(logoutSource).toContain('aria-label="Sign out of SmartBuild"');
    expect(logoutSource).toContain("className=\"group inline-flex h-11 w-11");
    expect(logoutSource).toContain("const [confirmOpen, setConfirmOpen] = useState(false)");
    expect(logoutSource).toContain("<AlertDialogTrigger asChild>");
    expect(logoutSource).toContain("Sign out?");
    expect(logoutSource).toContain("You will return to the sign-in screen");
    expect(logoutSource).toContain("onClick={confirmSignOut}");
    expect(logoutSource).toContain("event.preventDefault()");
    expect(logoutSource).toContain("hover:-translate-y-0.5");
    expect(logoutSource).toContain("focus-visible:ring-2");
    expect(logoutSource).toContain("active:scale-[0.97]");
    expect(logoutSource).toContain('role="status"');
    expect(source).not.toContain("Stage indicator from the saved Build Run status; no estimated percentage.");
    expect(source).not.toContain("Generated result");
    expect(source).not.toContain("Gemini output");
  });

  it("never starts production workspace restoration for a demo or unauthenticated session", () => {
    expect(source).toContain("if (demoModeIsActive) {");
    expect(source).toContain("if (demoModeIsActive) return <DemoModeWorkspace");
    expect(source).toContain("if (authenticated !== true) return <SmartBuildAuthGate");
  });

  it("checks the server-side legacy-claim state before automatic provisioning and keeps private creation explicit", () => {
    const fallback = source.slice(source.indexOf("function WorkspacePreparationState"), source.indexOf("function ReleaseDiagnosticPanel"));
    const activation = source.slice(source.indexOf("const activateWorkspace"), source.indexOf("async function createWorkspace"));
    const claim = source.slice(source.indexOf("async function claimLegacyWorkspace"), source.indexOf("useEffect(() =>", source.indexOf("async function claimLegacyWorkspace")));

    expect(source).not.toContain("Cloud workspace restoration timed out");
    expect(source).not.toContain("Retry restoration");
    expect(activation).toContain('request<{ state: "claimable" | "claimed" | "recovery_required" | "unavailable" }>("/api/workspace/legacy-claim")');
    expect(activation.indexOf('"/api/workspace/legacy-claim"')).toBeLessThan(activation.indexOf('let rows = await request<Project[]>("/api/workspace/projects")'));
    expect(activation.indexOf('"/api/workspace/legacy-claim"')).toBeLessThan(activation.indexOf('"/api/workspace/bootstrap"'));
    expect(activation).toContain('legacyClaim.state === "claimable" || legacyClaim.state === "recovery_required"');
    expect(activation).toContain('setLegacyClaimState(legacyClaim.state)');
    expect(source).toContain('request<{ project: Project; conversation: Conversation; selection: WorkspaceSelection; run: BuildRun | null }>("/api/workspace/bootstrap", { method: "POST" })');
    expect(fallback).toContain("Your workspace is being prepared");
    expect(fallback).toContain("Claim existing workspace");
    expect(fallback).toContain("Owner recovery required");
    expect(fallback).toContain("Retry");
    expect(fallback).toContain("Create new workspace");
    expect(fallback).toContain("It will not use another account’s projects, Build Runs, files, previews, exports, or evaluator evidence.");
    expect(fallback).toContain("onRetry");
    expect(fallback).toContain("onCreate");
    expect(fallback).toContain("await onClaim?.()");
    expect(source).toContain("legacyClaimState={legacyClaimState ?? undefined}");
    expect(source).toContain("onClaim={claimLegacyWorkspace}");
    expect(claim).toContain('"/api/workspace/legacy-claim", { method: "POST", body: "{}" }');
    expect(claim).toContain('if (result.state === "claimed") await restoreClaimedLegacyWorkspace()');
    expect(fallback).not.toContain("smartbuild:legacy-workspace-claimed");
    expect(fallback).not.toContain("projectId:");
    expect(fallback).not.toContain("conversationId:");
    expect(fallback).not.toContain("buildRunId:");
    expect(fallback).not.toContain("DemoModeWorkspace");
  });

  it("restores a claimed workspace only through a fresh server-selected workspace activation", () => {
    const restore = source.slice(source.indexOf("async function restoreClaimedLegacyWorkspace"), source.indexOf("async function claimLegacyWorkspace"));
    const claim = source.slice(source.indexOf("async function claimLegacyWorkspace"), source.indexOf("useEffect(() =>", source.indexOf("async function claimLegacyWorkspace")));

    expect(restore).toContain("workspaceOperation.current.invalidate()");
    expect(restore).toContain("activeWorkspace.current.clear()");
    expect(restore).toContain("setProjectId(null)");
    expect(restore).toContain("setConversationId(null)");
    expect(restore).toContain("setBuildRun(null)");
    expect(restore).toContain("await activateWorkspace({ announce: true })");
    expect(restore).not.toContain("6720001");
    expect(restore).not.toContain("6510001");
    expect(restore).not.toContain("0e5e85c2-859f-40e2-bff5-5632c3c84ca6");
    expect(claim).toContain('body: "{}"');
    expect(claim).not.toContain("projectId");
    expect(claim).not.toContain("conversationId");
    expect(claim).not.toContain("buildRunId");
  });

  it("deduplicates Cloud file rows before mapping their path-based React keys", () => {
    expect(source).toContain('import { dedupeCloudFiles } from "@/lib/dedupeCloudFiles"');
    expect(source).toContain('import { sourceBuildFiles } from "@/lib/sourceBuildFiles"');
    expect(source).toContain("const sourceFiles = sourceBuildFiles(dedupeCloudFiles(fileSet.files));");
    expect(source).toContain("setFiles(sourceFiles)");
    expect(source).toContain("setFiles(dedupeCloudFiles(fileSet.map(file => ({ path: file.path, type: \"file\" as const, size: file.content.length }))));");
    expect(source).toContain("files.map(file => file.type === \"directory\"");
  });

  it("uses one unified Send action for chat and does not expose a new-build callback", () => {
    const chat = source.slice(source.indexOf("const send = async"), source.indexOf("const stopChat"));
    expect(chat).toContain('fetch("/api/ai/stream"');
    expect(chat).toContain('signal: abortController.signal');
    expect(source).toContain("onSend={send} onStop={stopChat}");
    expect(source).not.toContain("onBuild={(content");
    expect(source).not.toContain("smart-builder:start-build");
    expect(source).not.toContain("startExplicitBuild");
  });

  it("keeps planning, implementation, and generation endpoints disabled", () => {
    expect(source).not.toContain("const createPlan = async");
    expect(source).not.toContain("const terminalBuildNotice");
    expect(source).not.toContain("const buildMessage");
    expect(workspaceServerSource).toContain('respondBuildDisabled(res, "BUILD_CREATION_DISABLED"');
    expect(workspaceServerSource).toContain('req.body?.mode === "generate"');
  });

  it("keeps internal build failure codes out of chat", () => {
    expect(source).toContain('userFacingError(error, "The chat request failed.")');
    expect(source).toContain("streamError = userFacingError(payload.error,");
  });

  it("restores a tracked Build Run only when both its project and conversation match", () => {
    const activation = source.slice(source.indexOf("const activateWorkspace"), source.indexOf("async function createWorkspace"));
    expect(activation).toContain("restored.run.projectId === project.id && restored.run.conversationId === conversation.id");
    expect(activation).toContain("const selectedRunId = restoredRun?.id || null");
  });

  it("keeps the transcript scrollable and provides a resizable Code and Preview panel beside conversational chat", () => {
    expect(source).toContain('className="smartbuild-app h-dvh min-h-0 overflow-hidden bg-black text-slate-100"');
    expect(source).toContain('className="flex h-full min-h-0"');
    expect(source).toContain('data-testid="desktop-code-panel"');
    expect(source).toContain('"smartbuild:code-panel-width"');
    expect(source).toContain('aria-label="Resize Code panel"');
    expect(source).toContain('role="separator"');
    expect(source).toContain("onPointerDown={startToolsResize}");
    expect(source).toContain("onKeyDown={resizeToolsWithKeyboard}");
    expect(source).toContain('window.addEventListener("smartbuild:toggle-code-panel"');
    expect(source).toContain('data-testid="code-panel-hide"');
    expect(source).toContain('aria-label="Hide Code panel"');
    expect(source).toContain("const toolsPanelRef = useRef<HTMLElement>(null)");
    expect(source).toContain("const shouldFocusTools = useRef(false)");
    expect(source).toContain("toolsPanelRef.current?.focus({ preventScroll: true })");
    expect(source).toContain('tabIndex={toolsVisible ? -1 : undefined} aria-label="Code and Preview panel" aria-hidden={!toolsVisible} inert={!toolsVisible}');
    expect(source).toContain('const previewAvailable = Boolean(previewUrl && previewRunId);');
    expect(source).toContain('aria-label="Saved Build Run preview"');
    expect(source).toContain('key={`${previewRunId || "no-build-run"}:${lastScopedRefreshAt || "initial"}`}');
    expect(source).toContain('className="flex min-h-0 flex-1 flex-col"');
    expect(source).toContain('className="flex min-h-0 flex-1 flex-col bg-[#080b11]"');
    expect(source).toContain('const BUILD_PROGRESS_STAGES = ["Queued", "Plan", "Write", "Preview", "Verify"] as const;');
    expect(source).toContain('function buildRunProgress(run: BuildRun)');
    expect(source).toContain('aria-label="Build progress"');
    expect(source).not.toContain('Stage indicator from the saved Build Run status; no estimated percentage.');
    expect(stylesSource).toContain('#root > main:not(.auth-shell) > div > div > div.flex.min-w-0.flex-1.flex-col { min-height: 0; overflow: hidden; }');
    expect(composerSource).toContain("await onSend(request, selectedModel, false, attachments)");
    expect(composerSource).not.toContain("Attached files:");
    expect(composerSource).toContain("<img src={url} alt={file.name}");
    expect(composerSource).toContain("<video key={file.key} src={url} controls");
    expect(composerSource).toContain("<audio src={url} controls");
    expect(composerSource).not.toContain("await onBuild(message, selectedModel, request === message ? undefined : request)");
    expect(composerSource).toContain("const submitAsk = async () => submitValue(draft)");
    expect(composerSource).not.toContain("Current build request (follow this if it conflicts with older context):");
    expect(composerSource).not.toContain('data-testid="build-idea-summary"');
    expect(composerSource).not.toContain('aria-label="اختيارات بدء المشروع"');
    expect(composerSource).not.toContain("ابدأ بفكرة بسيطة");
    expect(composerSource).not.toContain("موقع لمشروعي");
    expect(source).toContain("<AIImageCheckEntry");
    expect(composerSource).not.toContain("مش عارف أكتب إيه؟");
    expect(composerSource).not.toContain('data-testid="composer-quick-start"');
    expect(composerSource).not.toContain('aria-label="اقتراحات بدء البناء"');
    expect(composerSource).toContain('className="flex items-center gap-2 px-1 py-1"');
    expect(composerSource).not.toContain("ابدأ البناء");
    expect(composerSource).not.toContain("عدّل فكرتي");
    expect(composerSource).toContain('className="min-h-0 flex-1 overflow-y-auto');
    expect(composerSource).toContain('className="smartbuild-composer-wrap shrink-0 bg-gradient-to-t');
    expect(composerSource).toContain('event.key === "Enter" && !event.shiftKey');
    expect(composerSource).toContain("void submitAsk()");
    expect(composerSource).not.toContain("DEFAULT_COMPOSER_ACTION");
    expect(composerSource).toContain('placeholder="Ask SM+3.1 Pro a question…" aria-label="Chat with SM+3.1 Pro"');
    expect(composerSource).not.toContain("Ask Claude Sonnet 5.5");
    expect(composerSource).not.toContain("Choose Gemini model");
    expect(composerSource).toContain('data-testid="composer-send"');
    expect(composerSource).toContain('<input ref={fileInputRef} type="file" multiple');
    expect(composerSource).not.toContain('accept="image/png,image/jpeg,image/webp,image/gif');
    expect(composerSource).toContain('<ArrowUp className="h-3.5 w-3.5" />');
    expect(composerSource).toContain('if ((!value.trim() && !references.length) || sending || streaming || disabled || uploading) return;');
    expect(composerSource).not.toContain("onBuild");
    expect(composerSource).toContain('disabled={disabled || sending || uploading || (!streaming && !draft.trim() && !references.length)}');
    expect(composerSource).not.toContain('data-testid="composer-build"');
    expect(composerSource).not.toContain('data-testid="composer-code"');
    expect(composerSource).not.toContain('aria-label="Choose recording language"');
    expect(composerSource).not.toContain('aria-label="Recording language"');
    expect(composerSource).toContain('aria-label={recording ? "Stop voice input" : "Start voice input"}');
    expect(composerSource).toContain('recognition.lang = ""');
    expect(composerSource).not.toContain('Show Code & Preview');
    expect(stylesSource).not.toContain('#desktop-workspace-tools');
    expect(composerSource).toContain("const submitAsk = async () => submitValue(draft)");
    expect(composerSource).not.toContain("Enter sends one Gemini request");
  });

  it("animates the Code panel while preserving its mounted state and makes hidden controls non-interactive", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).not.toContain("if (!toolsOpen) return null");
    expect(cloudPanel).toContain('data-state={railVisualOpen ? "open" : "closed"}');
    expect(cloudPanel).toContain('marginRight: railLayoutOpen ? 0 : -toolsWidth');
    expect(cloudPanel).toContain('aria-hidden={!railVisualOpen} inert={!railVisualOpen}');
    expect(cloudPanel).toContain('const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220');
    expect(stylesSource).toContain(".smartbuild-code-panel");
    expect(stylesSource).toContain("transition: transform 220ms var(--ease-out), opacity 180ms var(--ease-out)");
    expect(stylesSource).toContain('.smartbuild-code-panel[data-state="closed"]');
    expect(stylesSource).toContain("transform: translate3d(100%, 0, 0)");
    expect(stylesSource).not.toContain('[data-testid="desktop-tools-toggle"][data-state="closed"]');
  });

  it("keeps existing saved files inspectable without starting new implementation runs", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(source).toContain('import { Bot, Braces, Check, CheckCircle2, Cloud');
    expect(cloudPanel).toContain('window.matchMedia("(min-width: 1280px)")');
    expect(cloudPanel).toContain("const [desktopToolsViewport, setDesktopToolsViewport]");
    expect(cloudPanel).toContain("const toolsVisible = toolsOpen;");
    expect(cloudPanel).toContain('desktopToolsViewport ? "relative hidden h-full min-w-[360px] border-l xl:flex xl:flex-col"');
    expect(cloudPanel).toContain('const [toolsOpen, setToolsOpen] = useState(false)');
    expect(cloudPanel).not.toContain('if (buildRun) setToolsOpen(true)');
    expect(cloudPanel).toContain("if (!buildRun || autoOpenedBuildRun.current === buildRun.id || !buildRun.artifacts.length) return");
    expect(cloudPanel).toContain("autoOpenedBuildRun.current === buildRun.id");
    expect(cloudPanel).toContain('setResultTab("code")');
    expect(source).not.toContain("autoOpenRunId");
    expect(source).not.toContain("smartbuild:code-panel-new-build");
    expect(source).not.toContain("newBuildCodeIntent");
    expect(cloudPanel).toContain("Saved files · view only");
    expect(cloudPanel).not.toContain("Waiting for the build agent to save its first source file.");
    expect(cloudPanel).not.toContain("Create Build Run file");
    expect(cloudPanel).not.toContain("Delete</button>");
    expect(cloudPanel).not.toContain("Save</button>");
    expect(cloudPanel).toMatch(/setFiles\(\[\]\);\s+setActivePath\(null\);\s+setContent\(""\);/);
    expect(composerSource).not.toContain('data-testid="composer-code"');
    expect(composerSource).not.toContain('Show Code & Preview');
    expect(composerSource).not.toContain('smartbuild:toggle-tools');
  });

  it("does not keep interactive implementation journey state in the chat", () => {
    expect(composerSource).not.toContain("journeyCompleted");
    expect(composerSource).not.toContain("journeyExpanded");
    expect(composerSource).not.toContain("Live Request Journey");
  });

  it("keeps project statistics out of the primary chat path and opens project discovery only on demand", () => {
    expect(discoverySource).toContain('data-testid="projects-panel-trigger"');
    expect(discoverySource).toContain("if (!open) return;");
    expect(discoverySource).not.toContain("const metrics = data ?");
    expect(discoverySource).not.toContain('aria-label="SmartBuild dashboard"');
    expect(imageCheckSource).toContain("Can this image be trusted?");
    expect(composerSource).not.toContain("smartbuild-float");
  });

  it("archives projects durably without deleting Build Runs and requires an explicit restore before reopening", () => {
    expect(discoverySource).toContain('const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active")');
    expect(discoverySource).toContain('`/api/workspace/discovery?status=${archiveFilter}`');
    expect(discoverySource).toContain('`/api/workspace/projects/${project.id}/${action}`');
    expect(discoverySource).toContain('archiveFilter === "archived" ? "restore" : "archive"');
    expect(discoverySource).toContain('disabled={archivedView}');
    expect(discoverySource).toContain("onProjectArchived(project.id)");
    expect(composerSource).toContain('"smartbuild:project-archived"');
    expect(source).toContain('window.addEventListener("smartbuild:project-archived", projectArchived)');
    expect(source).toContain("Project archived. Restore it from Projects to open it again.");
    expect(workspaceServerSource).toContain('app.post("/api/workspace/projects/:projectId/archive"');
    expect(workspaceServerSource).toContain('app.post("/api/workspace/projects/:projectId/restore"');
    expect(workspaceServerSource).toContain('listProjects(user.id, archive)');
    expect(databaseSource).toContain("export async function archiveProjectForUser");
    expect(databaseSource).toContain("export async function restoreArchivedProjectForUser");
    expect(databaseSource).toContain("archivedAt");
  });

  it("keeps long implementation code out of compact chat until the user explicitly asks to display it", () => {
    expect(composerSource).toContain("compactAssistantMessageForChat");
    expect(composerSource).toContain("priorUserAskedForCode");
    expect(compactChatSource).toContain("EXPLICIT_CODE_REQUEST");
    expect(composerSource).not.toContain('data-testid="chat-code-hidden"');
  });

  it("keeps an empty workspace informational and does not offer a new build", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).not.toContain("Start the first build for this workspace");
    expect(cloudPanel).not.toContain("Build something above");
    expect(cloudPanel).toContain("Project editing and publishing are disabled");
    expect(cloudPanel).not.toContain("This workspace has no traced Build Run yet");
  });

  it("does not invent a code proposal or approval when the selected Build Run has no persisted revision diff", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).toContain("No code changes yet.");
    expect(cloudPanel).toContain("A persisted revision diff will appear here only after the selected Build Run records one.");
    expect(cloudPanel).not.toContain(">Apply<");
  });

  it("keeps preview context visibly bound to the selected Build Run tuple and only reports a real scoped refresh", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).toContain('aria-label="Selected Build Run preview context"');
    expect(cloudPanel).toContain("project {buildRun.projectId} · conversation {buildRun.conversationId} · run {buildRun.id.slice(0, 8)}");
    expect(cloudPanel).toContain("Preview linked");
    expect(cloudPanel).toContain("Preview unavailable");
    expect(cloudPanel).toContain("Awaiting scoped refresh");
    expect(cloudPanel).toContain("setLastScopedRefreshAt(new Date().toISOString())");
  });

  it("refreshes Code and Preview from persisted updates of the selected Build Run rather than chat text", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    const restoreRun = source.slice(source.indexOf("// A hard reload can restore"), source.indexOf("const send = async"));
    expect(restoreRun).not.toContain('`/api/build-runs/${current.id}/resume`');
    expect(restoreRun).toContain("Build execution is disabled. This saved run and its existing files remain unchanged.");
    expect(cloudPanel).toContain('window.addEventListener("smartbuild:build-updated", refreshScopedBuildRun)');
    expect(cloudPanel).toContain("if (active && buildRun) void refresh();");
    expect(cloudPanel).toContain('request<{ files: CloudFile[] }>(`/api/build-runs/${buildRun.id}/files`)');
    expect(cloudPanel).toContain("const sourceFiles = sourceBuildFiles(dedupeCloudFiles(fileSet.files));");
    expect(cloudPanel).toContain('if (!activePath && sourceFiles[0]) await openFile(sourceFiles[0].path);');
    expect(cloudPanel).toContain("if (activePath && !sourceFiles.some(file => file.path === activePath))");
    expect(cloudPanel).toContain('if (codePanelRunScope.current !== requestedScope) return;');
    expect(cloudPanel).toContain('key={`${previewRunId || "no-build-run"}:${lastScopedRefreshAt || "initial"}`}');
    expect(cloudPanel).toContain('setSplitPreview(true);');
    expect(cloudPanel).toContain("Saved previews from historical runs remain available here.");
    expect(cloudPanel).toContain('aria-live="polite"');
  });

  it("does not create new build-status claims in conversation chat", () => {
    expect(composerSource).not.toContain('data-testid="pre-build-disclosure"');
    expect(composerSource).not.toContain("AIImageCheckEntry");
    expect(source).not.toContain("const buildMessage");
    expect(source).not.toContain('kind: "build-status"');
    expect(source).toContain('kind: "ask"');
  });

  it("treats restored history without durable Build-Run metadata as conversation only", () => {
    const restoration = source.slice(source.indexOf("void Promise.all([request<Array"), source.indexOf("const activateWorkspace"));

    expect(restoration).toContain('kind: "ask" as const');
    expect(restoration).toContain("const decoded = decodeMessageAttachments(message.content);");
    expect(restoration).toContain("const legacyFailure = message.role === \"assistant\"");
    expect(restoration).toContain("requestFailed: true");
    expect(restoration).toContain("setMessages(mergePendingBrowserReplies(restoredMessages, conversationId))");
    expect(restoration).toContain('kind: "ask" as const');
  });

  it("keeps Truth Engine hidden and unrequested until the server confirms the owner binding", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));
    const demoEntry = source.slice(source.indexOf("function DemoModeWorkspace"), source.indexOf("function WorkspacePreparationState"));

    expect(cloudPanel).toContain('request<TruthEngineReport>(`/api/workspace/truth-engine?projectId=${encodeURIComponent(String(buildRun.projectId))}&conversationId=${encodeURIComponent(String(buildRun.conversationId))}&buildRunId=${encodeURIComponent(buildRun.id)}`, { cache: "no-store" })');
    expect(cloudPanel).toContain('ownerBindingVerified ? request<TruthEngineReport>');
    expect(cloudPanel).toContain("{buildRun && ownerBindingVerified &&");
    expect(cloudPanel).toContain('{ownerBindingVerified && view === "truth"');
    expect(cloudPanel).toContain('setView("truth")');
    expect(cloudPanel).toContain("Truth Engine");
    expect(cloudPanel).toContain("<TruthEnginePanel report={truthReport} />");
    expect(source).toContain('ownerBindingVerified={legacyClaimState === "claimed"}');
    expect(demoEntry).not.toContain("Truth Engine");
    expect(demoEntry).not.toContain("/api/workspace/truth-engine");
  });

  it("renders Build-Run-scoped agent evidence separately from registry counts", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));
    const evidencePanel = source.slice(source.indexOf("function AgentEvidencePanel"), source.indexOf("function CloudWorkspacePanel"));

    expect(cloudPanel).toContain('request<{ files: CloudFile[] }>(`/api/build-runs/${buildRun.id}/files`)');
    expect(cloudPanel).toContain('request<{ path: string; content: string }>(`/api/build-runs/${buildRun.id}/file?path=${encodeURIComponent(filePath)}`)');
    expect(cloudPanel).toContain('request<AgentEvidenceResponse>(`/api/build-runs/${buildRun.id}/agents`)');
    expect(cloudPanel).toContain("setAgentEvidence(agents?.evidence || null)");
    expect(cloudPanel).toContain("Current canonical registry: 300 registered agents.");
    expect(cloudPanel).toContain("Historical agent details are shown for reference only. New implementation is disabled.");
    expect(cloudPanel).toContain("{buildRun.agentOrchestration?.selectedAgents.length ?? 0} selected");
    expect(cloudPanel).toContain("{buildRun.agentOrchestration?.skippedAgents.length ?? 0} skipped");
    expect(cloudPanel).toContain("capability profiles preserved in the historical record");
    expect(evidencePanel).toContain("Build-Run-scoped supervisor evidence");
    expect(evidencePanel).toContain("registry");
    expect(evidencePanel).toContain("selected");
    expect(evidencePanel).toContain("observed");
    expect(evidencePanel).toContain("skipped");
    expect(evidencePanel).toContain("traceObserved");
    expect(evidencePanel).toContain("Per-agent evidence");
    expect(evidencePanel).toContain("agent.sequence");
    expect(evidencePanel).toContain("agent.timestamp");
    expect(evidencePanel).toContain("Safe agent selection reason");
    expect(evidencePanel).toContain("Safe agent implementation fingerprint");
    expect(evidencePanel).toContain("Dry-run trace rows do not claim autonomous code-writing or live external work.");
  });

  it("uses only retained safe Agent event identities in the Build Run log view", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).toContain("const retainedSafeEvents");
    expect(cloudPanel).toContain('id: `agent:${agent.id}:${agent.sequence ?? "unsequenced"}`');
    expect(cloudPanel).toContain("agent.lastEvent");
    expect(cloudPanel).toContain("setLogs(retainedSafeEvents)");
    expect(cloudPanel).not.toContain("buildRun.evidence.map((entry, index)");
  });

  it("does not misrepresent Cloud checkpoint controls or diagnostics as selected-Run changes and logs", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).toContain("Build Run review: not reviewed · no owner approval is inferred.");
    expect(cloudPanel).toContain('data-testid="build-run-review"');
    expect(cloudPanel).toContain('aria-live="polite"');
    expect(cloudPanel).toContain("Owner approval applies only to this selected Build Run.");
    expect(cloudPanel).toContain("Feedback applies only to this selected Build Run.");
    expect(cloudPanel).toContain("Review state does not create a revision, rerun this Build, or modify artifacts.");
    expect(stylesSource).not.toContain("#build-run-changes .grid > section:nth-child(3)");
    expect(cloudPanel).toContain('`/api/build-runs/${buildRun.id}/review`');
    expect(cloudPanel).toContain("Build Run review scope mismatch.");
    expect(cloudPanel).toContain('data-testid="build-run-changes"');
    expect(cloudPanel).toContain("Selected Build Run change evidence");
    expect(cloudPanel).toContain("This panel only accepts a persisted revision record attached to this exact Build Run.");
    expect(cloudPanel).toContain("No global Git diff is shown as Build Run evidence.");
    expect(cloudPanel).toContain("no owner approval is inferred.");
    expect(cloudPanel).toContain("No task completion is inferred.");
    expect(cloudPanel).toContain("No code changes yet.");
    expect(cloudPanel).toContain("No retained run events yet.");
    expect(cloudPanel).toContain("safe event identifiers supplied by the selected Build Run’s agent evidence");
    expect(cloudPanel).toContain("Diffs, approval, and restore actions appear only when a dedicated tuple-scoped API provides them.");
    expect(cloudPanel).not.toContain("/api/cloud/diff");
    expect(cloudPanel).not.toContain("/api/cloud/rollback");
    expect(cloudPanel).not.toContain(">Restore<");
    expect(cloudPanel).not.toContain(">View diff<");
  });

  it("keeps review state constrained to the selected Build Run tuple", () => {
    const cloudPanel = source.slice(source.indexOf("function CloudWorkspacePanel"), source.indexOf("function ProjectWorkspace"));

    expect(cloudPanel).toContain("const [review, setReview]");
    expect(cloudPanel).toContain("const [reviewBusy, setReviewBusy]");
    expect(cloudPanel).toContain('`/api/build-runs/${buildRun.id}/review`');
    expect(cloudPanel).toContain('body: JSON.stringify({ status })');
    expect(cloudPanel).toContain("response.buildRunId !== buildRun.id");
    expect(cloudPanel).toContain("response.projectId !== buildRun.projectId");
    expect(cloudPanel).toContain("response.conversationId !== buildRun.conversationId");
    expect(cloudPanel).toContain("reviewResponse.buildRunId === buildRun.id");
    expect(cloudPanel).toContain("reviewResponse.projectId === buildRun.projectId");
    expect(cloudPanel).toContain("reviewResponse.conversationId === buildRun.conversationId");
    expect(cloudPanel).toContain('onClick={() => void updateReview("approved")}');
    expect(cloudPanel).toContain('onClick={() => void updateReview("changes_requested")}');
    expect(cloudPanel).toContain('onClick={() => void updateReview("unreviewed")}');
    expect(cloudPanel).toContain('aria-label="Approve selected Build Run"');
    expect(cloudPanel).toContain('aria-label="Request changes for selected Build Run"');
    expect(cloudPanel).toContain('aria-label="Clear selected Build Run review"');
    expect(cloudPanel).not.toContain("/api/cloud/approve");
  });
});
