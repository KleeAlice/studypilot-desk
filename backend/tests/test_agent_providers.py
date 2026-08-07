import json
from io import BytesIO
from urllib.error import HTTPError, URLError

from backend.app.errors import AppError
from backend.app.services import agent_providers
from backend.app.services.agent_providers import ProviderConfig, ProviderGateway


def messages() -> list[dict[str, str]]:
    return [
        {"role": "system", "content": "Use StudyPilot sources."},
        {"role": "user", "content": "Explain gradient descent."},
        {"role": "assistant", "content": "Earlier answer."},
        {"role": "user", "content": "Compare it with Newton's method."},
    ]


def multimodal_messages() -> list[dict]:
    return [
        {"role": "system", "content": "Inspect the attachment."},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What is shown?"},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,aGVsbG8="},
                },
            ],
        },
    ]


def test_provider_default_is_fast_for_daily_use_while_100k_remains_selectable() -> None:
    calls = []

    def transport(url, headers, payload):
        calls.append((url, headers, payload))
        return {"choices": [{"message": {"content": "Answer"}}]}

    default_provider = ProviderConfig(
        "custom", "openai_compatible", "http://localhost:8000/v1", "model", ""
    )
    ProviderGateway(transport).complete(default_provider, messages())

    assert default_provider.max_output_tokens == 32000
    assert calls[0][2]["max_tokens"] == 32000

    selected_maximum = ProviderConfig(
        "custom", "openai_compatible", "http://localhost:8000/v1", "model", "", 100000
    )
    ProviderGateway(transport).complete(selected_maximum, messages())
    assert calls[1][2]["max_tokens"] == 100000


def test_openai_compatible_request_and_response_are_normalized() -> None:
    calls = []

    def transport(url, headers, payload):
        calls.append((url, headers, payload))
        return {"choices": [{"message": {"content": "Grounded answer"}}]}

    gateway = ProviderGateway(transport)
    answer = gateway.complete(
        ProviderConfig(
            id="deepseek",
            protocol="openai_compatible",
            base_url="https://api.deepseek.com/v1",
            model="deepseek-chat",
            api_key="secret",
            max_output_tokens=100000,
        ),
        messages(),
    )

    url, headers, payload = calls[0]
    assert answer == "Grounded answer"
    assert url == "https://api.deepseek.com/v1/chat/completions"
    assert headers["Authorization"] == "Bearer secret"
    assert payload["model"] == "deepseek-chat"
    assert payload["messages"] == messages()
    assert payload["stream"] is False
    assert payload["max_tokens"] == 100000


def test_openai_compatible_keeps_multimodal_content_parts() -> None:
    calls = []
    gateway = ProviderGateway(
        lambda url, headers, payload: calls.append((url, headers, payload))
        or {"choices": [{"message": {"content": "Image answer"}}]}
    )

    gateway.complete(
        ProviderConfig("openai", "openai_compatible", "https://api.openai.com/v1", "vision", "secret"),
        multimodal_messages(),
    )

    assert calls[0][2]["messages"][-1]["content"] == multimodal_messages()[-1]["content"]


def test_generic_openai_compatible_models_keep_a_conservative_output_limit() -> None:
    calls = []

    def transport(url, headers, payload):
        calls.append((url, headers, payload))
        return {"choices": [{"message": {"content": "Expanded answer"}}]}

    ProviderGateway(transport).complete(
        ProviderConfig(
            id="custom",
            protocol="openai_compatible",
            base_url="http://localhost:8000/v1",
            model="custom-model",
            api_key="",
            max_output_tokens=32000,
        ),
        messages(),
    )

    assert calls[0][2]["max_tokens"] == 32000


def test_anthropic_messages_request_extracts_text_blocks() -> None:
    calls = []

    def transport(url, headers, payload):
        calls.append((url, headers, payload))
        return {"content": [{"type": "text", "text": "Claude answer"}]}

    answer = ProviderGateway(transport).complete(
        ProviderConfig(
            id="anthropic",
            protocol="anthropic",
            base_url="https://api.anthropic.com",
            model="claude-sonnet-4-5",
            api_key="claude-key",
            max_output_tokens=64000,
        ),
        messages(),
    )

    url, headers, payload = calls[0]
    assert answer == "Claude answer"
    assert url == "https://api.anthropic.com/v1/messages"
    assert headers["x-api-key"] == "claude-key"
    assert headers["anthropic-version"] == "2023-06-01"
    assert payload["system"] == "Use StudyPilot sources."
    assert all(item["role"] != "system" for item in payload["messages"])
    assert payload["max_tokens"] == 64000


