import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { authorize } from "../src/authorize.js";
import { registerClient } from "../src/register.js";
import { InMemoryOAuthStore } from "../src/store.js";
import { base64url } from "../src/pkce.js";
import { OAuthError } from "../src/types.js";

function s256Challenge(verifier: string) {
  return base64url(createHash("sha256").update(verifier).digest());
}

test("REDIRECT ISOLATION: a valid client_id does not authorize an unregistered redirect_uri", () => {
  const store = new InMemoryOAuthStore();
  const client = registerClient({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, store);
  const verifier = base64url(randomBytes(32));

  assert.throws(
    () =>
      authorize(
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: "https://attacker.example.com/callback", // NOT registered
          code_challenge: s256Challenge(verifier),
          code_challenge_method: "S256",
        },
        "scoobiii",
        store,
      ),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_redirect_uri",
  );
});

test("REDIRECT ISOLATION: the registered redirect_uri is accepted", () => {
  const store = new InMemoryOAuthStore();
  const client = registerClient({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, store);
  const verifier = base64url(randomBytes(32));

  const result = authorize(
    {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_challenge: s256Challenge(verifier),
      code_challenge_method: "S256",
    },
    "scoobiii",
    store,
  );
  assert.ok(result.code.length > 0);
});

test("REDIRECT ISOLATION: unregistered client_id is rejected outright", () => {
  const store = new InMemoryOAuthStore();
  const verifier = base64url(randomBytes(32));
  assert.throws(
    () =>
      authorize(
        {
          response_type: "code",
          client_id: "client-does-not-exist",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          code_challenge: s256Challenge(verifier),
          code_challenge_method: "S256",
        },
        "scoobiii",
        store,
      ),
    (err: unknown) => err instanceof OAuthError && err.code === "invalid_client",
  );
});
