import hashlib

import pytest

from backend.app.db import Database
from backend.app.errors import AppError
from backend.app.services.speech import SpeechService


def test_speech_module_verification_rolls_back_on_hash_mismatch(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    package = tmp_path / "voice.bin"
    package.write_bytes(b"voice payload")
    service = SpeechService(database, tmp_path / "speech")
    module = {
        "id": "en-test",
        "kind": "tts",
        "language_tag": "en-US",
        "voice": "Test voice",
        "version": "1",
        "size_bytes": package.stat().st_size,
        "sha256": hashlib.sha256(b"different payload").hexdigest(),
    }

    with pytest.raises(AppError) as error:
        service.install_verified(module, package)

    assert error.value.code == "SPEECH_MODULE_HASH_MISMATCH"
    assert not (tmp_path / "speech" / "en-test").exists()
    assert service.resolve_engine("en-US")["engine"] == "system"
