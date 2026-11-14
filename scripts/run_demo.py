"""Launch the prepared local demo without copying any credentials."""
from __future__ import annotations

import argparse
import os
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--env-file", type=Path, default=root / ".env",
                        help="Read server-side configuration from this file; never copied into web assets.")
    args = parser.parse_args()
    python = root / ".venv/bin/python"
    if not python.is_file():
        parser.error("Create .venv and install requirements.lock first.")
    if not (root / "touchdown/dist/index.html").is_file():
        parser.error("Prepare assets and run npm run build in touchdown/ first.")
    env_file = args.env_file.expanduser().resolve()
    env = dict(os.environ)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONPATH"] = str(root)
    env.setdefault("LUNAR_AI_ALLOWED_ORIGINS",
                   f"http://127.0.0.1:{args.port},http://localhost:{args.port},http://127.0.0.1:5180,http://localhost:5180")
    os.chdir(root)
    os.execve(str(python), [str(python), "-m", "lunar_data.server", "--port", str(args.port),
                           "--env-file", str(env_file), "--web-root", str(root / "touchdown/dist"),
                           "--dataset", str(root / "data/processed/v1")], env)


if __name__ == "__main__":
    main()
