#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import fastapi, uvicorn, docx, pypdf' >/dev/null 2>&1; then
  .venv/bin/python -m pip install wheel
  .venv/bin/python -m pip install --no-build-isolation -e '.[dev]'
fi
if [ ! -d node_modules/@tauri-apps/cli ]; then
  npm install
fi
npm run start:tauri

