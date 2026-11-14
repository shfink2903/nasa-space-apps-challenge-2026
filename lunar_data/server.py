"""Local API for the OpenRouter agent; API credentials stay out of the browser."""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import secrets
import threading
import time
from collections import OrderedDict, deque
from copy import deepcopy
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .agent import Agent, parse_json
from .common import DataError, canonical, identity, sha256
from .compare import validate_comparison_request
from .openrouter import Config, load_env
from .reader import Dataset


class Application:
    def __init__(self, dataset, config=None, client=None, web_root=None, hourly_budget=None):
        self.dataset = dataset
        self.config = config or Config.from_env()
        self.agent = Agent(dataset, self.config, client)
        self.web_root = Path(web_root).resolve() if web_root else None
        self.lock = threading.Lock()
        self.busy = threading.BoundedSemaphore(2)
        self.sessions = OrderedDict()
        self.cache = OrderedDict()
        self.spend = deque()
        self.hourly_budget = Decimal(hourly_budget if hourly_budget is not None else os.environ.get("LUNAR_AI_HOURLY_COST_USD", "0.50"))
        self.manifest_hash = sha256(dataset.root / "manifest.json")
        self.allowed_origins = set(filter(None, os.environ.get("LUNAR_AI_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://127.0.0.1:5180,http://localhost:8001,http://127.0.0.1:8001").split(",")))
        self.allowed_hosts = {"localhost", "127.0.0.1", "[::1]"}

    def health(self):
        return {"status": "ok", "provider": "OpenRouter", "ai": self.config.public(),
                "datasetVersion": self.dataset.manifest["datasetVersion"], "datasetManifestSha256": self.manifest_hash,
                "tools": ["list_sites", "get_scenario", "compare", "get_sensitivity", "get_evidence"]}

    def compare(self, request):
        parameters = validate_comparison_request(request)
        return self.dataset.compare(**parameters)["data"]

    def chat(self, request):
        if not isinstance(request, dict) or not set(request) <= {"message", "context", "sessionId", "constraints", "locale"}:
            raise DataError("invalid_request", "body")
        if not isinstance(request.get("message"), str) or not 1 <= len(request["message"].strip()) <= 4000:
            raise DataError("invalid_request", "message")
        locale = request.get("locale", "fr")
        if locale not in ("en", "fr"):
            raise DataError("invalid_request", "locale", "en or fr required")
        session_id = request.get("sessionId")
        with self.lock:
            now = time.monotonic()
            for sid in list(self.sessions):
                if now - self.sessions[sid]["updated"] > 1800:
                    del self.sessions[sid]
            if session_id is not None and (not isinstance(session_id, str) or session_id not in self.sessions):
                raise DataError("unknown_session", "sessionId", "start a new conversation")
            session_id = session_id or secrets.token_urlsafe(24)
            state = self.sessions.setdefault(session_id, {"history": [], "updated": now, "busy": False, "comparisons": {}, "constraints": []})
            if state["busy"]:
                raise DataError("session_busy")
            state["busy"] = True
            history = deepcopy(state["history"])
            constraints = deepcopy(request.get("constraints", state["constraints"]))
            comparisons = deepcopy(state["comparisons"])
            while len(self.sessions) > 128:
                candidate = next((sid for sid, s in self.sessions.items() if not s["busy"]), None)
                if candidate is None:
                    break
                del self.sessions[candidate]
        if not self.busy.acquire(blocking=False):
            with self.lock:
                state["busy"] = False
            raise DataError("server_busy")
        reservation = None
        try:
            key = identity({"message": request["message"], "context": request.get("context"), "constraints": constraints,
                            "history": history, "dataset": self.manifest_hash, "config": self.config.public(), "locale": locale, "template": "agent-planner-v2"}, 64)
            with self.lock:
                cached = self.cache.get(key)
                if cached and now - cached["created"] < 900:
                    result = deepcopy(cached["result"])
                    result["cached"] = True
                else:
                    result = None
                    while self.spend and now - self.spend[0][0] > 3600:
                        self.spend.popleft()
                    if self.config.ready:
                        total = sum(amount for _, amount in self.spend)
                        if total + self.config.max_cost_usd > self.hourly_budget:
                            raise DataError("hourly_budget_exceeded")
                        reservation = (now, self.config.max_cost_usd)
                        self.spend.append(reservation)
            if result is None:
                result = self.agent.run(request["message"], request.get("context"), history, constraints, comparisons, locale=locale)
                result["cached"] = False
                if result["explanationStatus"] == "available":
                    with self.lock:
                        self.cache[key] = {"created": now, "result": deepcopy(result)}
                        while len(self.cache) > 64:
                            self.cache.popitem(last=False)
            result["sessionId"] = session_id
            with self.lock:
                # Preserve the explored scenarios as service-generated history, not
                # unvalidated model prose or client-supplied role messages.
                assistant_history = canonical({"message": result["message"], "status": result.get("status"),
                                               "comparisonIds": [p["comparison"]["comparisonId"] for p in result.get("evidence", []) if p["kind"] == "comparison"],
                                               "scenarios": [{"siteId": s["siteId"], "request": s["request"]} for s in result.get("scenarios", [])]})
                state["constraints"] = constraints
                for proof in result.get("evidence", []):
                    if proof["kind"] == "comparison":
                        state["comparisons"][proof["comparison"]["comparisonId"]] = deepcopy(proof["comparison"])
                while len(state["comparisons"]) > 16:
                    del state["comparisons"][next(iter(state["comparisons"]))]
                state["history"] = (history + [{"role": "user", "content": request["message"]},
                                               {"role": "assistant", "content": assistant_history[:5000]}])[-12:]
                state["updated"] = time.monotonic()
            return result
        finally:
            # Hourly reservations are conservative, including failed or ambiguous
            # requests; no optimistic refund of potentially billed provider work.
            with self.lock:
                state["busy"] = False
            self.busy.release()


