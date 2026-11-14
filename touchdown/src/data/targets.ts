/**
 * Sites added to the catalogue of the dataset: a recent CLPS landing, an
 * Artemis III candidate region and two landings of other space agencies.
 *
 * The dataset has no scenario for them, so Sun and Earth are rebuilt in the
 * browser by geometry (see custom.ts): smooth sphere, terrain ignored. They
 * are always marked "geometric estimate". Each position has its source; none
 * is guessed. Checked on 2026-11-14.
 */
import type { Site } from "./dataset";

export interface TargetSource {
  title: string;
  url: string;
}

const target = (id: string, name: string, mission: string, status: Site["status"], latDeg: number, lonDeg: number, source: TargetSource): Site => ({
  id,
  name,
  mission,
  status,
  latDeg,
  lonDeg,
  terrainProduct: null,
  verification: "single_source",
  scenarioIds: [],
  computed: true,
  source,
});

export const EXTRA_SITES: Site[] = [
  target("x_im2", "IM-2 Athena – Mons Mouton (CLPS)", "IM-2", "historical", -84.78, 29.13, {
    title: "LROC, IM-2 Landing Region (intended landing site)",
    url: "https://www.lroc.asu.edu/images/1401",
  }),
  target("x_mouton", "Mons Mouton – Artemis III", "Artemis III candidate region", "announced", -84.528, 30.719, {
    title: "LPSC 2025, abstract 2742: a site studied inside the Mons Mouton candidate region (not the region centre)",
    url: "https://www.hou.usra.edu/meetings/lpsc2025/pdf/2742.pdf",
  }),
  target("x_change6", "Chang'e 6 – Apollo basin (far side)", "Chang'e 6", "historical", -41.6385, -153.9852, {
    title: "LROC, First Look: Chang'e 6",
    url: "https://lroc.im-ldi.com/images/1374",
  }),
  target("x_slim", "SLIM – Shioli", "SLIM", "historical", -13.316, 25.251, {
    title: "LROC, JAXA SLIM Landing",
    url: "https://www.lroc.asu.edu/images/1358",
  }),
];
