"""Serve the real Touchdown API with a deterministic, offline model test double.

Only the model transport is replaced. Dataset reads, tool calls, comparisons,
validation, sessions and answer rendering use the production implementation.
This command deliberately never loads .env or calls a remote provider.
"""
import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lunar_data.common import canonical
from lunar_data.openrouter import Config, OpenRouter
from lunar_data.reader import Dataset
from lunar_data.server import Application, make_server


class OfflineProvider(OpenRouter):
    def complete(self, payload, budget):
        budget.reserve(payload)
        last = payload["messages"][-1]
        if last["role"] == "tool":
            result = json.loads(last["content"])
            if "comparison" not in result:
                raise AssertionError("E2E model expected a real comparison tool result")
            ids = [result["comparison"]["evidenceId"]]
            user = next(json.loads(m["content"]) for m in reversed(payload["messages"])
                        if m["role"] == "user" and "selectedContext" in json.loads(m["content"]))
            for scenario in user["selectedContext"]["scenarios"]:
                ids += [m["evidenceId"] for m in scenario.get("metrics", [])
                        if m["metric"]["metricId"] in (
                            "sun.anyDisk.fraction", "earth.anyDisk.fraction",
                            "overlap.sunAny_earthAny.fraction", "sun.anyDisk.longestGapH")]
            message = {"role": "assistant", "content": canonical({
                "summaryKey": "scenario_comparison", "evidenceIds": ids,
                "clarificationFields": []})}
            finish = "stop"
        else:
            context = json.loads(last["content"])["selectedContext"]
            message = {"role": "assistant", "content": None, "tool_calls": [{
                "id": "offline-comparison", "type": "function",
                "function": {"name": "compare", "arguments": canonical({"scenarioIds": context["scenarioIds"]})}}]}
            finish = "tool_calls"
        response = {"id": "offline-e2e", "model": self.config.model, "provider": "offline-test-double",
                    "usage": {"cost": 0}, "choices": [{"finish_reason": finish, "message": message}]}
        budget.record(response)
        return response


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--web-root", default="touchdown/dist")
    parser.add_argument("--dataset", default="touchdown/dist/data/v1")
    args = parser.parse_args()
    config = Config(api_key="offline-test-placeholder", model="test/offline-e2e",
                    prompt_price_cap_per_million=Decimal("0.01"),
                    completion_price_cap_per_million=Decimal("0.01"))
    app = Application(Dataset(args.dataset), config, OfflineProvider(config), web_root=args.web_root, hourly_budget="5")
    server = make_server(app, port=args.port)
    print(canonical({"url": f"http://127.0.0.1:{server.server_port}", "provider": "offline-test-double"}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
