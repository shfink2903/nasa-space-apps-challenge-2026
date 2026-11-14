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

1. **Overview.** The Moon seen from the south, so the south pole faces you. Right: the time bar and the ranking of the 13 sites.
2. **Click a site** (gold pin or ranking row): the camera zooms on it and the **site sheet** opens at once, with no flight to wait for.
   - Sun (power) and Earth (communication) now: height, state, and the **time left before the next set or rise**.
   - **Sky map**: direction and height, the 30-day paths of the Sun and the Earth, and the terrain horizon where the dataset has one.
   - 30-day metrics: Sun visible, Earth visible, both together, longest night, longest Earth blackout, maximum heights.
   - **One year**: 52 weekly starts as a strip. Click a cell to change the date.
   - **Within 2 km** (the 3 study points): the 5 x 5 grid at 1 km, to see how a small move changes the result.
   - Observer height (2 m or 10 m), model level and the limits published with the data.
3. **Time bar**: two bands over the 30 days, Sun on top and Earth under it.
4. **Ranking** (bottom right): you choose the criterion. **Compare** opens a table of every site and a calendar of every site for every week of the year.
5. **Land here**: the illustrative flight starts only when the Sun is visible at the site at the chosen time. If not, the button becomes **Go to sunrise**, or the caption says that no sunrise is published in these 30 days.
6. **On the ground:** the Sun and the Earth are where the dataset says. **Back to the sheet** returns to the zoomed view.

Keys: `Space` play/pause, `←` `→` one hour, `Esc` back. With "reduce motion" on, the flight is skipped. The interface is in French or English (`FR` / `EN` button, or `?lang=en`).

### Ranking rules

- The ranking is a sort on one published metric, chosen by the user. No score, weight or threshold is invented (data.md §10.2). The default criterion (Sun and Earth together) is a team default and can be changed.
- "Best" always means best among the 13 explored sites, for this date and this criterion. It is not a mission validation.
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
