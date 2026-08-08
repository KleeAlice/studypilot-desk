"""Tests for the plain domain function layer used by the Rust gateway.

These cover the runtime path that actually serves the desktop app (Rust
actix-web -> worker_bridge kind=call -> domain.call), independent of the legacy
FastAPI harness in ``backend.app.main``.
"""

from __future__ import annotations

import pytest

from backend.app.domain import DOMAIN_FUNCTIONS, build_context, call


@pytest.fixture()
def ctx(tmp_path):
    return build_context(tmp_path, "test-token")


def test_health(ctx):
    result = call(ctx, "health", {})
    assert result.status == 200
    payload = result.body.decode("utf-8")
    assert '"status": "ok"' in payload
    assert '"version"' in payload


def test_system_status(ctx):
    result = call(ctx, "system.status", {})
    assert result.status == 200
    assert result.body.decode("utf-8").startswith('{"data":')


def test_settings_round_trip(ctx):
    listed = call(ctx, "settings.list", {})
    assert listed.status == 200
    updated = call(ctx, "settings.update", {"path": {"key": "theme"}, "body": {"value": "dark"}})
    assert updated.status == 200
    assert '"dark"' in updated.body.decode("utf-8")
    again = call(ctx, "settings.list", {})
    assert '"dark"' in again.body.decode("utf-8")


def test_courses_list_and_create(ctx):
    result = call(ctx, "courses.list", {})
    assert result.status == 200
    created = call(ctx, "courses.create", {"body": {"title": "测试课程", "course_type": "knowledge"}})
    assert created.status == 200
    assert '"测试课程"' in created.body.decode("utf-8")


def test_today_returns_200(ctx):
    result = call(ctx, "today", {})
    assert result.status == 200


def test_unknown_function_returns_404(ctx):
    result = call(ctx, "does.not.exist", {})
    assert result.status == 404
    assert "ROUTE_NOT_FOUND" in result.body.decode("utf-8")


def test_app_error_maps_to_status(ctx):
    # Self-referential prerequisite edge is rejected with 409.
    result = call(
        ctx,
        "knowledge.edges.create",
        {"body": {"source_id": 1, "target_id": 1, "relation": "prerequisite"}},
    )
    assert result.status == 409


def test_registry_is_populated():
    expected = {
        "health",
        "system.status",
        "settings.list",
        "settings.update",
        "courses.list",
        "courses.create",
        "courses.home",
        "tasks.list",
        "documents.list",
        "knowledge.graph",
        "notebooks.list",
        "vocabulary.list",
        "language.packs",
        "agent.providers.list",
        "backups.list",
        "media.images.upload",
        "documents.import",
        "agent.messages.stream",
    }
    missing = expected - set(DOMAIN_FUNCTIONS)
    assert not missing, f"domain functions missing: {sorted(missing)}"
