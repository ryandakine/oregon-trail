#!/usr/bin/env bash
# deploy-pages.sh — gated frontend deploy.
#
# Pipeline:
#   1. Worker unit tests must pass (npx vitest run).
#   2. Push to a CF Pages preview (not production).
#   3. Smoke-probe the preview with deploy-smoke.mjs (renders river with a
#      numeric ford_difficulty + hunting + bitter_path CW modal). If ANY
#      scene throws, abort. This is the gate the 2026-04-18 bugs needed.
#   4. Only if smoke is clean: promote to trail.osi-cyber.com via
#      --branch=master.
#
# Why this script exists: on 2026-04-18 two P0 scene-render bugs shipped
# because `npx wrangler pages deploy` had no pre-check. Any real-world
# river crossing or hunting trip blue-screened. This wraps the deploy
# command so the gate is mechanical, not mental.
#
# Usage:
#   scripts/deploy-pages.sh                  # full flow
#   scripts/deploy-pages.sh --skip-tests     # smoke only (not recommended)
#   scripts/deploy-pages.sh --smoke-only     # don't deploy; just probe prod

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_TESTS=0
SMOKE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --smoke-only) SMOKE_ONLY=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ "$SMOKE_ONLY" = 1 ]; then
  echo "=== SMOKE-ONLY against prod ==="
  exec node scripts/deploy-smoke.mjs --url=https://trail.osi-cyber.com
fi

# ── 1. Worker unit tests ─────────────────────────────────
if [ "$SKIP_TESTS" = 0 ]; then
  echo "=== Running worker unit tests ==="
  if ! npx vitest run; then
    echo "" >&2
    echo "Unit tests failed. DO NOT DEPLOY." >&2
    exit 1
  fi
else
  echo "=== Skipping unit tests (--skip-tests) ==="
fi

# ── 2. Preview deploy ────────────────────────────────────
echo ""
echo "=== Deploying to PREVIEW branch ==="
# --branch=preview (any non-master name) lands on a unique preview URL.
PREVIEW_OUT=$(npx wrangler pages deploy public \
  --project-name=oregon-trail \
  --branch=preview \
  --commit-dirty=true 2>&1)
echo "$PREVIEW_OUT"

# Extract the preview URL from wrangler output.
PREVIEW_URL=$(echo "$PREVIEW_OUT" | grep -oE 'https://[a-z0-9]+\.oregon-trail\.pages\.dev' | head -1)
if [ -z "$PREVIEW_URL" ]; then
  echo "" >&2
  echo "Could not extract preview URL from wrangler output. Aborting." >&2
  exit 1
fi
echo ""
echo "Preview URL: $PREVIEW_URL"

# Short wait for CF edge propagation.
sleep 5

# ── 3. Smoke the preview ─────────────────────────────────
echo ""
echo "=== Smoking preview ==="
if ! node scripts/deploy-smoke.mjs --url="$PREVIEW_URL"; then
  echo "" >&2
  echo "Preview smoke FAILED. Prod NOT deployed." >&2
  echo "Preview URL (for debugging): $PREVIEW_URL" >&2
  exit 1
fi

# ── 4. Promote to prod ───────────────────────────────────
echo ""
echo "=== Promoting to production (trail.osi-cyber.com) ==="
npx wrangler pages deploy public \
  --project-name=oregon-trail \
  --branch=master \
  --commit-dirty=true

echo ""
echo "=== DEPLOYED — https://trail.osi-cyber.com ==="
