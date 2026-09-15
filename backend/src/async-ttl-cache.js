export function createAsyncTtlCache({ ttlMs = 1_000, maxEntries = 500 } = {}) {
  const values = new Map();
  const pending = new Map();
  let generation = 0;

  async function get(key, loader) {
    const cached = values.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) values.delete(key);
    if (pending.has(key)) return pending.get(key);

    const requestGeneration = generation;
    const request = Promise.resolve().then(loader);
    pending.set(key, request);
    try {
      const value = await request;
      // Uma revogação pode limpar o cache enquanto a consulta ainda está em
      // voo. Nesse caso, não deixe o resultado anterior repovoar o cache.
      if (requestGeneration === generation) {
        if (values.size >= maxEntries) values.delete(values.keys().next().value);
        values.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    } finally {
      if (pending.get(key) === request) pending.delete(key);
    }
  }

  return {
    get,
    clear() {
      generation += 1;
      values.clear();
      pending.clear();
    },
  };
}
