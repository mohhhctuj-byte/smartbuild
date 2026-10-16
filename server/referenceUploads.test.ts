import { describe, expect, it, vi } from "vitest";
import { MAX_REFERENCE_UPLOAD_BYTES, referenceUploadFailureMessage, referenceUploadScope, saveReferenceFile } from "./referenceUploads";

describe("reference file uploads", () => {
  it("preserves valid project and conversation scope when storing an image", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const put = vi.fn().mockResolvedValue({ key: "references/one.png", url: "/manus-storage/references/one.png" });
    const stored = await saveReferenceFile(14, Buffer.from([137, 80, 78, 71]), "image/png; charset=binary", "one.png", referenceUploadScope({ projectId: "8", conversationId: "21" }), { put, create, randomId: () => "stable-id" });

    expect(stored).toMatchObject({ key: "references/one.png", mimeType: "image/png", sizeBytes: 4 });
    expect(put).toHaveBeenCalledWith("smart-builder/references/14/stable-id.png", expect.any(Buffer), "image/png");
    expect(create).toHaveBeenCalledWith(14, "references/one.png", "/manus-storage/references/one.png", "image/png", 4, 8, 21);
  });

  it("stores arbitrary files and safely falls back when a browser omits its media type", async () => {
    const put = vi.fn().mockResolvedValue({ key: "references/one.csv", url: "/manus-storage/references/one.csv" });
    const stored = await saveReferenceFile(14, Buffer.from("a,b"), "", "one.csv", {}, { put, create: vi.fn(), randomId: () => "stable-id" });

    expect(stored).toMatchObject({ key: "references/one.csv", mimeType: "text/csv", sizeBytes: 3 });
    expect(put).toHaveBeenCalledWith("smart-builder/references/14/stable-id.csv", expect.any(Buffer), "text/csv");
  });

  it("infers common image, video, and audio types from the selected file extension", async () => {
    const put = vi.fn().mockResolvedValue({ key: "references/song.mp3", url: "/manus-storage/references/song.mp3" });
    const stored = await saveReferenceFile(14, Buffer.from("audio"), "", "song.mp3", {}, { put, create: vi.fn(), randomId: () => "stable-id" });

    expect(stored.mimeType).toBe("audio/mpeg");
    expect(put).toHaveBeenCalledWith("smart-builder/references/14/stable-id.mp3", expect.any(Buffer), "audio/mpeg");
  });

  it("keeps only the file extension from a supplied name", async () => {
    const put = vi.fn().mockResolvedValue({ key: "references/one.pdf", url: "/manus-storage/references/one.pdf" });
    await saveReferenceFile(14, Buffer.from("pdf"), "application/pdf", "..\\private\\one.PDF", {}, { put, create: vi.fn(), randomId: () => "stable-id" });

    expect(put).toHaveBeenCalledWith("smart-builder/references/14/stable-id.pdf", expect.any(Buffer), "application/pdf");
  });

  it("drops malformed workspace IDs, applies upload limits, and explains missing storage configuration", async () => {
    expect(referenceUploadScope({ projectId: "0", conversationId: "not-a-number" })).toEqual({ projectId: undefined, conversationId: undefined });
    const deps = { put: vi.fn(), create: vi.fn(), randomId: () => "id" };
    await expect(saveReferenceFile(1, Buffer.alloc(0), "text/plain", "empty.txt", {}, deps)).rejects.toThrow("INVALID_REFERENCE_FILE");
    await expect(saveReferenceFile(1, Buffer.alloc(MAX_REFERENCE_UPLOAD_BYTES + 1), "text/plain", "large.txt", {}, deps)).rejects.toThrow("INVALID_REFERENCE_FILE");
    expect(referenceUploadFailureMessage(new Error("Storage config missing: set server credentials"))).toContain("BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
    expect(referenceUploadFailureMessage(new Error("Presign request failed"))).toContain("storage service or database may be unavailable");
  });
});
