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

1. **Approach.** The Moon far away, Starship in front. It moves closer by itself. Scroll or drag to go faster.
2. **Guide** (top left), **time bar** (top right), **site list** (bottom right): 10 real landings and, in a separate group, 3 south-pole study points.
3. **Click a site** (list or gold pin): transfer around the Moon, tail-first descent, cut to a ground camera for the last metres, then a free view around the landed ship.
4. **On the ground:** the Sun and the Earth are where the dataset says, for that site and that time. The card on the left shows the published values.

Keys: `Space` play/pause, `←` `→` one hour, `Esc` back to orbit. With "reduce motion" on, the flight is skipped.

## What is real and what is not

Real, from `data/processed/v1`:

- Site names, coordinates and status (`sites.json`).
- Sun and Earth azimuth, elevation, visibility state and angular size, every 600 s (`series/`).
- Next sunrise or sunset and the 30-day Sun share (`scenarios/`).
- For the 5 polar sites: the far hills are the 3,600-value horizon profile (`horizons/`).
- The interface computes no window, no duration and no verdict.

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
