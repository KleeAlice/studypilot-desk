import json

from backend.app.services.agent_providers import ProviderConfig, ProviderGateway


def provider() -> ProviderConfig:
    return ProviderConfig(
        "deepseek",
        "openai_compatible",
        "http://provider.test/v1",
        "DeepSeek-V4-Flash",
        "secret-value",
        100000,
    )


def test_openai_stream_yields_text_before_completion_and_never_exposes_key() -> None:
    captured: dict = {}

    def stream_transport(url: str, headers: dict[str, str], payload: dict, _timeouts):
        captured.update(url=url, headers=headers, payload=payload)
        return iter(
            [
                b'data: {"choices":[{"delta":{"content":"first "}}]}\n\n',
                b'data: {"choices":[{"delta":{"content":"second"}}]}\n\n',
                b"data: [DONE]\n\n",
            ]
        )

    gateway = ProviderGateway(stream_transport=stream_transport)
    events = list(gateway.stream(provider(), [{"role": "user", "content": "hi"}]))

    assert [event["type"] for event in events] == ["start", "delta", "delta", "done"]
    assert [event.get("text") for event in events if event["type"] == "delta"] == [
        "first ",
        "second",
    ]
    assert events[-1]["content"] == "first second"
    assert events[0]["provider_id"] == "deepseek"
    assert "api_key" not in json.dumps(events)
    assert captured["payload"]["stream"] is True


def test_provider_diagnostic_reports_timing_and_masked_key_metadata() -> None:
    gateway = ProviderGateway(
        diagnostic_transport=lambda *_args: {
            "status_code": 200,
            "content_type": "text/event-stream",
            "first_byte_ms": 18,
            "total_ms": 43,
            "stream_events": 2,
            "reply": "OK",
        }
    )

    result = gateway.diagnose(provider())

    assert result == {
        "ok": True,
        "provider_id": "deepseek",
        "model": "DeepSeek-V4-Flash",
        "has_api_key": True,
        "api_key_length": len("secret-value"),
        "non_stream": {
            "status_code": 200,
            "content_type": "text/event-stream",
            "first_byte_ms": 18,
            "total_ms": 43,
            "stream_events": 2,
            "reply": "OK",
        },
        "stream": {
            "status_code": 200,
            "content_type": "text/event-stream",
            "first_byte_ms": 18,
            "total_ms": 43,
            "stream_events": 2,
            "reply": "OK",
        },
    }
    assert "secret-value" not in json.dumps(result)
