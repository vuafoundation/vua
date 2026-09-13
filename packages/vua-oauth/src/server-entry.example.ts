/**
 * Example production wiring. Copy the shape of this into VUA's real
 * server.ts / mcp-server.ts — this file exists to show exactly what
 * env vars are required and how the pieces connect; it is not meant
 * to be imported as-is if VUA's HTTP entrypoint already exists
 * elsewhere.
 */
import { createServer } from "node:http";
import { OAuthServer } from "./http.js";
import { SqliteOAuthStore } from "./sqlite-store.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name} — refusing to start without it`);
  }
  return v;
}

const BASE_URL = requireEnv("VUA_PUBLIC_BASE_URL"); // e.g. https://ais-pre-....run.app
const DB_PATH = process.env.OAUTH_DB_PATH ?? "/tmp/vua-oauth.db"; // mount a persistent disk if available; /tmp survives process life on a pinned single instance
const store = new SqliteOAuthStore(DB_PATH);

const oauth = new OAuthServer({
  baseUrl: BASE_URL,
  store,
  ownerPrincipalId: requireEnv("OAUTH_OWNER_PRINCIPAL_ID"), // e.g. "scoobiii"
  ownerPasscode: requireEnv("OAUTH_OWNER_PASSCODE"), // >= 12 chars, set via Cloud Run secret, never in source
  sessionSecret: requireEnv("OAUTH_SESSION_SECRET"), // >= 16 chars, random; rotate to force everyone to re-approve
});

// Periodic housekeeping — not required for correctness, only disk hygiene.
setInterval(() => store.purgeExpired(), 60 * 60_000).unref();

const server = createServer(async (req, res) => {
  const handledByOAuth = await oauth.handle(req, res);
  if (handledByOAuth) return;

  if (req.url === "/mcp") {
    let principalId: string;
    try {
      const token = oauth.requireBearer(req);
      principalId = token.principal_id;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.code ?? "invalid_token", error_description: e.message }));
      return;
    }
    // Hand off to the real MCP JSON-RPC handler, now that transport
    // auth has passed. `principalId` is transport identity only —
    // it does NOT substitute for the `authorization` block a
    // vortex.execute call must still carry, and it does NOT
    // substitute for a GOS3 approval_token on a `required` operation.
    // await handleMcpJsonRpc(req, res, { principalId });
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_implemented", error_description: "wire handleMcpJsonRpc here" }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`vua listening on :${port}, OAuth issuer = ${BASE_URL}`);
});
