#!/usr/bin/env bash

set -euo pipefail

echo "🔧 Rebuilding native modules for Node $(node -v)..."

if npm rebuild better-sqlite3 >/dev/null 2>&1; then
  echo "✅ better-sqlite3 rebuilt successfully."
  exit 0
fi

echo "⚠️  Standard rebuild failed. Retrying with --build-from-source..."
if npm rebuild better-sqlite3 --build-from-source; then
  echo "✅ better-sqlite3 built from source."
  exit 0
fi

echo "❌ Failed to rebuild better-sqlite3 for this Node version."
echo "   macOS: run 'xcode-select --install'"
echo "   Debian/Ubuntu: sudo apt-get install -y build-essential python3 make g++"
echo "   Then run: npm run rebuild:native"
exit 1
