import { writeCloudWorkspaceFile } from "./cloudWorkspace";

export type GeneratedCloudFile = {
  path: string;
  content: string;
};

export type GeneratedCloudPersistResult = {
  written: string[];
  rejected: Array<{ path: string; reason: string }>;
};

/**
 * Persists only project-relative code blocks through the same guarded Cloud
 * workspace boundary used by the browser editor. A malformed generated path
 * is reported as evidence rather than allowing it to reach the filesystem.
 */
export async function persistGeneratedCloudFiles(
  files: GeneratedCloudFile[],
  writeFile: typeof writeCloudWorkspaceFile = writeCloudWorkspaceFile,
): Promise<GeneratedCloudPersistResult> {
  const written: string[] = [];
  const rejected: Array<{ path: string; reason: string }> = [];
  // A model response can repeat an artifact block. Persist each canonical path
  // once, using the final occurrence as the authoritative request-scoped body.
  const finalFilesByPath = new Map<string, GeneratedCloudFile>();
  for (const file of files) finalFilesByPath.set(file.path, file);

  for (const file of Array.from(finalFilesByPath.values())) {
    try {
      const saved = await writeFile(file.path, file.content);
      written.push(saved.path);
    } catch (error) {
      rejected.push({
        path: file.path.slice(0, 300),
        reason: error instanceof Error ? error.message : "CLOUD_WORKSPACE_WRITE_FAILED",
      });
    }
  }
  return { written, rejected };
}
