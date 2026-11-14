# Touchdown south-pole planner — checks of 14 November 2026

Branch: `claude/south-pole-mission-planner`, from `main` (a97b36b). Application: `touchdown/`.

This records what was run and seen. It is not a scientific validation: every scenario in the dataset stays `not_validated`.

## What changed

The cinematic view became a planner for the lunar south pole:

- Sites: the three study points are the candidates and are ranked. Chandrayaan-3 and IM-1 are polar references. The other landings show only in the "all sites" scope.
- A click on a site shows its numbers at once. The landing flight is a separate button, refused when the Sun is not visible at the chosen time.
- Time left before the next set or rise of the Sun and of the Earth, from the published events.
- Earth: visibility windows, share, longest blackout, a beam from the site and a line of sight on the ground.
- A second tab compares sites and dates: ranking, requirement check, 2 or 3 sites side by side, 52-week calendar, 1 km grids, method and limits.
- French and English. Mast height 2 m or 10 m.

## Observed checks

- `npm test` in `touchdown/`: **78 passed**, 8 files. Among them:
  - the Pareto set computed in the browser equals the non-dominated set of **all 104** comparisons in `comparisons/`;
  - the Sun and Earth directions rebuilt from azimuth and elevation match the sub-solar latitude and the sub-Earth point of the dataset;
  - countdown events, ranking ties, requirement checks, site grouping, chart helpers.
- `npm run typecheck`: no error.
- `npm run build`: passed, with the integrity check of **4,013** dataset files and **1,872** browser gzip copies.
- `npm run test:e2e` against a plain static server on `touchdown/dist/`: **12 checks passed**, no page error, no failed data request. Raw result: [touchdown-south-pole-planner-browser-v1.json](touchdown-south-pole-planner-browser-v1.json).
  - For the five polar sites: Sun and Earth elevation at sample 2160 and the three 30-day shares on screen equal the delivered data, with no flight started.
  - `sp_s8800` (0 % Sun): landing refused. `sp_s8600` at a sunlit time: landing reaches the ground and "Back" returns to the site.
  - Compare tab: candidates ranked on the published Sun + Earth share; 3 sites side by side; calendar and the three 5 x 5 grids drawn; all 13 sites with the geometric model; Apollo 15 on 2027-11-23 equals the dataset.
  - Width 390 px: both tabs fit the viewport.
- `pytest` at the repository root: **68 passed**, 9 skipped (the skipped ones need the raw kernels).
- By hand in the browser, 1440 x 900: overview, site view with Sun and Earth beams, full landing, ground view with compass, arrows, Earth line and far relief, English, all-sites scope, 10 m mast, guide, assistant. Console: no error.
- AI assistant: one live question through the local service returned an answer with 13 evidence cards and 9 limits in 5.4 s.

## Not checked

- Frame rate on other machines. Safari and Firefox.
- The operating system "reduce motion" setting by hand (the browser check runs with it on).
- A public deployment. Nothing was pushed.
