/**
 * VUA - Vortex Universal Connector: Adapter Registry
 * Central orchestrator for multi-environment adapters: GitHub, Linux, Android, and Windows.
 */

import { executeVortexPipeline } from '../gateway.js';
import { verifyExecutionProof } from '../verifier.js';
import type { VortexRequest } from '../types.js';
import type {
  IVUAAdapter,
  VUAActionRequest,
  VUAActionResult,
  VUAAdapterId,
  VUAAdapterMetadata,
} from './types.js';
import { VUAGitHubAdapter } from './github.js';
import { VUALinuxAdapter } from './linux.js';
import { VUAAndroidAdapter } from './android.js';
import { VUAWindowsAdapter } from './windows.js';

class VUAAdapterRegistry {
  private adapters: Map<VUAAdapterId, IVUAAdapter> = new Map();

  constructor() {
    this.register(new VUAGitHubAdapter());
    this.register(new VUALinuxAdapter());
    this.register(new VUAAndroidAdapter());
    this.register(new VUAWindowsAdapter());
  }

  public register(adapter: IVUAAdapter): void {
    this.adapters.set(adapter.metadata.id, adapter);
  }

  public get(id: VUAAdapterId): IVUAAdapter | undefined {
    return this.adapters.get(id);
  }

  public list(): VUAAdapterMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.metadata);
  }

  /**
   * Invokes an action on a specific adapter through the Vortex Execution Gateway.
   * Emits an Ed25519 ExecutionProof v1 and verifies it cryptographically.
   */
  public async invoke(request: VUAActionRequest): Promise<VUAActionResult> {
    const adapter = this.adapters.get(request.adapterId);
    if (!adapter) {
      throw new Error(`Adapter '${request.adapterId}' is not registered in VUA`);
    }

    const t0 = Date.now();
    const reqId = request.requestId || `vua-${request.adapterId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // 1. Execute the actual adapter logic
    const { data, auditLog } = await adapter.executeAction(
      request.action,
      request.target || {},
      request.payload || {}
    );

    const durationMs = Date.now() - t0;

    // 2. Wrap the execution in the Vortex Gateway to generate ExecutionProof v1
    const vortexRequest: VortexRequest = {
      request_id: reqId,
      operation: 'execute',
      target: {
        resource: `vua://${request.adapterId}/${request.action}`,
        adapter: request.adapterId,
        action: request.action,
        ...(request.target || {}),
      },
      authorization: {
        principal_id: 'scoobiii',
        agent_id: 'agent/vua-connector',
        policy_id: 'vortex-development',
        policy_version: '1.0.0',
        capability: 'vua.adapter.execute',
        scope: {
          paths: ['*'],
          repositories: ['*'],
        },
      },
      input: {
        action: request.action,
        target: request.target,
        payload: request.payload,
      },
      approval_token: request.approvalToken,
    };

    const pipelineRes = await executeVortexPipeline(vortexRequest);

    // 3. Verify the generated proof
    let verification;
    if (pipelineRes.execution_proof) {
      verification = verifyExecutionProof(pipelineRes.execution_proof);
    }

    return {
      success: pipelineRes.status === 'EXECUTION_SUCCESS',
      adapter: request.adapterId,
      action: request.action,
      environment: adapter.metadata.environment,
      timestamp: new Date().toISOString(),
      durationMs,
      data,
      auditLog,
      execution_proof: pipelineRes.execution_proof,
      verification,
    };
  }
}

export const vuaRegistry = new VUAAdapterRegistry();
