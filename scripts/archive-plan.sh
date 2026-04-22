#!/usr/bin/env bash
# archive-plan.sh — move a shipped plan file out of the repo.
#
# Plan files (*_PLAN.md, *_STATUS.md) accumulate at repo root during the
# autoplan / implement / ship cycle. Once a feature ships, the plan is
# historical — it's been superseded by the actual code and CLAUDE.md.
# Keeping it in-tree rots (5 revisions later it lies) and bloats the repo
# with 2000-line docs nobody reads.
#
# This script:
#   1. moves the file to ~/.gstack/projects/oregon-trail/archive/
#   2. prepends a 2-line header with ship date + branch
#   3. git rm + commits the removal with a conventional message
#
# Usage:
#   scripts/archive-plan.sh BITTER_PATH_C3_PLAN.md
#   scripts/archive-plan.sh DIFFICULTY_SYSTEM_PLAN.md DIFFICULTY_STATUS.md  # multiple
#
# Scope guard: only operates on *_PLAN.md or *_STATUS.md files at repo
# root. Will refuse anything else.

set -euo pipefail

if [ $# -eq 0 ]; then
  cat >&2 <<USAGE
Usage: $0 <PLAN_FILE>...

Archives shipped plan docs out of the repo to:
  ~/.gstack/projects/oregon-trail/archive/

Only *_PLAN.md or *_STATUS.md files at repo root are accepted.
USAGE
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ARCHIVE_DIR="$HOME/.gstack/projects/oregon-trail/archive"
mkdir -p "$ARCHIVE_DIR"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
TODAY=$(date +"%Y-%m-%d")
ARCHIVED=()

for f in "$@"; do
  # Scope guard.
  case "$f" in
    *_PLAN.md|*_STATUS.md) : ;;
    *)
      echo "✗ $f — refused (not a *_PLAN.md or *_STATUS.md file)" >&2
      exit 1
      ;;
  esac
  if [[ "$f" == */* ]]; then
    echo "✗ $f — refused (must be at repo root, no subpaths)" >&2
    exit 1
  fi
  if [ ! -f "$f" ]; then
    echo "✗ $f — not found" >&2
    exit 1
  fi

  # Prefix the archived copy with ship metadata so we can reconstruct
  # context from the filename alone later.
  DEST="$ARCHIVE_DIR/${TODAY}-${f}"
  {
    echo "<!-- Archived ${TODAY} from branch ${BRANCH} -->"
    echo "<!-- Original path: oregon-trail/${f} -->"
    echo ""
    cat "$f"
  } > "$DEST"

  git rm -- "$f" >/dev/null
  ARCHIVED+=("$f")
  echo "✓ $f → $DEST"
done

if [ "${#ARCHIVED[@]}" -eq 0 ]; then
  echo "Nothing archived." >&2
  exit 1
fi

# One commit per batch.
if [ "${#ARCHIVED[@]}" -eq 1 ]; then
  MSG="chore: archive ${ARCHIVED[0]} — feature shipped"
else
  MSG="chore: archive $(echo "${ARCHIVED[*]}" | tr ' ' ',') — features shipped"
fi

git commit -m "$MSG

Plan docs moved to ~/.gstack/projects/oregon-trail/archive/ after
feature ship. Reduces repo-root clutter and prevents stale plans from
diverging from the as-built code / CLAUDE.md. Rebuild context from the
archived file + commit log if needed.
"

echo ""
echo "Archived ${#ARCHIVED[@]} file(s). Commit pending push."
