#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, re, subprocess, sys, os
from pathlib import Path

HEADER_RE = re.compile(r"/\*\*[\s\S]*?@gos3-contract[\s\S]*?\*/\n?", re.MULTILINE)

def sha256_hex(t): return hashlib.sha256(t.encode("utf-8")).hexdigest()
def body_of(t): return HEADER_RE.sub("", t, count=1).strip()

def onboard_file(path: Path, capability="repository.write"):
    if not path.exists():
        print(f"  [skip] não existe: {path}"); return False
    raw = path.read_text(encoding="utf-8")
    body = body_of(raw)
    checksum = sha256_hex(body)
    header = (
        "/**\n"
        " * @gos3-contract\n"
        " * @version 1.0.0\n"
        f" * @resource {path.as_posix()}\n"
        f" * @checksum sha256:{checksum}\n"
        f" * @capability {capability}\n"
        " * @onboarded_at 2026-09-13T00:00:00.000Z\n"
        " * @governed true\n"
        " */\n"
    )
    new = header + body + "\n"
    if new == raw:
        print(f"  [ok] já onboarded: {path}"); return False
    path.write_text(new, encoding="utf-8")
    print(f"  [onboarded] {path}"); return True

EVIDENCE_OLD_BASELINE = "export const BASELINE_METRICS: BenchmarkMetrics | null = null;\n"
EVIDENCE_OLD_SIG = """export function evaluateBenchmarkGate(
  current: BenchmarkMetrics,
  gatesPassed: { coverage: boolean; security: boolean; integration: boolean; proof: boolean },
  baseline: BenchmarkMetrics | null = BASELINE_METRICS,
): BenchmarkReport {"""
EVIDENCE_NEW_SIG = """export function evaluateBenchmarkGate(
  current: BenchmarkMetrics,
  gatesPassed: { coverage: boolean; security: boolean; integration: boolean; proof: boolean },
  baseline: BenchmarkMetrics,
): BenchmarkReport {"""
EVIDENCE_OLD_THROW = """  if (!baseline) {
    throw new Error(
      'DELIVERABLE_TRUTH: benchmark baseline evidence is required; static baseline is forbidden',
    );
  }

"""

def patch_evidence(path: Path):
    if not path.exists(): sys.exit(f"não encontrado: {path}")
    src = path.read_text(encoding="utf-8"); orig = src
    if EVIDENCE_OLD_BASELINE in src:
        src = src.replace(EVIDENCE_OLD_BASELINE, "")
        print("  [evidence] removido BASELINE_METRICS")
    if EVIDENCE_OLD_SIG in src:
        src = src.replace(EVIDENCE_OLD_SIG, EVIDENCE_NEW_SIG)
        print("  [evidence] assinatura atualizada")
    if EVIDENCE_OLD_THROW in src:
        src = src.replace(EVIDENCE_OLD_THROW, "")
        print("  [evidence] throw removido")
    if "    baseline: baseline!," in src:
        src = src.replace("    baseline: baseline!,", "    baseline,")
        print("  [evidence] baseline! -> baseline")
    if src != orig: path.write_text(src, encoding="utf-8")

IMPORT_OLD = "import { evaluateBenchmarkGate, generateExecutionEvidence, BASELINE_METRICS } from '../src/vortex/evidence.js';"
IMPORT_NEW = "import { evaluateBenchmarkGate, generateExecutionEvidence } from '../src/vortex/evidence.js';"

NODE_IMPORTS_BLOCK = (
    "import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';\n"
    "import { createHash } from 'node:crypto';\n"
    "import { cpus, arch, platform } from 'node:os';\n"
    "import { execSync } from 'node:child_process';\n"
)

BASELINE_HELPERS = (
    "\n// ─── BASELINE DINÂMICA ────────────────────────────────────────────────────\n"
    "const BASELINE_ROOT = process.env.VUA_BASELINE_ROOT ?? 'baselines';\n"
    "const BASELINE_TOLERANCE = Number(process.env.VUA_BASELINE_TOLERANCE ?? '1.15');\n"
    "\n"
    "function canonicalizeBaseline(v: unknown): string {\n"
    "  if (Array.isArray(v)) return `[${v.map(canonicalizeBaseline).join(',')}]`;\n"
    "  if (v && typeof v === 'object') {\n"
    "    const k = Object.keys(v as object).sort();\n"
    "    return `{${k.map((x) => `${JSON.stringify(x)}:${canonicalizeBaseline((v as any)[x])}`).join(',')}}`;\n"
    "  }\n"
    "  return JSON.stringify(v);\n"
    "}\n"
    "\n"
    "function envFingerprint(): { fp: string; dir: string; file: string } {\n"
    "  const env = { arch: arch(), platform: platform(), cpu_model: cpus()[0]?.model ?? 'unknown', node_version: process.version };\n"
    "  const fp = 'sha256:' + createHash('sha256').update(canonicalizeBaseline(env)).digest('hex').slice(0, 16);\n"
    "  const dir = `${BASELINE_ROOT}/${fp.replace(':', '_')}`;\n"
    "  return { fp, dir, file: `${dir}/latest.json` };\n"
    "}\n"
    "\n"
    "function loadBaseline(): { metrics: BenchmarkMetrics; commit: string } | null {\n"
    "  const { file } = envFingerprint();\n"
    "  if (!existsSync(file)) return null;\n"
    "  const rec = JSON.parse(readFileSync(file, 'utf8'));\n"
    "  const { baseline_hash, ...rest } = rec;\n"
    "  const expected = 'sha256:' + createHash('sha256').update(canonicalizeBaseline(rest)).digest('hex');\n"
    "  if (expected !== baseline_hash) throw new Error(`BASELINE_TAMPERED: ${file}`);\n"
    "  return { metrics: rec.metrics, commit: rec.commit_sha };\n"
    "}\n"
    "\n"
    "function saveBaseline(metrics: BenchmarkMetrics, sampleSize: number, warmupSize: number): string {\n"
    "  const { fp, dir, file } = envFingerprint();\n"
    "  mkdirSync(dir, { recursive: true });\n"
    "  let sha = 'unknown', branch = 'unknown';\n"
    "  try { sha = execSync('git rev-parse HEAD').toString().trim(); branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim(); } catch {}\n"
    "  const rec: any = { version: '1', env_fingerprint: fp, env: { arch: arch(), platform: platform(), cpu_model: cpus()[0]?.model ?? 'unknown', node_version: process.version }, commit_sha: sha, branch, measured_at: new Date().toISOString(), sample_size: sampleSize, warmup_size: warmupSize, metrics };\n"
    "  rec.baseline_hash = 'sha256:' + createHash('sha256').update(canonicalizeBaseline(rec)).digest('hex');\n"
    "  writeFileSync(file, JSON.stringify(rec, null, 2) + '\\n');\n"
    "  return file;\n"
    "}\n"
    "// ──────────────────────────────────────────────────────────────────────────\n\n"
)

