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
  const privateKey = crypto.createPrivateKey(privateKeyPem);
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
    const publicKey = crypto.createPublicKey(publicKeyPem);
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
