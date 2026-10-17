#!/bin/sh
# Check a running Wellyboot BI stack: isolation headers, health checks and the self-hosted DuckDB extensions.
# Usage: scripts/smoke-test.sh [--no-extensions] [web-url] [server-url]
set -eu

extensions=1
if [ "${1:-}" = "--no-extensions" ]; then extensions=0; shift; fi
web=${1:-http://localhost:${WELLYBOOT_WEB_PORT:-8090}}
server=${2:-http://localhost:${WELLYBOOT_SERVER_PORT:-8787}}
failed=0

check() {
  if eval "$2" >/dev/null 2>&1; then echo "ok   $1"; else echo "FAIL $1"; failed=1; fi
}

# Wait for both services to answer, up to 30 seconds.
for _ in $(seq 1 30); do
  curl -sf "$web/healthz" >/dev/null 2>&1 && curl -sf "$server/healthz" >/dev/null 2>&1 && break
  sleep 1
done

headers=$(curl -sI "$web/")
check "web answers /healthz" "curl -sf '$web/healthz'"
check "server answers /healthz" "curl -sf '$server/healthz' | grep -q '\"status\":\"ok\"'"
check "Cross-Origin-Opener-Policy: same-origin" "printf '%s' \"\$headers\" | grep -qi '^cross-origin-opener-policy: same-origin'"
check "Cross-Origin-Embedder-Policy: require-corp" "printf '%s' \"\$headers\" | grep -qi '^cross-origin-embedder-policy: require-corp'"
check "the app's page is served" "curl -sf '$web/' | grep -q '<title>Wellyboot BI</title>'"

if [ "$extensions" = 1 ]; then
  manifest=$(curl -sf "$web/duckdb-extensions/manifest.json" || true)
  version=$(printf '%s' "$manifest" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')
  check "the extension manifest is served" "[ -n '$version' ]"
  for ext in json parquet; do
    url="$web/duckdb-extensions/$version/wasm_eh/$ext.duckdb_extension.wasm"
    check "the $ext extension is served as application/wasm" "curl -sfI '$url' | grep -qi '^content-type: application/wasm'"
  done
fi

exit $failed
