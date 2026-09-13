#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="${VORTEX_CORE_DIR:-${ROOT}/../vortex-core}"
OAUTH_DIR="${VUA_OAUTH_DIR:-${ROOT}/../vua-oauth}"
FAILURES=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
run_check() {
  local label="$1"; shift
  if "$@" >"${ROOT}/.audit-last.log" 2>&1; then pass "$label"; else fail "$label (see ${ROOT}/.audit-last.log)"; cat "${ROOT}/.audit-last.log"; fi
}
check_dir() {
  local label="$1" dir="$2"
  if [[ -d "$dir" ]]; then pass "$label directory exists: $dir"; else fail "$label directory missing: $dir"; fi
}

printf '%s\n' 'VORTEX FULL AUDIT' '================='
check_dir 'VUA implementation' "$ROOT"
check_dir 'Vortex core' "$CORE_DIR"
check_dir 'VUA OAuth package' "$OAUTH_DIR"

if [[ -d "$ROOT" ]]; then
  run_check 'VUA TypeScript lint' bash -c "cd '$ROOT' && npm run lint"
  run_check 'VUA build' bash -c "cd '$ROOT' && npm run build"
  run_check 'VUA conformance and quality suite' bash -c "cd '$ROOT' && npm test"
  run_check 'VUA dependency audit' bash -c "cd '$ROOT' && npm audit --omit=dev --audit-level=moderate"
  if grep -RInE 'sandbox_demo|vortex-foundation-demo|demoRepos|rps: 920|coveragePercent: 100|856920785b8392b036211cc851e1f6467961ff52' "$ROOT/server.ts" "$ROOT/src" "$ROOT/package.json" >/dev/null 2>&1; then
    fail 'VUA contains known fabricated demo/default evidence markers'
  else
    pass 'VUA contains no known fabricated demo/default evidence markers'
  fi
  if grep -RIn "Access-Control-Allow-Origin.*['\"]\*['\"]" "$ROOT/server.ts" >/dev/null 2>&1; then fail 'VUA wildcard CORS'; else pass 'VUA wildcard CORS absent'; fi
fi

if [[ -d "$CORE_DIR" ]]; then
  run_check 'Vortex core build' bash -c "cd '$CORE_DIR' && npm run build"
  run_check 'Vortex gateway tests' bash -c "cd '$CORE_DIR' && npm run test:gateway"
  if grep -q "if (!expected) return process.env.NODE_ENV !== 'production'" "$CORE_DIR/src/gateway/server.ts" 2>/dev/null; then fail 'Core authentication development bypass remains'; else pass 'Core authentication development bypass absent'; fi
fi

if [[ -d "$OAUTH_DIR" ]]; then
  run_check 'OAuth build and conformance tests' bash -c "cd '$OAUTH_DIR' && npm run test"
  run_check 'OAuth dependency audit' bash -c "cd '$OAUTH_DIR' && npm audit --omit=dev --audit-level=moderate"
  if grep -RInE 'localhost.*https|OAUTH_(OWNER_PASSCODE|SESSION_SECRET)=.{0,8}(secret|password|change-me)' "$OAUTH_DIR/src" >/dev/null 2>&1; then
    fail 'OAuth contains suspicious security markers; review grep output'
  else
    pass 'OAuth suspicious-marker scan clean'
  fi
fi

rm -f "${ROOT}/.audit-last.log"
printf '\nFailures: %d\n' "$FAILURES"
if (( FAILURES > 0 )); then exit 1; fi
printf '%s\n' 'FULL AUDIT: PASS'
