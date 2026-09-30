/**
 * Run an async mapper over `items` with a bounded number of concurrent tasks.
 * Prevents flooding the backend/Google with a burst of simultaneous requests
 * (which causes some to be throttled and fail). Results are delivered via the
 * `onResult(item, value)` callback as each completes, so the UI can update
 * incrementally.
 *
 * @param {Array} items
 * @param {(item) => Promise<any>} mapper
 * @param {(item, value) => void} onResult
 * @param {number} concurrency  max tasks in flight (default 3)
 */
export async function mapWithConcurrency(items, mapper, onResult, concurrency = 3) {
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        const value = await mapper(item);
        onResult(item, value);
      } catch (e) {
        onResult(item, null);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}
