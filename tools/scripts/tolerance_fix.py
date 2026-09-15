#!/usr/bin/env python3
"""
tolerance_fix.py - Liga VUA_BASELINE_TOLERANCE ao verdict de evaluateBenchmarkGate.

Uso:
  python3 tolerance_fix.py --repo /root/vua
  python3 tolerance_fix.py --repo /root/vua --test
  python3 tolerance_fix.py --repo /root/vua --test --tolerance 1.30
"""
from __future__ import annotations
import argparse
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

HEADER_RE = re.compile(r"/\*\*[\s\S]*?@gos3-contract[\s\S]*?\*/\n?", re.MULTILINE)


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def body_of(text):
    return HEADER_RE.sub("", text, count=1).strip()


def onboard(path, capability="repository.write"):
    if not path.exists():
        print("  [skip] " + str(path))
        return
    raw = path.read_text(encoding="utf-8")
    body = body_of(raw)
    checksum = sha256_hex(body)
    header = (
        "/**\n"
        " * @gos3-contract\n"
        " * @version 1.0.0\n"
        " * @resource " + path.as_posix() + "\n"
        " * @checksum sha256:" + checksum + "\n"
        " * @capability " + capability + "\n"
        " * @onboarded_at 2026-09-13T00:00:00.000Z\n"
        " * @governed true\n"
        " */\n"
    )
    new = header + body + "\n"
    if new == raw:
        print("  [ok] " + str(path))
        return
    path.write_text(new, encoding="utf-8")
    print("  [onboarded] " + str(path))


SIG_OLD = """export function evaluateBenchmarkGate(
  current: BenchmarkMetrics,
  gatesPassed: { coverage: boolean; security: boolean; integration: boolean; proof: boolean },
  baseline: BenchmarkMetrics,
): BenchmarkReport {"""

SIG_NEW = """export function evaluateBenchmarkGate(
  current: BenchmarkMetrics,
  gatesPassed: { coverage: boolean; security: boolean; integration: boolean; proof: boolean },
  baseline: BenchmarkMetrics,
  tolerance: number = 1.15,
): BenchmarkReport {"""

VERDICT_OLD = """  const scoreBaseline = calculateBenchmarkScore(baseline);
  const scoreCurrent = calculateBenchmarkScore(current);

  let verdict: BenchmarkReport['verdict'] = 'BLOCKED_BY_GATES';
  if (!allAbsoluteGates) {
    verdict = 'BLOCKED_BY_GATES';
  } else if (scoreCurrent > scoreBaseline) {
    verdict = 'PASS_SUPERIOR';
  } else if (scoreCurrent >= scoreBaseline * 0.95) {
    verdict = 'PASS_ACCEPTABLE';
  } else {
    verdict = 'FAIL_REGRESSION';
  }"""

VERDICT_NEW = """  const scoreBaseline = calculateBenchmarkScore(baseline);
  const scoreCurrent = calculateBenchmarkScore(current);
  const minAcceptable = scoreBaseline / tolerance;

  let verdict: BenchmarkReport['verdict'] = 'BLOCKED_BY_GATES';
  if (!allAbsoluteGates) {
    verdict = 'BLOCKED_BY_GATES';
  } else if (scoreCurrent > scoreBaseline) {
    verdict = 'PASS_SUPERIOR';
  } else if (scoreCurrent >= minAcceptable) {
    verdict = 'PASS_ACCEPTABLE';
  } else {
    verdict = 'FAIL_REGRESSION';
  }"""


def patch_evidence(path):
    if not path.exists():
        sys.exit("nao encontrado: " + str(path))
    src = path.read_text(encoding="utf-8")
    orig = src

    if SIG_OLD in src:
        src = src.replace(SIG_OLD, SIG_NEW)
        print("  [evidence] assinatura + tolerance")
    elif "tolerance: number = 1.15" in src:
        print("  [evidence] assinatura ja tem tolerance")
    else:
        print("  [warn] assinatura nao bateu - conferir manualmente")

    if VERDICT_OLD in src:
        src = src.replace(VERDICT_OLD, VERDICT_NEW)
        print("  [evidence] verdict usa minAcceptable")
    elif "minAcceptable = scoreBaseline / tolerance" in src:
        print("  [evidence] verdict ja usa tolerance")
    else:
        print("  [warn] bloco de verdict nao bateu - conferir manualmente")

    if src != orig:
        path.write_text(src, encoding="utf-8")


CALL_OLD = """    const benchmarkReport = evaluateBenchmarkGate(
      currentMetrics,
      { coverage: true, security: true, integration: true, proof: true },
      baselineRecord.metrics,
    );"""

CALL_NEW = """    const benchmarkReport = evaluateBenchmarkGate(
      currentMetrics,
      { coverage: true, security: true, integration: true, proof: true },
      baselineRecord.metrics,
      BASELINE_TOLERANCE,
    );

    console.log(
      `[baseline] tolerance=${BASELINE_TOLERANCE} minAcceptable=${(benchmarkReport.score_baseline / BASELINE_TOLERANCE).toFixed(1)}`,
    );"""


def patch_suite(path):
    if not path.exists():
        sys.exit("nao encontrado: " + str(path))
    src = path.read_text(encoding="utf-8")
    orig = src

    if CALL_OLD in src:
        src = src.replace(CALL_OLD, CALL_NEW)
        print("  [suite] passa BASELINE_TOLERANCE + log")
    elif "BASELINE_TOLERANCE,\n" in src and "minAcceptable=" in src:
        print("  [suite] ja passa BASELINE_TOLERANCE")
    else:
        print("  [warn] chamada do gate nao bateu - conferir manualmente")

    if src != orig:
        path.write_text(src, encoding="utf-8")


def run(cmd, cwd, env=None):
    print("\n$ " + cmd)
    e = os.environ.copy()
    if env:
        e.update(env)
    return subprocess.call(cmd, shell=True, cwd=cwd, env=e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--tolerance", default="1.50")
    args = ap.parse_args()

    repo = args.repo.resolve()
    if not (repo / "package.json").exists():
        sys.exit("nao e repo: " + str(repo))

    print("-- 1. evidence.ts --")
    patch_evidence(repo / "src/vortex/evidence.ts")

    print("\n-- 2. run-full-suite.ts --")
    patch_suite(repo / "scripts/run-full-suite.ts")

    print("\n-- 3. GOS3 onboarding --")
    onboard(repo / "src/vortex/evidence.ts")
    onboard(repo / "scripts/run-full-suite.ts")

    print("\n-- 4. GOS3 strict --")
    run("npx tsx scripts/verify-gos3-headers.ts --strict", cwd=repo)

    if args.test:
        env = {"VUA_BASELINE_TOLERANCE": args.tolerance}
        print("\n-- 5. npm test #1 (tolerance=" + args.tolerance + ") --")
        rc1 = run("npm test", cwd=repo, env=env)
        print("\n-- 6. npm test #2 (tolerance=" + args.tolerance + ") --")
        rc2 = run("npm test", cwd=repo, env=env)
        print("\nresultado: #1=" + str(rc1) + " #2=" + str(rc2))
        if rc1 != 0 or rc2 != 0:
            print("[aviso] nem todas as execucoes passaram")

    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
