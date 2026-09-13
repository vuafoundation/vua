import { DatabaseSync } from "node:sqlite";
import type { AccessToken, AuthorizationCode, OAuthStore, RegisteredClient } from "./types.js";

/**
 * Persistence strategy for this module (documented here because it's
 * a real production constraint, not an afterthought):
 *
 *   - Cloud Run instance-local disk is ephemeral: it survives process
 *     restarts WITHIN the same instance but is wiped on a fresh
 *     deploy or when the instance is recycled.
 *   - This store is therefore correct and safe ONLY when the service
 *     is pinned to exactly one instance (min-instances=1 AND
 *     max-instances=1). With more than one instance, a code or token
 *     issued on instance A is invisible to instance B — authorize()
 *     on A followed by token exchange routed to B would fail.
 *   - For a real multi-instance deployment, swap this for a managed
 *     store (Cloud SQL, Firestore, Memorystore/Redis) behind the same
 *     OAuthStore interface — nothing else in this module changes.
 *
 * A solo-operator VUA instance does not need multi-instance scaling;
 * pinning to 1 instance is the correct, honest tradeoff here, not a
 * shortcut.
 */
export class SqliteOAuthStore implements OAuthStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        client_id TEXT PRIMARY KEY,
        client_name TEXT,
        redirect_uris TEXT NOT NULL,
        token_endpoint_auth_method TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        code_challenge_method TEXT NOT NULL,
        resource TEXT,
        principal_id TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        resource TEXT,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_codes_expires ON codes(expires_at);
      CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);
    `);
  }

  saveClient(client: RegisteredClient): void {
    this.db
      .prepare(
        `INSERT INTO clients (client_id, client_name, redirect_uris, token_endpoint_auth_method, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(client.client_id, client.client_name ?? null, JSON.stringify(client.redirect_uris), client.token_endpoint_auth_method, client.created_at);
  }

  getClient(clientId: string): RegisteredClient | undefined {
    const row = this.db.prepare(`SELECT * FROM clients WHERE client_id = ?`).get(clientId) as any;
    if (!row) return undefined;
    return {
      client_id: row.client_id,
      client_name: row.client_name ?? undefined,
      redirect_uris: JSON.parse(row.redirect_uris),
      token_endpoint_auth_method: row.token_endpoint_auth_method,
      created_at: row.created_at,
    };
  }

  saveCode(code: AuthorizationCode): void {
    this.db
      .prepare(
        `INSERT INTO codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, resource, principal_id, issued_at, expires_at, consumed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        code.code,
        code.client_id,
        code.redirect_uri,
        code.code_challenge,
        code.code_challenge_method,
        code.resource ?? null,
        code.principal_id,
        code.issued_at,
        code.expires_at,
      );
  }

  getCode(code: string): AuthorizationCode | undefined {
    const row = this.db.prepare(`SELECT * FROM codes WHERE code = ?`).get(code) as any;
    if (!row) return undefined;
    return {
      code: row.code,
      client_id: row.client_id,
      redirect_uri: row.redirect_uri,
      code_challenge: row.code_challenge,
      code_challenge_method: row.code_challenge_method,
      resource: row.resource ?? undefined,
      principal_id: row.principal_id,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      consumed: !!row.consumed,
    };
  }

  consumeCode(code: string): void {
    this.db.prepare(`UPDATE codes SET consumed = 1 WHERE code = ?`).run(code);
  }

  saveToken(token: AccessToken): void {
    this.db
      .prepare(
        `INSERT INTO tokens (token, client_id, principal_id, resource, issued_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(token.token, token.client_id, token.principal_id, token.resource ?? null, token.issued_at, token.expires_at);
  }

  getToken(token: string): AccessToken | undefined {
    const row = this.db.prepare(`SELECT * FROM tokens WHERE token = ?`).get(token) as any;
    if (!row) return undefined;
    return {
      token: row.token,
      client_id: row.client_id,
      principal_id: row.principal_id,
      resource: row.resource ?? undefined,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      revoked: !!row.revoked,
    };
  }

  revokeToken(token: string): void {
    this.db.prepare(`UPDATE tokens SET revoked = 1 WHERE token = ?`).run(token);
  }

  /** Call periodically (e.g. once per hour) — not required for correctness, only to bound disk growth. */
  purgeExpired(): void {
    const now = Date.now();
    this.db.prepare(`DELETE FROM codes WHERE expires_at < ?`).run(now);
    this.db.prepare(`DELETE FROM tokens WHERE expires_at < ?`).run(now);
  }

  close(): void {
    this.db.close();
  }
}
