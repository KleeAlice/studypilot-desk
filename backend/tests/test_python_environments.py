import sys
import subprocess
import time
from types import SimpleNamespace
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.python_runner import environments as environment_module
from backend.app.python_runner.environments import PythonEnvironmentRegistry


def test_python_environments_api_always_exposes_current_interpreter(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        response = client.get("/api/python/environments")

    assert response.status_code == 200
    environments = response.json()["data"]
    current = next(item for item in environments if item["current"])
    assert set(current) == {"id", "label", "version", "path", "kind", "current"}
    assert current["id"]
    assert current["id"] != current["path"]
    assert Path(current["path"]).resolve() == Path(sys.executable).resolve()
    assert current["version"]


def test_python_environments_api_force_refresh_invalidates_registry_cache(
    tmp_path, monkeypatch
) -> None:
    app = create_app(data_dir=tmp_path)
    with TestClient(app) as client:
        registry = app.state.python_runner.environment_registry
        invalidations: list[bool] = []
        monkeypatch.setattr(registry, "invalidate", lambda: invalidations.append(True))
        monkeypatch.setattr(registry, "list", lambda: [])

        regular = client.get("/api/python/environments")
        forced = client.get("/api/python/environments?force=true")

    assert regular.status_code == 200
    assert forced.status_code == 200
    assert invalidations == [True]


def test_registry_discovers_known_sources_safely_deduplicates_and_caches(
    tmp_path, monkeypatch
) -> None:
    project = tmp_path / "project"
    project_python = project / ".venv" / "Scripts" / "python.exe"
    env_python = tmp_path / "env" / "Scripts" / "python.exe"
    path_python = tmp_path / "path" / "python.exe"
    launcher_python = tmp_path / "launcher" / "python.exe"
    for executable in (project_python, env_python, path_python, launcher_python):
        executable.parent.mkdir(parents=True, exist_ok=True)
        executable.write_bytes(b"")

    monkeypatch.setenv("VIRTUAL_ENV", str(env_python.parent.parent))
    monkeypatch.delenv("CONDA_PREFIX", raising=False)

    def fake_which(command: str):
        return {
            "python": str(path_python),
            "python3": str(path_python),
            "py": "C:/Windows/py.exe",
            "conda": None,
        }.get(command)

    calls: list[tuple[list[str], dict]] = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        if args[0] == "C:/Windows/py.exe":
            return subprocess.CompletedProcess(
                args, 0, stdout=f" -V:3.12 * {launcher_python}\n", stderr=""
            )
        return subprocess.CompletedProcess(
            args, 0, stdout="3.12.4\n", stderr=""
        )

    monkeypatch.setattr(
        environment_module, "shutil", SimpleNamespace(which=fake_which), raising=False
    )
    monkeypatch.setattr(
        environment_module,
        "subprocess",
        SimpleNamespace(
            run=fake_run,
            CREATE_NO_WINDOW=subprocess.CREATE_NO_WINDOW,
        ),
        raising=False,
    )

    registry = PythonEnvironmentRegistry(project_root=project)
    first = registry.list()
    calls_after_first = len(calls)
    second = registry.list()

    resolved = {Path(item.path).resolve() for item in first}
    assert project_python.resolve() in resolved
    assert env_python.resolve() in resolved
    assert path_python.resolve() in resolved
    assert launcher_python.resolve() in resolved
    assert len([item for item in first if Path(item.path).resolve() == path_python.resolve()]) == 1
    assert {item.kind for item in first} >= {"current", "project", "virtualenv", "path", "launcher"}
    assert first == second
    assert len(calls) == calls_after_first
    assert all(isinstance(args, list) for args, _ in calls)
    assert all(kwargs["shell"] is False for _, kwargs in calls)
    assert all(
        kwargs.get("creationflags") == subprocess.CREATE_NO_WINDOW
        for _, kwargs in calls
    )
    assert all(kwargs["timeout"] <= 2 for _, kwargs in calls)
    assert all(
        kwargs["timeout"] == 2 for args, kwargs in calls if "-I" in args
    )


def test_registry_discovery_and_probe_commands_do_not_receive_parent_secrets(
    tmp_path, monkeypatch
) -> None:
    executable = tmp_path / "env" / "python.exe"
    executable.parent.mkdir()
    executable.write_bytes(b"")
    monkeypatch.setenv("STUDYPILOT_SESSION_TOKEN", "session-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "api-secret")
    monkeypatch.setenv("SOME_RANDOM_CREDENTIAL", "random-secret")

    calls: list[dict] = []

    def fake_run(args, **kwargs):
        calls.append(kwargs)
        return subprocess.CompletedProcess(args, 0, stdout="3.12.4\n", stderr="")

    monkeypatch.setattr(environment_module.subprocess, "run", fake_run)
    registry = PythonEnvironmentRegistry(project_root=tmp_path)
    monkeypatch.setattr(
        registry, "_candidate_paths", lambda: [(executable, "project", ".venv")]
    )

    registry.list()

    assert calls
    for kwargs in calls:
        child_environment = kwargs["env"]
        assert "STUDYPILOT_SESSION_TOKEN" not in child_environment
        assert "OPENAI_API_KEY" not in child_environment
        assert "SOME_RANDOM_CREDENTIAL" not in child_environment


def test_python_run_rejects_unknown_or_path_like_environment_id(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        response = client.post(
            "/api/python/runs",
            json={"code": "print('no')", "environment_id": "C:/Python/python.exe"},
        )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "PYTHON_ENV_NOT_FOUND"


def test_registry_bounds_candidates_and_probes_them_concurrently(
    tmp_path, monkeypatch
) -> None:
    candidates: list[tuple[Path, str, str]] = []
    for index in range(24):
        executable = tmp_path / f"env-{index}" / "python.exe"
        executable.parent.mkdir()
        executable.write_bytes(b"")
        candidates.append((executable, "conda", f"env-{index}"))

    registry = PythonEnvironmentRegistry(project_root=tmp_path)
    probe_count = 0

    def slow_probe(_path: Path) -> str:
        nonlocal probe_count
        probe_count += 1
        time.sleep(0.12)
        return "3.12.4"

    monkeypatch.setattr(registry, "_candidate_paths", lambda: candidates)
    monkeypatch.setattr(registry, "_probe", slow_probe)

    started = time.monotonic()
    environments = registry.list()
    elapsed = time.monotonic() - started

    assert probe_count <= 16
    assert len(environments) <= 17  # current plus bounded discovered candidates
    assert elapsed < 0.8


def test_registry_allows_bounded_slow_conda_discovery(tmp_path, monkeypatch) -> None:
    conda_python = tmp_path / "conda-env" / "python.exe"
    conda_python.parent.mkdir()
    conda_python.write_bytes(b"")

    def fake_which(command: str):
        return "C:/Conda/Scripts/conda.exe" if command == "conda" else None

    def fake_run(args, **kwargs):
        if args[0] == "C:/Conda/Scripts/conda.exe":
            if kwargs["timeout"] < 3:
                raise subprocess.TimeoutExpired(args, kwargs["timeout"])
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=f'{{"envs": ["{str(conda_python.parent).replace(chr(92), chr(92) * 2)}"]}}',
                stderr="",
            )
        return subprocess.CompletedProcess(args, 0, stdout="3.12.4\n", stderr="")

    monkeypatch.setattr(environment_module.shutil, "which", fake_which)
    monkeypatch.setattr(environment_module.subprocess, "run", fake_run)

    environments = PythonEnvironmentRegistry(project_root=tmp_path).list()

    assert any(Path(item.path).resolve() == conda_python.resolve() for item in environments)
