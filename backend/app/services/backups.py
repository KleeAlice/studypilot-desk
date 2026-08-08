from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
import re
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from .. import __version__
from ..db import CURRENT_SCHEMA_VERSION, Database
from ..errors import AppError


MINIMUM_SUPPORTED_SCHEMA_VERSION = 1

BACKUP_DIRECTORIES = (
    "documents",
    "media",
    "attachments",
    "python_workspaces",
    "experiment_outputs",
    "indexes",
)


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


class BackupService:
    def __init__(self, database: Database, data_dir: Path) -> None:
        self.database = database
        self.data_dir = data_dir.resolve()
        self.backup_dir = self.data_dir / "backups"

    def create(self) -> dict:
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        target = self.backup_dir / f"studypilot-backup-{stamp}.zip"
        temporary_zip = target.with_suffix(".zip.tmp")
        snapshot = self.backup_dir / f".{uuid.uuid4().hex}-app.db"
        self._snapshot_database(snapshot)
        files: list[tuple[Path, str]] = [(snapshot, "app.db")]
        for directory_name in BACKUP_DIRECTORIES:
            directory = self.data_dir / directory_name
            if not directory.exists():
                continue
            for path in directory.rglob("*"):
                if path.is_file():
                    files.append((path, path.relative_to(self.data_dir).as_posix()))

        manifest_files = [
            {"path": archive_name, "size": path.stat().st_size, "sha256": digest(path)}
            for path, archive_name in files
        ]
        manifest = {
            "application": "StudyPilot Desk",
            "application_version": __version__,
            "schema_version": CURRENT_SCHEMA_VERSION,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "files": manifest_files,
            "total_size": sum(item["size"] for item in manifest_files),
        }
        try:
            with zipfile.ZipFile(temporary_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for path, archive_name in files:
                    archive.write(path, archive_name)
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            temporary_zip.replace(target)
        finally:
            snapshot.unlink(missing_ok=True)
            temporary_zip.unlink(missing_ok=True)
        return {"path": target, "manifest": manifest}

    def restore(self, archive_path: Path | str, overwrite: bool = False) -> dict:
        archive_path = Path(archive_path)
        if not archive_path.is_file():
            raise AppError("BACKUP_NOT_FOUND", "备份文件不存在", 404)
        if self.database.path.exists() and not overwrite:
            raise AppError("RESTORE_CONFIRMATION_REQUIRED", "恢复会覆盖当前数据", 409)

        with self._open_archive(archive_path) as archive:
            for info in archive.infolist():
                self._validate_member(info.filename)
            try:
                manifest = json.loads(archive.read("manifest.json"))
            except (KeyError, json.JSONDecodeError) as exc:
                raise AppError("INVALID_BACKUP", "备份缺少有效 manifest", 422) from exc
            if not isinstance(manifest, dict):
                raise AppError("INVALID_BACKUP", "备份 manifest 格式无效", 422)
            schema_version = manifest.get("schema_version")
            if (
                manifest.get("application") != "StudyPilot Desk"
                or not isinstance(schema_version, int)
                or not MINIMUM_SUPPORTED_SCHEMA_VERSION
                <= schema_version
                <= CURRENT_SCHEMA_VERSION
            ):
                raise AppError("INCOMPATIBLE_BACKUP", "备份版本不兼容", 422)
            self._validate_manifest(archive, manifest)

            with tempfile.TemporaryDirectory(prefix="restore-", dir=self.data_dir) as temporary:
                staging = Path(temporary).resolve()
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    destination = (staging / PurePosixPath(info.filename)).resolve()
                    if staging not in destination.parents and destination != staging:
                        raise AppError("UNSAFE_BACKUP", "备份包含不安全路径", 422)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(info) as source, destination.open("wb") as output:
                        shutil.copyfileobj(source, output)
                self._verify_manifest(staging, manifest)
                restored_database = staging / "app.db"
                self._validate_database(restored_database)
                Database(restored_database).initialize()
                self._validate_database(restored_database)
                recovery = self.create() if self.database.path.exists() else None
                self._replace_database(restored_database)
                for directory_name in BACKUP_DIRECTORIES:
                    source = staging / directory_name
                    if source.exists():
                        self._replace_directory(source, self.data_dir / directory_name)
        return {"restored": True, "manifest": manifest, "recovery_backup": str(recovery["path"]) if recovery else None}

    def list(self) -> list[dict]:
        if not self.backup_dir.exists():
            return []
        return [
            {"path": str(path), "filename": path.name, "size": path.stat().st_size, "modified_at": path.stat().st_mtime}
            for path in sorted(self.backup_dir.glob("*.zip"), reverse=True)
        ]

    def _snapshot_database(self, destination: Path) -> None:
        # sqlite3.Connection's context manager only commits or rolls back; it
        # does not close the handle. Windows keeps the snapshot locked until
        # both connections are explicitly closed.
        with closing(sqlite3.connect(self.database.path)) as source, closing(
            sqlite3.connect(destination)
        ) as target:
            with target:
                source.backup(target)

    @staticmethod
    def _validate_member(name: str) -> None:
        normalized = name.replace("\\", "/")
        path = PurePosixPath(normalized)
        if path.is_absolute() or ".." in path.parts or (path.parts and ":" in path.parts[0]):
            raise AppError("UNSAFE_BACKUP", "备份包含不安全路径", 422)

    @staticmethod
    def _open_archive(path: Path) -> zipfile.ZipFile:
        try:
            return zipfile.ZipFile(path)
        except (OSError, zipfile.BadZipFile) as exc:
            raise AppError("INVALID_BACKUP", "备份不是有效的 ZIP 文件", 422) from exc

    @staticmethod
    def _verify_manifest(staging: Path, manifest: dict) -> None:
        for item in manifest.get("files", []):
            path = staging / PurePosixPath(item["path"])
            if not path.is_file() or path.stat().st_size != item["size"] or digest(path) != item["sha256"]:
                raise AppError("BACKUP_CHECKSUM_MISMATCH", "备份文件校验失败", 422)

    @classmethod
    def _validate_manifest(cls, archive: zipfile.ZipFile, manifest: dict) -> None:
        files = manifest.get("files")
        if not isinstance(files, list):
            raise AppError("INVALID_BACKUP", "备份 manifest 文件列表无效", 422)

        archive_names = [
            cls._normalized_member_name(info.filename)
            for info in archive.infolist()
            if not info.is_dir()
        ]
        if archive_names.count("manifest.json") != 1 or len(archive_names) != len(
            set(archive_names)
        ):
            raise AppError("INVALID_BACKUP", "备份包含重复或缺失的 manifest", 422)
        payload_names = set(archive_names) - {"manifest.json"}

        manifest_names: set[str] = set()
        for item in files:
            if not isinstance(item, dict):
                raise AppError("INVALID_BACKUP", "备份 manifest 文件条目无效", 422)
            path = item.get("path")
            size = item.get("size")
            checksum = item.get("sha256")
            if (
                not isinstance(path, str)
                or not path
                or not isinstance(size, int)
                or isinstance(size, bool)
                or size < 0
                or not isinstance(checksum, str)
                or re.fullmatch(r"[0-9a-fA-F]{64}", checksum) is None
            ):
                raise AppError("INVALID_BACKUP", "备份 manifest 文件条目无效", 422)
            cls._validate_member(path)
            normalized = cls._normalized_member_name(path)
            if normalized == "manifest.json" or normalized in manifest_names:
                raise AppError("INVALID_BACKUP", "备份 manifest 文件条目重复", 422)
            manifest_names.add(normalized)

        if "app.db" not in manifest_names or manifest_names != payload_names:
            raise AppError("INVALID_BACKUP", "备份文件与 manifest 不一致", 422)

    @staticmethod
    def _normalized_member_name(name: str) -> str:
        return PurePosixPath(name.replace("\\", "/")).as_posix()

    @staticmethod
    def _validate_database(path: Path) -> None:
        if not path.is_file():
            raise AppError("INVALID_BACKUP", "备份中缺少数据库", 422)
        try:
            with closing(sqlite3.connect(path)) as connection:
                result = connection.execute("PRAGMA quick_check").fetchone()[0]
                version = connection.execute("PRAGMA user_version").fetchone()[0]
        except sqlite3.DatabaseError as exc:
            raise AppError("INVALID_BACKUP_DATABASE", "备份数据库不可读", 422) from exc
        if (
            result != "ok"
            or version < MINIMUM_SUPPORTED_SCHEMA_VERSION
            or version > CURRENT_SCHEMA_VERSION
        ):
            raise AppError("INVALID_BACKUP_DATABASE", "备份数据库校验失败", 422)

    def _replace_database(self, source: Path) -> None:
        target = self.database.path.resolve()
        self._ensure_inside_data(target)
        temporary = target.with_suffix(".restore.tmp")
        shutil.copy2(source, temporary)
        temporary.replace(target)
        target.with_name(target.name + "-wal").unlink(missing_ok=True)
        target.with_name(target.name + "-shm").unlink(missing_ok=True)

    def _replace_directory(self, source: Path, target: Path) -> None:
        target = target.resolve()
        self._ensure_inside_data(target)
        staged = self.data_dir / f".{target.name}-restored-{uuid.uuid4().hex}"
        old = self.data_dir / f".{target.name}-old-{uuid.uuid4().hex}"
        shutil.copytree(source, staged)
        try:
            if target.exists():
                target.replace(old)
            staged.replace(target)
            if old.exists():
                shutil.rmtree(old)
        except Exception:
            if not target.exists() and old.exists():
                old.replace(target)
            raise
        finally:
            if staged.exists():
                shutil.rmtree(staged)

    def _ensure_inside_data(self, target: Path) -> None:
        if self.data_dir not in target.parents:
            raise AppError("UNSAFE_RESTORE_TARGET", "恢复目标超出数据目录", 422)
