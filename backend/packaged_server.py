from __future__ import annotations

import multiprocessing
import os

import uvicorn

from backend.app.main import app


def main() -> None:
    port = int(os.environ["STUDYPILOT_BACKEND_PORT"])
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
