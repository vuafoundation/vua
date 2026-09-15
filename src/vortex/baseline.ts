/**
 * @gos3-contract
 * @version 1.0.0
 * @resource src/vortex/baseline.ts
 * @checksum sha256:00bbd0ab98c9ce226f779c7a885cc2d560966962d2047b06d699f2f82f7ab7f5
 * @capability repository.write
 * @onboarded_at 2026-09-13T14:27:31.000Z
 * @governed true
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus, arch, platform } from "node:os";
import { execSync } from "node:child_process";
import type { BenchmarkMetrics } from "./evidence.js";

export interface BaselineRecord {
  version: "1";
  env_fingerprint: string;
  env: { arch: string; platform: string; cpu_model: string; node_version: string };
  commit_sha: string;
  branch: string;
  measured_at: string;
  sample_size: number;
  warmup_size: number;
  metrics: BenchmarkMetrics;
  baseline_hash: string;
}

const ROOT = process.env.VUA_BASELINE_ROOT ?? "baselines";
const TOLERANCE = Number(process.env.VUA_BASELINE_TOLERANCE ?? "1.15");

function canonicalize(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  if (v && typeof v === "object") {
    const k = Object.keys(v as object).sort();
    return `{${k.map((x) => `${JSON.stringify(x)}:${canonicalize((v as any)[x])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function envFingerprint(): { fp: string; env: BaselineRecord["env"] } {
  const env = {
    arch: arch(),
    platform: platform(),
    cpu_model: cpus()[0]?.model ?? "unknown",
    node_version: process.version,
  };
  const fp = "sha256:" + createHash("sha256").update(canonicalize(env)).digest("hex").slice(0, 16);
  return { fp, env };
}

function currentCommit(): { sha: string; branch: string } {
  try {
    return {
      sha: execSync("git rev-parse HEAD").toString().trim(),
      branch: execSync("git rev-parse --abbrev-ref HEAD").toString().trim(),
    };
  } catch {
    return { sha: "unknown", branch: "unknown" };
  }
}

export function baselinePath(): { path: string; fp: string; env: BaselineRecord["env"] } {
  const { fp, env } = envFingerprint();
  const dir = `${ROOT}/${fp.replace(":", "_")}`;
  mkdirSync(dir, { recursive: true });
  return { path: `${dir}/latest.json`, fp, env };
}

export function loadBaseline(): BaselineRecord | null {
  const { path } = baselinePath();
  if (!existsSync(path)) return null;
  const rec: BaselineRecord = JSON.parse(readFileSync(path, "utf8"));
  const { baseline_hash, ...rest } = rec;
  const expected = "sha256:" + createHash("sha256").update(canonicalize(rest)).digest("hex");
  if (expected !== baseline_hash) {
    throw new Error(`BASELINE_TAMPERED: expected ${expected}, got ${baseline_hash}`);
  }
  return rec;
}

export function saveBaseline(
  metrics: BenchmarkMetrics,
  sampleSize: number,
  warmupSize: number,
): BaselineRecord {
  const { path, fp, env } = baselinePath();
  const { sha, branch } = currentCommit();
  const rec: Omit<BaselineRecord, "baseline_hash"> = {
    version: "1",
    env_fingerprint: fp,
    env,
    commit_sha: sha,
    branch,
    measured_at: new Date().toISOString(),
    sample_size: sampleSize,
    warmup_size: warmupSize,
    metrics,
  };
  const hash = "sha256:" + createHash("sha256").update(canonicalize(rec)).digest("hex");
  const full: BaselineRecord = { ...rec, baseline_hash: hash };
  writeFileSync(path, JSON.stringify(full, null, 2) + "\n");
  return full;
}

export function compareBaseline(
  current: BenchmarkMetrics,
  opts: { establish: boolean; sampleSize: number; warmupSize: number },
):
  | { kind: "ESTABLISHED"; record: BaselineRecord }
  | { kind: "COMPARED"; tolerance: number; withinTolerance: boolean; baseline: BenchmarkMetrics; reasons: string[] } {
  const existing = loadBaseline();

  if (opts.establish || !existing) {
    const record = saveBaseline(current, opts.sampleSize, opts.warmupSize);
    return { kind: "ESTABLISHED", record };
  }

  const b = existing.metrics;
  const reasons: string[] = [];
  if (current.rps < b.rps / TOLERANCE) reasons.push(`rps ${current.rps} < ${b.rps}/${TOLERANCE}`);
  if (current.p50_ms > b.p50_ms * TOLERANCE) reasons.push(`p50 ${current.p50_ms} > ${b.p50_ms}*${TOLERANCE}`);
  if (current.p95_ms > b.p95_ms * TOLERANCE) reasons.push(`p95 ${current.p95_ms} > ${b.p95_ms}*${TOLERANCE}`);
  if (current.p99_ms > b.p99_ms * TOLERANCE) reasons.push(`p99 ${current.p99_ms} > ${b.p99_ms}*${TOLERANCE}`);
  if (current.error_rate_pct > b.error_rate_pct + 0.5) reasons.push(`error_rate ${current.error_rate_pct} > ${b.error_rate_pct}+0.5`);

  return { kind: "COMPARED", tolerance: TOLERANCE, withinTolerance: reasons.length === 0, baseline: b, reasons };
}
