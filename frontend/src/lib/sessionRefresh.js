export function isExpiredRefresh(error) {
  return error?.response?.status === 401 &&
    ["REFRESH_EXPIRED", "INVALID_SESSION", "AUTH_REQUIRED"].includes(error?.response?.data?.code);
}

export function installSessionRefresh(client, { onRefreshed, onExpired }) {
  let pending = null;
  let generation = 0;
  const reset = () => { generation += 1; pending = null; };
  async function refresh() {
    if (pending) return pending;
    const current = generation;
    const request = client.post("/auth/refresh", {}, {
      headers: { "X-Session-Refresh": "1" }, _skipAuthRefresh: true,
    }).then(({ data }) => {
      if (generation !== current) throw Object.assign(new Error("Renovação cancelada."), { code: "SESSION_CHANGED" });
      onRefreshed?.(data);
      return data;
    }).finally(() => { if (pending === request) pending = null; });
    pending = request;
    return request;
  }
  const interceptor = client.interceptors.response.use((response) => response, async (error) => {
    const config = error?.config;
    if (error?.response?.status !== 401 ||
      !["INVALID_SESSION", "AUTH_REQUIRED"].includes(error?.response?.data?.code) ||
      !config || config._retriedAfterRefresh || config._skipAuthRefresh) throw error;
    config._retriedAfterRefresh = true;
    const current = generation;
    let data;
    try { data = await refresh(); }
    catch (refreshError) {
      if (generation === current && isExpiredRefresh(refreshError)) onExpired?.();
      // Erros de rede, limite e banco continuam recuperáveis e não encerram a sessão.
      throw refreshError;
    }
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${data.token}`;
    return client(config);
  });
  return { refresh, reset, eject: () => client.interceptors.response.eject(interceptor) };
}
