#!/usr/bin/env sh
set -u

cleaned_up=0

cleanup() {
  if [ "$cleaned_up" -eq 1 ]; then
    return
  fi

  cleaned_up=1
  pnpm exec tsx scripts/dev.ts --cleanup-only "$@" >/dev/null 2>&1 || true
}

finish() {
  status="$1"
  shift
  cleanup "$@"
  trap - EXIT INT TERM
  exit "$status"
}

trap 'finish 130 "$@"' INT
trap 'finish 143 "$@"' TERM
trap 'finish "$?" "$@"' EXIT

pnpm exec tsx scripts/dev.ts "$@"
status="$?"
finish "$status" "$@"
