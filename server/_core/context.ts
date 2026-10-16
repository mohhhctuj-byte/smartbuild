import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getFirstPartySessionUser, getUserById } from "../db";
import { authCookieOptions, DEMO_SESSION_COOKIE, FIRST_PARTY_SESSION_COOKIE, GUEST_SESSION_COOKIE, hashSessionToken, readDemoSession, readGuestSession, REMEMBERED_SESSION_COOKIE } from "../firstPartyAuth";

/** Legacy name retained only for transitional imports; it is never read by createContext. */
export const PERSONAL_SESSION_COOKIE = "smart_builder_personal";
export type WorkspaceAuthenticationMode = "first_party" | "guest" | "demo" | "none";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  authMode: WorkspaceAuthenticationMode;
  isDemo: boolean;
};

export function readCookie(header: string | undefined, name: string) {
  const entry = header?.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  // A valid Demo cookie takes precedence over a preserved first-party cookie.
  // This lets an owner return from Demo without a new login while every
  // production route still fails closed for the duration of the Demo session.
  if (readDemoSession(readCookie(opts.req.headers.cookie, DEMO_SESSION_COOKIE))) return { req: opts.req, res: opts.res, user: null, authMode: "demo", isDemo: true };
  const guestSession = readGuestSession(readCookie(opts.req.headers.cookie, GUEST_SESSION_COOKIE));
  if (guestSession) {
    const user = await getUserById(guestSession.userId) ?? null;
    if (user?.loginMethod === "guest") return { req: opts.req, res: opts.res, user, authMode: "guest", isDemo: false };
  }
  const activeToken = readCookie(opts.req.headers.cookie, FIRST_PARTY_SESSION_COOKIE);
  const rememberedToken = readCookie(opts.req.headers.cookie, REMEMBERED_SESSION_COOKIE);
  const sessionToken = activeToken || rememberedToken;
  if (sessionToken) {
    try {
      const user = await getFirstPartySessionUser(hashSessionToken(sessionToken)) ?? null;
      if (user) {
        if (!activeToken && rememberedToken) opts.res.cookie(FIRST_PARTY_SESSION_COOKIE, rememberedToken, authCookieOptions(opts.req));
        return { req: opts.req, res: opts.res, user, authMode: "first_party", isDemo: false };
      }
    } catch {
      // Invalid production sessions are never reclassified as real users.
    }
  }
  return { req: opts.req, res: opts.res, user: null, authMode: "none", isDemo: false };
}
