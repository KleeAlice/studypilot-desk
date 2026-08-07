from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import create_app


PAYLOAD_BYTES = 52 * 1024 * 1024 + 17


def main() -> None:
    payload = b"x" * PAYLOAD_BYTES
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="studypilot-large-import-check-") as directory:
        with TestClient(create_app(data_dir=Path(directory))) as client:
            response = client.post(
                "/api/documents/import",
                files={"file": ("over-50mb.txt", payload, "text/plain")},
            )
            assert response.status_code == 201, response.text
            document = response.json()["data"]
            content = client.get(f"/api/documents/{document['id']}/content")
            assert content.status_code == 200, content.text
            imported = content.json()["data"]
            assert imported["document"]["metadata"]["characters"] == PAYLOAD_BYTES
            assert imported["blocks"][0]["text"] == payload.decode()
    print(json.dumps({
        "payloadBytes": PAYLOAD_BYTES,
        "payloadMiB": round(PAYLOAD_BYTES / 1024 / 1024, 2),
        "status": 201,
        "elapsedSeconds": round(time.perf_counter() - started, 2),
    }, indent=2))


if __name__ == "__main__":
    main()
