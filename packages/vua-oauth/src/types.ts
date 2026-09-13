/**
 * OAuth 2.1 Authorization Server for MCP — types.
 *
 * Scope: exactly what Claude.ai's "Adicionar conector personalizado"
 * dialog needs when "Requer início de sessão" is ON:
 *   - RFC 9728  (OAuth Protected Resource Metadata)
 *   - RFC 8414  (OAuth Authorization Server Metadata)
 *   - RFC 7591  (Dynamic Client Registration)
 *   - RFC 7636  (PKCE) — S256 only, "plain" is rejected
 *   - RFC 6749  (Authorization Code grant)
 *
 * This module never becomes the GOS3 approval_token. It only answers
 * "is this caller allowed to talk to /mcp at all" (transport auth).
 * The approval_token for a specific mutating operation (write_branch_commit,
 * merge_pr, ...) is a SEPARATE, per-operation artifact checked by GOS3 —
 * see spec/gos3.md. Collapsing the two was the exact gap flagged before
 * this module existed.
 */

export interface RegisteredClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none"; // public client (PKCE-only), matches Claude's DCR
  created_at: number;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  resource?: string;
  principal_id: string;
  issued_at: number;
  expires_at: number;
  consumed: boolean;
}

export interface AccessToken {
  token: string;
  client_id: string;
  principal_id: string;
  resource?: string;
  issued_at: number;
  expires_at: number;
  revoked: boolean;
}

export interface OAuthStore {
  saveClient(client: RegisteredClient): void;
  getClient(clientId: string): RegisteredClient | undefined;

  saveCode(code: AuthorizationCode): void;
  getCode(code: string): AuthorizationCode | undefined;
  consumeCode(code: string): void;

  saveToken(token: AccessToken): void;
  getToken(token: string): AccessToken | undefined;
  revokeToken(token: string): void;
}

export class OAuthError extends Error {
  constructor(
    public readonly code:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "unauthorized_client"
      | "unsupported_grant_type"
      | "invalid_redirect_uri"
      | "invalid_token",
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}
