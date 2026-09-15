#!/usr/bin/env python3
"""fix_ci_caller.py - passa commitSha/ciRunId reais para generateExecutionEvidence."""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

HEADER_RE = re.compile(r"/\*\*[\s\S]*?@gos3-contract[\s\S]*?\*/\n?", re.MULTILINE)

CALL_OLD = """  const evidence = generateExecutionEvidence({
    proofHashes: collectedProofHashes.length > 0
      ? collectedProofHashes
      : (() => {
          throw new Error('DELIVERABLE_TRUTH: evidence proof hash is missing; dummy fallback is forbidden');
        })(),
    allTestsPassed: true,
    coveragePercent: 100,
  });"""

CALL_NEW = """  const evidence = generateExecutionEvidence({
    commitSha: resolveCommitSha(),
    ciRunId: resolveCiRunId(),
    ciRunAttempt: resolveCiRunAttempt(),
    proofHashes: collectedProofHashes.length > 0
      ? collectedProofHashes
      : (() => {
          throw new Error('DELIVERABLE_TRUTH: evidence proof hash is missing; dummy fallback is forbidden');
        })(),
    allTestsPassed: true,
    coveragePercent: 100,
  });"""

HELPERS = """
function resolveCommitSha(): string {
  if (process.env.VUA_COMMIT_SHA) return process.env.VUA_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    throw new Error('CI_PROVENANCE_MISSING: no VUA_COMMIT_SHA, GITHUB_SHA, or git HEAD');
  }
}

function resolveCiRunId(): string {
  if (process.env.GITHUB_RUN_ID) return process.env.GITHUB_RUN_ID;
  if (process.env.VUA_CI_RUN_ID) return process.env.VUA_CI_RUN_ID;
  return `local-${Date.now()}`;
}

function resolveCiRunAttempt(): string {
  return process.env.GITHUB_RUN_ATTEMPT ?? process.env.VUA_CI_RUN_ATTEMPT ?? '1';
}

"""

def onboard(path):
    raw = path.read_text(encoding="utf-8")
    body = HEADER_RE.sub("", raw, count=1).strip()
    checksum = hashlib.sha256(body.encode("utf-8")).hexdigest()
    header = (
        "/**\n * @gos3-contract\n * @version 1.0.0\n"
        " * @resource " + path.as_posix() + "\n"
        " * @checksum sha256:" + checksum + "\n"
        " * @capability repository.write\n"
        " * @onboarded_at 2026-09-13T00:00:00.000Z\n"
        " * @governed true\n */\n"
    )
    path.write_text(header + body + "\n", encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    args = ap.parse_args()
    f = args.repo.resolve() / "scripts/run-full-suite.ts"
    if not f.exists():
        sys.exit("nao encontrado: " + str(f))
    src = f.read_text(encoding="utf-8")
    if CALL_OLD not in src:
        print("[skip] caller ja foi patchado ou texto diferente")
        print("  grep: generateExecutionEvidence -> verifique manualmente")
        return 1
    src = src.replace(CALL_OLD, CALL_NEW)
    if "function resolveCommitSha()" not in src:
        marker = "async function main() {"
        if marker not in src:
            sys.exit("marcador 'async function main()' nao encontrado")
        src = src.replace(marker, HELPERS + marker, 1)
    f.write_text(src, encoding="utf-8")
    onboard(f)
    print("[ok] caller passou valores reais, GOS3 recalculado")
    return 0

if __name__ == "__main__":
    sys.exit(main())
