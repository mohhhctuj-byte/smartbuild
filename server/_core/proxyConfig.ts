export type ProxyConfigurableApp = {
  set: (setting: string, value: unknown) => unknown;
};

/**
 * SmartBuild is served behind exactly one managed TLS proxy. Limiting Express
 * trust to that hop preserves the original HTTPS signal for secure cookies
 * without trusting arbitrary client supplied forwarding headers.
 */
export function configureTrustedProxy(app: ProxyConfigurableApp) {
  app.set("trust proxy", 1);
}
