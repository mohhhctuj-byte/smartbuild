import { getSessionCookieOptions } from "./_core/cookies";
import { PERSONAL_SESSION_COOKIE } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PERSONAL_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  workspace: router({
    session: publicProcedure.query(({ ctx }) => ({ ready: Boolean(ctx.user), user: ctx.user ? { id: ctx.user.id, name: ctx.user.name } : null })),
  }),
});

export type AppRouter = typeof appRouter;
