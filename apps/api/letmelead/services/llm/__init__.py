"""Pluggable LLM providers.

Every provider implements `complete_json`, which must return parsed JSON or None.
The engine never depends on a specific vendor: switch with LLM_PROVIDER.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

from ...config import settings

logger = logging.getLogger("letmelead.llm")


class LlmProvider(ABC):
    name: str

    @abstractmethod
    async def complete_json(self, system: str, user: str, max_tokens: int = 700) -> dict[str, Any] | None:
        ...

    @abstractmethod
    def available(self) -> bool:
        ...


def extract_json(text: str) -> dict[str, Any] | None:
    body = text.strip()
    if body.startswith("```"):
        body = body.split("```")[1] if len(body.split("```")) > 1 else body
        body = body.removeprefix("json").strip()
    start, end = body.find("{"), body.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(body[start : end + 1])
    except json.JSONDecodeError:
        return None


class OpenAICompatibleProvider(LlmProvider):
    name = "openai"

    def available(self) -> bool:
        return bool(settings.llm_api_key or settings.llm_provider == "ollama")

    async def complete_json(self, system: str, user: str, max_tokens: int = 700) -> dict[str, Any] | None:
        url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if settings.llm_api_key:
            headers["Authorization"] = f"Bearer {settings.llm_api_key}"
        payload = {
            "model": settings.llm_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                res = await client.post(url, headers=headers, json=payload)
            if res.status_code >= 400:
                logger.warning("llm_http_error", extra={"status": res.status_code, "body": res.text[:300]})
                return None
            data = res.json()
            return extract_json(data["choices"][0]["message"]["content"])
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            logger.warning("llm_call_failed", extra={"error": str(exc)})
            return None


class OllamaProvider(OpenAICompatibleProvider):
    name = "ollama"

    def available(self) -> bool:
        return True


class AnthropicProvider(LlmProvider):
    name = "anthropic"

    def available(self) -> bool:
        return bool(settings.llm_api_key)

    async def complete_json(self, system: str, user: str, max_tokens: int = 700) -> dict[str, Any] | None:
        url = settings.llm_base_url.rstrip("/")
        if not url.endswith("/messages"):
            url = url + "/messages"
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                res = await client.post(
                    url,
                    headers={
                        "x-api-key": settings.llm_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": settings.llm_model,
                        "max_tokens": max_tokens,
                        "system": system,
                        "messages": [{"role": "user", "content": user}],
                    },
                )
            if res.status_code >= 400:
                logger.warning("anthropic_http_error", extra={"status": res.status_code})
                return None
            blocks = res.json().get("content", [])
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
            return extract_json(text)
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("anthropic_call_failed", extra={"error": str(exc)})
            return None


class NullProvider(LlmProvider):
    name = "none"

    def available(self) -> bool:
        return False

    async def complete_json(self, system: str, user: str, max_tokens: int = 700) -> dict[str, Any] | None:
        return None


def get_llm() -> LlmProvider:
    provider = settings.llm_provider
    if provider == "openai":
        return OpenAICompatibleProvider()
    if provider == "anthropic":
        return AnthropicProvider()
    if provider == "ollama":
        return OllamaProvider()
    return NullProvider()


__all__ = ["LlmProvider", "get_llm", "extract_json", "NullProvider"]
