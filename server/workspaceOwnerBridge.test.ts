import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import {
  CANONICAL_BELLA_BUILD_RUN_ID,
  CANONICAL_MAYA_BUILD_RUN_ID,
  canBridgeWorkspaceOwner,
  isCanonicalReleaseGatePair,
  resolveWorkspaceOwner,
} from "./workspaceOwnerBridge";

const signedInOwner = { id: 900, openId: "owner-open-id", name: "Owner" } as User;
const durableOwner = { id: 4980001, openId: "legacy-personal-owner", name: "SmartBuild owner" } as User;
const maya = {
  id: CANONICAL_MAYA_BUILD_RUN_ID,
  userId: durableOwner.id,
  projectId: 6720001,
  conversationId: 6510001,
  status: "succeeded",
};
const bella = {
  id: CANONICAL_BELLA_BUILD_RUN_ID,
  userId: durableOwner.id,
  projectId: 6720002,
  conversationId: 6510002,
  status: "blocked",
};

describe("workspace owner bridge", () => {
  it("allows only the configured OAuth owner to request the bridge", () => {
    expect(canBridgeWorkspaceOwner("owner-open-id", "owner-open-id")).toBe(true);
    expect(canBridgeWorkspaceOwner("another-owner", "owner-open-id")).toBe(false);
    expect(canBridgeWorkspaceOwner("owner-open-id", "")).toBe(false);
  });

  it("does not treat the durable personal owner identifier as an OAuth credential", () => {
    expect(canBridgeWorkspaceOwner(durableOwner.openId, "owner-open-id")).toBe(false);
  });

  it("recognizes exactly the isolated Maya/Bella release-gate pair", () => {
    expect(isCanonicalReleaseGatePair(maya as any, bella as any)).toBe(true);
    expect(isCanonicalReleaseGatePair(maya as any, { ...bella, status: "succeeded" } as any)).toBe(false);
    expect(isCanonicalReleaseGatePair(maya as any, { ...bella, projectId: 6720001 } as any)).toBe(false);
  });

  it("bridges the configured owner to the durable workspace owner without writing data", async () => {
    const resolved = await resolveWorkspaceOwner(signedInOwner, {
      ownerOpenId: "owner-open-id",
      repository: {
        getRun: async id => id === maya.id ? maya as any : id === bella.id ? bella as any : undefined,
        getUser: async id => id === durableOwner.id ? durableOwner : undefined,
      },
    });
    expect(resolved).toEqual(durableOwner);
  });

  it("fails closed to the authenticated user when durable evidence is incomplete", async () => {
    const resolved = await resolveWorkspaceOwner(signedInOwner, {
      ownerOpenId: "owner-open-id",
      repository: {
        getRun: async id => id === maya.id ? maya as any : undefined,
        getUser: async () => durableOwner,
      },
    });
    expect(resolved).toEqual(signedInOwner);
  });
});
