from __future__ import annotations

import os
from pathlib import Path

import uvicorn


data_dir = (Path(__file__).resolve().parents[1] / "artifacts" / "agent-e2e-data").resolve()
data_dir.mkdir(parents=True, exist_ok=True)
os.environ["STUDYPILOT_DATA_DIR"] = str(data_dir)
uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8765, log_level="warning")
