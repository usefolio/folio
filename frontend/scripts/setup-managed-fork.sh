#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="${1:-}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"

if [[ -z "$UPSTREAM_URL" ]]; then
  cat <<'EOF'
Usage:
  bash scripts/setup-managed-fork.sh <upstream_git_url>

Example:
  bash scripts/setup-managed-fork.sh git@github.com:your-org/folio-oss.git
EOF
  exit 1
fi

if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
else
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

git fetch "$UPSTREAM_REMOTE" --prune

echo "Configured '$UPSTREAM_REMOTE' -> $UPSTREAM_URL"
git remote -v
