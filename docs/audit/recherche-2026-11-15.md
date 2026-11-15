# Recherche — Space Apps 2026, « Lunar Landing Site Navigator »

Date : 15 novembre 2026. Ces notes accompagnent [AUDIT-2026-11-15.md](AUDIT-2026-11-15.md).

Méthode : recherche web (sous-agent en lecture seule). Les pages de spaceappschallenge.org sont rendues côté client. Elles ont été téléchargées puis décodées. Les passages décisifs ont été relus une seconde fois dans le texte téléchargé : critères, format de démo, date limite, règle sur l'IA et licences tierces. Ils sont marqués **[relu]**.

Sauf mention contraire, tous les liens ont été consultés le 15/11/2026.

---

## 1. Règles 2026

### Critères de jugement

Source : [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/).

- **[relu]** Chaque critère est noté de 1 à 5, à tous les niveaux (local, universel, exécutif) :
  - **Impact** ;
  - **Creativity** ;
  - **Validity** : rigueur scientifique, faisabilité, degré d'achèvement, utilisabilité ;
  - **Relevance** : répondre au défi et mettre les données NASA au cœur de la solution ;
  - **Presentation** : la démo **et** le projet complet.
- Le guide n'indique aucune pondération.
- Calendrier du jugement :
  - phase 1 : les juges locaux désignent les Global Nominees, annoncés le 3 décembre 2026 ;
  - phase 2 : des experts NASA et partenaires désignent les Global Finalists, le 17 décembre 2026 ;
  - phase 3 : un comité exécutif choisit 10 Global Winners, le 26 janvier 2027.

### Prix globaux

