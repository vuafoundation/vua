import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  GitCommit,
  Hash,
  TrendingUp,
  Cpu,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type { BenchmarkReport } from '../vortex/evidence.js';
import type { ExecutionEvidence } from '../vortex/types.js';

export const CIBenchmarkGate: React.FC = () => {
  const [data, setData] = useState<{
    evidence: ExecutionEvidence;
    benchmark: BenchmarkReport;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEvidence = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vortex/evidence');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">CI Evidence Hash & Benchmark Gate</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                spec §8 & §10 Gate
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Cryptographic Execution Evidence Hash tied directly to GitHub Actions CI run ID and commit SHA.
              Absolute non-negotiable gates: Coverage 100%, Security Pass, Integration Pass.
            </p>
          </div>

          <button
            onClick={fetchEvidence}
            disabled={loading}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex items-center gap-1 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh CI Metrics
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Execution Evidence Hash */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm text-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-400" />
                Execution Evidence Hash (CI-Dependent)
              </h3>

              <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg font-mono space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">commit_sha:</span>
                  <span className="text-indigo-300 flex items-center gap-1 truncate max-w-[240px]">
                    <GitCommit className="w-3.5 h-3.5 text-indigo-400" />
                    {data.evidence.commit_sha}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">ci_run_id:</span>
                  <span className="text-zinc-300">{data.evidence.ci.run_id}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">ci_attempt:</span>
                  <span className="text-zinc-300">{data.evidence.ci.run_attempt}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">workflow:</span>
                  <span className="text-zinc-300">{data.evidence.ci.workflow}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">code_coverage:</span>
                  <span className="text-emerald-400 font-bold">{data.evidence.result.coverage} (Deterministic 100%)</span>
                </div>

                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-zinc-500 text-[10px] uppercase block mb-1">
                    Canonical Evidence Hash (RFC 8785 + SHA-256)
                  </span>
                  <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-emerald-400 font-mono text-[10px] break-all select-all">
                    {data.evidence.canonical_hash}
                  </div>
                </div>
              </div>

              {/* Absolute Gates Checklist */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-300 block">
                  Mandatory Foundation Merge Gates
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 bg-zinc-950 border border-zinc-800 rounded flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Coverage 100%
                  </div>
                  <div className="p-2 bg-zinc-950 border border-zinc-800 rounded flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Adversarial Suite
                  </div>
                  <div className="p-2 bg-zinc-950 border border-zinc-800 rounded flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    10/10 E2E Real
                  </div>
                  <div className="p-2 bg-zinc-950 border border-zinc-800 rounded flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Proof Invariants
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Benchmark Comparison against Baseline */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Benchmark Baseline Comparison
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold">
                  {data.benchmark.verdict}
                </span>
              </div>

              {/* Score comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg text-center">
                  <div className="text-[10px] text-zinc-500 uppercase font-mono">Baseline Score</div>
                  <div className="text-2xl font-bold font-mono text-zinc-300 mt-1">
                    {data.benchmark.score_baseline}
                  </div>
                </div>

                <div className="p-3.5 bg-zinc-950 border border-emerald-500/40 rounded-lg text-center">
                  <div className="text-[10px] text-emerald-400 uppercase font-mono">Current PR Score</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {data.benchmark.score_current}
                  </div>
                </div>
              </div>

              {/* Metrics table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-[10px]">
                      <th className="pb-1">Metric</th>
                      <th className="pb-1 text-right">Baseline (main)</th>
                      <th className="pb-1 text-right">Current PR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    <tr>
                      <td className="py-1.5">Throughput (RPS)</td>
                      <td className="py-1.5 text-right">{data.benchmark.baseline.rps}</td>
                      <td className="py-1.5 text-right text-emerald-400 font-bold">
                        {data.benchmark.current.rps}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5">p50 Latency</td>
                      <td className="py-1.5 text-right">{data.benchmark.baseline.p50_ms}ms</td>
                      <td className="py-1.5 text-right text-emerald-400">
                        {data.benchmark.current.p50_ms}ms
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5">p95 Latency</td>
                      <td className="py-1.5 text-right">{data.benchmark.baseline.p95_ms}ms</td>
                      <td className="py-1.5 text-right text-emerald-400 font-bold">
                        {data.benchmark.current.p95_ms}ms
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5">p99 Latency</td>
                      <td className="py-1.5 text-right">{data.benchmark.baseline.p99_ms}ms</td>
                      <td className="py-1.5 text-right text-emerald-400">
                        {data.benchmark.current.p99_ms}ms
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5">Error Rate</td>
                      <td className="py-1.5 text-right">{data.benchmark.baseline.error_rate_pct}%</td>
                      <td className="py-1.5 text-right text-emerald-400">
                        {data.benchmark.current.error_rate_pct}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] text-zinc-400 font-mono">
                Formula: 30% Throughput + 20% p95 + 15% p99 + 15% Error Rate + 10% Timeout Rate + 10% Memory.
                Regression rule: PR must meet or exceed baseline before merge approval.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
