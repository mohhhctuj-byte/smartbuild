import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";

const baseUrl = process.env.DEMO_BASE_URL || "http://127.0.0.1:3001";
const outputPath = "/tmp/smartbuild-demo-workspace.png";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const apiRequests = [];

page.on("request", request => {
  const url = new URL(request.url());
  if (url.origin === baseUrl && url.pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${url.pathname}`);
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const demoLogin = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo-login", { method: "POST", credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  if (demoLogin.status !== 200 || demoLogin.body?.state !== "demo" || typeof demoLogin.body?.expiresAt !== "string") throw new Error("Demo login did not create an isolated demo session");

  apiRequests.length = 0;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Demo Workspace — synthetic data only.").waitFor();
  await page.getByText("Orbit Notes evaluation workspace").waitFor();

  const requiredTabs = ["Chat", "Plan", "Build", "Code", "Preview", "Tests", "Logs", "Changes", "Agents", "Evaluators", "Bugs", "Checkpoints", "Export"];
  for (const tab of requiredTabs) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(20);
  }

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByLabel("Synthetic sample prompt").fill("Create a fictional product landing page.");
  await page.getByRole("button", { name: "Send sample prompt" }).click();
  await page.getByText("Fictional delivery plan").waitFor();

  await page.getByRole("button", { name: /Run synthetic build/ }).click();
  await page.getByText("Synthetic build complete. The demo files below are in-memory fixtures only.").waitFor();
  await page.getByText("Synthetic source files").waitFor();

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Start exploring" }).click();
  await page.getByText("Synthetic CTA selected. No navigation, analytics, or external request occurred.").waitFor();

  await page.getByRole("button", { name: "Tests", exact: true }).click();
  await page.getByRole("button", { name: /Run synthetic tests/ }).click();
  await page.getByText("Synthetic tests passed. Evidence is illustrative and is not persisted.").waitFor();
  await page.getByText("PASS", { exact: true }).first().waitFor();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download synthetic manifest" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "smartbuild-demo-synthetic-manifest.json") throw new Error("Unexpected synthetic export filename");
  const downloadPath = await download.path();
  const manifest = JSON.parse(await readFile(downloadPath, "utf8"));
  if (manifest.kind !== "smartbuild-synthetic-demo-export" || manifest.buildRun !== "demo-run-synthetic-v1") throw new Error("Synthetic export did not contain the expected local-only manifest");

  await page.screenshot({ path: outputPath, fullPage: true });
  const forbiddenApiRequest = apiRequests.find(entry => !entry.endsWith(" /api/auth/status"));
  if (forbiddenApiRequest) throw new Error(`Demo Workspace requested a disallowed API route: ${forbiddenApiRequest}`);

  console.log(JSON.stringify({ status: "pass", tabs: requiredTabs, allowedApiRequests: apiRequests, screenshot: outputPath, export: download.suggestedFilename() }, null, 2));
} finally {
  await browser.close();
}
