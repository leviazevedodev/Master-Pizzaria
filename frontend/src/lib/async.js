export async function settleWithConcurrency(entries, concurrency = 2) {
  const limit = Math.max(1, Math.trunc(Number(concurrency) || 1));
  const results = new Array(entries.length);
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      try {
        results[index] = {
          status: "fulfilled",
          value: await entries[index][1](),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, entries.length) }, () => worker()),
  );
  return results;
}