def make_server(app, host="127.0.0.1", port=8001):
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise DataError("invalid_configuration", "host", "local server must bind to loopback")

    class Handler(BaseHTTPRequestHandler):
        server_version = "LunarDataAPI/1"

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, format, *args):
            # No request bodies, queries, prompts, provider responses or headers.
            pass

        def send_json(self, code, value):
            raw = canonical(value).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            try:
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def trusted(self):
            host = self.headers.get("Host", "")
            name = host.rsplit(":", 1)[0] if ":" in host else host
            if name not in app.allowed_hosts:
                return False
            origin = self.headers.get("Origin")
            return origin is None or origin in app.allowed_origins or origin in (f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}")

        def do_GET(self):
            if not self.trusted():
                return self.send_json(403, {"error": {"code": "origin_rejected"}})
            path = urlsplit(self.path).path
            if path == "/api/health":
                return self.send_json(200, app.health())
            if path.startswith("/api/"):
                return self.send_json(404, {"error": {"code": "not_found"}})
            # Expose only the prepared bundle or an explicit built frontend, never
            # the repository root, .env, source files or raw scientific inputs.
            if path.startswith("/data/v1/"):
                base = app.dataset.root.resolve()
                relative = unquote(path[len("/data/v1/"):])
                if relative.endswith(".json.gz.bin"):
                    relative = relative[:-4]  # Browser fetches compressed bytes without transparent gzip decoding.
            elif app.web_root:
                base, relative = app.web_root, unquote(path).lstrip("/") or "index.html"
            else:
                return self.send_json(404, {"error": {"code": "frontend_not_built"}})
            target = (base / relative).resolve()
            if not target.is_relative_to(base) or any(part.startswith(".") for part in Path(relative).parts) or not target.is_file():
                return self.send_json(404, {"error": {"code": "not_found"}})
            if base == app.dataset.root.resolve() and relative != "manifest.json" and relative not in app.dataset.files:
                return self.send_json(404, {"error": {"code": "not_found"}})
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target)[0] or "application/octet-stream")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_POST(self):
            if not self.trusted():
                return self.send_json(403, {"error": {"code": "origin_rejected"}})
            path = urlsplit(self.path).path
            if path not in ("/api/ai/chat", "/api/compare"):
                return self.send_json(404, {"error": {"code": "not_found"}})
            if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
                return self.send_json(415, {"error": {"code": "json_required"}})
            try:
                size = int(self.headers.get("Content-Length", "-1"))
                if not 0 < size <= 32768:
                    return self.send_json(413, {"error": {"code": "request_size_limit"}})
                raw = self.rfile.read(size)
                if len(raw) != size:
                    raise DataError("invalid_request", "body")
                body = parse_json(raw.decode("utf-8"))
                result = app.compare(body) if path == "/api/compare" else app.chat(body)
                return self.send_json(200, result)
            except DataError as exc:
                code = 429 if exc.code in ("server_busy", "session_busy", "hourly_budget_exceeded") else 400
                return self.send_json(code, {"error": exc.as_dict()})
            except (ValueError, UnicodeError, TimeoutError):
                return self.send_json(400, {"error": {"code": "invalid_request"}})
            except Exception:
                return self.send_json(500, {"error": {"code": "internal_error"}})

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--dataset", default="data/processed/v1")
    parser.add_argument("--web-root", default="touchdown/dist")
    parser.add_argument("--env-file", default=".env")
    args = parser.parse_args()
    load_env(args.env_file)
    app = Application(Dataset(args.dataset), web_root=args.web_root)
    server = make_server(app, args.host, args.port)
    print(f"Lunar AI server: http://{args.host}:{server.server_port} | configured={app.config.ready}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
