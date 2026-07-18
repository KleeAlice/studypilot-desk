from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import create_app


TERMINAL = {"passed", "failed", "timeout", "stopped"}


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="studypilot-smoke-") as temporary:
        data_dir = Path(temporary)
        with TestClient(create_app(data_dir=data_dir)) as client:
            health = client.get("/api/health")
            roadmap = client.get("/api/roadmaps").json()["data"]
            task = client.post("/api/tasks", json={"title": "Smoke：保存证据", "week": 1}).json()["data"]
            client.post(
                f"/api/tasks/{task['id']}/evidence",
                json={"kind": "test", "title": "smoke", "content": "passed"},
            )
            document = client.post(
                "/api/documents/import",
                files={"file": ("smoke.md", "# RAG\nBM25 smoke evidence".encode(), "text/markdown")},
            ).json()["data"]
            search = client.get("/api/search", params={"q": "BM25"}).json()["data"]
            run_id = client.post(
                "/api/python/runs", json={"code": "print(sum([2, 3]))"}
            ).json()["data"]["id"]
            deadline = time.monotonic() + 5
            run = None
            while time.monotonic() < deadline:
                run = client.get(f"/api/python/runs/{run_id}").json()["data"]
                if run["status"] in TERMINAL:
                    break
                time.sleep(0.04)
            backup = client.post("/api/backups").json()["data"]

        with TestClient(create_app(data_dir=data_dir)) as restarted:
            persisted = restarted.get(f"/api/tasks/{task['id']}").json()["data"]

        assert health.status_code == 200
        assert len(roadmap["weeks"]) == 24 and len(roadmap["phases"]) == 6
        assert search and search[0]["document_id"] == document["id"]
        assert run and run["status"] == "passed" and run["stdout"].strip() == "5"
        assert persisted["evidence"][0]["content"] == "passed"
        assert Path(backup["path"]).is_file()
        print(
            json.dumps(
                {
                    "status": "ok",
                    "weeks": 24,
                    "phases": 6,
                    "task_persisted": True,
                    "document_search": True,
                    "python": run["status"],
                    "backup": True,
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()

