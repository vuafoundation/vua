#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "=== VUA PR 1 — SQLITE LOCAL GATE ==="
echo "ROOT=$ROOT"

fail() {
  echo
  echo "STATUS=FAIL"
  echo "ETAPA=$1"
  exit 1
}

run() {
  echo
  echo ">>> $*"
  "$@" || fail "$*"
}

echo
echo "=== 0. ESTADO INICIAL ==="
run git status --short --branch
run git diff --check

echo
echo "=== 1. AMBIENTE ==="
run node --version
run npm --version

echo
echo "=== 2. ESTRUTURA ==="
find src tests scripts -maxdepth 3 -type f | sort

echo
echo "=== 3. AUDITORIA SQLITE / RUNTIME ==="
find src tests scripts -type f -exec grep -niE 'sqlite|Database|EXECUTION_LOG|approval|execution_id|evidence|anti.?replay' {} + || true

echo
echo "=== 4. LINT ==="
npm run lint || fail "lint"
echo "LINT=PASS"

echo
echo "=== 5. BUILD ==="
npm run build || fail "build"
echo "BUILD=PASS"

echo
echo "=== 6. SUÍTE COMPLETA ==="
npm test || fail "test"
echo "TEST=PASS"

echo
echo "=== 7. DIFF CHECK ==="
git diff --check || fail "git diff --check"
echo "DIFF_CHECK=PASS"

echo
echo "=== 8. AUDITORIA DE ARTEFATOS ==="

if git status --short | grep -E '(^|/)(node_modules|dist|coverage)/|(^|/)\.env($|[.])|\.pem$|\.key$'; then
  fail "artefato ou segredo detectado"
fi

echo "ARTEFATOS_PROIBIDOS=PASS"

echo
echo "=== 9. AUDITORIA BÁSICA DO DIFF ==="

python3 - <<'PY_AUDIT'
import subprocess
import re
import sys

diff = subprocess.run(
    ["git", "diff", "--cached", "--unified=0"],
    text=True,
    capture_output=True,
    check=False,
).stdout

patterns = [
    r'^\+.*\b(TODO|FIXME)\b',
    r'^\+.*\b(password|secret|token)\b\s*[:=]\s*["\x27]',
]

for line in diff.splitlines():
    if any(re.search(pattern, line, re.IGNORECASE) for pattern in patterns):
        print("POSSIVEL_BRECHA:", line)
        sys.exit(1)

print("DIFF_SECURITY_BASIC=PASS")
PY_AUDIT

if [ "$?" -ne 0 ]; then
  fail "auditoria básica do diff"
fi

echo
echo "=== 10. RESUMO ==="
git status --short --branch
git diff --stat
git diff --cached --stat

echo
echo "=== 11. GATE ==="
echo "IMPLEMENTAÇÃO=VALIDADA_PELOS_TESTES"
echo "LINT=PASS"
echo "BUILD=PASS"
echo "TEST=PASS"
echo "DIFF_CHECK=PASS"
echo "SECURITY_BASIC_AUDIT=PASS"

echo
echo "STATUS=PASS"
echo
echo "Nenhum commit foi criado."
echo "Nenhum push foi executado."
echo "Nenhum PR foi aberto."
