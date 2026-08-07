from __future__ import annotations

import json
import re
import socket
import time
from http.client import RemoteDisconnected
from dataclasses import dataclass
from typing import Any, Callable, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from ..errors import AppError


Transport = Callable[[str, dict[str, str], dict], dict]
StreamTransport = Callable[
    [str, dict[str, str], dict, tuple[float, float, float]], Iterator[bytes]
]
DiagnosticTransport = Callable[..., dict[str, Any]]


@dataclass(frozen=True)
class ProviderConfig:
    id: str
    protocol: str
    base_url: str
    model: str
    api_key: str
    max_output_tokens: int = 32000
    connect_timeout_seconds: float = 10
    first_byte_timeout_seconds: float = 90
    idle_timeout_seconds: float = 45


def _endpoint(base_url: str, suffix: str) -> str:
    base = base_url.rstrip("/")
    return base if base.endswith(suffix) else f"{base}{suffix}"


class ProviderGateway:
    def __init__(
        self,
        transport: Transport | None = None,
        *,
        stream_transport: StreamTransport | None = None,
        diagnostic_transport: DiagnosticTransport | None = None,
    ) -> None:
        self.transport = transport or self._request_json
        self.stream_transport = stream_transport or self._request_stream
        self.diagnostic_transport = diagnostic_transport or self._diagnostic_request

    def stream(
        self,
        provider: ProviderConfig,
        messages: list[dict[str, Any]],
        *,
        cancelled: Callable[[], bool] | None = None,
    ) -> Iterator[dict[str, Any]]:
        if not provider.base_url or not provider.model:
            raise AppError(
                "AGENT_PROVIDER_NOT_CONFIGURED",
                "Provider URL and model are required",
                422,
            )
        yield {
            "type": "start",
            "provider_id": provider.id,
            "model": provider.model,
        }
        if provider.protocol in {"anthropic", "gemini"}:
            yield from self._stream_alternate_protocol(
                provider,
                messages,
                cancelled=cancelled,
            )
            return
        if provider.protocol not in {"openai_compatible", "azure_openai"}:
            raise AppError(
                "AGENT_PROVIDER_PROTOCOL_UNSUPPORTED",
                f"不支持的模型协议：{provider.protocol}",
                422,
            )

        azure = provider.protocol == "azure_openai"
        headers = {"Content-Type": "application/json"}
        if provider.api_key:
            headers["api-key" if azure else "Authorization"] = (
                provider.api_key if azure else f"Bearer {provider.api_key}"
            )
        payload = {
            "model": provider.model,
            "messages": messages,
            "stream": True,
            **({"max_tokens": provider.max_output_tokens} if provider.max_output_tokens > 0 else {}),
            "temperature": 0.3,
        }
        timeouts = (
            provider.connect_timeout_seconds,
            provider.first_byte_timeout_seconds,
            provider.idle_timeout_seconds,
        )
        collected: list[str] = []
        buffer = ""
        try:
            chunks = self.stream_transport(
                _endpoint(provider.base_url, "/chat/completions"),
                headers,
                payload,
                timeouts,
            )
            for chunk in chunks:
                if cancelled and cancelled():
                    yield {"type": "cancelled", "content": "".join(collected)}
                    return
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    event = self._stream_event(line)
                    if event is None:
                        continue
                    if event == "[DONE]":
                        yield {"type": "done", "content": "".join(collected)}
                        return
                    collected.append(event)
                    yield {"type": "delta", "text": event}
        except AppError:
            raise
        except (TimeoutError, socket.timeout) as error:
            raise AppError(
                "AGENT_PROVIDER_IDLE_TIMEOUT",
                "The model stream stopped responding",
                504,
            ) from error
        except Exception as error:
            raise AppError(
                "AGENT_PROVIDER_STREAM_ERROR",
                "The model stream was interrupted",
                502,
                repr(error),
            ) from error
        if buffer:
            event = self._stream_event(buffer)
            if event and event != "[DONE]":
                collected.append(event)
                yield {"type": "delta", "text": event}
        yield {"type": "done", "content": "".join(collected)}

    def _stream_alternate_protocol(
        self,
        provider: ProviderConfig,
        messages: list[dict[str, Any]],
        *,
        cancelled: Callable[[], bool] | None,
    ) -> Iterator[dict[str, Any]]:
        system = "\n\n".join(
            str(item["content"]) for item in messages if item["role"] == "system"
        )
        if provider.protocol == "anthropic":
            url = _endpoint(provider.base_url, "/v1/messages")
            headers = {
                "Content-Type": "application/json",
                "x-api-key": provider.api_key,
                "anthropic-version": "2023-06-01",
            }
            payload = {
                "model": provider.model,
                "max_tokens": provider.max_output_tokens if provider.max_output_tokens > 0 else 100000,
                "system": system,
                "messages": [
                    {**item, "content": self._anthropic_content(item["content"])}
                    for item in messages
                    if item["role"] != "system"
                ],
                "stream": True,
            }
        else:
            url = (
                f"{provider.base_url.rstrip('/')}/models/"
                f"{quote(provider.model, safe='')}:streamGenerateContent?alt=sse"
            )
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": provider.api_key,
            }
            payload = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [
                    {
                        "role": "model" if item["role"] == "assistant" else "user",
                        "parts": self._gemini_parts(item["content"]),
                    }
                    for item in messages
                    if item["role"] != "system"
                ],
                "generationConfig": {
                    **({"maxOutputTokens": provider.max_output_tokens} if provider.max_output_tokens > 0 else {}),
                    "temperature": 0.3,
                },
            }
        timeouts = (
            provider.connect_timeout_seconds,
            provider.first_byte_timeout_seconds,
            provider.idle_timeout_seconds,
        )
        collected: list[str] = []
        buffer = ""
        chunks = self.stream_transport(url, headers, payload, timeouts)
        for chunk in chunks:
            if cancelled and cancelled():
                yield {"type": "cancelled", "content": "".join(collected)}
                return
            buffer += chunk.decode("utf-8", errors="replace")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                text, done = self._alternate_stream_event(line, provider.protocol)
                if text:
                    collected.append(text)
                    yield {"type": "delta", "text": text}
                if done:
                    yield {"type": "done", "content": "".join(collected)}
                    return
        if buffer:
            text, _ = self._alternate_stream_event(buffer, provider.protocol)
            if text:
                collected.append(text)
                yield {"type": "delta", "text": text}
        yield {"type": "done", "content": "".join(collected)}

    def diagnose(self, provider: ProviderConfig) -> dict[str, Any]:
        def run(streaming: bool) -> dict[str, Any]:
            try:
                return self.diagnostic_transport(provider, streaming)
            except AppError as error:
                return {
                    "status_code": error.status_code,
                    "content_type": "",
                    "first_byte_ms": None,
                    "total_ms": None,
                    "stream_events": 0,
                    "reply": "",
                    "error_class": error.code,
                }

        non_stream = run(False)
        stream = run(True)
        return {
            "ok": bool(non_stream.get("status_code") == 200)
            and bool(stream.get("status_code") == 200),
            "provider_id": provider.id,
            "model": provider.model,
            "has_api_key": bool(provider.api_key),
            "api_key_length": len(provider.api_key),
            "non_stream": non_stream,
            "stream": stream,
        }

    def complete(
        self, provider: ProviderConfig, messages: list[dict[str, Any]]
    ) -> str:
        if not provider.base_url or not provider.model:
            raise AppError(
                "AGENT_PROVIDER_NOT_CONFIGURED", "请先配置模型地址与模型名称", 422
            )
        try:
            if provider.protocol == "openai_compatible":
                response = self._openai(provider, messages, azure=False)
            elif provider.protocol == "azure_openai":
                response = self._openai(provider, messages, azure=True)
            elif provider.protocol == "anthropic":
                response = self._anthropic(provider, messages)
            elif provider.protocol == "gemini":
                response = self._gemini(provider, messages)
            else:
                raise AppError(
                    "AGENT_PROVIDER_PROTOCOL_UNSUPPORTED",
                    f"不支持的模型协议：{provider.protocol}",
                    422,
                )
            if not isinstance(response, dict):
                raise AppError(
                    "AGENT_PROVIDER_RESPONSE_INVALID",
                    "模型接口返回了网页或非 JSON 内容；请检查协议与接口地址（OpenAI-compatible 地址通常以 /v1 结尾）",
                    502,
                )
            if provider.protocol in {"openai_compatible", "azure_openai"}:
                answer = self._openai_text(response)
            elif provider.protocol == "anthropic":
                answer = "".join(
                    str(block.get("text", ""))
                    for block in response.get("content", [])
                    if block.get("type") == "text"
                ).strip()
            else:
                candidates = response.get("candidates") or []
                parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
                answer = "".join(str(part.get("text", "")) for part in parts).strip()
        except AppError:
            raise
        except (TimeoutError, socket.timeout) as error:
            raise AppError(
                "AGENT_PROVIDER_TIMEOUT", "模型服务响应超时，请稍后重试", 504
            ) from error
        except Exception as error:
            raise AppError(
                "AGENT_PROVIDER_ERROR", "模型服务暂时不可用", 502, repr(error)
            ) from error
        if not answer:
            raise AppError(
                "AGENT_PROVIDER_RESPONSE_INVALID", "模型返回了无法识别的空回复", 502
            )
        return answer

    def _openai(
        self,
        provider: ProviderConfig,
        messages: list[dict[str, Any]],
        *,
        azure: bool,
    ) -> dict:
        headers = {"Content-Type": "application/json"}
        if provider.api_key:
            if azure:
                headers["api-key"] = provider.api_key
            else:
                headers["Authorization"] = f"Bearer {provider.api_key}"
        return self.transport(
            _endpoint(provider.base_url, "/chat/completions"),
            headers,
            {
                "model": provider.model,
                "messages": messages,
                "stream": False,
                **({"max_tokens": provider.max_output_tokens} if provider.max_output_tokens > 0 else {}),
                "temperature": 0.3,
            },
        )

    def _anthropic(
        self, provider: ProviderConfig, messages: list[dict[str, Any]]
    ) -> dict:
        system = "\n\n".join(
            item["content"] for item in messages if item["role"] == "system"
        )
        conversation = [
            {
                **item,
                "content": self._anthropic_content(item["content"]),
            }
            for item in messages
            if item["role"] != "system"
        ]
        return self.transport(
            _endpoint(provider.base_url, "/v1/messages"),
            {
                "Content-Type": "application/json",
                "x-api-key": provider.api_key,
                "anthropic-version": "2023-06-01",
            },
            {
                "model": provider.model,
                "max_tokens": provider.max_output_tokens if provider.max_output_tokens > 0 else 100000,
                "system": system,
                "messages": conversation,
            },
        )

    def _gemini(
        self, provider: ProviderConfig, messages: list[dict[str, Any]]
    ) -> dict:
        system = "\n\n".join(
            item["content"] for item in messages if item["role"] == "system"
        )
        contents = [
            {
                "role": "model" if item["role"] == "assistant" else "user",
                "parts": self._gemini_parts(item["content"]),
            }
            for item in messages
            if item["role"] != "system"
        ]
        return self.transport(
            f"{provider.base_url.rstrip('/')}/models/{quote(provider.model, safe='')}:generateContent",
            {
                "Content-Type": "application/json",
                "x-goog-api-key": provider.api_key,
            },
            {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": contents,
                "generationConfig": {
                    **({"maxOutputTokens": provider.max_output_tokens} if provider.max_output_tokens > 0 else {}),
                    "temperature": 0.3,
                },
            },
        )

    @staticmethod
    def _data_url(value: str) -> tuple[str, str] | None:
        match = re.fullmatch(r"data:([^;,]+);base64,(.+)", value, re.DOTALL)
        return (match.group(1), match.group(2)) if match else None

    @classmethod
    def _anthropic_content(cls, content: Any) -> Any:
        if not isinstance(content, list):
            return content
        blocks: list[dict[str, Any]] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text":
                blocks.append({"type": "text", "text": str(part.get("text") or "")})
                continue
            url = str((part.get("image_url") or {}).get("url") or "")
            decoded = cls._data_url(url)
            if decoded:
                media_type, data = decoded
                blocks.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        },
                    }
                )
        return blocks

    @classmethod
    def _gemini_parts(cls, content: Any) -> list[dict[str, Any]]:
        if not isinstance(content, list):
            return [{"text": str(content)}]
        parts: list[dict[str, Any]] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text":
                parts.append({"text": str(part.get("text") or "")})
                continue
            url = str((part.get("image_url") or {}).get("url") or "")
            decoded = cls._data_url(url)
            if decoded:
                media_type, data = decoded
                parts.append({"inlineData": {"mimeType": media_type, "data": data}})
        return parts

    @staticmethod
    def _openai_text(response: dict) -> str:
        choices = response.get("choices") or []
        if not choices:
            return ""
        content = choices[0].get("message", {}).get("content", "")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            return "".join(
                str(part.get("text", ""))
                for part in content
                if isinstance(part, dict)
            ).strip()
        return ""

    @staticmethod
    def _stream_event(line: str) -> str | None:
        line = line.strip()
        if not line.startswith("data:"):
            return None
        payload = line[5:].strip()
        if not payload:
            return None
        if payload == "[DONE]":
            return payload
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            return None
        if not isinstance(event, dict):
            return None
        choices = event.get("choices") or []
        if not choices or not isinstance(choices[0], dict):
            return None
        delta = choices[0].get("delta") or {}
        content = delta.get("content") if isinstance(delta, dict) else ""
        if isinstance(content, str):
            return content or None
        if isinstance(content, list):
            text = "".join(
                str(part.get("text", ""))
                for part in content
                if isinstance(part, dict)
            )
            return text or None
        return None

    @staticmethod
    def _alternate_stream_event(line: str, protocol: str) -> tuple[str, bool]:
        line = line.strip()
        if not line.startswith("data:"):
            return "", False
        payload = line[5:].strip()
        if not payload:
            return "", False
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            return "", False
        if not isinstance(event, dict):
            return "", False
        if protocol == "anthropic":
            if event.get("type") == "message_stop":
                return "", True
            delta = event.get("delta") or {}
            return (
                str(delta.get("text") or "") if isinstance(delta, dict) else "",
                False,
            )
        candidates = event.get("candidates") or []
        candidate = candidates[0] if candidates and isinstance(candidates[0], dict) else {}
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(
            str(part.get("text") or "")
            for part in parts
            if isinstance(part, dict)
        )
        return text, bool(candidate.get("finishReason"))

    @staticmethod
    def _request_stream(
        url: str,
        headers: dict[str, str],
        payload: dict,
        timeouts: tuple[float, float, float],
    ) -> Iterator[bytes]:
        connect_timeout, first_byte_timeout, idle_timeout = timeouts
        request = Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        attempts = 2
        for attempt in range(attempts):
            try:
                with urlopen(request, timeout=connect_timeout) as response:
                    try:
                        sock = response.fp.raw._sock
                        sock.settimeout(first_byte_timeout)
                    except (AttributeError, OSError):
                        sock = None
                    first = True
                    while True:
                        chunk = response.readline()
                        if not chunk:
                            break
                        if first and sock is not None:
                            sock.settimeout(idle_timeout)
                        first = False
                        yield chunk
                    return
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")[:2000]
                if error.code in (401, 403):
                    raise AppError(
                        "AGENT_AUTH_FAILED", "The provider rejected the API key", 502
                    ) from error
                if error.code == 402:
                    raise AppError(
                        "AGENT_PAYMENT_REQUIRED",
                        "模型服务拒绝请求（HTTP 402）：请检查该服务账户的余额、额度或计费状态",
                        402,
                        detail,
                    ) from error
                if error.code == 429:
                    raise AppError(
                        "AGENT_RATE_LIMITED", "The provider rate limit was reached", 429
                    ) from error
                if error.code in {500, 502, 503, 504} and attempt + 1 < attempts:
                    time.sleep(0.2)
                    continue
                raise AppError(
                    "AGENT_PROVIDER_ERROR",
                    f"The provider returned HTTP {error.code}",
                    502,
                    detail,
                ) from error
            except (URLError, ConnectionError, RemoteDisconnected) as error:
                reason = getattr(error, "reason", error)
                if isinstance(reason, (TimeoutError, socket.timeout)):
                    raise AppError(
                        "AGENT_PROVIDER_CONNECT_TIMEOUT",
                        "The provider connection timed out",
                        504,
                    ) from error
                raise AppError(
                    "AGENT_PROVIDER_UNREACHABLE",
                    "The provider could not be reached",
                    502,
                ) from error
            except (TimeoutError, socket.timeout) as error:
                raise AppError(
                    "AGENT_PROVIDER_FIRST_BYTE_TIMEOUT",
                    "The provider did not send data before the timeout",
                    504,
                ) from error

    def _diagnostic_request(
        self, provider: ProviderConfig, streaming: bool
    ) -> dict[str, Any]:
        started = time.perf_counter()
        messages = [{"role": "user", "content": "Reply exactly OK."}]
        if streaming:
            events = list(self.stream(provider, messages))
            deltas = [str(event.get("text") or "") for event in events if event["type"] == "delta"]
            reply = "".join(deltas)
            stream_events = len(deltas)
            content_type = "text/event-stream"
        else:
            azure = provider.protocol == "azure_openai"
            headers = {"Content-Type": "application/json"}
            if provider.api_key:
                headers["api-key" if azure else "Authorization"] = (
                    provider.api_key if azure else f"Bearer {provider.api_key}"
                )
            response = self.transport(
                _endpoint(provider.base_url, "/chat/completions"),
                headers,
                {
                    "model": provider.model,
                    "messages": messages,
                    "stream": False,
                    "max_tokens": 32 if provider.max_output_tokens <= 0 else min(provider.max_output_tokens, 32),
                    "temperature": 0,
                },
            )
            reply = self._openai_text(response)
            stream_events = 0
            content_type = "application/json"
        elapsed = round((time.perf_counter() - started) * 1000)
        return {
            "status_code": 200,
            "content_type": content_type,
            "first_byte_ms": elapsed,
            "total_ms": elapsed,
            "stream_events": stream_events,
            "reply": reply,
        }

    @staticmethod
    def _request_json(url: str, headers: dict[str, str], payload: dict) -> dict:
        request = Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        attempts = 2
        for attempt in range(attempts):
            try:
                with urlopen(request, timeout=180) as response:
                    return ProviderGateway._decode_response(response.read())
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")[:2000]
                if error.code in (401, 403):
                    raise AppError(
                        "AGENT_AUTH_FAILED", "模型 API 密钥无效或无访问权限", 502
                    ) from error
                if error.code == 402:
                    raise AppError(
                        "AGENT_PAYMENT_REQUIRED",
                        "模型服务拒绝请求（HTTP 402）：请检查该服务账户的余额、额度或计费状态",
                        402,
                        detail,
                    ) from error
                if error.code == 429:
                    raise AppError(
                        "AGENT_RATE_LIMITED", "模型服务请求过于频繁，请稍后重试", 429
                    ) from error
                if error.code in {500, 502, 503, 504} and attempt + 1 < attempts:
                    time.sleep(0.2)
                    continue
                raise AppError(
                    "AGENT_PROVIDER_ERROR",
                    f"模型服务返回错误（{error.code}）",
                    502,
                    detail,
                ) from error
            except (URLError, ConnectionError, RemoteDisconnected, TimeoutError, socket.timeout) as error:
                reason = getattr(error, "reason", error)
                if isinstance(reason, (TimeoutError, socket.timeout)):
                    raise AppError(
                        "AGENT_PROVIDER_TIMEOUT", "模型服务响应超时，请稍后重试", 504
                    ) from error
                if attempt + 1 < attempts:
                    time.sleep(0.2)
                    continue
                raise AppError(
                    "AGENT_PROVIDER_UNREACHABLE",
                    "模型连接被远端中断或网络暂时不可用；已自动重试，请稍后再试",
                    502,
                ) from error
        raise AppError("AGENT_PROVIDER_UNREACHABLE", "模型服务暂时不可用", 502)

    @staticmethod
    def _decode_response(raw: bytes) -> dict:
        text = raw.decode("utf-8", errors="replace")
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {"data": parsed}
        except json.JSONDecodeError:
            pass

        chunks: list[str] = []
        final_response: dict | None = None
        for line in text.splitlines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload or payload == "[DONE]":
                continue
            try:
                event = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue
            final_response = event
            choices = event.get("choices") or []
            if not choices or not isinstance(choices[0], dict):
                continue
            delta = choices[0].get("delta") or {}
            content = delta.get("content") if isinstance(delta, dict) else ""
            if isinstance(content, str):
                chunks.append(content)
            elif isinstance(content, list):
                chunks.extend(
                    str(part.get("text", ""))
                    for part in content
                    if isinstance(part, dict)
                )
        if chunks:
            return {"choices": [{"message": {"content": "".join(chunks)}}]}
        if final_response is not None:
            return final_response
        raise ValueError("model response is neither JSON nor OpenAI SSE")
