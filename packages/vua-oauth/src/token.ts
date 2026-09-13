import { randomBytes } from "node:crypto";
import { base64url, verifyPkce } from "./pkce.js";
import { OAuthError, type AccessToken, type OAuthStore } from "./types.js";

export interface TokenRequest {
  grant_type: string;
  code: string;
  redirect_uri: string;
  client_id: string;
  code_verifier: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
}

const ACCESS_TOKEN_TTL_MS = 60 * 60_000; // 1h — short-lived transport auth, not a long-lived secret

export function issueToken(req: TokenRequest, store: OAuthStore): TokenResponse {
  if (req.grant_type !== "authorization_code") {
    throw new OAuthError("unsupported_grant_type", `grant_type '${req.grant_type}' is not supported`);
  }

  const record = store.getCode(req.code);
  if (!record) {
    throw new OAuthError("invalid_grant", "unknown or expired authorization code");
  }

  // Anti-replay: a code is valid for exactly one token exchange.
  if (record.consumed) {
    throw new OAuthError("invalid_grant", "authorization code has already been used");
  }
  if (Date.now() > record.expires_at) {
    throw new OAuthError("invalid_grant", "authorization code has expired");
  }
  if (record.client_id !== req.client_id) {
    throw new OAuthError("invalid_grant", "client_id does not match the client the code was issued to");
  }
  if (record.redirect_uri !== req.redirect_uri) {
    throw new OAuthError("invalid_grant", "redirect_uri does not match the one used at /authorize");
  }
  if (!verifyPkce(req.code_verifier, record.code_challenge)) {
    throw new OAuthError("invalid_grant", "code_verifier does not match the code_challenge");
  }

  // Consume immediately — before minting the token — so a concurrent
  // duplicate exchange (racing on the same code) cannot both succeed.
  store.consumeCode(req.code);

  const token: AccessToken = {
    token: `vat_${base64url(randomBytes(32))}`, // vat = Vortex Access Token
    client_id: record.client_id,
    principal_id: record.principal_id,
    resource: record.resource,
    issued_at: Date.now(),
    expires_at: Date.now() + ACCESS_TOKEN_TTL_MS,
    revoked: false,
  };
  store.saveToken(token);

  return {
    access_token: token.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
  };
}

/** Middleware-style check for the /mcp endpoint. */
export function verifyAccessToken(bearer: string | undefined, store: OAuthStore): AccessToken {
  if (!bearer || !bearer.startsWith("Bearer ")) {
    throw new OAuthError("invalid_token", "missing Authorization: Bearer header");
  }
  const raw = bearer.slice("Bearer ".length);
  const token = store.getToken(raw);
  if (!token) {
    throw new OAuthError("invalid_token", "unknown access token");
  }
  if (token.revoked) {
    throw new OAuthError("invalid_token", "access token has been revoked");
  }
  if (Date.now() > token.expires_at) {
    throw new OAuthError("invalid_token", "access token has expired");
  }
  return token;
}
