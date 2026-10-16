import { readLocalAttachment } from "./localAttachmentStorage";
import { storageGetSignedUrl } from "./storage";
import { MAX_CHAT_ATTACHMENTS } from "../shared/chatAttachments";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type VisionImage = { type: "image"; mimeType: string; data: string; name: string };
export type RequestedAttachment = { key: string; name: string; mimeType: string };
export type VerifiedAttachment = RequestedAttachment;
export type OwnedUpload = { userId: number; conversationId: number | null; fileKey: string; mimeType: string; sizeBytes: number };

export function attachImagesToLatestUserMessage<T extends { role: "system" | "user" | "assistant"; content: string }>(
  messages: T[],
  images: VisionImage[],
) {
  if (!images.length) return messages;
  const latestUserIndex = messages.findLastIndex(message => message.role === "user");
  if (latestUserIndex < 0) throw new Error("IMAGE_MESSAGE_REQUIRED");
  return messages.map((message, index) => index === latestUserIndex
    ? {
      ...message,
      content: [
        { type: "text" as const, text: message.content },
        { type: "text" as const, text: `Inspect all ${images.length} attached images individually, in order. Do not skip any; distinguish observations by image number and state uncertainty instead of guessing.` },
        ...images.flatMap((image, imageIndex) => [
          { type: "text" as const, text: `Image ${imageIndex + 1} of ${images.length}.` },
          image,
        ]),
      ],
    }
    : message);
}

function imageTypeFromBytes(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

async function fetchStoredImage(key: string) {
  const signedUrl = await storageGetSignedUrl(key);
  const response = await fetch(signedUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new Error("ATTACHED_IMAGE_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("ATTACHED_IMAGE_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function loadVisionAttachments(
  userId: number,
  conversationId: number,
  requested: unknown,
  uploads: OwnedUpload[],
  dependencies = { readLocal: readLocalAttachment, fetchStored: fetchStoredImage },
): Promise<{ images: VisionImage[]; attachments: VerifiedAttachment[] }> {
  if (requested === undefined) return { images: [], attachments: [] };
  if (!Array.isArray(requested)) throw new Error("INVALID_IMAGE_ATTACHMENTS");
  if (requested.length > MAX_CHAT_ATTACHMENTS) throw new Error("TOO_MANY_ATTACHMENTS");

  const images: VisionImage[] = [];
  const attachments: VerifiedAttachment[] = [];
  let totalBytes = 0;
  for (const candidate of requested) {
    if (!candidate || typeof candidate !== "object") throw new Error("INVALID_IMAGE_ATTACHMENTS");
    const attachment = candidate as Partial<RequestedAttachment>;
    if (typeof attachment.key !== "string" || typeof attachment.name !== "string" || attachment.name.length > 255) throw new Error("INVALID_IMAGE_ATTACHMENTS");
    const upload = uploads.find(item => item.fileKey === attachment.key && item.userId === userId && item.conversationId === conversationId);
    const local = await dependencies.readLocal(attachment.key, userId);
    if (!upload && (!local || local.userId !== userId)) throw new Error("ATTACHED_IMAGE_NOT_OWNED");
    const mimeType = (upload?.mimeType || attachment.mimeType || "").split(";")[0].toLowerCase();
    if (mimeType.startsWith("image/") && !SUPPORTED_IMAGE_TYPES.has(mimeType)) throw new Error("ATTACHED_IMAGE_FORMAT_UNSUPPORTED");
    attachments.push({ key: attachment.key, name: attachment.name, mimeType: mimeType || "application/octet-stream" });
    if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) continue;
    const bytes = local?.bytes || (upload ? await dependencies.fetchStored(attachment.key) : null);
    if (!bytes) throw new Error("ATTACHED_IMAGE_UNAVAILABLE");
    totalBytes += bytes.length;
    if (bytes.length > MAX_IMAGE_BYTES || totalBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error("ATTACHED_IMAGE_TOO_LARGE");
    const actualType = imageTypeFromBytes(bytes);
    if (!actualType || actualType !== mimeType) throw new Error("ATTACHED_IMAGE_INVALID");
    images.push({ type: "image", mimeType, data: bytes.toString("base64"), name: attachment.name });
  }
  return { images, attachments };
}

export async function loadVisionImages(
  userId: number,
  conversationId: number,
  requested: unknown,
  uploads: OwnedUpload[],
  dependencies?: { readLocal: typeof readLocalAttachment; fetchStored: typeof fetchStoredImage },
) {
  return (await loadVisionAttachments(userId, conversationId, requested, uploads, dependencies)).images;
}
