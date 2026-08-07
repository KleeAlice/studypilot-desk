from __future__ import annotations

import os
import tempfile

import uvicorn


os.environ["STUDYPILOT_DATA_DIR"] = tempfile.mkdtemp(
    prefix="studypilot-glass-consistency-"
)
uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8876, log_level="warning")
