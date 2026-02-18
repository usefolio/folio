#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
MERGE_MODE="${MERGE_MODE:-merge}"

git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --prune

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$TARGET_BRANCH" ]]; then
  git checkout "$TARGET_BRANCH"
fi

if [[ "$MERGE_MODE" == "ff-only" ]]; then
  git merge --ff-only "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
else
  git merge --no-edit "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
fi

echo "Synced '$TARGET_BRANCH' with '$UPSTREAM_REMOTE/$UPSTREAM_BRANCH' using mode '$MERGE_MODE'."
