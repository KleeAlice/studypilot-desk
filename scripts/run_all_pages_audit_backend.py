from __future__ import annotations

import os
import tempfile

import uvicorn


os.environ["STUDYPILOT_DATA_DIR"] = tempfile.mkdtemp(
    prefix="studypilot-all-pages-audit-"
)
os.environ["STUDYPILOT_DEV"] = "1"
uvicorn.run(
    "backend.app.main:app", host="127.0.0.1", port=8877, log_level="warning"
)
