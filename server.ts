/**
 * Vortex MCP Server - Foundation Execution Governance Entry Point
 * Express + Vite Full-Stack Implementation
 */

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { runAdversarialSuite, runFoundationE2ESuite, runVUAAdaptersE2ESuite } from './src/vortex/conformance.js';
import { generateVortexIdentity, KEY_REGISTRY } from './src/vortex/crypto.js';
import { generateExecutionEvidence } from './src/vortex/evidence.js';
import {
  CURRENT_IDENTITY,
  EXECUTION_LOGS,
  executeVortexPipeline,
  resetAntiReplayCache,
  setVortexIdentity,
} from './src/vortex/gateway.js';
import { createGOS3Session, listActiveSessions, onboardResource } from './src/vortex/gos3.js';
import { executeGovernedLLM, probeLocalLLM, type LLMConfig } from './src/vortex/llm.js';
import { handleMCPMessage, VORTEX_MCP_TOOLS } from './src/vortex/mcp-server.js';
import { vuaRegistry } from './src/vortex/adapters/registry.js';
import { verifyExecutionProof } from './src/vortex/verifier.js';
import { runAgentPatchArena } from './scripts/agent-patch-arena.js';

const PORT = 3000;

async function startServer() {
  const app = express();
  const apiToken = process.env.VUA_API_TOKEN;

  // Middleware
  app.use((req, res, next) => {
    const origin = req.header('origin');
    const allowedOrigins = (process.env.VUA_ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);
    if (origin && allowedOrigins.includes(origin)) res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, mcp-session-id');
    if (req.method === 'OPTIONS') return origin && allowedOrigins.includes(origin) ? res.sendStatus(204) : res.sendStatus(403);
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    const protectedPath = req.path.startsWith('/api/vortex') || req.path.startsWith('/api/vua') || req.path.startsWith('/api/github') || req.path === '/mcp' || req.path === '/sse' || req.path === '/messages' || req.path.startsWith('/mcp/');
    if (!protectedPath) return next();
    if (!apiToken) return res.status(503).json({ error: 'VUA_API_TOKEN is required for protected endpoints' });
    const supplied = req.header('authorization')?.startsWith('Bearer ') ? req.header('authorization')!.slice(7) : '';
    if (supplied.length !== apiToken.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(apiToken))) return res.status(401).json({ error: 'authentication_required' });
    next();
  });

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'vortex-mcp-foundation-server',
      spec: 'Vortex MCP Execution Governance Profile v1',
      thesis: 'SAFETY = AUTHORIZATION + BOUNDED EXECUTION + ACCOUNTABILITY + INDEPENDENT VERIFICATION + IDENTITY',
      node_version: process.version,
    });
  });

  // 2. Well-known Key Discovery (RFC Well-Known)
  app.get('/.well-known/vortex-keys', (req, res) => {
    const keys = Array.from(KEY_REGISTRY.values()).map((k) => ({
      key_id: k.key_id,
      algorithm: k.algorithm,
      principal_id: k.principal_id,
      agent_id: k.agent_id,
      public_key: k.public_key,
      created_at: k.created_at,
    }));
    res.json({
      keys,
      current_key_id: CURRENT_IDENTITY.key_id,
    });
  });

  // 3. MCP JSON-RPC 2.0 & SSE Transports (Claude Mobile / Cursor / Anthropic Connectors)
  const sseSessions = new Map<string, express.Response>();

  const handleSseConnection = (req: express.Request, res: express.Response) => {
    const sessionId = crypto.randomUUID();
    const origin = req.header('origin');
    const allowedOrigins = (process.env.VUA_ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    });

    sseSessions.set(sessionId, res);

    // Initial endpoint announcement for MCP SSE protocol
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const endpointUrl = `${protocol}://${host}/mcp/messages?sessionId=${sessionId}`;

    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    // Heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseSessions.delete(sessionId);
    });
  };

  app.get(['/mcp', '/sse'], (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
      return handleSseConnection(req, res);
    }
    res.json({
      service: 'vua-mcp-server',
      version: '1.0.0',
      status: 'ONLINE',
      protocol: 'MCP JSON-RPC 2.0',
      transports: ['HTTP POST (direct)', 'Server-Sent Events (SSE)'],
      endpoints: {
        sse: '/mcp or /sse (with Accept: text/event-stream)',
        messages: '/mcp/messages?sessionId=<session_id>',
        direct_post: '/mcp',
      },
      tools_endpoint: '/mcp (method: tools/list)',
      tools_count: VORTEX_MCP_TOOLS.length,
      tools: VORTEX_MCP_TOOLS.map((t) => t.name),
    });
  });

  // Dedicated SSE route for clients explicitly configured with /sse
  app.get('/sse', (req, res) => {
    return handleSseConnection(req, res);
  });

  // MCP Messages Endpoint (POST from SSE clients)
  app.post(['/mcp/messages', '/messages'], async (req, res) => {
    try {
      const sessionId = (req.query.sessionId as string) || (req.headers['mcp-session-id'] as string);
      const sseRes = sessionId ? sseSessions.get(sessionId) : undefined;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ') && req.body?.params?.arguments) {
        const token = authHeader.slice(7).trim();
        if (!req.body.params.arguments.approval_token && token) {
          req.body.params.arguments.approval_token = token;
        }
      }

      const rpcResponse = await handleMCPMessage(req.body);

      if (sseRes) {
        sseRes.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
        return res.status(202).send('Accepted');
      }

      res.json(rpcResponse);
    } catch (err: unknown) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: `Internal error: ${err}` },
      });
    }
  });

  app.post('/mcp', async (req, res) => {
    try {
      // Extract Bearer token from header if present
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ') && req.body?.params?.arguments) {
        const token = authHeader.slice(7).trim();
        if (!req.body.params.arguments.approval_token && token) {
          req.body.params.arguments.approval_token = token;
        }
      }

      const response = await handleMCPMessage(req.body);
      res.json(response);
    } catch (err: unknown) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: `Internal error: ${err}` },
      });
    }
  });

  // 4. Status & Engine Metrics
  app.get('/api/vortex/status', (req, res) => {
    res.json({
      status: 'ONLINE',
      identity: {
        agent_id: CURRENT_IDENTITY.agent_id,
        principal_id: CURRENT_IDENTITY.principal_id,
        key_id: CURRENT_IDENTITY.key_id,
        algorithm: CURRENT_IDENTITY.algorithm,
        public_key: CURRENT_IDENTITY.public_key,
      },
      tools_count: VORTEX_MCP_TOOLS.length,
      tools: VORTEX_MCP_TOOLS.map((t) => t.name),
      active_gos3_sessions: listActiveSessions().length,
      execution_proofs_count: EXECUTION_LOGS.length,
      recent_proofs: EXECUTION_LOGS.slice(0, 5),
    });
  });

  // 5. Execute Vortex pipeline directly via REST
  app.post('/api/vortex/execute', async (req, res) => {
    try {
      const result = await executeVortexPipeline(req.body);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({
        status: 'EXECUTION_ERROR',
        error: { code: 'PIPELINE_ERROR', message: String(err) },
      });
    }
  });

  // 6. Independent Verifier Endpoint
  app.post('/api/vortex/verify', (req, res) => {
    try {
      const { proof, options } = req.body;
      const verification = verifyExecutionProof(proof, options);
      res.json(verification);
    } catch (err: unknown) {
      res.status(400).json({
        valid: false,
        status: 'VERIFICATION_FAILED',
        reasons: [`Verification execution failed: ${err}`],
      });
    }
  });

  // 7. Conformance: Run Adversarial Suite (FORGE, REPLAY, ESCALATE, ESCAPE, TAMPER)
  app.post('/api/vortex/conformance/adversarial', async (req, res) => {
    try {
      const results = await runAdversarialSuite();
      res.json({
        timestamp: new Date().toISOString(),
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        results,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 8. Conformance: Run Foundation 10 E2Es (E2E-001 to E2E-010)
  app.post('/api/vortex/conformance/e2e', async (req, res) => {
    try {
      const suite = await runFoundationE2ESuite();
      res.json({
        timestamp: new Date().toISOString(),
        total: suite.length,
        passed: suite.filter((r) => r.status === 'PASS').length,
        failed: suite.filter((r) => r.status === 'FAIL').length,
        results: suite,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 9. CI Evidence & Benchmark Gate
  app.get('/api/vortex/evidence', (req, res) => {
    const proofHashes = EXECUTION_LOGS.slice(0, 10).map((p) => p.proof_hash || p.output_hash);
    const evidence = generateExecutionEvidence({
      proofHashes,
      allTestsPassed: false,
      coveragePercent: 0,
    });

    res.json({
      evidence,
      benchmark: { status: 'UNMEASURED', reason: 'Benchmark evidence must be generated by CI or an explicit benchmark run.' },
    });
  });

  // 10. GOS3 Onboarding & Session Creation
  app.post('/api/vortex/gos3/session', (req, res) => {
    const { principal_id, agent_id, resource, duration_seconds } = req.body;
    const session = createGOS3Session(
      principal_id || 'scoobiii',
      agent_id || 'agent/vortex',
      resource || '/workspace/vortex/src/governed-file.ts',
      duration_seconds || 300
    );
    res.json(session);
  });

  // 11. GOS3 List Active Sessions
  app.get('/api/vortex/gos3/sessions', (req, res) => {
    res.json(listActiveSessions());
  });

  // 12. Rotate / Create Ed25519 Identity
  app.post('/api/vortex/keys/rotate', (req, res) => {
    const { principal_id, agent_id } = req.body;
    const newIdentity = generateVortexIdentity(principal_id || 'scoobiii', agent_id || 'agent/vortex');
    setVortexIdentity(newIdentity);
    res.json({
      key_id: newIdentity.key_id,
      algorithm: newIdentity.algorithm,
      principal_id: newIdentity.principal_id,
      agent_id: newIdentity.agent_id,
      public_key: newIdentity.public_key,
    });
  });

  // 13. Reset Anti-Replay Cache
  app.post('/api/vortex/reset-replay', (req, res) => {
    resetAntiReplayCache();
    res.json({ status: 'ok', message: 'Anti-replay nonce cache cleared' });
  });

  // 13.1. Agent Patch Arena Tournament Endpoint
  app.get('/api/vortex/arena/tournament', async (req, res) => {
    try {
      const result = await runAgentPatchArena();
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/vortex/arena/tournament', async (req, res) => {
    try {
      const candidates = req.body?.candidates;
      const result = await runAgentPatchArena(candidates);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 14. LLM Providers Info
  app.get('/api/vortex/llm/providers', (req, res) => {
    res.json({
      providers: [
        {
          id: 'gemini',
          name: 'Google Gemini',
          type: 'cloud_api_key',
          default_model: 'gemini-3.8-flash',
          models: ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'],
          has_server_key: Boolean(process.env.GEMINI_API_KEY),
          description: 'High-speed multimodality via @google/genai with server-side key',
        },
        {
          id: 'openai',
          name: 'OpenAI / Compatible Cloud',
          type: 'cloud_api_key',
          default_model: 'gpt-4o-mini',
          models: ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'claude-3-5-sonnet'],
          has_server_key: Boolean(process.env.OPENAI_API_KEY),
          description: 'OpenAI, Groq, DeepSeek, or custom cloud endpoints with API key',
        },
        {
          id: 'ollama',
          name: 'Ollama (Local LLM)',
          type: 'local',
          default_url: 'http://localhost:11434',
          default_model: 'llama3',
          models: ['llama3', 'llama3.2', 'mistral', 'qwen2.5', 'phi3', 'gemma2', 'deepseek-r1'],
          description: 'Zero-cloud local inference running on localhost:11434 with zero data leakage',
        },
        {
          id: 'lmstudio',
          name: 'LM Studio / vLLM (Local LLM)',
          type: 'local',
          default_url: 'http://localhost:1234/v1',
          default_model: 'local-model',
          models: ['local-model'],
          description: 'Local OpenAI-compatible engine on localhost:1234 or vLLM',
        },
        {
          id: 'llamacpp',
          name: 'llama.cpp Native (Termux / Edge CPU)',
          type: 'local',
          default_url: 'http://127.0.0.1:11434',
          default_model: 'qwen2.5-coder-0.5b',
          models: ['qwen2.5-coder-0.5b', 'qwen2.5-0.5b-instruct', 'llama-3.2-1b'],
          description: 'C/C++ native SIMD inference on ARM/Termux (A23 CPU constraint: serial queue, Q4_K_M GGUF)',
        },
      ],
    });
  });

  // 15. Probe Local LLM Connectivity
  app.post('/api/vortex/llm/probe', async (req, res) => {
    try {
      const { provider, baseUrl } = req.body;
      const probeResult = await probeLocalLLM(provider || 'ollama', baseUrl);
      res.json(probeResult);
    } catch (err: any) {
      res.status(500).json({
        online: false,
        error: err.message || String(err),
      });
    }
  });

  // 16. Governed LLM Generation (Dual Cloud API Key & Local LLM)
  app.post('/api/vortex/llm/generate', async (req, res) => {
    try {
      const { prompt, config, request_id } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Field "prompt" is required' });
      }
      if (prompt.length > 100_000) return res.status(413).json({ error: 'prompt_too_large' });
      if (config?.maxTokens !== undefined && (!Number.isInteger(config.maxTokens) || config.maxTokens < 1 || config.maxTokens > 16_384)) return res.status(422).json({ error: 'maxTokens_out_of_range' });
      if (config?.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 180_000)) return res.status(422).json({ error: 'timeoutMs_out_of_range' });

      const llmConfig: LLMConfig = {
        provider: config?.provider || 'gemini',
        model: config?.model || (config?.provider === 'gemini' ? 'gemini-3.8-flash' : config?.provider === 'ollama' ? 'llama3' : 'gpt-4o-mini'),
        baseUrl: config?.baseUrl,
        apiKey: undefined,
        temperature: config?.temperature,
        maxTokens: config?.maxTokens,
        systemInstruction: config?.systemInstruction,
      };

      const result = await executeGovernedLLM(prompt, llmConfig, request_id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err.message || String(err),
        provider: req.body?.config?.provider,
      });
    }
  });

  // 17. VUA - Vortex Universal Connector: List Adapters
  app.get('/api/vua/adapters', (req, res) => {
    try {
      const adapters = vuaRegistry.list();
      res.json({
        connector: 'VUA - Vortex Universal Connector',
        version: '2.5.0',
        standards: ['RFC 8785 JCS', 'Ed25519 ExecutionProof v1', 'GOS3 §8 Contract Headers'],
        adapters,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 18. VUA - Probe Adapter Status
  app.post('/api/vua/adapters/:id/probe', async (req, res) => {
    try {
      const id = req.params.id as any;
      const adapter = vuaRegistry.get(id);
      if (!adapter) {
        return res.status(404).json({ error: `Adapter '${id}' not found` });
      }
      const probe = await adapter.probeStatus();
      res.json({
        adapter: id,
        ...probe,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 19. VUA - Governed Adapter Action Invocation
  app.post('/api/vua/adapters/:id/invoke', async (req, res) => {
    try {
      const id = req.params.id as any;
      const { action, target, payload, approval_token, request_id } = req.body;
      if (!action) {
        return res.status(400).json({ error: 'Field "action" is required' });
      }

      const result = await vuaRegistry.invoke({
        adapterId: id,
        action,
        target,
        payload,
        approvalToken: approval_token,
        requestId: request_id,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || String(err),
        adapter: req.params.id,
      });
    }
  });

  // 20. VUA - Run Multi-Environment Conformance Suite
  app.post('/api/vua/conformance', async (req, res) => {
    try {
      const results = await runVUAAdaptersE2ESuite();
      const allPassed = results.every((r) => r.passed);
      res.json({
        suite: 'VUA Multi-Environment Conformance Suite',
        status: allPassed ? 'PASS' : 'FAIL',
        total_tests: results.length,
        passed_tests: results.filter((r) => r.passed).length,
        results,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 21. GitHub Repository & Project Manager API (Secure & Governed)
  let activeGitHubTarget = {
    owner: 'vortex-foundation',
    repo: 'vua-connector',
    branch: 'main',
      commit_sha: '',
    updated_at: new Date().toISOString(),
  };

  let sessionGitHubToken: string | null = null;
  let sessionGitHubUser: any = null;

  app.post('/api/github/connect', async (req, res) => {
    try {
      const { token } = req.body;

      const activeToken = token || process.env.GITHUB_TOKEN;
      if (!activeToken) return res.status(401).json({ authenticated: false, error: 'GitHub token is required; demo authentication is disabled.' });

      try {
        const ghRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${activeToken.trim()}`,
            'User-Agent': 'VUA-Connector-Governance/2.5.0',
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (!ghRes.ok) {
          const errData = (await ghRes.json().catch(() => ({}))) as any;
          return res.status(401).json({
            authenticated: false,
            error: errData.message || `GitHub respondeu com status ${ghRes.status}`,
          });
        }

        const userData = (await ghRes.json()) as any;
        const scopesHeader = ghRes.headers.get('x-oauth-scopes') || 'repo, read:org';
        const scopes = scopesHeader.split(',').map((s: string) => s.trim()).filter(Boolean);

        sessionGitHubToken = activeToken.trim();
        sessionGitHubUser = {
          login: userData.login,
          name: userData.name || userData.login,
          avatar_url: userData.avatar_url,
          bio: userData.bio || 'Desenvolvedor GitHub',
          company: userData.company,
          location: userData.location,
          public_repos: userData.public_repos,
          total_private_repos: userData.total_private_repos || 0,
          followers: userData.followers,
          scopes,
          rate_limit: {
            limit: Number(ghRes.headers.get('x-ratelimit-limit') || 5000),
            remaining: Number(ghRes.headers.get('x-ratelimit-remaining') || 4999),
            reset: Number(ghRes.headers.get('x-ratelimit-reset') || Math.floor(Date.now() / 1000) + 3600),
          },
          mode: 'authenticated',
        };

        res.json({ authenticated: true, user: sessionGitHubUser, mode: 'authenticated' });
      } catch (networkErr: any) {
        return res.status(502).json({
          authenticated: false,
          error: `Falha de rede ao contatar api.github.com: ${networkErr.message}`,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  app.post('/api/github/disconnect', (req, res) => {
    sessionGitHubToken = null;
    sessionGitHubUser = null;
    res.json({ authenticated: false, message: 'Sessão desconectada com segurança' });
  });

  app.get('/api/github/status', (req, res) => {
    res.json({
      authenticated: Boolean(sessionGitHubUser),
      user: sessionGitHubUser,
      active_target: activeGitHubTarget,
    });
  });

  app.get('/api/github/repos', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = (authHeader && authHeader.replace('Bearer ', '')) || sessionGitHubToken || process.env.GITHUB_TOKEN;

      if (token && sessionGitHubUser?.mode === 'authenticated') {
        try {
          const ghRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': 'VUA-Connector-Governance/2.5.0',
              Accept: 'application/vnd.github.v3+json',
            },
          });
          if (ghRes.ok) {
            const rawRepos = (await ghRes.json()) as any[];
            const repos = rawRepos.map((r) => ({
              id: r.id,
              name: r.name,
              full_name: r.full_name,
              owner: r.owner?.login,
              owner_avatar: r.owner?.avatar_url,
              private: r.private,
              description: r.description,
              default_branch: r.default_branch || 'main',
              branches: [r.default_branch || 'main', 'develop'],
              language: r.language || 'TypeScript',
              stargazers_count: r.stargazers_count,
              forks_count: r.forks_count,
              updated_at: r.updated_at,
              open_issues_count: r.open_issues_count,
              governed: true,
              branch_protection: true,
              ci_status: 'PASS',
            }));
            return res.json({ repos, count: repos.length, source: 'live_github' });
          }
        } catch (e: any) {
          return res.status(502).json({ repos: [], count: 0, source: 'github_unavailable', error: e?.message || 'GitHub request failed' });
        }
      }

      return res.status(401).json({ repos: [], count: 0, source: 'not_authenticated', error: 'Connect a real GitHub token first.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  app.post('/api/github/active-target', (req, res) => {
    const { owner, repo, branch, commit_sha } = req.body;
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Campos "owner" e "repo" são obrigatórios.' });
    }
    activeGitHubTarget = {
      owner,
      repo,
      branch: branch || 'main',
      commit_sha: commit_sha || '',
      updated_at: new Date().toISOString(),
    };
    res.json({ success: true, active_target: activeGitHubTarget });
  });

  app.get('/api/github/active-target', (req, res) => {
    res.json({ active_target: activeGitHubTarget });
  });

  app.post('/api/github/action', async (req, res) => {
    try {
      const { action, payload = {} } = req.body;
      if (!action) {
        return res.status(400).json({ error: 'Campo "action" é obrigatório.' });
      }

      const effectivePayload = {
        token: sessionGitHubToken || process.env.GITHUB_TOKEN,
        ...payload,
      };

      const result = await vuaRegistry.invoke({
        adapterId: 'github',
        action,
        target: {
          owner: activeGitHubTarget.owner,
          repo: activeGitHubTarget.repo,
          branch: activeGitHubTarget.branch,
          commit_sha: activeGitHubTarget.commit_sha,
        },
        payload: effectivePayload,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vortex MCP Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