def test_anthropic_maps_image_urls_to_base64_source_blocks() -> None:
    calls = []
    gateway = ProviderGateway(
        lambda url, headers, payload: calls.append((url, headers, payload))
        or {"content": [{"type": "text", "text": "Image answer"}]}
    )

    gateway.complete(
        ProviderConfig("anthropic", "anthropic", "https://api.anthropic.com", "claude", "secret"),
        multimodal_messages(),
    )

    blocks = calls[0][2]["messages"][0]["content"]
    assert blocks[0] == {"type": "text", "text": "What is shown?"}
    assert blocks[1] == {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": "aGVsbG8="},
    }


def test_anthropic_messages_stream_emits_text_deltas_before_done() -> None:
    calls = []

    def stream_transport(url, headers, payload, timeouts):
        calls.append((url, headers, payload, timeouts))
        return iter([b'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude "}}\n\n', b'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"streams"}}\n\n', b'data: {"type":"message_stop"}\n\n'])

    events = list(ProviderGateway(stream_transport=stream_transport).stream(ProviderConfig("anthropic", "anthropic", "https://api.anthropic.com", "claude-sonnet-4-5", "secret"), messages()))
    assert calls[0][0] == "https://api.anthropic.com/v1/messages"
    assert calls[0][2]["stream"] is True
    assert [event["text"] for event in events if event["type"] == "delta"] == ["Claude ", "streams"]
    assert events[-1] == {"type": "done", "content": "Claude streams"}


def test_gemini_request_maps_roles_and_system_instruction() -> None:
    calls = []

    def transport(url, headers, payload):
        calls.append((url, headers, payload))
        return {
            "candidates": [
                {"content": {"parts": [{"text": "Gemini "}, {"text": "answer"}]}}
            ]
        }

    answer = ProviderGateway(transport).complete(
        ProviderConfig(
            id="gemini",
            protocol="gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta",
            model="gemini-2.5-flash",
            api_key="google-key",
            max_output_tokens=100000,
        ),
        messages(),
    )

    url, headers, payload = calls[0]
    assert answer == "Gemini answer"
    assert url.endswith("/models/gemini-2.5-flash:generateContent")
    assert headers["x-goog-api-key"] == "google-key"
    assert payload["systemInstruction"]["parts"][0]["text"] == "Use StudyPilot sources."
    assert [item["role"] for item in payload["contents"]] == ["user", "model", "user"]
    assert payload["generationConfig"]["maxOutputTokens"] == 100000


def test_gemini_maps_image_urls_to_inline_data_parts() -> None:
    calls = []
    gateway = ProviderGateway(
        lambda url, headers, payload: calls.append((url, headers, payload))
        or {"candidates": [{"content": {"parts": [{"text": "Image answer"}]}}]}
    )

    gateway.complete(
        ProviderConfig("gemini", "gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini", "secret"),
        multimodal_messages(),
    )

    assert calls[0][2]["contents"][0]["parts"] == [
        {"text": "What is shown?"},
        {"inlineData": {"mimeType": "image/png", "data": "aGVsbG8="}},
    ]


def test_gemini_stream_generate_content_emits_text_deltas_before_done() -> None:
    calls = []

    def stream_transport(url, headers, payload, timeouts):
        calls.append((url, headers, payload, timeouts))
        return iter([b'data: {"candidates":[{"content":{"parts":[{"text":"Gemini "}]}}]}\n\n', b'data: {"candidates":[{"content":{"parts":[{"text":"streams"}]},"finishReason":"STOP"}]}\n\n'])

    events = list(ProviderGateway(stream_transport=stream_transport).stream(ProviderConfig("gemini", "gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash", "secret"), messages()))
    assert calls[0][0].endswith("/models/gemini-2.5-flash:streamGenerateContent?alt=sse")
    assert calls[0][2]["generationConfig"]["maxOutputTokens"] == 32000
    assert [event["text"] for event in events if event["type"] == "delta"] == ["Gemini ", "streams"]
    assert events[-1] == {"type": "done", "content": "Gemini streams"}

def test_azure_openai_uses_api_key_header() -> None:
    calls = []

    def transport(url, headers, payload):
        calls.append((url, headers, payload))
        return {"choices": [{"message": {"content": "Azure answer"}}]}

    answer = ProviderGateway(transport).complete(
        ProviderConfig(
            id="azure",
            protocol="azure_openai",
            base_url="https://your-resource.openai.azure.com/openai/v1",
            model="gpt-5-mini",
            api_key="azure-key",
            max_output_tokens=64000,
        ),
        messages(),
    )

    url, headers, payload = calls[0]
    assert answer == "Azure answer"
    assert url == "https://your-resource.openai.azure.com/openai/v1/chat/completions"
    assert headers["api-key"] == "azure-key"
    assert "Authorization" not in headers
    assert payload["max_tokens"] == 64000


