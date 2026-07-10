/**
 * Bounded-concurrency mapper (the scan fan-out's bulkhead against unbounded
 * parallelism).
 *
 * Runs `fn` over `items` with at most `limit` invocations in flight, preserving
 * input order in the result array.
 *
 * Contract: `fn` must not reject — the connector runtime converts every
 * failure into a result value. A rejection here is a bug and will propagate.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit < 1) {
    throw new Error(`Concurrency limit must be >= 1, got ${limit}`);
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
