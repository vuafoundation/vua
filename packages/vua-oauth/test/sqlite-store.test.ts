import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteOAuthStore } from "../src/sqlite-store.js";

function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "vua-oauth-test-"));
  return join(dir, "oauth.db");
}

test("SQLITE: a client saved by one store instance is visible from a fresh instance on the same file (simulates process restart)", () => {
  const dbPath = tmpDbPath();

  const storeA = new SqliteOAuthStore(dbPath);
  storeA.saveClient({
    client_id: "client-persist-1",
    client_name: "Test",
    redirect_uris: ["https://example.test/callback"],
    token_endpoint_auth_method: "none",
    created_at: Date.now(),
  });
  storeA.close(); // simulates the process exiting

  const storeB = new SqliteOAuthStore(dbPath); // simulates a fresh process start
  const client = storeB.getClient("client-persist-1");
  assert.ok(client, "client must survive a store restart on the same DB file");
  assert.deepEqual(client!.redirect_uris, ["https://example.test/callback"]);
  storeB.close();

  rmSync(dbPath, { force: true });
});

test("SQLITE: consumed code and revoked token flags persist across restart", () => {
  const dbPath = tmpDbPath();
  const storeA = new SqliteOAuthStore(dbPath);

  storeA.saveCode({
    code: "code-1",
    client_id: "c1",
    redirect_uri: "https://example.test/cb",
    code_challenge: "chal",
    code_challenge_method: "S256",
    principal_id: "scoobiii",
    issued_at: Date.now(),
    expires_at: Date.now() + 60_000,
    consumed: false,
  });
  storeA.consumeCode("code-1");

  storeA.saveToken({
    token: "tok-1",
    client_id: "c1",
    principal_id: "scoobiii",
    issued_at: Date.now(),
    expires_at: Date.now() + 60_000,
    revoked: false,
  });
  storeA.revokeToken("tok-1");
  storeA.close();

  const storeB = new SqliteOAuthStore(dbPath);
  assert.equal(storeB.getCode("code-1")?.consumed, true);
  assert.equal(storeB.getToken("tok-1")?.revoked, true);
  storeB.close();
  rmSync(dbPath, { force: true });
});

test("SQLITE: purgeExpired removes expired codes/tokens but keeps live ones", () => {
  const dbPath = tmpDbPath();
  const store = new SqliteOAuthStore(dbPath);

  store.saveCode({
    code: "expired-code", client_id: "c1", redirect_uri: "https://x/cb", code_challenge: "a",
    code_challenge_method: "S256", principal_id: "p", issued_at: Date.now() - 100_000,
    expires_at: Date.now() - 50_000, consumed: false,
  });
  store.saveCode({
    code: "live-code", client_id: "c1", redirect_uri: "https://x/cb", code_challenge: "a",
    code_challenge_method: "S256", principal_id: "p", issued_at: Date.now(),
    expires_at: Date.now() + 50_000, consumed: false,
  });

  store.purgeExpired();
  assert.equal(store.getCode("expired-code"), undefined);
  assert.ok(store.getCode("live-code"));
  store.close();
  rmSync(dbPath, { force: true });
});
