from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path

from ..db import Database
from ..errors import AppError
from ..repository import as_dict
from .environments import (
    PythonEnvironment,
    PythonEnvironmentRegistry,
    safe_subprocess_environment,
)


TRUNCATION_MARKER = "\n…输出已截断…"

MAX_CONCURRENT_RUNS = 4


class PythonRunner:
    def __init__(self, database: Database, workspace_root: Path) -> None:
        self.database = database
        self.workspace_root = workspace_root
        self._processes: dict[str, subprocess.Popen] = {}
        self._starting = 0
        self._stopped: set[str] = set()
        self._lock = threading.RLock()
        self.environment_registry = PythonEnvironmentRegistry(
            Path(__file__).resolve().parents[3]
        )

    def environments(self, force: bool = False) -> list[dict]:
        if force:
            self.environment_registry.invalidate()
        return [item.to_dict() for item in self.environment_registry.list()]

    def _course_id(self) -> int:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT value_json FROM settings WHERE key = 'active_course'"
            ).fetchone()
        return int(json.loads(row[0]))

    def start(
        self,
        code: str,
        tests: str = "",
        environment_id: str | None = None,
        timeout_ms: int = 5000,
        max_output_chars: int = 20000,
    ) -> dict:
        selected_environment = self.environment_registry.resolve(environment_id)
        with self._lock:
            if len(self._processes) + self._starting >= MAX_CONCURRENT_RUNS:
                raise AppError(
                    "PYTHON_RUN_LIMIT_REACHED",
                    "并发运行数量已达上限，请等待当前任务结束后重试",
                    429,
                    {"limit": MAX_CONCURRENT_RUNS},
                )
            self._starting += 1
        try:
            run_id = uuid.uuid4().hex
            workspace = self.workspace_root / run_id
            workspace.mkdir(parents=True, exist_ok=False)
            script = workspace / "main.py"
            combined = code.rstrip() + ("\n\n# Public tests\n" + tests.strip() if tests.strip() else "") + "\n"
            script.write_text(combined, encoding="utf-8")

            with self.database.connect() as connection:
                connection.execute(
                    """INSERT INTO python_runs(
                        id, course_id, code, status, environment_id,
                        interpreter_path, interpreter_version
                    ) VALUES (?, ?, ?, 'running', ?, ?, ?)""",
                    (
                        run_id,
                        self._course_id(),
                        code,
                        selected_environment.id,
                        selected_environment.path,
                        selected_environment.version,
                    ),
                )

            creationflags = 0
            start_new_session = os.name != "nt"
            if os.name == "nt":
                creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
            try:
                process = subprocess.Popen(
                    [selected_environment.path, "-I", "-u", str(script)],
                    cwd=workspace,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=self._safe_environment(selected_environment),
                    creationflags=creationflags,
                    start_new_session=start_new_session,
                )
            except OSError as exc:
                with self.database.connect() as connection:
                    connection.execute(
                        """UPDATE python_runs
                        SET status = 'failed', stderr = ?, finished_at = CURRENT_TIMESTAMP
                        WHERE id = ?""",
                        (f"解释器启动失败：{exc}", run_id),
                    )
                disappeared = isinstance(exc, FileNotFoundError)
                if disappeared:
                    self.environment_registry.invalidate()
                raise AppError(
                    "PYTHON_ENV_NOT_FOUND"
                    if disappeared
                    else "PYTHON_ENVIRONMENT_UNAVAILABLE",
                    "所选 Python 环境已不可用，请刷新环境列表后重试"
                    if disappeared
                    else "无法启动所选 Python 解释器，请检查环境权限后重试",
                    422,
                    {"environment_id": selected_environment.id},
                ) from exc
            with self._lock:
                self._processes[run_id] = process
            threading.Thread(
                target=self._watch,
                args=(run_id, process, timeout_ms, max_output_chars),
                name=f"python-run-{run_id[:8]}",
                daemon=True,
            ).start()
            return self.get(run_id)
        finally:
            with self._lock:
                self._starting -= 1

    @staticmethod
    def _safe_environment(
        selected_environment: PythonEnvironment | None = None,
    ) -> dict[str, str]:
        if selected_environment is None:
            return safe_subprocess_environment()
        return safe_subprocess_environment(
            selected_environment.path, selected_environment.kind
        )

    def _watch(
        self,
        run_id: str,
        process: subprocess.Popen,
        timeout_ms: int,
        max_output_chars: int,
    ) -> None:
        started = time.monotonic()
        (
            stdout,
            stderr,
            stdout_truncated,
            stderr_truncated,
            timed_out,
        ) = self._collect_output(process, timeout_ms / 1000, max_output_chars)

        with self._lock:
            stopped = run_id in self._stopped
            self._processes.pop(run_id, None)
            self._stopped.discard(run_id)
        if stopped:
            status = "stopped"
        elif timed_out:
            status = "timeout"
        else:
            status = "passed" if process.returncode == 0 else "failed"
        duration = int((time.monotonic() - started) * 1000)
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE python_runs SET status = ?, stdout = ?, stderr = ?, exit_code = ?,
                    duration_ms = ?, truncated = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?""",
                (
                    status,
                    stdout,
                    stderr,
                    process.returncode,
                    duration,
                    int(stdout_truncated or stderr_truncated),
                    run_id,
                ),
            )

    def _collect_output(
        self, process: subprocess.Popen, timeout: float, limit: int
    ) -> tuple[str, str, bool, bool, bool]:
        stdout_stream = getattr(process, "stdout", None)
        stderr_stream = getattr(process, "stderr", None)
        if stdout_stream is None or stderr_stream is None or not hasattr(process, "wait"):
            timed_out = False
            try:
                stdout, stderr = process.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                self._terminate(process)
                stdout, stderr = process.communicate(timeout=2)
            stdout, stdout_truncated = self._truncate(stdout or "", limit)
            stderr, stderr_truncated = self._truncate(stderr or "", limit)
            return stdout, stderr, stdout_truncated, stderr_truncated, timed_out

        results: dict[str, tuple[str, bool]] = {}
        readers = [
            threading.Thread(
                target=self._drain_stream,
                args=(stdout_stream, limit, results, "stdout"),
                name="python-stdout-drain",
                daemon=True,
            ),
            threading.Thread(
                target=self._drain_stream,
                args=(stderr_stream, limit, results, "stderr"),
                name="python-stderr-drain",
                daemon=True,
            ),
        ]
        for reader in readers:
            reader.start()

        timed_out = False
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            self._terminate(process)

        for reader, stream in zip(readers, (stdout_stream, stderr_stream)):
            reader.join(timeout=2)
            if reader.is_alive():
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass
                reader.join(timeout=0.2)

        stdout, stdout_truncated = results.get("stdout", ("", True))
        stderr, stderr_truncated = results.get("stderr", ("", True))
        return stdout, stderr, stdout_truncated, stderr_truncated, timed_out

    @classmethod
    def _drain_stream(
        cls,
        stream,
        limit: int,
        destination: dict[str, tuple[str, bool]],
        key: str,
    ) -> None:
        chunks: list[str] = []
        kept = 0
        truncated = False
        try:
            while True:
                chunk = stream.read(4096)
                if not chunk:
                    break
                remaining = max(0, limit - kept)
                if remaining:
                    retained = chunk[:remaining]
                    chunks.append(retained)
                    kept += len(retained)
                if len(chunk) > remaining:
                    truncated = True
        except (OSError, ValueError):
            truncated = True
        text = "".join(chunks)
        if truncated:
            keep = max(0, limit - len(TRUNCATION_MARKER))
            text = text[:keep] + TRUNCATION_MARKER
        destination[key] = (text, truncated)

    @staticmethod
    def _truncate(text: str, limit: int) -> tuple[str, bool]:
        if len(text) <= limit:
            return text, False
        keep = max(0, limit - len(TRUNCATION_MARKER))
        return text[:keep] + TRUNCATION_MARKER, True

    def get(self, run_id: str) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM python_runs WHERE id = ? AND course_id = ?",
                (run_id, self._course_id()),
            ).fetchone()
        if not row:
            raise AppError("PYTHON_RUN_NOT_FOUND", "运行记录不存在", 404)
        return as_dict(row)

    def list(self, limit: int = 50) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT * FROM python_runs WHERE course_id = ?
                ORDER BY created_at DESC LIMIT ?""",
                (self._course_id(), limit),
            ).fetchall()
        return [as_dict(row) for row in rows]

    def stop(self, run_id: str) -> dict:
        self.get(run_id)
        with self._lock:
            process = self._processes.get(run_id)
            if not process:
                return self.get(run_id)
            self._stopped.add(run_id)
        self._terminate(process)
        return self.get(run_id)

    def stop_all(self) -> None:
        with self._lock:
            running = list(self._processes.items())
            self._stopped.update(run_id for run_id, _ in running)
        for _, process in running:
            self._terminate(process)

    @staticmethod
    def _terminate(process: subprocess.Popen) -> None:
        if process.poll() is not None:
            return
        if os.name == "nt" and getattr(process, "pid", None):
            system_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
            taskkill = system_root / "System32" / "taskkill.exe"
            try:
                result = subprocess.run(
                    [str(taskkill), "/PID", str(process.pid), "/T", "/F"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=3,
                    check=False,
                    shell=False,
                    env=safe_subprocess_environment(),
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                if result.returncode == 0:
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    return
            except (OSError, subprocess.TimeoutExpired):
                pass
        try:
            process.terminate()
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
        except ProcessLookupError:
            pass
