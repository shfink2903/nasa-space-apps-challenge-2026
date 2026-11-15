import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./charts/charts-time.css";
import "./charts/charts-grid.css";
import "./style.css";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { availableDates, loadSites, sampleSeries, type Site } from "./data/dataset";
import { Resources, type Bundle } from "./data/resources";
import { initialLocale, saveLocale, strings } from "./i18n";
import { groupOf, isPolar, orderedSites, scopeSites } from "./planner/catalog";
import { bundleFor, focusSite, rankingFor, scenarioIdFor, siteById } from "./planner/select";
import { Director } from "./scene/director";
import { OrbitScene } from "./scene/orbitScene";
import { Stage } from "./scene/renderer";
import { createHullEnvironment } from "./scene/sky";
import { SurfaceScene } from "./scene/surfaceScene";
import { createStore, type Actions } from "./state";
import { createAssistant } from "./ui/assistant";
import { createUi } from "./ui/context";
import { createDataView } from "./ui/data/dataView";
import { h } from "./ui/dom";
import { createFlightBar } from "./ui/explorer/flightBar";
import { createSiteCard } from "./ui/explorer/siteCard";
import { createSiteList } from "./ui/explorer/siteList";
import { createTimePanel } from "./ui/explorer/timePanel";
import { createFormat } from "./ui/format";
import { createGuide } from "./ui/guide";
import { createTopBar } from "./ui/topbar";
import { decodeState, encodeState } from "./ui/share";

// Open on the sunniest study point (near Malapert massif): a first screen that shows a workable site.
const FIRST_SITE = "sp_s8600";
/** Base of the static assets: "./" in a build, "/" in dev. */
const ASSETS = import.meta.env?.BASE_URL ?? "/";
const STEPS_PER_HOUR = 6; // the display series has one step per 600 s
const MAX_COMPARE = 3;

