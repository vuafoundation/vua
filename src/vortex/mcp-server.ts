/**
 * Vortex MCP Specification - Protocol Server & Tool Contract
 * 
 * Normative MCP JSON-RPC 2.0 tool endpoints:
 * - vortex.inspect: Read-only observation (side_effect=false, authorization=required, proof=required)
 * - vortex.propose: Propose change without execution (side_effect=false, execution=prohibited, proof=proposal)
 * - vortex.verify: Independent verification (hashes, policy, tests, proof, signature)
 * - vortex.execute: Authorized bounded execution with policy/sandbox limits
 * - vortex.branch.write: Persistent development branch modification with human approval
 */

import { executeVortexPipeline } from './gateway.js';
import type { VortexOperation, VortexRequest, VortexResponse } from './types.js';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const VORTEX_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'vortex.inspect',
    description: 'Read-only observation of repositories, files, branches, runtimes, connectors, or policies with cryptographic proof.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'Unique cryptographic request identifier' },
        target: {
          type: 'object',
          properties: {
            repository: { type: 'string' },
            branch: { type: 'string' },
            path: { type: 'string' },
          },
        },
        input: { type: 'object', description: 'Inspection parameters' },
        authorization: { type: 'object', description: 'Vortex Authorization Context' },
      },
      required: ['request_id', 'input'],
    },
  },
  {
    name: 'vortex.propose',
    description: 'Produces an intended patch, change, or configuration without executing side effects. Yields proposal proof.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string' },
        target: { type: 'object' },
        input: {
          type: 'object',
          properties: {
            diff: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['type'],
        },
        authorization: { type: 'object' },
      },
      required: ['request_id', 'input'],
    },
  },
  {
    name: 'vortex.verify',
    description: 'Executes independent verification of hashes, policies, diffs, execution proofs, or Ed25519 signatures.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string' },
        input: {
          type: 'object',
          properties: {
            execution_proof: { type: 'object' },
            expected_hash: { type: 'string' },
          },
        },
        authorization: { type: 'object' },
      },
      required: ['request_id', 'input'],
    },
  },
  {
    name: 'vortex.execute',
    description: 'Executes a governed operation. Evaluates identity, policy, scope, GOS3, and sandbox limits before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string' },
        operation: { type: 'string', description: 'Semantic operation name' },
        target: { type: 'object' },
        input: { type: 'object' },
        authorization: { type: 'object', description: 'Mandatory for mutable executions' },
        sandbox: { type: 'object', description: 'Optional explicit sandbox limits' },
        approval_token: { type: 'string', description: 'Human approval token for sensitive operations' },
      },
      required: ['request_id', 'input'],
    },
  },
  {
    name: 'vortex.branch.write',
    description: 'Alters persistent repository development state (commit, branch creation, branch modification). Requires policy & human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string' },
        target: {
          type: 'object',
          properties: {
            repository: { type: 'string' },
            branch: { type: 'string' },
            path: { type: 'string' },
          },
          required: ['repository', 'branch'],
        },
        input: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            message: { type: 'string' },
          },
          required: ['content'],
        },
        authorization: { type: 'object' },
        approval_token: { type: 'string', description: 'Mandatory human approval token for branch writing' },
      },
      required: ['request_id', 'target', 'input', 'authorization'],
    },
  },
];

/**
 * Handle MCP JSON-RPC 2.0 messages
 */
export async function handleMCPMessage(message: {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}): Promise<{
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}> {
  const { id, method, params } = message;

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: VORTEX_MCP_TOOLS,
      },
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) || {};

    let operation: VortexOperation = 'execute';
    if (toolName === 'vortex.inspect') operation = 'inspect';
    else if (toolName === 'vortex.propose') operation = 'propose';
    else if (toolName === 'vortex.verify') operation = 'verify';
    else if (toolName === 'vortex.branch.write') operation = 'branch.write';
    else if (toolName === 'vortex.execute') operation = 'execute';
    else {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method or tool '${toolName}' not found` },
      };
    }

    const vortexReq: VortexRequest = {
      request_id: (args.request_id as string) || `req-mcp-${Date.now()}`,
      operation,
      target: args.target as Record<string, unknown>,
      input: (args.input as Record<string, unknown>) || {},
      authorization: args.authorization as VortexRequest['authorization'],
      sandbox: args.sandbox as VortexRequest['sandbox'],
      approval_token: args.approval_token as string,
    };

    const vortexRes: VortexResponse = await executeVortexPipeline(vortexReq);

    return {
      jsonrpc: '2.0',
      id,
      result: {
        status: vortexRes.status,
        output: vortexRes.output,
        error: vortexRes.error,
        execution_proof: vortexRes.execution_proof,
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unsupported MCP method: ${method}` },
  };
}
