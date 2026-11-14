"""Acquire only during preparation. Files are pinned by content, never overwritten."""
from __future__ import annotations

import email.utils
import os
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

import certifi

from .common import DataError, read_json, sha256, utc_now, write_json

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
KERNELS = [
    ("lsk/naif0012.tls", 5257), ("pck/pck00011.tpc", 131226),
    ("spk/planets/de440s.bsp", 32726016), ("pck/moon_pa_de440_200625.bpc", 12863488),
    ("fk/satellites/moon_de440_250416.tf", 19478),
]
DEMS = {"ldem_80s_80m": 115520000, "ldem_75s_120m": 116250752, "ldem_60s_240m": 120435200}
USER_AGENT = "true-larpers-data/1.0 (NASA Space Apps preparation)"


def fetch(url, path, expected_size=None):
    path = Path(path)
    record_path = path.with_name(path.name + ".source.json")
    if path.exists():
        if not record_path.exists():
            raise DataError("missing_provenance", str(path))
        record = read_json(record_path)
        if sha256(path) != record["sha256"] or path.stat().st_size != record["receivedSizeBytes"]:
            raise DataError("integrity_failure", str(path))
        if record["url"] != url or expected_size is not None and path.stat().st_size != expected_size:
            raise DataError("source_format_changed", str(path))
        return record
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + ".part")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context(cafile=certifi.where())) as response, part.open("wb") as out:
                announced = response.headers.get("Content-Length")
                announced = int(announced) if announced else None
                modified = response.headers.get("Last-Modified")
                while block := response.read(1024 * 1024):
                    out.write(block)
            size = part.stat().st_size
            if announced is not None and size != announced or expected_size is not None and size != expected_size:
                raise DataError("source_format_changed", str(path), {"expected": expected_size, "announced": announced, "received": size})
            digest = sha256(part)
            record = {
                "id": path.stem, "organization": "NASA/JPL NAIF" if url.startswith(NAIF) else "NASA PDS Geosciences",
                "product": path.name, "url": url, "retrievedAt": utc_now(),
                "announcedSizeBytes": announced, "receivedSizeBytes": size, "sha256": digest,
                "lastModified": modified, "format": path.suffix.lstrip("."),
                "frame": "MOON_ME / DE421 MER" if url.startswith(PDS) else "see kernel comments",
                "units": "DN × 0.5 m above 1737400 m sphere" if url.startswith(PDS) else "SPICE kernel native units",
                "extent": "south polar stereographic" if url.startswith(PDS) else None,
                "invalidValue": None, "label": path.with_suffix(".lbl").name if path.suffix == ".img" else None,
            }
            write_json(record_path, record)
            os.replace(part, path)
            return record
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 403, 404) or attempt == 2:
                raise DataError("missing_dependency", url, f"HTTP {exc.code}") from exc
            if exc.code not in (429, 503):
                raise DataError("missing_dependency", url, f"HTTP {exc.code}") from exc
            retry = exc.headers.get("Retry-After")
            try:
                delay = float(retry)
            except (ValueError, TypeError):
                delay = max(0, email.utils.parsedate_to_datetime(retry).timestamp() - time.time()) if retry else (10, 30, 90)[attempt]
            time.sleep(max(delay, (10, 30, 90)[attempt]))
        except (OSError, urllib.error.URLError) as exc:
            if attempt == 2:
                raise DataError("missing_dependency", url, str(exc)) from exc
            time.sleep((10, 30)[attempt])
    raise AssertionError("unreachable")


def acquire(root, terrain=False):
    root = Path(root)
    records = []
    for relative, size in KERNELS:
        print(f"Acquire {relative}", flush=True)
        records.append(fetch(f"{NAIF}/{relative}", root / "kernels" / Path(relative).name, size))
    if terrain:
        for product, size in DEMS.items():
            for extension, n in (("lbl", None), ("img", size)):
                print(f"Acquire {product}.{extension}", flush=True)
                records.append(fetch(f"{PDS}/{product}.{extension}", root / "lola" / f"{product}.{extension}", n))
    # This is an acquisition index, not a released dataset manifest.
    index = root / "SOURCES.json"
    previous = read_json(index)["sources"] if index.exists() else []
    merged = {x["url"]: x for x in previous + records}
    temp = root / "SOURCES.json.part"
    temp.unlink(missing_ok=True)
    write_json(temp, {"schemaVersion": "1.0.0", "sources": list(merged.values())})
    os.replace(temp, index)
    return records
