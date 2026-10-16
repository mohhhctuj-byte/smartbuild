export type AuthStatus = {
  authenticated: boolean;
  sessionType?: "first_party" | "guest" | "demo" | "none";
  emailVerification: { state: "ready" | "blocked" };
};

export const BLOCKED_AUTH_STATUS: AuthStatus = {
  authenticated: false,
  emailVerification: { state: "blocked" },
};

/**
 * Auth delivery configuration is safety-critical: a request that cannot
 * complete quickly must fail closed rather than leaving the sign-in gate
 * indefinitely loading or implying that a verification email can be sent.
 */
export async function resolveAuthStatus(
  request: () => Promise<AuthStatus>,
  timeoutMs = 4_500,
): Promise<AuthStatus> {
  const timeout = new Promise<AuthStatus>(resolve => {
    setTimeout(() => resolve(BLOCKED_AUTH_STATUS), timeoutMs);
  });

  try {
    return await Promise.race([request(), timeout]);
  } catch {
    return BLOCKED_AUTH_STATUS;
  }
}
