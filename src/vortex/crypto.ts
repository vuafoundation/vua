/**
 * @gos3-contract
 * @version 1.0.0
 * @resource src/vortex/crypto.ts
 * @checksum sha256:6b2885d1ceb9681d1798b3b94f74534d7deeb0365a2c9a9fc89c2d3c5d20257c
 * @capability repository.write
 * @onboarded_at 2026-09-13T00:00:00.000Z
 * @governed true
 */
/**
 * Vortex MCP Specification - Cryptographic Engine
 * Ed25519 Key Discovery, SHA-256 Hashes & RFC 8785 Canonical Signing
 */

import crypto from 'node:crypto';
import { canonicalize } from './canonicalize.js';
import type { CryptographicIdentity } from './types.js';

/**
 * Deterministic SHA-256
 */
// ─── KeyObject cache by PEM ──────────────────────────────────────────────
// createPrivateKey/createPublicKey fazem parse ASN.1/DER + validação de curva
// em cada chamada. No hot path de Ed25519 (sign+verify por proof), isso domina.
// PEM é imutável durante a vida do processo e o número de identidades é
// limitado pelo KEY_REGISTRY, então cachear por PEM é seguro e correto.
// Cap de 256 entradas protege contra identidades efêmeras em testes.
const KEY_CACHE_MAX = 256;
const PRIVATE_KEY_CACHE = new Map<string, crypto.KeyObject>();
const PUBLIC_KEY_CACHE = new Map<string, crypto.KeyObject>();

function cacheGet(map: Map<string, crypto.KeyObject>, k: string): crypto.KeyObject | undefined {
  return map.get(k);
}
function cacheSet(map: Map<string, crypto.KeyObject>, k: string, v: crypto.KeyObject): void {
  if (map.size >= KEY_CACHE_MAX) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(k, v);
}
function getPrivateKey(pem: string): crypto.KeyObject {
  let key = cacheGet(PRIVATE_KEY_CACHE, pem);
  if (!key) { key = crypto.createPrivateKey(pem); cacheSet(PRIVATE_KEY_CACHE, pem, key); }
  return key;
}
function getPublicKey(pem: string): crypto.KeyObject {
  let key = cacheGet(PUBLIC_KEY_CACHE, pem);
  if (!key) { key = crypto.createPublicKey(pem); cacheSet(PUBLIC_KEY_CACHE, pem, key); }
  return key;
}
export function keyCacheStats(): { private: number; public: number; max: number } {
  return { private: PRIVATE_KEY_CACHE.size, public: PUBLIC_KEY_CACHE.size, max: KEY_CACHE_MAX };
}
// ──────────────────────────────────────────────────────────────────────────

export function sha256(input: unknown): string {
  const content = typeof input === 'string' ? input : canonicalize(input);
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

export interface KeyRecord {
  key_id: string;
  principal_id: string;
  agent_id: string;
  algorithm: 'Ed25519';
  public_key: string;
  private_key?: string;
  created_at: string;
}

// Memory key registry for discovery (supports well-known, registry, policy-bound)
export const KEY_REGISTRY = new Map<string, KeyRecord>();

/**
 * Generate a standard Ed25519 Vortex identity
 */
export function generateVortexIdentity(
  principal_id = 'scoobiii',
  agent_id = 'agent/llm-vortex',
  customKeyId?: string
): CryptographicIdentity {
  const key_id = customKeyId || `vortex-key-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const identity: CryptographicIdentity = {
    principal_id,
    agent_id,
    key_id,
    algorithm: 'Ed25519',
    public_key: pubPem,
    private_key: privPem,
  };

  KEY_REGISTRY.set(key_id, {
    ...identity,
    created_at: new Date().toISOString(),
  });

  return identity;
}

/**
 * Sign JCS canonicalized payload with Ed25519 private key
 */
export function signProofPayload(payloadWithoutSignature: Record<string, unknown>, privateKeyPem: string): string {
  const canonicalString = canonicalize(payloadWithoutSignature);
  const privateKey = getPrivateKey(privateKeyPem);
  const signatureBuffer = crypto.sign(null, Buffer.from(canonicalString, 'utf8'), privateKey);
  return signatureBuffer.toString('base64');
}

/**
 * Verify Ed25519 signature over JCS canonicalized payload
 */
export function verifyProofSignature(
  payloadWithoutSignature: Record<string, unknown>,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  const canonicalString = canonicalize(payloadWithoutSignature);
  try {
    const publicKey = getPublicKey(publicKeyPem);
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    return crypto.verify(null, Buffer.from(canonicalString, 'utf8'), publicKey, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Lookup public key via Key Discovery:
 * 1. Embedded
 * 2. Registry
 * 3. Well-known
 */
export function resolvePublicKey(keyId: string, embeddedPublicKey?: string): string | null {
  if (embeddedPublicKey && embeddedPublicKey.includes('PUBLIC KEY')) {
    return embeddedPublicKey;
  }
  const found = KEY_REGISTRY.get(keyId);
  if (found) {
    return found.public_key;
  }
  return null;
}
