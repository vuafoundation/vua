import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Signed, stateless session token. Format: base64url(payload) + "." +
 * base64url(hmac). Not a JWT (no need for the header/alg-confusion
 * surface) — just a minimal signed envelope for one fact: "a human
 * who knows OAUTH_OWNER_PASSCODE approved this browser, at this
 * time, for this principal".
 */
export interface SessionPayload {
  principal_id: string;
  issued_at: number;
  expires_at: number;
}

export class SessionSigner {
  constructor(private readonly secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error("OAUTH_SESSION_SECRET must be set and at least 16 chars — refusing to run with a weak/default secret");
    }
  }

  sign(payload: SessionPayload): string {
    const body = base64url(Buffer.from(JSON.stringify(payload)));
    const mac = base64url(createHmac("sha256", this.secret).update(body).digest());
    return `${body}.${mac}`;
  }

  /** Returns the payload if the signature is valid and not expired, else null. Never throws on malformed input. */
  verify(token: string | undefined): SessionPayload | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, mac] = parts;
    const expectedMac = base64url(createHmac("sha256", this.secret).update(body).digest());
    if (!safeEqual(mac, expectedMac)) return null;
    let payload: SessionPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (typeof payload.expires_at !== "number" || Date.now() > payload.expires_at) return null;
    return payload;
  }
}

export function newCsrfToken(): string {
  return base64url(randomBytes(24));
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
