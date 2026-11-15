# Space Apps 2026 submission kit — Touchdown

Ready-to-paste text for the project page, a 30-second video script and a final checklist.

The rules below come from copies of the 2026 guides saved by other teams; the official site could not be reached from our tools. Check them once in a browser before submitting:
- https://www.spaceappschallenge.org/resources/judging-awards-guide/
- https://www.spaceappschallenge.org/resources/project-submission-guide/

**Deadline: Sunday 15 November 2026, 23:59 Paris time.** A project that is saved but not submitted is not judged.

Fill in the `[brackets]` before pasting.

---

## Checklist (anything missing makes the project ineligible)

- [ ] Challenge selected: **Lunar Landing Site Navigator**.
- [ ] All team members (1 to 6) are registered for the Paris event, not waitlisted, and listed on the Members tab. Nobody can be added after the deadline.
- [ ] Demo: **one video of 30 s or less**, or **one deck of 7 slides or less** (title slide included). Going over makes the project ineligible.
- [ ] Everything is in English. A video in another language needs English subtitles.
- [ ] Demo link is public, with no login. Test it in a private window.
- [ ] Final project link (live app or repository) opens for anyone. Test it in a private window and on a phone.
- [ ] Repository is public (Settings > General > Danger zone > Change visibility).
- [ ] Every required field is filled in, including References and Use of AI.
- [ ] The terms and originality boxes are ticked.
- [ ] The **Submit** button was pressed. Saving is not enough.

## Publish the app

The build is a static site, about 490 MB in 5,903 files. The largest file is under 5 MB.

**Option A: GitHub Pages.** The workflow is already in `.github/workflows/pages.yml`.
1. Merge into `main`.
2. Open Settings > Pages > Build and deployment, and set Source to **GitHub Actions**.
3. Wait for the "Deploy Touchdown to GitHub Pages" run to finish.
4. The URL is `https://shfink2903.github.io/nasa-space-apps-challenge-2026/`.

The build uses relative paths, so it works under this sub-path. This was tested.

**Option B: Cloudflare Pages.** It allows 20,000 files and 25 MiB per file.
1. Run `cd touchdown && npm ci && npm run build`.
2. Upload `touchdown/dist`, either as a direct upload or with `npx wrangler pages deploy dist`.

**After publishing:**
- Open the URL in a private window and on a phone.
- The `.json.gz.bin` series files must arrive as raw bytes. The host must not add `Content-Encoding: gzip`. GitHub Pages and Cloudflare Pages leave them as they are.
- The AI chat needs our local Python server. On a static host the panel shows the rule-based summary and a short note, which is expected.

---

## Project page fields

### Project name
Touchdown — Lunar South Pole Landing Planner

### High-level summary (about 150 words)
Touchdown lets mission planners, teachers and the public compare lunar south pole landing sites and dates in seconds. For any site and any 30-day period between December 2026 and November 2027, it shows where the Sun (power) and the Earth (direct link) sit against the real local horizon, built from NASA LOLA terrain. It also shows how long each stays up, and how long until the next sunset or Earthset.

Sites are ranked on what the mission needs most. Users check them against their own limits: minimum sunlight, minimum Earth visibility, longest night. They can compare up to three side by side, see the best start week on a 52-week calendar, and find out that moving 1 km can change sunlight from 61 % to 80 %.

It turns visibility into engineering units: sunlight energy per m² and battery size for the longest night. A quick look works at any coordinates, in the browser.

All Sun and Earth positions come from NASA/JPL DE440 ephemerides and are checked against JPL Horizons within 0.00003°.

### Demo link
[YouTube or Google Drive link to the 30-second video, set to public or unlisted]

### Final project link
[Live app URL] · Code: https://github.com/shfink2903/nasa-space-apps-challenge-2026

### Detailed description

**The problem.** At the lunar south pole the Sun and the Earth never rise high. They skim the horizon, so one hill can cut power or contact for days, and a move of 1 km or one week can change everything. Tools such as Quickmap, Moon Trek and JPL Horizons have the data, but comparing site and date combinations means switching between expert interfaces. When a launch slips, teams need answers fast.

