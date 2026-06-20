#!/usr/bin/env sh

set -eu

source_path="$(opensrc path --cwd . effect)"

if [ -f "$source_path/src/Effect.ts" ]; then
  exit 0
fi

echo "opensrc effect cache is stale; refreshing effect source" >&2
opensrc remove effect >/dev/null 2>&1 || true
opensrc fetch --cwd . effect >/dev/null

source_path="$(opensrc path --cwd . effect)"
test -f "$source_path/src/Effect.ts"
