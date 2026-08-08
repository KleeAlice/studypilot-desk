from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER_DIRECTORY = ROOT / "build" / "backend-runtime" / "StudyPilotPythonWorker"
WORKER = WORKER_DIRECTORY / (
    "StudyPilotPythonWorker.exe" if sys.platform == "win32" else "StudyPilotPythonWorker"
)


def main() -> None:
    if not WORKER.is_file():
        raise SystemExit(f"Packaged Python Worker was not found: {WORKER}")

    request = {
        "id": 1,
        "kind": "call",
        "function": "health",
        "args": {"path": {}, "query": {}, "body": None},
    }
    with tempfile.TemporaryDirectory(prefix="studypilot-worker-check-") as data_directory:
        environment = os.environ.copy()
        environment["STUDYPILOT_DATA_DIR"] = data_directory
        result = subprocess.run(
            [str(WORKER)],
            input=json.dumps(request, separators=(",", ":")) + "\n",
            capture_output=True,
            check=False,
            encoding="utf-8",
            env=environment,
            timeout=30,
        )

    if result.returncode != 0:
        raise SystemExit(f"Packaged Worker exited with {result.returncode}: {result.stderr}")
    messages = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    if len(messages) < 2 or messages[0] != {"kind": "ready"}:
        raise SystemExit(f"Packaged Worker did not announce readiness: {messages!r}")

    response = messages[1]
    body = json.loads(base64.b64decode(response["body_base64"]).decode("utf-8"))
    if response.get("id") != 1 or response.get("status") != 200:
        raise SystemExit(f"Packaged Worker returned an invalid response: {response!r}")
    if body.get("data", {}).get("status") != "ok":
        raise SystemExit(f"Packaged Worker health check failed: {body!r}")

    print(f"Packaged Python Worker health check passed ({body['data']['version']}).")


if __name__ == "__main__":
    main()
