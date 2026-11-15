# Recherche de contexte — 15 novembre 2026

Sources rassemblées pendant l'audit de Touchdown. Le site spaceappschallenge.org ne répondait pas depuis la session (503 / TLS). Les règles 2026 viennent donc de copies publiées par d'autres équipes sur GitHub, recoupées entre plusieurs dépôts. **À revérifier dans un navigateur** :
- https://www.spaceappschallenge.org/resources/judging-awards-guide/
- https://www.spaceappschallenge.org/resources/project-submission-guide/

## Règles et notation (copies du guide 2026)

- Cinq critères notés de 1 à 5, sans pondération publiée (considérés égaux) :
  - **Impact** : taille du problème et portée.
  - **Créativité** : approche originale ou amélioration nette de l'existant.
  - **Validité** : base scientifique, faisabilité, utilisabilité ("prêt pour un usage réel").
  - **Pertinence** : répond au défi ; les données NASA sont au cœur de la solution.
  - **Présentation** : démo + page projet. Le guide note que les équipes négligent souvent ce critère.
- Démo : **vidéo de 30 s maximum OU 7 diapositives maximum** (titre compris). Au-delà, le projet est inéligible.
- Tout en anglais (sous-titres anglais si la vidéo est dans une autre langue).
- Date limite : **dimanche 15 novembre 2026, 23h59 heure locale (Paris)**. Un projet enregistré mais non soumis n'est pas jugé.
- Champs de la page projet : nom, résumé, lien démo public sans connexion, lien final (dépôt ou app ; "si les juges ne peuvent pas l'ouvrir, il n'est pas jugé"), description détaillée, données NASA utilisées, autres données, usage de l'IA, références (obligatoires).
- IA : autorisée, mais l'idée doit venir de l'équipe. Images et vidéos générées par IA : filigrane visible. Code, audio et données générés par IA : à mentionner dans la description et les métadonnées. Aucun logo NASA modifié ou généré.
- Calendrier : jugement local à partir du 16 nov., Global Nominees le 3 déc., finalistes le 17 déc., gagnants le 26 janv. 2027.
- 10 prix globaux : Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, Local Impact.
  Source officielle de la liste (gagnants 2025) : https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/

Copies consultées : https://raw.githubusercontent.com/IlayLa/OrbitOrange/main/context/NASA%20Space%20Apps%20Challenge%20-%20judging%20rules.html ; https://raw.githubusercontent.com/angelinopires/space-apps-2026-kit/main/docs/en/rules-and-judging.md

## Onglet Resources du défi

Copie : https://raw.githubusercontent.com/Robhnar/Hakato-/main/lunar-landing-site-navigator-resources.md
- NASA : LROC Quickmap, Moon Trek, JPL Horizons. CSA : Moon Exploration.
- Données NASA utiles mais non listées :
  - **PGDA Lunar Polar Illumination** (Mazarico et al. 2011) : cartes moyennes de visibilité du Soleil et de la Terre, ombre permanente, 60 à 240 m, GeoTIFF. https://pgda.gsfc.nasa.gov/products/69
  - MNT haute résolution des sites du pôle Sud : https://pgda.gsfc.nasa.gov/products/78 et mosaïque https://pgda.gsfc.nasa.gov/products/81
  - Archive LOLA (PDS) : https://pds-geosciences.wustl.edu/missions/lro/lola.htm

## Outils et travaux existants

- Quickmap a des couches LOLA de visibilité Soleil/Terre au pôle Sud depuis 2020 (https://lroc.asu.edu/news/1153) et un outil d'ombres (https://www.hou.usra.edu/meetings/lpsc2025/pdf/1657.pdf).
- NASA SVS : éclairage du pôle Sud avec Terre et Soleil https://svs.gsfc.nasa.gov/5228 ; éclairage 2023-2030 https://svs.gsfc.nasa.gov/4930/ ; trajet du Soleil selon la latitude https://svs.gsfc.nasa.gov/5038 ; régions Artemis https://svs.gsfc.nasa.gov/5013
- Articles : Mazarico et al. 2011 (Icarus 211, doi:10.1016/j.icarus.2010.10.030) ; Speyerer & Robinson 2013 (Icarus 222) ; Gläser et al. 2014 (Icarus 243) ; Wueller et al. 2026 (JGR Planets, sites bien éclairés dans les régions Artemis, coordonnées en table A1) https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434

## Régions Artemis

- 9 régions (28 oct. 2024) : Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- 13 régions d'origine (août 2022) dont Peak Near Shackleton, Connecting Ridge, de Gerlache Rim 1. Régions d'environ 15 × 15 km.
- La NASA ne publie pas de centres de région : toute coordonnée est approximative.
- Février 2026 (source secondaire, non lue chez la NASA) : Artemis III devient un essai d'amarrage en orbite terrestre, premier alunissage habité sur Artemis IV (2028). Écrire "régions candidates Artemis", pas "site d'Artemis III".

## Missions au pôle Sud

| Mission | Statut | Coordonnées | Source |
|---|---|---|---|
| Chandrayaan-3 | posé 23/08/2023 | 69,373° S, 32,319° E | Wikipédia |
| Luna-25 | écrasé 19/08/2023 | visé 69,545° S, 43,544° E | nasa.gov (LRO) |
| IM-1 | posé fév. 2024 | 80,13° S, 1,44° E | lroc.asu.edu/images/1360 |
| IM-2 Athena | posé 06/03/2025 (couché) | réel 84,7906° S, 29,1957° E (Mons Mouton) | lroc.im-ldi.com/images/1408 |
| Chang'e-7 | 2027 | env. 88,8° S, 123,4° E (crête SE de Shackleton, non définitif) | Wikipédia |
| Blue Moon MK1 | T1 2027 au plus tôt | crête de Shackleton, pas de coordonnées | Wikipédia |
| VIPER | relancé, fin 2027 | site non confirmé | space.com |
| Griffin-1 | fin 2026 / 2027 | région de Nobile, pas de coordonnées | Wikipédia |

## Concurrents connus sur le même défi (2026)

- https://github.com/RicardoArg23/MoonSet
- https://www.afuq.website/
- https://pugglord.github.io/lunar-landing-site-navigator/ (vidéo de 30 s narrée)
- https://siphrn.github.io/lunar-landing-site-navigator/
- https://github.com/JAlavindu/Ridgeline
- https://github.com/0xTanzim/LunaMission

Points communs : Horizons, MNT LOLA 80 m, les 9 régions Artemis, globe 3D. Atouts distinctifs de Touchdown : grille de sensibilité 1 km, classement, exigences de mission, calendrier 52 semaines, FR/EN, validation contre Horizons.

## Ce qui fait gagner (conseils de juges et de gagnants)

- Présentation = 1/5 de la note. Une personne dédiée à la vidéo et au récit.
- Données NASA nommées à l'écran et sur la page, avec identifiants de produits.
- Validité appuyée par une comparaison avec une référence (cartes PGDA, animation SVS 5228).
- Lien en ligne qui marche sans connexion, testé en navigation privée.
- Viser 1 ou 2 prix : Best Use of Data, Best Use of Science ; Most Inspirational / Best Storytelling si le récit éducatif est fort.
