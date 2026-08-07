from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path

from ..errors import AppError


MAX_DISCOVERED_CANDIDATES = 12
MAX_PROBE_WORKERS = 6
DISCOVERY_COMMAND_TIMEOUT_SECONDS = 0.75
CONDA_DISCOVERY_TIMEOUT_SECONDS = 3.5

SAFE_ENVIRONMENT_KEYS = {
    "systemroot",
    "windir",
    "path",
    "pathext",
    "temp",
    "tmp",
    "tmpdir",
    "comspec",
    "userprofile",
    "home",
    "localappdata",
    "appdata",
    "programdata",
    "lang",
    "lc_all",
    "lc_ctype",
}


def safe_subprocess_environment(
    interpreter_path: str | None = None, kind: str | None = None
) -> dict[str, str]:
    """Return the small, non-secret environment allowed for Python subprocesses."""
    environment = {
        key: value
        for key, value in os.environ.items()
        if key.lower() in SAFE_ENVIRONMENT_KEYS
    }
    path_key = next((key for key in environment if key.lower() == "path"), None)
    inherited_path = environment.pop(path_key, "") if path_key else ""

    path_entries: list[str] = []
    environment_root: Path | None = None
    if interpreter_path:
        executable = Path(interpreter_path)
        environment_root = (
            executable.parent.parent
            if executable.parent.name.lower() in {"scripts", "bin"}
            else executable.parent
        )
        if os.name == "nt":
            path_entries.extend(
                str(path)
                for path in (
                    environment_root,
                    environment_root / "Scripts",
                    environment_root / "Library" / "bin",
                )
            )
        else:
            path_entries.extend(
                str(path) for path in (environment_root / "bin", executable.parent)
            )
    if inherited_path:
        path_entries.extend(inherited_path.split(os.pathsep))

    deduplicated: list[str] = []
    seen: set[str] = set()
    for entry in path_entries:
        if not entry:
            continue
        normalized = os.path.normcase(os.path.normpath(entry))
        if normalized in seen:
            continue
        seen.add(normalized)
        deduplicated.append(entry)
    environment["PATH"] = os.pathsep.join(deduplicated)

    if environment_root is not None and kind == "conda":
        environment["CONDA_PREFIX"] = str(environment_root)
    elif environment_root is not None and kind in {"project", "virtualenv"}:
        environment["VIRTUAL_ENV"] = str(environment_root)
    environment.update(
        {
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUNBUFFERED": "1",
            "PYTHONUTF8": "1",
        }
    )
    return environment


@dataclass(frozen=True)
class PythonEnvironment:
    id: str
    label: str
    version: str
    path: str
    kind: str
    current: bool

    def to_dict(self) -> dict:
        return asdict(self)


