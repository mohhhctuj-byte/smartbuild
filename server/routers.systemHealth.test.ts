import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("managed deployment health procedure", () => {
  it("mounts system.health on the public application router", async () => {
    const caller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: null,
      authMode: "none",
      isDemo: false,
    } as any);

    await expect(caller.system.health({ timestamp: 1_787_581_800_000 })).resolves.toEqual({ ok: true });
  });

  it("exposes only the current non-sensitive agent runtime capability marker", async () => {
    const caller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: null,
      authMode: "none",
      isDemo: false,
    } as any);

    await expect(caller.system.capabilities()).resolves.toEqual({
      agentRuntime: {
        canonicalRegistryCount: 300,
        taskExecution: "sequential_durable",
        maxConcurrency: 1,
        evidenceScope: "build_run",
        sourceCapabilityOnly: true,
      },
    });
  });
});
