import { test } from "node:test";
import assert from "node:assert/strict";
import { ConsentGate } from "../src/consent.js";
import { SessionSigner } from "../src/session.js";
import { OAuthError } from "../src/types.js";

function makeGate() {
  const signer = new SessionSigner("session-secret-long-enough-value");
  return new ConsentGate("scoobiii", "correct-horse-battery-staple", signer);
}

test("CONSENT: correct passcode + valid csrf issues a working session cookie", () => {
  const gate = makeGate();
  const { html } = gate.renderForm("foo=bar");
  const csrf = extractCsrf(html);
  const setCookie = gate.approve(csrf, "correct-horse-battery-staple");
  assert.match(setCookie, /^vua_session=/);
  const cookieValue = setCookie.split(";")[0];
  const principal = gate.checkSession(cookieValue);
  assert.equal(principal, "scoobiii");
});

test("CONSENT: wrong passcode is rejected and does not issue a session", () => {
  const gate = makeGate();
  const { html } = gate.renderForm("foo=bar");
  const csrf = extractCsrf(html);
  assert.throws(
    () => gate.approve(csrf, "wrong-passcode"),
    (err: unknown) => err instanceof OAuthError && /senha incorreta/.test(err.message),
  );
});

test("CONSENT: csrf token is single-use — replaying it after a successful approve fails", () => {
  const gate = makeGate();
  const { html } = gate.renderForm("foo=bar");
  const csrf = extractCsrf(html);
  gate.approve(csrf, "correct-horse-battery-staple");
  assert.throws(() => gate.approve(csrf, "correct-horse-battery-staple"), OAuthError);
});

test("CONSENT: an unknown/forged csrf token is rejected", () => {
  const gate = makeGate();
  assert.throws(() => gate.approve("forged-csrf-token", "correct-horse-battery-staple"), OAuthError);
});

test("CONSENT: no session cookie -> checkSession returns null (never throws)", () => {
  const gate = makeGate();
  assert.equal(gate.checkSession(undefined), null);
  assert.equal(gate.checkSession("unrelated=cookie; other=1"), null);
});

test("BOOT SAFETY: constructing ConsentGate with a weak passcode throws", () => {
  const signer = new SessionSigner("session-secret-long-enough-value");
  assert.throws(() => new ConsentGate("scoobiii", "short", signer));
});

function extractCsrf(html: string): string {
  const m = html.match(/name="csrf" value="([^"]+)"/);
  if (!m) throw new Error("csrf not found in rendered form");
  return m[1];
}
