import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionSigner } from "../src/session.js";

test("SESSION: valid signed session verifies and returns the payload", () => {
  const signer = new SessionSigner("a-sufficiently-long-secret-value");
  const token = signer.sign({ principal_id: "scoobiii", issued_at: Date.now(), expires_at: Date.now() + 10_000 });
  const payload = signer.verify(token);
  assert.equal(payload?.principal_id, "scoobiii");
});

test("SESSION: tampering the payload (e.g. changing principal_id) invalidates the signature", () => {
  const signer = new SessionSigner("a-sufficiently-long-secret-value");
  const token = signer.sign({ principal_id: "scoobiii", issued_at: Date.now(), expires_at: Date.now() + 10_000 });
  const [body, mac] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ principal_id: "attacker", issued_at: Date.now(), expires_at: Date.now() + 10_000 })).toString("base64url");
  const forged = `${forgedPayload}.${mac}`;
  assert.equal(signer.verify(forged), null);
});

test("SESSION: expired session is rejected even with a valid signature", () => {
  const signer = new SessionSigner("a-sufficiently-long-secret-value");
  const token = signer.sign({ principal_id: "scoobiii", issued_at: Date.now() - 20_000, expires_at: Date.now() - 10_000 });
  assert.equal(signer.verify(token), null);
});

test("SESSION: malformed token never throws, just returns null", () => {
  const signer = new SessionSigner("a-sufficiently-long-secret-value");
  assert.equal(signer.verify("not-a-real-token"), null);
  assert.equal(signer.verify(""), null);
  assert.equal(signer.verify(undefined), null);
  assert.equal(signer.verify("a.b.c"), null);
});

test("SESSION: a token signed with a different secret does not verify (secret rotation invalidates sessions)", () => {
  const signerA = new SessionSigner("secret-A-long-enough-value");
  const signerB = new SessionSigner("secret-B-long-enough-value");
  const token = signerA.sign({ principal_id: "scoobiii", issued_at: Date.now(), expires_at: Date.now() + 10_000 });
  assert.equal(signerB.verify(token), null);
});

test("BOOT SAFETY: constructing a SessionSigner with a short/weak secret throws", () => {
  assert.throws(() => new SessionSigner("short"));
  assert.throws(() => new SessionSigner(""));
});
