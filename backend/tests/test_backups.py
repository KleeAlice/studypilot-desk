import json
import hashlib
import sqlite3
import zipfile

import pytest

from backend.app import __version__
from backend.app.db import CURRENT_SCHEMA_VERSION, Database
from backend.app.errors import AppError
from backend.app.services.backups import BackupService


def service_for(tmp_path) -> tuple[Database, BackupService]:
    database = Database(tmp_path / "app.db")
    database.initialize()
    return database, BackupService(database, tmp_path)


def test_backup_contains_database_files_and_manifest(tmp_path) -> None:
    database, service = service_for(tmp_path)
    (tmp_path / "documents").mkdir()
    (tmp_path / "documents" / "note.md").write_text("真实资料", encoding="utf-8")
    (tmp_path / "media").mkdir()
    (tmp_path / "media" / "diagram.png").write_bytes(b"image-bytes")

    backup = service.create()

    with zipfile.ZipFile(backup["path"]) as archive:
        names = set(archive.namelist())
        manifest = json.loads(archive.read("manifest.json"))
    assert {"app.db", "documents/note.md", "media/diagram.png", "manifest.json"} <= names
    assert manifest["application"] == "StudyPilot Desk"
    assert manifest["application_version"] == __version__
    assert manifest["schema_version"] == CURRENT_SCHEMA_VERSION
    assert any(item["path"] == "app.db" and item["sha256"] for item in manifest["files"])


@pytest.mark.parametrize("manifest_schema_version", range(1, CURRENT_SCHEMA_VERSION + 1))
def test_restore_migrates_legacy_v1_database_regardless_of_manifest_version(
    tmp_path, manifest_schema_version: int
) -> None:
    database, service = service_for(tmp_path)
    legacy_database = tmp_path / "legacy.db"
    with sqlite3.connect(legacy_database) as connection:
        connection.executescript(
            """
            PRAGMA user_version = 1;
            CREATE TABLE legacy_marker(value TEXT NOT NULL);
            INSERT INTO legacy_marker(value) VALUES ('preserved');
            """
        )
    content = legacy_database.read_bytes()
    manifest = {
        "application": "StudyPilot Desk",
        "schema_version": manifest_schema_version,
        "files": [
            {
                "path": "app.db",
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        ],
    }
    archive_path = tmp_path / f"legacy-v1-manifest-v{manifest_schema_version}.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.write(legacy_database, "app.db")
        archive.writestr("manifest.json", json.dumps(manifest))

    restored = service.restore(archive_path, overwrite=True)

    with sqlite3.connect(database.path) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        marker = connection.execute("SELECT value FROM legacy_marker").fetchone()[0]
    assert restored["manifest"]["schema_version"] == manifest_schema_version
    assert version == CURRENT_SCHEMA_VERSION
    assert marker == "preserved"


def test_restore_round_trip_recovers_database_state(tmp_path) -> None:
    database, service = service_for(tmp_path)
    with database.connect() as connection:
        connection.execute(
            "INSERT INTO generic_items(course_id, collection, title) VALUES (1, 'notes', '备份前笔记')"
        )
    backup = service.create()
    with database.connect() as connection:
        connection.execute("UPDATE generic_items SET title = '备份后修改'")

    service.restore(backup["path"], overwrite=True)

    with sqlite3.connect(database.path) as connection:
        title = connection.execute("SELECT title FROM generic_items").fetchone()[0]
    assert title == "备份前笔记"


def test_restore_rejects_zip_slip_before_writing(tmp_path) -> None:
    _, service = service_for(tmp_path)
    malicious = tmp_path / "malicious.zip"
    with zipfile.ZipFile(malicious, "w") as archive:
        archive.writestr("../escaped.txt", "no")
        archive.writestr("manifest.json", json.dumps({"application": "StudyPilot Desk", "schema_version": 1, "files": []}))

    with pytest.raises(AppError) as caught:
        service.restore(malicious, overwrite=True)

    assert caught.value.code == "UNSAFE_BACKUP"
    assert not (tmp_path.parent / "escaped.txt").exists()


def test_restore_rejects_malformed_manifest_with_domain_error(tmp_path) -> None:
    database, service = service_for(tmp_path)
    content = database.path.read_bytes()
    malformed = tmp_path / "malformed-manifest.zip"
    manifest = {
        "application": "StudyPilot Desk",
        "schema_version": 3,
        "files": [{"path": "app.db", "size": len(content)}],
    }
    with zipfile.ZipFile(malformed, "w") as archive:
        archive.writestr("app.db", content)
        archive.writestr("manifest.json", json.dumps(manifest))

    with pytest.raises(AppError) as caught:
        service.restore(malformed, overwrite=True)

    assert caught.value.code == "INVALID_BACKUP"


def test_restore_rejects_payload_not_covered_by_manifest(tmp_path) -> None:
    database, service = service_for(tmp_path)
    content = database.path.read_bytes()
    unverified = tmp_path / "unverified-payload.zip"
    manifest = {
        "application": "StudyPilot Desk",
        "schema_version": 3,
        "files": [
            {
                "path": "app.db",
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        ],
    }
    with zipfile.ZipFile(unverified, "w") as archive:
        archive.writestr("app.db", content)
        archive.writestr("documents/unverified.txt", "not checksummed")
        archive.writestr("manifest.json", json.dumps(manifest))

    with pytest.raises(AppError) as caught:
        service.restore(unverified, overwrite=True)

    assert caught.value.code == "INVALID_BACKUP"


def test_restore_rejects_non_object_manifest_with_domain_error(tmp_path) -> None:
    database, service = service_for(tmp_path)
    malformed = tmp_path / "manifest-list.zip"
    with zipfile.ZipFile(malformed, "w") as archive:
        archive.writestr("app.db", database.path.read_bytes())
        archive.writestr("manifest.json", "[]")

    with pytest.raises(AppError) as caught:
        service.restore(malformed, overwrite=True)

    assert caught.value.code == "INVALID_BACKUP"


def test_restore_rejects_non_zip_with_domain_error(tmp_path) -> None:
    _, service = service_for(tmp_path)
    corrupted = tmp_path / "corrupted.zip"
    corrupted.write_bytes(b"this is not a zip archive")

    with pytest.raises(AppError) as caught:
        service.restore(corrupted, overwrite=True)

    assert caught.value.code == "INVALID_BACKUP"
