import type { Phase } from "../flight/timeline";

/** All text of the interface, in one place. */
export const T = {
  brand: "Touchdown",
  tagline: "Atterrissage lunaire · NASA Space Apps 2026",
  loadError: "Chargement impossible. Vérifiez que le jeu de données est servi sous /data/v1.",
  siteError: "Données du site indisponibles. Retour en orbite.",
  contextLost: "Le contexte graphique a été perdu. Rechargez la page.",

  guideTitle: "Guide de vol",
  guideSteps: [
    { title: "Approchez", text: "Starship avance vers la Lune. Faites défiler pour aller plus vite." },
    { title: "Choisissez un site", text: "Un clic sur un lieu réel lance la descente et l'atterrissage." },
    { title: "Jouez avec le temps", text: "Le curseur déplace le Soleil et la Terre du jeu de données." },
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
  lightOf: (name: string) => `Jour et nuit à ${name}`,
  legendDay: "Soleil visible",
  legendNight: "Nuit",

  listKicker: "Sur la surface",
  listTitle: "Sites d'atterrissage",
  historical: "Atterrissages réels",
  study: "Points d'étude · pôle Sud",
  studyNote: "Points d'étude, pas des missions.",
  flyTo: (name: string) => `Se poser à ${name}`,

  phaseKicker: {
    cruise: "En approche",
    transfer: "Transfert",
    descent: "Descente",
    final: "Descente finale",
    surface: "Posé",
  } satisfies Record<Phase, string>,
  cruiseTitle: "Cap sur la Lune.",
  cruiseText: "Faites défiler pour approcher. Choisissez un site pour vous poser.",
  flightText: "Vol illustratif. Aucune trajectoire n'est calculée.",
  surfaceText: "Faites glisser pour tourner autour du vaisseau.",
  skip: "Passer",
  back: "Retour en orbite",
  steps: ["Transfert", "Descente", "Finale", "Posé"],

  conditions: "Conditions au site",
  sun: "Soleil",
  earth: "Terre",
  elevation: "Élévation du centre",
  state: { 2: "Disque entier visible", 1: "Disque en partie visible", 0: "Non visible", unknown: "État inconnu" },
  nextRise: "Prochain lever du Soleil",
  nextSet: "Prochain coucher du Soleil",
  nextEvent: "Prochain lever ou coucher",
  noEvent: "Aucun dans la fenêtre publiée",
  sunShare: "Soleil visible sur 30 jours",
  modelLola: "Horizon réel : profil LOLA du jeu de données",
  modelGeometric: "Horizon géométrique : relief ignoré",

  footer: "Vol et échelles illustratifs · Soleil et Terre : jeu de données v1 · Lune : NASA SVS · Starship : I_am_Darth, CC BY-NC-SA",
  north: "N",
  south: "S",
  east: "E",
  west: "O",
};