const $ = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;
const canvas = $<HTMLCanvasElement>("scene");
const root = $("ui");
const pinLayer = $("pins");
const veil = $("veil");
const loader = $("loader");
const toast = $("toast");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => (toast.hidden = true), 5000);
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
  const locale = initialLocale();
  document.documentElement.lang = locale;
  $("loader-text").textContent = strings(locale).loading;
  let stage: Stage;
  try {
    stage = new Stage(canvas);
  } catch (error) {
    // Without WebGL the 3D view cannot start. Say so plainly instead of blaming the dataset.
    throw Object.assign(new Error("webgl"), { cause: error, webgl: true });
  }

  // --- Data: the catalogue first. Everything else loads when a view asks for it. ---
  const sites = orderedSites(await loadSites());
  const dates = availableDates(sites[0]);
  const store = createStore({
    locale,
    tab: "explorer",
    sites,
    dates,
    date: dates[0],
    heightM: 2,
    scope: "polar",
    criterion: "balanced",
    // Example limits. The user can change or turn off each one.
    requirements: { minSunShare: 0.25, minEarthShare: 0.25, maxDarkH: 360 },
    focusId: sites.find((s) => s.id === FIRST_SITE)?.id ?? sites[0].id,
    compareIds: [],
    hoverId: null,
    index: 0,
    playing: false,
    speedH: 6,
    phase: "cruise",
    autoFlight: false,
    assistantOpen: false,
    guideOpen: false,
    dataVersion: 0,
  });
  const resources = new Resources(() => store.set({ dataVersion: store.get().dataVersion + 1 }));

  // --- Assets and scenes. ---
  const fill = $("loader-fill");
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => (fill.style.width = `${Math.round((loaded / total) * 100)}%`);
  const small = Math.min(window.screen.width, window.screen.height) < 800 || stage.maxTextureSize < 8192;
  const [moonColor, moonSlope, earth, gltf] = await Promise.all([
    loadTexture(manager, small ? `${ASSETS}textures/moon_color_4k.jpg` : `${ASSETS}textures/moon_color_8k.jpg`, true),
    loadTexture(manager, `${ASSETS}textures/moon_slope_4k.jpg`, false),
    loadTexture(manager, `${ASSETS}textures/earth_2k.jpg`, true).catch(() => null),
    new GLTFLoader(manager).loadAsync(`${ASSETS}models/starship.glb`),
  ]);
  const hullEnv = createHullEnvironment(stage.renderer);
  const orbit = new OrbitScene({ moonColor, moonSlope, earth, ship: gltf.scene, hullEnv });
  const surface = new SurfaceScene({ earth, ship: gltf.scene, hullEnv }, canvas);
  const director = new Director(stage, orbit, surface, veil, (phase) => store.set({ phase }));

  /** The site and data that light the 3D view. Kept while the next choice loads, so the picture never goes blank. */
  let light: { site: Site; bundle: Bundle } | null = null;
  let userPicked = false;
  let userScrubbed = false;
  let pendingLand: string | null = null;
  let compiled = false;

  // --- A shared link opens on its scenario. ---
  const shared = decodeState(window.location.hash, sites, dates, 4320);
  if (Object.keys(shared).length) {
    store.set(shared);
    if (shared.focusId || shared.compareIds) userPicked = true;
    if (shared.index !== undefined) userScrubbed = true;
  }
  // Keep the address bar in step with the view, so copying it shares the scenario.
  let urlTimer = 0;
  store.subscribe(() => {
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      const next = encodeState(store.get());
      if (next !== window.location.hash) history.replaceState(null, "", next);
    }, 400);
  });

  // --- Actions. ---
  const actions: Actions = {
    setLocale(next) {
      if (next === store.get().locale) return;
      saveLocale(next);
      store.set({ locale: next });
      mountUi();
    },
    setTab: (tab) => store.set({ tab }),
    selectSite(id) {
      const state = store.get();
      const site = siteById(state, id);
      if (!site) return;
      userPicked = true;
      const scope = state.scope === "polar" && !isPolar(site) ? "all" : state.scope;
      store.set({ focusId: id, hoverId: null, scope });
      director.focus(site);
      pendingLand = state.autoFlight ? id : null;
    },
    hover: (id) => {
      if (store.get().hoverId !== id) store.set({ hoverId: id });
    },
    toggleCompare(id) {
      const { compareIds } = store.get();
      userPicked = true;
      if (compareIds.includes(id)) store.set({ compareIds: compareIds.filter((x) => x !== id) });
      else if (compareIds.length >= MAX_COMPARE) showToast(strings(store.get().locale).compareMax);
      else store.set({ compareIds: [...compareIds, id] });
    },
    setDate: (date) => store.set({ date }),
    shiftDate(weeks) {
      const s = store.get();
      const next = s.dates[s.dates.indexOf(s.date) + weeks];
      if (next) store.set({ date: next });
    },
    setHeight: (heightM) => store.set({ heightM }),
    setScope(scope) {
      const s = store.get();
      if (scope === s.scope) return;
      const allowed = scopeSites(s.sites, scope);
      const stay = allowed.some((x) => x.id === s.focusId);
      store.set({ scope, compareIds: s.compareIds.filter((id) => allowed.some((x) => x.id === id)) });
      if (!stay) actions.selectSite(allowed[0].id);
    },
    setCriterion: (criterion) => store.set({ criterion }),
    setRequirements: (patch) => store.set({ requirements: { ...store.get().requirements, ...patch } }),
    setIndex(index) {
      userScrubbed = true;
      store.set({ index });
    },
    setTime(tMs) {
      const series = light?.bundle.series;
      if (!series) return;
      const index = (tMs - Date.parse(series.t0Utc)) / (series.stepS * 1000);
      actions.setIndex(Math.min(series.n - 1, Math.max(0, index)));
    },
    togglePlay() {
      const s = store.get();
      const end = (light?.bundle.series.n ?? 1) - 1;
      store.set({ playing: !s.playing, index: !s.playing && s.index >= end ? 0 : s.index });
    },
    setSpeed: (speedH) => store.set({ speedH }),
    setAutoFlight: (autoFlight) => store.set({ autoFlight }),
    land() {
      const s = store.get();
      const site = focusSite(s);
      const bundle = bundleFor(s, resources, site);
      if (!bundle || (s.phase !== "cruise" && s.phase !== "focus")) return;
      // No Sun, no landing: the ship would arrive without power.
      if ((sampleSeries(bundle.series, s.index).sunState ?? 0) === 0) {
        showToast(strings(s.locale).landBlocked);
        return;
      }
      if (s.tab !== "explorer") store.set({ tab: "explorer" });
      director.startFlight(site, bundle.horizon, reducedMotion.matches);
    },
    jumpToSunrise() {
      const s = store.get();
      const bundle = bundleFor(s, resources, focusSite(s));
      if (!bundle) return;
      const from = sampleSeries(bundle.series, s.index).tMs;
      const sunrise = bundle.scenario.events
        .filter((e) => e.body === "sun" && e.convention === "anyDisk" && e.type === "rise" && Date.parse(e.tUtc) > from)
        .sort((a, b) => Date.parse(a.tUtc) - Date.parse(b.tUtc))[0];
      if (!sunrise) return;
      // One display step after the event, so the published state already shows the Sun.
      const step = bundle.series.stepS * 1000;
      const index = Math.ceil((Date.parse(sunrise.tUtc) - Date.parse(bundle.series.t0Utc)) / step) + 1;
      actions.setIndex(Math.min(bundle.series.n - 1, index));
    },
    skip: () => director.skip(),
    back: () => director.focus(focusSite(store.get())),
    overview: () => director.overview(),
    setAssistant: (assistantOpen) => store.set({ assistantOpen }),
    setGuide: (guideOpen) => store.set({ guideOpen }),
    async share() {
      const t = strings(store.get().locale);
      const url = `${window.location.href.split("#")[0]}${encodeState(store.get())}`;
      history.replaceState(null, "", url);
      try {
        await navigator.clipboard.writeText(url);
        showToast(t.linkCopied);
      } catch {
        // Clipboard blocked (http, permissions): show the link so it can be copied by hand.
        showToast(`${t.linkManual} ${url}`);
      }
    },
  };

  // --- Interface. Built again when the language changes. ---
  const pins = new Map<string, HTMLButtonElement>();
  const beamLabels = { sun: h("span", { class: "beam-label beam-sun" }), earth: h("span", { class: "beam-label beam-earth" }) };
  let ui: ReturnType<typeof createUi> | null = null;

  function mountUi(): void {
    ui?.dispose();
    const s = store.get();
    const t = strings(s.locale);
    const fmt = createFormat(t);
    document.documentElement.lang = s.locale;
    document.title = `${t.brand} — ${t.tagline}`;
    canvas.setAttribute("aria-label", t.tabExplorer);
    surface.setCompassLetters(t.compass);
    ui = createUi(store, actions, resources, t, fmt);

    root.replaceChildren(
      createTopBar(ui),
      h(
        "div",
        { class: "explorer" },
        h("div", { class: "rail rail-left" }, createSiteCard(ui)),
        h("div", { class: "rail rail-right" }, createTimePanel(ui), createSiteList(ui)),
        createFlightBar(ui),
        h("p", { class: "footer", text: t.footer }),
      ),
      createDataView(ui),
      createAssistant(ui),
      createGuide(ui),
    );

    pins.clear();
    pinLayer.replaceChildren(beamLabels.sun, beamLabels.earth);
    for (const site of s.sites) {
      const pin = h("button", { class: `pin pin-${groupOf(site)}`, type: "button", tabindex: -1 }, h("span", { class: "pin-label", text: fmt.site(site) }));
      pin.addEventListener("click", () => actions.selectSite(site.id));
      pin.addEventListener("pointerenter", () => actions.hover(site.id));
      pin.addEventListener("pointerleave", () => actions.hover(null));
      pins.set(site.id, pin);
      pinLayer.append(pin);
    }
    ui.watch(
      (state) => [state.hoverId, state.focusId, state.tab, state.phase],
      (state) => {
        for (const [id, pin] of pins) {
          pin.classList.toggle("is-hover", id === state.hoverId);
          pin.classList.toggle("is-selected", id === state.focusId);
        }
        document.body.dataset.tab = state.tab;
        document.body.dataset.phase = state.phase;
      },
    );
  }
  mountUi();

  // First results: show the best site and compare the top three, unless the user already chose.
  store.subscribe((s) => {
    if (userPicked) return;
    const ranking = rankingFor(s, resources);
    if (!ranking.complete || ranking.rows.length === 0) return;
    userPicked = true;
    // The candidates side by side. The focus stays on the opening site, which meets the example requirements.
    store.set({ compareIds: ranking.rows.slice(0, MAX_COMPARE).map((r) => r.metrics.siteId) });
  });

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
  canvas.addEventListener("pointerdown", (e) => (dragY = e.clientY));
  window.addEventListener("pointerup", () => (dragY = null));
  canvas.addEventListener("pointermove", (e) => {
    if (dragY === null || store.get().phase !== "cruise") return;
    director.approach((dragY - e.clientY) * 0.002);
    dragY = e.clientY;
  });
  window.addEventListener("keydown", (event) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const s = store.get();
    const series = light?.bundle.series;
    if (event.key === " " && tag !== "BUTTON") {
      event.preventDefault();
      actions.togglePlay();
    } else if (event.key === "Escape") {
      if (s.assistantOpen) actions.setAssistant(false);
      else if (s.guideOpen) actions.setGuide(false);
      else if (s.phase === "focus") actions.overview();
      else if (s.phase !== "cruise") actions.back();
    } else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && series) {
      const step = (event.key === "ArrowRight" ? 1 : -1) * STEPS_PER_HOUR;
      actions.setIndex(Math.min(series.n - 1, Math.max(0, s.index + step)));
    }
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showToast(strings(store.get().locale).contextLost);
  });
  canvas.addEventListener("webglcontextrestored", () => window.location.reload());

  // Development hook: lets a test freeze time and inspect one moment of a shot.
  const debug = { store, actions, director, resources, timeScale: 1 };
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
    const site = focusSite(s);
    const bundle = bundleFor(s, resources, site);
    const scenarioId = scenarioIdFor(s, site);
    if (!light && !bundle && scenarioId && resources.bundleFailed(scenarioId)) {
      // The first site could not load, even after retries: say it and offer a retry instead of a frozen loader.
      showLoadError(strings(s.locale), () => resources.retryFailed());
    }
    if (bundle && light?.bundle !== bundle) {
      const first = light === null;
      const sameSite = light?.site.id === site.id;
      light = { site, bundle };
      // A new mast height or model changes the terrain profile under a landed ship.
      if (sameSite) director.setHorizon(bundle.horizon);
      if (first && !userScrubbed) {
        // Open on a sunlit moment of the first site, when there is one.
        const lit = bundle.series.sunState.findIndex((state) => state === 2);
        if (lit > 0) store.set({ index: lit });
      }
      if (!compiled) {
        // Build the ground once now, so the first landing does not wait for shader compilation.
        compiled = true;
        surface.prepare(site, null, sampleSeries(bundle.series, 0));
        stage.renderer.compile(surface.scene, surface.camera);
        loader.classList.add("is-done");
        window.setTimeout(() => loader.remove(), 900);
      }
      s = store.get();
    }
    if (!light) return;

    if (s.playing) {
      const end = light.bundle.series.n - 1;
      const index = Math.min(end, s.index + dt * s.speedH * STEPS_PER_HOUR);
      store.set({ index, playing: index < end });
      s = store.get();
    }
    if (pendingLand && pendingLand === s.focusId && light.site.id === s.focusId && bundle) {
      pendingLand = null;
      actions.land();
    }
    if (s.tab !== "explorer") return; // the 3D view is hidden: no need to draw it

    director.update(dt, timeS, sampleSeries(light.bundle.series, s.index), light.site, realDt);

    const showPins = s.phase === "cruise" || s.phase === "focus";
    pinLayer.classList.toggle("is-hidden", !showPins);
    if (!showPins) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const inScope = new Set(scopeSites(s.sites, s.scope).map((x) => x.id));
    for (const p of orbit.projectPins(s.sites, width, height)) {
      const pin = pins.get(p.id)!;
      const on = p.visible && inScope.has(p.id);
      pin.classList.toggle("is-off", !on);
      if (on) pin.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
    const t = strings(s.locale);
    const sample = sampleSeries(light.bundle.series, s.index);
    const beams = orbit.projectBeams(width, height);
    for (const [name, point, on, textOn, textOff] of [
      ["sun", beams.sun, (sample.sunState ?? 0) > 0, t.beamSunOn, t.beamSunOff],
      ["earth", beams.earth, (sample.earthState ?? 0) > 0, t.beamEarthOn, t.beamEarthOff],
    ] as const) {
      const el = beamLabels[name];
      const show = s.phase === "focus" && point.visible && on;
      el.classList.toggle("is-off", !show);
      if (show) {
        el.textContent = on ? textOn : textOff;
        el.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
      }
    }
  };
  requestAnimationFrame(frame);
}

/** Readable error on the loader, with a retry button when a retry can help. */
function showLoadError(t: ReturnType<typeof strings>, retry?: () => void, message = t.loadError): void {
  if (loader.classList.contains("is-error")) return;
  $("loader-text").textContent = message;
  loader.classList.add("is-error");
  if (!retry) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button loader-retry";
  button.textContent = t.retry;
  button.addEventListener("click", () => {
    button.remove();
    loader.classList.remove("is-error");
    $("loader-text").textContent = t.loading;
    retry();
  });
  $("loader-text").after(button);
}

boot().catch((err) => {
  console.error(err);
  const t = strings(initialLocale());
  if ((err as { webgl?: boolean }).webgl) showLoadError(t, undefined, t.noWebgl);
  else showLoadError(t, () => window.location.reload());
});
