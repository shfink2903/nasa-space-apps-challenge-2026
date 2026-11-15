import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./charts/charts-time.css";
import "./charts/charts-grid.css";
import "./style.css";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { availableDates, loadSites, type Site } from "./data/dataset";
import { Resources, type Bundle } from "./data/resources";
import { initialLocale, saveLocale, strings } from "./i18n";
import { groupOf, isPolar, orderedSites, scopeSites } from "./planner/catalog";
import { sampleScenario, visibilityState } from "./planner/clock";
import { bundleFor, focusSite, rankingFor, siteById } from "./planner/select";
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

const FIRST_SITE = "sp_s8950";
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
    requirements: { minSunShare: null, minEarthShare: null, maxDarkH: null },
    focusId: sites.find((s) => s.id === FIRST_SITE)?.id ?? sites[0].id,
    comparisons: [],
    sceneStatus: "loading",
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

  // Scientific data and controls do not depend on WebGL or the illustrative assets.
  let stage: Stage | null = null;
  let orbit: OrbitScene | null = null;
  let surface: SurfaceScene | null = null;
  let director: Director | null = null;
  canvas.style.visibility = "hidden";
  pinLayer.style.visibility = "hidden";

  /** The site and data that light the 3D view. Kept while the next choice loads, so the picture never goes blank. */
  let light: { site: Site; bundle: Bundle } | null = null;
  let userPicked = false;
  let userScrubbed = false;
  let pendingLand: string | null = null;
  let compiled = false;

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
      director?.focus(site);
      pendingLand = state.autoFlight && state.sceneStatus === "ready" ? id : null;
    },
    hover: (id) => {
      if (store.get().hoverId !== id) store.set({ hoverId: id });
    },
    toggleCompare(id) {
      const { comparisons, date } = store.get();
      userPicked = true;
      if (comparisons.some((x) => x.siteId === id && x.date === date)) store.set({ comparisons: comparisons.filter((x) => x.siteId !== id || x.date !== date) });
      else actions.addComparison(id, date);
    },
    addComparison(siteId, date) {
      const s = store.get();
      userPicked = true;
      const selectedDate = date ?? [s.date, ...s.dates].find((candidate) => !s.comparisons.some((x) => x.siteId === siteId && x.date === candidate));
      if (!siteById(s, siteId) || !selectedDate || !s.dates.includes(selectedDate) || s.comparisons.some((x) => x.siteId === siteId && x.date === selectedDate)) return;
      if (s.comparisons.length >= MAX_COMPARE) showToast(strings(s.locale).compareMax);
      else store.set({ comparisons: [...s.comparisons, { siteId, date: selectedDate }] });
    },
    setComparisonDate(index, date) {
      const s = store.get();
      const item = s.comparisons[index];
      userPicked = true;
      if (!item || !s.dates.includes(date)) return;
      if (s.comparisons.some((x, i) => i !== index && x.siteId === item.siteId && x.date === date)) {
        store.set({ comparisons: [...s.comparisons] });
        return;
      }
      store.set({ comparisons: s.comparisons.map((x, i) => i === index ? { ...x, date } : x) });
    },
    removeComparison(index) {
      userPicked = true;
      store.set({ comparisons: store.get().comparisons.filter((_x, i) => i !== index) });
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
      store.set({ scope, comparisons: s.comparisons.filter((item) => allowed.some((x) => x.id === item.siteId)) });
      if (!stay) actions.selectSite(allowed[0].id);
    },
    setCriterion: (criterion) => store.set({ criterion }),
    setRequirements: (patch) => store.set({ requirements: { ...store.get().requirements, ...patch } }),
    setIndex(index) {
      userScrubbed = true;
      store.set({ index });
    },
    setTime(tMs) {
      const s = store.get();
      const series = bundleFor(s, resources, focusSite(s))?.series;
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
    setAutoFlight: (autoFlight) => store.set({ autoFlight: autoFlight && store.get().sceneStatus === "ready" }),
    land() {
      const s = store.get();
      const site = focusSite(s);
      const bundle = bundleFor(s, resources, site);
      if (!bundle || !director || s.sceneStatus !== "ready" || (s.phase !== "cruise" && s.phase !== "focus")) return;
      // This animation uses a visibility rule; it does not assess energy or landing safety.
      const sunState = sampleScenario(bundle.series, bundle.scenario, s.index).sunState;
      if (sunState === null || sunState === 0) {
        showToast(sunState === null ? strings(s.locale).landUnknown : strings(s.locale).landBlocked);
        return;
      }
      if (s.tab !== "explorer") store.set({ tab: "explorer" });
      director.startFlight(site, bundle.horizon, reducedMotion.matches);
    },
    jumpToSunrise() {
      const s = store.get();
      const bundle = bundleFor(s, resources, focusSite(s));
      if (!bundle) return;
      const from = sampleScenario(bundle.series, bundle.scenario, s.index).tMs;
      const sunrise = bundle.scenario.events
        .filter((e) => e.body === "sun" && e.convention === "anyDisk" && e.type === "rise" && Date.parse(e.tUtc) > from)
        .sort((a, b) => Date.parse(a.tUtc) - Date.parse(b.tUtc))[0];
      if (!sunrise) return;
      actions.setTime(Date.parse(sunrise.tUtc));
    },
    skip: () => director?.skip(),
    back: () => director?.focus(focusSite(store.get())),
    overview: () => director?.overview(),
    setAssistant: (assistantOpen) => store.set({ assistantOpen }),
    setGuide: (guideOpen) => store.set({ guideOpen }),
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
    surface?.setCompassLetters(t.compass);
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
  loader.classList.add("is-done");
  window.setTimeout(() => loader.remove(), 900);

  // First results: show the best site and compare the top three, unless the user already chose.
  store.subscribe((s) => {
    if (userPicked) return;
    const ranking = rankingFor(s, resources);
    if (!ranking.complete || ranking.rows.length === 0) return;
    userPicked = true;
    // The best candidate, compared with the other candidates.
    const best = ranking.rows[0].metrics.siteId;
    store.set({ focusId: best, comparisons: ranking.rows.slice(0, MAX_COMPARE).map((r) => ({ siteId: r.metrics.siteId, date: s.date })) });
  });

  // --- Input. ---
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (store.get().phase !== "cruise") return;
      event.preventDefault();
      director?.approach(event.deltaY * 0.0006);
    },
    { passive: false },
  );
  let dragY: number | null = null;
  canvas.addEventListener("pointerdown", (e) => (dragY = e.clientY));
  window.addEventListener("pointerup", () => (dragY = null));
  canvas.addEventListener("pointermove", (e) => {
    if (dragY === null || store.get().phase !== "cruise") return;
    director?.approach((dragY - e.clientY) * 0.002);
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
    disableScene();
  });

  // Development hook: lets a test freeze time and inspect one moment of a shot.
  const debug = { store, actions, get director() { return director; }, resources, timeScale: 1 };
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
    if (bundle && light?.bundle !== bundle) {
      const first = light === null;
      const sameSite = light?.site.id === site.id;
      light = { site, bundle };
      // A new mast height or model changes the terrain profile under a landed ship.
      if (sameSite) director?.setHorizon(bundle.horizon);
      if (first && !userScrubbed) {
        // Open on a sunlit moment of the first site, when there is one.
        const lit = bundle.scenario.windows["sun.fullDisk"]?.find((w) => visibilityState(bundle.scenario, "sun", Date.parse(w.startUtc)) === 2);
        if (lit) actions.setTime(Date.parse(lit.startUtc));
      }
      s = store.get();
    }
    if (!light || !bundle) return;

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
    if (s.tab !== "explorer" || !director || !stage || !surface || !orbit || s.sceneStatus !== "ready") return;
    if (!compiled) {
      try {
        surface.prepare(light.site, null, sampleScenario(light.bundle.series, light.bundle.scenario, 0));
        stage.renderer.compile(surface.scene, surface.camera);
        compiled = true;
      } catch (error) {
        console.warn("3D preparation unavailable", error);
        disableScene();
        return;
      }
    }

    try {
      director.update(dt, timeS, sampleScenario(light.bundle.series, light.bundle.scenario, s.index), light.site, realDt);
    } catch (error) {
      console.warn("3D rendering unavailable", error);
      disableScene();
      return;
    }

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
    const sample = sampleScenario(light.bundle.series, light.bundle.scenario, s.index);
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

  function disableScene(): void {
    const previousStage = stage;
    stage = null;
    director = null;
    canvas.style.visibility = "hidden";
    pinLayer.style.visibility = "hidden";
    veil.style.opacity = "0";
    pendingLand = null;
    store.set({ sceneStatus: "unavailable", phase: "cruise", autoFlight: false, tab: "data" });
    showToast(strings(store.get().locale).sceneUnavailable);
    try {
      previousStage?.dispose();
    } catch (error) {
      console.warn("3D cleanup unavailable", error);
    }
  }

  async function initializeScene(): Promise<void> {
    try {
      stage = new Stage(canvas);
      const manager = new THREE.LoadingManager();
      const small = Math.min(window.screen.width, window.screen.height) < 800 || stage.maxTextureSize < 8192;
      const [moonColor, moonSlope, earth, gltf] = await Promise.all([
        loadTexture(manager, small ? "/textures/moon_color_4k.jpg" : "/textures/moon_color_8k.jpg", true),
        loadTexture(manager, "/textures/moon_slope_4k.jpg", false),
        loadTexture(manager, "/textures/earth_2k.jpg", true).catch(() => null),
        new GLTFLoader(manager).loadAsync("/models/starship.glb"),
      ]);
      if (store.get().sceneStatus === "unavailable" || !stage) return;
      const hullEnv = createHullEnvironment(stage.renderer);
      orbit = new OrbitScene({ moonColor, moonSlope, earth, ship: gltf.scene, hullEnv });
      surface = new SurfaceScene({ earth, ship: gltf.scene, hullEnv }, canvas);
      surface.setCompassLetters(strings(store.get().locale).compass);
      director = new Director(stage, orbit, surface, veil, (phase) => store.set({ phase }));
      canvas.style.visibility = "";
      pinLayer.style.visibility = "";
      store.set({ sceneStatus: "ready" });
    } catch (error) {
      console.warn("3D assets or WebGL unavailable; data remains accessible", error);
      disableScene();
    }
  }
  void initializeScene();
}

boot().catch((err) => {
  console.error(err);
  $("loader-text").textContent = strings(initialLocale()).loadError;
  loader.classList.add("is-error");
});
