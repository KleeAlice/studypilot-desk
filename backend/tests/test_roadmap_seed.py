import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seeds" / "roadmap.json"


def load_seed() -> dict:
    return json.loads(SEED.read_text(encoding="utf-8"))


def test_seed_contains_complete_24_week_roadmap() -> None:
    seed = load_seed()

    assert [week["week"] for week in seed["weeks"]] == list(range(1, 25))
    assert len(seed["phases"]) == 6
    assert [phase["gate"] for phase in seed["phases"]] == [f"G{i}" for i in range(1, 7)]
    assert all(week["tasks"] for week in seed["weeks"])
    assert all(week["deliverables"] for week in seed["weeks"])
    assert all(phase["acceptance"] for phase in seed["phases"])


def test_seed_preserves_source_templates_and_workstreams() -> None:
    seed = load_seed()

    assert seed["source"] == {"kind": "public_demo", "filename": "public-demo-roadmap.json", "license": "CC0-1.0"}
    assert seed["title"] == "通用学习路线演示"
    assert {"learning", "practice"} <= set(seed["workstreams"])
    required = {
        "weekly_review",
        "experiment_record",
        "error_case",
        "paper_card",
        "novelty_matrix",
        "dataset_card",
        "run_manifest",
        "interview_card",
    }
    assert required <= set(seed["templates"])