def test_provider_rejects_an_empty_or_malformed_response() -> None:
    gateway = ProviderGateway(lambda *_: {"choices": []})

    try:
        gateway.complete(
            ProviderConfig("openai", "openai_compatible", "http://localhost:11434/v1", "local", ""),
            messages(),
        )
    except AppError as error:
        assert error.code == "AGENT_PROVIDER_RESPONSE_INVALID"
    else:
        raise AssertionError("Malformed provider response must fail")


def test_provider_explains_when_an_endpoint_returns_a_web_page() -> None:
    gateway = ProviderGateway(lambda *_: "<!doctype html><title>New API</title>")

    try:
        gateway.complete(
            ProviderConfig(
                "deepseek",
                "openai_compatible",
                "http://gateway.example:32880",
                "DeepSeek-V4-Flash",
                "secret",
            ),
            messages(),
        )
    except AppError as error:
        assert error.code == "AGENT_PROVIDER_RESPONSE_INVALID"
        assert "/v1" in error.message
    else:
        raise AssertionError("HTML provider responses must explain the endpoint problem")


def test_provider_retries_a_transient_connection_reset(monkeypatch) -> None:
    calls = 0

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return json.dumps(
                {"choices": [{"message": {"content": "Recovered answer"}}]}
            ).encode("utf-8")

    def flaky_urlopen(_request, timeout):
        nonlocal calls
        calls += 1
        assert timeout == 180
        if calls == 1:
            raise URLError(ConnectionResetError(10054, "remote reset"))
        return Response()

    monkeypatch.setattr(agent_providers, "urlopen", flaky_urlopen)

    answer = ProviderGateway().complete(
        ProviderConfig(
            "deepseek",
            "openai_compatible",
            "http://gateway.example:32880/v1",
            "DeepSeek-V4-Flash",
            "secret",
        ),
        messages(),
    )

    assert answer == "Recovered answer"
    assert calls == 2


def test_provider_retries_one_upstream_http_500_before_showing_an_error(monkeypatch) -> None:
    calls = 0

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return json.dumps(
                {"choices": [{"message": {"content": "Recovered after 500"}}]}
            ).encode("utf-8")

    def flaky_urlopen(request, timeout):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise HTTPError(
                request.full_url,
                500,
                "Internal Server Error",
                {},
                BytesIO(b'{"error":"temporary overload"}'),
            )
        return Response()

    monkeypatch.setattr(agent_providers, "urlopen", flaky_urlopen)
    answer = ProviderGateway().complete(
        ProviderConfig("deepseek", "openai_compatible", "http://gateway/v1", "model", "key"),
        messages(),
    )

    assert answer == "Recovered after 500"
    assert calls == 2


def test_streaming_provider_retries_http_500_before_the_first_event(monkeypatch) -> None:
    calls = 0

    class Response:
        def __init__(self):
            self.lines = iter([
                b'data: {"choices":[{"delta":{"content":"Recovered stream"}}]}\n',
                b"data: [DONE]\n",
            ])
            self.fp = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def readline(self) -> bytes:
            return next(self.lines, b"")

    def flaky_urlopen(request, timeout):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise HTTPError(
                request.full_url,
                500,
                "Internal Server Error",
                {},
                BytesIO(b'{"error":"temporary overload"}'),
            )
        return Response()

    monkeypatch.setattr(agent_providers, "urlopen", flaky_urlopen)
    events = list(ProviderGateway().stream(
        ProviderConfig("deepseek", "openai_compatible", "http://gateway/v1", "model", "key"),
        messages(),
    ))

    assert events[-1] == {"type": "done", "content": "Recovered stream"}
    assert calls == 2


def test_provider_allows_slow_models_more_time_for_the_first_token(monkeypatch) -> None:
    observed_timeout = 0

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return json.dumps(
                {"choices": [{"message": {"content": "Slow but complete"}}]}
            ).encode("utf-8")

    def delayed_urlopen(_request, timeout):
        nonlocal observed_timeout
        observed_timeout = timeout
        return Response()

    monkeypatch.setattr(agent_providers, "urlopen", delayed_urlopen)
    answer = ProviderGateway().complete(
        ProviderConfig(
            "deepseek",
            "openai_compatible",
            "http://gateway.example:32880/v1",
            "DeepSeek-V4-Flash",
            "secret",
        ),
        messages(),
    )

    assert answer == "Slow but complete"
    assert observed_timeout >= 180


