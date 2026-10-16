import express from "express";
import { rm } from "node:fs/promises";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({ userId: 37 }));
vi.mock("./context", () => ({
  createContext: vi.fn(async ({ req }: { req: express.Request }) => ({
    user: req.headers.authorization === "Bearer test-user" ? { id: mockAuth.userId } : null,
    isDemo: false,
  })),
}));

describe("local attachment upload and download flow", () => {
  let savedForgeConfig: { url: string; key: string } | undefined;
  let storedPath: string | undefined;

  afterEach(async () => {
    if (savedForgeConfig) {
      const { ENV } = await import("./env");
      ENV.forgeApiUrl = savedForgeConfig.url;
      ENV.forgeApiKey = savedForgeConfig.key;
      savedForgeConfig = undefined;
    }
    if (storedPath) await rm(storedPath, { force: true });
    storedPath = undefined;
  });

  it("stores a file locally when cloud storage is unset and serves it only to its owner", async () => {
    const { ENV } = await import("./env");
    const { saveReferenceFile } = await import("../referenceUploads");
    const { registerStorageProxy } = await import("./storageProxy");
    const { storagePut } = await import("../storage");
    savedForgeConfig = { url: ENV.forgeApiUrl, key: ENV.forgeApiKey };
    ENV.forgeApiUrl = "";
    ENV.forgeApiKey = "";
    const stored = await saveReferenceFile(37, Buffer.from("local audio test"), "audio/mpeg", "voice.mp3", {}, {
      put: storagePut,
      create: vi.fn().mockResolvedValue(undefined),
      randomId: () => "flow-test",
    });
    const savedFile = await (await import("../localAttachmentStorage")).findLocalAttachment(stored.key);
    expect(savedFile).not.toBeNull();
    storedPath = savedFile!.absolutePath;

    const app = express();
    registerStorageProxy(app);

    const denied = await request(app).get(stored.url).expect(401);
    expect(denied.text).toContain("Sign in");
    const retrieved = await request(app).get(stored.url).set("Authorization", "Bearer test-user").expect(200);
    expect(retrieved.body.toString("utf8")).toBe("local audio test");
    expect(retrieved.headers["content-type"]).toBe("audio/mpeg");
    expect(retrieved.headers["content-disposition"]).toBe("inline");
    expect(ENV.forgeApiUrl).toBe("");
  });
});
