import type { IncomingMessage, ServerResponse } from "node:http";
import { authorize } from "./authorize.js";
import { ConsentGate } from "./consent.js";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata.js";
import { clientIp, RateLimiter } from "./ratelimit.js";
import { registerClient } from "./register.js";
import { revokeToken } from "./revoke.js";
import { SessionSigner } from "./session.js";
import { issueToken, verifyAccessToken } from "./token.js";
import { OAuthError, type OAuthStore } from "./types.js";

const MAX_BODY_BYTES = 1_048_576;

export interface OAuthServerConfig {
  baseUrl: string;
  store: OAuthStore;
  /** The one principal this VUA instance represents. */
  ownerPrincipalId: string;
  /** Read from an env var (e.g. process.env.OAUTH_OWNER_PASSCODE) — never hardcode. */
  ownerPasscode: string;
  /** Read from an env var (e.g. process.env.OAUTH_SESSION_SECRET) — never hardcode. Rotate to invalidate all sessions. */
  sessionSecret: string;
}

/**
 * Mounts the full OAuth surface (metadata, DCR, authorize+consent,
 * token, revoke) onto an existing node:http server. See spec/oauth.md
 * for the normative description of every endpoint and failure mode.
 */
export class OAuthServer {
  private readonly store: OAuthStore;
  private readonly consent: ConsentGate;
  private readonly registerLimiter = new RateLimiter(10, 60_000); // 10 registrations/min/IP
  private readonly tokenLimiter = new RateLimiter(30, 60_000); // 30 token exchanges/min/IP
  private readonly baseUrl: string;

  constructor(config: OAuthServerConfig) {
    this.baseUrl = config.baseUrl;
    this.store = config.store;
    const signer = new SessionSigner(config.sessionSecret);
    this.consent = new ConsentGate(config.ownerPrincipalId, config.ownerPasscode, signer);
  }

  getStore(): OAuthStore {
    return this.store;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", this.baseUrl);

    try {
      if (url.pathname === "/.well-known/oauth-protected-resource" && req.method === "GET") {
        return json(res, 200, protectedResourceMetadata(this.baseUrl));
      }

      if (url.pathname === "/.well-known/oauth-authorization-server" && req.method === "GET") {
        return json(res, 200, authorizationServerMetadata(this.baseUrl));
      }

      if (url.pathname === "/register" && req.method === "POST") {
        if (!this.registerLimiter.allow(clientIp(req as any))) {
          return json(res, 429, { error: "rate_limited", error_description: "too many registration attempts" });
        }
        const body = await readJson(req);
        const result = registerClient(body, this.store);
        return json(res, 201, result);
      }

      if (url.pathname === "/authorize" && req.method === "GET") {
        return this.handleAuthorizeGet(req, res, url);
      }

      if (url.pathname === "/authorize/approve" && req.method === "POST") {
        return this.handleAuthorizeApprove(req, res);
      }

      if (url.pathname === "/token" && req.method === "POST") {
        if (!this.tokenLimiter.allow(clientIp(req as any))) {
          return json(res, 429, { error: "rate_limited", error_description: "too many token requests" });
        }
        const body = await readForm(req);
        const result = issueToken(
          {
            grant_type: body.grant_type ?? "",
            code: body.code ?? "",
            redirect_uri: body.redirect_uri ?? "",
            client_id: body.client_id ?? "",
            code_verifier: body.code_verifier ?? "",
          },
          this.store,
        );
        return json(res, 200, result);
      }

      if (url.pathname === "/revoke" && req.method === "POST") {
        const body = await readForm(req);
        revokeToken(body.token ?? "", this.store);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        return true;
      }

      return false;
    } catch (err) {
      if (err instanceof OAuthError) {
        const status = err.code === "invalid_client" || err.code === "invalid_token" ? 401 : 400;
        return json(res, status, { error: err.code, error_description: err.message });
      }
      return json(res, 500, { error: "server_error", error_description: (err as Error).message });
    }
  }

  private handleAuthorizeGet(req: IncomingMessage, res: ServerResponse, url: URL): true {
    const sessionPrincipal = this.consent.checkSession(req.headers.cookie);
    const params = {
      response_type: url.searchParams.get("response_type") ?? "",
      client_id: url.searchParams.get("client_id") ?? "",
      redirect_uri: url.searchParams.get("redirect_uri") ?? "",
      code_challenge: url.searchParams.get("code_challenge") ?? "",
      code_challenge_method: url.searchParams.get("code_challenge_method") ?? "",
      resource: url.searchParams.get("resource") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };

    if (sessionPrincipal) {
      // Already approved this browser recently — skip the passcode prompt.
      const { code, redirect_uri, state } = authorize(params, sessionPrincipal, this.store);
      const location = new URL(redirect_uri);
      location.searchParams.set("code", code);
      if (state) location.searchParams.set("state", state);
      res.writeHead(302, { Location: location.toString() });
      res.end();
      return true;
    }

    // No valid session — show the real consent screen. Re-validate the
    // OAuth params up front so a broken request fails before the human
    // even sees the passcode prompt.
    if (params.response_type !== "code" || params.code_challenge_method !== "S256" || !this.store.getClient(params.client_id)) {
      json(res, 400, { error: "invalid_request", error_description: "malformed authorization request" });
      return true;
    }

    const { html } = this.consent.renderForm(url.searchParams.toString());
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  }

  private async handleAuthorizeApprove(req: IncomingMessage, res: ServerResponse): Promise<true> {
    const body = await readForm(req);
    let setCookie: string;
    try {
      setCookie = this.consent.approve(body.csrf ?? "", body.passcode ?? "");
    } catch (err) {
      if (err instanceof OAuthError) {
        const { html } = this.consent.renderForm(body.return_query ?? "", err.message);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return true;
      }
      throw err;
    }

    // Re-run the original /authorize request now that a session exists.
    const returnUrl = new URL(`${this.baseUrl}/authorize?${body.return_query ?? ""}`);
    res.writeHead(303, { Location: returnUrl.toString(), "Set-Cookie": setCookie });
    res.end();
    return true;
  }

  /** Use inside the /mcp handler to enforce transport auth before any tool call. */
  requireBearer(req: IncomingMessage): ReturnType<typeof verifyAccessToken> {
    return verifyAccessToken(req.headers["authorization"], this.store);
  }
}

function json(res: ServerResponse, status: number, body: unknown): true {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
  return true;
}

async function readJson(req: IncomingMessage): Promise<any> {
  const raw = await readBody(req);
  return raw ? JSON.parse(raw) : {};
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readBody(req);
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        reject(new OAuthError("invalid_request", "request body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
