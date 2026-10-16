export function isRefreshCurrent(
  generation: number,
  currentGeneration: number,
  requestedBuildRunId: string | null,
  currentBuildRunId: string | null,
): boolean {
  return generation === currentGeneration && requestedBuildRunId === currentBuildRunId;
}

