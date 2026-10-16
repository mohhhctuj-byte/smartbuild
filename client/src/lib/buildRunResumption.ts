export type BuildRunResumptionStatus = "planned" | "queued" | "planning" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";

const terminalStatuses = new Set<BuildRunResumptionStatus>(["succeeded", "failed", "blocked", "timed_out", "cancelled"]);

/**
 * A resumed Cloud workspace must keep advancing only active Build Runs. The
 * server-side lease remains the authority that fences concurrent clients.
 */
export function isBuildRunResumable(status: BuildRunResumptionStatus | null | undefined): boolean {
  return Boolean(status && !terminalStatuses.has(status));
}
