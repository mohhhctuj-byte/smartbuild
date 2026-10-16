import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const relativeEvidence = (name) => `evidence/evaluators/${name}`;
const launchTimeoutRaw = Number(process.env.SMARTBUILD_CHROMIUM_LAUNCH_TIMEOUT_MS);
const launchTimeoutMs = Number.isFinite(launchTimeoutRaw) ? Math.min(Math.max(Math.floor(launchTimeoutRaw), 1_000), 90_000) : 45_000;
const makeFinding = (input, patch) => ({
  category: patch.category,
  title: patch.title,
  severity: patch.severity || "medium",
  confidence: patch.confidence ?? 0.9,
  route: patch.route || (input.previewUrl ? new URL(input.previewUrl).pathname : "/"),
  reproducible: true,
  stepsToReproduce: patch.stepsToReproduce || [],
  expectedResult: patch.expectedResult || "The requested browser behavior is usable.",
  actualResult: patch.actualResult || "The browser check observed a defect.",
  selectorOrTarget: patch.selectorOrTarget,
  evidencePaths: patch.evidencePaths || [],
  consoleErrors: patch.consoleErrors || [],
  networkFailures: patch.networkFailures || [],
  screenshotPaths: patch.screenshotPaths || [],
  tracePath: patch.tracePath,
});