**What Touchdown does**
- **Pick a site and see it at once.** Sun and Earth elevation at the chosen time and whether each is visible. The next set or rise is given as an absolute UTC time with a countdown, for example "Sets 14 Dec 01:45 UTC · in 12 d 4 h". The azimuth, the terrain horizon in that direction and the margin explain why a body is hidden, for example "terrain +19.8° · margin −18.4°". A 360° sky panorama shows the terrain skyline.
- **3D views.** The 3D view opens on the south pole, lit by the real Sun direction at the chosen time, with a polar grid. Beams point toward the Sun and the Earth, and a ground view has a compass.
- **Time.** A 30-day timeline with visibility bands for Sun, Earth and both together, plus elevation curves with the terrain horizon in their direction. Click, drag or press Play. Mast height 2 m or 10 m.
- **Rank and screen.** Rank sites by "Sun + Earth together", "Sun" or "Earth". Set three mission limits and see which sites meet them and why. A Pareto badge marks non-dominated sites.
- **Side by side.** Two or three sites with live countdowns and their windows on a shared time axis.
- **When to land.** A 52-week calendar: each cell is a 30-day period starting that week. Click one to plan that date.
- **A small move changes everything.** A 5 × 5 grid at 1 km spacing around each study point.
- **Power and battery estimates.** Sunlight on a vertical, Sun-facing panel (kWh/m² over 30 days, mean W/m²) and the battery needed to carry a 100 W survival load through the longest night. The assumptions are stated on screen.
- **Any coordinates.** Type a latitude and longitude, or pick IM-2 Athena, the Chang'e-7 candidate site or the Luna-25 planned site. Sun and Earth are recomputed in the browser for the chosen date. This mode ignores terrain and is labelled as such.
- **Fast to use.**
  - Three one-click questions on the opening screen: "Launch slipped: which week still works?", "When does the Sun set here?", "Why is the south pole so hard?".
  - Sticky section links in the Compare tab.
  - Share button: the address keeps the exact scenario (site, date, height, time, limits, compared sites), so a link reopens it.
  - CSV downloads of the ranking and of the 52-week table.
- **For a class.** A two-step lesson:
  - On a smooth Moon, the 88° S point gets plenty of Sun, but never higher than +3°; Apollo 11 gets +88°.
  - With the real LOLA terrain, the same point gets 0 % Sun all year. Terrain decides everything at the pole.
- **For every audience.** French and English, a guide, and plain-language labels. A rule-based summary is always on. An optional AI assistant answers only from the published numbers and cites them.

**How it works**
1. A Python pipeline (`lunar_data/`) computes Sun and Earth azimuth and elevation with NASA/JPL SPICE kernels (DE440, Moon PA frame), with light-time and aberration corrections.
2. It casts the local horizon from LOLA polar elevation models: 80 m to 150 km, 120 m from 150 to 300 km.
3. It finds exact rise and set events (to the second or better) and stores 600 s display series, 52 weekly start dates, two mast heights and 1 km grids. Every file is fingerprinted with SHA-256.
4. The web app (TypeScript, Three.js, no chart library) reads these frozen files offline, so it runs on any static host.

**How we checked it**
- Azimuth and elevation agree with JPL Horizons within 0.00003° in 5 reference cases.
- The in-browser "any coordinates" method gives back the published series of all 13 sites within 0.002°.
- The Pareto set computed in the browser matches all 104 comparisons published in the dataset.
- 97 unit tests and 12 browser checks pass.
- Known limits are published in the app: the terrain model is preliminary, one terrain-convergence test failed and is kept on record, and "visible" is not a power or radio guarantee.

**Why it matters.** Teams can re-plan in minutes when a date or a site changes, and students can see why the south pole is so hard: an axis tilted only 1.5°, a Sun that skims the horizon, an Earth that bobs with libration.

### NASA data used
- **NASA/JPL NAIF SPICE kernels**, via https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ : DE440 planetary ephemeris (`de440s.bsp`), lunar orientation (`moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`), `pck00011.tpc`, `naif0012.tls`. Used for all Sun and Earth positions.
- **JPL Horizons System**: independent reference used to validate our positions (5 cases, responses archived with SHA-256).
- **LRO LOLA gridded elevation models (PDS Geosciences)**: `ldem_80s_80m`, `ldem_75s_120m`, `ldem_60s_240m`. Used for the local terrain horizon and ground height.
- **NASA Scientific Visualization Studio**: CGI Moon Kit (SVS 4720, from LRO LROC and LOLA) for the Moon texture, and an Earth map (SVS 3615) for display.
- Concepts and context: Artemis candidate landing regions (NASA, 2022 and 2024), LROC images of IM-1 and IM-2 landing sites.

