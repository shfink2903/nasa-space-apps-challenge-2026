# Touchdown — lunar south pole mission planner

Touchdown helps a mission planner compare landing sites and dates at the lunar south pole: where the Sun (power) and the Earth (direct link) are relative to the local horizon, for how long, and what changes when the site or the date moves.

It reads the frozen dataset in `data/processed/v1` and changes nothing there.

## Run

```bash
cd touchdown
npm ci
npm run dev
```

Open http://127.0.0.1:5180. The interface is in French or English (switch at the top right).

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest). They read the real dataset. |
| `npm run typecheck` | TypeScript check. |
| `npm run build` | Type check, production build in `dist/`, and a byte-for-byte copy of the dataset with SHA-256 checks. |
| `npm run test:e2e` | Browser check of the build. Serve `dist/` on port 4180 first: `python3 -m http.server 4180 --directory dist --bind 127.0.0.1`. |
| `npm run prepare:assets` | Rebuilds the Moon and Earth textures from the NASA sources. Not needed for a normal run. |

Optional AI assistant: start the local service from the repository root with `python3 scripts/run_demo.py` (see `AI_GUIDE.md`). The app finds it at `/api`. Without it everything else works, and the assistant panel shows a rule-based summary only.

## What it does

**Explore in 3D**

- The Moon is seen from under its south pole. Gold dots are the candidates, blue dots are missions that already landed.
- A click on a dot or on a row of the ranking shows the site at once: no flight is needed to read the numbers.
- Left panel: Sun and Earth elevation at the chosen time, the published visibility state, and the time left before each one sets or rises. Then the 30-day shares, the longest night, the longest Earth blackout, the check against your requirements, and the local sky unrolled over 360° with the terrain skyline.
- Right panel: the 30-day period. Bands show when the Sun, the Earth and both are visible. A chart shows their elevation, with the terrain horizon in their direction. Click or drag to move the time. Mast height: 2 m or 10 m.
- In the site view two beams leave the site: amber toward the Sun, blue toward the Earth. A beam is drawn only while the dataset says the body is visible.
- "Watch the landing" starts the illustrative flight. It is refused when the Sun is not visible at the chosen time: there would be no power on arrival. A button jumps to the next sunrise.
- On the ground: the Sun and the Earth are at the published azimuth and elevation, a compass is painted on the ground, two arrows point to the Sun and the Earth, a blue line shows the line of sight to the Earth, and the far relief is the published horizon profile placed at its real distance.

**Compare sites**

- Ranking of the candidates on a priority you choose: Sun + Earth together, Sun, or Earth. Landed missions are listed below as references and are not ranked.
- Mission requirements: three limits you set (minimum Sun share, minimum Earth share, longest continuous night). Each site gets "meets" or "does not meet", with the reason.
- Side by side: 2 or 3 sites with live countdowns, their numbers, their visibility windows on one time axis, and their Sun and Earth elevation curves.
- When to land: one row per site, 52 weekly start dates, coloured by the chosen share. Click a cell to pick the date.
- A small move changes everything: the 5 x 5 grid (1 km spacing) around each candidate.
- Any coordinates: type a latitude and longitude (or pick IM-2, Chang'e-7 candidate, Luna-25) for a quick look without terrain.
- Energy (team estimate): sunlight on a vertical Sun-facing panel in kWh/m² over 30 days, and the battery for a 100 W load through the longest night. A longest night cut by the edge of the period is shown as "≥" and gives an "unknown" verdict.
- Method and limits: validation status and the limits published with the scenarios, in their original text.

## What is real and what is not

Real, from `data/processed/v1`:

- Site names, coordinates and status (`sites.json`).
- Sun and Earth azimuth, elevation, visibility state and angular size every 600 s (`series/`).
- Rise and set events and visibility windows (`scenarios/`). A countdown is the difference between a published event time and the chosen time.
- The shares and gaps of each 30-day period, for 52 start dates (`sweeps/`).
- The 1 km grids (`sensitivity/`) and the terrain skyline with its distance (`horizons/`).

Computed in the browser, and why it is safe:

- The rank: a sort on one published value.
- The Pareto badge: the non-dominated set on the four criteria of the dataset. A test proves that it gives the same set as all 104 comparisons published in `comparisons/`.
- The requirement check: a comparison of published values with limits the user sets. The default limits are examples.

Not real:

- The flight path, its timing, the ship size in the orbit view, flame and dust. No trajectory is modelled and no vehicle number is shown.
- The ground near the ship: procedural craters. The star field and the Earth rotation.

Limits to keep in mind:

- All scenarios are marked `not_validated` in the dataset. The terrain model is a preliminary product.
- "Visible" means above the local horizon. It does not prove electrical power or a radio link.
- The candidates are the three study points of the team (the 86° S point sits near the Malapert massif).
- Any coordinates: computed in the browser on a smooth sphere from a published geometric series (terrain ignored, shares from 600 s samples). A test checks that it gives back the published series of all 13 sites within 0.002°. LOLA terrain for a new point still needs the Python pipeline (`compute_custom_point`).

## How it is built

- `src/data/` — dataset access, lazy cache (`resources.ts`), pure geometry.
- `src/planner/` — pure logic, no DOM: metrics, ranking, Pareto set, requirement check, countdowns, site grouping.
- `src/charts/` — elevation chart, window strips, 360° panorama, calendar heatmap, 1 km grid. No chart library.
- `src/scene/` — orbit scene, surface scene, and the director that runs the views and the shots.
- `src/ui/` — panels of the two tabs, assistant, guide. All text is in `src/i18n/`.
- `src/flight/timeline.ts` — timing and shape of the illustrative flight.

## Credits

See `public/models/ATTRIBUTION.txt`. Starship model: I_am_Darth (Thingiverse 7369010), CC BY-NC-SA, non-commercial use only. Moon maps: NASA's Scientific Visualization Studio, CGI Moon Kit. Earth: NASA.
