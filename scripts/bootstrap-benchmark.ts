/**
 * Vortex Benchmark Bootstrap
 *
 * Establishes the dynamic baseline used by the performance gate.
 * The baseline is measured on the current host and workload, then persisted
 * outside source control unless VORTEX_BASELINE_FILE points elsewhere.
 */

import { executeVortexPipeline, resetAntiReplayCache } from '../src/vortex/gateway.js';
import {
  createDynamicBaseline,
  writeDynamicBaseline,
  baselinePath,
  BENCHMARK_SUITE_VERSION,
  BENCHMARK_WORKLOAD_VERSION,
} from '../src/vortex/benchmark-bootstrap.js';

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const warmup = positiveInt(process.env.VORTEX_BENCH_WARMUP, 20);
  const iterations = positiveInt(process.env.VORTEX_BENCH_ITERATIONS, 200);

  console.log(`Vortex dynamic benchmark bootstrap ${BENCHMARK_SUITE_VERSION}`);
  console.log(`workload=${BENCHMARK_WORKLOAD_VERSION}`);
  console.log(`warmup=${warmup} iterations=${iterations}`);

  resetAntiReplayCache();

  for (let i = 0; i < warmup; i++) {
    await executeVortexPipeline({
      request_id: `bootstrap-warmup-${process.pid}-${i}`,
      operation: 'inspect',
      input: { benchmark: true, phase: 'warmup' },
    });
  }

  const latencies: number[] = [];
  const started = performance.now();
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    const requestStarted = performance.now();
    try {
      const result = await executeVortexPipeline({
        request_id: `bootstrap-sample-${process.pid}-${i}`,
        operation: 'inspect',
        input: { benchmark: true, phase: 'measurement' },
      });
      if (!result.execution_proof) throw new Error('benchmark execution produced no proof');
    } catch (error) {
      errors++;
      console.error(`benchmark operation ${i} failed:`, error);
    }
    latencies.push(performance.now() - requestStarted);
  }

  const durationMs = performance.now() - started;
  const successful = iterations - errors;
  const rps = successful / (durationMs / 1000);

  const metrics = {
    rps: Math.round(rps * 10) / 10,
    p50_ms: Math.round(percentile(latencies, 0.50) * 10) / 10,
    p95_ms: Math.round(percentile(latencies, 0.95) * 10) / 10,
    p99_ms: Math.round(percentile(latencies, 0.99) * 10) / 10,
    error_rate_pct: (errors / iterations) * 100,
    timeout_rate_pct: 0,
    memory_efficiency_pct: 100,
  };

  if (errors > 0) {
    throw new Error(`Cannot establish baseline with ${errors}/${iterations} failed operations`);
  }

  const baseline = createDynamicBaseline(metrics, warmup, iterations);
  writeDynamicBaseline(baseline);

  console.log(JSON.stringify({
    status: 'BASELINE_ESTABLISHED',
    file: baselinePath(),
    environment_hash: baseline.environment_hash,
    workload_hash: baseline.workload_hash,
    metrics: baseline.metrics,
    sample: baseline.sample,
  }, null, 2));
}

main().catch((error) => {
  console.error(`BASELINE_BOOTSTRAP_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
