from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from ..db import Database
from ..errors import AppError


class SpeechService:
    """Verified local module registry with a safe operating-system fallback."""

    def __init__(self, database: Database, root: Path | str) -> None:
        self.database = database
        self.root = Path(root)

    def install_verified(
        self, module: dict[str, Any], package_path: Path | str
    ) -> dict[str, Any]:
        package = Path(package_path)
        module_id = str(module.get("id") or "").strip()
        if not module_id or not package.is_file():
            raise AppError("SPEECH_MODULE_INVALID", "Speech module is invalid", 422)
        actual_hash = hashlib.sha256(package.read_bytes()).hexdigest()
        expected_hash = str(module.get("sha256") or "").lower()
        target = self.root / module_id
        if actual_hash != expected_hash:
            raise AppError(
                "SPEECH_MODULE_HASH_MISMATCH",
                "Speech module checksum verification failed",
                422,
            )
        if target.exists():
            shutil.rmtree(target)
        try:
            target.mkdir(parents=True, exist_ok=False)
            installed_package = target / package.name
            shutil.copy2(package, installed_package)
            manifest = {
                key: module.get(key)
                for key in (
                    "id",
                    "kind",
                    "language_tag",
                    "voice",
                    "version",
                    "size_bytes",
                    "sha256",
                )
            }
            (target / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            with self.database.connect() as connection:
                connection.execute(
                    """INSERT INTO speech_modules(
                        id, kind, language_tag, voice, version, size_bytes,
                        sha256, install_path, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'installed')
                    ON CONFLICT(id) DO UPDATE SET
                        kind = excluded.kind,
                        language_tag = excluded.language_tag,
                        voice = excluded.voice,
                        version = excluded.version,
                        size_bytes = excluded.size_bytes,
                        sha256 = excluded.sha256,
                        install_path = excluded.install_path,
                        status = 'installed',
                        installed_at = CURRENT_TIMESTAMP""",
                    (
                        module_id,
                        str(module.get("kind") or "tts"),
                        str(module.get("language_tag") or ""),
                        str(module.get("voice") or ""),
                        str(module.get("version") or ""),
                        int(module.get("size_bytes") or package.stat().st_size),
                        actual_hash,
                        str(installed_package),
                    ),
                )
        except Exception:
            if target.exists():
                shutil.rmtree(target)
            raise
        return self.resolve_engine(str(module.get("language_tag") or ""))

    def resolve_engine(self, language_tag: str, *, kind: str = "tts") -> dict[str, Any]:
        preference_column = "tts_module_id" if kind == "tts" else "stt_module_id"
        with self.database.connect() as connection:
            row = connection.execute(
                f"""SELECT m.* FROM speech_preferences p
                    JOIN speech_modules m ON m.id = p.{preference_column}
                    WHERE p.language_tag = ? AND m.kind = ? AND m.status = 'installed'""",
                (language_tag, kind),
            ).fetchone()
            if row is None:
                row = connection.execute(
                    """SELECT * FROM speech_modules
                       WHERE language_tag = ? AND kind = ? AND status = 'installed'
                       ORDER BY installed_at DESC LIMIT 1""",
                    (language_tag, kind),
                ).fetchone()
        if row is None or not Path(str(row["install_path"])).is_file():
            return {
                "engine": "system",
                "kind": kind,
                "language_tag": language_tag,
                "module_id": None,
            }
        return {
            "engine": "local",
            "kind": kind,
            "language_tag": language_tag,
            "module_id": str(row["id"]),
            "voice": str(row["voice"]),
            "path": str(row["install_path"]),
        }
