#!/usr/bin/env python3
"""fix_ci_provenance.py - remove defaults falsos de CI em generateExecutionEvidence."""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

HEADER_RE = re.compile(r"/\*\*[\s\S]*?@gos3-contract[\s\S]*?\*/\n?", re.MULTILINE)

OLD = """  const commit_sha = params.commitSha || '856920785b8392b036211cc851e1f6467961ff52';
  const ci_run_id = params.ciRunId || '34228487367';
  const ci_attempt = params.ciRunAttempt || '1';"""

NEW = """  const commit_sha = params.commitSha;
  const ci_run_id = params.ciRunId;
  const ci_attempt = params.ciRunAttempt;
  if (!commit_sha || !ci_run_id) {
    throw new Error(
      'CI_PROVENANCE_MISSING: commitSha and ciRunId are required; ' +
      'local runs must not fabricate CI evidence. Pass explicit values ' +
      'or set VUA_COMMIT_SHA / GITHUB_RUN_ID env vars in the caller.',
    );
  }"""

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
    f = args.repo.resolve() / "src/vortex/evidence.ts"
    if not f.exists():
        sys.exit("nao encontrado: " + str(f))
    src = f.read_text(encoding="utf-8")
    if OLD not in src:
        print("[skip] defaults falsos ja removidos ou texto diferente")
        print("  grep: generateExecutionEvidence -> verifique manualmente")
        return 1
    src = src.replace(OLD, NEW)
    f.write_text(src, encoding="utf-8")
    onboard(f)
    print("[ok] defaults removidos, GOS3 recalculado")
    return 0

if __name__ == "__main__":
    sys.exit(main())
