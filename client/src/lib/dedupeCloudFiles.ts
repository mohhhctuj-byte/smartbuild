export type CloudFileLike = { path: string; type: "file" | "directory" };

/**
 * Keeps one display row per canonical workspace path. A file wins over a
 * conflicting directory record because it is the inspectable artifact.
 */
export function dedupeCloudFiles<T extends CloudFileLike>(files: readonly T[]): T[] {
  const byPath = new Map<string, T>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (!existing || (existing.type === "directory" && file.type === "file")) byPath.set(file.path, file);
  }
  return Array.from(byPath.values());
}
