"""Stable identities, strict JSON, and explicit errors shared by the pipeline."""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from . import SCHEMA_VERSION


class DataError(ValueError):
    def __init__(self, code, field=None, detail=None):
        self.code, self.field, self.detail = code, field, detail
        super().__init__(f"{code}: {field}: {detail}")

    def as_dict(self):
        return {"code": self.code, "field": self.field, "detail": self.detail}


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def identity(value, length=12):
    return hashlib.sha256(canonical(value).encode()).hexdigest()[:length]


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Serialize before opening: a non-finite number must not damage a previous file.
    encoded = canonical(value) + "\n"
    with path.open("x", encoding="utf-8") as f:
        f.write(encoded)


def read_json(path):
    def invalid(token):
        raise DataError("invalid_json", str(path), token)
    with Path(path).open(encoding="utf-8") as f:
        return json.load(f, parse_constant=invalid)


def check_schema(value):
    if str(value.get("schemaVersion", "")).split(".")[0] != SCHEMA_VERSION.split(".")[0]:
        raise DataError("unsupported_schema", "schemaVersion", value.get("schemaVersion"))


def finite(value, field, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise DataError("invalid_request", field, "finite number required")
    if minimum is not None and value < minimum or maximum is not None and value > maximum:
        raise DataError("invalid_request", field, "outside permitted range")
    return value


def parameter(value, unit, origin="team_default_hackathon"):
    return {"value": value, "unit": unit, "origin": origin}


def reason(code, detail=None):
    return {"code": code, "detail": detail}
