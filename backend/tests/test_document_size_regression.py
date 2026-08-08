from fastapi.testclient import TestClient

import backend.app.services.documents as documents_module
from backend.app.main import create_app
from backend.app.services.documents import ParsedDocument


def test_document_upload_reads_the_complete_file_past_the_legacy_limit(
    tmp_path, monkeypatch
) -> None:
    payload = b"0123456789" * 4
    captured: list[bytes] = []

    with TestClient(create_app(data_dir=tmp_path)) as client:
        service = client.app.state.documents

        def record_import(
            filename: str,
            media_type: str,
            content: bytes,
            source_created_at: str | None = None,
        ):
            captured.append(content)
            return {
                "id": 1,
                "filename": filename,
                "media_type": media_type,
                "status": "ready",
            }, False

        monkeypatch.setattr(service, "import_bytes", record_import)
        response = client.post(
            "/api/documents/import",
            files={"file": ("large.txt", payload, "text/plain")},
        )

    assert response.status_code == 201
    assert captured == [payload]


def test_parser_does_not_reject_a_valid_document_only_for_crossing_50mb(
    tmp_path, monkeypatch
) -> None:
    class ReportedLargeBytes(bytes):
        def __len__(self) -> int:
            return 9

    with TestClient(create_app(data_dir=tmp_path)) as client:
        service = client.app.state.documents
        monkeypatch.setattr(documents_module, "MAX_DOCUMENT_BYTES", 8)
        monkeypatch.setattr(
            service,
            "_parse_text",
            lambda content: ParsedDocument(
                format="text",
                structure={"paragraphs": 1},
                metadata={"characters": 1},
                blocks=[],
            ),
        )
        parsed = service.parse("large.txt", ReportedLargeBytes(b"x"))

    assert parsed.format == "text"
