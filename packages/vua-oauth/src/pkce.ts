import { createHash, timingSafeEqual } from "node:crypto";

/**
 * RFC 7636 §4.6. OAuth 2.1 mandates PKCE for all authorization-code
 * clients and drops the 'plain' method for anything but constrained
 * devices that cannot compute SHA-256 — a browser-driven Claude.ai
 * flow always can, so 'plain' is refused outright here, not just
 * discouraged.
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
    return false; // RFC 7636 §4.1 charset/length
  }
  const computed = base64url(createHash("sha256").update(codeVerifier).digest());
  return safeEqualStrings(computed, codeChallenge);
}

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
