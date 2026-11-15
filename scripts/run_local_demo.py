#!/usr/bin/env python3
"""Launch an already-built, verified local demo. Never download or build anything."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8012)
    args = parser.parse_args()
    version = os.environ.get("LUNAR_DATASET_VERSION", "v1")
    builds = {"v1": "dist-v1-backup", "v1.1-relief-30d": "dist-relief-30d", "v1.1-relief-year": "dist-relief"}
    if version not in builds:
        parser.error(f"No prepared demo for {version!r}")
    dataset = ROOT / "data/processed" / version
    web = ROOT / "touchdown" / builds[version]
    try:
        marker = json.loads((web / "dataset-version.json").read_text())
        digest = hashlib.sha256((dataset / "manifest.json").read_bytes()).hexdigest()
        if marker != {"datasetVersion": version, "datasetManifestSha256": digest}:
            raise ValueError("Build and source dataset differ")
        derived = json.loads((web / "derived" / f"{version}.json").read_text())
        if derived["datasetVersion"] != version or derived["datasetManifestSha256"] != digest:
            raise ValueError("Compact index and source dataset differ")
        if version != "v1":
            report = json.loads((web / "relief-numerical-checks.json").read_text())
            if report["numericalAcceptance"] != "accepted" or len(report["tests"]) != 18 or not all(t["pass"] for t in report["tests"]):
                raise ValueError("Numerical checks have not passed")
    except (OSError, ValueError, KeyError) as error:
        parser.error(f"Demo unavailable: {error}")
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    sys.argv = ["lunar_data.server", "--dataset", str(dataset), "--web-root", str(web), "--host", "127.0.0.1", "--port", str(args.port)]
    print(f"Local demo: http://127.0.0.1:{args.port} — {version}", flush=True)
    from lunar_data.server import main as serve
    serve()


if __name__ == "__main__":
    main()
