import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SmartBuild branding", () => {
  it("keeps the configured application title aligned with the browser document title", async () => {
    expect(process.env.VITE_APP_TITLE).toBe("SmartBuild");
    const document = await readFile(path.join(process.cwd(), "client/index.html"), "utf8");
    expect(document).toContain("<title>SmartBuild — Creative AI Workspace</title>");
  });
});