### Space agency partner and other data
- Mission landing coordinates from public sources: Apollo, Chandrayaan-3, Chang'e 4, IM-1, Blue Ghost M1, IM-2, Luna-25. The site catalogue marks unverified coordinates as such.
- [If used] CSA Moon Exploration page for context.

### Use of AI
[Check and complete honestly. Judges read this when assessing originality.]
- **Code:** the team used AI coding assistants (Anthropic Claude Code; [OpenAI Codex, if used]) to help write and review parts of the code, tests and documentation. The idea, the scientific choices, the data pipeline design and the final review are the team's.
- **In the app:** an optional assistant (OpenRouter, model `deepseek/deepseek-v4.1-flash-1017`) answers questions in the local version. It can only call read-only tools on our dataset, it must cite the evidence it read, and every number it shows is rendered from the dataset, never written by the model. The public version shows a rule-based summary with no AI.
- **Images, video, audio:** [none generated by AI]. If any AI image or video is used, it must carry a visible watermark. No NASA logos or insignia are used or altered.

### References
- NASA/JPL NAIF generic SPICE kernels: https://naif.jpl.nasa.gov/naif/data_generic.html
- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/
- LRO LOLA PDS archive: https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- NASA SVS CGI Moon Kit: https://svs.gsfc.nasa.gov/4720 ; Earth map: https://svs.gsfc.nasa.gov/3615
- LROC Quickmap: https://quickmap.lroc.asu.edu/ ; Moon Trek: https://trek.nasa.gov/moon/
- Mazarico, E. et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066–1081.
- NASA Artemis candidate regions: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- IM-2 landing site (LROC): https://lroc.im-ldi.com/images/1408 ; IM-1 (LROC): https://www.lroc.asu.edu/images/1360
- Luna-25 planned site: https://www.nasa.gov/humans-in-space/nasas-lro-observes-crater-likely-from-luna-25-impact
- Chang'e-7 candidate site (approximate, not final): https://en.wikipedia.org/wiki/Chang%27e_7
- Software: Three.js (MIT), Vite (MIT), TypeScript (Apache-2.0), Vitest (MIT), Playwright (Apache-2.0), SpiceyPy (MIT), NumPy, SciPy, rasterio, pyproj.
- Fonts: Space Grotesk and JetBrains Mono (SIL Open Font License), via Fontsource.
- 3D model: Starship by I_am_Darth, Thingiverse 7369010, CC BY-NC-SA (non-commercial; adapted).
- AI tools: Anthropic Claude Code; [others]; OpenRouter.

---

## 30-second video script (English, subtitled)

Record the live app at 1920 × 1080. Keep text large and the cursor slow. End on the URL.

| Time | Screen | Voice / subtitle |
|---|---|---|
| 0–4 s | 3D Moon from below the south pole, Sun beam skimming the horizon | "At the Moon's south pole, the Sun barely rises. One hill can cut power for days." |
| 4–10 s | Click the 88° S point: "Sun +1.4° · terrain +19.8° · margin −18.4°", then Malapert with "Sets 14 Dec 01:45 UTC" | "Touchdown shows the Sun and Earth on the real NASA LOLA horizon, and exactly when they set." |
| 10–16 s | Click "Launch slipped: which week still works?": 52-week calendar, click a week, press Share | "Launch slipped? Compare sites and dates in seconds, and share the exact scenario." |
| 16–21 s | 1 km grid: 61 % → 79.5 % | "Move one kilometre, gain twenty points of sunlight." |
| 21–26 s | Energy and battery facts, then "Any coordinates" with IM-2 | "Energy, battery size, any coordinates, in your browser." |
| 26–30 s | Green "checked against JPL Horizons" badge, then title card with URL and team name | "Validated against JPL Horizons. Touchdown — True Larpers, Paris." |

Fallback if no video: a deck of 7 slides or fewer.
1. Title and team
2. The problem
3. Demo: site view
4. Compare and calendar
5. 1 km grid and energy
6. Validation and NASA data
7. Impact and link

## Awards to aim for
- Best Use of Data
- Best Use of Science
- Most Inspirational or Best Storytelling, if the education angle comes through in the video
