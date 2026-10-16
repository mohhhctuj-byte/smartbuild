import { promises as fs } from "node:fs";
import path from "node:path";

export type CloudWorkspaceFile = {
  path: string;
  type: "file" | "directory";
  size?: number;
  updatedAt?: string;
};

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 500;
const MAX_DEPTH = 8;
const HIDDEN_OR_PRIVATE = new Set([".git", ".env", ".manus-logs", "node_modules", "dist", "storage", "uploads", "__pycache__", ".pytest_cache", "coverage", "agent_runtime", "client", "server", "shared", "drizzle", "scripts", "docs", "verification", "patches"]);
// The app source tree stays hidden in the browser Files view, but generated
// front-end code may be read or written project-relatively. Runtime, secrets,
// dependencies, and upload staging remain unavailable to file operations.
const OPERATION_PRIVATE = new Set(Array.from(HIDDEN_OR_PRIVATE).filter(segment => segment !== "client"));
const INTERNAL_ROOT_FILES = new Set(["package.json", "pnpm-lock.yaml", "tsconfig.json", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts", "components.json", "template.json"]);
const ROOT = path.resolve(process.cwd());

export function cloudWorkspaceStatus() {
  return {
    kind: "cloud" as const,
    label: "Cloud workspace",
    directFilesystem: false,
    desktopBridge: false,
    browserFileSystemAccess: false,
    rootLabel: "SmartBuild project files",
    supportsUpload: true,
    supportsDownloadZip: true,
    supportsExport: true,
    supportsPreview: true,
    supportsTests: true,
  };
}

function normalizedVirtualPath(value: string) {
  const raw = value.trim();
  if (raw.startsWith("/") || path.win32.isAbsolute(raw)) throw new Error("PATH_OUTSIDE_WORKSPACE");
  const candidate = raw.replaceAll("\\", "/");
  if (!candidate || candidate === ".") return "";
  if (candidate.includes("\0") || path.posix.isAbsolute(candidate)) throw new Error("INVALID_WORKSPACE_PATH");
  const normalized = path.posix.normalize(candidate);
  if (normalized === ".." || normalized.startsWith("../")) throw new Error("PATH_OUTSIDE_WORKSPACE");
  const segments = normalized.split("/");
  // The Files view hides more implementation detail than the editor must
  // restrict. Traversal, dot files, and sensitive runtime areas stay blocked.
  if (segments.some(segment => !segment || OPERATION_PRIVATE.has(segment) || segment.startsWith("."))) throw new Error("WORKSPACE_PATH_UNAVAILABLE");
  return normalized;
}

export function resolveCloudWorkspacePath(virtualPath: string) {
  const relative = normalizedVirtualPath(virtualPath);
  const absolute = path.resolve(ROOT, relative || ".");
  if (absolute !== ROOT && !absolute.startsWith(`${ROOT}${path.sep}`)) throw new Error("PATH_OUTSIDE_WORKSPACE");
  return { absolute, relative };
}

export async function listCloudWorkspaceFiles(relativePath = "") {
  const { absolute, relative } = resolveCloudWorkspacePath(relativePath);
  const entries: CloudWorkspaceFile[] = [];
  async function visit(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || entries.length >= MAX_FILES) return;
    const children = await fs.readdir(dir, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (HIDDEN_OR_PRIVATE.has(child.name) || INTERNAL_ROOT_FILES.has(child.name) || child.name.startsWith(".")) continue;
      if (entries.length >= MAX_FILES) return;
      const childPath = prefix ? `${prefix}/${child.name}` : child.name;
      const absoluteChild = path.join(dir, child.name);
      if (child.isDirectory()) {
        entries.push({ path: childPath, type: "directory" });
        await visit(absoluteChild, childPath, depth + 1);
      } else if (child.isFile()) {
        const stat = await fs.stat(absoluteChild);
        entries.push({ path: childPath, type: "file", size: stat.size, updatedAt: stat.mtime.toISOString() });
      }
    }
  }
  await visit(absolute, relative, 0);
  return entries;
}

export async function readCloudWorkspaceFile(virtualPath: string) {
  const { absolute, relative } = resolveCloudWorkspacePath(virtualPath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error("WORKSPACE_FILE_REQUIRED");
  if (stat.size > MAX_FILE_BYTES) throw new Error("WORKSPACE_FILE_TOO_LARGE");
  return { path: relative, content: await fs.readFile(absolute, "utf8"), size: stat.size, updatedAt: stat.mtime.toISOString() };
}

export async function writeCloudWorkspaceFile(virtualPath: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("WORKSPACE_FILE_TOO_LARGE");
  const { absolute, relative } = resolveCloudWorkspacePath(virtualPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  const stat = await fs.stat(absolute);
  return { path: relative, size: stat.size, updatedAt: stat.mtime.toISOString() };
}

export async function deleteCloudWorkspaceFile(virtualPath: string) {
  const { absolute, relative } = resolveCloudWorkspacePath(virtualPath);
  const stat = await fs.stat(absolute);
  if (stat.isDirectory()) await fs.rm(absolute, { recursive: true, force: false });
  else await fs.unlink(absolute);
  return { path: relative, deleted: true };
}

export async function uploadCloudWorkspaceFile(virtualPath: string, data: Buffer) {
  if (!data.length) throw new Error("WORKSPACE_UPLOAD_EMPTY");
  if (data.length > MAX_FILE_BYTES) throw new Error("WORKSPACE_FILE_TOO_LARGE");
  const { absolute, relative } = resolveCloudWorkspacePath(virtualPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, data);
  const stat = await fs.stat(absolute);
  return { path: relative, size: stat.size, updatedAt: stat.mtime.toISOString() };
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value & 0xffff, 0); return buffer; }
function uint32(value: number) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0, 0); return buffer; }

export async function exportCloudWorkspaceZip() {
  const files = (await listCloudWorkspaceFiles()).filter(item => item.type === "file" && (item.size ?? 0) <= MAX_FILE_BYTES);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let count = 0;
  for (const file of files) {
    const { absolute } = resolveCloudWorkspacePath(file.path);
    const data = await fs.readFile(absolute);
    const name = Buffer.from(`smartbuild-workspace/${file.path}`, "utf8");
    const crc = crc32(data);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name, data]);
    localParts.push(local);
    centralParts.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name]));
    offset += local.length;
    count += 1;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), uint16(0), uint16(0), uint16(count), uint16(count), uint32(central.length), uint32(offset), uint16(0)]);
  return Buffer.concat([...localParts, central, end]);
}

export function toCloudWorkspaceError(error: unknown) {
  const code = error instanceof Error ? error.message : "CLOUD_WORKSPACE_FAILED";
  const messages: Record<string, string> = {
    INVALID_WORKSPACE_PATH: "Enter a project-relative workspace path.",
    PATH_OUTSIDE_WORKSPACE: "That path is outside the Cloud workspace.",
    WORKSPACE_PATH_UNAVAILABLE: "That workspace path is protected.",
    WORKSPACE_FILE_REQUIRED: "Choose a file, not a directory.",
    WORKSPACE_FILE_TOO_LARGE: "Files must be 1 MB or smaller for browser editing or export.",
    WORKSPACE_UPLOAD_EMPTY: "The selected upload is empty.",
  };
  return { code, message: messages[code] || "The Cloud workspace operation could not be completed." };
}
