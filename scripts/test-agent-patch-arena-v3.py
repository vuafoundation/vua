#!/usr/bin/env python3
"""Fast local policy tests for the trusted Patch Arena v3 evaluator."""
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("agent_patch_arena", ROOT / "scripts" / "agent-patch-arena.py")
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def expect(paths: list[str], expected: str) -> None:
    actual = module.classify_change(paths)
    assert actual == expected, f"{paths!r}: expected {expected}, got {actual}"


def main() -> int:
    expect([], "governance")
    expect(["bench/example.ts"], "performance")
    expect(["benchmark/example.ts"], "performance")
    expect(["src/vortex/oauth.ts"], "security")
    expect(["src/security/policy.ts"], "security")
    expect(["src/auth/token.ts"], "security")
    expect(["src/vortex/oauth.ts", "bench/example.ts"], "mixed")
    expect([".github/workflows/agent-patch-arena.yml"], "governance")
    expect(["scripts/agent-patch-arena.py"], "governance")
    expect(["scripts/test-agent-patch-arena-v3.py"], "governance")
    expect(["docs/patch-arena-governance-bootstrap.md"], "governance")
    expect(["package-lock.json"], "governance")
    expect(["scripts/__pycache__/agent-patch-arena.cpython-310.pyc"], "governance")
    expect([
        ".github/workflows/agent-patch-arena.yml",
        "scripts/agent-patch-arena.py",
        "scripts/test-agent-patch-arena-v3.py",
        "docs/09-mcp-termux-alpine-e-execution-proofs.md",
        "package-lock.json",
    ], "governance")
    expect([".github/workflows/agent-patch-arena.yml", "server.ts"], "mixed")
    expect(["scripts/agent-patch-arena.py", "src/vortex/oauth.ts"], "mixed")
    expect(["bench/example.ts", "server.ts"], "mixed")
    expect(["src/vortex/oauth.ts", "server.ts"], "mixed")
    expect(["scripts/agent-patch-arena.py", "src/unknown/new-executable.ts"], "mixed")
    expect(["performance/new-benchmark.ts", "src/unknown/new-executable.ts"], "mixed")

    with tempfile.TemporaryDirectory(prefix="vortex-arena-policy-") as tmp:
        evidence = Path(tmp) / "arena-result.json"
        result = {
            "schema": "vortex.patch-arena.v3",
            "trusted_base": True,
            "base_sha": "base",
            "head_sha": "head",
            "change_class": "governance",
            "verdict": "PASS_GOVERNANCE",
            "policy_sha256": module.policy_sha256(),
            "evaluator_sha256": module.evaluator_sha256(),
            "quality": {"passed": True},
        }
        evidence.write_text(json.dumps(result, sort_keys=True), encoding="utf-8")
        loaded = json.loads(evidence.read_text(encoding="utf-8"))
        assert loaded["schema"] == "vortex.patch-arena.v3"
        assert loaded["trusted_base"] is True
        assert loaded["quality"]["passed"] is True
        assert len(loaded["policy_sha256"]) == 64
        assert len(loaded["evaluator_sha256"]) == 64

    print("Patch Arena v3 local policy tests: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
