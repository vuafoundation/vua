import { createHash } from 'node:crypto';
import { arch, version } from 'node:process';
import { cpus, release } from 'node:os';
import fs from 'node:fs';
import type { BenchmarkMetrics } from './evidence.js';

export interface EnvironmentFingerprint {
  arch: string;
  cpu_model: string;
  cpu_count: number;
  node_version: string;
  os_release: string;
  sha256: string;
}

export interface BaselineSelection {
  metrics: BenchmarkMetrics;
  fingerprint: EnvironmentFingerprint;
  tolerance: number;
  source: 'environment-file' | 'normative-default';
}

export function getEnvironmentFingerprint(): EnvironmentFingerprint {
  const cpu = cpus();
  const cpu_model = cpu[0]?.model ?? 'unknown-cpu';
  const material = [arch, cpu_model, version, release()].join('|');
  return {
    arch,
    cpu_model,
    cpu_count: cpu.length,
    node_version: version,
    os_release: release(),
    sha256: `sha256:${createHash('sha256').update(material).digest('hex')}`,
  };
}

export function getBaselineTolerance(value = process.env.BASELINE_TOLERANCE): number {
  const tolerance = value === undefined || value === '' ? 1.0 : Number(value);
  if (!Number.isFinite(tolerance) || tolerance < 1) {
    throw new Error('BASELINE_TOLERANCE must be a finite number >= 1');
  }
  return tolerance;
}

export function selectBaseline(
  normative: BenchmarkMetrics,
  filePath = process.env.VORTEX_BASELINE_FILE,
  toleranceValue = process.env.BASELINE_TOLERANCE,
): BaselineSelection {
  const fingerprint = getEnvironmentFingerprint();
  const tolerance = getBaselineTolerance(toleranceValue);
  if (!filePath || !fs.existsSync(filePath)) {
    return { metrics: normative, fingerprint, tolerance, source: 'normative-default' };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, BenchmarkMetrics>;
  const metrics = parsed[fingerprint.sha256] ?? parsed[fingerprint.sha256.replace(/^sha256:/, '')];
  if (!metrics) return { metrics: normative, fingerprint, tolerance, source: 'normative-default' };
  validateMetrics(metrics);
  return { metrics, fingerprint, tolerance, source: 'environment-file' };
}

function validateMetrics(metrics: BenchmarkMetrics): void {
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid baseline metric: ${key}`);
  }
}
