#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔧 Repairing PM2 process environment..."

if ! command -v pm2 >/dev/null 2>&1; then
  echo "❌ PM2 is not installed or not on PATH."
  exit 1
fi

resolve_bun_bin() {
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  if [[ -x "${HOME}/.bun/bin/bun" ]]; then
    printf '%s\n' "${HOME}/.bun/bin/bun"
    return 0
  fi

  return 1
}

install_latest_bun() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash >/dev/null
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO- https://bun.sh/install | bash >/dev/null
    return 0
  fi

  echo "❌ Bun is required, and curl/wget is unavailable for auto-install."
  echo "   Install Bun manually: https://bun.com/docs/installation"
  exit 1
}

BUN_BIN="$(resolve_bun_bin || true)"
if [[ -z "$BUN_BIN" || ! -x "$BUN_BIN" ]]; then
  echo "📦 Bun not found. Installing latest Bun..."
  install_latest_bun
  BUN_BIN="$(resolve_bun_bin || true)"
fi

if [[ -z "$BUN_BIN" || ! -x "$BUN_BIN" ]]; then
  echo "❌ Bun could not be resolved after install."
  exit 1
fi

if ! "$BUN_BIN" upgrade >/dev/null 2>&1; then
  echo "⚠️  Bun auto-upgrade failed. Reinstalling latest Bun..."
  install_latest_bun
  BUN_BIN="$(resolve_bun_bin || true)"
fi

if [[ -z "$BUN_BIN" || ! -x "$BUN_BIN" ]]; then
  echo "❌ Bun could not be resolved after auto-upgrade."
  exit 1
fi

PROCESS_NAME="tweets-2-bsky"
if pm2 describe "twitter-mirror" >/dev/null 2>&1; then
  PROCESS_NAME="twitter-mirror"
fi

echo "Found process: $PROCESS_NAME"
echo "Deleting process..."
pm2 delete "$PROCESS_NAME" || true

echo "Starting process with fresh environment using Bun binary launcher..."
pm2 start "$BUN_BIN" --name "$PROCESS_NAME" --cwd "$SCRIPT_DIR" --update-env -- dist/index.js

echo "Saving PM2 list..."
pm2 save

echo "✅ Repair complete."
