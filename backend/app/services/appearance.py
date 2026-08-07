from __future__ import annotations

import time
import uuid
from pathlib import Path

from ..errors import AppError
from ..repository import Repository


MAX_WALLPAPER_BYTES = 12 * 1024 * 1024


class AppearanceService:
    def __init__(self, repository: Repository, data_dir: Path) -> None:
        self.repository = repository
        self.root = data_dir / "appearance"
        self.root.mkdir(parents=True, exist_ok=True)

    def save_wallpaper(self, filename: str, content: bytes) -> dict:
        if not content:
            raise AppError("EMPTY_WALLPAPER", "壁纸文件为空", 422)
        if len(content) > MAX_WALLPAPER_BYTES:
            raise AppError("WALLPAPER_TOO_LARGE", "壁纸不能超过 12 MB", 413)
        media_type, suffix = self._detect_image(content)
        if not media_type:
            raise AppError(
                "UNSUPPORTED_WALLPAPER", "壁纸仅支持 PNG、JPEG、WebP 或 GIF", 415
            )

        revision = str(time.time_ns())
        target = self.root / f"wallpaper{suffix}"
        temporary = self.root / f".wallpaper-{uuid.uuid4().hex}.tmp"
        temporary.write_bytes(content)
        previous = self._stored_path(required=False)
        try:
            temporary.replace(target)
            self.repository.set_setting("wallpaper_mode", "custom")
            self.repository.set_setting("wallpaper_revision", revision)
            self.repository.set_setting("wallpaper_file", target.name)
            self.repository.set_setting("wallpaper_filename", Path(filename).name[:240])
        finally:
            temporary.unlink(missing_ok=True)
        if previous and previous != target:
            previous.unlink(missing_ok=True)
        return {"mode": "custom", "revision": revision, "media_type": media_type}

    def wallpaper(self) -> tuple[Path, str]:
        path = self._stored_path(required=True)
        assert path is not None
        media_type, _ = self._detect_image(path.read_bytes()[:16])
        if not media_type:
            raise AppError("WALLPAPER_NOT_FOUND", "本地壁纸不存在", 404)
        return path, media_type

    def clear_wallpaper(self) -> dict:
        path = self._stored_path(required=False)
        self.repository.set_setting("wallpaper_mode", "none")
        self.repository.set_setting("wallpaper_revision", "")
        self.repository.set_setting("wallpaper_file", "")
        self.repository.set_setting("wallpaper_filename", "")
        if path:
            path.unlink(missing_ok=True)
        return {"mode": "none", "revision": ""}

    def _stored_path(self, *, required: bool) -> Path | None:
        filename = str(self.repository.setting("wallpaper_file", "") or "")
        if not filename:
            if required:
                raise AppError("WALLPAPER_NOT_FOUND", "本地壁纸不存在", 404)
            return None
        path = (self.root / Path(filename).name).resolve()
        if path.parent != self.root.resolve() or not path.is_file():
            if required:
                raise AppError("WALLPAPER_NOT_FOUND", "本地壁纸不存在", 404)
            return None
        return path

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
