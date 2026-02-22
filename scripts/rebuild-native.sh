#!/usr/bin/env bash

set -euo pipefail

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

  return 1
}

declare -a BUN_RUNNER=()

resolve_bun_runner() {
  local bun_bin
  bun_bin="$(resolve_bun_bin || true)"

  if [[ -z "$bun_bin" || ! -x "$bun_bin" ]]; then
    echo "📦 Bun not found. Installing latest Bun..."
    if install_latest_bun; then
      bun_bin="$(resolve_bun_bin || true)"
    fi
  fi

  if [[ -n "$bun_bin" && -x "$bun_bin" ]]; then
    if ! "$bun_bin" upgrade >/dev/null 2>&1; then
      echo "⚠️  Bun auto-upgrade failed. Reinstalling latest Bun..."
      if install_latest_bun; then
        bun_bin="$(resolve_bun_bin || true)"
      fi
    fi
  fi

  if [[ -n "$bun_bin" && -x "$bun_bin" ]]; then
    BUN_RUNNER=("$bun_bin")
    return 0
  fi

  if command -v npx >/dev/null 2>&1; then
    echo "⚠️  Could not install global Bun automatically. Falling back to npx bun."
    BUN_RUNNER=("npx" "bun")
    return 0
  fi

  echo "❌ Bun is required to rebuild native modules."
  echo "   Install Bun: https://bun.com/docs/installation"
  exit 1
}

resolve_bun_runner

echo "🔧 Rebuilding native modules for Bun..."
echo "   Runner: ${BUN_RUNNER[*]}"

if "${BUN_RUNNER[@]}" install --force; then
  echo "✅ Native modules rebuilt via fresh Bun install."
  exit 0
fi

echo "❌ Failed to rebuild native modules with Bun."
echo "   macOS: run 'xcode-select --install'"
echo "   Debian/Ubuntu: sudo apt-get install -y build-essential python3 make g++"
echo "   Then run: bun run rebuild:native"
exit 1
