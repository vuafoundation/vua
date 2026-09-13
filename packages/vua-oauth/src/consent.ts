import { timingSafeEqual } from "node:crypto";
import { newCsrfToken, SessionSigner } from "./session.js";
import { OAuthError } from "./types.js";

const SESSION_TTL_MS = 12 * 60 * 60_000; // 12h — re-approve daily-ish, not on every token refresh
const CSRF_TTL_MS = 5 * 60_000;

interface PendingCsrf {
  token: string;
  expires_at: number;
}

/**
 * Single-operator consent gate. There is exactly one principal
 * (OAUTH_OWNER_PRINCIPAL_ID) and exactly one passphrase
 * (OAUTH_OWNER_PASSCODE) that authorizes it. This is intentionally
 * NOT a general-purpose login system — it is sized for "one person
 * owns this VUA instance and occasionally re-approves a client
 * device/browser". A multi-tenant VUA would replace this module
 * with real user accounts; the OAuthServer wiring does not care how
 * `resolvePrincipal` decides, only that it returns a principal_id or
 * throws.
 */
export class ConsentGate {
  private readonly csrfTokens = new Map<string, PendingCsrf>();

  constructor(
    private readonly ownerPrincipalId: string,
    private readonly ownerPasscode: string,
    private readonly signer: SessionSigner,
  ) {
    if (!ownerPasscode || ownerPasscode.length < 12) {
      throw new Error("OAUTH_OWNER_PASSCODE must be set and at least 12 chars — refusing to run with a weak/default passcode");
    }
  }

  /** Returns the approved principal_id if the session cookie is valid, else null. */
  checkSession(cookieHeader: string | undefined): string | null {
    const token = parseCookie(cookieHeader, "vua_session");
    const payload = this.signer.verify(token);
    return payload ? payload.principal_id : null;
  }

  /** Renders the consent form. Every render gets a fresh, single-use CSRF token. */
  renderForm(returnQuery: string, error?: string): { html: string; setCsrfCookie: string } {
    const csrf = newCsrfToken();
    this.csrfTokens.set(csrf, { token: csrf, expires_at: Date.now() + CSRF_TTL_MS });
    this.gc();

    const errorHtml = error
      ? `<p style="color:#b00020">${escapeHtml(error)}</p>`
      : "";

    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Autorizar acesso — VUA</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;max-width:420px;margin:4rem auto;padding:0 1rem;color:#111}
  input{width:100%;padding:.6rem;margin:.4rem 0 1rem;box-sizing:border-box;font-size:1rem}
  button{width:100%;padding:.7rem;font-size:1rem;cursor:pointer}
</style></head>
<body>
  <h1>Autorizar acesso ao VUA</h1>
  <p>Um cliente está solicitando acesso governado ao seu VUA como <strong>${escapeHtml(this.ownerPrincipalId)}</strong>.</p>
  ${errorHtml}
  <form method="POST" action="/authorize/approve">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="return_query" value="${escapeHtml(returnQuery)}">
    <label for="passcode">Senha do operador</label>
    <input type="password" id="passcode" name="passcode" autofocus required>
    <button type="submit">Autorizar</button>
  </form>
</body></html>`;

    return { html, setCsrfCookie: "" };
  }

  /** Validates the submitted form and, on success, returns a Set-Cookie value carrying the signed session. */
  approve(csrf: string, passcode: string): string {
    const pending = this.csrfTokens.get(csrf);
    if (!pending || Date.now() > pending.expires_at) {
      throw new OAuthError("invalid_request", "consent form expired or invalid — reload and try again");
    }
    this.csrfTokens.delete(csrf); // single-use

    if (!safeEqualStrings(passcode, this.ownerPasscode)) {
      throw new OAuthError("invalid_request", "senha incorreta");
    }

    const token = this.signer.sign({
      principal_id: this.ownerPrincipalId,
      issued_at: Date.now(),
      expires_at: Date.now() + SESSION_TTL_MS,
    });
    return `vua_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, v] of this.csrfTokens) {
      if (now > v.expires_at) this.csrfTokens.delete(k);
    }
  }
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
