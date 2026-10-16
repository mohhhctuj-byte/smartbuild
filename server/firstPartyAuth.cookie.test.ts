import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./firstPartyAuth";

function requestForCookieOptions(input: { protocol?: string; forwardedProto?: string } = {}) {
  return {
    protocol: input.protocol ?? "http",
    headers: input.forwardedProto ? { "x-forwarded-proto": input.forwardedProto } : {},
  } as Request;
}

describe("first-party session cookie policy", () => {
  it("uses the embedded-browser compatible policy on a proxied HTTPS deployment", () => {
    const expiresAt = new Date("2026-09-01T12:00:00.000Z");
    expect(authCookieOptions(requestForCookieOptions({ forwardedProto: "https" }), expiresAt)).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      expires: expiresAt,
    });
  });

  it("does not require Secure when local HTTP development cannot support it", () => {
    expect(authCookieOptions(requestForCookieOptions())).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: false,
    });
  });
});
