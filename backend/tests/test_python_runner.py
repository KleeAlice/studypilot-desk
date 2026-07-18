import time
import sys
import os
import subprocess

import pytest

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.python_runner.environments import PythonEnvironment
from backend.app.python_runner.manager import PythonRunner


TERMINAL = {"passed", "failed", "timeout", "stopped"}


def wait_for_run(client: TestClient, run_id: str, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        run = client.get(f"/api/python/runs/{run_id}").json()["data"]
        if run["status"] in TERMINAL:
            return run
        time.sleep(0.03)
    raise AssertionError("Python run did not finish")


def start(client: TestClient, code: str, **extra) -> str:
    response = client.post("/api/python/runs", json={"code": code, **extra})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


class FixedRegistry:
    def __init__(self, environment: PythonEnvironment) -> None:
        self.environment = environment
        self.invalidated = False

    def list(self) -> list[PythonEnvironment]:
        return [self.environment]

    def resolve(self, environment_id: str | None) -> PythonEnvironment:
        assert environment_id in (None, self.environment.id)
        return self.environment

    def invalidate(self) -> None:
        self.invalidated = True


def test_python_runner_handles_success_and_public_tests(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        run_id = start(
            client,
            "def add(a, b):\n    return a + b\nprint(add(2, 3))",
            tests="assert add(4, 5) == 9",
        )
        run = wait_for_run(client, run_id)

    assert run["status"] == "passed"
    assert run["stdout"].strip() == "5"
    assert run["exit_code"] == 0


def test_python_runner_records_syntax_error(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        run = wait_for_run(client, start(client, "def broken(:\n    pass"))

    assert run["status"] == "failed"
    assert "SyntaxError" in run["stderr"]
    assert run["exit_code"] != 0


def test_python_runner_times_out(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        run = wait_for_run(
            client,
            start(client, "while True:\n    pass", timeout_ms=150),
        )

    assert run["status"] == "timeout"
    assert run["duration_ms"] >= 100


def test_python_runner_can_be_stopped_manually(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        run_id = start(client, "import time\nprint('ready', flush=True)\ntime.sleep(10)")
        time.sleep(0.1)
        stopped = client.post(f"/api/python/runs/{run_id}/stop")
        run = wait_for_run(client, run_id)

    assert stopped.status_code == 200
    assert run["status"] == "stopped"


def test_python_runner_truncates_excessive_output(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        run = wait_for_run(
            client,
            start(client, "print('x' * 20000)", max_output_chars=500),
        )

    assert run["status"] == "passed"
    assert run["truncated"] == 1
    assert len(run["stdout"]) < 600
    assert "输出已截断" in run["stdout"]


def test_python_runner_drains_large_output_incrementally_without_communicate(
    tmp_path, monkeypatch
) -> None:
    current = PythonEnvironment(
        id="streaming-test",
        label="Current",
        version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        path=sys.executable,
        kind="current",
        current=True,
    )

    class ChunkStream:
        def __init__(self, remaining: int) -> None:
            self.remaining = remaining
            self.largest_read = 0

        def read(self, size: int = -1) -> str:
            assert 0 < size <= 8192
            self.largest_read = max(self.largest_read, size)
            count = min(size, self.remaining)
            self.remaining -= count
            return "x" * count

    class StreamingProcess:
        returncode = None

        def __init__(self, _args, **_kwargs) -> None:
            self.stdout = ChunkStream(2_000_000)
            self.stderr = ChunkStream(0)

        def communicate(self, timeout=None):
            raise AssertionError("communicate would buffer all output in memory")

        def wait(self, timeout=None):
            self.returncode = 0
            return 0

        def poll(self):
            return self.returncode

        def terminate(self):
            self.returncode = -15

        def kill(self):
            self.returncode = -9

    monkeypatch.setattr(
        "backend.app.python_runner.manager.subprocess.Popen", StreamingProcess
    )

    with TestClient(create_app(data_dir=tmp_path)) as client:
        client.app.state.python_runner.environment_registry = FixedRegistry(current)
        run = wait_for_run(
            client,
            start(client, "print('large')", max_output_chars=500),
            timeout=1,
        )

    assert run["status"] == "passed"
    assert run["truncated"] == 1
    assert len(run["stdout"]) <= 500
    assert "输出已截断" in run["stdout"]


def test_python_runner_uses_selected_environment_and_persists_snapshot(
    tmp_path, monkeypatch
) -> None:
    selected = PythonEnvironment(
        id="conda-ml",
        label="ML · Python 3.12.4",
        version="3.12.4",
        path="C:/fake-conda/python.exe",
        kind="conda",
        current=False,
    )
    popen_calls: list[tuple[list[str], dict]] = []

    class FakeProcess:
        returncode = 0

        def __init__(self, args, **kwargs) -> None:
            popen_calls.append((args, kwargs))

        def communicate(self, timeout=None):
            return ("selected environment\n", "")

        def poll(self):
            return self.returncode

    monkeypatch.setattr("backend.app.python_runner.manager.subprocess.Popen", FakeProcess)

    with TestClient(create_app(data_dir=tmp_path)) as client:
        client.app.state.python_runner.environment_registry = FixedRegistry(selected)
        run_id = start(
            client,
            "print('selected environment')",
            environment_id=selected.id,
        )
        run = wait_for_run(client, run_id)
        history = client.get("/api/python/runs").json()["data"]

    assert popen_calls[0][0][0] == selected.path
    assert run["environment_id"] == selected.id
    assert run["interpreter_path"] == selected.path
    assert run["interpreter_version"] == selected.version
    assert history[0]["environment_id"] == selected.id
    assert history[0]["interpreter_path"] == selected.path
    child_path = popen_calls[0][1]["env"]["PATH"]
    expected_prefix = os.pathsep.join(
        [
            "C:\\fake-conda",
            "C:\\fake-conda\\Scripts",
            "C:\\fake-conda\\Library\\bin",
        ]
    )
    assert child_path.lower().startswith(expected_prefix.lower())


def test_python_runner_reports_unavailable_interpreter_and_finishes_history(
    tmp_path, monkeypatch
) -> None:
    selected = PythonEnvironment(
        id="missing-env",
        label="Missing",
        version="3.12.4",
        path="C:/missing/python.exe",
        kind="conda",
        current=False,
    )

    def unavailable(*_args, **_kwargs):
        raise FileNotFoundError("interpreter disappeared")

    monkeypatch.setattr("backend.app.python_runner.manager.subprocess.Popen", unavailable)

    with TestClient(create_app(data_dir=tmp_path)) as client:
        registry = FixedRegistry(selected)
        client.app.state.python_runner.environment_registry = registry
        response = client.post(
            "/api/python/runs",
            json={"code": "print('never runs')", "environment_id": selected.id},
        )
        history = client.get("/api/python/runs").json()["data"]

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "PYTHON_ENV_NOT_FOUND"
    assert len(history) == 1
    assert history[0]["status"] == "failed"
    assert history[0]["finished_at"] is not None
    assert registry.invalidated


def test_python_runner_limits_concurrent_processes(tmp_path) -> None:
    current = PythonEnvironment(
        id="current-test",
        label="Current",
        version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        path=sys.executable,
        kind="current",
        current=True,
    )

    with TestClient(create_app(data_dir=tmp_path)) as client:
        client.app.state.python_runner.environment_registry = FixedRegistry(current)
        responses = [
            client.post(
                "/api/python/runs",
                json={
                    "code": "import time; time.sleep(10)",
                    "environment_id": current.id,
                },
            )
            for _ in range(5)
        ]

    assert [response.status_code for response in responses[:4]] == [201] * 4
    assert responses[4].status_code == 429
    assert responses[4].json()["error"]["code"] == "PYTHON_RUN_LIMIT_REACHED"


def test_python_runner_does_not_leak_parent_secrets_to_code(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("STUDYPILOT_SESSION_TOKEN", "super-secret-session")
    monkeypatch.setenv("OPENAI_API_KEY", "super-secret-api-key")
    monkeypatch.setenv("SOME_RANDOM_CREDENTIAL", "super-secret-random")
    current = PythonEnvironment(
        id="current-test",
        label="Current",
        version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        path=sys.executable,
        kind="current",
        current=True,
    )
    code = (
        "import os\n"
        "print(os.getenv('STUDYPILOT_SESSION_TOKEN'))\n"
        "print(os.getenv('OPENAI_API_KEY'))\n"
        "print(os.getenv('SOME_RANDOM_CREDENTIAL'))"
    )

    with TestClient(create_app(data_dir=tmp_path)) as client:
        client.app.state.python_runner.environment_registry = FixedRegistry(current)
        run = wait_for_run(client, start(client, code, environment_id=current.id))

    assert run["status"] == "passed"
    assert run["stdout"].splitlines() == ["None", "None", "None"]


@pytest.mark.skipif(os.name != "nt", reason="Windows process-tree behavior")
def test_python_runner_terminates_the_whole_windows_process_tree(monkeypatch) -> None:
    calls: list[tuple[list[str], dict]] = []

    class FakeProcess:
        pid = 321
        returncode = None
        terminate_called = False

        def poll(self):
            return self.returncode

        def wait(self, timeout=None):
            self.returncode = 1
            return self.returncode

        def terminate(self):
            self.terminate_called = True
            self.returncode = 1

        def kill(self):
            self.returncode = 1

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    monkeypatch.setattr("backend.app.python_runner.manager.subprocess.run", fake_run)
    process = FakeProcess()

    PythonRunner._terminate(process)

    assert calls
    assert calls[0][0][1:] == ["/PID", "321", "/T", "/F"]
    assert calls[0][1]["shell"] is False
    assert not process.terminate_called