async function functional(input, browser) {
  const traceName = "functional-trace.zip";
  const detailsName = "functional-findings.json";
  const tracePath = path.join(input.evidenceRoot, traceName);
  const detailsPath = path.join(input.evidenceRoot, detailsName);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const networkFailures = [];
  const successfulPosts = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500)); });
  page.on("requestfailed", request => networkFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`.slice(0, 600)));
  page.on("response", response => {
    if (response.status() >= 400) {
      networkFailures.push(`${response.request().method()} ${response.url()} HTTP ${response.status()}`.slice(0, 600));
    }
  });
  page.on("response", response => { if (response.request().method() === "POST" && response.ok()) successfulPosts.push({ url: response.url(), status: response.status() }); });
  // Preserve a compact functional trace without DOM snapshots, which can consume
  // substantial transient memory in the 512 MiB Autoscale runtime.
  await page.context().tracing.start({ screenshots: true, snapshots: false, sources: false });
  const findings = [];
  const actions = [];
  const requirementText = (input.acceptanceCriteria || []).map(item => `${item.id || ""} ${item.title || ""}`).join(" ").toLowerCase();
  const requiresForm = input.template === "contact-form" || /form|validation|contact/.test(requirementText);
  try {
    await page.goto(input.previewUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    actions.push({ route: new URL(page.url()).pathname, step: "open-preview", passed: true });
    const links = await page.locator("a[href]").evaluateAll(items => items.map(item => ({ href: item.getAttribute("href") || "", text: (item.textContent || "").trim().slice(0, 100) })));
    for (const link of links) {
      if (link.href === "#") {
        findings.push(makeFinding(input, { category: "functional", title: "Required link has a fake href target", severity: "high", selectorOrTarget: "a[href='#']", expectedResult: "A required navigation link has a real route or fragment target.", actualResult: `The link \"${link.text || "unnamed"}\" uses href=\"#\".`, stepsToReproduce: ["Open the generated preview.", `Inspect or activate the link \"${link.text || "unnamed"}\".`], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
      } else if (link.href.startsWith("#")) {
        const count = await page.locator(link.href).count();
        actions.push({ route: new URL(page.url()).pathname, step: `fragment:${link.href}`, passed: count > 0 });
        if (!count) findings.push(makeFinding(input, { category: "functional", title: "Navigation fragment target is missing", severity: "medium", selectorOrTarget: link.href, expectedResult: "The fragment target exists in the page.", actualResult: `The link points to ${link.href}, but no matching element exists.`, stepsToReproduce: ["Open the preview.", `Activate the link to ${link.href}.`], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
        if (count) {
          await page.locator(`a[href="${link.href.replace(/"/g, "\\\"")}"]`).first().click();
          const targetVisible = await page.locator(link.href).evaluate(element => { const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < window.innerHeight; });
          actions.push({ route: new URL(page.url()).pathname, step: `activate:${link.href}`, passed: targetVisible });
          if (!targetVisible) findings.push(makeFinding(input, { category: "usability", title: "Navigation link did not reveal its target", severity: "medium", selectorOrTarget: link.href, expectedResult: "Activating navigation brings the referenced section into view.", actualResult: `The target ${link.href} exists but is not visible after activation.`, stepsToReproduce: ["Open the preview.", `Activate the link to ${link.href}.`], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
        }
      }
    }
    const form = page.locator("form");
    if (requiresForm && !(await form.count())) {
      findings.push(makeFinding(input, { category: "functional", title: "Required form is absent from the preview", severity: "high", selectorOrTarget: "form", expectedResult: "The requested interactive form is present.", actualResult: "Acceptance criteria require a form but no form element was found.", stepsToReproduce: ["Open the generated preview."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
    }
    if (await form.count()) {
      const submit = form.getByRole("button", { name: /send|submit/i });
      if (await submit.count()) {
        await submit.click();
        const visibleErrors = await page.locator("[data-error-for]").evaluateAll(items => items.filter(item => !item.hidden && (item.textContent || "").trim()).length);
        actions.push({ route: new URL(page.url()).pathname, step: "invalid-form-submission", passed: visibleErrors > 0 });
        if (!visibleErrors) findings.push(makeFinding(input, { category: "functional", title: "Invalid form submission has no visible validation error", severity: "high", selectorOrTarget: "form", expectedResult: "Invalid values reveal accessible validation feedback.", actualResult: "The submit action completed without a visible field error.", stepsToReproduce: ["Open the preview.", "Submit the required form with empty values."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
        const canFill = await page.locator("#name, #email, #message").count() >= 3;
        if (canFill) {
          await page.locator("#name").fill("Synthetic User");
          await page.locator("#email").fill("synthetic@example.test");
          await page.locator("#message").fill("This is a verified synthetic-user test submission.");
          await submit.click();
          await page.waitForTimeout(250);
          const status = await page.locator("#form-status").textContent().catch(() => "");
          const posted = successfulPosts.some(item => item.url.includes("/api/contact"));
          actions.push({ route: new URL(page.url()).pathname, step: "valid-form-submission", passed: /received|success/i.test(status || "") && posted });
          if (/received|success/i.test(status || "") && !posted) findings.push(makeFinding(input, { category: "functional", title: "Form shows success without a successful backend request", severity: "critical", selectorOrTarget: "#form-status", expectedResult: "A success message follows a successful backend response.", actualResult: "The page showed success but no successful POST /api/contact response was observed.", stepsToReproduce: ["Fill valid contact values.", "Submit the form.", "Observe the success message and network activity."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName), networkFailures }));
          if (!/received|success/i.test(status || "") || !posted) findings.push(makeFinding(input, { category: "functional", title: "Valid form submission did not complete", severity: "high", selectorOrTarget: "#contact-form", expectedResult: "A valid form submission reaches the backend and confirms completion.", actualResult: `Status text was \"${(status || "").trim()}\" and successful contact POST was ${posted}.`, stepsToReproduce: ["Fill valid contact values.", "Submit the form."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName), networkFailures }));
        }
      }
    }
    if (input.backendUrl && input.template === "contact-form") {
      const invalidResponse = await fetch(new URL("/api/contact", input.backendUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", email: "invalid", message: "" }) });
      const invalidBody = await invalidResponse.text();
      actions.push({ route: "/api/contact", step: "invalid-api-contract", passed: invalidResponse.status === 422 && invalidBody.length > 0 });
      if (invalidResponse.status !== 422 || !invalidBody.length) findings.push(makeFinding(input, { category: "api", title: "Contact API invalid-input contract failed", severity: "high", selectorOrTarget: "POST /api/contact", expectedResult: "Invalid contact data returns a structured HTTP 422 response.", actualResult: `Received HTTP ${invalidResponse.status} with ${invalidBody.length} response bytes.`, stepsToReproduce: ["POST invalid name, email, and message values to /api/contact."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
      if (input.testToken) {
        const stored = await fetch(new URL("/api/__test__/contact-submissions", input.backendUrl), { headers: { "x-smartbuild-test-token": input.testToken } });
        const storedBody = await stored.json().catch(() => null);
        const persisted = stored.ok && Number(storedBody?.count || 0) > 0;
        actions.push({ route: "/api/__test__/contact-submissions", step: "database-persistence", passed: persisted });
        if (!persisted) findings.push(makeFinding(input, { category: "database", title: "Valid contact submission was not persisted", severity: "high", selectorOrTarget: "contact_submissions", expectedResult: "The database inspection proves a persisted valid submission.", actualResult: `Inspection returned HTTP ${stored.status} with count ${storedBody?.count ?? "unknown"}.`, stepsToReproduce: ["Submit a valid contact form.", "Inspect the token-gated project database test endpoint."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName) }));
      }
    }
    if (networkFailures.length) {
      findings.push(makeFinding(input, {
        category: "runtime",
        title: "Preview emitted failed HTTP responses",
        severity: "high",
        expectedResult: "All resources requested by the preview return successful HTTP responses.",
        actualResult: networkFailures.slice(0, 3).join("; "),
        stepsToReproduce: ["Open the generated preview.", "Inspect browser network responses."],
        evidencePaths: [relativeEvidence(detailsName)],
        tracePath: relativeEvidence(traceName),
        networkFailures,
      }));
    }
    if (consoleErrors.length) {
      findings.push(makeFinding(input, {
        category: "runtime",
        title: "Preview emitted browser console errors",
        severity: "high",
        expectedResult: "The preview runs without browser console errors.",
        actualResult: consoleErrors.slice(0, 3).join("; "),
        stepsToReproduce: ["Open the generated preview.", "Inspect the browser console."],
        evidencePaths: [relativeEvidence(detailsName)],
        tracePath: relativeEvidence(traceName),
        consoleErrors,
      }));
    }
  } catch (error) {
    findings.push(makeFinding(input, { category: "functional", title: "Functional synthetic user could not complete the preview journey", severity: "high", confidence: 1, expectedResult: "The preview loads and required user journeys run.", actualResult: error instanceof Error ? error.message : String(error), stepsToReproduce: ["Open the generated preview."], evidencePaths: [relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName), consoleErrors, networkFailures }));
  } finally {
    await page.context().tracing.stop({ path: tracePath }).catch(() => undefined);
    await page.close().catch(() => undefined);
  }
  await writeFile(detailsPath, JSON.stringify({ evaluator: "functional_synthetic_user", actions, consoleErrors, networkFailures, findings }, null, 2));
  return { evaluatorInstance: "functional_synthetic_user", status: findings.length ? "FAILED" : "PASS", route: input.previewUrl ? new URL(input.previewUrl).pathname : "/", step: actions.at(-1)?.step || "open-preview", actions, findings, evidencePaths: [relativeEvidence(traceName), relativeEvidence(detailsName)], tracePath: relativeEvidence(traceName), consoleErrors, networkFailures };
}

async function visual(input, browser) {
  const detailsName = "visual-findings.json";
  const detailsPath = path.join(input.evidenceRoot, detailsName);
  const viewports = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "mobile", width: 375, height: 812 }];
  const findings = [];
  const screenshots = [];
  const viewportData = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const viewportFailures = [];
    page.on("response", response => {
      if (response.status() >= 400) viewportFailures.push(`${response.request().method()} ${response.url()} HTTP ${response.status()}`.slice(0, 600));
    });
    try {
      await page.goto(input.previewUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const screenshotName = `visual-${viewport.name}.png`;
      await page.screenshot({ path: path.join(input.evidenceRoot, screenshotName), fullPage: true });
      screenshots.push(relativeEvidence(screenshotName));
      const inspection = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        stylesheetCount: document.styleSheets.length,
        bodyBackgroundImage: getComputedStyle(document.body).backgroundImage,
        bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
        brokenImages: Array.from(document.images).filter(image => !image.complete || image.naturalWidth === 0).map(image => image.currentSrc || image.src),
        overlays: Array.from(document.querySelectorAll("body *")).filter(element => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return (style.position === "fixed" || style.position === "sticky") && box.width * box.height > window.innerWidth * window.innerHeight * .8 && style.visibility !== "hidden"; }).length,
        tinyTargets: Array.from(document.querySelectorAll("a,button,input,textarea,select")).filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (box.width < 24 || box.height < 24); }).map(element => element.tagName.toLowerCase() + (element.id ? `#${element.id}` : "")),
      }));
      viewportData.push({ viewport, ...inspection });
      if (viewportFailures.length) {
        findings.push(makeFinding(input, {
          category: "runtime",
          title: "Preview emitted failed HTTP responses",
          severity: "high",
          expectedResult: "All resources requested by the preview return successful HTTP responses.",
          actualResult: viewportFailures.slice(0, 3).join("; "),
          stepsToReproduce: [`Open the preview at ${viewport.width}×${viewport.height}.`, "Inspect browser network responses."],
          evidencePaths: [relativeEvidence(detailsName), relativeEvidence(screenshotName)],
          screenshotPaths: [relativeEvidence(screenshotName)],
          networkFailures: viewportFailures,
        }));
      }
      if (inspection.scrollWidth > inspection.clientWidth + 1) findings.push(makeFinding(input, { category: "responsive", title: "Horizontal overflow at responsive viewport", severity: viewport.name === "mobile" ? "high" : "medium", confidence: 1, selectorOrTarget: "document.documentElement", expectedResult: "The page fits within the viewport without horizontal scrolling.", actualResult: `scrollWidth ${inspection.scrollWidth} exceeds clientWidth ${inspection.clientWidth} at ${viewport.name}.`, stepsToReproduce: [`Open the preview at ${viewport.width}×${viewport.height}.`, "Inspect horizontal scrolling."], evidencePaths: [relativeEvidence(detailsName), relativeEvidence(screenshotName)], screenshotPaths: [relativeEvidence(screenshotName)] }));
      const hasVisibleBackground = inspection.bodyBackgroundImage !== "none" || !["transparent", "rgba(0, 0, 0, 0)"].includes(inspection.bodyBackgroundColor);
      if (inspection.stylesheetCount === 0 || !hasVisibleBackground) findings.push(makeFinding(input, { category: "visual", title: "Essential local CSS appears missing", severity: "high", confidence: .98, selectorOrTarget: "body", expectedResult: "The preview loads at least one stylesheet and a visible background.", actualResult: `Found ${inspection.stylesheetCount} stylesheets, image ${inspection.bodyBackgroundImage || "none"}, and color ${inspection.bodyBackgroundColor || "transparent"}.`, stepsToReproduce: [`Open the preview at ${viewport.width}×${viewport.height}.`], evidencePaths: [relativeEvidence(detailsName), relativeEvidence(screenshotName)], screenshotPaths: [relativeEvidence(screenshotName)] }));
      if (inspection.brokenImages.length) findings.push(makeFinding(input, { category: "visual", title: "Broken image resource detected", severity: "medium", confidence: 1, selectorOrTarget: "img", expectedResult: "Every visible image has loaded pixels.", actualResult: `${inspection.brokenImages.length} image resources failed to load.`, stepsToReproduce: [`Open the preview at ${viewport.width}×${viewport.height}.`], evidencePaths: [relativeEvidence(detailsName), relativeEvidence(screenshotName)], screenshotPaths: [relativeEvidence(screenshotName)] }));
      if (inspection.tinyTargets.length) findings.push(makeFinding(input, { category: "usability", title: "Interactive target is too small for reliable use", severity: "medium", confidence: .95, selectorOrTarget: inspection.tinyTargets.join(", "), expectedResult: "Visible interactive controls are at least 24×24 CSS pixels.", actualResult: `Tiny targets: ${inspection.tinyTargets.join(", ")}.`, stepsToReproduce: [`Open the preview at ${viewport.width}×${viewport.height}.`], evidencePaths: [relativeEvidence(detailsName), relativeEvidence(screenshotName)], screenshotPaths: [relativeEvidence(screenshotName)] }));
    } catch (error) {
      findings.push(makeFinding(input, { category: "visual", title: "Visual synthetic user could not inspect a viewport", severity: "high", confidence: 1, expectedResult: "The preview renders at the requested viewport.", actualResult: error instanceof Error ? error.message : String(error), stepsToReproduce: [`Open the preview at ${viewport.width}×${viewport.height}.`], evidencePaths: [relativeEvidence(detailsName)] }));
    } finally { await page.close().catch(() => undefined); }
  }
  await writeFile(detailsPath, JSON.stringify({ evaluator: "visual_synthetic_user", viewports: viewportData, findings, screenshots }, null, 2));
  return { evaluatorInstance: "visual_synthetic_user", status: findings.length ? "FAILED" : "PASS", route: input.previewUrl ? new URL(input.previewUrl).pathname : "/", step: "responsive-viewport-inspection", actions: viewportData.map(item => ({ route: "/", step: `${item.viewport.name}-viewport`, passed: true })), findings, evidencePaths: [relativeEvidence(detailsName), ...screenshots], screenshotPaths: screenshots, consoleErrors: [], networkFailures: [] };
}

const main = async () => {
  const input = await readStdin();
  await mkdir(input.evidenceRoot, { recursive: true });
  const selectedEvaluator = input.evaluator;
  if (!input.previewUrl) {
    process.stdout.write(JSON.stringify({ ok: true, functional: { evaluatorInstance: "functional_synthetic_user", status: "SKIPPED", route: null, step: null, actions: [], findings: [], evidencePaths: [], skipReason: "no_browser_preview" }, visual: { evaluatorInstance: "visual_synthetic_user", status: "SKIPPED", route: null, step: null, actions: [], findings: [], evidencePaths: [], skipReason: "no_browser_preview" } }) + "\n");
    return;
  }
  let browser;
  try {
    const executablePath = process.env.CHROMIUM_PATH
      || (process.platform === "win32"
        ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
        ].find(candidate => candidate && existsSync(candidate))
        : "/usr/bin/chromium");
    browser = await chromium.launch({
      headless: true,
      executablePath,
      timeout: launchTimeoutMs,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-zygote",
        "--js-flags=--max-old-space-size=96",
        "--disable-features=BackForwardCache,IsolateOrigins,PaintHolding,Translate",
        "--renderer-process-limit=1",
      ],
    });
    const functionalResult = selectedEvaluator === "visual_synthetic_user" ? undefined : await functional(input, browser);
    if (!selectedEvaluator || selectedEvaluator === "functional_synthetic_user") await writeFile(path.join(input.evidenceRoot, "progress.json"), JSON.stringify({ state: "running", activeEvaluator: "visual_synthetic_user", updatedAt: new Date().toISOString(), detail: "Functional synthetic user completed; visual synthetic user is queued for its next persisted Build Run step." }, null, 2));
    const visualResult = selectedEvaluator === "functional_synthetic_user" ? undefined : await visual(input, browser);
    process.stdout.write(JSON.stringify({ ok: true, functional: functionalResult, visual: visualResult }) + "\n");
  } catch {
    await writeFile(path.join(input.evidenceRoot, "browser-runner-startup.json"), JSON.stringify({ status: "FAILED", code: "SYNTHETIC_BROWSER_RUNNER_STARTUP_FAILED", completedAt: new Date().toISOString() }, null, 2));
    process.stdout.write(JSON.stringify({ ok: false, error: "SYNTHETIC_BROWSER_RUNNER_STARTUP_FAILED" }) + "\n");
    process.exitCode = 1;
  } finally { await browser?.close().catch(() => undefined); }
};

main().catch(() => { process.stdout.write(JSON.stringify({ ok: false, error: "SYNTHETIC_BROWSER_RUNNER_FAILED" }) + "\n"); process.exitCode = 1; });
