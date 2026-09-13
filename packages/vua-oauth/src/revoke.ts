import type { OAuthStore } from "./types.js";

/**
 * RFC 7009. Per spec, revocation always returns 200 regardless of
 * whether the token existed, was already revoked, or was malformed —
 * this prevents the endpoint from being usable as a token-existence
 * oracle. We still no-op safely on an unknown token.
 */
export function revokeToken(token: string, store: OAuthStore): void {
  if (!token) return;
  const existing = store.getToken(token);
  if (existing) {
    store.revokeToken(token);
  }
}
