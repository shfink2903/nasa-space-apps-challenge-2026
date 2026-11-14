import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./style.css";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  availableDates,
  indexAt,
  loadDerived,
  loadHorizon,
  loadScenario,
  loadSeries,
  loadSeriesById,
  loadSites,
  parseScenarioId,
  pickScenarioId,
  sampleSeries,
  sweepValue,
  visibilityAt,
  type HorizonProfile,
  type Scenario,
  type Series,
  type Site,
} from "./data/dataset";
import { CUSTOM_ID, customMetrics, customScenario, customSeries, customSite } from "./data/custom";
import { EXTRA_SITES } from "./data/targets";
import { DEFAULT_CRITERIA, verdictAt, type Criteria } from "./data/mission";
import { inRegion } from "./data/ranking";
import { Director } from "./scene/director";
import { OrbitScene } from "./scene/orbitScene";
import { Stage } from "./scene/renderer";
import { createHullEnvironment } from "./scene/sky";
import { SurfaceScene } from "./scene/surfaceScene";
import { createStore, type Actions, type Mode } from "./state";
import { createCaption } from "./ui/caption";
import { createCompare } from "./ui/compare";
import { h } from "./ui/dom";
import { formatPercent0, siteLabel } from "./ui/format";
import { createTopBar } from "./ui/topbar";
import { createSiteList } from "./ui/sitelist";
import { createSitePanel } from "./ui/sitepanel";
import { LANG, T } from "./ui/strings";
import { createTimeBar } from "./ui/timebar";
import { createTour } from "./ui/tour";

const REFERENCE_SITE = "apollo11";
const STEPS_PER_HOUR = 6; // the display series has one step per 600 s

const $ = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;
const canvas = $<HTMLCanvasElement>("scene");
const hud = $("hud");
const pinLayer = $("pins");
const veil = $("veil");
const loader = $("loader");
const toast = $("toast");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Display level: plain words by default, the scientist view on request (?mode=expert or the switch). */
function readMode(): Mode {
  const asked = new URLSearchParams(window.location.search).get("mode");
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("touchdown.mode");
  } catch {
    // Storage can be blocked: the default display is used.
  }
  return (asked ?? stored) === "expert" ? "expert" : "simple";
}

/** The user's thresholds are kept between visits. Anything unreadable falls back to the team default. */
function readCriteria(): Criteria {
  try {
    const saved = JSON.parse(window.localStorage.getItem("touchdown.criteria") ?? "null") as Partial<Criteria> | null;
    if (saved && typeof saved.minSun === "number" && typeof saved.minEarth === "number") {
      return { minSun: saved.minSun, minEarth: saved.minEarth, maxNightH: typeof saved.maxNightH === "number" ? saved.maxNightH : null };
    }
  } catch {
    // Blocked storage or bad content: the default is used.
  }
  return { ...DEFAULT_CRITERIA };
}

document.documentElement.lang = LANG;
document.title = T.pageTitle;
$("loader-text").textContent = T.loading;

let toastTimer = 0;
function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 6000);
}

interface SiteData {
  scenario: Scenario;
  series: Series;
  horizon: HorizonProfile | null;
}

async function loadSiteData(site: Site, date: string, heightM: number, signal: AbortSignal): Promise<SiteData> {
  const id = pickScenarioId(site, date, heightM);
  if (!id) throw new Error(`No scenario for ${site.id} on ${date}`);
  const scenario = await loadScenario(id, signal);
  const [series, horizon] = await Promise.all([loadSeries(scenario, signal), loadHorizon(scenario, signal)]);
  return { scenario, series, horizon };
}

function loadTexture(manager: THREE.LoadingManager, url: string, srgb: boolean): Promise<THREE.Texture> {
  return new THREE.TextureLoader(manager).loadAsync(url).then((texture) => {
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  });
}

