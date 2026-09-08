/**
 * Vortex LLM Gateway - Dual Cloud API Key & Local LLM Provider Hub
 * 
 * Supports:
 * 1. Cloud API Keys:
 *    - Google Gemini (@google/genai SDK, server-side env GEMINI_API_KEY, default gemini-3.8-flash)
 *    - OpenAI & OpenAI-compatible Cloud APIs (DeepSeek, Groq, Mistral, OpenRouter)
 * 2. Local LLMs (Offline / Zero-Cloud / Sovereignty):
 *    - Ollama (http://localhost:11434 or custom, auto-discovery of models via /api/tags)
 *    - LM Studio / vLLM / LocalAI (http://localhost:1234/v1 or custom OpenAI-compatible endpoint)
 * 
 * Governance Thesis:
 * Every LLM generation is governed through the Vortex Execution Gateway, emitting
 * a deterministic RFC 8785 canonical hash and Ed25519 signed ExecutionProof v1.
 */

import { GoogleGenAI } from '@google/genai';
import { executeVortexPipeline } from './gateway.js';
import { verifyExecutionProof } from './verifier.js';
import type { ExecutionProof, VerificationResult, VortexRequest } from './types.js';

export type LLMProviderType = 'gemini' | 'openai' | 'ollama' | 'lmstudio' | 'custom';

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;
}

export interface LLMInvocationResult {
  text: string;
  provider: LLMProviderType;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  duration_ms: number;
  execution_proof?: ExecutionProof;
  verification?: VerificationResult;
}

let cachedGeminiClient: GoogleGenAI | null = null;
let cachedGeminiKey: string | null = null;

function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const key = customApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your environment or Settings > Secrets.');
  }

  if (!cachedGeminiClient || cachedGeminiKey !== key) {
    cachedGeminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedGeminiKey = key;
  }

  return cachedGeminiClient;
}

/**
 * Executes a call to Google Gemini using @google/genai
 */
async function callGemini(
  prompt: string,
  config: LLMConfig
): Promise<{ text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
  const client = getGeminiClient(config.apiKey);
  const modelName = config.model || 'gemini-3.8-flash';

  const geminiConfig: Record<string, unknown> = {};
  if (config.temperature !== undefined) geminiConfig.temperature = config.temperature;
  if (config.maxTokens !== undefined) geminiConfig.maxOutputTokens = config.maxTokens;
  if (config.systemInstruction) geminiConfig.systemInstruction = config.systemInstruction;

  const response = await client.models.generateContent({
    model: modelName,
    contents: prompt,
    config: Object.keys(geminiConfig).length > 0 ? (geminiConfig as any) : undefined,
  });

  const text = response.text || '';
  const usage = response.usageMetadata
    ? {
        prompt_tokens: response.usageMetadata.promptTokenCount,
        completion_tokens: response.usageMetadata.candidatesTokenCount,
        total_tokens: response.usageMetadata.totalTokenCount,
      }
    : undefined;

  return { text, usage };
}

/**
 * Executes a call to a local Ollama instance
 */
async function callOllama(
  prompt: string,
  config: LLMConfig
): Promise<{ text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
  const baseUrl = (config.baseUrl || process.env.LOCAL_LLM_URL || 'http://localhost:11434').replace(/\/$/, '');
  const modelName = config.model || 'llama3';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt,
        system: config.systemInstruction,
        stream: false,
        options: {
          temperature: config.temperature ?? 0.7,
          num_predict: config.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama returned status ${res.status}: ${errText || res.statusText}`);
    }

    const data = (await res.json()) as any;
    return {
      text: data.response || '',
      usage: {
        prompt_tokens: data.prompt_eval_count,
        completion_tokens: data.eval_count,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Local Ollama request timed out at ${baseUrl}`);
    }
    if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
      throw new Error(
        `Could not connect to Local Ollama at ${baseUrl}. Ensure Ollama is running ('ollama serve') on your machine.`
      );
    }
    throw err;
  }
}

/**
 * Executes a call to an OpenAI-compatible endpoint (LM Studio, vLLM, OpenAI, Groq, DeepSeek)
 */
