import { describe, expect, it, vi } from "vitest";
import { attachImagesToLatestUserMessage, loadVisionAttachments, loadVisionImages, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES } from "./visionAttachments";

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe("vision attachments", () => {
  it("attaches image data to the latest user turn while preserving conversation history", () => {
    const history = [
      { role: "user" as const, content: "Earlier question" },
      { role: "assistant" as const, content: "Earlier answer" },
      { role: "user" as const, content: "What is this?" },
    ];
    const image = { type: "image" as const, mimeType: "image/png", data: pngBytes.toString("base64"), name: "image.png" };
    const result = attachImagesToLatestUserMessage(history, [image]);

    expect(result).toEqual([
      history[0],
      history[1],
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          { type: "text", text: "Inspect all 1 attached images individually, in order. Do not skip any; distinguish observations by image number and state uncertainty instead of guessing." },
          { type: "text", text: "Image 1 of 1." },
          image,
        ],
      },
    ]);
  });

  it("attaches and numbers every selected image in the same latest user message", () => {
    const history = [{ role: "user" as const, content: "Compare these images." }];
    const images = ["first.png", "second.png", "third.png"].map(name => ({
      type: "image" as const,
      mimeType: "image/png",
      data: pngBytes.toString("base64"),
      name,
    }));

    expect(attachImagesToLatestUserMessage(history, images)).toEqual([{
      role: "user",
      content: [
        { type: "text", text: "Compare these images." },
        { type: "text", text: "Inspect all 3 attached images individually, in order. Do not skip any; distinguish observations by image number and state uncertainty instead of guessing." },
        { type: "text", text: "Image 1 of 3." },
        images[0],
        { type: "text", text: "Image 2 of 3." },
        images[1],
        { type: "text", text: "Image 3 of 3." },
        images[2],
      ],
    }]);
  });

  it("accepts 12 attachments and prepares every attached image", async () => {
    const attachments = Array.from({ length: 12 }, (_, index) => ({
      key: `smart-builder/references/7/image-${index}.png`,
      name: `image-${index}.png`,
      mimeType: "image/png",
    }));
    const result = await loadVisionAttachments(7, 12, attachments, [], {
      readLocal: vi.fn().mockResolvedValue({ bytes: pngBytes, userId: 7 }),
      fetchStored: vi.fn(),
    });

    expect(result.attachments).toHaveLength(12);
    expect(result.images.map(image => image.name)).toEqual(attachments.map(attachment => attachment.name));
  });

  it("rejects attachment batches above the per-message limit", async () => {
    const attachments = Array.from({ length: 13 }, (_, index) => ({
      key: `smart-builder/references/7/file-${index}.txt`,
      name: `file-${index}.txt`,
      mimeType: "text/plain",
    }));

    await expect(loadVisionAttachments(7, 12, attachments, [], {
      readLocal: vi.fn(),
      fetchStored: vi.fn(),
    })).rejects.toThrow("TOO_MANY_ATTACHMENTS");
  });

  it("allows multiple images up to the combined vision payload limit", async () => {
    const attachments = Array.from({ length: 4 }, (_, index) => ({
      key: `smart-builder/references/7/large-${index}.png`,
      name: `large-${index}.png`,
      mimeType: "image/png",
    }));
    const imageBytes = Buffer.alloc(3 * 1024 * 1024 + 512 * 1024);
    pngBytes.copy(imageBytes);

    await expect(loadVisionAttachments(7, 12, attachments, [], {
      readLocal: vi.fn().mockResolvedValue({ bytes: imageBytes, userId: 7 }),
      fetchStored: vi.fn(),
    })).resolves.toMatchObject({ attachments });
    await expect(loadVisionAttachments(7, 12, attachments, [], {
      readLocal: vi.fn().mockResolvedValue({ bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1), userId: 7 }),
      fetchStored: vi.fn(),
    })).rejects.toThrow("ATTACHED_IMAGE_TOO_LARGE");
    const imageBytesOverBatchLimit = Buffer.alloc(4 * 1024 * 1024);
    pngBytes.copy(imageBytesOverBatchLimit);
    expect(imageBytesOverBatchLimit.length * attachments.length).toBeGreaterThan(MAX_TOTAL_IMAGE_BYTES);
    await expect(loadVisionAttachments(7, 12, attachments, [], {
      readLocal: vi.fn().mockResolvedValue({ bytes: imageBytesOverBatchLimit, userId: 7 }),
      fetchStored: vi.fn(),
    })).rejects.toThrow("ATTACHED_IMAGE_TOO_LARGE");
  });

  it("loads an owned PNG and returns provider-ready base64 data", async () => {
    const images = await loadVisionImages(7, 12, [{ key: "smart-builder/references/7/image.png", name: "image.png", mimeType: "image/png" }], [], {
      readLocal: vi.fn().mockResolvedValue({ bytes: pngBytes, userId: 7 }),
      fetchStored: vi.fn(),
    });

    expect(images).toEqual([{ type: "image", mimeType: "image/png", data: pngBytes.toString("base64"), name: "image.png" }]);
  });

  it("keeps all 12 image payloads in the original order for the model", async () => {
    const attachments = Array.from({ length: 12 }, (_, index) => ({
      key: `smart-builder/references/7/image-${index}.png`,
      name: `image-${index}.png`,
      mimeType: "image/png",
    }));
    const result = await loadVisionAttachments(7, 12, attachments, [], {
      readLocal: vi.fn().mockImplementation(async (key: string) => ({
        bytes: Buffer.concat([pngBytes, Buffer.from(key)]),
        userId: 7,
      })),
      fetchStored: vi.fn(),
    });
    const messages = attachImagesToLatestUserMessage([{ role: "user" as const, content: "Review all photos." }], result.images);
    const parts = messages[0].content;

    expect(result.images).toHaveLength(12);
    expect(result.images.map(image => image.name)).toEqual(attachments.map(attachment => attachment.name));
    expect(Array.isArray(parts) ? parts.filter(part => part.type === "image") : []).toHaveLength(12);
    expect(Array.isArray(parts) ? parts.filter(part => part.type === "text" && part.text.startsWith("Image ")).map(part => part.text) : [])
      .toEqual(Array.from({ length: 12 }, (_, index) => `Image ${index + 1} of 12.`));
  });

  it("rejects files that are not owned, not actually images, or over the image size limit", async () => {
    const attachment = [{ key: "smart-builder/references/8/image.png", name: "image.png", mimeType: "image/png" }];
    await expect(loadVisionImages(7, 12, attachment, [], { readLocal: vi.fn().mockResolvedValue(null), fetchStored: vi.fn() })).rejects.toThrow("ATTACHED_IMAGE_NOT_OWNED");
    await expect(loadVisionImages(7, 12, attachment, [], { readLocal: vi.fn().mockResolvedValue({ bytes: Buffer.from("not png"), userId: 7 }), fetchStored: vi.fn() })).rejects.toThrow("ATTACHED_IMAGE_INVALID");
    await expect(loadVisionImages(7, 12, attachment, [], { readLocal: vi.fn().mockResolvedValue({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1), userId: 7 }), fetchStored: vi.fn() })).rejects.toThrow("ATTACHED_IMAGE_TOO_LARGE");
  });

  it("uses only uploads belonging to the active user and conversation for cloud storage", async () => {
    const fetchStored = vi.fn().mockResolvedValue(pngBytes);
    const uploads = [
      { userId: 7, conversationId: 12, fileKey: "smart-builder/references/7/image.png", mimeType: "image/png", sizeBytes: pngBytes.length },
      { userId: 8, conversationId: 12, fileKey: "smart-builder/references/8/other.png", mimeType: "image/png", sizeBytes: pngBytes.length },
    ];
    const images = await loadVisionImages(7, 12, [{ key: "smart-builder/references/7/image.png", name: "image.png", mimeType: "image/png" }], uploads, {
      readLocal: vi.fn().mockResolvedValue(null),
      fetchStored,
    });

    expect(images).toHaveLength(1);
    expect(fetchStored).toHaveBeenCalledWith("smart-builder/references/7/image.png");
    await expect(loadVisionImages(7, 12, [{ key: "smart-builder/references/8/other.png", name: "other.png", mimeType: "image/png" }], uploads, {
      readLocal: vi.fn().mockResolvedValue(null),
      fetchStored,
    })).rejects.toThrow("ATTACHED_IMAGE_NOT_OWNED");
  });
});
