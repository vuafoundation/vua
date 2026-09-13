# OAuth 2.1 Authorization Surface — spec v1

Transport authentication for `/mcp`. This is deliberately **separate**
from GOS3 `approval_token` (see `gos3.md`): an `access_token` issued
here proves "this caller is allowed to talk to the server at all"; it
never proves "a human approved this specific mutating operation."
Collapsing the two — using one static secret for both roles — was the
gap identified before this module existed and is the one invariant
this spec exists to prevent from recurring.

## Endpoints

| Endpoint | RFC | Purpose |
|---|---|---|
| `GET /.well-known/oauth-protected-resource` | 9728 | tells the client which authorization server protects `/mcp` |
| `GET /.well-known/oauth-authorization-server` | 8414 | authorization server metadata |
| `POST /register` | 7591 | Dynamic Client Registration — public client, PKCE-only |
| `GET /authorize` | 6749 + 7636 | authorization request; PKCE `S256` mandatory |
| `POST /authorize/approve` | — (this impl) | consent form submission |
| `POST /token` | 6749 | authorization_code grant |
| `POST /revoke` | 7009 | token revocation |

## Consent — the part a generic OAuth library doesn't give you for free

This is a **single-operator** authorization server: exactly one
principal (`OAUTH_OWNER_PRINCIPAL_ID`) exists, gated by exactly one
passphrase (`OAUTH_OWNER_PASSCODE`, ≥12 chars, checked in constant
time). `GET /authorize` with no valid session cookie renders an HTML
form requiring that passphrase — it does **not** auto-approve. This
is the fix for the actual production hole in the first draft of this
module: without it, anyone who found the public `/mcp` URL could
complete DCR → authorize → token and receive a valid bearer as the
owner's principal, with zero authentication.

A successful approval sets `vua_session`, an HMAC-signed
(`OAUTH_SESSION_SECRET`, ≥16 chars), HttpOnly, Secure, SameSite=Lax
cookie valid 12h. While that cookie is valid, subsequent `/authorize`
requests from the same browser skip the passphrase prompt — this is
what lets a Claude.ai token refresh happen without the person
re-entering the passphrase every hour.

CSRF: every rendered form embeds a single-use token, separate from the
session cookie, expiring after 5 minutes.

## PKCE

`code_challenge_method` MUST be `S256`. `plain` is rejected outright
at `/authorize` — OAuth 2.1 permits `plain` only for clients
structurally unable to compute SHA-256, which does not describe a
browser-driven Claude.ai flow.

## Redirect URI binding

`/authorize` validates `redirect_uri` against the list the client
registered at `/register` — an attacker who learns a valid `client_id`
cannot redirect the resulting code to a URI of their choosing. Failure
here is answered in-band (400), never by redirecting to the
attacker-supplied URI, which would otherwise confirm the `client_id`'s
validity to an attacker.

## Token lifetime and revocation

Access tokens live 1 hour. `POST /revoke` always returns `200`
regardless of whether the token existed — per RFC 7009, this prevents
the endpoint from being usable to probe token validity.

## Persistence and the single-instance constraint

The reference store (`SqliteOAuthStore`) persists to a local file and
survives a process restart, but **does not replicate across
instances**. This authorization server is only correct when the
service is pinned to exactly one running instance
(`min-instances=1` AND `max-instances=1` on Cloud Run, or the
equivalent elsewhere). A code or token issued on instance A is
invisible to instance B. Scaling beyond one instance requires
swapping `SqliteOAuthStore` for a shared backend (Cloud SQL,
Firestore, Redis) behind the same `OAuthStore` interface — no other
module changes.

## Rate limiting

`/register` and `/token` are rate-limited per client IP
(`X-Forwarded-For` behind Cloud Run, else socket address): 10
registrations/min, 30 token exchanges/min. This is abuse mitigation
for a publicly reachable endpoint, not a security boundary — it does
not need to be distributed to be useful at single-instance scale.

## What this module explicitly does NOT do

- It does not replace GOS3. An `access_token` obtained here authorizes
  reaching `/mcp` and calling `vortex.inspect`/`vortex.propose`; it
  does **not** authorize `vortex.execute`/`vortex.branch.write` for
  operations whose policy rule is `required` — those still need a
  GOS3-onboarded `approval_token`, checked independently.
- It does not implement multi-tenant user accounts. `ConsentGate` is
  sized for "one operator, occasionally re-approving a browser."
- It does not implement refresh tokens. A 1h access token expiring
  simply forces the client back through `/authorize`, which succeeds
  silently if the session cookie is still valid.
