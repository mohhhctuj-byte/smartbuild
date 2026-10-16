import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.VEYRA_E2E_URL ?? "http://127.0.0.1:3000";
const runFullFlow = process.env.VEYRA_E2E_FULL === "1";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await assert.doesNotReject(() => page.getByText("SmartBuild", { exact: true }).first().waitFor({ timeout: 15_000 }));
  await assert.doesNotReject(() => page.getByText("Cloud workspace", { exact: true }).first().waitFor({ timeout: 15_000 }));
  await assert.doesNotReject(() => page.getByRole("button", { name: /New Workspace/ }).waitFor({ timeout: 15_000 }));
  await assert.doesNotReject(() => page.getByPlaceholder("Describe your project or ask SmartBuild to build a real feature...").waitFor({ timeout: 15_000 }));
  await page.waitForFunction(() => {
    const textarea = document.querySelector('textarea[aria-label="Workspace build request"]');
    return textarea && !textarea.disabled;
  }, null, { timeout: 15_000 });
  let initialWorkspace = { projects: [], files: [] };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    initialWorkspace = await page.evaluate(async () => {
      const [projectsResponse, filesResponse] = await Promise.all([
        fetch("/api/workspace/projects", { credentials: "include" }),
        fetch("/api/cloud/files", { credentials: "include" }),
      ]);
      const projects = projectsResponse.ok ? await projectsResponse.json() : [];
      const filesPayload = filesResponse.ok ? await filesResponse.json() : { files: [] };
      const files = Array.isArray(filesPayload?.files) ? filesPayload.files : [];
      return { projects, files };
    });
    if (Array.isArray(initialWorkspace.projects) && initialWorkspace.projects.length > 0) break;
    await page.waitForTimeout(250);
  }
  assert.ok(Array.isArray(initialWorkspace.projects) && initialWorkspace.projects.length > 0, "First SmartBuild visit did not create a Cloud project");
  assert.ok(Array.isArray(initialWorkspace.files), "Cloud Files endpoint did not return a list");
  assert.equal(initialWorkspace.files.some(file => /^(agent_runtime|client|server|shared)(?:\/|$)/.test(String(file.path ?? ""))), false, "Files panel exposed internal application folders");
  const appearanceToggle = page.getByRole("button", { name: "Switch to light mode" });
  await appearanceToggle.hover();
  await page.getByText("Use light appearance", { exact: true }).waitFor({ timeout: 15_000 });
  await appearanceToggle.click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark") === false && localStorage.getItem("theme") === "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark") && localStorage.getItem("theme") === "dark");

  if (runFullFlow) {
    await page.getByRole("button", { name: /New Workspace/ }).click();
    await page.getByText("New Cloud workspace ready.", { exact: true }).waitFor({ timeout: 15_000 });
    const activeProject = await page.evaluate(async () => {
      const response = await fetch("/api/workspace/projects", { credentials: "include" });
      if (!response.ok) return null;
      const projects = await response.json();
      return typeof projects?.[0]?.id === "number" && typeof projects[0]?.name === "string" ? { id: projects[0].id, name: projects[0].name } : null;
    });
    assert.equal(typeof activeProject?.id, "number", "New Workspace did not create an active Cloud project");
    await page.waitForFunction(async projectId => {
      const [selectionResponse, conversationsResponse] = await Promise.all([
        fetch("/api/workspace/selection", { credentials: "include" }),
        fetch(`/api/workspace/projects/${projectId}/conversations`, { credentials: "include" }),
      ]);
      const selection = selectionResponse.ok ? await selectionResponse.json() : null;
      const conversations = conversationsResponse.ok ? await conversationsResponse.json() : [];
      return selection?.selection?.projectId === projectId
        && conversations.some(conversation => conversation.id === selection?.selection?.conversationId);
    }, activeProject.id, { timeout: 30_000 });
    await page.getByRole("region", { name: "SmartBuild dashboard" }).waitFor({ timeout: 15_000 });
    await page.getByText("Projects", { exact: true }).first().waitFor({ timeout: 15_000 });
    assert.equal(await page.getByPlaceholder("Search projects or project details").count(), 0, "Project search should not be visible.");
    assert.equal(await page.getByRole("button", { name: "Filters" }).count(), 0, "Project filters should not be visible.");
    const projectRow = page.getByRole("row").filter({ hasText: activeProject.name }).last();
    await projectRow.click();
    await page.getByRole("dialog").getByText(activeProject.name, { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sort projects by Project" }).click();
    await page.waitForFunction(() => {
      const textarea = document.querySelector('textarea[aria-label="Workspace build request"]');
      return textarea && !textarea.disabled;
    }, null, { timeout: 15_000 });
    const csvReport = page.getByRole("button", { name: "Download project report as CSV" });
    const pdfReport = page.getByRole("button", { name: "Download project report as PDF" });
    await csvReport.waitFor({ timeout: 15_000 });
    await pdfReport.waitFor({ timeout: 15_000 });
    await csvReport.hover();
    await page.getByText("Download a CSV activity report", { exact: true }).waitFor({ timeout: 15_000 });
    const csvDownload = page.waitForEvent("download");
    await csvReport.click();
    assert.match((await csvDownload).suggestedFilename(), /-report\.csv$/);
    await page.getByText("CSV project report downloaded.", { exact: true }).waitFor({ timeout: 15_000 });
    const pdfDownload = page.waitForEvent("download");
    await pdfReport.click();
    assert.match((await pdfDownload).suggestedFilename(), /-report\.pdf$/);
    await page.getByText("PDF project report downloaded.", { exact: true }).waitFor({ timeout: 15_000 });
    const buildPayload = await page.evaluate(async () => {
      const selectionResponse = await fetch("/api/workspace/selection", { credentials: "include" });
      const selectionPayload = await selectionResponse.json();
      const selection = selectionPayload?.selection;
      if (!selection?.projectId || !selection?.conversationId) throw new Error("No persisted workspace selection is available for the build request.");
      const response = await fetch("/api/build-runs", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: selection.projectId,
          conversationId: selection.conversationId,
          request: "Build a responsive SaaS landing page",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || payload?.run?.error?.message || `Build request returned ${response.status}`);
      return payload;
    });
    const initialRun = buildPayload?.run;
    assert.ok(initialRun?.id, "Build request did not return a tracked Build Run identifier");
    assert.ok(["planned", "writing", "previewing", "testing", "evaluating", "checkpointing", "succeeded", "failed", "blocked", "timed_out", "cancelled"].includes(initialRun.status), "Build request returned an invalid tracked Build Run state");
    const verifiedRun = await page.evaluate(async buildId => {
      const terminal = new Set(["succeeded", "failed", "blocked", "timed_out", "cancelled"]);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const response = await fetch(`/api/build-runs/${buildId}/resume`, { method: "POST", credentials: "include" });
        if (!response.ok) throw new Error(`Tracked Build Run lookup returned ${response.status}`);
        const payload = await response.json();
        if (terminal.has(payload?.run?.status)) return payload.run;
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      throw new Error("Tracked SaaS Build Run did not reach a terminal state within 90 seconds");
    }, initialRun.id);
    assert.equal(verifiedRun?.status, "succeeded", "SaaS build did not reach a verified terminal success state");
    assert.ok(verifiedRun?.preview?.proxyUrl, "Verified SaaS build did not return a preview URL");
    assert.ok(["checkpointed_git", "checkpointed_snapshot"].includes(verifiedRun?.checkpoint?.type), "Verified SaaS build did not return an honest checkpoint type");
    await page.waitForFunction(async projectId => {
      const response = await fetch(`/api/workspace/projects/${projectId}/files`, { credentials: "include" });
      if (!response.ok) return false;
      const files = await response.json();
      return Array.isArray(files) && files.some(file => file.path === "index.html") && files.some(file => file.path === "styles.css");
    }, activeProject.id, { timeout: 60_000 });
    const previewUrl = new URL(verifiedRun.preview.proxyUrl, page.url()).toString();
    const cssUrl = new URL("styles.css", previewUrl.endsWith("/") ? previewUrl : `${previewUrl}/`).toString();
    const cssResponse = await page.request.get(cssUrl);
    assert.equal(cssResponse.status(), 200, "Preview styles.css did not return HTTP 200");
    assert.match(cssResponse.headers()["content-type"] || "", /^text\/css\b/i, "Preview styles.css did not return text/css");
    assert.ok((await cssResponse.body()).byteLength > 0, "Preview styles.css response was empty");
    const computedPreview = await page.evaluate(async url => {
      const frame = document.createElement("iframe");
      frame.setAttribute("title", "Verified preview style check");
      frame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;visibility:hidden;pointer-events:none";
      document.body.append(frame);
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Preview iframe timed out.")), 30_000);
        frame.addEventListener("load", () => { window.clearTimeout(timeout); resolve(undefined); }, { once: true });
        frame.src = url;
      });
      const doc = frame.contentDocument;
      if (!doc?.body) throw new Error("Preview iframe has no document body.");
      const body = doc.body;
      const hero = doc.querySelector(".hero");
      const button = doc.querySelector(".button");
      const grid = doc.querySelector(".grid");
      const bodyStyle = getComputedStyle(body);
      const heroStyle = hero ? getComputedStyle(hero) : null;
      const buttonStyle = button ? getComputedStyle(button) : null;
      const gridStyle = grid ? getComputedStyle(grid) : null;
      const result = {
        bodyBackground: bodyStyle.backgroundImage,
        heroPaddingTop: heroStyle?.paddingTop || "",
        buttonDisplay: buttonStyle?.display || "",
        buttonBackground: buttonStyle?.backgroundColor || "",
        gridDisplay: gridStyle?.display || "",
      };
      frame.remove();
      return result;
    }, previewUrl);
    assert.notEqual(computedPreview.bodyBackground, "none", "Preview body styles were not applied");
    assert.notEqual(computedPreview.heroPaddingTop, "0px", "Preview hero styles were not applied");
    assert.equal(computedPreview.buttonDisplay, "inline-flex", "Preview button styles were not applied");
    assert.notEqual(computedPreview.buttonBackground, "rgba(0, 0, 0, 0)", "Preview button background styles were not applied");
    assert.equal(computedPreview.gridDisplay, "grid", "Preview layout styles were not applied");
    const durableBeforeReload = await page.evaluate(async () => {
      const response = await fetch("/api/workspace/selection", { credentials: "include" });
      return response.ok ? response.json() : null;
    });
    assert.equal(durableBeforeReload?.selection?.projectId, activeProject.id, "Active project selection was not persisted before reload");
    assert.equal(durableBeforeReload?.selection?.buildRunId, verifiedRun.id, "Verified build selection was not persisted before reload");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(verifiedRun.contract.projectName, { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByText("Build succeeded", { exact: true }).waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "Logs", exact: true }).click();
    await page.getByText("evidence/test-output.json", { exact: false }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await page.getByText("Selective agent plan", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("70 registered specialists", { exact: false }).waitFor({ timeout: 30_000 });
    await page.getByText("Sequential task graph", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("evidence/agent-plan.json", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Evaluators", exact: true }).click();
    await page.getByText("Synthetic user evaluation", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("Functional synthetic user", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("Visual synthetic user", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("evidence/evaluators/synthetic-evaluation.json", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /Bugs/ }).click();
    await page.getByText("No confirmed evaluator bugs", { exact: true }).waitFor({ timeout: 30_000 });
    const evaluatorApi = await page.evaluate(async ({ buildId, projectId }) => {
      const readJson = async path => {
        const response = await fetch(path, { credentials: "include" });
        const contentType = response.headers.get("content-type") || "";
        const body = await response.json().catch(() => null);
        return { status: response.status, contentType, body };
      };
      const evaluators = await readJson(`/api/build-runs/${buildId}/evaluators`);
      const bugs = await readJson(`/api/build-runs/${buildId}/bugs`);
      const evidence = await readJson(`/api/build-runs/${buildId}/evidence`);
      const firstBug = Array.isArray(bugs.body?.bugs) ? bugs.body.bugs[0] : null;
      const detail = await readJson(firstBug?.bug_id
        ? `/api/bugs/${encodeURIComponent(firstBug.bug_id)}?projectId=${projectId}`
        : `/api/bugs/not-a-real-evaluator-bug?projectId=${projectId}`);
      return { evaluators, bugs, evidence, detail };
    }, { buildId: verifiedRun.id, projectId: activeProject.id });
    for (const response of Object.values(evaluatorApi)) {
      assert.match(response.contentType, /^application\/json\b/i, "Evaluator API returned a non-JSON response");
    }
    assert.equal(evaluatorApi.evaluators.status, 200, "Evaluator summary API did not return success");
    assert.equal(evaluatorApi.bugs.status, 200, "Evaluator bugs API did not return success");
    assert.equal(evaluatorApi.evidence.status, 200, "Evaluator evidence API did not return success");
    assert.ok(Array.isArray(evaluatorApi.evaluators.body?.evaluation?.runs) && evaluatorApi.evaluators.body.evaluation.runs.length === 2, "Evaluator API did not retain both serial evaluator runs");
    assert.equal(evaluatorApi.detail.status, 404, "Missing evaluator bug did not return a JSON 404");
    assert.match(evaluatorApi.detail.body?.error || "", /not found/i, "Missing evaluator bug response was not structured JSON");
    const durableAfterReload = await page.evaluate(async () => {
      const response = await fetch("/api/workspace/selection", { credentials: "include" });
      return response.ok ? response.json() : null;
    });
    assert.equal(durableAfterReload?.selection?.projectId, activeProject.id, "Reload selected a different project");
    assert.equal(durableAfterReload?.selection?.buildRunId, verifiedRun.id, "Reload lost the verified build run");
    const recoveredPreview = await page.request.get(previewUrl);
    assert.equal(recoveredPreview.status(), 200, "Reloaded workspace preview did not restart or respond");
    const exportDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export", exact: true }).click();
    assert.equal((await exportDownload).suggestedFilename(), "smartbuild-cloud-workspace.zip", "Workspace export used a stale or incorrect filename");

    const contactTerminal = await page.evaluate(async () => {
      const selectionResponse = await fetch("/api/workspace/selection", { credentials: "include" });
      const selectionPayload = await selectionResponse.json();
      const response = await fetch("/api/build-runs", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: selectionPayload.selection.projectId,
          conversationId: selectionPayload.selection.conversationId,
          request: "Build a contact page with a real form. Validate name, email, and message fields, show real validation errors, submit to a backend endpoint, save the submission in the project database, and create Playwright tests. Do not use mock data or fake success messages.",
        }),
      });
      return { status: response.status, payload: await response.json() };
    });
    assert.equal(contactTerminal.status, 202, "Contact build did not return an accepted tracked Build Run");
    assert.ok(contactTerminal.payload?.run?.id, "Contact build did not return a tracked Build Run identifier");
    const contactRun = await page.evaluate(async buildId => {
      const terminal = new Set(["succeeded", "failed", "blocked", "timed_out", "cancelled"]);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const response = await fetch(`/api/build-runs/${buildId}/resume`, { method: "POST", credentials: "include" });
        if (!response.ok) throw new Error(`Tracked contact Build Run lookup returned ${response.status}`);
        const payload = await response.json();
        if (terminal.has(payload?.run?.status)) return payload.run;
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      throw new Error("Tracked contact Build Run did not reach a terminal state within 90 seconds");
    }, contactTerminal.payload.run.id);
    assert.ok(["succeeded", "blocked", "failed", "cancelled", "timed_out"].includes(contactRun?.status), "Contact build did not return a terminal tracked state");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(async buildId => {
      const response = await fetch("/api/workspace/selection", { credentials: "include" });
      const data = response.ok ? await response.json() : null;
      return data?.selection?.buildRunId === buildId && ["succeeded", "blocked", "failed", "cancelled", "timed_out"].includes(data?.run?.status);
    }, contactRun.id, { timeout: 60_000 });
  }

  console.log(`SmartBuild E2E ${runFullFlow ? "full-flow" : "smoke"} passed at ${baseUrl}`);
} finally {
  await browser.close();
}
