/**
 * Builds public/derived/v1.json: a compact index of values already published in
 * data/processed/v1 (date sweeps, DATA comparisons, 1 km sensitivity grids).
 *
 * Nothing is computed here. Every number is copied as published, so the
 * interface can rank and compare sites without loading ~30 MB of source files.
 * Run again after a new dataset release: `npm run prepare:derived`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = process.env.LUNAR_DATASET_VERSION ?? "v1";
if (!/^v[\w.-]+$/.test(VERSION)) throw new Error("Invalid LUNAR_DATASET_VERSION");
const ROOT = resolve(here, "../../data/processed", VERSION);
const OUT = resolve(here, "../public/derived", `${VERSION}.json`);

export const METRIC_IDS = [
  "sun.anyDisk.fraction",
  "earth.anyDisk.fraction",
  "overlap.sunAny_earthAny.fraction",
  "sun.anyDisk.longestGapH",
  "earth.anyDisk.longestGapH",
  "sun.maxElevDeg",
  "earth.maxElevDeg",
];

const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const list = (dir) => existsSync(resolve(ROOT, dir)) ? readdirSync(resolve(ROOT, dir)).filter((f) => f.endsWith(".json")).sort() : [];
const dateOf = (scenarioId) => /_(\d{8})_30d_/.exec(scenarioId)?.[1] ?? null;
const valueOf = (metrics, id) => metrics.find((m) => m.metricId === id)?.value ?? null;

const sweeps = {};
for (const file of list("sweeps")) {
  const doc = read(`sweeps/${file}`);
  const values = {};
  for (const id of METRIC_IDS) values[id] = doc.rows.map((row) => valueOf(row.metrics, id));
  sweeps[`${doc.siteId}|${Number(doc.heightM)}|${doc.modelLevel}`] = {
    terrainMethodId: doc.terrainMethodId ?? null,
    coverageStatus: doc.rows.map((row) => row.coverageStatus),
    dates: doc.rows.map((row) => row.surfaceStartUtc.slice(0, 10).replaceAll("-", "")),
    validationStatus: [...new Set(doc.rows.map((row) => row.validationStatus))].join(","),
    values,
  };
}

const comparisons = {};
for (const file of list("comparisons")) {
  const doc = read(`comparisons/${file}`);
  const date = dateOf(doc.scenarioIds[0]);
  if (!date) throw new Error(`No date in ${file}`);
  const key = doc.heightM === undefined ? `${date}|${doc.modelLevel}` : `${date}|${doc.modelLevel}|${doc.heightM}|${doc.terrainMethodId ?? "legacy"}`;
  if (comparisons[key]) throw new Error(`Duplicate comparison key ${key}`);
  comparisons[key] = {
    comparisonId: doc.comparisonId,
    exploredCount: doc.exploredCount,
    criteria: doc.method.criteria.map((c) => ({ metricId: c.metricId, direction: c.direction })),
    nonDominated: doc.nonDominatedScenarioIds,
  };
}

const sensitivity = {};
for (const file of list("sensitivity")) {
  const doc = read(`sensitivity/${file}`);
  sensitivity[`${doc.siteId}|${Number(doc.heightM)}`] = {
    date: dateOf(doc.rows[0].scenarioId),
    modelLevel: doc.modelLevel,
    validationStatus: doc.validationStatus,
    spacingKm: doc.grid.spacingKm,
    size: doc.grid.size,
    limits: doc.limits,
    ranges: doc.ranges
      .filter((r) => METRIC_IDS.includes(r.metricId))
      .map((r) => ({ metricId: r.metricId, min: r.min, max: r.max, knownCount: r.knownCount, totalCount: r.totalCount })),
    cells: doc.rows.map((row) => ({
      northKm: row.northOffsetKm,
      eastKm: row.eastOffsetKm,
      sun: valueOf(row.metrics, "sun.anyDisk.fraction"),
      earth: valueOf(row.metrics, "earth.anyDisk.fraction"),
    })),
  };
}

const manifest = read("manifest.json");
if (manifest.datasetVersion !== VERSION) throw new Error("Dataset version mismatch");
const out = {
  schemaVersion: "1.0.0",
  datasetVersion: manifest.datasetVersion ?? "v1",
  datasetManifestSha256: createHash("sha256").update(readFileSync(resolve(ROOT, "manifest.json"))).digest("hex"),
  note: "Compact copy of published values (sweeps, comparisons, sensitivity). No value is computed here.",
  metricIds: METRIC_IDS,
  sweeps,
  comparisons,
  sensitivity,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `derived/${VERSION}.json: ${Object.keys(sweeps).length} sweeps, ${Object.keys(comparisons).length} comparisons, ` +
    `${Object.keys(sensitivity).length} sensitivity grids, ${(JSON.stringify(out).length / 1024).toFixed(0)} kB`,
);
