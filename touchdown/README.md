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
| `npm run build` | Type check, production build in `dist/`, and a byte-for-byte copy of the dataset in `dist/data/v1` with SHA-256 checks. |
| `npm run preview` | Serves `dist/`, dataset included, on port 5180. |
| `npm run prepare:assets` | Downloads the NASA source images and rebuilds `public/textures/`. Not needed for a normal run: the textures are committed. |
| `npm run prepare:derived` | Rebuilds the compact index `public/derived/v1.json` from the dataset. |

`dist/` is complete on its own: any static server can host it. Each `series/*.json.gz` file has a `.bin` copy next to it, and the app fetches that one, so a host never decodes the gzip bytes on the way.

The local service `python -m lunar_data.server` (see `AI_GUIDE.md`) can serve `dist/` too. Its AI assistant has no panel in this interface.

## What you see

The tool answers one question: **where to land, and when**, judged on **lighting** (is the Sun up at the site) and **communication** (is the Earth in view, so a direct link is possible). There is one interface for everyone: plain words and days first, the scientific details folded at the end of each site sheet.

The top bar has three tabs:

| Tab | What it holds |
|---|---|
| **The Moon** (home) | The whole Moon with the sites. Click a site, or any point of the Moon, to open its sheet. |
| **Evaluate the sites** | The main page, full screen: the mission criteria, the sites studied (south pole or whole Moon, plus your own coordinates), then three views: **On one date**, **Full year**, **Delay**. |
| **Explore the mission** | Six steps that drive the real tool: why the south pole, the Sun, the Earth, the date, a landing. It has the screen to itself. |

Every value is said in days out of the 30 days studied from the landing date ("Sun visible 13 days"). The period is always written with its two dates.

The site sheet reads from top to bottom:

- **Landing date**: a date field, the hour, and one week earlier or later. Any date of the year studied.
- **One answer**: *Landing possible*, *It is night at this time* (with the sunrise and a button to go there), or *Landing not possible* (with the threshold that fails and the next date when the site is possible again).
- **Sun** and **Earth**: lit or not now, the time left, and the number of days out of 30.
- **Over the year**: one cell per weekly landing date, possible or not. Click a cell to choose that date.
- **Your mission criteria**, then three points to understand.
- **Scientific details** (folded): the sky chart, the height of the Sun and the Earth over the 30 days, angles, both disc conventions, longest night and blackout, the 1 km grid, observer height, model level, validation status, scenario id and published limits.

With a site open, the bottom bar shows the 30 days studied as two bands, *Sun visible* and *Earth visible*, with one cursor and a play button.

**Evaluate the sites**:

- **On one date**: drag the date (or play the year) and the bars and the ranking move. Rank by Sun and Earth together, Sun, or Earth. *Exact values* adds percentages, the longest night and blackout, maximum heights and the model level.
- **Full year**: the solar energy possible at each site (share of the year with the Sun visible, mean of the 52 weekly dates; no power is computed), then a calendar of the dates when landing is possible. Click a cell for its values.
- **Delay**: see below.

"Sun visible" and "Earth visible" are the published visibility states above the terrain. They are not a power budget or a radio link budget.

Keys: `Space` play/pause, `←` `→` one hour, `Esc` back. With "reduce motion" on, the flight is skipped. `?lang=en` forces the language.

### Mission criteria and verdict

The user sets three thresholds (sliders in days out of 30, kept in the browser): Sun visible for at least, Earth visible for at least, longest night at most. A site and a date then get **Landing possible** or **Landing not possible**, with the threshold that fails and its value.

- The thresholds are the user's. The starting values (Sun 12 days, Earth 15 days, no limit on the night) are a team default, shown as an assumption (`src/data/mission.ts`, data.md R2 and §10.1).
- The verdict is shown on the site sheet, as a column of the ranking and as a calendar over the year. A missing value gives "unknown", never a pass.
- **Landing not possible** blocks the flight. The sheet then gives the next date when the site meets the criteria, and a link to the other sites.
- A verdict only compares published 30-day values with the thresholds. It is not a mission validation.

### Launch delay

Third view of **Evaluate the sites**, for the case the challenge describes: the launch slips. Give the planned site, the planned date and the delay in weeks. The tool answers:

1. Does the same site still meet the criteria on the new date? If not, on which date does it again?
2. Which other sites are ready soonest from the new date on, soonest first?

Dates move in steps of one week (the weekly starts of the dataset), each analysed over 30 days. "Soonest" means among the explored sites and dates, by the user's criteria.

### Landing date and time

The site sheet takes any UTC date and hour between 1 Dec 2026 and 23 Dec 2027. The app loads the weekly start that contains it and puts the cursor on that time.

### What the Sun is for, and why it changes

Every site sheet explains in three points what the Sun gives a lander (electricity and heat), what the Earth in view gives (a direct link, with no relay satellite) and why the date matters (the 29.5-day lunar day, the Sun skimming the horizon at the pole). The scientific details add the light a flat panel catches (the sine of the Sun's height: geometry only, no panel size and no power).

### Sites added to the catalogue

`src/data/targets.ts` adds four sourced sites the dataset does not have: IM-2 Athena (CLPS, Mons Mouton), a studied site inside the Mons Mouton Artemis III candidate region, Chang'e 6 (far side) and SLIM. Their values are geometric estimates made in the browser, like a free point, and are marked "≈" everywhere. The other Artemis III candidate regions are not listed: no reliable coordinates were found for them, and none is guessed.

### Free point: any lunar coordinates

Click anywhere on the Moon, or type a latitude and a longitude in **Evaluate the sites** (the point then joins the three views). The free point opens like any site: lighting and communication now, the 30 days, the 52 weekly starts of the year, a row in the ranking and in the compare sheet, and the landing.

How it is computed (`src/data/custom.ts`): the dataset gives, for a reference site (Apollo 11), the direction and the angular radius of the Sun and of the Earth every 600 s. Direction plus distance is a position in the Moon-fixed frame; the same position seen from another point of the sphere gives azimuth and elevation there. No ephemeris and no orbit model is added in the browser.

- Model level: **geometric**. Smooth sphere, horizon at 0° as in the geometric scenarios of the dataset, **terrain ignored**. Near the poles the real windows can be very different, and the sheet says so in a red box.
- Windows come from the 600 s samples, with a straight-line crossing: good to a few minutes, not to the second.
- Check: `tests/custom.test.ts` treats six catalogue sites as free points (two dates, two heights, 24 cases) and compares with the geometric scenarios published by DATA. Elevation agrees within 0.02°, the 30-day shares within 0.2 point, the longest night and blackout within 30 minutes.
- This is the one place where the interface computes values. They are always marked "geometric estimate" and never mixed with the non-dominated mark of DATA.

### Explore the mission

The third tab runs six steps on the real tool: the south pole, the Sun (a study point at 89.5° S), the Earth (Chang'e 4, far side), the date (IM-1 through the 52 weekly dates), a landing (Chandrayaan-3), then the page to evaluate the sites. Each step shows the two numbers of the site on screen. The sheet and the bottom bar are hidden during the tour.

The three points to understand in the site sheet are general knowledge about the Moon (length of the lunar day, low Sun at the poles, direct link when the Earth is in view). They are not dataset values.

### Ranking rules

- **South pole / Whole Moon**: the three views show the south pole sites by default (south of 60° S: Chandrayaan-3, IM-1 and the three study points). "Whole Moon" adds the Apollo and other landings as a reference. The 60° S limit only groups the display; it is shown next to the switch and is not a mission rule. On the globe, the sites outside the chosen group stay clickable but are drawn smaller.
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
