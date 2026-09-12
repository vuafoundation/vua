/**
 * Vortex Dynamic Benchmark Bootstrap
 *
 * Establishes a measured baseline for the current execution environment and workload.
 * No normative performance numbers are stored in source code.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalize } from './canonicalize.js';
import { sha256 } from './crypto.js';
import type { BenchmarkMetrics } from './evidence.js';

export const BENCHMARK_SUITE_VERSION = '2.0.0';
export const BENCHMARK_WORKLOAD_VERSION = 'vortex-inspect-pipeline-v1';

export interface EnvironmentFingerprint {
  platform: NodeJS.Platform;
  arch: string;
  node: string;
  cpu_count: number;
  cpu_model: string;
  total_memory_mb: number;
  release: string;
  termux: boolean;
  alpine: boolean;
}

export interface DynamicBaseline {
  schema: 'vortex-dynamic-baseline/v1';
  created_at: string;
  suite_version: string;
  workload_version: string;
  environment: EnvironmentFingerprint;
  environment_hash: string;
  workload_hash: string;
  metrics: BenchmarkMetrics;
  sample: {
    warmup: number;
    iterations: number;
  };
}

export function detectEnvironment(): EnvironmentFingerprint {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu_count: cpus.length,
    cpu_model: cpus[0]?.model || 'unknown',
    total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    release: os.release(),
    termux: Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')),
    alpine: fs.existsSync('/etc/alpine-release'),
  };
}

export function createEnvironmentHash(environment: EnvironmentFingerprint): string {
  return sha256(canonicalize(environment));
}

export function createWorkloadHash(): string {
  return sha256(canonicalize({
    workload_version: BENCHMARK_WORKLOAD_VERSION,
    operation: 'inspect',
    input: { benchmark: true, phase: 'measurement' },
    execution_mode: 'sequential',
  }));
}

export function baselinePath(): string {
  return process.env.VORTEX_BASELINE_FILE || path.resolve('.vortex/baseline.json');
}

export function writeDynamicBaseline(baseline: DynamicBaseline, file = baselinePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const canonical = canonicalize(baseline);
  fs.writeFileSync(file, `${canonical}\n`, 'utf8');
}

export function readDynamicBaseline(file = baselinePath()): DynamicBaseline {
  if (!fs.existsSync(file)) {
    throw new Error(`Dynamic baseline unavailable: ${file}. Run benchmark bootstrap first; refusing static fallback.`);
  }

  const baseline = JSON.parse(fs.readFileSync(file, 'utf8')) as DynamicBaseline;
  if (baseline.schema !== 'vortex-dynamic-baseline/v1') {
    throw new Error(`Unsupported dynamic baseline schema: ${baseline.schema}`);
  }

  const expectedEnvironment = detectEnvironment();
  const expectedEnvironmentHash = createEnvironmentHash(expectedEnvironment);
  const expectedWorkloadHash = createWorkloadHash();

  if (baseline.environment_hash !== expectedEnvironmentHash) {
    throw new Error('Dynamic baseline environment mismatch; refusing cross-environment comparison.');
  }
  if (baseline.workload_hash !== expectedWorkloadHash) {
    throw new Error('Dynamic baseline workload mismatch; refusing cross-workload comparison.');
  }
  if (baseline.suite_version !== BENCHMARK_SUITE_VERSION) {
    throw new Error('Dynamic baseline suite version mismatch; bootstrap a new baseline.');
  }
  if (baseline.workload_version !== BENCHMARK_WORKLOAD_VERSION) {
    throw new Error('Dynamic baseline workload version mismatch; bootstrap a new baseline.');
  }

  return baseline;
}

export function createDynamicBaseline(metrics: BenchmarkMetrics, warmup: number, iterations: number): DynamicBaseline {
  const environment = detectEnvironment();
  return {
    schema: 'vortex-dynamic-baseline/v1',
    created_at: new Date().toISOString(),
    suite_version: BENCHMARK_SUITE_VERSION,
    workload_version: BENCHMARK_WORKLOAD_VERSION,
    environment,
    environment_hash: createEnvironmentHash(environment),
    workload_hash: createWorkloadHash(),
    metrics,
    sample: { warmup, iterations },
  };
}
