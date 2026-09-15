import assert from "node:assert/strict";
import test from "node:test";
import {
  installSessionRefresh,
  isExpiredRefresh,
} from "../src/lib/sessionRefresh.js";

test("somente expiração autenticada encerra a sessão", () => {
  assert.equal(
    isExpiredRefresh({ response: { status: 401, data: { code: "REFRESH_EXPIRED" } } }),
    true,
  );
  assert.equal(
    isExpiredRefresh({ response: { status: 503, data: { code: "DATABASE_UNAVAILABLE" } } }),
    false,
  );
  assert.equal(isExpiredRefresh(new Error("Falha de rede")), false);
});

test("indisponibilidade no refresh não dispara sessão expirada", async () => {
  let responseError;
  let expired = 0;
  const unavailable = Object.assign(new Error("Banco indisponível"), {
    response: { status: 503, data: { code: "DATABASE_UNAVAILABLE" } },
  });
  const client = Object.assign(async (config) => ({ config }), {
    post: async () => { throw unavailable; },
    interceptors: {
      response: {
        use(_success, failure) {
          responseError = failure;
          return 1;
        },
        eject() {},
      },
    },
  });
  installSessionRefresh(client, { onExpired: () => { expired += 1; } });

  await assert.rejects(
    responseError({
      response: { status: 401, data: { code: "INVALID_SESSION" } },
      config: { headers: {} },
    }),
    unavailable,
  );
  assert.equal(expired, 0);
});
