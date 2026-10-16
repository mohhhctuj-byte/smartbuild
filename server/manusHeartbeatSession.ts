import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "../shared/const";

/**
 * Forge attributes a user-owned Heartbeat job from the decoded Manus session
 * token, not from SmartBuild's personal-workspace cookie or the raw header.
 */
export function manusHeartbeatSessionFromCookie(cookieHeader: string | undefined) {
  return parseCookieHeader(cookieHeader ?? "")[COOKIE_NAME] ?? "";
}
