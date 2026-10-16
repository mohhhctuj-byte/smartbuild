type BuildWorkspaceFile = { path: string; type: "file" | "directory" };

const internalArtifactDirectories = new Set([
  "agent-artifacts",
  "evidence",
  "checkpoints",
  "exports",
  "logs",
  "traces",
  ".smartbuild",
]);

export function isSourceBuildFile(file: BuildWorkspaceFile): boolean {
  if (file.type !== "file") return false;
  const firstSegment = file.path.replace(/^\/+/, "").split("/", 1)[0];
  return Boolean(firstSegment) && !internalArtifactDirectories.has(firstSegment);
}

export function sourceBuildFiles<T extends BuildWorkspaceFile>(files: T[]): T[] {
  return files
    .filter(isSourceBuildFile)
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
