import assert from "node:assert/strict";
import test from "node:test";
import { guestCodeHash, guestCodeMatches, guestOrderWhere, signGuestOrderToken, verifyGuestOrderToken } from "../src/guest-order-access.js";
import jwt from "jsonwebtoken";

const secret = "a secure test secret with more than 32 characters";

test("histórico do visitante consulta somente e-mail verificado e sem usuário cadastrado", () => {
  const email = "cliente@example.com";
  const token = signGuestOrderToken(email, secret);
  assert.equal(verifyGuestOrderToken(token, secret), email);
  assert.deepEqual(guestOrderWhere(email), { userId: null, customerEmail: email, fulfillmentType: { not: "DINE_IN" } });
  const accountToken = jwt.sign({ id: "different-customer" }, secret, { algorithm: "HS256" });
  assert.throws(() => verifyGuestOrderToken(accountToken, secret));
  assert.throws(() => verifyGuestOrderToken(signGuestOrderToken("outro@example.com", secret), "wrong-secret"));
});

test("código de outro cliente não valida o acesso", () => {
  const hash = guestCodeHash("cliente@example.com", "123456", secret);
  assert.equal(guestCodeMatches(hash, "cliente@example.com", "123456", secret), true);
  assert.equal(guestCodeMatches(hash, "outro@example.com", "123456", secret), false);
  assert.equal(guestCodeMatches(hash, "cliente@example.com", "123457", secret), false);
});
