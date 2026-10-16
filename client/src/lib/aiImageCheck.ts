import {
  MEDIA_CHECK_MAX_IMAGE_BYTES,
  MEDIA_CHECK_PREVIEW_IMAGE_TYPES,
} from "@shared/mediaCheck";

export const AI_IMAGE_CHECK_MAX_BYTES = MEDIA_CHECK_MAX_IMAGE_BYTES;

export const AI_IMAGE_CHECK_ACCEPTED_TYPES = MEDIA_CHECK_PREVIEW_IMAGE_TYPES;

export type AiImageCheckFileError = "unsupported" | "type-mismatch" | "too-large" | "empty" | "unreadable";

function readAscii(bytes: Uint8Array, start: number, length: number) {
  let value = "";
  for (let index = start; index < start + length; index += 1) value += String.fromCharCode(bytes[index]);
  return value;
}

function detectedImageType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6) {
    const signature = readAscii(bytes, 0, 6);
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12
    && readAscii(bytes, 0, 4) === "RIFF"
    && readAscii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export async function validateAiImageCheckFile(file: Pick<File, "type" | "size" | "arrayBuffer">): Promise<AiImageCheckFileError | null> {
  if (!AI_IMAGE_CHECK_ACCEPTED_TYPES.some(type => type === file.type)) return "unsupported";
  if (file.size === 0) return "empty";
  if (file.size > AI_IMAGE_CHECK_MAX_BYTES) return "too-large";
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return "unreadable";
  }
  if (bytes.length === 0) return "empty";
  if (bytes.length > AI_IMAGE_CHECK_MAX_BYTES) return "too-large";
  if (bytes.length !== file.size) return "unreadable";
  const actualType = detectedImageType(bytes);
  if (!actualType) return "unsupported";
  if (actualType !== file.type) return "type-mismatch";
  return null;
}

export function formatAiImageCheckFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