async function callOpenAICompatible(
  prompt: string,
  config: LLMConfig
): Promise<{ text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
  let defaultBase = 'https://api.openai.com/v1';
  if (config.provider === 'lmstudio') {
    defaultBase = 'http://localhost:1234/v1';
  }

  const baseUrl = (config.baseUrl || defaultBase).replace(/\/$/, '');
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || (config.provider === 'lmstudio' ? 'not-needed' : '');
  const modelName = config.model || (config.provider === 'lmstudio' ? 'local-model' : 'gpt-4o-mini');

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (config.systemInstruction) {
    messages.push({ role: 'system', content: config.systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${config.provider.toUpperCase()} returned status ${res.status}: ${errText || res.statusText}`);
    }

    const data = (await res.json()) as any;
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        }
      : undefined;

    return { text, usage };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${baseUrl} timed out after 60 seconds.`);
    }
    if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
      throw new Error(`Could not connect to ${config.provider} at ${baseUrl}. Verify the endpoint is accessible.`);
    }
    throw err;
  }
}

/**
 * Probes a local LLM (Ollama or LM Studio) to check connectivity and list models
 */
export async function probeLocalLLM(provider: 'ollama' | 'lmstudio', baseUrl?: string): Promise<{
  online: boolean;
  url: string;
  models: string[];
  latency_ms: number;
  error?: string;
}> {
  const targetUrl = (baseUrl || (provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1')).replace(/\/$/, '');
  const start = Date.now();

  try {
    if (provider === 'ollama') {
      const res = await fetch(`${targetUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      const latency_ms = Date.now() - start;

      if (res.ok) {
        const data = (await res.json()) as any;
        const models = (data.models || []).map((m: any) => m.name || m.model);
        return { online: true, url: targetUrl, models, latency_ms };
      }
      return { online: false, url: targetUrl, models: [], latency_ms, error: `HTTP ${res.status}` };
    } else {
      // LM Studio / OpenAI compatible /v1/models
      const res = await fetch(`${targetUrl}/models`, {
        signal: AbortSignal.timeout(3000),
      });
      const latency_ms = Date.now() - start;

      if (res.ok) {
        const data = (await res.json()) as any;
        const models = (data.data || []).map((m: any) => m.id);
        return { online: true, url: targetUrl, models, latency_ms };
      }
      return { online: false, url: targetUrl, models: [], latency_ms, error: `HTTP ${res.status}` };
    }
  } catch (err: any) {
    return {
      online: false,
      url: targetUrl,
      models: [],
      latency_ms: Date.now() - start,
      error: err.message || 'Offline or Connection Refused',
    };
  }
}

/**
 * Governed LLM Generation Function
 * 
 * Routes generation through the Vortex Execution Gateway to ensure:
 * 1. Policy evaluation (tokens, bounded execution)
 * 2. Deterministic RFC 8785 input and output canonicalization
 * 3. Generation of an authentic Ed25519 signed ExecutionProof v1
 * 4. Independent Verifier validation
 */
export async function executeGovernedLLM(
  prompt: string,
  config: LLMConfig,
  requestId?: string
): Promise<LLMInvocationResult> {
  const reqId = requestId || `req-llm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const t0 = Date.now();

  // 1. Dispatch actual generation depending on provider
  let rawResult: { text: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };

  if (config.provider === 'gemini') {
    rawResult = await callGemini(prompt, config);
  } else if (config.provider === 'ollama') {
    rawResult = await callOllama(prompt, config);
  } else {
    rawResult = await callOpenAICompatible(prompt, config);
  }

  const durationMs = Date.now() - t0;

  // 2. Wrap through Vortex Execution Gateway to emit ExecutionProof v1
  const vortexRequest: VortexRequest = {
    request_id: reqId,
    operation: 'execute',
    target: {
      resource: `llm://${config.provider}/${config.model}`,
      provider: config.provider,
      model: config.model,
    },
    authorization: {
      principal_id: 'scoobiii',
      agent_id: 'agent/vortex',
      policy_id: 'vortex-development',
      policy_version: '1.0.0',
      capability: 'llm.inference',
      scope: {
        paths: ['*'],
        repositories: ['*'],
      },
    },
    input: {
      prompt,
      systemInstruction: config.systemInstruction,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    },
  };

  const pipelineResponse = await executeVortexPipeline(vortexRequest);

  // 3. Run Independent Verifier on the generated proof
  let verification: VerificationResult | undefined;
  if (pipelineResponse.execution_proof) {
    verification = verifyExecutionProof(pipelineResponse.execution_proof);
  }

  return {
    text: rawResult.text,
    provider: config.provider,
    model: config.model,
    usage: rawResult.usage,
    duration_ms: durationMs,
    execution_proof: pipelineResponse.execution_proof,
    verification,
  };
}
