import type { DurableBuildRun, User } from "../drizzle/schema";
import { getDurableBuildRunById, getUserById } from "./db";
import { ENV } from "./_core/env";

export const CANONICAL_MAYA_BUILD_RUN_ID = "0e5e85c2-859f-40e2-bff5-5632c3c84ca6";
export const CANONICAL_BELLA_BUILD_RUN_ID = "6074749d-1c80-4507-a216-fcff5491de46";

type CanonicalRun = Pick<DurableBuildRun, "id" | "userId" | "projectId" | "conversationId" | "status">;

export type WorkspaceOwnerBridgeRepository = {
  getRun: (buildRunId: string) => Promise<CanonicalRun | undefined>;
  getUser: (userId: number) => Promise<User | undefined>;
};

const databaseRepository: WorkspaceOwnerBridgeRepository = {
  getRun: getDurableBuildRunById,
  getUser: getUserById,
};

export function canBridgeWorkspaceOwner(authenticatedOpenId: string, ownerOpenId: string) {
  return Boolean(ownerOpenId) && authenticatedOpenId === ownerOpenId;
}

export function isCanonicalReleaseGatePair(maya: CanonicalRun | undefined, bella: CanonicalRun | undefined) {
  return Boolean(
    maya && bella &&
      maya.id === CANONICAL_MAYA_BUILD_RUN_ID &&
      bella.id === CANONICAL_BELLA_BUILD_RUN_ID &&
      maya.userId === bella.userId &&
      maya.projectId === 6720001 && maya.conversationId === 6510001 && maya.status === "succeeded" &&
      bella.projectId === 6720002 && bella.conversationId === 6510002 && bella.status === "blocked",
  );
}

/**
 * The early browser-only workspace used a personal-session identifier while
 * the public app authenticates its owner through Manus OAuth.  This bridge is
 * deliberately enabled only for the configured app owner and only after both
 * immutable release-gate tuples validate to the same durable owner.  It reads
 * historical data; it never migrates, creates, or rewrites a project/run.
 */
export async function resolveWorkspaceOwner(
  authenticatedUser: User,
  options: {
    ownerOpenId?: string;
    repository?: WorkspaceOwnerBridgeRepository;
  } = {},
): Promise<User> {
  const ownerOpenId = options.ownerOpenId ?? ENV.ownerOpenId;
  if (!canBridgeWorkspaceOwner(authenticatedUser.openId, ownerOpenId)) return authenticatedUser;

  const repository = options.repository ?? databaseRepository;
  const [maya, bella] = await Promise.all([
    repository.getRun(CANONICAL_MAYA_BUILD_RUN_ID),
    repository.getRun(CANONICAL_BELLA_BUILD_RUN_ID),
  ]);
  if (!isCanonicalReleaseGatePair(maya, bella)) return authenticatedUser;

  return (await repository.getUser(maya!.userId)) ?? authenticatedUser;
}
