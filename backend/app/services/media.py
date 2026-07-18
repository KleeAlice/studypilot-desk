from __future__ import annotations

import json
import uuid
from pathlib import Path

from ..db import Database
from ..errors import AppError
from ..repository import as_dict


MAX_IMAGE_BYTES = 8 * 1024 * 1024


class MediaService:
    def __init__(self, database: Database, data_dir: Path) -> None:
        self.database = database
        self.root = data_dir / "media"
        self.root.mkdir(parents=True, exist_ok=True)

    def _course_id(self) -> int:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT value_json FROM settings WHERE key = 'active_course'"
            ).fetchone()
        return int(json.loads(row[0]))

    def save_image(self, filename: str, content: bytes) -> dict:
        if not content:
            raise AppError("EMPTY_IMAGE", "图片文件为空", 422)
        if len(content) > MAX_IMAGE_BYTES:
            raise AppError("IMAGE_TOO_LARGE", "图片不能超过 8 MB", 413)
        media_type, suffix = self._detect_image(content)
        if media_type is None:
            raise AppError(
                "UNSUPPORTED_IMAGE", "仅支持 PNG、JPEG、WebP 或 GIF 图片", 415
            )

        asset_id = uuid.uuid4().hex
        safe_name = Path(filename or f"image{suffix}").name[:240]
        stored_name = f"{asset_id}{suffix}"
        path = self.root / stored_name
        path.write_bytes(content)
        course_id = self._course_id()
        try:
            with self.database.connect() as connection:
                connection.execute(
                    """INSERT INTO media_assets(
                        id, course_id, filename, media_type, storage_path, size_bytes
                    ) VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        asset_id,
                        course_id,
                        safe_name,
                        media_type,
                        stored_name,
                        len(content),
                    ),
                )
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return self.get_for_course(asset_id, course_id)

    def get(self, asset_id: str) -> dict:
        return self.get_for_course(asset_id, self._course_id())

    def get_for_course(self, asset_id: str, course_id: int) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM media_assets WHERE id = ? AND course_id = ?",
                (asset_id, course_id),
            ).fetchone()
        if not row:
            raise AppError("MEDIA_NOT_FOUND", "图片资源不存在", 404)
        item = as_dict(row)
        item["path"] = self.root / item["storage_path"]
        item["url"] = f"/api/courses/{course_id}/media/images/{item['id']}"
        return item

    def paths_for_course(self, course_id: int) -> list[Path]:
        """Return only media paths that are contained by this service's media root."""
        with self.database.connect() as connection:
            rows = connection.execute(
                "SELECT storage_path FROM media_assets WHERE course_id = ?",
                (course_id,),
            ).fetchall()

        root = self.root.resolve()
        paths: list[Path] = []
        for row in rows:
            path = (root / row["storage_path"]).resolve()
            if path.parent == root:
                paths.append(path)
        return paths

    def remove_files(self, paths: list[Path]) -> None:
        """Best-effort removal after the owning database rows have been deleted."""
        root = self.root.resolve()
        for path in paths:
            resolved = path.resolve()
            if resolved.parent != root:
                continue
            try:
                resolved.unlink(missing_ok=True)
            except OSError:
                # The course deletion already committed. A locked orphan can be
                # reclaimed later without turning a successful deletion into 500.
                continue

    @staticmethod
    def public(asset: dict) -> dict:
        return {
            key: value
            for key, value in asset.items()
            if key not in {"path", "storage_path"}
        }

    @staticmethod
    def _detect_image(content: bytes) -> tuple[str | None, str]:
        if content.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png", ".png"
        if content.startswith(b"\xff\xd8\xff"):
            return "image/jpeg", ".jpg"
        if content.startswith((b"GIF87a", b"GIF89a")):
            return "image/gif", ".gif"
        if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
            return "image/webp", ".webp"
        return None, ""
