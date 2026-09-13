import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/ratelimit.js";
import { revokeToken } from "../src/revoke.js";
import { InMemoryOAuthStore } from "../src/store.js";

test("RATE LIMIT: allows up to the limit, then blocks within the window", () => {
  const rl = new RateLimiter(3, 60_000);
  assert.equal(rl.allow("1.2.3.4"), true);
  assert.equal(rl.allow("1.2.3.4"), true);
  assert.equal(rl.allow("1.2.3.4"), true);
  assert.equal(rl.allow("1.2.3.4"), false, "4th request within the window must be blocked");
});

test("RATE LIMIT: different keys (IPs) are tracked independently", () => {
  const rl = new RateLimiter(1, 60_000);
  assert.equal(rl.allow("ip-a"), true);
  assert.equal(rl.allow("ip-a"), false);
  assert.equal(rl.allow("ip-b"), true, "a different IP must not be affected by ip-a's limit");
});

test("RATE LIMIT: window reset allows requests again after windowMs elapses", async () => {
  const rl = new RateLimiter(1, 50);
  assert.equal(rl.allow("k"), true);
  assert.equal(rl.allow("k"), false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rl.allow("k"), true, "after the window elapses, requests should be allowed again");
});

test("REVOKE: revoking an existing token marks it revoked", () => {
  const store = new InMemoryOAuthStore();
  store.saveToken({ token: "t1", client_id: "c", principal_id: "p", issued_at: Date.now(), expires_at: Date.now() + 1000, revoked: false });
  revokeToken("t1", store);
  assert.equal(store.getToken("t1")?.revoked, true);
});

test("REVOKE: revoking an unknown token is a safe no-op (RFC 7009 — never reveals existence)", () => {
  const store = new InMemoryOAuthStore();
  assert.doesNotThrow(() => revokeToken("does-not-exist", store));
});

test("REVOKE: revoking an empty token string is a safe no-op", () => {
  const store = new InMemoryOAuthStore();
  assert.doesNotThrow(() => revokeToken("", store));
});
