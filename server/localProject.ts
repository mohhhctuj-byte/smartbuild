import path from "node:path";

export type FolderBinding = { state: "Unbound" } | { state: "Bound"; folderName: string; root: string };

export function unboundFolder(): FolderBinding {
  return { state: "Unbound" };
}

export function bindFolder(root: string): FolderBinding {
  const normalized = root.trim();
  if (!normalized || !path.isAbsolute(normalized)) throw new Error("ABSOLUTE_FOLDER_REQUIRED");
  return { state: "Bound", folderName: path.basename(normalized) || normalized, root: normalized };
}

export function canAccessLocalFolder(binding: FolderBinding) {
  return binding.state === "Bound";
}

export function safeChildPath(binding: FolderBinding, relativePath: string) {
  if (binding.state !== "Bound") throw new Error("LOCAL_FOLDER_UNBOUND");
  const root = path.resolve(binding.root);
  const candidate = path.resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error("PATH_OUTSIDE_BOUND_FOLDER");
  return candidate;
}
