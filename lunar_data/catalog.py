"""Catalogue transcribed from data.md §6.2; no unverified coordinate is upgraded."""
from copy import deepcopy

from .common import parameter, reason

ROWS = [
    ("apollo11", "Apollo 11 – Tranquility Base", 0.67416, 23.47314, None),
    ("apollo12", "Apollo 12 – Oceanus Procellarum", -3.01239, -23.42157, None),
    ("apollo14", "Apollo 14 – Fra Mauro", -3.64530, -17.47136, None),
    ("apollo15", "Apollo 15 – Hadley-Apennin", 26.13220, 3.63390, None),
    ("apollo16", "Apollo 16 – Descartes", -8.97301, 15.50019, None),
    ("apollo17", "Apollo 17 – Taurus-Littrow", 20.19080, 30.77168, None),
    ("chandrayaan3", "Chandrayaan-3 Vikram (Shiv Shakti)", -69.373, 32.319, "ldem_60s_240m"),
    ("change4", "Chang'e 4 – Von Kármán", -45.444, 177.599, None),
    ("blueghost1", "Blue Ghost M1 – Mare Crisium", 18.56, 61.81, None),
    ("im1", "IM-1 Odysseus – près de Malapert A", -80.13, 1.44, "ldem_75s_120m"),
    ("sp_s8950", "Point d'étude 89,5°S", -89.5, 0., "ldem_80s_80m"),
    ("sp_s8800", "Point d'étude 88,0°S", -88., 0., "ldem_80s_80m"),
    ("sp_s8600", "Point d'étude 86,0°S", -86., 0., "ldem_80s_80m"),
]


def list_sites():
    sites = []
    for sid, name, lat, lon, dem in ROWS:
        study = sid.startswith("sp_")
        sites.append({
            "id": sid, "name": name, "mission": None if study else name.split(" – ")[0],
            "status": "study_point" if study else "historical", "statusDate": None,
            "statusDateReason": reason("not_provided_in_plan"),
            "positionKind": "study_point" if study else "landed_point",
            "latDeg": lat, "lonDeg": lon, "frame": "MOON_ME", "latitudeType": "planetocentric",
            "coordinateOrigin": "team_default_hackathon" if study else "source:data_plan_6.2",
            "coordinateParameters": {"latDeg": parameter(lat, "deg", "team_default_hackathon" if study else "source:data_plan_6.2"),
                                     "lonDeg": parameter(lon, "deg", "team_default_hackathon" if study else "source:data_plan_6.2")},
            "polygon": None, "groundHeightM": None, "groundHeightSource": None,
            "groundHeightReason": reason("terrain_not_loaded"), "positionUncertainty": "unquantified",
            "sources": [{"id": "data_plan_6.2", "title": "Team data plan §6.2", "url": "https://github.com/shfink2903/nasa-space-apps-challenge-2026/blob/5bcf2bf/data.md",
                         "accessed": "2026-11-14", "primarySource": False}],
            "verification": "team_defined" if study else "unverified" if sid == "im1" else "single_source",
            "terrainProduct": dem,
            "notes": ["Coordinates transcribed from the team plan; independent second source not checked."] if not study else ["Team study point, not a mission landing site."],
            "scenarioIds": [],
        })
    return deepcopy(sites)