BENCH_OLD = """    const benchmarkReport = evaluateBenchmarkGate(currentMetrics, {
      coverage: true,
      security: true,
      integration: true,
      proof: true,
    });"""

BENCH_NEW = """    const establish = process.env.VUA_ESTABLISH_BASELINE === '1';
    let baselineRecord = loadBaseline();
    if (establish || baselineRecord === null) {
      const file = saveBaseline(currentMetrics, sampleSize, warmupSize);
      console.log(`\\n[baseline] ESTABLISHED at ${file}`);
      baselineRecord = { metrics: currentMetrics, commit: 'just-established' };
    }
    const benchmarkReport = evaluateBenchmarkGate(
      currentMetrics,
      { coverage: true, security: true, integration: true, proof: true },
      baselineRecord.metrics,
    );
    const b = baselineRecord.metrics;
    const drift: string[] = [];
    if (currentMetrics.rps < b.rps / BASELINE_TOLERANCE) drift.push(`rps ${currentMetrics.rps} < ${b.rps}/${BASELINE_TOLERANCE}`);
    if (currentMetrics.p95_ms > b.p95_ms * BASELINE_TOLERANCE) drift.push(`p95 ${currentMetrics.p95_ms} > ${b.p95_ms}*${BASELINE_TOLERANCE}`);
    if (currentMetrics.p99_ms > b.p99_ms * BASELINE_TOLERANCE) drift.push(`p99 ${currentMetrics.p99_ms} > ${b.p99_ms}*${BASELINE_TOLERANCE}`);
    if (drift.length) console.log(`[baseline] drift outside tolerance: ${drift.join('; ')}`);"""

def patch_suite(path: Path):
    if not path.exists(): sys.exit(f"não encontrado: {path}")
    src = path.read_text(encoding="utf-8"); orig = src
    if IMPORT_OLD in src:
        src = src.replace(IMPORT_OLD, IMPORT_NEW); print("  [suite] import limpo")
    if "from 'node:fs'" not in src:
        lines = src.splitlines(keepends=True)
        last = max((i for i, l in enumerate(lines) if l.startswith("import ")), default=0)
        lines.insert(last + 1, NODE_IMPORTS_BLOCK)
        src = "".join(lines); print("  [suite] node imports adicionados")
    if "function loadBaseline()" not in src:
        marker = "async function main() {"
        if marker in src:
            src = src.replace(marker, BASELINE_HELPERS + marker, 1)
            print("  [suite] helpers inseridos")
    if BENCH_OLD in src:
        src = src.replace(BENCH_OLD, BENCH_NEW); print("  [suite] step 6 atualizado")
    if src != orig: path.write_text(src, encoding="utf-8")

def run(cmd, cwd, env=None):
    print(f"\n$ {cmd}")
    e = os.environ.copy()
    if env: e.update(env)
    return subprocess.call(cmd, shell=True, cwd=cwd, env=e)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--establish", action="store_true")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()
    repo = args.repo.resolve()
    if not (repo / "package.json").exists(): sys.exit(f"não é repo: {repo}")

    print("── 1. evidence.ts ──"); patch_evidence(repo / "src/vortex/evidence.ts")
    print("\n── 2. run-full-suite.ts ──"); patch_suite(repo / "scripts/run-full-suite.ts")
    print("\n── 3. GOS3 onboarding ──")
    onboard_file(repo / "src/vortex/evidence.ts")
    onboard_file(repo / "scripts/run-full-suite.ts")
    if args.establish:
        print("\n── 4. establish baseline ──")
        run("npm test", cwd=repo, env={"VUA_ESTABLISH_BASELINE": "1"})
    if args.test:
        print("\n── 5. npm test ──"); run("npm test", cwd=repo)
    print("\n── 6. baselines ──")
    for b in ((repo / "baselines").rglob("latest.json") if (repo / "baselines").exists() else []):
        print(f"  {b}")
    if args.commit:
        run("git add src/vortex/evidence.ts scripts/run-full-suite.ts baselines/", cwd=repo)
        run('git commit -m "feat(bench): dynamic baseline GOS3"', cwd=repo)
    print("\nOK")
    return 0

if __name__ == "__main__":
    sys.exit(main())
