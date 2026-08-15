#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/album-studio"
node scripts/check-env.mjs
npm run package:mac
