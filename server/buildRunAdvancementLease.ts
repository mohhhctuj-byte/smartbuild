/**
 * A lease only decides which worker may advance a Build Run. The winner must
 * still execute the latest durable payload, not the request-scoped object it
 * held before acquiring the lease.
 */
export function authoritativeBuildRunSnapshot<T>(staleSnapshot: T, durableSnapshot: T | null | undefined): T {
  return durableSnapshot ?? staleSnapshot;
}

/**
 * A worker that did not acquire the lease must not report its request-scoped
 * copy as current. Its only truthful result is a fresh durable read, falling
 * back only if the Build Run was removed between the conditional update and
 * the lookup.
 */
export async function snapshotAfterRejectedLease<T>(loadDurable: () => Promise<T | null | undefined>, fallbackSnapshot: T): Promise<T> {
  return (await loadDurable()) ?? fallbackSnapshot;
}
