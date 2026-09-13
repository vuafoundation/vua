import type { AccessToken, AuthorizationCode, OAuthStore, RegisteredClient } from "./types.js";

/**
 * In-memory reference store. Fine for a single-instance Cloud Run
 * service with min-instances=1; swap for a shared store (Redis, a
 * table) the moment you run more than one instance, since codes and
 * tokens issued on instance A would be invisible to instance B.
 */
export class InMemoryOAuthStore implements OAuthStore {
  private clients = new Map<string, RegisteredClient>();
  private codes = new Map<string, AuthorizationCode>();
  private tokens = new Map<string, AccessToken>();

  saveClient(client: RegisteredClient): void {
    this.clients.set(client.client_id, client);
  }
  getClient(clientId: string): RegisteredClient | undefined {
    return this.clients.get(clientId);
  }

  saveCode(code: AuthorizationCode): void {
    this.codes.set(code.code, code);
  }
  getCode(code: string): AuthorizationCode | undefined {
    return this.codes.get(code);
  }
  consumeCode(code: string): void {
    const c = this.codes.get(code);
    if (c) c.consumed = true;
  }

  saveToken(token: AccessToken): void {
    this.tokens.set(token.token, token);
  }
  getToken(token: string): AccessToken | undefined {
    return this.tokens.get(token);
  }
  revokeToken(token: string): void {
    const t = this.tokens.get(token);
    if (t) t.revoked = true;
  }
}
