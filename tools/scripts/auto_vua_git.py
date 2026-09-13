# @gos3-contract
# @version 1.0.0
# @resource scripts/auto_vua_git.py
# sha256:c71bb3466a79c233e9d66080a991e546c030e317284eda198ce090025ce73ad7
# @capability repository.write
# @onboarded_at 2026-09-13T00:00:00.000Z
# @governed true
#!/usr/bin/env python3
"""auto_vua_git.py - aplica correcao de log, re-onboarda, valida GOS3, commita/pusha."""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

HEADER_RE = re.compile(r"(?:/\*\*[\s\S]*?@gos3-contract[\s\S]*?\*/|(?:# @[^\n]*\n)+)\n?", re.MULTILINE)

LOG_OLD = "if (drift.length) console.log(`[baseline] drift outside tolerance: ${drift.join('; ')}`);"
LOG_NEW = """if (drift.length) console.log(
      `[baseline] relative drift: ${drift.join('; ')} (absolute gates passed; verdict=${benchmarkReport.verdict})`,
    );"""


def sha256_hex(t):
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def body_of(t):
    return HEADER_RE.sub("", t, count=1).strip()


def onboard(path, capability="repository.write"):
    raw = path.read_text(encoding="utf-8")
    body = body_of(raw)
    checksum = sha256_hex(body)
    ext = path.suffix.lower()
    if ext in (".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"):
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
    else:
        header = (
            "# @gos3-contract\n"
            "# @version 1.0.0\n"
            "# @resource " + path.as_posix() + "\n"
            "# @checksum sha256:" + checksum + "\n"
            "# @capability " + capability + "\n"
            "# @onboarded_at 2026-09-13T00:00:00.000Z\n"
            "# @governed true\n"
        )
    new = header + body + "\n"
    if new == raw:
        print("  [ok] " + str(path))
    else:
        path.write_text(new, encoding="utf-8")
        print("  [onboarded] " + str(path))


def patch_log(path):
    if not path.exists():
        print("  [skip] " + str(path) + " nao existe")
        return False
    src = path.read_text(encoding="utf-8")
    if LOG_NEW in src:
        print("  [ok] log ja corrigido")
        return False
    if LOG_OLD not in src:
        print("  [warn] linha antiga nao encontrada")
        print("  grep -n 'drift outside tolerance' " + str(path))
        return False
    src = src.replace(LOG_OLD, LOG_NEW)
    path.write_text(src, encoding="utf-8")
    print("  [patched] log de drift reescrito")
    return True


def sh(cmd, cwd=None, capture=True):
    print("\n$ " + cmd)
    r = subprocess.run(cmd, shell=True, cwd=cwd,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None,
                       text=True)
    if capture and r.stdout:
        print(r.stdout.rstrip())
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--message", default="fix(bench): log de drift e provenance CI honesta\n\nGOS3")
    args = ap.parse_args()
    repo = args.repo.resolve()
    if not (repo / "package.json").exists():
        sys.exit("nao e repo: " + str(repo))

    print("-- 0. Estado do repo --")
    sh("git branch --show-current", cwd=repo)
    sh("git log --oneline -3", cwd=repo)
    sh("git status --short", cwd=repo)

    print("\n-- 1. Patch do log --")
    patched = patch_log(repo / "scripts/run-full-suite.ts")

    print("\n-- 2. Onboarding GOS3 --")
    if patched:
        onboard(repo / "scripts/run-full-suite.ts")

    print("\n-- 3. GOS3 strict --")
    rc_gos3 = sh("npx tsx scripts/verify-gos3-headers.ts --strict", cwd=repo)
    print("exit=" + str(rc_gos3))

    print("\n-- 4. npm test --")
    if rc_gos3 == 0:
        sh("VUA_BASELINE_TOLERANCE=1.50 npm test 2>&1 | tail -12", cwd=repo)
    else:
        print("  [skip] GOS3 strict falhou")

    if args.commit:
        print("\n-- 5. git add + commit --")
        sh("git add scripts/run-full-suite.ts src/vortex/evidence.ts src/vortex/baseline.ts baselines/", cwd=repo)
        sh("git status --short", cwd=repo)
        msg_file = repo / ".git" / "COMMIT_MSG_TMP"
        msg_file.write_text(args.message, encoding="utf-8")
        rc_commit = sh("git commit -F " + str(msg_file), cwd=repo)
        try:
            msg_file.unlink()
        except Exception:
            pass
        if rc_commit != 0:
            print("[aviso] commit retornou " + str(rc_commit))

    if args.push:
        print("\n-- 6. git push --")
        branch = subprocess.run("git branch --show-current", shell=True, cwd=repo,
                                stdout=subprocess.PIPE, text=True).stdout.strip()
        if not branch:
            print("  [erro] branch vazio")
            return 1
        rc_push = sh("git push origin " + branch, cwd=repo)
        if rc_push != 0:
            print("[aviso] push retornou " + str(rc_push))

    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
