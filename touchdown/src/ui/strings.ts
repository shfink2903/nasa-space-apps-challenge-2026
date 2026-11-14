import type { Phase } from "../flight/timeline";

export type Lang = "fr" | "en";

function readLang(): Lang {
  if (typeof window === "undefined") return "fr";
  const asked = new URLSearchParams(window.location.search).get("lang");
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("touchdown.lang");
  } catch {
    // Storage can be blocked: the default language is used.
  }
  const lang = asked ?? stored ?? (navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");
  return lang === "en" ? "en" : "fr";
}

export const LANG: Lang = readLang();
export const LOCALE = LANG === "fr" ? "fr-FR" : "en-GB";

/** Stores the language and reloads: every text is built once, at start. */
export function switchLang(lang: Lang): void {
  try {
    window.localStorage.setItem("touchdown.lang", lang);
  } catch {
    // Ignored: the URL parameter below still carries the choice.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", lang);
  window.location.href = url.toString();
}

const FR = {
  brand: "Touchdown",
  tagline: "Choisir où et quand se poser sur la Lune · NASA Space Apps 2026",
  pageTitle: "Touchdown — Où et quand se poser sur la Lune",
  loading: "Préparation de la Lune…",
  loadError: "Chargement impossible. Vérifiez que le jeu de données est servi sous /data/v1.",
  siteError: "Données du site indisponibles. Retour en orbite.",
  contextLost: "Le contexte graphique a été perdu. Rechargez la page.",
  otherLang: "EN",
  otherLangLabel: "Switch to English",

  guideTitle: "Mode d'emploi",
  guideSteps: [
    { title: "Choisissez un site", text: "Cliquez un point du globe ou une ligne du classement : zoom et fiche du site." },
    { title: "Lisez Soleil et Terre", text: "Énergie (Soleil) et communication (Terre), avec le temps restant avant chaque coucher." },
    { title: "Changez la date", text: "Le curseur et le calendrier montrent comment tout change sur 30 jours et sur un an." },
    { title: "Comparez, puis posez-vous", text: "Le classement compare les 13 sites. Starship ne se pose que s'il y a du Soleil." },
  ],

  timeTitle: "Temps de mission",
  startDate: "Début de l'analyse",
  days30: "30 jours",
  play: "Lecture",
  pause: "Pause",
  speed: "Vitesse",
  speeds: [
    { value: 1, label: "1 h / s" },
    { value: 6, label: "6 h / s" },
    { value: 24, label: "1 j / s" },
    { value: 72, label: "3 j / s" },
  ],
  dayLetter: "J",
  lightOf: (name: string) => `Fenêtres à ${name}`,
  legendSun: "Soleil visible",
  legendEarth: "Terre visible",

  listKicker: "Classement",
  listTitle: "Sites d'atterrissage",
  rankBy: "Classer par",
  criteria: {
    overlap: "Soleil + Terre ensemble",
    sun: "Énergie : Soleil visible",
    earth: "Communication : Terre visible",
    night: "Nuit la plus courte",
    blackout: "Coupure Terre la plus courte",
  } as Record<string, string>,
  criteriaShort: {
    overlap: "Soleil + Terre",
    sun: "Soleil",
    earth: "Terre",
    night: "Plus longue nuit",
    blackout: "Plus longue coupure",
  } as Record<string, string>,
  defaultCriterion: "défaut",
  compare: "Comparer",
  studyTag: "étude",
  nonDominated: "Non dominé",
  nonDominatedHelp:
    "Non dominé : aucun autre scénario exploré au même niveau de modèle (hauteurs 2 m et 10 m réunies) ne fait au moins aussi bien sur les 4 critères de l'équipe DATA (Soleil, Terre, plus longue nuit, Soleil + Terre) et mieux sur un.",
  rankNote: (n: number) => `Classement parmi les ${n} sites explorés, pour cette date et ce critère. Ce n'est pas une validation de mission.`,
  flyTo: (name: string) => `Voir ${name}`,
  unknown: "inconnu",

  phaseKicker: {
    cruise: "En approche",
    focus: "Site sélectionné",
    transfer: "Transfert",
    descent: "Descente",
    final: "Descente finale",
    surface: "Posé",
  } satisfies Record<Phase, string>,
  cruiseTitle: "Où se poser, et quand ?",
  cruiseText: "Cliquez un site sur le globe ou dans le classement pour voir son Soleil et sa Terre.",
  flightText: "Vol illustratif. Aucune trajectoire n'est calculée.",
  surfaceText: "Faites glisser pour tourner autour du vaisseau. Le curseur de temps déplace le Soleil et la Terre.",
  focusSunUp: (left: string | null) => (left ? `Soleil visible : encore ${left} avant le coucher.` : "Soleil visible jusqu'à la fin des 30 jours."),
  focusSunDown: "Soleil sous l'horizon à cette date : pas d'atterrissage, le site est dans le noir.",
  focusNoRise: "Aucun lever du Soleil dans ces 30 jours. Choisissez une autre date dans le calendrier.",
  land: "Se poser ici",
  toSunrise: "Aller au lever du Soleil",
  skip: "Passer",
  back: "Retour à la fiche",
  close: "Vue d'ensemble",
  steps: ["Transfert", "Descente", "Finale", "Posé"],

  sheetTitle: "Fiche du site",
  statusHistorical: "Atterrissage réel",
  statusStudy: "Point d'étude",
  verification: {
    single_source: "Position : une seule source",
    unverified: "Position non vérifiée",
    team_defined: "Point défini par l'équipe",
  } as Record<string, string>,
  now: "À l'instant choisi",
  sun: "Soleil",
  earth: "Terre",
  power: "Énergie",
  comms: "Communication",
  elevation: "Hauteur du centre au-dessus de l'horizon",
  state: { 2: "Disque entier visible", 1: "Disque en partie visible", 0: "Non visible", unknown: "État inconnu" },
  setsIn: (d: string) => `Coucher dans ${d}`,
  risesIn: (d: string) => `Lever dans ${d}`,
  upAllWindow: "Visible jusqu'à la fin des 30 jours",
  downAllWindow: "Aucun lever dans ces 30 jours",
  skyTitle: "Ciel vu du site",
  skyNote: "Direction (N, E, S, O) et hauteur. Traits : trajets sur 30 jours. Zone grise : relief.",
  skyNoteFlat: "Direction (N, E, S, O) et hauteur. Traits : trajets sur 30 jours. Horizon sans relief.",
  over30: "Sur ces 30 jours",
  sunShare: "Soleil visible",
  earthShare: "Terre visible",
  overlapShare: "Soleil + Terre ensemble",
  longestNight: "Plus longue nuit",
  longestBlackout: "Plus longue coupure Terre",
  maxSun: "Hauteur max. du Soleil",
  maxEarth: "Hauteur max. de la Terre",
  insights: {
    noEarth: "La Terre n'est jamais visible d'ici sur cette période : aucune liaison directe avec la Terre.",
    alwaysEarth: "La Terre reste visible toute la période : liaison directe possible en continu.",
    noSun: "Le Soleil ne se lève jamais sur cette période : aucune énergie solaire.",
    noOverlap: "Soleil et Terre ne sont jamais visibles en même temps sur cette période.",
  },
  yearTitle: "Sur un an",
  yearNote: "52 débuts possibles, un par semaine. Cliquez une case pour changer la date.",
  yearCell: (date: string, sun: string, earth: string) => `${date} · Soleil ${sun} · Terre ${earth}`,
  sensTitle: "À 2 km près",
  sensNote: (n: number, date: string) => `${n} points autour du site, espacés de 1 km (début ${date}). Chaque case est un point.`,
  sensRange: (label: string, min: string, max: string) => `${label} : de ${min} à ${max}`,
  sensLimit: "25 points explorés seulement : ni une probabilité, ni le meilleur endroit de la région.",
  height: "Hauteur de l'observateur",
  heightNote: "Hypothèse d'équipe : panneau ou antenne à 2 m, mât à 10 m.",
  modelLola: "Horizon avec relief LOLA — expérimental, non validé",
  modelGeometric: "Horizon géométrique : relief ignoré",
  limitsTitle: "Limites publiées avec ces données",
  limitsNote: "Texte original du jeu de données.",
  notModeled: "Non modélisé : puissance électrique, liaison radio, thermique, sécurité de l'atterrissage.",

  compareTitle: "Comparer les sites",
  tabTable: "Tableau",
  tabCalendar: "Calendrier",
  colSite: "Site",
  colModel: "Modèle",
  modelShort: { lola: "Relief", geometric: "Sans relief" } as Record<string, string>,
  calendarMetric: "Afficher",
  calendarNote: "Lignes : sites. Colonnes : 52 débuts hebdomadaires. Cliquez une case pour ouvrir ce site à cette date.",
  compareNote:
    "Valeurs sur 30 jours, lues dans le jeu de données v1. « Relief » (profil LOLA, expérimental) et « sans relief » ne sont pas le même niveau de modèle : comparez-les avec prudence.",
  closeLabel: "Fermer",

  footer: "Vol et échelles illustratifs · Soleil et Terre : jeu de données v1 · Lune : NASA SVS · Starship : I_am_Darth, CC BY-NC-SA",
  north: "N",
  south: "S",
  east: "E",
  west: "O",
  durMin: (m: number) => `${m} min`,
  durHour: (h: number, m: string) => `${h} h ${m}`,
  durDay: (d: string) => `${d} j`,
};

const EN: typeof FR = {
  brand: "Touchdown",
  tagline: "Choose where and when to land on the Moon · NASA Space Apps 2026",
  pageTitle: "Touchdown — Where and when to land on the Moon",
  loading: "Preparing the Moon…",
  loadError: "Loading failed. Check that the dataset is served under /data/v1.",
  siteError: "Site data unavailable. Back to orbit.",
  contextLost: "The graphics context was lost. Reload the page.",
  otherLang: "FR",
  otherLangLabel: "Passer en français",

  guideTitle: "How it works",
  guideSteps: [
    { title: "Pick a site", text: "Click a point on the globe or a row of the ranking: zoom and site sheet." },
    { title: "Read Sun and Earth", text: "Power (Sun) and communication (Earth), with the time left before each one sets." },
    { title: "Change the date", text: "The slider and the calendar show how everything changes over 30 days and over a year." },
    { title: "Compare, then land", text: "The ranking compares the 13 sites. Starship only lands when the Sun is up." },
  ],

  timeTitle: "Mission time",
  startDate: "Analysis start",
  days30: "30 days",
  play: "Play",
  pause: "Pause",
  speed: "Speed",
  speeds: [
    { value: 1, label: "1 h / s" },
    { value: 6, label: "6 h / s" },
    { value: 24, label: "1 d / s" },
    { value: 72, label: "3 d / s" },
  ],
  dayLetter: "D",
  lightOf: (name: string) => `Windows at ${name}`,
  legendSun: "Sun visible",
  legendEarth: "Earth visible",

  listKicker: "Ranking",
  listTitle: "Landing sites",
  rankBy: "Rank by",
  criteria: {
    overlap: "Sun + Earth together",
    sun: "Power: Sun visible",
    earth: "Communication: Earth visible",
    night: "Shortest night",
    blackout: "Shortest Earth blackout",
  },
  criteriaShort: {
    overlap: "Sun + Earth",
    sun: "Sun",
    earth: "Earth",
    night: "Longest night",
    blackout: "Longest blackout",
  },
  defaultCriterion: "default",
  compare: "Compare",
  studyTag: "study",
  nonDominated: "Non-dominated",
  nonDominatedHelp:
    "Non-dominated: no other explored scenario at the same model level (2 m and 10 m heights together) does at least as well on the 4 criteria of the DATA team (Sun, Earth, longest night, Sun + Earth) and better on one.",
  rankNote: (n: number) => `Ranking among the ${n} explored sites, for this date and this criterion. This is not a mission validation.`,
  flyTo: (name: string) => `View ${name}`,
  unknown: "unknown",

  phaseKicker: {
    cruise: "On approach",
    focus: "Selected site",
    transfer: "Transfer",
    descent: "Descent",
    final: "Final descent",
    surface: "Landed",
  },
  cruiseTitle: "Where to land, and when?",
  cruiseText: "Click a site on the globe or in the ranking to see its Sun and its Earth.",
  flightText: "Illustrative flight. No trajectory is computed.",
  surfaceText: "Drag to turn around the ship. The time slider moves the Sun and the Earth.",
  focusSunUp: (left: string | null) => (left ? `Sun visible: ${left} left before sunset.` : "Sun visible until the end of the 30 days."),
  focusSunDown: "Sun below the horizon at this date: no landing, the site is in the dark.",
  focusNoRise: "No sunrise in these 30 days. Choose another date in the calendar.",
  land: "Land here",
  toSunrise: "Go to sunrise",
  skip: "Skip",
  back: "Back to the sheet",
  close: "Overview",
  steps: ["Transfer", "Descent", "Final", "Landed"],

  sheetTitle: "Site sheet",
  statusHistorical: "Real landing",
  statusStudy: "Study point",
  verification: {
    single_source: "Position: single source",
    unverified: "Position not verified",
    team_defined: "Point defined by the team",
  },
  now: "At the chosen time",
  sun: "Sun",
  earth: "Earth",
  power: "Power",
  comms: "Communication",
  elevation: "Height of the centre above the horizon",
  state: { 2: "Whole disc visible", 1: "Disc partly visible", 0: "Not visible", unknown: "Unknown state" },
  setsIn: (d: string) => `Sets in ${d}`,
  risesIn: (d: string) => `Rises in ${d}`,
  upAllWindow: "Visible until the end of the 30 days",
  downAllWindow: "No rise in these 30 days",
  skyTitle: "Sky seen from the site",
  skyNote: "Direction (N, E, S, W) and height. Lines: paths over 30 days. Grey area: terrain.",
  skyNoteFlat: "Direction (N, E, S, W) and height. Lines: paths over 30 days. Horizon without terrain.",
  over30: "Over these 30 days",
  sunShare: "Sun visible",
  earthShare: "Earth visible",
  overlapShare: "Sun + Earth together",
  longestNight: "Longest night",
  longestBlackout: "Longest Earth blackout",
  maxSun: "Max. Sun height",
  maxEarth: "Max. Earth height",
  insights: {
    noEarth: "The Earth is never visible from here in this period: no direct link with Earth.",
    alwaysEarth: "The Earth stays visible for the whole period: a direct link is possible all the time.",
    noSun: "The Sun never rises in this period: no solar power.",
    noOverlap: "Sun and Earth are never visible at the same time in this period.",
  },
  yearTitle: "Over one year",
  yearNote: "52 possible starts, one per week. Click a cell to change the date.",
  yearCell: (date: string, sun: string, earth: string) => `${date} · Sun ${sun} · Earth ${earth}`,
  sensTitle: "Within 2 km",
  sensNote: (n: number, date: string) => `${n} points around the site, 1 km apart (start ${date}). Each cell is one point.`,
  sensRange: (label: string, min: string, max: string) => `${label}: from ${min} to ${max}`,
  sensLimit: "Only 25 explored points: neither a probability nor the best place of the region.",
  height: "Observer height",
  heightNote: "Team assumption: panel or antenna at 2 m, mast at 10 m.",
  modelLola: "Horizon with LOLA terrain — experimental, not validated",
  modelGeometric: "Geometric horizon: terrain ignored",
  limitsTitle: "Limits published with these data",
  limitsNote: "Original text of the dataset.",
  notModeled: "Not modelled: electrical power, radio link, thermal balance, landing safety.",

  compareTitle: "Compare the sites",
  tabTable: "Table",
  tabCalendar: "Calendar",
  colSite: "Site",
  colModel: "Model",
  modelShort: { lola: "Terrain", geometric: "No terrain" },
  calendarMetric: "Show",
  calendarNote: "Rows: sites. Columns: 52 weekly starts. Click a cell to open this site at this date.",
  compareNote:
    "Values over 30 days, read from dataset v1. “Terrain” (LOLA profile, experimental) and “no terrain” are not the same model level: compare them with care.",
  closeLabel: "Close",

  footer: "Illustrative flight and scales · Sun and Earth: dataset v1 · Moon: NASA SVS · Starship: I_am_Darth, CC BY-NC-SA",
  north: "N",
  south: "S",
  east: "E",
  west: "W",
  durMin: (m: number) => `${m} min`,
  durHour: (h: number, m: string) => `${h} h ${m} min`,
  durDay: (d: string) => `${d} d`,
};

/** All text of the interface, in one place, in the active language. */
export const T: typeof FR = LANG === "fr" ? FR : EN;
