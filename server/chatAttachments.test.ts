import { describe, expect, it } from "vitest";
import { decodeMessageAttachments, encodeMessageAttachments, MAX_CHAT_ATTACHMENTS } from "../shared/chatAttachments";

describe("chat attachment message metadata", () => {
  it("round-trips attachment metadata without exposing the marker as message text", () => {
    const content = "What is in this picture?";
    const attachments = [
      { key: "smart-builder/references/5/image.png", name: "photo.png", mimeType: "image/png" },
      { key: "smart-builder/references/5/clip.mp4", name: "clip.mp4", mimeType: "video/mp4" },
      { key: "smart-builder/references/5/notes.txt", name: "notes.txt", mimeType: "text/plain" },
    ];
    const stored = encodeMessageAttachments(content, attachments);

    expect(stored).not.toBe(content);
    expect(decodeMessageAttachments(stored)).toEqual({ content, attachments });
  });

  it("leaves regular messages unchanged", () => {
    expect(decodeMessageAttachments("Hello")).toEqual({ content: "Hello", attachments: [] });
  });

  it("supports restoring a full batch of mixed image, video, and file attachments", () => {
    const attachments = Array.from({ length: MAX_CHAT_ATTACHMENTS }, (_, index) => ({
      key: `smart-builder/references/5/file-${index}`,
      name: `file-${index}`,
      mimeType: index % 3 === 0 ? "image/png" : index % 3 === 1 ? "video/mp4" : "application/pdf",
    }));

    expect(decodeMessageAttachments(encodeMessageAttachments("Review these together.", attachments)))
      .toEqual({ content: "Review these together.", attachments });
  });
});