Sources : [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) et [Awards](https://www.spaceappschallenge.org/awards/).

- Les 10 prix : Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, Local Impact.
- Aucune dotation financière n'est indiquée. Les lauréats sont invités à une célébration virtuelle début 2027.
- Les Local Leads peuvent décerner des prix locaux, hors du processus global.

### Démo et soumission

Source : [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).

Démo :
- **[relu]** Vidéo de 30 secondes au plus, ou 7 diapositives au plus, titre et intro comprises.
- Un projet qui dépasse ces limites n'est pas éligible au jugement global.
- Lien public hébergé à l'extérieur (YouTube, Drive, GitHub…), sans connexion.

Langue :
- **[relu]** Tout le contenu du formulaire doit être en anglais.
- Une vidéo dans une autre langue doit avoir des sous-titres anglais.

Champs du formulaire :
- Project Name ;
- High-Level Project Summary ;
- Link to Project Demo ;
- Link to Final Project (public, sans mot de passe) ;
- Detailed Project Description ;
- Use of Super Intelligence (SI) ;
- NASA Data (au moins une donnée ou ressource NASA, obligatoire pour un prix global) ;
- Space Agency Partner Data and Other References ;
- deux cases à cocher : conditions d'utilisation, et « travail original avec toutes les ressources externes listées ».

Autres points :
- On peut coller des images (JPG/PNG/GIF ≤ 10 Mo) dans le formulaire.
- Aucune image, vidéo ou voix de mineur.

### Date limite

- **[relu]** La soumission ouvre le samedi 14 novembre à 9 h 00 et **ferme le dimanche 15 novembre 2026 à 23 h 59, heure de l'événement local**, donc l'heure de Paris pour l'équipe.
- Il faut cliquer sur « Submit for Judging » avant cette heure.
- Seule la dernière version enregistrée est jugée.
- Le Local Lead peut fixer d'autres horaires pour le jugement local.

### IA (« Super Intelligence », SI)

Sources : [FAQ](https://www.spaceappschallenge.org/resources/participant-faqs/) et [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).

- **[relu]** L'usage est autorisé. Il faut indiquer clairement où et comment il a servi :
  - images et vidéos : filigrane visible ;
  - audio, code et données : mention dans le texte descriptif **et** dans les métadonnées.
- La réponse au champ SI n'est pas montrée aux juges, mais les juges voient ces mentions.
- Le contenu généré ne doit pas utiliser ni modifier la marque NASA (logos, drapeaux, identifiants de mission).
- La FAQ rattache le terme « SI » à un décret américain du 29 septembre 2026. Le texte du décret n'a pas été consulté.

### Propriété intellectuelle

Source : [Terms & Conditions](https://www.spaceappschallenge.org/legal/).

- **[relu]** Le contenu original doit être libre ou sous licence OSI. Sans licence indiquée, la NASA le diffuse sous Apache 2.0.
- **[relu]** Tout matériau tiers non NASA (données, code) doit être librement disponible ou, au minimum, sous licence OSI. L'équipe est seule responsable de le vérifier.

---

## 2. Onglet « Resources » du défi

Source : [page du défi](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

- NASA :
  - [LROC QuickMap](https://quickmap.lroc.asu.edu/) ;
  - [Moon Trek](https://trek.nasa.gov/moon/) ;
  - [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/).
- Agence partenaire : [CSA — Moon exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/).
- Aucun produit LOLA ni PGDA n'est listé, mais l'énoncé cite LOLA pour l'horizon.

---

## 3. Concurrents repérés (dépôts publics, 2026)

| Projet | Fonctions annoncées (d'après le README) | Démo en ligne |
|---|---|---|
| [Lunar Site Navigator](https://github.com/rodneymora94965/lunar-site-navigator) | SPICE DE440s ; horizons LOLA 5/80/120 m ; 3 sites sur 2026–2045 ; calendrier ; sensibilité « déplacer de 100 m » ; lien partageable ; CSV ; vidéos EN/ES | Oui, HTTP 200 : https://lunar-site-navigator.rodneymora94965.workers.dev |
| [LunaNav (Team AFUQ)](https://github.com/ziyadell/Lunar-Landing-Site-Navigator) | 9 régions Artemis ; Lune 3D LROC/LOLA ; vue de surface avec skyline LOLA à 150 km ; 2 scénarios (7 j à 1 an) ; CSV ; narration EN/AR ; état dans l'URL | Oui, HTTP 200 : https://www.afuq.website/ |
| [Lunar Horizon Wheel](https://github.com/NetRunnerXD/lunar-horizon-wheel) | Assombrissement centre-bord ; DSN ; batterie ; incertitudes P10–P90 ; validation contre les cartes PGDA ; deux pôles ; export PDF/CZML/STAC | Oui, HTTP 200 : https://netrunnerxd.github.io/lunar-horizon-wheel/ |
| [CLPS Lunar Mission Browser](https://github.com/shrestha-droid/clps-lunar-mission-browser) | API Horizons ; horizon sphérique sans relief | Oui, HTTP 200 : https://shrestha-droid.github.io/clps-lunar-mission-browser/ |
| [LunarWindow](https://github.com/Hamzaslam1996/lunarwindow) | SPICE ; masque LOLA ; puissance ; fenêtres de liaison directe avec la Terre ; API Python | Non (localhost seulement) |
| [MoonSight](https://github.com/dagimfkadie/MoonSight) | Explorateur des MNT PGDA 5 m | Non trouvée |
| [clps-lunar-browser](https://github.com/suhaslord/clps-lunar-browser) | Ébauche | Non |

Remarques :
- Les fonctions viennent des README. Elles n'ont pas été testées une à une. Seules les réponses HTTP 200 des démos ont été vérifiées.
- D'après l'API GitHub, plusieurs dépôts ont été créés avant le 14 novembre : Horizon Wheel le 13 octobre, LunarWindow et suhaslord le 24 septembre, rodneymora le 4 novembre. Cela ne prouve pas que le travail a commencé avant le hackathon.
- Aucun projet n'est encore visible sur spaceappschallenge.org, ce qui est normal pendant le hackathon.

---

## 4. Outils existants

- [LROC QuickMap](https://quickmap.lroc.asu.edu/) : SIG riche (images, MNT, couches d'illumination). Pas de chronologie Soleil/Terre par site, pas de comparaison côte à côte.
- [Moon Trek](https://trek.nasa.gov/moon/) : relief 2D/3D. Pas de fenêtres de visibilité ni de compte à rebours.
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) : azimut et élévation depuis un point lunaire, en tableaux, une requête par combinaison.
- [PGDA — Lunar Polar Illumination (Mazarico)](https://pgda.gsfc.nasa.gov/products/69) : cartes d'illumination et de visibilité de la Terre. Ce sont des moyennes sur environ 18,6 ans, pas des fenêtres datées.
- [PGDA — High-Res LOLA (Barker)](https://pgda.gsfc.nasa.gov/products/78) : MNT de 5 m/px sur des sites nommés (Connecting ridge, Shackleton rim, Nobile rim 1, de Gerlache rim, Leibnitz beta, Malapert massif…).
- [PGDA — A New View of the Lunar South Pole](https://pgda.gsfc.nasa.gov/products/90) : MNT de 10 à 240 m/px.
- NASA SVS : vidéos et images pré-calculées, non interactives :
  - [Moon Phase and Libration 2026](https://svs.gsfc.nasa.gov/5587) ;
  - [South Pole Illumination with Earth and Sun](https://svs.gsfc.nasa.gov/5228) ;
  - [Illumination 2023–2030](https://svs.gsfc.nasa.gov/4930) ;
  - [to 80°S, 2025–2028](https://svs.gsfc.nasa.gov/5027).

---

## 5. Régions Artemis et sites de mission

### Régions Artemis

- **13 régions (19 août 2022)** — [communiqué NASA](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) : Faustini Rim A, Peak Near Shackleton, Connecting Ridge, Connecting Ridge Extension, de Gerlache Rim 1, de Gerlache Rim 2, de Gerlache-Kocher Massif, Haworth, Malapert Massif, Leibnitz Beta Plateau, Nobile Rim 1, Nobile Rim 2, Amundsen Rim.
- **9 régions (28 octobre 2024)** — [communiqué NASA](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) : Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain.
- Aucune coordonnée de centre n'est publiée dans ces communiqués, ni dans le [résumé LPSC NASA](https://ntrs.nasa.gov/citations/20250011660).
- Contexte rapporté par le sous-agent : la NASA a restructuré Artemis. Artemis III deviendrait un test en orbite terrestre (2027) et le premier alunissage passerait à Artemis IV (début 2028). Sources : [communiqué 1](https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/), [communiqué 2](https://www.nasa.gov/news-release/nasa-marches-toward-artemis-iii-mission-in-2027-names-crew-members/). **Non relu dans le texte** : à vérifier avant d'écrire « Artemis III » ou « Artemis IV » dans l'app ou la démo.

### Sites de mission vérifiés

Comparés aux coordonnées de `data/processed/v1/sites.json` :

| Site | Coordonnées publiées | Source | Jeu de données v1 | Accord |
|---|---|---|---|---|
| Chandrayaan-3 Vikram (Statio Shiv Shakti) | 69,37345°S, 32,31985°E | [Gazetteer IAU](https://planetarynames.wr.usgs.gov/Feature/16272) | −69,373 ; 32,319 | oui |
| IM-1 Odysseus | 80,13°S, 1,44°E | [NASA LRO](https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/), [LROC](https://www.lroc.asu.edu/images/1360) | −80,13 ; 1,44 (badge « coordonnées non vérifiées » dans l'app) | oui |
| Blue Ghost M1 | 18,5623°N, 61,8103°E | [LROC](https://www.lroc.asu.edu/images/1407) | 18,56 ; 61,81 | oui |
| IM-2 Athena (position réelle) | 84,7906°S, 29,1957°E | [LROC](https://www.lroc.asu.edu/images/1408) | absent | — |
| Chang'e 6 (Statio Tianjiang) | 41,6385°S, 153,985°W | [LROC](https://www.lroc.asu.edu/images/1374), [Gazetteer](https://planetarynames.wr.usgs.gov/Feature/16328) | absent | — |
| Luna-25 (cible) | 69,545°S, 43,544°E | [NASA](https://www.nasa.gov/solar-system/nasas-lro-observes-crater-likely-from-luna-25-impact/) | absent | — |
| VIPER (site prévu) | « bord ouest du cratère Nobile », sans coordonnées ponctuelles | [NASA](https://www.nasa.gov/news-release/nasas-artemis-rover-to-land-near-nobile-region-of-moons-south-pole/) | absent | — |

Dans `sites.json`, la source citée pour les 13 sites est le plan de données interne (`Team data plan §6.2`, `primarySource: false`). Le fichier ne pointe pas vers les sources primaires ci-dessus.

### Centres de reliefs (Gazetteer IAU)

Ce sont des centres de cratères ou de massifs, **pas des sites d'atterrissage**.

| Relief | Lat | Lon |
|---|---|---|
| Shackleton | −89,67 | 129,78 |
| de Gerlache | −88,48 | −88,34 |
| Haworth | −87,45 | −5,17 |
| Mons Malapert | −85,98 | −1,67 |
| Mons Mouton | −84,60 | 31,00 |
| Nobile | −85,28 | 53,27 |
| Slater | −88,08 | 111,29 |
| Cabeus B | −82,26 | −54,58 |
| Shoemaker | −88,14 | 45,91 |
| Faustini | −87,18 | 84,31 |
| Amundsen | −84,44 | 83,07 |

### Distances des points d'étude aux reliefs

Calcul de l'audit : grand cercle sur une sphère de 1 737,4 km.

| Point d'étude | Relief le plus proche | Distance |
|---|---|---|
| `sp_s8950` (89,5°S ; 0°E) | centre de Shackleton | 22,9 km |
| `sp_s8800` (88,0°S ; 0°E) | centre de Haworth | 17,8 km |
| `sp_s8600` (86,0°S ; 0°E) | centre IAU de Mons Malapert | 3,6 km |

- **Non vérifié** : le diamètre de Haworth, et donc le fait que `sp_s8800` soit à l'intérieur du cratère. Les données v1 sont cohérentes avec cette hypothèse : 0 % de Soleil à toutes les dates.
- **Non vérifié** : que `sp_s8600` soit sur le massif de Malapert. Seule la distance au centre IAU est calculée.

---

## Points non vérifiés

- Les coordonnées de centre des 13 régions (2022) et des 9 régions (2024).
- Le site précis de Chang'e 7. Un chiffre circule seulement sur un miroir de Wikipédia.
- Le site et le statut de Blue Origin MK1, de Blue Ghost M2 et d'IM-3. Pour IM-3, seul le centre de Reiner Gamma est connu : 7,39°N ; 58,96°W.
- Les coordonnées ponctuelles de VIPER, de Connecting Ridge et de de Gerlache Rim.
- Le fait que Horizons n'applique aucun masque de relief local (connaissance générale, manuel non relu).
- La restructuration Artemis III → IV (texte des communiqués non relu par l'audit).
- Les dépôts concurrents Angel-A-V et nitrimandylis (404 sur l'API GitHub).
- Le règlement propre à l'événement de Paris : horaires du jugement local, prix locaux. À demander au Local Lead.
- Les limites d'hébergement des plateformes autres que GitHub Pages (Cloudflare, Netlify, Vercel) : non consultées.
- La limite de 1 Go pour un site GitHub Pages vient de la documentation GitHub. Elle n'a pas été relue aujourd'hui.
