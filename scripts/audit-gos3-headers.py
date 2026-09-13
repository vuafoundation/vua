#!/usr/bin/env python3
"""Auditoria GOS3 v1: cabeçalhos, hashes e comparação entre baseline e snapshot.

Uso local com Git:
  python3 scripts/audit-gos3-headers.py --repo . --baseline-ref origin/main

Uso com duas pastas exportadas, inclusive em um ambiente Python remoto:
  python3 scripts/audit-gos3-headers.py --repo ./snapshot-2 --baseline-dir ./snapshot-1

Saídas:
  - relatório legível no stdout;
  - JSON opcional com --json-out caminho/relatorio.json;
  - código 0 somente quando o snapshot atual não possui falhas GOS3.

O script usa apenas a biblioteca padrão do Python. Ele não acessa rede, GitHub,
credenciais ou o dispositivo Android. Ele audita arquivos fornecidos localmente.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

HEADER_RE = re.compile(r"/\*\*[\s\S]*?@gos3-contract([\s\S]*?)\*/")
VERSION_RE = re.compile(r"@version\s+([^\r\n*]+)")
RESOURCE_RE = re.compile(r"@resource\s+([^\r\n*]+)")
CHECKSUM_RE = re.compile(r"@checksum\s+([^\r\n*]+)")
CAPABILITY_RE = re.compile(r"@capability\s+([^\r\n*]+)")
GOVERNED_DIRS = ("src/governed", "src/vortex", "scripts")
ALLOWED_SUFFIXES = {".ts", ".js", ".mjs", ".json", ".md"}
SKIP_NAMES = {"verify-gos3-headers.ts", "audit-gos3-headers.py"}


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def content_hash(content: str) -> str:
    stripped = re.sub(r"/\*\*[\s\S]*?@gos3-contract[\s\S]*?\*/\n?", "", content).strip()
    return sha256_text(stripped)


def inspect(path: Path, relative: str) -> dict[str, Any]:
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"file": relative, "status": "UNREADABLE"}
    match = HEADER_RE.search(content)
    if not match:
        return {"file": relative, "status": "MISSING_HEADER", "has_header": False}
    body = match.group(1)
    version_m = VERSION_RE.search(body)
    resource_m = RESOURCE_RE.search(body)
    checksum_m = CHECKSUM_RE.search(body)
    capability_m = CAPABILITY_RE.search(body)
    version = version_m.group(1).strip() if version_m else None
    resource = resource_m.group(1).strip() if resource_m else None
    declared = checksum_m.group(1).strip() if checksum_m else None
    capability = capability_m.group(1).strip() if capability_m else None
    if not version or not declared:
        return {
            "file": relative,
            "status": "MALFORMED",
            "has_header": True,
            "version": version,
            "resource": resource,
            "declared_checksum": declared,
            "capability": capability,
        }
    actual = content_hash(content)
    return {
        "file": relative,
        "status": "VALID" if declared == actual else "TAMPERED",
        "has_header": True,
        "version": version,
        "resource": resource,
        "declared_checksum": declared,
        "actual_checksum": actual,
        "valid_checksum": declared == actual,
        "capability": capability,
    }


def is_candidate(path: Path, relative: str) -> bool:
    if path.name in SKIP_NAMES or path.suffix not in ALLOWED_SUFFIXES:
        return False
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False
    return "@gos3-contract" in text or "/governed/" in f"/{relative}" or "vortex-governed" in relative


def collect(root: Path) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for directory in GOVERNED_DIRS:
        base = root / directory
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file():
                relative = path.relative_to(root).as_posix()
                if is_candidate(path, relative):
                    results[relative] = inspect(path, relative)
    return dict(sorted(results.items()))


def git_baseline(repo: Path, ref: str, destination: Path) -> Path:
    archive = destination / "baseline.tar"
    with archive.open("wb") as handle:
        subprocess.run(
            ["git", "-C", str(repo), "archive", ref, *GOVERNED_DIRS],
            check=True,
            stdout=handle,
        )
    extracted = destination / "baseline"
    extracted.mkdir()
    subprocess.run(["tar", "-xf", str(archive), "-C", str(extracted)], check=True)
    return extracted


def compare(audit1: dict[str, dict[str, Any]], audit2: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    changes = []
    for name in sorted(set(audit1) | set(audit2)):
        before = audit1.get(name)
        after = audit2.get(name)
        if before == after:
            change = "UNCHANGED"
        elif before is None:
            change = "ADDED"
        elif after is None:
            change = "REMOVED"
        else:
            change = "CHANGED"
        changes.append({"file": name, "change": change, "audit1": before, "audit2": after})
    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit GOS3 headers and compare two repository snapshots.")
    parser.add_argument("--repo", required=True, type=Path, help="Current snapshot/repository directory")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--baseline-ref", help="Git ref for Audit 1, e.g. origin/main")
    source.add_argument("--baseline-dir", type=Path, help="Exported directory for Audit 1")
    parser.add_argument("--json-out", type=Path, help="Write the complete report as JSON")
    args = parser.parse_args()
    repo = args.repo.resolve()
    if not repo.is_dir():
        parser.error(f"--repo is not a directory: {repo}")

    with tempfile.TemporaryDirectory(prefix="gos3-audit-") as temporary:
        temp = Path(temporary)
        if args.baseline_ref:
            baseline_root = git_baseline(repo, args.baseline_ref, temp)
            baseline_label = f"git:{args.baseline_ref}"
        elif args.baseline_dir:
            baseline_root = args.baseline_dir.resolve()
            baseline_label = str(baseline_root)
            if not baseline_root.is_dir():
                parser.error(f"--baseline-dir is not a directory: {baseline_root}")
        else:
            baseline_root = None
            baseline_label = None

        audit2 = collect(repo)
        audit1 = collect(baseline_root) if baseline_root else {}
        failures = [item for item in audit2.values() if item["status"] != "VALID"]
        changes = compare(audit1, audit2) if baseline_root else []
        report = {
            "schema": "vua.gos3-audit.v1",
            "audit_1": baseline_label,
            "audit_2": str(repo),
            "audit_1_files": audit1,
            "audit_2_files": audit2,
            "comparison": changes,
            "summary": {
                "audit_1_total": len(audit1),
                "audit_2_total": len(audit2),
                "audit_2_valid": len(audit2) - len(failures),
                "audit_2_failed": len(failures),
                "audit_2_passed": not failures and bool(audit2),
                "changed_files": sum(c["change"] != "UNCHANGED" for c in changes),
            },
        }
        print("GOS3 HEADER AUDIT v1")
        print("=" * 22)
        if baseline_label:
            print(f"Auditoria 1: {baseline_label}")
        print(f"Auditoria 2: {repo}")
        print(f"Arquivos auditados: {len(audit2)}")
        for item in audit2.values():
            marker = "PASS" if item["status"] == "VALID" else "FAIL"
            print(f"[{marker}] {item['file']}: {item['status']}")
        if baseline_label:
            print("\nComparação:")
            for change in changes:
                if change["change"] != "UNCHANGED":
                    print(f"[{change['change']}] {change['file']}")
            if not any(c["change"] != "UNCHANGED" for c in changes):
                print("[UNCHANGED] Todos os contratos GOS3 monitorados")
        print("\nResultado: " + ("PASS" if report["summary"]["audit_2_passed"] else "FAIL"))
        if args.json_out:
            args.json_out.parent.mkdir(parents=True, exist_ok=True)
            args.json_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Relatório JSON: {args.json_out.resolve()}")
        return 0 if report["summary"]["audit_2_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
