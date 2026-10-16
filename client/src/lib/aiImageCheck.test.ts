import { describe, expect, it } from "vitest";
import { AI_IMAGE_CHECK_MAX_BYTES, formatAiImageCheckFileSize, validateAiImageCheckFile } from "./aiImageCheck";

describe("AI image check prototype file validation", () => {
  const imageSignatures: Record<string, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
    "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
    "image/webp": [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
    "image/gif": [71, 73, 70, 56, 57, 97],
  };

  const file = (type: string, bytes: number[], size = bytes.length, arrayBuffer = Uint8Array.from(bytes).buffer) => ({
    type,
    size,
    arrayBuffer: async () => arrayBuffer,
  });

  it.each(Object.entries(imageSignatures))("accepts a %s file whose bytes match its declared type", async (type, bytes) => {
    expect(await validateAiImageCheckFile(file(type, bytes))).toBeNull();
  });

  it("accepts an image whose actual size is exactly 5 MiB", async () => {
    const bytes = new Uint8Array(AI_IMAGE_CHECK_MAX_BYTES);
    bytes.set(imageSignatures["image/png"]);
    expect(await validateAiImageCheckFile(file("image/png", [], bytes.length, bytes.buffer))).toBeNull();
  });

  it("rejects unsupported declared file types and unsupported file contents", async () => {
    expect(await validateAiImageCheckFile(file("application/pdf", [0x25, 0x50, 0x44, 0x46]))).toBe("unsupported");
    expect(await validateAiImageCheckFile(file("image/svg+xml", [60, 115, 118, 103]))).toBe("unsupported");
    expect(await validateAiImageCheckFile(file("image/png", [0, 1, 2, 3]))).toBe("unsupported");
  });

  it("rejects declared types that do not match the file contents", async () => {
    expect(await validateAiImageCheckFile(file("image/jpeg", imageSignatures["image/png"]))).toBe("type-mismatch");
  });

  it("rejects a file when the browser does not provide a supported media type", async () => {
    expect(await validateAiImageCheckFile(file("", imageSignatures["image/webp"]))).toBe("unsupported");
  });

  it("rejects empty and oversized images before reading their contents", async () => {
    expect(await validateAiImageCheckFile(file("image/png", [], 0))).toBe("empty");
    const oversized = {
      type: "image/png",
      size: AI_IMAGE_CHECK_MAX_BYTES + 1,
      arrayBuffer: async () => { throw new Error("oversized data must not be read"); },
    };
    expect(await validateAiImageCheckFile(oversized)).toBe("too-large");
  });

  it("rejects the reported 5.08 MiB JPEG before reading its contents", async () => {
    const oversizedJpeg = {
      type: "image/jpeg",
      size: Math.ceil(5.08 * 1024 * 1024),
      arrayBuffer: async () => { throw new Error("oversized image data must not be read"); },
    };
    expect(await validateAiImageCheckFile(oversizedJpeg)).toBe("too-large");
  });

  it("checks actual bytes against the maximum even when reported size differs", async () => {
    const oversizedBytes = new Uint8Array(AI_IMAGE_CHECK_MAX_BYTES + 1);
    oversizedBytes.set(imageSignatures["image/png"]);
    expect(await validateAiImageCheckFile(file("image/png", [], 1, oversizedBytes.buffer))).toBe("too-large");
  });

  it("rejects a byte count that differs from the file's reported size", async () => {
    expect(await validateAiImageCheckFile(file("image/png", imageSignatures["image/png"], 9))).toBe("unreadable");
  });

  it("reports unreadable file contents", async () => {
    const unreadable = {
      type: "image/png",
      size: 4,
      arrayBuffer: async () => { throw new Error("read failed"); },
    };
    expect(await validateAiImageCheckFile(unreadable)).toBe("unreadable");
  });

  it("formats file sizes for the image preview", () => {
    expect(formatAiImageCheckFileSize(2048)).toBe("2 KB");
    expect(formatAiImageCheckFileSize(AI_IMAGE_CHECK_MAX_BYTES)).toBe("5.0 MB");
  });
});
