"""Explicit preparation commands; inspect/verify are offline."""
import argparse
import json
import sys

from .common import DataError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    acquire = sub.add_parser("acquire")
    acquire.add_argument("--raw", default="data/raw")
    acquire.add_argument("--terrain", action="store_true")
    build = sub.add_parser("build")
    build.add_argument("--output", default="data/processed/v1")
    build.add_argument("--raw", default="data/raw")
    build.add_argument("--cache", default="data/interim")
    build.add_argument("--starts", type=int, default=52)
    build.add_argument("--geometric-only", action="store_true")
    build.add_argument("--heights", type=float, nargs="+", default=[2., 10.])
    build.add_argument("--sites", nargs="+")
    build.add_argument("--parent")
    build.add_argument("--sensitivity", action="store_true")
    for cmd in ("verify", "inspect"):
        p = sub.add_parser(cmd)
        p.add_argument("dataset", nargs="?", default="data/processed/v1")
    validate = sub.add_parser("validate-science")
    validate.add_argument("--raw", default="data/raw")
    validate.add_argument("--output", default="docs/validation/scientific-v1.json")
    validate.add_argument("--terrain", action="store_true")
    validate.add_argument("--live-horizons", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "acquire":
            from .sources import acquire as run
            result = run(args.raw, args.terrain)
        elif args.command == "build":
            from .pipeline import build as run
            result = run(args.output, args.raw, args.cache, args.starts, not args.geometric_only, args.heights, args.sites, args.parent, args.sensitivity)
        elif args.command == "verify":
            from .pipeline import verify
            result = verify(args.dataset)
        elif args.command == "inspect":
            from .reader import Dataset
            result = Dataset(args.dataset).list_sites()
        elif args.command == "validate-science":
            from .validation import validate
            result = validate(args.raw, args.output, args.terrain, args.live_horizons)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))
    except DataError as exc:
        print(json.dumps({"error": exc.as_dict()}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
