import { describe, expect, it } from "vitest";
import { manusHeartbeatSessionFromCookie } from "./manusHeartbeatSession";

describe("manusHeartbeatSessionFromCookie", () => {
  it("returns the decoded Manus app session rather than the SmartBuild personal-session cookie", () => {
    const session = manusHeartbeatSessionFromCookie("smart_builder_personal=personal_42; app_session_id=header.payload.signature");
    expect(session).toBe("header.payload.signature");
  });

  it("returns an empty session when the Manus cookie is absent", () => {
    expect(manusHeartbeatSessionFromCookie("smart_builder_personal=personal_42")).toBe("");
  });
});
