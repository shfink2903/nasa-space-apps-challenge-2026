# Touchdown build verification — 14 November 2026

Branch: `claude/landing`. Application: `touchdown/`.

## Fix

Previously, Vite's development and preview middleware served `/data/v1/` from
the repository while the production directory contained no dataset. Preview
could therefore work even though a standalone deployment was incomplete.

The build now copies the full frozen dataset into `touchdown/dist/data/v1/`,
creates opaque `.gz.bin` series copies for browser decompression, and checks
every file's size and SHA-256 against the source manifest. Preview serves the
built files without a repository fallback. Development resolves the same browser
URLs directly to the source gzip files. Scientific source files are unchanged.

## Observed checks

- `npm test`: **30 passed**, across 5 test files. Includes missing-file and
  altered-browser-series regressions.
- `npm run build`: passed, including TypeScript and integrity verification of
  **4,013 manifest files** and **1,872 browser gzip copies**.
- Browser check: `npm run test:e2e` passed against a plain Python HTTP server
  rooted exclusively at `touchdown/dist/`, at `http://127.0.0.1:4180`.
- All **13 sites** checked: displayed Sun/Earth elevations and solar fraction
  match delivered data at sample 2160. All five terrain-aware sites were exercised.
- Second start date and final sample 4320 checked for `sp_s8600`.
- Mobile width check passed. No uncaught browser errors or failed data responses.

Raw browser results: [touchdown-build-browser-v1.json](touchdown-build-browser-v1.json).
Reproduction commands: [Touchdown README](../../touchdown/README.md).

This verifies the local production artifact and the exercised UI behavior.
No remote deployment or push was performed. Scientific validation status remains
unchanged; these software checks do not establish mission feasibility.
