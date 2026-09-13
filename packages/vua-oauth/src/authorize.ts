import { randomUUID } from "node:crypto";
import { base64url } from "./pkce.js";
import { OAuthError, type AuthorizationCode, type OAuthStore } from "./types.js";
import { randomBytes } from "node:crypto";

export interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  resource?: string;
  state?: string;
}

const CODE_TTL_MS = 60_000; // authorization codes are short-lived by design

/**
 * Validates the request and, if a human principal has approved this
 * session (see `approve` — kept out of this function so the caller
 * can insert a real consent screen), issues a single-use code.
 *
 * Security property demonstrated in the wild (see the "Client
 * Credential Isolation" writeup referenced in review): redirect_uri
 * MUST be checked against the URIs the client registered with, not
 * just be present. Knowing a client_id is not enough to receive a
 * code at an arbitrary callback.
 */
export function authorize(
  params: AuthorizeParams,
  principalId: string,
  store: OAuthStore,
): { code: string; redirect_uri: string; state?: string } {
  if (params.response_type !== "code") {
    throw new OAuthError("invalid_request", "only response_type=code is supported");
  }
  if (params.code_challenge_method !== "S256") {
    throw new OAuthError("invalid_request", "code_challenge_method must be S256 ('plain' is rejected)");
  }
  if (!params.code_challenge || params.code_challenge.length < 43) {
    throw new OAuthError("invalid_request", "code_challenge missing or too short");
  }

  const client = store.getClient(params.client_id);
  if (!client) {
    throw new OAuthError("invalid_client", `unknown client_id '${params.client_id}'`);
  }
  if (!client.redirect_uris.includes(params.redirect_uri)) {
    // Do not redirect on this failure — redirecting to an
    // attacker-controlled URI here would leak the fact that the
    // client_id is valid. Fail closed, in-band.
    throw new OAuthError(
      "invalid_redirect_uri",
      `redirect_uri '${params.redirect_uri}' is not registered for client '${params.client_id}'`,
    );
  }

  const code = base64url(randomBytes(32));
  const record: AuthorizationCode = {
    code,
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: "S256",
    resource: params.resource,
    principal_id: principalId,
    issued_at: Date.now(),
    expires_at: Date.now() + CODE_TTL_MS,
    consumed: false,
  };
  store.saveCode(record);

  return { code, redirect_uri: params.redirect_uri, state: params.state };
}

export function newSessionId(): string {
  return randomUUID();
}
