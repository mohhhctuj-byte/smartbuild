import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.VEYRA_E2E_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let heldInitialProjectFetch = false;
  let markProjectFetchHeld;
  let releaseInitialProjectFetch;
  const initialProjectFetchHeld = new Promise(resolve => { markProjectFetchHeld = resolve; });
  const initialProjectFetchRelease = new Promise(resolve => { releaseInitialProjectFetch = resolve; });

  await page.route("**/api/workspace/projects", async route => {
    if (!heldInitialProjectFetch && route.request().method() === "GET") {
      heldInitialProjectFetch = true;
      markProjectFetchHeld();
      await initialProjectFetchRelease;
    }
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await initialProjectFetchHeld;

  const composer = page.getByRole("textbox", { name: "Workspace build request" });
  await composer.waitFor({ timeout: 15_000 });
  assert.equal(await composer.isDisabled(), false, "The SmartBuild composer was disabled while workspace startup was still resolving.");
  assert.equal(await page.getByPlaceholder("Search projects or project details").count(), 0, "Project search appeared before any factual project existed.");
  assert.equal(await page.getByRole("button", { name: "Filters" }).count(), 0, "Project filters appeared before any factual project existed.");
  assert.equal(await page.getByText("Creating your first workspace…", { exact: true }).count(), 0, "The unwanted workspace preparation message was rendered.");

  releaseInitialProjectFetch();
  await page.waitForFunction(() => {
    const textarea = document.querySelector('textarea[aria-label="Workspace build request"]');
    return textarea && !textarea.disabled;
  }, null, { timeout: 15_000 });

  console.log(`SmartBuild composer-bootstrap regression test passed at ${baseUrl}`);
} finally {
  await browser.close();
}
