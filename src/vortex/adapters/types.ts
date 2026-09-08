/**
 * VUA - Vortex Universal Connector
 * Normative Adapter Types for GitHub, Linux, Android, and Windows environments.
 * 
 * Thesis:
 * Every adapter invocation (read/execute/write) across any OS/platform must:
 * 1. Execute within bounded sandbox limits
 * 2. Comply with normative capability authorizations
 * 3. Emit an authentic Ed25519 ExecutionProof v1 via RFC 8785 canonicalization
 * 4. Undergo independent cryptographic verification
 */

import type { ExecutionProof, VerificationResult } from '../types.js';

export type VUAAdapterId = 'github' | 'linux' | 'android' | 'windows';

export type VUAAdapterStatus = 'online' | 'ready' | 'simulated' | 'degraded';

export interface VUAAdapterMetadata {
  id: VUAAdapterId;
  name: string;
  environment: 'Cloud VCS' | 'POSIX Linux' | 'AOSP Android' | 'Win32/NT Windows';
  version: string;
  status: VUAAdapterStatus;
  description: string;
  capabilities: string[];
  supportedActions: Array<{
    action: string;
    description: string;
    requiresApproval?: boolean;
    defaultParams?: Record<string, unknown>;
  }>;
  systemMetrics?: Record<string, string | number>;
}

export interface VUAActionRequest {
  adapterId: VUAAdapterId;
  action: string;
  target?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  approvalToken?: string;
  requestId?: string;
}

export interface VUAActionResult {
  success: boolean;
  adapter: VUAAdapterId;
  action: string;
  environment: string;
  timestamp: string;
  durationMs: number;
  data: Record<string, unknown>;
  auditLog: string[];
  execution_proof?: ExecutionProof;
  verification?: VerificationResult;
  error?: string;
}

export interface IVUAAdapter {
  metadata: VUAAdapterMetadata;
  executeAction(
    action: string,
    target?: Record<string, unknown>,
    payload?: Record<string, unknown>
  ): Promise<{ data: Record<string, unknown>; auditLog: string[] }>;
  probeStatus(): Promise<{ status: VUAAdapterStatus; metrics?: Record<string, string | number> }>;
}
