#!/bin/sh
# Apply the pending change intents in .changeset/, then commit and tag the release.
# Record an intent for each change first with: pnpm change
# Usage: pnpm release
set -eu

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean; commit or stash your changes first." >&2
  exit 1
fi

pnpm version --recursive

if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to release: there are no pending change intents. Add one with: pnpm change" >&2
  exit 1
fi

# The packages are a fixed group, so any one of them carries the release version.
version=$(node -p "require('./packages/shared/package.json').version")

git add --all
git commit --message "v$version"
git tag --annotate "v$version" --message "v$version"

echo "Tagged v$version. Publish it with: git push --follow-tags"
