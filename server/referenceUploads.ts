export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REFERENCE_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_REFERENCE_UPLOAD_BYTES = MAX_REFERENCE_VIDEO_BYTES;

export type UploadScope = { projectId?: number; conversationId?: number };

export type ReferenceUploadDependencies = {
  put: (key: string, bytes: Buffer, contentType: string) => Promise<{ key: string; url: string }>;
  create: (userId: number, key: string, url: string, mimeType: string, sizeBytes: number, projectId?: number, conversationId?: number) => Promise<unknown>;
  randomId: () => string;
};

export function validWorkspaceId(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function referenceUploadScope(query: { projectId?: unknown; conversationId?: unknown }): UploadScope {
  return { projectId: validWorkspaceId(query.projectId), conversationId: validWorkspaceId(query.conversationId) };
}

export function referenceUploadFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("Storage config missing:")) {
    return "File storage is not configured on the server. Configure BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY, then restart the server.";
  }
  return "File storage could not save this file. The storage service or database may be unavailable; try again later.";
}

function safeMimeType(value: unknown, fileName: unknown) {
  const contentType = String(value || "").split(";")[0].trim().toLowerCase();
  if (contentType.length <= 128 && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType) && contentType !== "application/octet-stream") return contentType;
  const extension = safeFileExtension(fileName);
  const extensionTypes: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    pdf: "application/pdf", csv: "text/csv", txt: "text/plain", json: "application/json",
  };
  return extensionTypes[extension] || "application/octet-stream";
}

function safeFileExtension(fileName: unknown) {
  if (typeof fileName !== "string" || fileName.length > 255) return "bin";
  const extension = fileName.split(/[\\/]/).pop()?.match(/\.([a-z0-9]{1,10})$/i)?.[1];
  return extension?.toLowerCase() || "bin";
}

export async function saveReferenceFile(
  userId: number,
  body: Buffer,
  contentTypeValue: unknown,
  fileName: unknown,
  scope: UploadScope,
  deps: ReferenceUploadDependencies,
) {
  const contentType = safeMimeType(contentTypeValue, fileName);
  const maxBytes = contentType.startsWith("image/") ? MAX_REFERENCE_IMAGE_BYTES : MAX_REFERENCE_UPLOAD_BYTES;
  if (!body.length || body.length > maxBytes) {
    throw new Error("INVALID_REFERENCE_FILE");
  }
  const stored = await deps.put(`smart-builder/references/${userId}/${deps.randomId()}.${safeFileExtension(fileName)}`, body, contentType);
  await deps.create(userId, stored.key, stored.url, contentType, body.length, scope.projectId, scope.conversationId);
  return { url: stored.url, key: stored.key, mimeType: contentType, sizeBytes: body.length };
}
