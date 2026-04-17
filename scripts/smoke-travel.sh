#!/usr/bin/env bash
# Smoke test for the travel scene. Assumes a dev server on $PORT (default 8765).
set -euo pipefail
PORT="${PORT:-8765}"
URL="http://localhost:${PORT}/"

B="$HOME/.claude/skills/gstack/browse/dist/browse"
if [ ! -x "$B" ]; then
  echo "FAIL: browse binary not found at $B"
  exit 1
fi

"$B" goto "$URL" >/dev/null
sleep 3

# Pause advance so transition to TRAVEL doesn't POST to worker with null state.
"$B" js "window.engine?.pauseAdvance?.(); window.engine?.transition?.('TRAVEL'); true" >/dev/null 2>&1 || true
sleep 2

ERRORS=$("$B" js "(window.__ERRORS || []).length" 2>/dev/null | tail -1 | tr -d '\r')
OBJCOUNT=$("$B" js "window.k?.get('*')?.length ?? 0" 2>/dev/null | tail -1 | tr -d '\r')

if [ "${ERRORS:-0}" != "0" ]; then
  echo "FAIL: ${ERRORS} JS errors"
  "$B" js "JSON.stringify(window.__ERRORS)"
  exit 1
fi

if [ "${OBJCOUNT:-0}" -lt 40 ]; then
  echo "FAIL: scene has only ${OBJCOUNT} GameObjs (expected >=40)"
  exit 1
fi

mkdir -p mockups
"$B" screenshot "mockups/smoke-travel.png" >/dev/null
echo "PASS: ${OBJCOUNT} objects, 0 errors, screenshot saved to mockups/smoke-travel.png."
