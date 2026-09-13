import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { authorize } from "../src/authorize.js";
import { registerClient } from "../src/register.js";
import { InMemoryOAuthStore } from "../src/store.js";
import { base64url } from "../src/pkce.js";
import { issueToken, verifyAccessToken } from "../src/token.js";
import { OAuthError } from "../src/types.js";

function s256Challenge(verifier: string) {
  return base64url(createHash("sha256").update(verifier).digest());
}

function setup() {
  const store = new InMemoryOAuthStore();
  const client = registerClient({ redirect_uris: ["https://claude.ai/callback"] }, store);
  const verifier = base64url(randomBytes(32));
  const { code } = authorize(
    {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://claude.ai/callback",
      code_challenge: s256Challenge(verifier),
      code_challenge_method: "S256",
    },
    "scoobiii",
    store,
  );
  return { store, client, verifier, code };
}

test("HAPPY PATH: code -> token -> bearer verifies end to end", () => {
  const { store, client, verifier, code } = setup();
  const tokenResp = issueToken(
    { grant_type: "authorization_code", code, redirect_uri: "https://claude.ai/callback", client_id: client.client_id, code_verifier: verifier },
    store,
  );
  assert.equal(tokenResp.token_type, "Bearer");
  const verified = verifyAccessToken(`Bearer ${tokenResp.access_token}`, store);
  assert.equal(verified.client_id, client.client_id);
  assert.equal(verified.principal_id, "scoobiii");
});

test("REPLAY: reusing a consumed authorization code is rejected", () => {
  const { store, client, verifier, code } = setup();
  issueToken(
    { grant_type: "authorization_code", code, redirect_uri: "https://claude.ai/callback", client_id: client.client_id, code_verifier: verifier },
    store,
  );
  assert.throws(
    () =>
      issueToken(
        { grant_type: "authorization_code", code, redirect_uri: "https://claude.ai/callback", client_id: client.client_id, code_verifier: verifier },
        store,
      ),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_grant",
  );
});

test("FORGE: wrong code_verifier at token exchange is rejected even with a valid code", () => {
  const { store, client, code } = setup();
  const wrongVerifier = base64url(randomBytes(32));
  assert.throws(
    () =>
      issueToken(
        { grant_type: "authorization_code", code, redirect_uri: "https://claude.ai/callback", client_id: client.client_id, code_verifier: wrongVerifier },
        store,
      ),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_grant",
  );
});

test("EXPIRED: an authorization code past its TTL is rejected", async () => {
  const { store, client, verifier, code } = setup();
  const record = store.getCode(code)!;
  record.expires_at = Date.now() - 1; // force expiry
  assert.throws(
    () =>
      issueToken(
        { grant_type: "authorization_code", code, redirect_uri: "https://claude.ai/callback", client_id: client.client_id, code_verifier: verifier },
        store,
      ),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_grant",
  );
});

test("REVOKED TOKEN: a revoked access token no longer authorizes /mcp", () => {
  const { store, client, verifier, code } = setup();
  const tokenResp = issueToken(
    { grant_type: "authorization_code", code, redirect_uri: "https://claude.ai/callback", client_id: client.client_id, code_verifier: verifier },
    store,
  );
  store.revokeToken(tokenResp.access_token);
  assert.throws(
    () => verifyAccessToken(`Bearer ${tokenResp.access_token}`, store),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_token",
  );
});

test("MISSING BEARER: /mcp access without any Authorization header is rejected", () => {
  const { store } = setup();
  assert.throws(
    () => verifyAccessToken(undefined, store),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_token",
  );
});
