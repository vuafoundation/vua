/**
 * VUA OAuth integration regression suite.
 * Validates the OAuth module in isolation from the MCP transport.
 * The HTTP server wiring is intentionally covered by a separate P0 gate.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { mountOAuth } from '../src/vortex/oauth.js';

process.env.OAUTH_APPROVE_SECRET = 'test-secret';
process.env.VUA_OAUTH_REQUIRED = 'true';

const app = express();
app.use(express.json());
mountOAuth(app, { publicBaseUrl: 'https://vua.example.test' });

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, init);
}

try {
  const protectedResource = await request('/.well-known/oauth-protected-resource');
  assert.equal(protectedResource.status, 200);
  assert.equal((await protectedResource.json()).resource, 'https://vua.example.test/mcp');

  const authServer = await request('/.well-known/oauth-authorization-server');
  assert.equal(authServer.status, 200);
  const metadata = await authServer.json();
  assert.equal(metadata.code_challenge_methods_supported[0], 'S256');
  assert.equal(metadata.token_endpoint_auth_methods_supported[0], 'none');

  const register = await request('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['https://client.example.test/callback'], client_name: 'regression-client' }),
  });
  assert.equal(register.status, 201);
  const client = await register.json();

  const verifier = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~0123456789';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString('base64url');
  const authorize = await request(`/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client.client_id)}&redirect_uri=${encodeURIComponent('https://client.example.test/callback')}&code_challenge=${challenge}&code_challenge_method=S256&scope=mcp&resource=https%3A%2F%2Fvua.example.test%2Fmcp&state=state-1`);
  assert.equal(authorize.status, 200);

  const approve = await request('/oauth/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: client.client_id,
      redirect_uri: 'https://client.example.test/callback',
      code_challenge: challenge,
      scope: 'mcp',
      resource: 'https://attacker.example.test/mcp',
      state: 'state-1',
      secret: 'test-secret',
    }),
    redirect: 'manual',
  });
  assert.equal(approve.status, 302);
  const location = approve.headers.get('location');
  assert(location);
  const code = new URL(location).searchParams.get('code');
  assert(code);

  const token = await request('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: 'https://client.example.test/callback', client_id: client.client_id, code_verifier: verifier, resource: 'https://vua.example.test/mcp' }),
  });
  assert.equal(token.status, 200);
  const tokenBody = await token.json();
  assert.equal(tokenBody.token_type, 'Bearer');
  assert.equal(tokenBody.scope, 'mcp');

  const replay = await request('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: 'https://client.example.test/callback', client_id: client.client_id, code_verifier: verifier, resource: 'https://vua.example.test/mcp' }),
  });
  assert.equal(replay.status, 400);

  const badScope = await request(`/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client.client_id)}&redirect_uri=${encodeURIComponent('https://client.example.test/callback')}&code_challenge=${challenge}&code_challenge_method=S256&scope=admin`);
  assert.equal(badScope.status, 400);

  console.log('OAuth regression suite: PASS');
} finally {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
