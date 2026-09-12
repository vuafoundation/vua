#!/usr/bin/env python3
"""Vortex Agent Patch Arena evaluator.

Every proposed patch is untrusted and is compared with the exact base revision
under the same workload. The evaluator first applies absolute quality gates,
then a policy appropriate to the type of change.

Classification is derived from the trusted base evaluator, never from files
modified by the candidate to weaken the gate. Classification is fail-closed:
a governance change is governance only when every changed file is an explicitly
allowlisted governance file. Any cross-class change is ``mixed`` and rejected.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import tempfile
import time
from pathlib import Path

ITERATIONS = 1000
REPEATS = 5
MIN_THROUGHPUT_GAIN = 0.05
MAX_THROUGHPUT_REGRESSION = 0.02
MAX_LATENCY_REGRESSION = 0.02
MAX_MEMORY_REGRESSION = 0.05
MAX_CV = 0.10

GOVERNANCE_PATHS = (
    ".github/workflows/agent-patch-arena.yml",
    "scripts/agent-patch-arena.py",
    "scripts/test-agent-patch-arena-policy.py",
)
SECURITY_PATHS = (
    "src/vortex/oauth.ts",
    "src/security/",
    "src/auth/",
)
PERFORMANCE_PATHS = (
    "bench/",
    "benchmark/",
    "performance/",
)


def run(cmd: list[str], cwd: Path, timeout: int = 900) -> tuple[int, str, float]:
    started = time.perf_counter()
    env = os.environ.copy()
    for key in ("GITHUB_TOKEN", "GH_TOKEN", "NODE_AUTH_TOKEN"):
        env.pop(key, None)
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
        check=False,
    )
    return proc.returncode, proc.stdout, time.perf_counter() - started


def median(values: list[float]) -> float:
    return statistics.median(values)


def coefficient_of_variation(values: list[float]) -> float:
    m = statistics.mean(values)
    return 0.0 if m == 0 else statistics.pstdev(values) / m


def metric(pattern: str, output: str, cast=float) -> float:
    match = re.search(pattern, output, re.MULTILINE)
    if not match:
        raise RuntimeError(f"Benchmark metric not found: {pattern}")
    return cast(match.group(1).replace(",", ""))


def benchmark_once(path: Path) -> dict[str, float]:
    code, output, elapsed = run(
        ["npx", "tsx", "bin/vua.js", "bench", "--iterations", str(ITERATIONS)],
        path,
        timeout=300,
    )
    if code != 0:
        raise RuntimeError(f"bench failed with exit {code}\n{output}")
    return {
        "throughput_ops_s": metric(r"Throughput\s*:\s*([0-9.,]+)\s*ops/seg", output),
        "latency_us": metric(r"Latência Média\s*:\s*([0-9.,]+)\s*µs", output),
        "rss_mb": metric(r"Consumo de Memória\s*:\s*([0-9.,]+)\s*MB", output),
        "elapsed_s": elapsed,
    }


def prepare(path: Path) -> list[str]:
    commands = [
        ["npm", "ci", "--ignore-scripts"],
        ["npm", "run", "lint"],
        ["npm", "run", "verify:gos3"],
        ["npm", "run", "build"],
        ["npm", "test"],
    ]
    failures: list[str] = []
    for command in commands:
        code, output, _ = run(command, path, timeout=1200)
        if code != 0:
            failures.append(f"{' '.join(command)}\n{output[-12000:]}")
    return failures


def benchmark(path: Path) -> tuple[dict[str, float], list[dict[str, float]]]:
    samples = [benchmark_once(path) for _ in range(REPEATS)]
    return {key: median([sample[key] for sample in samples]) for key in samples[0]}, samples


def changed_files(repo: Path, base_sha: str, head_sha: str) -> list[str]:
    code, output, _ = run(["git", "diff", "--name-only", base_sha, head_sha], repo, timeout=120)
    if code != 0:
        raise RuntimeError(f"unable to determine changed files\n{output}")
    return [line.strip() for line in output.splitlines() if line.strip()]


def _matches(path: str, patterns: tuple[str, ...]) -> bool:
    return any(path == pattern or path.startswith(pattern) for pattern in patterns)


def classify_change(paths: list[str]) -> str:
    """Classify from trusted paths and fail closed on cross-class changes.

    Governance is intentionally strict: a PR can receive the governance policy
    only when every changed file is an allowlisted governance file. This prevents
    an attacker from modifying the evaluator and piggybacking arbitrary product
    code into a lower-bar governance verdict.
    """
    if not paths:
        return "correctness"

    governance_files = [path for path in paths if _matches(path, GOVERNANCE_PATHS)]
    security_files = [path for path in paths if _matches(path, SECURITY_PATHS)]
    performance_files = [path for path in paths if _matches(path, PERFORMANCE_PATHS)]
    unknown_files = [
        path
        for path in paths
        if path not in governance_files and path not in security_files and path not in performance_files
    ]

    if governance_files:
        if len(governance_files) == len(paths):
            return "governance"
        return "mixed"

    if security_files and performance_files:
        return "mixed"
    if performance_files and unknown_files:
        return "mixed"
    if security_files and unknown_files:
        return "mixed"
    if performance_files:
        return "performance"
    if security_files:
        return "security"
    return "correctness"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    repo = Path.cwd()
    paths = changed_files(repo, args.base, args.head)
    change_class = classify_change(paths)

    with tempfile.TemporaryDirectory(prefix="vortex-arena-") as temp:
        work = Path(temp)
        base = work / "base"
        head = work / "head"
        for target, sha in ((base, args.base), (head, args.head)):
            subprocess.run(["git", "worktree", "add", "--detach", str(target), sha], check=True)

        try:
            base_failures = prepare(base)
            head_failures = prepare(head)
            result: dict = {
                "schema": "vortex.patch-arena.v3",
                "base_sha": args.base,
                "head_sha": args.head,
                "change_class": change_class,
                "changed_files": paths,
                "policy": {
                    "min_throughput_gain": MIN_THROUGHPUT_GAIN,
                    "max_throughput_regression": MAX_THROUGHPUT_REGRESSION,
                    "max_latency_regression": MAX_LATENCY_REGRESSION,
                    "max_memory_regression": MAX_MEMORY_REGRESSION,
                    "max_cv": MAX_CV,
                    "repeats": REPEATS,
                    "iterations": ITERATIONS,
                },
                "quality": {
                    "base_failures": base_failures,
                    "head_failures": head_failures,
                    "passed": not base_failures and not head_failures,
                },
            }

            if base_failures or head_failures:
                result["verdict"] = "REJECT"
                result["reason"] = "absolute quality gate failure"
            else:
                base_metrics, base_samples = benchmark(base)
                head_metrics, head_samples = benchmark(head)
                throughput_gain = head_metrics["throughput_ops_s"] / base_metrics["throughput_ops_s"] - 1
                latency_change = head_metrics["latency_us"] / base_metrics["latency_us"] - 1
                memory_change = head_metrics["rss_mb"] / base_metrics["rss_mb"] - 1
                base_cv = coefficient_of_variation([s["throughput_ops_s"] for s in base_samples])
                head_cv = coefficient_of_variation([s["throughput_ops_s"] for s in head_samples])
                stable = max(base_cv, head_cv) <= MAX_CV
                performance_ok = (
                    throughput_gain >= MIN_THROUGHPUT_GAIN
                    and latency_change <= MAX_LATENCY_REGRESSION
                    and memory_change <= MAX_MEMORY_REGRESSION
                    and stable
                )
                no_regression_ok = (
                    throughput_gain >= -MAX_THROUGHPUT_REGRESSION
                    and latency_change <= MAX_LATENCY_REGRESSION
                    and memory_change <= MAX_MEMORY_REGRESSION
                    and stable
                )

                if change_class == "performance":
                    verdict = "PASS_SUPERIOR" if performance_ok else "REJECT"
                    reason = "candidate meets performance improvement and stability policy" if performance_ok else "candidate does not demonstrate sufficient measured gain"
                elif change_class in {"security", "correctness"}:
                    verdict = "PASS_NO_REGRESSION" if no_regression_ok else "REJECT"
                    reason = "candidate meets quality and bounded no-regression policy" if no_regression_ok else "candidate exceeds bounded regression policy"
                elif change_class == "governance":
                    verdict = "PASS_GOVERNANCE" if no_regression_ok else "REJECT"
                    reason = "governance change passes quality and bounded no-regression policy; protected-branch review remains mandatory" if no_regression_ok else "governance change exceeds bounded regression policy"
                else:
                    verdict = "REJECT"
                    reason = "mixed governance/security/performance change requires explicit review"

                result["base"] = {"median": base_metrics, "samples": base_samples, "cv": base_cv}
                result["head"] = {"median": head_metrics, "samples": head_samples, "cv": head_cv}
                result["delta"] = {
                    "throughput_gain_pct": throughput_gain * 100,
                    "latency_change_pct": latency_change * 100,
                    "memory_change_pct": memory_change * 100,
                }
                result["gates"] = {
                    "performance_ok": performance_ok,
                    "no_regression_ok": no_regression_ok,
                    "stable": stable,
                }
                result["verdict"] = verdict
                result["reason"] = reason

            Path(args.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result, indent=2))
            return 0 if result["verdict"] in {"PASS_SUPERIOR", "PASS_NO_REGRESSION", "PASS_GOVERNANCE"} else 1
        finally:
            for target in (head, base):
                subprocess.run(["git", "worktree", "remove", "--force", str(target)], check=False)


if __name__ == "__main__":
    raise SystemExit(main())
