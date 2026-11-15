"""OpenRouter transport, explicit configuration and conservative request budgets."""
from __future__ import annotations

import json
import os
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

import certifi

from .common import DataError, canonical

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"


def load_env(path=".env"):
    """Small non-executing dotenv loader. Existing process configuration wins."""
    path = Path(path)
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip().removeprefix("export ")
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name, value = name.strip(), value.strip()
        if not name.startswith(("OPENROUTER_", "LUNAR_AI_")):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        os.environ.setdefault(name, value)


def decimal(value, field):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or result < 0:
            raise ValueError
        return result
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise DataError("invalid_configuration", field, "non-negative finite decimal required") from exc


@dataclass(frozen=True)
class Config:
    # Technical limits, not mission criteria. Never choose a model implicitly.
    model: str = ""
    api_key: str = field(default="", repr=False)
    max_turns: int = 6
    max_tool_calls: int = 12
    max_input_tokens: int = 64000
    max_output_tokens: int = 1600
    max_cost_usd: Decimal = Decimal("0.05")
    prompt_price_cap_per_million: Decimal = Decimal("0.50")
    completion_price_cap_per_million: Decimal = Decimal("2.00")
    timeout_s: float = 30.
    max_retries: int = 1
    provider: str = ""

    @classmethod
    def from_env(cls):
        def integer(name, default, low, high):
            try:
                value = int(os.environ.get(name, default))
            except ValueError as exc:
                raise DataError("invalid_configuration", name) from exc
            if not low <= value <= high:
                raise DataError("invalid_configuration", name)
            return value
        return cls(model=os.environ.get("OPENROUTER_MODEL", ""), api_key=os.environ.get("OPENROUTER_API_KEY", ""),
                   max_turns=integer("LUNAR_AI_MAX_TURNS", 6, 1, 12),
                   max_tool_calls=integer("LUNAR_AI_MAX_TOOL_CALLS", 12, 1, 30),
                   max_input_tokens=integer("LUNAR_AI_MAX_INPUT_TOKENS", 64000, 1000, 128000),
                   max_output_tokens=integer("LUNAR_AI_MAX_OUTPUT_TOKENS", 1600, 100, 8000),
                   max_cost_usd=decimal(os.environ.get("LUNAR_AI_MAX_COST_USD", ".05"), "max_cost_usd"),
                   prompt_price_cap_per_million=decimal(os.environ.get("LUNAR_AI_PROMPT_PRICE_CAP", ".50"), "prompt_price_cap"),
                   completion_price_cap_per_million=decimal(os.environ.get("LUNAR_AI_COMPLETION_PRICE_CAP", "2"), "completion_price_cap"),
                   timeout_s=float(integer("LUNAR_AI_TIMEOUT_S", 30, 1, 30)),
                   max_retries=integer("LUNAR_AI_MAX_RETRIES", 1, 0, 1), provider=os.environ.get("OPENROUTER_PROVIDER", ""))

    @property
    def ready(self):
        return bool(self.model and self.api_key)

    def public(self):
        return {"configured": self.ready, "model": self.model or None, "provider": self.provider or None,
                "maxTurns": self.max_turns, "maxToolCalls": self.max_tool_calls, "maxCostUsd": str(self.max_cost_usd),
                "maxInputTokens": self.max_input_tokens, "maxOutputTokens": self.max_output_tokens,
                "timeoutS": self.timeout_s, "fallbacksEnabled": False}


class Budget:
    def __init__(self, config):
        self.config = config
        self.reserved = Decimal(0)
        self.observed = Decimal(0)
        self.usage_missing = False
        self.calls = 0
        self.recorded_calls = 0

    def reserve(self, payload):
        text = canonical({k: payload[k] for k in ("messages", "tools", "response_format") if k in payload})
        # No tokenizer vocabulary download during runtime or offline tests.
        # This is a conservative byte-based allowance, not a provider token count.
        tokens = len(text.encode()) + 4096
        if tokens > self.config.max_input_tokens:
            raise DataError("input_budget_exceeded", "context", {"tokenUpperAllowance": tokens, "method": "utf8_bytes_plus_framing"})
        # UTF-8 bytes + message/schema framing is a conservative plain-text token
        # allowance; route price caps bound cost, rather than a model's minimum price.
        allowance = len(text.encode()) + 4096
        amount = (Decimal(allowance) * self.config.prompt_price_cap_per_million +
                  Decimal(self.config.max_output_tokens) * self.config.completion_price_cap_per_million) / Decimal(1_000_000)
        if self.reserved + amount > self.config.max_cost_usd:
            raise DataError("cost_budget_exceeded", "request", {"limitUsd": str(self.config.max_cost_usd)})
        self.reserved += amount
        self.calls += 1
        return amount

    def record(self, response):
        usage = response.get("usage")
        cost = usage.get("cost") if isinstance(usage, dict) else None
        if cost is None:
            self.usage_missing = True
        else:
            self.observed += decimal(cost, "usage.cost")
        self.recorded_calls += 1
        if self.observed > self.config.max_cost_usd:
            raise DataError("reported_cost_exceeded", "usage.cost")

    def report(self):
        usage_missing = self.usage_missing or self.recorded_calls != self.calls
        return {"calls": self.calls, "reservedUpperEstimateUsd": str(self.reserved),
                "observedCostUsd": None if usage_missing else str(self.observed),
                "observedCostReason": "provider_usage_missing" if usage_missing else None,
                "limitUsd": str(self.config.max_cost_usd), "inputAllowanceMethod": "utf8_bytes_plus_framing"}


