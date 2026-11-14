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

The tool answers one question: **where to land, and when**, judged on **lighting** (is the Sun up at the site) and **communication** (is the Earth in view, so a direct link is possible).

The screen has four fixed places, each with one job:

| Place | What it holds |
|---|---|
| **Top bar** | The three things the tool is for: **Compare the sites**, **Launch delay**, **Guided tour**. Then the display level (Everyone / Scientist) and the language. |
| **Right** | The sites, ranked by the criterion you pick, with a green or red dot for the verdict. South pole or all sites. Free coordinates at the bottom. |
| **Bottom** | Time: play, the landing date and time, and the 30 days as two bands (lit, link with Earth). |
| **Left** | The sheet of the selected site. Empty on the overview, so the Moon stays in view. |

Click a site (gold point, ranking row, or anywhere on the Moon) and its sheet opens at once:

- **Head**: the name, the verdict, and the one action that makes sense now: *Land here*, *Go to sunrise*, or *See the other options* when the criteria are not met.
- **Summary**: lighting and communication now, with the time left; their share of the 30 days; and the sky seen from the site, with the Sun and the Earth against the horizon.
- **Year**: 52 weekly starts to pick another date, and the 1 km grid of the study points.
- **Understand**: what the Sun gives a lander, and why conditions change.
- **Precision** (Scientist display): angles, longest night and blackout, observer height, model level, validation status, scenario id and published limits.

The compare sheet opens under the top bar and has three tabs: **By date** (bars and ranking that move as you drag the date), **Over the year** (a green and red calendar, or one metric), **Launch delay**. The mission criteria are one line at the top of the sheet; click it to change them.

"Lit" and "link possible" are the published visibility states of the Sun and the Earth above the terrain. They are not a power budget or a radio link budget.

Keys: `Space` play/pause, `←` `→` one hour, `Esc` back. With "reduce motion" on, the flight is skipped. `?lang=en` and `?mode=expert` force the language and the display.

### Mission criteria and verdict

The user sets three thresholds (sliders, kept in the browser): minimum lighting, minimum communication, longest night accepted. A site and a date then get **Landing possible** or **No landing**, with the threshold that fails and its value.

- The thresholds are the user's. The starting values (lighting 40 %, communication 50 %, no limit on the night) are a team default, shown as an assumption (`src/data/mission.ts`, data.md R2 and §10.1).
- The verdict is shown on the site sheet, as a dot in the ranking, as a column in the compare sheet and as a green / red calendar over the year. A missing value gives "unknown", never a pass.
- **No landing** blocks the flight. The sheet then gives the next date when the site meets the criteria, and a link to the other options.
- A verdict only compares published 30-day values with the thresholds. It is not a mission validation.

### Launch delay

Third tab of the compare sheet, for the case the challenge describes: the launch slips. Give the planned site, the planned date and the delay in weeks. The tool answers:

1. Does the same site still meet the criteria on the new date? If not, on which date does it again?
2. Which other sites are ready soonest from the new date on, soonest first?

Dates move in steps of one week (the weekly starts of the dataset), each analysed over 30 days. "Soonest" means among the explored sites and dates, by the user's criteria.

### Landing date and time

The time panel takes any UTC date and time between 1 Dec 2026 and 23 Dec 2027. The app loads the weekly start that contains it and puts the cursor on that time.

### What the Sun is for, and why it changes

Every site sheet explains what sunlight gives a lander (electricity, heat, light) and why conditions change (the 29.5-day lunar day, the lunar seasons of about 346 days, the swing of the Earth in the sky). When the site is lit, a line gives the light a flat panel catches: the sine of the Sun's height. This is geometry only: no panel size, no watts and no temperature is computed.

### Sites added to the catalogue

`src/data/targets.ts` adds four sourced sites the dataset does not have: IM-2 Athena (CLPS, Mons Mouton), a studied site inside the Mons Mouton Artemis III candidate region, Chang'e 6 (far side) and SLIM. Their values are geometric estimates made in the browser, like a free point, and are marked "≈" everywhere. The other Artemis III candidate regions are not listed: no reliable coordinates were found for them, and none is guessed.

### Free point: any lunar coordinates

Click anywhere on the Moon, or type a latitude and a longitude under the ranking. The free point opens like any site: lighting and communication now, the 30 days, the 52 weekly starts of the year, a row in the ranking and in the compare sheet, and the landing.

How it is computed (`src/data/custom.ts`): the dataset gives, for a reference site (Apollo 11), the direction and the angular radius of the Sun and of the Earth every 600 s. Direction plus distance is a position in the Moon-fixed frame; the same position seen from another point of the sphere gives azimuth and elevation there. No ephemeris and no orbit model is added in the browser.

- Model level: **geometric**. Smooth sphere, horizon at 0° as in the geometric scenarios of the dataset, **terrain ignored**. Near the poles the real windows can be very different, and the sheet says so in a red box.
- Windows come from the 600 s samples, with a straight-line crossing: good to a few minutes, not to the second.
- Check: `tests/custom.test.ts` treats six catalogue sites as free points (two dates, two heights, 24 cases) and compares with the geometric scenarios published by DATA. Elevation agrees within 0.02°, the 30-day shares within 0.2 point, the longest night and blackout within 30 minutes.
- This is the one place where the interface computes values. They are always marked "geometric estimate" and never mixed with the non-dominated mark of DATA.

### Guided tour

**Guided tour (2 min)** on the first screen runs six steps on the real tool: the month-long lunar day at Apollo 11, the Earth fixed in the near-side sky, no link on the far side (Chang'e 4), the grazing Sun at 89.5° S, the 1 km grids where two kilometres change everything, then the compare sheet. It is made for classrooms and for a first visit.

### Two displays

The switch at the top left changes how the same data is said. Nothing else changes: same sites, same dates, same values.

| | **Everyone** (default) | **Scientist** |
|---|---|---|
| Shares of the 30 days | Days: "13 of 30 days" | Percent with one decimal, for both disc conventions (`anyDisk`, `fullDisk`) |
| Durations | "16.7 d" | Exact hours: "401.3 h" |
| Site sheet | Status, time left, one line that says why it matters, "Did you know?" facts | Adds elevation, azimuth, disc state, UTC time of the next rise or set, the sky map, terrain grid, observer height, model level, validation status, scenario id and published limits |
| Compare sheet | Three bars | Adds longest night, longest blackout, maximum Sun and Earth heights, model level, the dataset metric id under each title and the non-dominated mark |

The "Did you know?" facts are general knowledge about the Moon (length of the lunar day, low Sun at the poles, Earth nearly fixed in the near-side sky). They are not dataset values. The choice is kept in the browser; `?mode=expert` forces the scientist display.

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
