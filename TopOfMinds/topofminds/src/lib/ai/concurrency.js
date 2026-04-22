/**
 * Run tasks with a concurrency cap. Preserves input order in results array.
 */
export async function pLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      try {
        results[i] = await mapper(items[i], i);
      } catch (error) {
        results[i] = { error };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
