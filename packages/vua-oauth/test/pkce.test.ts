import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { verifyPkce, base64url } from "../src/pkce.js";

function makeVerifierAndChallenge() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

test("PKCE: correct S256 verifier/challenge pair verifies", () => {
  const { verifier, challenge } = makeVerifierAndChallenge();
  assert.equal(verifyPkce(verifier, challenge), true);
});

test("PKCE: mismatched verifier is rejected", () => {
  const { challenge } = makeVerifierAndChallenge();
  const wrongVerifier = base64url(randomBytes(32));
  assert.equal(verifyPkce(wrongVerifier, challenge), false);
});

test("PKCE: 'plain' method (verifier == challenge, no hashing) is rejected", () => {
  const verifier = base64url(randomBytes(32));
  // A 'plain' PKCE client would send code_challenge = code_verifier verbatim.
  const plainChallenge = verifier;
  assert.equal(verifyPkce(verifier, plainChallenge), false, "plain-method challenges must never verify against S256 check");
});

test("PKCE: malformed verifier (bad charset) is rejected before hashing", () => {
  const { challenge } = makeVerifierAndChallenge();
  assert.equal(verifyPkce("not a valid verifier!!", challenge), false);
});
