import json

from backend.app.db import Database
from backend.app.services.rag import RetrievalScope, RetrievalService


class SemanticFixture:
    model = "fixture-multilingual"
    version = "1"

    def embed(self, texts: list[str]) -> list[list[float]]:
        def vector(text: str) -> list[float]:
            normalized = text.lower()
            if any(term in normalized for term in ("gradient descent", "\u68af\u5ea6\u4e0b\u964d", "descente de gradient")):
                return [1.0, 0.0, 0.0]
            if any(term in normalized for term in ("step size", "learning rate", "\u5b66\u4e60\u7387", "taux")):
                return [0.8, 0.2, 0.0]
            return [0.0, 0.0, 1.0]

        return [vector(text) for text in texts]


def seed_materials(database: Database) -> tuple[int, int, int]:
    with database.connect() as connection:
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        other_course_id = connection.execute(
            "INSERT INTO courses(title) VALUES ('\u5176\u4ed6\u8bfe\u7a0b')"
        ).lastrowid
        first_id = connection.execute(
            """INSERT INTO documents(
                course_id, title, filename, stored_path, media_type, sha256, body,
                format, status, structure_json, updated_at
            ) VALUES (?, '\u4f18\u5316', 'optim.md', 'documents/optim.md', 'text/markdown',
                'rag-one', '\u68af\u5ea6\u4e0b\u964d\u4f7f\u7528\u5b66\u4e60\u7387\u66f4\u65b0\u53c2\u6570\u3002', 'markdown', 'ready', '{}',
                CURRENT_TIMESTAMP)""",
            (course_id,),
        ).lastrowid
        second_id = connection.execute(
            """INSERT INTO documents(
                course_id, title, filename, stored_path, media_type, sha256, body,
                format, status, structure_json, updated_at
            ) VALUES (?, 'French notes', 'fr.md', 'documents/fr.md', 'text/markdown',
                'rag-two', 'La descente de gradient utilise un taux apprentissage.',
                'markdown', 'ready', '{}', CURRENT_TIMESTAMP)""",
            (course_id,),
        ).lastrowid
        forbidden_id = connection.execute(
            """INSERT INTO documents(
                course_id, title, filename, stored_path, media_type, sha256, body,
                format, status, structure_json, updated_at
            ) VALUES (?, 'Forbidden', 'hidden.md', 'documents/hidden.md', 'text/markdown',
                'rag-three', 'gradient descent secret', 'markdown', 'ready', '{}',
                CURRENT_TIMESTAMP)""",
            (other_course_id,),
        ).lastrowid
        for document_id, block_key, ordinal, text, locator in (
            (first_id, "section:0", 0, "\u68af\u5ea6\u4e0b\u964d\u4f1a\u6cbf\u635f\u5931\u51cf\u5c0f\u7684\u65b9\u5411\u66f4\u65b0\u53c2\u6570\u3002", {"line_start": 1, "line_end": 2}),
            (first_id, "section:1", 1, "\u5b66\u4e60\u7387\u51b3\u5b9a\u6bcf\u6b21\u66f4\u65b0\u7684\u6b65\u957f\u3002", {"line_start": 3, "line_end": 4}),
            (second_id, "section:0", 0, "La descente de gradient r\u00e9duit progressivement la perte.", {"line_start": 1, "line_end": 2}),
            (forbidden_id, "section:0", 0, "gradient descent secret", {"line_start": 1}),
        ):
            connection.execute(
                """INSERT INTO document_blocks(
                    document_id, block_key, block_type, ordinal, locator_json, text, data_json
                ) VALUES (?, ?, 'section', ?, ?, ?, '{}')""",
                (document_id, block_key, ordinal, json.dumps(locator), text),
            )
    return int(course_id), int(first_id), int(second_id)


def test_hybrid_rag_recalls_multilingual_synonyms_and_keeps_real_locators(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    course_id, first_id, second_id = seed_materials(database)
    retrieval = RetrievalService(database, embeddings=SemanticFixture())

    results = retrieval.retrieve(
        course_id,
        "How does gradient descent choose its step size?",
        RetrievalScope(),
        max_chars=2400,
    )

    assert {item.document_id for item in results} >= {first_id, second_id}
    assert all(item.course_id == course_id for item in results)
    assert results[0].citation == "S1"
    assert any(item.locator.get("line_start") == 1 for item in results)
    assert any("\u5b66\u4e60\u7387" in item.content for item in results)


def test_explicit_document_scope_excludes_unselected_materials_and_tracks_updates(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    course_id, first_id, second_id = seed_materials(database)
    retrieval = RetrievalService(database, embeddings=SemanticFixture())

    selected = retrieval.retrieve(
        course_id,
        "gradient descent",
        RetrievalScope(selected_document_ids=(second_id,)),
    )
    assert selected
    assert {item.document_id for item in selected} == {second_id}

    with database.connect() as connection:
        connection.execute(
            "UPDATE document_blocks SET text = '\u5185\u5bb9\u5df2\u66ff\u6362', updated_at = CURRENT_TIMESTAMP "
            "WHERE document_id = ? AND block_key = 'section:0'",
            (second_id,),
        )
        connection.execute(
            "UPDATE documents SET body = '\u5185\u5bb9\u5df2\u66ff\u6362', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (second_id,),
        )
    refreshed = retrieval.retrieve(
        course_id,
        "gradient descent",
        RetrievalScope(selected_document_ids=(second_id,)),
    )
    assert all("descente de gradient" not in item.content for item in refreshed)

    with database.connect() as connection:
        connection.execute(
            "UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (first_id,),
        )
    active = retrieval.retrieve(course_id, "\u68af\u5ea6\u4e0b\u964d", RetrievalScope())
    assert all(item.document_id != first_id for item in active)



def test_bm25_ranks_exact_match_and_adds_adjacent_document_block(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    course_id, first_id, _ = seed_materials(database)
    with database.connect() as connection:
        connection.execute(
            "UPDATE document_blocks SET text = ? WHERE document_id = ? AND block_key = 'section:1'",
            ("quasarvelocity controls the optimizer step.", first_id),
        )
    retrieval = RetrievalService(database, embeddings=SemanticFixture())

    results = retrieval.retrieve(
        course_id,
        "quasarvelocity",
        RetrievalScope(selected_document_ids=(first_id,)),
        limit=2,
        max_chars=1200,
    )

    assert [item.block_key for item in results] == ["section:1", "section:0"]
    assert "quasarvelocity" in results[0].content
