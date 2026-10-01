import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export function guestOrderWhere(email) {
  return { userId: null, customerEmail: email, fulfillmentType: { not: "DINE_IN" } };
}

export function guestCodeHash(email, code, secret) {
  return crypto.createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function guestCodeMatches(storedHash, email, code, secret) {
  const candidate = guestCodeHash(email, code, secret);
  return typeof storedHash === "string" && /^[a-f0-9]{64}$/i.test(storedHash) &&
    crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(candidate, "hex"));
}

export function signGuestOrderToken(email, secret) {
  return jwt.sign({ guestEmail: email }, secret, {
    algorithm: "HS256", audience: "guest-orders", issuer: "master-pizzaria", expiresIn: "30d",
  });
}

export function verifyGuestOrderToken(token, secret) {
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"], audience: "guest-orders", issuer: "master-pizzaria",
  });
  return typeof payload?.guestEmail === "string" ? payload.guestEmail : null;
}
