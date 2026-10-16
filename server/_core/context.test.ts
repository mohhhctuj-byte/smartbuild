import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as { id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null; role: "user" | "admin"; createdAt: Date; updatedAt: Date; lastSignedIn: Date } | null }));

vi.mock("../db", () => ({
  getFirstPartySessionUser: vi.fn(async () => state.user),
  getUserById: vi.fn(async (userId: number) => state.user?.id === userId ? state.user : undefined),
}));

import { createDemoSession, createGuestSession, DEMO_SESSION_COOKIE, FIRST_PARTY_SESSION_COOKIE, GUEST_SESSION_COOKIE } from "../firstPartyAuth";
import { createContext } from "./context";

beforeEach(() => {
  state.user = null;
});

function requestWithSession(value = "opaque-session-token") {
  return { headers: { cookie: `${FIRST_PARTY_SESSION_COOKIE}=${value}` } } as any;
}

function requestWithDemoSession() {
  return { headers: { cookie: `${DEMO_SESSION_COOKIE}=${createDemoSession().token}` } } as any;
}

describe("first-party workspace context", () => {
  it("does not authenticate a request without a valid verified-account session", async () => {
    const context = await createContext({ req: requestWithSession(), res: {} as any } as any);
    expect(context.user).toBeNull();
    expect(context.authMode).toBe("none");
  });

  it("accepts only a valid first-party session user for protected workspace procedures", async () => {
    state.user = {
      id: 81001,
      openId: "auth_email_81001",
      name: "Verified test user",
      email: "verified@example.test",
      loginMethod: "email_password",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const context = await createContext({ req: requestWithSession(), res: {} as any } as any);
    expect(context.user?.id).toBe(81001);
    expect(context.authMode).toBe("first_party");
  });

  it("classifies a signed demo session as non-user context", async () => {
    const context = await createContext({ req: requestWithDemoSession(), res: {} as any } as any);
    expect(context.user).toBeNull();
    expect(context.authMode).toBe("demo");
    expect(context.isDemo).toBe(true);
  });

  it("accepts a signed guest session as its own workspace user", async () => {
    state.user = {
      id: 81002,
      openId: "guest-test",
      name: "Guest User",
      email: null,
      loginMethod: "guest",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const guest = createGuestSession(state.user.id);
    const request = { headers: { cookie: `${GUEST_SESSION_COOKIE}=${guest.token}` } } as any;
    const context = await createContext({ req: request, res: {} as any } as any);
    expect(context.user?.id).toBe(81002);
    expect(context.authMode).toBe("guest");
    expect(context.isDemo).toBe(false);
  });

  it("keeps a preserved owner session isolated whenever a valid Demo session is active", async () => {
    state.user = {
      id: 81001,
      openId: "auth_email_81001",
      name: "Verified test user",
      email: "verified@example.test",
      loginMethod: "email_password",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const demo = createDemoSession();
    const request = { headers: { cookie: `${FIRST_PARTY_SESSION_COOKIE}=opaque-session-token; ${DEMO_SESSION_COOKIE}=${demo.token}` } } as any;
    const context = await createContext({ req: request, res: {} as any } as any);
    expect(context.user).toBeNull();
    expect(context.authMode).toBe("demo");
    expect(context.isDemo).toBe(true);
  });
});
