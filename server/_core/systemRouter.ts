import { z } from "zod";
import { CANONICAL_AGENT_COUNT } from "../agentOrchestrator";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  capabilities: publicProcedure.query(() => ({
    agentRuntime: {
      canonicalRegistryCount: CANONICAL_AGENT_COUNT,
      taskExecution: "sequential_durable" as const,
      maxConcurrency: 1 as const,
      evidenceScope: "build_run" as const,
      sourceCapabilityOnly: true as const,
    },
  })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
