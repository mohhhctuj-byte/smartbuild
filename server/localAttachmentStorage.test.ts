import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("local attachment storage", () => {
  let root = "";

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("stores a local attachment under the ignored persistent folder and resolves it for its owner", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-attachments-"));
    const { findLocalAttachment, putLocalAttachment } = await import("./localAttachmentStorage");
    const saved = await putLocalAttachment("smart-builder/references/42/test-id.mp3", Buffer.from("audio"), root);

    expect(saved).toEqual({ key: "smart-builder/references/42/test-id.mp3", url: "/manus-storage/smart-builder/references/42/test-id.mp3" });
    const resolved = await findLocalAttachment(saved.key, root);
    expect(resolved?.userId).toBe(42);
    await expect(readFile(resolved!.absolutePath, "utf8")).resolves.toBe("audio");
  });

  it("rejects traversal keys and does not resolve files belonging to another path", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-attachments-"));
    const { findLocalAttachment, putLocalAttachment } = await import("./localAttachmentStorage");

    await expect(putLocalAttachment("smart-builder/references/42/../../secret.txt", Buffer.from("x"), root)).rejects.toThrow("INVALID_LOCAL_ATTACHMENT_KEY");
    await expect(findLocalAttachment("smart-builder/references/42/../../secret.txt", root)).resolves.toBeNull();
  });
});
