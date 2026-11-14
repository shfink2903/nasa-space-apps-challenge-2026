# Touchdown

A cinematic view for the Lunar Landing Site Navigator: Starship comes closer to the Moon, you pick a real landing site, and the ship flies there and lands. The time bar moves the Sun and the Earth of the project dataset.

This app is separate from `web/`. It reads the frozen dataset in `data/processed/v1` and changes nothing there.

## Run

```bash
cd touchdown
npm ci
npm run dev
```

Open http://127.0.0.1:5180. The dev server also serves the dataset at `/data/v1` straight from `../data/processed/v1` (no copy).

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest). They read the real dataset. |
| `npm run typecheck` | TypeScript check. |
| `npm run build` | Type check, then production build in `dist/`. |
| `npm run preview` | Serves `dist/` and the dataset on port 5180. |
| `npm run prepare:assets` | Downloads the NASA source images and rebuilds `public/textures/`. Not needed for a normal run: the textures are committed. |

To host the build on a static server, also publish `data/processed/v1` at the path `/data/v1`, and send the `series/*.json.gz` files as raw bytes (no `Content-Encoding: gzip`).

## What you see

The main job of the tool is to **compare sites and dates** for two things: **lighting** (is the Sun up at the site) and **communication** (is the Earth in view, so a direct link is possible).

1. **Overview.** The Moon seen from the south, so the south pole faces you. A large **Compare the sites** button sits under the title and on top of the ranking.
2. **Compare sheet.**
   - **By date**: one row per site with three bars (lighting, communication, both together). Drag the start date, step week by week or press **Play through the year**: the bars and the ranking move as the date changes.
   - Click a column title to rank by it. Each title has one line that says what it measures.
   - **Precision**: *Simple* shows the three bars. *Detailed* adds one decimal, the longest night, the longest link blackout, the maximum Sun height and the model level.
   - **Over the year**: one row per site, one cell per weekly start. Click a cell to open that site at that date.
3. **Click a site** (gold pin, ranking row or compare row): the camera zooms on it and the **site sheet** opens at once, with no flight to wait for.
   - Two cards, no angle: **Lighting** ("Lit" / "In the dark", time left before night) and **Communication** ("Direct link possible" / "No direct link", time left before the blackout), each with its share of the 30 days.
   - A date strip (52 weekly starts) to change the date.
   - **More precision** (closed by default): Sun and Earth heights, the sky map with the terrain horizon, longest night and blackout, the 1 km grid of the study points, observer height (2 m or 10 m), model level and published limits.
4. **Time bar**: two bands over the 30 days, lighting on top and link with Earth under it.
5. **Land here**: the illustrative flight starts only when the site is lit at the chosen time. If not, the button becomes **Go to sunrise**, or the caption says that no sunrise is published in these 30 days.
6. **On the ground:** the Sun and the Earth are where the dataset says. **Back to the sheet** returns to the zoomed view.

"Lit" and "link possible" are the published visibility states of the Sun and the Earth above the terrain. They are not a power budget or a radio link budget.

Keys: `Space` play/pause, `←` `→` one hour, `Esc` back. With "reduce motion" on, the flight is skipped. The interface is in French or English (`FR` / `EN` button, or `?lang=en`).

### Ranking rules

- **South pole / All sites**: the ranking and the compare sheet show the south pole sites by default (south of 60° S: Chandrayaan-3, IM-1 and the three study points). "All sites" adds the Apollo and other landings as a reference. The 60° S limit only groups the display; it is shown next to the switch and is not a mission rule. On the globe, the sites outside the chosen group stay clickable but are drawn smaller.
- The ranking is a sort on one published metric, chosen by the user. No score, weight or threshold is invented (data.md §10.2). The default criterion (Sun and Earth together) is a team default and can be changed.
- "Best" always means best among the sites shown, for this date and this criterion. It is not a mission validation.
- ◆ marks the non-dominated set published by DATA in `comparisons/`. It is read, never recomputed.
- Polar rows use the LOLA terrain model (experimental, not validated); the other rows ignore terrain. The model level is shown on every row.

### Compact index

`public/derived/v1.json` (about 300 kB) is a copy of the values the ranking, the calendars and the 1 km grids need, taken from `sweeps/`, `comparisons/` and `sensitivity/` (about 30 MB). Nothing is computed in it. Rebuild it after a new dataset release:

```bash
npm run prepare:derived
```

`tests/planner.test.ts` checks that it matches the dataset.

## What is real and what is not

Real, from `data/processed/v1`:

- Site names, coordinates and status (`sites.json`).
- Sun and Earth azimuth, elevation, visibility state and angular size, every 600 s (`series/`).
- Next sunrise or sunset and the 30-day Sun share (`scenarios/`).
- For the 5 polar sites: the far hills are the 3,600-value horizon profile (`horizons/`).
- Windows, rise and set times come from the exact windows of the scenario files. The interface only subtracts the chosen time from a published time to show the time left.
- The interface computes no window and no verdict.

Illustrative:

- The flight path, its timing, the ship size in the orbit view, flame and dust. No trajectory is modelled and no vehicle number is shown (rule R2 of `data.md`).
- The ground near the ship: procedural craters, seeded by the site id. It is not the real terrain of the site.
- Star field and Earth rotation. The dataset has no sky orientation.
- Light on the far hills.

One geometry check ties the picture to the data: the tests rebuild the sub-solar latitude and the sub-Earth point from the site azimuth/elevation values and compare them with the dataset (`tests/astro.test.ts`).

## How it is built

- `src/data/` — dataset access and pure geometry (frames, azimuth convention).
- `src/flight/timeline.ts` — pure timing and shape of the flight. Tune the feel of the landing here.
- `src/scene/orbitScene.ts` — far view: georeferenced Moon (Lommel–Seeliger shading, LOLA slope map, earthshine), Sun, Earth, stars. The ship is drawn in an overlay scene with its own depth buffer.
- `src/scene/surfaceScene.ts` — near view in metres: ground patch, horizon ring, shadows, flame light, dust.
- `src/scene/director.ts` — runs the shots and the cut between the two scenes.
- `src/ui/` — panels. All text is in `src/ui/strings.ts`.

Two scenes are used because one cannot hold a 3,474 km Moon and a 52 m ship with good depth precision and detail. The cut is hidden in the engine glare.

## Credits

See `public/models/ATTRIBUTION.txt`. Starship model: I_am_Darth (Thingiverse 7369010), CC BY-NC-SA, non-commercial use only. Moon maps: NASA's Scientific Visualization Studio, CGI Moon Kit. Earth: NASA.