def test_openai_streaming_response_is_collected_into_one_answer(monkeypatch) -> None:
    class Response:
        headers = {"content-type": "text/event-stream"}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return (
                'data: {"choices":[{"delta":{"content":"Streaming "}}]}\n\n'
                'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n'
                "data: [DONE]\n\n"
            ).encode("utf-8")

    monkeypatch.setattr(agent_providers, "urlopen", lambda *_args, **_kwargs: Response())
    answer = ProviderGateway().complete(
        ProviderConfig("deepseek", "openai_compatible", "http://gateway/v1", "model", "key"),
        messages(),
    )

    assert answer == "Streaming answer"

def test_unlimited_output_omits_optional_token_ceiling_for_openai_and_gemini() -> None:
    openai_calls = []
    gemini_calls = []

    ProviderGateway(
        lambda url, headers, payload: openai_calls.append(payload)
        or {"choices": [{"message": {"content": "OpenAI answer"}}]}
    ).complete(
        ProviderConfig(
            "openai", "openai_compatible", "https://api.openai.com/v1",
            "gpt-test", "secret", 0,
        ),
        messages(),
    )
    ProviderGateway(
        lambda url, headers, payload: gemini_calls.append(payload)
        or {"candidates": [{"content": {"parts": [{"text": "Gemini answer"}]}}]}
    ).complete(
        ProviderConfig(
            "gemini", "gemini", "https://generativelanguage.googleapis.com/v1beta",
            "gemini-test", "secret", 0,
        ),
        messages(),
    )

    assert "max_tokens" not in openai_calls[0]
    assert "maxOutputTokens" not in gemini_calls[0]["generationConfig"]


def test_anthropic_unlimited_uses_a_protocol_compatible_large_ceiling() -> None:
    calls = []
    ProviderGateway(
        lambda url, headers, payload: calls.append(payload)
        or {"content": [{"type": "text", "text": "Claude answer"}]}
    ).complete(
        ProviderConfig(
            "anthropic", "anthropic", "https://api.anthropic.com",
            "claude-test", "secret", 0,
        ),
        messages(),
    )

    assert calls[0]["max_tokens"] == 100000


def test_unlimited_output_is_applied_to_streaming_payloads() -> None:
    openai_calls = []
    anthropic_calls = []
    gemini_calls = []

    def openai_stream(url, headers, payload, timeouts):
        openai_calls.append(payload)
        return iter([b"data: [DONE]\n\n"])

    def anthropic_stream(url, headers, payload, timeouts):
        anthropic_calls.append(payload)
        return iter([b'data: {"type":"message_stop"}\n\n'])

    def gemini_stream(url, headers, payload, timeouts):
        gemini_calls.append(payload)
        return iter(
            [
                b'data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}]}\n\n'
            ]
        )

    list(
        ProviderGateway(stream_transport=openai_stream).stream(
            ProviderConfig(
                "openai", "openai_compatible", "https://api.openai.com/v1",
                "gpt-test", "secret", 0,
            ),
            messages(),
        )
    )
    list(
        ProviderGateway(stream_transport=anthropic_stream).stream(
            ProviderConfig(
                "anthropic", "anthropic", "https://api.anthropic.com",
                "claude-test", "secret", 0,
            ),
            messages(),
        )
    )
    list(
        ProviderGateway(stream_transport=gemini_stream).stream(
            ProviderConfig(
                "gemini", "gemini", "https://generativelanguage.googleapis.com/v1beta",
                "gemini-test", "secret", 0,
            ),
            messages(),
        )
    )

    assert "max_tokens" not in openai_calls[0]


def test_streaming_provider_explains_upstream_payment_required(monkeypatch) -> None:
    def rejected(request, timeout):
        raise HTTPError(
            request.full_url,
            402,
            "Payment Required",
            {},
            BytesIO(b'{"error":"insufficient credit"}'),
        )

    monkeypatch.setattr(agent_providers, "urlopen", rejected)
    provider = ProviderConfig(
        "pro",
        "openai_compatible",
        "https://gateway.example/v1",
        "DeepSeek-V4-Pro",
        "secret",
    )

    try:
        list(ProviderGateway().stream(provider, messages()))
    except AppError as error:
        assert error.code == "AGENT_PAYMENT_REQUIRED"
        assert error.status_code == 402
        assert "余额、额度或计费状态" in error.message
    else:
        raise AssertionError("expected payment-required provider error")