class PythonEnvironmentRegistry:
    def __init__(
        self, project_root: Path | None = None, cache_ttl_seconds: float = 60
    ) -> None:
        self.project_root = (project_root or Path.cwd()).resolve()
        self.cache_ttl_seconds = cache_ttl_seconds
        self._cached: tuple[float, list[PythonEnvironment]] | None = None
        self._lock = threading.RLock()

    @staticmethod
    def _id_for(path: Path) -> str:
        normalized = os.path.normcase(str(path.resolve()))
        return "py-" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

    def list(self) -> list[PythonEnvironment]:
        now = time.monotonic()
        with self._lock:
            if self._cached and now - self._cached[0] < self.cache_ttl_seconds:
                return list(self._cached[1])
            environments = self._discover()
            self._cached = (now, environments)
            return list(environments)

    def invalidate(self) -> None:
        with self._lock:
            self._cached = None

    def resolve(self, environment_id: str | None) -> PythonEnvironment:
        environments = self.list()
        if environment_id is None:
            return next(item for item in environments if item.current)
        for item in environments:
            if item.id == environment_id:
                return item
        raise AppError(
            "PYTHON_ENV_NOT_FOUND",
            "所选 Python 环境已不可用，请刷新环境列表后重试",
            422,
            {"environment_id": environment_id},
        )

    def _discover(self) -> list[PythonEnvironment]:
        current_path = Path(sys.executable).resolve()
        environments = [
            PythonEnvironment(
                id=self._id_for(current_path),
                label=f"Python {platform.python_version()}（当前）",
                version=platform.python_version(),
                path=str(current_path),
                kind="current",
                current=True,
            )
        ]
        seen = {self._normalized(current_path)}
        candidates: list[tuple[Path, str, str]] = []
        for path, kind, source_label in self._candidate_paths():
            normalized = self._normalized(path)
            if normalized in seen or not path.is_file():
                continue
            seen.add(normalized)
            candidates.append((path, kind, source_label))
            if len(candidates) >= MAX_DISCOVERED_CANDIDATES:
                break

        def probe_candidate(candidate: tuple[Path, str, str]):
            path, kind, source_label = candidate
            version = self._probe(path)
            if version is None:
                return None
            return PythonEnvironment(
                id=self._id_for(path),
                label=f"{source_label} · Python {version}",
                version=version,
                path=str(path.resolve()),
                kind=kind,
                current=False,
            )

        if candidates:
            worker_count = min(MAX_PROBE_WORKERS, len(candidates))
            with ThreadPoolExecutor(
                max_workers=worker_count, thread_name_prefix="python-env-probe"
            ) as executor:
                environments.extend(
                    item
                    for item in executor.map(probe_candidate, candidates)
                    if item is not None
                )
        return environments

    def _candidate_paths(self) -> list[tuple[Path, str, str]]:
        candidates: list[tuple[Path, str, str]] = []
        for name in (".venv", "venv"):
            for path in self._python_paths(self.project_root / name):
                candidates.append((path, "project", name))

        for variable, kind, label in (
            ("VIRTUAL_ENV", "virtualenv", "虚拟环境"),
            ("CONDA_PREFIX", "conda", "Conda 环境"),
        ):
            root = os.getenv(variable)
            if root:
                for path in self._python_paths(Path(root)):
                    candidates.append((path, kind, label))

        for command in ("python", "python3"):
            found = shutil.which(command)
            if found:
                candidates.append((Path(found), "path", "PATH"))

        with ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="python-env-discovery"
        ) as executor:
            futures = [
                executor.submit(self._launcher_paths),
                executor.submit(self._conda_paths),
            ]
            for future in futures:
                candidates.extend(future.result())
        return candidates

    @staticmethod
    def _python_paths(root: Path) -> tuple[Path, ...]:
        return (
            root / "Scripts" / "python.exe",
            root / "bin" / "python",
            root / "python.exe",
        )

    def _launcher_paths(self) -> list[tuple[Path, str, str]]:
        launcher = shutil.which("py")
        if not launcher:
            return []
        result = self._run_discovery_command([launcher, "-0p"])
        if result is None or result.returncode != 0:
            return []
        paths: list[tuple[Path, str, str]] = []
        for line in result.stdout.splitlines():
            match = re.search(r"([A-Za-z]:[\\/].*python(?:\.exe)?)\s*$", line, re.I)
            if match:
                paths.append((Path(match.group(1).strip()), "launcher", "Py Launcher"))
        return paths

    def _conda_paths(self) -> list[tuple[Path, str, str]]:
        conda = shutil.which("conda")
        if not conda:
            return []
        result = self._run_conda_discovery_command(
            [conda, "env", "list", "--json"]
        )
        if result is None or result.returncode != 0:
            return []
        try:
            roots = json.loads(result.stdout).get("envs", [])
        except (json.JSONDecodeError, AttributeError):
            return []
        paths: list[tuple[Path, str, str]] = []
        for root in roots:
            if not isinstance(root, str):
                continue
            for path in self._python_paths(Path(root)):
                paths.append((path, "conda", Path(root).name or "Conda"))
        return paths

    def _probe(self, path: Path) -> str | None:
        result = self._run_probe(
            [
                str(path.resolve()),
                "-I",
                "-c",
                "import platform; print(platform.python_version())",
            ]
        )
        if result is None or result.returncode != 0:
            return None
        version = result.stdout.strip().splitlines()
        return version[-1].strip() if version else None

    @staticmethod
    def _run_probe(args: list[str]):
        return PythonEnvironmentRegistry._run_command(args, 2)

    @staticmethod
    def _run_discovery_command(args: list[str]):
        return PythonEnvironmentRegistry._run_command(
            args, DISCOVERY_COMMAND_TIMEOUT_SECONDS
        )

    @staticmethod
    def _run_conda_discovery_command(args: list[str]):
        return PythonEnvironmentRegistry._run_command(
            args, CONDA_DISCOVERY_TIMEOUT_SECONDS
        )

    @staticmethod
    def _run_command(args: list[str], timeout: float):
        try:
            options = {
                "capture_output": True,
                "text": True,
                "encoding": "utf-8",
                "errors": "replace",
                "timeout": timeout,
                "check": False,
                "shell": False,
                "env": safe_subprocess_environment(),
            }
            if os.name == "nt":
                options["creationflags"] = subprocess.CREATE_NO_WINDOW
            return subprocess.run(args, **options)
        except (OSError, subprocess.TimeoutExpired):
            return None

    @staticmethod
    def _normalized(path: Path) -> str:
        return os.path.normcase(str(path.resolve()))