async function boot(): Promise<void> {
  const stage = new Stage(canvas);
  const store = createStore({
    mode: readMode(),
    criteria: readCriteria(),
    compareTab: "date",
    sites: [],
    dates: [],
    date: "",
    siteId: null,
    heightM: 2,
    rankBy: "overlap",
    region: "south",
    compareOpen: false,
    customTick: 0,
    hoverId: null,
    index: 0,
    playing: false,
    speedH: 6,
    phase: "cruise",
    series: null,
    scenario: null,
    horizon: null,
    lightSiteId: null,
  });

  // --- Data: catalogue and compact index first, then the series that lights the first view. ---
  const [catalogue, derived] = await Promise.all([loadSites(), loadDerived()]);
  // The dataset catalogue, then the sourced sites it lacks (CLPS, Artemis, other agencies).
  const sites = [...catalogue, ...EXTRA_SITES];
  const reference = sites.find((s) => s.id === REFERENCE_SITE) ?? sites[0];
  const dates = availableDates(reference);
  let loadAbort = new AbortController();
  const first = await loadSiteData(reference, dates[0], 2, loadAbort.signal);

  // --- Assets. ---
  const fill = $("loader-fill");
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => (fill.style.width = `${Math.round((loaded / total) * 100)}%`);
  const small = Math.min(window.screen.width, window.screen.height) < 800 || stage.maxTextureSize < 8192;
  const [moonColor, moonSlope, earth, gltf] = await Promise.all([
    loadTexture(manager, small ? "/textures/moon_color_4k.jpg" : "/textures/moon_color_8k.jpg", true),
    loadTexture(manager, "/textures/moon_slope_4k.jpg", false),
    loadTexture(manager, "/textures/earth_2k.jpg", true).catch(() => null),
    new GLTFLoader(manager).loadAsync("/models/starship.glb"),
  ]);
  const hullEnv = createHullEnvironment(stage.renderer);
  const orbit = new OrbitScene({ moonColor, moonSlope, earth, ship: gltf.scene, hullEnv });
  const surface = new SurfaceScene({ earth, ship: gltf.scene, hullEnv }, canvas);
  const director = new Director(stage, orbit, surface, veil, (phase) => store.set({ phase }));

  // Build the ground once now, so the first landing does not wait for shader compilation.
  surface.prepare(reference, null, sampleSeries(first.series, 0));
  stage.renderer.compile(surface.scene, surface.camera);

  // --- Actions. ---
  const siteById = (id: string | null): Site | undefined => store.get().sites.find((s) => s.id === id);

  // --- Free point: any lunar coordinates, by geometry from the reference site (see data/custom.ts). ---
  const refCache = new Map<string, Promise<Series>>();
  /** Published series of the reference site for a date and a height. Kept: the year of a free point reuses them. */
  const refSeries = (date: string, heightM: number): Promise<Series> => {
    const key = `${date}|${heightM}`;
    let hit = refCache.get(key);
    if (!hit) {
      const id = pickScenarioId(reference, date, heightM, "geometric");
      hit = id ? loadSeriesById(id) : Promise.reject(new Error(`No reference scenario on ${date}`));
      hit.catch(() => refCache.delete(key));
      refCache.set(key, hit);
    }
    return hit;
  };
  const loadCustom = async (site: Site, date: string, heightM: number): Promise<SiteData> => {
    const series = customSeries(reference, await refSeries(date, heightM), site.latDeg, site.lonDeg, heightM);
    return { scenario: customScenario(series, date, heightM, site.id), series, horizon: null };
  };
  /**
   * Fills the 52 weekly starts of the computed sites (free point, added sites), a few dates at a time, so
   * their year strip, their verdict and their compare rows appear. One run per group; a new run replaces it.
   */
  const yearRuns = new Map<string, number>();
  const fillYear = (group: string, list: Site[], heightM: number): void => {
    const run = (yearRuns.get(group) ?? 0) + 1;
    yearRuns.set(group, run);
    const live = (): boolean => yearRuns.get(group) === run;
    const all = store.get().dates;
    const tables = list.map((site) => {
      const values: Record<string, (number | null)[]> = {};
      for (const id of derived.metricIds) values[id] = all.map(() => null);
      derived.sweeps[`${site.id}|${heightM}|geometric`] = { dates: all, validationStatus: "not_validated", values };
      return values;
    });
    // The selected date first, then the rest of the year.
    const queue = [...all].sort((a, b) => Number(b === store.get().date) - Number(a === store.get().date));
    const worker = async (): Promise<void> => {
      for (let date = queue.shift(); date !== undefined && live(); date = queue.shift()) {
        try {
          const ref = await refSeries(date, heightM);
          if (!live()) return;
          const i = all.indexOf(date);
          list.forEach((site, k) => {
            const metrics = customMetrics(customSeries(reference, ref, site.latDeg, site.lonDeg, heightM)).values;
            for (const id of derived.metricIds) tables[k][id][i] = metrics[id] ?? null;
          });
          store.set({ customTick: store.get().customTick + 1 });
        } catch (err) {
          console.error(err);
        }
      }
    };
    for (let k = 0; k < 4; k++) void worker();
  };
  const fillCustomYear = (site: Site, heightM: number): void => fillYear("free", [site], heightM);

  /** Data of the selected site, as a promise: the flight waits for it. */
  let siteData: Promise<{ horizon: HorizonProfile | null }> | null = null;

  /** Loads the series of a site for the current date and height, and makes it the active one. */
  const loadActive = (site: Site, date: string, heightM: number): Promise<{ horizon: HorizonProfile | null }> => {
    loadAbort.abort();
    loadAbort = new AbortController();
    const load = site.computed ? loadCustom(site, date, heightM) : loadSiteData(site, date, heightM, loadAbort.signal);
    const signal = loadAbort.signal;
    return load.then((d) => {
      if (signal.aborted) throw new DOMException("Superseded", "AbortError");
      if (pendingTimeMs !== null) {
        // A date and time was asked: place the cursor on it now that its 30 days are here.
        store.set({ index: indexAt(d.series, pendingTimeMs), playing: false });
        pendingTimeMs = null;
      }
      store.set({ series: d.series, scenario: d.scenario, horizon: d.horizon, lightSiteId: site.id });
      return { horizon: d.horizon };
    });
  };
  const reportError = (err: Error): void => {
    if (err.name === "AbortError") return;
    console.error(err);
    showToast(T.siteError);
  };

  let dateTimer = 0;
  let pendingTimeMs: number | null = null;
  const startMs = (date: string): number => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
  const actions: Actions = {
    /** Zoom on the site and open its sheet at once. The flight is a separate, explicit step. */
    selectSite(id) {
      const site = siteById(id);
      const state = store.get();
      if (!site || (state.siteId === id && state.phase !== "cruise")) return;
      store.set({ siteId: id, hoverId: null });
      const data = loadActive(site, state.date, state.heightM);
      siteData = data;
      director.focus(site);
      data.catch((err: Error) => {
        reportError(err);
        if (err.name !== "AbortError" && store.get().siteId === id) actions.back();
      });
    },
    selectPoint(latDeg, lonDeg) {
      const site = customSite(latDeg, lonDeg);
      site.name = T.customName;
      const state = store.get();
      // A new place for the free point: forget the old one, then open it like any site.
      store.set({ sites: [...state.sites.filter((x) => x.status !== "custom"), site], siteId: state.siteId === CUSTOM_ID ? null : state.siteId });
      fillCustomYear(site, state.heightM);
      actions.selectSite(CUSTOM_ID);
    },
    land() {
      const s = store.get();
      const site = siteById(s.siteId);
      if (!site || s.phase !== "focus" || !siteData || !s.scenario || !s.series || s.lightSiteId !== site.id) return;
      // The series of a new date loads a moment after the date changes: wait for it.
      if (parseScenarioId(s.scenario.scenarioId)?.date !== s.date) return;
      // No Sun at the site at the chosen time: no landing (the caption offers the next sunrise instead).
      if (!visibilityAt(s.scenario, "sun.anyDisk", sampleSeries(s.series, s.index).tMs).visible) return;
      // The site does not meet the user's mission criteria for this date: no landing either.
      if (verdictAt(derived, site, s.heightM, s.date, s.criteria).status === "nogo") return;
      director.startFlight(site, siteData, reducedMotion.matches);
    },
    hover: (id) => {
      if (store.get().hoverId !== id) store.set({ hoverId: id });
    },
    /** The date changes at once (ranking, calendars). The 30-day series follows after a short pause, so a dragged date does not load every week on the way. */
    setDate(date) {
      const state = store.get();
      if (date === state.date || !state.dates.includes(date)) return;
      store.set({ date });
      window.clearTimeout(dateTimer);
      dateTimer = window.setTimeout(() => {
        const s = store.get();
        const site = siteById(s.lightSiteId);
        if (!site) return;
        const data = loadActive(site, s.date, s.heightM);
        if (site.id === s.siteId) siteData = data;
        data.catch(reportError);
      }, 220);
    },
    setHeight(heightM) {
      const state = store.get();
      const site = siteById(state.lightSiteId);
      if (!site || heightM === state.heightM) return;
      store.set({ heightM });
      const free = state.sites.find((x) => x.status === "custom");
      if (free) fillCustomYear(free, heightM);
      fillYear("extra", EXTRA_SITES, heightM);
      const data = loadActive(site, state.date, heightM);
      if (site.id === state.siteId) siteData = data;
      data.catch(reportError);
    },
    setRankBy: (rankBy) => store.set({ rankBy }),
    setRegion: (region) => store.set({ region }),
    setMode(mode) {
      try {
        window.localStorage.setItem("touchdown.mode", mode);
      } catch {
        // Ignored: the choice then lasts for this visit only.
      }
      store.set({ mode });
    },
    setCompare: (compareOpen, tab) => store.set(tab ? { compareOpen, compareTab: tab } : { compareOpen }),
    setCriteria(patch) {
      const criteria = { ...store.get().criteria, ...patch };
      try {
        window.localStorage.setItem("touchdown.criteria", JSON.stringify(criteria));
      } catch {
        // Ignored: the thresholds then last for this visit only.
      }
      store.set({ criteria });
    },
    goToTime(tMs) {
      const s = store.get();
      // The weekly start that contains this time: the latest one that begins before it.
      const date = [...s.dates].reverse().find((d) => startMs(d) <= tMs);
      if (!date || tMs > startMs(date) + 30 * 86_400_000) return showToast(T.outOfRange);
      if (date === s.date && s.series) return actions.jumpTo(tMs);
      pendingTimeMs = tMs;
      actions.setDate(date);
    },
    startTour: () => tour.start(),
    jumpTo(tMs) {
      const { series } = store.get();
      if (series) store.set({ index: indexAt(series, tMs), playing: false });
    },
    setIndex: (index) => store.set({ index }),
    togglePlay() {
      const s = store.get();
      const atEnd = s.series !== null && s.index >= s.series.n - 1;
      store.set({ playing: !s.playing, index: !s.playing && atEnd ? 0 : s.index });
    },
    setSpeed: (speedH) => store.set({ speedH }),
    skip: () => director.skip(),
    /** From the flight or the ground: back to the site sheet. From the sheet: back to the overview. */
    back() {
      const s = store.get();
      const site = siteById(s.siteId);
      if (s.phase !== "focus" && s.phase !== "cruise" && site) {
        director.focus(site);
        return;
      }
      director.back();
      store.set({ siteId: null });
    },
  };

  // --- Interface. ---
  const pins = new Map<string, HTMLButtonElement>();
  const tour = createTour(store, actions);
  hud.append(
    createTopBar(store, actions),
    h("div", { class: "rail rail-left" }, createSitePanel(store, actions, derived)),
    h("div", { class: "rail rail-right" }, createSiteList(store, actions, derived)),
    createCaption(store, actions),
    createTimeBar(store, actions),
    tour.el,
    createCompare(store, actions, derived),
  );
  const addPin = (site: Site): void => {
    const kind = site.status === "study_point" ? "is-study" : site.status === "custom" ? "is-custom" : "";
    const pin = h(
      "button",
      { class: `pin ${kind}`, type: "button", tabindex: -1 },
      h("span", { class: "pin-label" }, siteLabel(site).title, h("small", { "data-stats": site.id })),
    );
    pin.addEventListener("click", () => actions.selectSite(site.id));
    pin.addEventListener("pointerenter", () => actions.hover(site.id));
    pin.addEventListener("pointerleave", () => actions.hover(null));
    pins.set(site.id, pin);
    pinLayer.append(pin);
  };
  for (const site of sites) addPin(site);
  store.subscribe((s, p) => {
    if (s.sites !== p.sites && s.sites.some((x) => x.status === "custom") && !pins.has(CUSTOM_ID)) addPin(s.sites.find((x) => x.status === "custom")!);
    if (s.date !== p.date || s.heightM !== p.heightM || s.sites !== p.sites || s.customTick !== p.customTick) {
      // Hover text of each point: its two 30-day shares for the chosen date.
      const share = (site: Site, id: string): string => {
        const v = sweepValue(derived, site, s.heightM, s.date, id);
        return v === null ? "—" : formatPercent0(v);
      };
      for (const site of s.sites) {
        const el = pins.get(site.id)?.querySelector<HTMLElement>("[data-stats]");
        if (el) el.textContent = T.pinStats(share(site, "sun.anyDisk.fraction"), share(site, "earth.anyDisk.fraction"));
      }
    }
    if (s.region !== p.region || s.sites !== p.sites) {
      // Sites outside the chosen region stay clickable, but smaller: they are the reference, not the subject.
      for (const site of s.sites) pins.get(site.id)?.classList.toggle("is-dim", !inRegion(site, s.region));
    }
    if (s.hoverId !== p.hoverId) for (const [id, pin] of pins) pin.classList.toggle("is-hover", id === s.hoverId);
    if (s.phase !== p.phase) document.body.dataset.phase = s.phase;
    if (s.mode !== p.mode) document.body.dataset.mode = s.mode;
  });
  document.body.dataset.phase = "cruise";
  document.body.dataset.mode = store.get().mode;

  store.set({
    sites,
    dates,
    date: dates[0],
    series: first.series,
    scenario: first.scenario,
    horizon: first.horizon,
    lightSiteId: reference.id,
  });

  // The added sites get their year in the background, once the first view is on screen.
  fillYear("extra", EXTRA_SITES, store.get().heightM);

  // --- Input. ---
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (store.get().phase !== "cruise") return;
      event.preventDefault();
      director.approach(event.deltaY * 0.0006);
    },
    { passive: false },
  );
  let dragY: number | null = null;
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    dragY = e.clientY;
    down = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => (dragY = null));
  // A plain click on the Moon (no drag) drops the free point there.
  canvas.addEventListener("pointerup", (e) => {
    const start = down;
    down = null;
    const phase = store.get().phase;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5 || (phase !== "cruise" && phase !== "focus")) return;
    const rect = canvas.getBoundingClientRect();
    const hit = orbit.pick(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    if (hit) actions.selectPoint(hit.latDeg, hit.lonDeg);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragY === null || store.get().phase !== "cruise") return;
    director.approach((dragY - e.clientY) * 0.002);
    dragY = e.clientY;
  });
  window.addEventListener("keydown", (event) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const s = store.get();
    if (event.key === " " && tag !== "BUTTON") {
      event.preventDefault();
      actions.togglePlay();
    } else if (event.key === "Escape" && s.compareOpen) {
      actions.setCompare(false);
    } else if (event.key === "Escape" && s.phase !== "cruise") {
      actions.back();
    } else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && s.series) {
      const step = (event.key === "ArrowRight" ? 1 : -1) * STEPS_PER_HOUR;
      actions.setIndex(Math.min(s.series.n - 1, Math.max(0, s.index + step)));
    }
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showToast(T.contextLost);
  });
  canvas.addEventListener("webglcontextrestored", () => window.location.reload());

  // Development hook: lets a test freeze time and inspect one moment of a shot.
  const debug = { store, actions, director, timeScale: 1 };
  if (import.meta.env.DEV) (window as unknown as { __touchdown: typeof debug }).__touchdown = debug;

  // --- Frame loop. ---
  let last = performance.now();
  let timeS = 0;
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const realDt = (now - last) / 1000;
    const dt = Math.min(0.1, realDt) * debug.timeScale;
    last = now;
    if (document.hidden) return;
    timeS += dt;

    let s = store.get();
    if (s.playing && s.series) {
      const end = s.series.n - 1;
      const index = Math.min(end, s.index + dt * s.speedH * STEPS_PER_HOUR);
      store.set({ index, playing: index < end });
      s = store.get();
    }
    const lightSite = siteById(s.lightSiteId);
    if (!s.series || !lightSite) return;
    director.update(dt, timeS, sampleSeries(s.series, s.index), lightSite, realDt);

    const showPins = s.phase === "cruise" || s.phase === "focus";
    pinLayer.classList.toggle("is-hidden", !showPins);
    if (showPins) {
      for (const p of orbit.projectPins(s.sites, canvas.clientWidth, canvas.clientHeight)) {
        const pin = pins.get(p.id)!;
        pin.classList.toggle("is-off", !p.visible);
        pin.classList.toggle("is-selected", p.id === s.siteId);
        if (p.visible) pin.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }
    }
  };
  requestAnimationFrame(frame);

  loader.classList.add("is-done");
  window.setTimeout(() => loader.remove(), 900);
}

boot().catch((err) => {
  console.error(err);
  $("loader-text").textContent = T.loadError;
  loader.classList.add("is-error");
});
