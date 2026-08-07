from backend.app.builtin_language_packs import (
    get_language_lesson,
    get_language_pack,
    list_language_packs,
)


SUPPORTED_TAGS = {
    "yue-Hant-HK",
    "en-US",
    "fr-FR",
    "ja-JP",
    "ko-KR",
}


def test_every_supported_language_has_a_complete_spiral_mastery_path() -> None:
    packs = list_language_packs()

    assert {pack["language_tag"] for pack in packs} == SUPPORTED_TAGS
    for pack in packs:
        assert pack["version"] == 2
        assert len(pack["stages"]) == 6
        lessons = [
            lesson
            for stage in pack["stages"]
            for lesson in stage["lessons"]
        ]
        assert len(lessons) == 42
        assert len({lesson["id"] for lesson in lessons}) == 42
        assert sum(lesson["lesson_type"] == "checkpoint" for lesson in lessons) == 6
        assert {lesson["lesson_type"] for lesson in lessons} == {
            "discover", "practice", "mission", "checkpoint",
        }
        assert all(lesson["mastery_threshold"] in {80, 85} for lesson in lessons)
        assert all(lesson["mastery_threshold"] == 85 for lesson in lessons if lesson["lesson_type"] == "checkpoint")
        assert [stage["level"] for stage in pack["stages"]] == [
            "Pre-A1",
            "A1",
            "A2",
            "B1",
            "B2",
            "C1",
        ]
        scenario_lessons = [
            lesson for lesson in lessons if lesson["lesson_type"] != "checkpoint"
        ]
        units: dict[str, list[dict]] = {}
        for lesson in scenario_lessons:
            units.setdefault(lesson["unit_id"], []).append(lesson)
        assert len(units) == 12
        for unit_lessons in units.values():
            assert [lesson["lesson_type"] for lesson in unit_lessons] == [
                "discover", "practice", "mission",
            ]
            assert [lesson["support_level"] for lesson in unit_lessons] == [
                "full", "guided", "minimal",
            ]
            assert len({lesson["id"] for lesson in unit_lessons}) == 3
        for lesson in lessons:
            assert lesson["can_do"]
            assert len(lesson["phrases"]) >= 3
            assert len(lesson["dialogue"]) >= 2
            assert lesson["passage"]["text"]
            assert lesson["passage"]["translation"]
            assert lesson["unit_id"]
            assert len(lesson["listening"]["choices"]) >= 3
            assert lesson["listening"]["answer"]
            assert lesson["shadowing"]["text"]
            assert lesson["output"]["prompt"]
            assert lesson["output"]["scaffold"]
            assert lesson["culture_note"]


def test_pack_and_lesson_lookup_are_stable_and_isolated() -> None:
    english = get_language_pack("en-US")
    first = english["stages"][0]["lessons"][0]

    assert first["id"].startswith("en-")
    assert get_language_lesson("en-US", first["id"]) == first
    assert get_language_lesson("fr-FR", first["id"]) is None
    assert get_language_pack("unsupported") is None
