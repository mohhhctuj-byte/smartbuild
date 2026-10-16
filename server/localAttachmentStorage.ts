import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), ".smartbuild-local-state", "uploads");
const REFERENCE_KEY_PATTERN = /^smart-builder\/references\/(\d+)\/([a-zA-Z0-9-]+\.[a-z0-9]{1,10})$/;

function localPathForKey(key: string, root = LOCAL_UPLOAD_ROOT) {
  const match = REFERENCE_KEY_PATTERN.exec(key);
  if (!match) return null;
  const extension = match[2].split(".").at(-1)?.toLowerCase() || "";
  const mimeTypeByExtension: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  };
  return {
    userId: Number(match[1]),
    absolutePath: path.join(root, ...key.split("/")),
    mimeType: mimeTypeByExtension[extension] || "application/octet-stream",
  };
}

export async function putLocalAttachment(key: string, bytes: Buffer | Uint8Array, root = LOCAL_UPLOAD_ROOT) {
  const target = localPathForKey(key, root);
  if (!target) throw new Error("INVALID_LOCAL_ATTACHMENT_KEY");
  await mkdir(path.dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, bytes, { flag: "wx", mode: 0o600 });
  return { key, url: `/manus-storage/${key}` };
}

export async function findLocalAttachment(key: string, root = LOCAL_UPLOAD_ROOT) {
  const target = localPathForKey(key, root);
  if (!target) return null;
  try {
    await access(target.absolutePath);
    return target;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readLocalAttachment(key: string, userId: number) {
  const target = localPathForKey(key);
  if (!target || target.userId !== userId) return null;
  const details = await stat(target.absolutePath).catch(error => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  if (!details?.isFile() || details.size > 5 * 1024 * 1024) return null;
  return { bytes: await readFile(target.absolutePath), userId: target.userId };
}