class OpenRouter:
    def __init__(self, config, opener=None, sleeper=time.sleep):
        self.config = config
        self.opener = opener or urllib.request.urlopen
        self.sleeper = sleeper

    def _http_error_detail(self, error):
        """Expose bounded diagnostic fields, never raw bodies, headers or URLs."""
        detail = {"status": error.code}

        def clean(value, limit):
            if not isinstance(value, str):
                return None
            if self.config.api_key:
                value = value.replace(self.config.api_key, "[REDACTED]")
            return "".join(c for c in value if c.isprintable())[:limit]

        def fields(value):
            if not isinstance(value, dict):
                return {}
            result = {}
            message = clean(value.get("message"), 500)
            if message:
                result["message"] = message
            code = value.get("code")
            if isinstance(code, int) and not isinstance(code, bool) and -1_000_000_000 <= code <= 1_000_000_000:
                result["code"] = code
            elif isinstance(code, str):
                result["code"] = clean(code, 100)
            return result

        try:
            raw = error.read(16385)
            if len(raw) > 16384:
                return detail
            body = json.loads(raw, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
            reported = body.get("error") if isinstance(body, dict) else None
            detail.update(fields(reported))
            metadata = reported.get("metadata") if isinstance(reported, dict) else None
            if isinstance(metadata, dict):
                provider = clean(metadata.get("provider_name"), 120)
                if provider:
                    detail["provider_name"] = provider
                provider_raw = metadata.get("raw")
                if isinstance(provider_raw, str):
                    try:
                        provider_body = json.loads(provider_raw, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
                    except (ValueError, TypeError, RecursionError):
                        provider_body = None
                    provider_error = fields(provider_body.get("error") if isinstance(provider_body, dict) else None)
                    if provider_error:
                        detail["provider_error"] = provider_error
        except (OSError, ValueError, TypeError, AttributeError, RecursionError):
            pass
        return detail

    def payload(self, messages, tools, response_schema, tool_choice="auto"):
        provider = {"require_parameters": True, "allow_fallbacks": False,
                    "max_price": {"prompt": float(self.config.prompt_price_cap_per_million),
                                  "completion": float(self.config.completion_price_cap_per_million)}}
        if self.config.provider:
            provider["only"] = [self.config.provider]
        payload = {"model": self.config.model, "messages": messages, "tools": tools, "tool_choice": tool_choice,
                   "provider": provider, "temperature": 0, "max_tokens": self.config.max_output_tokens,
                   "usage": {"include": True}}
        if tool_choice != "required" and not isinstance(tool_choice, dict):
            # Forced-tool turns produce arguments checked against the tool's
            # schema. Apply the final-answer schema only when text is permitted.
            payload["response_format"] = {"type": "json_schema", "json_schema": {
                "name": "lunar_answer", "strict": True, "schema": response_schema}}
        if tools and self.config.model.startswith("deepseek/deepseek-v4"):
            # V4 enables thinking by default, which rejects required/named tool
            # choices. Keep one explicit mode throughout this tool loop. This
            # does not apply to R1 or other reasoning-only model families.
            # https://api-docs.deepseek.com/api/create-chat-completion/
            payload["reasoning"] = {"enabled": False}
        return payload

    def complete(self, payload, budget):
        if not self.config.ready:
            raise DataError("missing_server_configuration", "OpenRouter", "explicit model and server API key required")
        for attempt in range(self.config.max_retries + 1):
            budget.reserve(payload)  # Reserve again for a retried request; never assume it is free.
            request = urllib.request.Request(ENDPOINT, data=canonical(payload).encode(), headers={
                "Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json",
                "X-OpenRouter-Title": "True Larpers Lunar Navigator"})
            try:
                with self.opener(request, timeout=self.config.timeout_s,
                                 context=ssl.create_default_context(cafile=certifi.where())) as response:
                    raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise DataError("provider_response_too_large")
                result = json.loads(raw, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
                if not isinstance(result, dict) or result.get("error") or not result.get("choices"):
                    raise DataError("provider_invalid_response")
                budget.record(result)
                return result
            except urllib.error.HTTPError as exc:
                budget.usage_missing = True
                if exc.code in (429, 503) and attempt < self.config.max_retries:
                    try:
                        retry_after = max(0., float(exc.headers.get("Retry-After", "1")))
                    except (ValueError, TypeError):
                        retry_after = 1.
                    if retry_after <= 3:
                        self.sleeper(retry_after)
                        continue
                raise DataError("provider_http_error", "OpenRouter", self._http_error_detail(exc)) from None
            except (TimeoutError, OSError, ValueError, KeyError) as exc:
                budget.usage_missing = True
                # Ambiguous network failures are not retried: the first call may be billed.
                raise DataError("provider_unavailable", "OpenRouter", type(exc).__name__) from None
        raise AssertionError("unreachable")
