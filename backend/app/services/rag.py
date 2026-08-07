from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
from dataclasses import dataclass
from typing import Any, Protocol

from ..db import Database
from .embeddings import HashingEmbeddings


class EmbeddingProvider(Protocol):
    model: str
    version: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


@dataclass(frozen=True)
class RetrievalScope:
    selected_document_ids: tuple[int, ...] = ()
    include_notes: bool = True
    include_knowledge: bool = True


@dataclass(frozen=True)
class RetrievalResult:
    citation: str
    course_id: int
    source_kind: str
    source_id: str
    title: str
    content: str
    document_id: int | None
    block_key: str
    locator: dict[str, Any]
    score: float


class RetrievalService:
    """Incremental local hybrid retrieval with real, navigable source locators."""

    def __init__(
        self,
        database: Database,
        *,
        embeddings: EmbeddingProvider | None = None,
    ) -> None:
        self.database = database
        self.embeddings = embeddings or HashingEmbeddings()

    def sync_course(self, course_id: int) -> None:
        source_rows = self._source_rows(course_id)
        keys = {
            (row["source_kind"], row["source_id"], row["block_key"])
            for row in source_rows
        }
        with self.database.connect() as connection:
            existing = {
                (row["source_kind"], row["source_id"], row["block_key"]): row
                for row in connection.execute(
                    """SELECT source_kind, source_id, block_key, content_hash,
                              embedding_model, embedding_version, embedding_json
                       FROM rag_entries WHERE course_id = ?""",
                    (course_id,),
                )
            }

        changed: list[dict[str, Any]] = []
        for row in source_rows:
            row["content_hash"] = self._content_hash(row)
            previous = existing.get(
                (row["source_kind"], row["source_id"], row["block_key"])
            )
            if (
                previous
                and previous["content_hash"] == row["content_hash"]
                and previous["embedding_model"] == self.embeddings.model
                and previous["embedding_version"] == self.embeddings.version
            ):
                row["embedding_json"] = previous["embedding_json"]
            else:
                changed.append(row)

        if changed:
            vectors = self.embeddings.embed(
                [f"{row['title']}\n{row['content']}" for row in changed]
            )
            for row, vector in zip(changed, vectors, strict=True):
                row["embedding_json"] = json.dumps(vector, separators=(",", ":"))

        with self.database.connect() as connection:
            connection.execute(
                "UPDATE rag_entries SET is_active = 0, updated_at = CURRENT_TIMESTAMP "
                "WHERE course_id = ?",
                (course_id,),
            )
            for row in source_rows:
                connection.execute(
                    """INSERT INTO rag_entries(
                        course_id, source_kind, source_id, document_id, block_key,
                        ordinal, title, content, locator_json, content_hash,
                        embedding_model, embedding_version, embedding_json, is_active,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                    ON CONFLICT(course_id, source_kind, source_id, block_key) DO UPDATE SET
                        document_id = excluded.document_id,
                        ordinal = excluded.ordinal,
                        title = excluded.title,
                        content = excluded.content,
                        locator_json = excluded.locator_json,
                        content_hash = excluded.content_hash,
                        embedding_model = excluded.embedding_model,
                        embedding_version = excluded.embedding_version,
                        embedding_json = excluded.embedding_json,
                        is_active = 1,
                        updated_at = CURRENT_TIMESTAMP""",
                    (
                        course_id,
                        row["source_kind"],
                        row["source_id"],
                        row["document_id"],
                        row["block_key"],
                        row["ordinal"],
                        row["title"],
                        row["content"],
                        row["locator_json"],
                        row["content_hash"],
                        self.embeddings.model,
                        self.embeddings.version,
                        row.get("embedding_json", "[]"),
                    ),
                )
            if not keys:
                connection.execute(
                    "UPDATE rag_entries SET is_active = 0 WHERE course_id = ?",
                    (course_id,),
                )

    def retrieve(
        self,
        course_id: int,
        query: str,
        scope: RetrievalScope | None = None,
        *,
        max_chars: int = 7000,
        limit: int = 12,
    ) -> list[RetrievalResult]:
        scope = scope or RetrievalScope()
        self.sync_course(course_id)
        rows = self._active_rows(course_id, scope)
        if not rows:
            return []

        lexical_scores = self._fts_scores(course_id, scope, query)
        query_vector = self.embeddings.embed([query])[0]
        semantic_scores = {
            int(row["id"]): self._cosine(
                query_vector, self._json_vector(row["embedding_json"])
            )
            for row in rows
        }
        lexical_rank = self._rank(lexical_scores)
        semantic_rank = self._rank(semantic_scores)
        rrf_scores = {
            int(row["id"]): (
                (1.0 / (60 + lexical_rank[int(row["id"])]))
                if int(row["id"]) in lexical_rank
                else 0.0
            )
            + (
                (1.0 / (60 + semantic_rank[int(row["id"])]))
                if int(row["id"]) in semantic_rank
                else 0.0
            )
            for row in rows
        }
        ordered = sorted(
            rows,
            key=lambda row: (
                rrf_scores[int(row["id"])],
                semantic_scores[int(row["id"])],
                lexical_scores.get(int(row["id"]), 0.0),
                -int(row["ordinal"]),
            ),
            reverse=True,
        )
        document_blocks = {
            (int(row["document_id"]), int(row["ordinal"])): row
            for row in rows
            if row["source_kind"] == "document" and row["document_id"] is not None
        }
        selected: list[Any] = []
        selected_ids: set[int] = set()
        used = 0
        for seed in ordered:
            candidates = [seed]
            if seed["source_kind"] == "document" and seed["document_id"] is not None:
                document_id = int(seed["document_id"])
                ordinal = int(seed["ordinal"])
                candidates.extend(
                    neighbor
                    for neighbor in (
                        document_blocks.get((document_id, ordinal - 1)),
                        document_blocks.get((document_id, ordinal + 1)),
                    )
                    if neighbor is not None
                )
            for row in candidates:
                row_id = int(row["id"])
                if row_id in selected_ids or len(selected) >= limit:
                    continue
                content = str(row["content"]).strip()
                if not content:
                    continue
                cost = len(content) + len(str(row["title"])) + 32
                if selected and used + cost > max_chars:
                    continue
                selected.append(row)
                selected_ids.add(row_id)
                used += cost
            if len(selected) >= limit:
                break

        return [
            RetrievalResult(
                citation=f"S{index}",
                course_id=int(row["course_id"]),
                source_kind=str(row["source_kind"]),
                source_id=str(row["source_id"]),
                title=str(row["title"]),
                content=str(row["content"]),
                document_id=(
                    int(row["document_id"])
                    if row["document_id"] is not None
                    else None
                ),
                block_key=str(row["block_key"]),
                locator=self._json_object(row["locator_json"]),
                score=rrf_scores[int(row["id"])],
            )
            for index, row in enumerate(selected, start=1)
        ]

    def _source_rows(self, course_id: int) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        with self.database.connect() as connection:
            for row in connection.execute(
                """SELECT d.id AS document_id, d.title, b.block_key, b.ordinal,
                          b.text AS content, b.locator_json
                   FROM documents d
                   JOIN document_blocks b ON b.document_id = d.id
                   WHERE d.course_id = ? AND d.deleted_at IS NULL
                         AND d.status = 'ready'
                   ORDER BY d.id, b.ordinal""",
                (course_id,),
            ):
                rows.append(
                    {
                        "source_kind": "document",
                        "source_id": str(row["document_id"]),
                        "document_id": int(row["document_id"]),
                        "block_key": str(row["block_key"]),
                        "ordinal": int(row["ordinal"]),
                        "title": str(row["title"]),
                        "content": str(row["content"]),
                        "locator_json": str(row["locator_json"] or "{}"),
                    }
                )
            for row in connection.execute(
                """SELECT id, title, content FROM notes
                   WHERE course_id = ? ORDER BY id""",
                (course_id,),
            ):
                rows.append(
                    {
                        "source_kind": "note",
                        "source_id": str(row["id"]),
                        "document_id": None,
                        "block_key": "",
                        "ordinal": 0,
                        "title": str(row["title"]),
                        "content": str(row["content"]),
                        "locator_json": "{}",
                    }
                )
            for row in connection.execute(
                """SELECT id, title, content, description, source_document_id,
                          source_block_key, source_locator_json
                   FROM knowledge_nodes WHERE course_id = ? ORDER BY id""",
                (course_id,),
            ):
                rows.append(
                    {
                        "source_kind": "knowledge_node",
                        "source_id": str(row["id"]),
                        "document_id": row["source_document_id"],
                        "block_key": str(row["source_block_key"] or ""),
                        "ordinal": 0,
                        "title": str(row["title"]),
                        "content": "\n".join(
                            part
                            for part in (
                                str(row["description"] or "").strip(),
                                str(row["content"] or "").strip(),
                            )
                            if part
                        ),
                        "locator_json": str(row["source_locator_json"] or "{}"),
                    }
                )
        return rows

    def _active_rows(self, course_id: int, scope: RetrievalScope) -> list[Any]:
        clauses = ["course_id = ?", "is_active = 1"]
        parameters: list[Any] = [course_id]
        if scope.selected_document_ids:
            placeholders = ",".join("?" for _ in scope.selected_document_ids)
            clauses.append(f"source_kind = 'document' AND document_id IN ({placeholders})")
            parameters.extend(scope.selected_document_ids)
        else:
            excluded: list[str] = []
            if not scope.include_notes:
                excluded.append("'note'")
            if not scope.include_knowledge:
                excluded.append("'knowledge_node'")
            if excluded:
                clauses.append(f"source_kind NOT IN ({','.join(excluded)})")
        with self.database.connect() as connection:
            return list(
                connection.execute(
                    "SELECT * FROM rag_entries WHERE " + " AND ".join(clauses),
                    parameters,
                )
            )

    @staticmethod
    def _content_hash(row: dict[str, Any]) -> str:
        payload = "\0".join(
            (
                str(row["title"]),
                str(row["content"]),
                str(row["locator_json"]),
            )
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _fts_scores(
        self, course_id: int, scope: RetrievalScope, query: str
    ) -> dict[int, float]:
        tokens = [
            token
            for token in re.findall(r"[^\W_]+", query.casefold(), flags=re.UNICODE)
            if len(token) > 1
        ][:12]
        if not tokens:
            return {}
        match_query = " OR ".join(f'"{token}"' for token in tokens)
        clauses = ["e.course_id = ?", "e.is_active = 1"]
        parameters: list[Any] = [match_query, course_id]
        if scope.selected_document_ids:
            placeholders = ",".join("?" for _ in scope.selected_document_ids)
            clauses.append(
                f"e.source_kind = 'document' AND e.document_id IN ({placeholders})"
            )
            parameters.extend(scope.selected_document_ids)
        else:
            excluded: list[str] = []
            if not scope.include_notes:
                excluded.append("'note'")
            if not scope.include_knowledge:
                excluded.append("'knowledge_node'")
            if excluded:
                clauses.append(f"e.source_kind NOT IN ({','.join(excluded)})")
        try:
            with self.database.connect() as connection:
                matches = connection.execute(
                    "SELECT e.id, bm25(rag_entries_fts, 8.0, 1.0) AS rank "
                    "FROM rag_entries_fts "
                    "JOIN rag_entries e ON e.id = rag_entries_fts.rowid "
                    "WHERE rag_entries_fts MATCH ? AND " + " AND ".join(clauses) +
                    " ORDER BY rank LIMIT 96",
                    parameters,
                )
                return {
                    int(row["id"]): -float(row["rank"])
                    for row in matches
                }
        except sqlite3.OperationalError:
            return {}

    @staticmethod
    def _rank(scores: dict[int, float]) -> dict[int, int]:
        ordered = sorted(scores, key=lambda item: (scores[item], -item), reverse=True)
        return {item: index for index, item in enumerate(ordered, start=1)}

    @staticmethod
    def _cosine(left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        left_norm = math.sqrt(sum(value * value for value in left))
        right_norm = math.sqrt(sum(value * value for value in right))
        if not left_norm or not right_norm:
            return 0.0
        return sum(a * b for a, b in zip(left, right, strict=True)) / (
            left_norm * right_norm
        )

    @staticmethod
    def _json_vector(value: str) -> list[float]:
        try:
            parsed = json.loads(value)
            return [float(item) for item in parsed] if isinstance(parsed, list) else []
        except (TypeError, ValueError, json.JSONDecodeError):
            return []

    @staticmethod
    def _json_object(value: str) -> dict[str, Any]:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, json.JSONDecodeError):
            return {}
