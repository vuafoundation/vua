#!/usr/bin/env python3
"""Unit tests for trusted Patch Arena change classification."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("agent_patch_arena", ROOT / "scripts" / "agent-patch-arena.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

assert MODULE.classify_change(["src/vortex/oauth.ts", "scripts/test-oauth.ts", "package.json"]) == "security"
assert MODULE.classify_change(["bench/foo.ts", "README.md"]) == "performance"
assert MODULE.classify_change(["src/vortex/oauth.ts", "bench/foo.ts"]) == "mixed"
assert MODULE.classify_change([".github/workflows/agent-patch-arena.yml", "scripts/agent-patch-arena.py", "scripts/test-agent-patch-arena-policy.py"]) == "governance"
assert MODULE.classify_change([".github/workflows/agent-patch-arena.yml", "src/vortex/oauth.ts"]) == "mixed"
assert MODULE.classify_change(["src/vortex/server.ts", "tests/server.test.ts"]) == "correctness"

print("Patch Arena policy tests: PASS")
