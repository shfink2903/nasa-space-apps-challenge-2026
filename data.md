# DATA — Plan de traitement et de gestion des données

Équipe **True Larpers** — défi **Lunar Landing Site Navigator** — NASA Space Apps Challenge 2026, Paris, 14–15 novembre 2026.

**Statut : plan, mis à jour le 14 novembre 2026.** Aucun code, aucun noyau, aucun MNT ni aucun résultat calculé n'existe encore dans le dépôt. Les valeurs marquées « vérifié le 14/11/2026 » ont été relevées ce jour sur les sources officielles (annexe A). Celles marquées « à vérifier » ne doivent pas être publiées avant vérification.

**Périmètre : DATA uniquement.** Préparer les sites, calculer les positions du Soleil et de la Terre, intégrer le relief LOLA, détecter les fenêtres, comparer des scénarios et livrer des fichiers traçables à l'UI et à la couche IA. L'interface (carte, animations, composants, rendu) est construite ailleurs. Ce plan ne fixe que le contrat de données qu'elle consomme. Contexte produit : [CHALLENGE.md](CHALLENGE.md), [README.md](README.md).

**Objectif de livraison :** lot `data/processed/v1/` gelé le **15/11 à 12:00 (Paris)**, lisible sans réseau par l'UI et par l'outil IA.

Sommaire : §1 règles · §2 calendrier et niveaux · §3 besoin · §4 entrées · §5 sources et noyaux · §6 sites · §7 terrain · §8 géométrie Soleil/Terre · §9 événements et métriques · §10 comparaison · §11 sorties et cache · §12 accès UI/agents · §13 IA OpenRouter · §14 givre/glace · §15 vérification · §16 incertitudes · §17 décisions · annexes A (références vérifiées) et B (code de référence).

Vocabulaire : **MNT** = modèle numérique de terrain. **SPK** = noyau de trajectoires. **PCK** = noyau d'orientation/constantes. **FK** = définition de repères. **LSK** = secondes intercalaires (conversion UTC ↔ TDB). **Profil d'horizon** = élévation de l'obstacle le plus haut pour chaque azimut vu du site. **Provenance** = sources, versions et transformations ayant produit une valeur.

## 1. Règles non négociables

Ces règles s'appliquent à tout le document. Les autres sections y renvoient par leur numéro.

| # | Règle |
|---|---|
| R1 | Valeur absente ou non calculable : `null` accompagné d'un `reason` structuré, jamais `0`. Le zéro désigne un calcul valide égal à zéro. En JSON, ni `NaN` ni infini. |
| R2 | Aucun seuil, poids, coordonnée, hauteur ou caractéristique de véhicule n'est inventé. Chaque paramètre porte `value`, `unit` et `origin` (`user`, `team_default_hackathon`, `source:<id>`). Un défaut d'équipe est une hypothèse affichée, pas une exigence mission. |
| R3 | Quatre niveaux de résultat ne se confondent jamais : géométrie sans relief (`geometric`), visibilité avec relief (`lola`), éclairage direct avec occultations, liaison/énergie. Un niveau inférieur ne répond pas à une question d'un niveau supérieur. |
| R4 | Chaque résultat porte `modelLevel`, `coverageStatus` (`covered` / `partial` / `outside`), `validationStatus` (`validated_on_reference_cases` / `not_validated` / `failed`) et ses limites. |
| R5 | Rien n'est écrasé. Une nouvelle version produit un nouvel identifiant et un manifeste immuable lié au précédent. |
| R6 | Le LLM ne calcule aucune grandeur physique. Il explique des résultats calculés, en citant leurs identifiants. |
| R7 | « Meilleur » signifie toujours « meilleur parmi les scénarios explorés, selon les critères déclarés ». Jamais d'optimum global. |
| R8 | Le statut nominal et le statut prudent (avec marges) sont calculés séparément. Le nominal n'est jamais modifié par une marge. |
| R9 | Une tolérance de test est fixée et justifiée **avant** l'essai. Un écart observé n'est pas une borne d'erreur physique. |
| R10 | La démo lit uniquement le lot préparé. Aucun appel NASA/JPL ni aucun téléchargement scientifique pendant la démo. |

## 2. Calendrier du hackathon et niveaux livrables

Principe : chaque niveau produit un lot **complet et utilisable par l'UI**. Si un niveau échoue, on livre le précédent avec son statut honnête. On n'attend jamais la fin pour avoir quelque chose.

| Niveau | Créneau cible | Contenu | Sortie | « Fini » quand | Repli si en retard |
|---|---|---|---|---|---|
| **N0 — Géométrie** | 14/11 14:00–16:30 | Environnement Python, 5 noyaux, éphémérides au pas de 60 s du 2026-12-01 au 2027-12-24, az/él Soleil et Terre pour les 13 entrées du catalogue v1, sans relief (`modelLevel: geometric`). | `sites.json`, `scenarios/*_geometric.json`, `manifest.json` | Tests T1–T6 et T12 réussis (§15). | Aucun : N0 est le socle. Si SpiceyPy bloque, appeler Horizons pour les 13 entrées (13 × 2 requêtes séquentielles, §5.4) et étiqueter `engine: horizons`. |
| **N1 — Relief polaire** | 14/11 16:30–20:30 | 3 produits LOLA, profils d'horizon (h = 2 m et 10 m) pour les 3 points d'étude polaires, IM-1 et Chandrayaan-3, états de disque, fenêtres, métriques. | `horizons/*.json`, `scenarios/*_lola.json` | T7–T9 réussis, convergence 150/300 km documentée. | Livrer N0 avec un bandeau obligatoire pour les sites polaires : « relief non pris en compte : fenêtres non fiables au pôle sud ». |
| **N2 — Comparaison et contrat** | 14/11 20:30–23:30 | Balayage hebdomadaire des dates (52 débuts), comparaison, ensemble non dominé, paquet de preuves IA. Contrat JSON gelé avec l'UI à 21:00. | `comparisons/*.json`, `ai/*.evidence.json` | T10–T11 réussis, l'UI lit les fichiers sans erreur. | Comparaison sur la date unique 2026-12-01 seulement. |
| **N3 — Pédagogie et points libres** | 15/11 08:00–11:00 | Grille de sensibilité 5×5 (pas de 1 km) autour des points polaires, chemin « coordonnées personnalisées » (polaire ≤ −85° ou géométrique ailleurs), fraction de disque solaire visible, drapeau d'éclipse possible. | `sensitivity/*.json`, fonction `compute_custom_point` | Mêmes tests sur les nouveaux points. | Ne pas livrer N3. N2 reste complet. |
| **N4 — Gel** | 15/11 11:00–12:00 | Manifeste final, empreintes SHA-256, rapport de validation (§15.3), étiquette de version `v1`. | `data/processed/v1/` complet, `docs/validation/v1.md` | Lot relu par le responsable UI. | Geler le dernier niveau réussi. |

Après 12:00 le 15/11 : corrections de bugs uniquement, toujours dans une nouvelle version `v1.1` (R5).

**Rôles DATA (noms à inscrire par l'équipe) :**
- DATA-A, éphémérides et temps : §5, §8, N0.
- DATA-B, terrain : §7, N1, N3.
- DATA-C, contrat, comparaison et IA : §9–§13, N2, N4.

**Feuille de route après le hackathon (hors calendrier) :** calcul exact des éclipses (`gfoclt_c`), stations terrestres, modèles énergie/liaison/thermique, données de ressources, rover mobile, relation départ → arrivée, raffinement du MNT proche (`ldem_85s_20m`, `ldem_875s_5m`), benchmark complet (§16.2). Chaque extension suit les mêmes règles et doit être revalidée : elle n'hérite pas des tolérances du calcul géométrique.

## 3. Besoin exprimé sur le whiteboard

Source d'intention : photo d'équipe `IMG_5920.HEIC`, à verser dans `docs/sources/` avec son empreinte SHA-256. Cette photo décrit une idée produit, ce n'est pas une source scientifique. Le texte central pâle et les extrémités coupées ne sont pas reconstitués.

| Élément lisible | Exigence DATA | Où |
|---|---|---|
| Input : type de mission, fourchette de temps | Scénario = site + début en surface + durée + hauteur + versions. | §4 |
| Meilleure solution : communication Terre–Lune, éclairage Soleil–Lune, relief | Fenêtres Soleil/Terre avec relief LOLA, comparaison multi-critères sans score inventé. | §8–§10 |
| Map interactive | Contrat de données pour la carte (points, zones, séries, métriques). | §11.4 |
| IA : regrouper, comparer aux anciennes missions, relier au moteur, meilleures options | Paquet de preuves. L'IA explique et cite, elle ne calcule pas. | §13 |
| Moteur de calcul : prévision | SPICE local, couverture 1849–2150 avec `de440s.bsp`. | §5 |
| « Où atterrir ? », « Quand ? », saisons/jours lunaires | Balayage spatial (catalogue, grille 1 km) et temporel (52 débuts hebdomadaires), indicateur saisonnier défini. | §4.3, §10 |
| « Est-ce que ça pourra fonctionner ? » | `pass` / `fail` / `unknown` sur les seuls critères modélisés, nominal et prudent. Jamais de validation de mission. | §10.1 |
| « Exploiter frost » | Intention provisoire, **à confirmer par l'équipe**. Aucune donnée de ressource dans ce plan. | §14 |

## 4. Entrées : le scénario

### 4.1 Contrat d'entrée

Unité de comparaison : **scénario = position + début en surface (UTC) + durée analysée + hauteur d'observateur + jeu de noyaux + profil d'horizon + méthode.**

| Champ | Type / unité | Défaut hackathon (`origin: team_default_hackathon`) | Règle |
|---|---|---|---|
| `siteId` ou `customPoint` | chaîne, ou `{latDeg, lonDeg}` | — | Planétocentrique, est positif, `lonDeg` dans ]−180, 180], repère `MOON_ME`. Une coordonnée ambiguë (signe, repère) est refusée, jamais devinée. |
| `surfaceStartUtc` | ISO 8601, `Z` | `2026-12-01T00:00:00Z` | Doit tomber dans la couverture (§5.3). |
| `analysisDurationS` | secondes | `2592000` (30 j) | 30 j ≥ un mois synodique (29,53 j), donc au moins un jour solaire lunaire complet. Ce n'est pas une durée de transfert. |
| `observerHeightM` | mètres au-dessus du sol LOLA | `2.0`, plus `10.0` en sensibilité | Hypothèses d'équipe (panneau/antenne d'atterrisseur, mât), affichées comme telles (R2). |
| `computeStepS` | secondes | `60` | Pas de calcul, distinct du pas d'affichage (`600`). |
| `diskConvention` | `anyDisk` / `fullDisk` | les deux calculés | Jamais mélangés dans un même classement. |
| `hardConstraints` | liste `{metricId, op, value, unit, origin}` | **vide** | Fournies par l'utilisateur. Sans contrainte, le verdict vaut `not_evaluated`. |
| `preferences` | liste ordonnée de `metricId` avec sens ↑/↓ | vide (on calcule alors l'ensemble non dominé, §10.2) | Aucun poids par défaut. |
| `missionMargins` | `{timeS, angleDeg}` | absentes, donc statut prudent `not_evaluated` | Une marge absente n'est pas une marge nulle. |
| `resourceRequirement` | texte + source | absent | Sans source adéquate, le critère vaut `unknown` (§14). |

**Validation préalable** (refus avec `invalid_request` et le champ en cause) : types et valeurs finies, `latDeg` ∈ [−90, 90], `lonDeg` ∈ ]−180, 180], durée > 0, début dans la couverture, unités présentes sur chaque seuil, `|latDeg| < 89.9999` (au pôle exact, la direction « nord » n'est pas définie, §8.1). Taille de demande plafonnée à **60 couples site × date par requête**. C'est une limite technique publiée, pas une limite scientifique : au-delà, la demande est découpée et les morceaux non calculés sont listés.

### 4.2 Trois dimensions de temps à ne pas confondre

1. **Éloignement** : dans combien de temps commence le scénario (de quelques jours à plusieurs années).
2. **Durée analysée** : 30 j par défaut après ce début.
3. **Latence** : temps de calcul ou de lecture du cache.

« 30 jours dans dix ans » coûte le même calcul que « 30 jours le mois prochain ». Seule la fenêtre utile est calculée, pas les dix années intermédiaires. La précision n'est pas pour autant garantie identique : la validation ne couvre que les dates testées (R4).

Hors MVP : la relation date de départ → date d'arrivée. Le MVP prend directement la date de début en surface. Sans relation documentée, ni le moteur ni le LLM ne déduisent une arrivée à partir d'un départ.

### 4.3 Saisons et libration : définitions retenues

- **Indicateur saisonnier `subSolarLatDeg`** : latitude du point subsolaire dans `MOON_ME`. Elle oscille d'environ ±1,54° (inclinaison de l'équateur lunaire sur l'écliptique) avec une période d'environ 346,6 j (année draconitique). Au pôle, c'est elle qui fixe la hauteur maximale du Soleil. Le mot « saison » n'apparaît dans l'UI qu'accompagné de cette grandeur.
- **Libration de la Terre** : `subEarthLatDeg` et `subEarthLonDeg` (environ ±6,7° en latitude et ±7,9° en longitude). Elle explique pourquoi la Terre monte et descend sur l'horizon polaire au fil du mois, et pourquoi elle reste invisible depuis la face cachée.
- Les deux sont calculés par SPICE avec le même jeu de noyaux. Aucun mouvement périodique supplémentaire n'est ajouté.
- Le « jour solaire lunaire » vaut un mois synodique (≈29,53 j). Aucune journée type n'est répétée : chaque date est calculée.

## 5. Sources et moteur astronomique

### 5.1 Choix

**Moteur : SPICE local via SpiceyPy (Python), éphéméride DE440 courte.** Horizons sert seulement de référence de test (§5.4, §15). Aucun calcul physique n'est délégué au LLM.

| Rôle | Fichier | URL (NAIF `generic_kernels`) | Taille (octets, HEAD du 14/11/2026) | Notes |
|---|---|---|---:|---|
| Secondes intercalaires | `naif0012.tls` | `.../lsk/naif0012.tls` | 5 257 | Dernière LSK publiée (aucune `naif0013` dans le répertoire au 14/11/2026). Les futures secondes intercalaires sont inconnues : une date UTC future est convertie avec la dernière connue. |
| Constantes (rayons) | `pck00011.tpc` | `.../pck/pck00011.tpc` | 131 226 | `BODY301_RADII = (1737.4 1737.4 1737.4)`, la même sphère que LOLA. |
| Trajectoires | `de440s.bsp` | `.../spk/planets/de440s.bsp` | 32 726 016 | Couverture **1849-12-26 → 2150-01-22** (`aa_summaries.txt`). |
| Orientation lunaire | `moon_pa_de440_200625.bpc` | `.../pck/moon_pa_de440_200625.bpc` | 12 863 488 | Repère PCK `MOON_PA_DE440` (code 31008). |
| Repères lunaires | `moon_de440_250416.tf` | `.../fk/satellites/moon_de440_250416.tf` | 19 478 | `MOON_ME` → `MOON_ME_DE440_ME421`, aligné sur ME DE421 (le repère des produits LOLA). |
| **Total noyaux** | | | **45 745 465** | ≈ 45,7 Mo, hors git. |

Non retenu pour le MVP : `de440.bsp` (119 799 808 octets, 1550–2650), seulement utile hors de 1849–2150. Les noyaux d'orientation terrestre ne servent qu'aux stations (feuille de route).

### 5.2 Installation et chargement (commandes)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "spiceypy>=6" numpy scipy pyproj rasterio
python -c "import spiceypy as sp; print(sp.tkvrsn('TOOLKIT'))"   # attendu : CSPICE_N0067 ou plus récent
mkdir -p data/raw/kernels && cd data/raw/kernels
B=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
curl -fO $B/lsk/naif0012.tls
curl -fO $B/pck/pck00011.tpc
curl -fO $B/spk/planets/de440s.bsp
curl -fO $B/pck/moon_pa_de440_200625.bpc
curl -fO $B/fk/satellites/moon_de440_250416.tf
shasum -a 256 naif0012.tls pck00011.tpc de440s.bsp moon_pa_de440_200625.bpc moon_de440_250416.tf > SHA256SUMS
```

Méta-noyau `data/raw/kernels/lunar_v1.tm`. L'ordre de chargement est figé et consigné dans le manifeste :

```text
\begindata
PATH_VALUES  = ( 'data/raw/kernels' )
PATH_SYMBOLS = ( 'K' )
KERNELS_TO_LOAD = ( '$K/naif0012.tls'
                    '$K/pck00011.tpc'
                    '$K/de440s.bsp'
                    '$K/moon_pa_de440_200625.bpc'
                    '$K/moon_de440_250416.tf' )
\begintext
```

Le méta-noyau est chargé **une seule fois par processus**. Un processus reste lié à un `kernelSetId` = SHA-256 du méta-noyau et des 5 empreintes. Un autre jeu de noyaux exige un autre processus. Pas de chargement concurrent de noyaux dans un même processus.

### 5.3 Couverture

Plage calculable = intersection des couvertures. Elle se contrôle au démarrage :

```python
sp.spkcov("data/raw/kernels/de440s.bsp", 301)        # Lune
sp.spkcov("data/raw/kernels/de440s.bsp", 399)        # Terre
sp.pckcov("data/raw/kernels/moon_pa_de440_200625.bpc", 31008)
```

Plage attendue : 1849-12-26 → 2150-01-22, limitée par `de440s.bsp`. Une demande hors plage renvoie `outside_coverage` avec les bornes, sans extrapolation ni réduction silencieuse de la période. Couverture mathématique ≠ validation : seules les dates testées au §15 sont « validées ».

### 5.4 Horizons : référence de test, pas moteur

Requête type (vérifiée le 14/11/2026). Une seule requête à la fois, User-Agent applicatif, réponse brute archivée dans `data/raw/horizons/` :

```bash
curl -s -A "true-larpers-data/1.0" --get "https://ssd.jpl.nasa.gov/api/horizons.api" \
  --data-urlencode "format=text" --data-urlencode "COMMAND='10'" \
  --data-urlencode "CENTER='coord@301'" --data-urlencode "COORD_TYPE='GEODETIC'" \
  --data-urlencode "SITE_COORD='23.47314,0.67416,0'" \
  --data-urlencode "MAKE_EPHEM='YES'" --data-urlencode "EPHEM_TYPE='OBSERVER'" \
  --data-urlencode "START_TIME='2026-12-01'" --data-urlencode "STOP_TIME='2026-12-01 03:00'" \
  --data-urlencode "STEP_SIZE='3h'" --data-urlencode "QUANTITIES='4,20'" \
  --data-urlencode "ANG_FORMAT='DEG'" --data-urlencode "APPARENT='AIRLESS'" \
  --data-urlencode "CSV_FORMAT='YES'"
```

`COMMAND='10'` désigne le Soleil, `'399'` la Terre. `SITE_COORD` = longitude est, latitude, altitude en km au-dessus de la sphère de 1737,4 km. `QUANTITIES='4,20'` = azimut/élévation apparents et distance. `APPARENT='AIRLESS'` = pas de réfraction : il n'y a pas d'atmosphère lunaire.

Ce qu'indique la réponse : éphéméride **DE441**, repère du centre **`MEAN_ME (high precision)`**, rayons 1737,4 km, **déflexion relativiste** par le Soleil et la Terre, temps en UTC avec la dernière seconde intercalaire connue maintenue constante. Conséquences :
- Horizons et notre chaîne partagent presque la même source. L'accord prouve une mise en œuvre correcte (repères, temps, conventions), pas l'exactitude physique.
- Les corrections diffèrent légèrement. Horizons ajoute la déflexion, notre chaîne applique `LT+S`. L'écart attendu reste très inférieur à la tolérance de 0,01° (§15).
- Pour comparer, l'observateur de notre chaîne est placé à `h = 0` sur la sphère de 1737,4 km, sans altitude LOLA.

### 5.5 Acquisition et intégrité

Chaque fichier brut a une fiche `SourceRecord` dans `data/raw/SOURCES.json` : organisme, produit/version, URL, `retrievedAt`, taille annoncée (HEAD) et taille reçue, SHA-256, format, unités, repère, emprise, valeur invalide, label associé. Règles :
- téléchargement vers un fichier `*.part`, renommé seulement après contrôle taille + SHA-256 ;
- `curl -f` avec 3 tentatives au plus ;
- HTTP 429/503 : respecter `Retry-After`, puis délais de 10, 30 et 90 s ;
- HTTP 400/403/404 : arrêt et état `missing_dependency`, sans boucle ;
- schéma ou colonnes inattendus : `source_format_changed`, parseur arrêté, aucune colonne devinée.

Une empreinte calculée localement identifie le contenu. Elle ne prouve ni l'authenticité ni l'exactitude.

## 6. Sites : catalogue v1

### 6.1 Règles

- Repère `MOON_ME`, latitude planétocentrique, longitude est positive dans ]−180, 180], degrés décimaux.
- Altitude du sol : **lue dans le MNT LOLA au point**, pas reprise de la source. Les sources donnent rarement une altitude dans la même référence. Pour un site sans MNT chargé, `groundHeightM: null` et le calcul se fait en `geometric`.
- `status` ∈ `historical` (site atteint), `announced` (cible annoncée et datée), `study_point` (point défini par l'équipe), `zone` (région, pas un point). « Confirmé » ne dit rien de l'aptitude mission.
- `sources` : 2 références indépendantes requises pour passer `verification: "verified"`. Avec une seule référence, le site reste utilisable en démo avec la mention `verification: "single_source"` affichée.
- Un succès historique sert de contexte. Il ne valide ni une autre date ni une autre position.

### 6.2 Catalogue v1

Les coordonnées Apollo viennent des positions mesurées sur images LRO, relevées via Wikipédia le 14/11/2026 (1 référence). La 2e référence à ajouter : Apollo Lunar Surface Journal ou publications LROC.

| id | Nom | status | lat (°) | lon (°E) | verification | MNT N1 |
|---|---|---|---:|---:|---|---|
| `apollo11` | Apollo 11 – Tranquility Base | historical | 0.67416 | 23.47314 | single_source | — (geometric) |
| `apollo12` | Apollo 12 – Oceanus Procellarum | historical | −3.01239 | −23.42157 | single_source | — |
| `apollo14` | Apollo 14 – Fra Mauro | historical | −3.64530 | −17.47136 | single_source | — |
| `apollo15` | Apollo 15 – Hadley-Apennin | historical | 26.13220 | 3.63390 | single_source | — |
| `apollo16` | Apollo 16 – Descartes | historical | −8.97301 | 15.50019 | single_source | — |
| `apollo17` | Apollo 17 – Taurus-Littrow | historical | 20.19080 | 30.77168 | single_source | — |
| `chandrayaan3` | Chandrayaan-3 Vikram (point Shiv Shakti) | historical | −69.373 | 32.319 | single_source | `ldem_60s_240m` |
| `change4` | Chang'e 4 – Von Kármán (face cachée) | historical | −45.444 | 177.599 | single_source | — (Terre jamais visible) |
| `blueghost1` | Blue Ghost M1 – Mare Crisium | historical | 18.56 | 61.81 | single_source | — |
| `im1` | IM-1 Odysseus – près de Malapert A | historical | −80.13 | 1.44 | à vérifier | `ldem_75s_120m` |
| `sp_s8950` | Point d'étude 89,5°S | study_point | −89.50 | 0.00 | défini par l'équipe | `ldem_80s_80m` |
| `sp_s8800` | Point d'étude 88,0°S | study_point | −88.00 | 0.00 | défini par l'équipe | `ldem_80s_80m` |
| `sp_s8600` | Point d'étude 86,0°S | study_point | −86.00 | 0.00 | défini par l'équipe | `ldem_80s_80m` |

Les trois points d'étude sur le méridien 0° montrent l'effet de 2° de latitude près du pôle. Ce ne sont pas des sites de mission. Ils sont choisis pour que la grille de sensibilité et le rayon de 150 km restent dans `ldem_80s_80m`.

**Zones à ajouter dès qu'une source donne leur emprise** (`status: zone`, `latDeg` / `lonDeg` à `null` d'ici là) : les 9 régions candidates d'Artemis III annoncées par la NASA en octobre 2024 (Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain), à vérifier sur la page NASA. À ajouter aussi : IM-2 Athena (Mons Mouton, 2025), Chang'e 6 (≈41,6°S, 154,0°W, à vérifier) et SLIM (≈13,32°S, 25,25°E, à vérifier). Une zone est représentée par son polygone et par les points réellement calculés, jamais par un point unique présenté comme représentatif.

### 6.3 Champs de `sites.json`

`id`, `name`, `mission`, `status`, `statusDate`, `positionKind` (`landed_point` / `announced_target` / `study_point` / `zone`), `latDeg`, `lonDeg`, `frame: "MOON_ME"`, `latitudeType: "planetocentric"`, `polygon` (zones), `groundHeightM` + `groundHeightSource`, `positionUncertainty` (valeur et source, ou `"unquantified"`), `sources[]` (`title`, `url`, `accessed`, `primarySource`), `verification`, `terrainProduct` ou `null`, `notes`.

## 7. Terrain LOLA : profils d'horizon

### 7.1 Choix du produit selon la latitude

Produits LOLA GDR polaires, répertoire `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/` (vérifié le 14/11/2026). Règle : **le site et le rayon d'analyse (150 km) doivent tenir dans l'emprise** ; une marge supplémentaire de 10 km est recommandée. À 30,32 km par degré de latitude, le bord d'un produit « XXS » se trouve à (90 − XX) × 30,32 km du pôle.

| Produit | Pas | Emprise (bord à…) | Taille `.img` (octets) | Sites concernés (rayon 150 km dans l'emprise) |
|---|---:|---|---:|---|
| `ldem_80s_80m` | 80 m | 80°S → 90°S (≈303 km du pôle) | 115 520 000 | lat ≤ −84,95° : `sp_s8950`, `sp_s8800`, `sp_s8600` |
| `ldem_75s_120m` | 120 m | 75°S → 90°S (≈455 km) | 116 250 752 | lat ≤ −79,95° : `im1` (−80,13°, marge ≈ 5,6 km seulement : test 300 km avec `ldem_60s_240m`) |
| `ldem_60s_240m` | 240 m | 60°S → 90°S (≈910 km) | 120 435 200 | lat ≤ −64,95° : `chandrayaan3` |
| **Total MVP** | | | **352 205 952** | + noyaux = **397 951 417 octets** au total |

Écartés pour le hackathon, mesurés au 14/11/2026 : `ldem_80s_20m` (1 848 320 000 octets), `ldem_75s_30m` (1 860 012 032), `ldem_60s_60m` (1 926 963 200). Candidats pour raffiner le terrain proche après N1 : `ldem_85s_20m` (460 136 448), `ldem_875s_20m` (115 034 112), `ldem_875s_5m`.

Lecture (label `ldem_80s_80m.lbl`, vérifié le 14/11/2026) : 7600 × 7600 entiers 16 bits little-endian (`LSB_INTEGER`), `SCALING_FACTOR = 0.5`, `OFFSET = 1737400` m. Donc **hauteur (m) = DN × 0,5** et **rayon (m) = 1 737 400 + DN × 0,5**. Projection stéréographique polaire sphérique, centre −90°, R = 1737,4 km, `LINE/SAMPLE_PROJECTION_OFFSET = 3799.5`, repère **`MEAN EARTH/POLAR AXIS OF DE421`**. Le label décrit des données LOLA « préliminaires » allant jusqu'à la phase `LRO_ES_54` : ce point est à consigner dans la provenance. Les produits sont interpolés et n'ont pas de valeur invalide. Les rayons qui sortent de l'emprise sont traités comme **inconnus**, jamais comme une altitude nulle (R1).

Projection à utiliser, à comparer au CRS lu par GDAL (`gdalinfo ldem_80s_80m.lbl`) : `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs`. Si GDAL applique lui-même un facteur ou un décalage (`ds.scales`, `ds.offsets`), ne pas l'appliquer deux fois.

### 7.2 Algorithme du profil

Pour chaque site et chaque hauteur `h` :

1. Lire `h0` = hauteur LOLA au site par interpolation bilinéaire. Observateur `O = (1 737 400 + h0 + h) · u0`, avec `u0` le vecteur unitaire du site dans `MOON_ME`.
2. Pour chaque azimut de 0° à 359,9° **par pas de 0,1°** (3 600 azimuts), marcher le long du grand cercle de `2 × pas MNT` jusqu'à `R_max = 150 km`, par pas égaux au pas du MNT. Cela donne 1 875 points par azimut à 80 m.
3. Pour chaque point `T = (1 737 400 + h_T) · u_T`, calculer l'élévation `el = asin( (T − O)·u0 / |T − O| )`. Le calcul est vectoriel et sphérique : il n'y a pas de soustraction d'altitudes sur un plan. Le limbe géométrique (dépression d'horizon) est inclus de fait.
4. `horizonElevationDeg[az]` = maximum de `el`. On conserve aussi `distanceOfMaxKm[az]` et `reachKm[az]` (distance couverte avant la sortie du MNT).
5. Si `reachKm < R_max`, l'azimut est marqué `truncated` : les métriques dont l'astre passe par cet azimut deviennent `partial` ou `unknown` selon le cas (§9).

**Pourquoi 150 km et pas 20–50 km.** Au pôle, l'élévation maximale du Soleil vaut environ 1,54° + (90° − |lat|), soit environ 2° à 89,5°S. Un massif de 5 km à 100 km est vu à +1,21° par un observateur à 2 m au-dessus d'une plaine, ce qui suffit à masquer le Soleil. Un observateur placé en hauteur (rebord, crête) voit plus bas que l'horizontale : à 2 km au-dessus des environs, sa dépression d'horizon atteint 2,75°, et du relief plus lointain devient alors déterminant. **Test de convergence obligatoire** à 50, 100, 150 et 300 km. Le passage à 300 km utilise le produit de la bande suivante, car `ldem_80s_80m` s'arrête à ≈303 km du pôle : `ldem_75s_120m` (emprise ≈455 km) pour les points du §6.2 au sud de 85°S, `ldem_60s_240m` pour `im1`. On publie la variation maximale du profil et des temps d'événements entre 150 et 300 km. Si elle dépasse la tolérance fixée au §15 (T9), on passe à 300 km pour ce site.

Coût estimé : 3 600 × 1 875 ≈ 6,75 millions d'échantillons bilinéaires par profil. C'est quelques secondes en numpy, **à mesurer**. Mémoire : MNT en `float32` de 7600² × 4 ≈ 231 Mo.

### 7.3 Contrat du profil (`horizons/<siteId>_h<h>m.json`)

`profileId` (SHA-256 tronqué à 12 caractères des entrées ci-dessous), `siteId`, `latDeg`, `lonDeg`, `groundHeightM`, `observerHeightM`, `frame: "MOON_ME"`, `shape: "sphere_1737.4km"`, `demProduct` + SHA-256, `demPixelM`, `rMaxKm`, `radialStepM`, `azimuthStepDeg: 0.1`, `azimuthDeg[]` (implicites : `0 + i × 0,1`), `horizonElevationDeg[]` (`null` si inconnu), `distanceOfMaxKm[]`, `reachKm[]`, `truncatedAzimuthCount`, `convergence` (écart max 150 vs 300 km, en degrés), `interpolation: "bilinear"`, `limits[]`. Changer la hauteur, le produit ou `R_max` produit un nouveau `profileId` (R5).

Un profil d'horizon ne dit rien de la pente sous l'atterrisseur, de la rugosité ni des dangers d'atterrissage : ces critères sont déclarés `not_evaluated`. Un profil fixe ne vaut que pour un observateur immobile : un rover demandera des profils le long de sa trajectoire (feuille de route).

### 7.4 Points personnalisés (N3)

Pour un point avec lat ≤ −84,95°, le profil est calculé à la demande avec `ldem_80s_80m` (quelques secondes, à mesurer). Ailleurs, le calcul se fait en `geometric` avec le bandeau R3. Le profil calculé est mis en cache par `profileId`.

## 8. Géométrie Soleil/Terre

### 8.1 Calcul

1. **Une fois par époque, indépendamment du site :** `spkpos(target, et, "MOON_ME", "LT+S", "MOON")` pour `SUN` et `EARTH`, ce qui donne les vecteurs depuis le centre de la Lune en km. La grille va du 2026-12-01T00:00Z au 2027-12-24T00:00Z au pas de 60 s, soit 558 721 époques × 2 corps × 3 × 8 octets = **26 818 608 octets**. Ce fichier reste côté serveur (`data/interim/ephem_v1.npy`), hors git.
2. **Pour chaque site :** `obs = latrec(1737.4 + (h0 + h)/1000, lon, lat)` en km. `v = cible − obs` : c'est la parallaxe, jusqu'à 0,26° pour la Terre et négligeable pour le Soleil. Base locale : `up = obs/|obs|`, `east = normalise(ẑ × up)`, `north = up × east`.
3. `azimuthDeg = atan2(v·east, v·north) mod 360` (nord = 0°, est = 90°, sens horaire vu du ciel). `elevationDeg = asin(v·up / |v|)`. `distanceKm = |v|`.
4. Rayon apparent : `angularRadiusDeg = asin(R_corps / distanceKm)`, avec R☉ = 695 700 km (rayon nominal IAU 2015) et R⊕ = 6 378,137 km (rayon équatorial, celui qu'utilise Horizons).
5. Pas de réfraction (Lune sans atmosphère).

Approximation déclarée : la correction `LT+S` est calculée depuis le centre de la Lune et non depuis le site. L'écart de temps-lumière est au plus de 1737,4 / 299 792,458 ≈ 5,8 ms, négligeable devant le pas de 1 s. Les tests T1–T5 le confirment ou l'infirment.

Pôle : la base locale n'est pas définie si `obs` est sur l'axe polaire, d'où le refus de `|lat| ≥ 89.9999` (§4.1). Près du pôle, « nord » désigne la direction de l'équateur le long du méridien du site. C'est la même convention qu'Horizons et que la marche en grand cercle du §7.2. La convention polaire figure dans chaque fichier.

Variante possible : `azlcpo` (CSPICE N0067+) avec `method="ELLIPSOID"`, `azccw=False`, `elplsz=True`, `obsref="MOON_ME"`. Elle doit donner les mêmes valeurs à 1e-6° près sur T1–T5. Si ce n'est pas le cas, on garde la méthode vectorielle ci-dessus, qui est la référence.

### 8.2 Valeurs de contrôle d'ordre de grandeur

- Soleil : rayon apparent compris entre 0,262° et 0,271° selon la distance Terre–Soleil. Au pôle, l'élévation reste dans ±(1,54° + (90° − |lat|)) à quelques centièmes près. Le disque fait 0,53° : la visibilité partielle compte donc beaucoup au pôle.
- Terre : rayon apparent entre 0,899° (406 700 km) et 1,025° (356 400 km). Le 2026-12-01 à 00:00Z, Horizons donne une distance de 0,0025057 au, soit un rayon d'environ 0,975°. Au pôle, l'élévation oscille d'environ ±7° au fil du mois.
- Face cachée (`change4`) : élévation de la Terre ≈ −45,4° le 2026-12-01, donc jamais visible. Ce site sert de cas pédagogique du relais (Queqiao), hors périmètre de calcul.

### 8.3 États du disque par rapport au terrain

Avec `hz = horizonElevationDeg` interpolé à l'azimut du centre (interpolation périodique sur 360°) et `r` le rayon apparent :

- `c_upper = el + r − hz`, `c_lower = el − r − hz` ;
- `full` si `c_lower > 0`, `partial` si `c_upper > 0 ≥ c_lower`, `none` si `c_upper ≤ 0`, `unknown` si `hz` vaut `null` à cet azimut.

Ce calcul suppose un horizon constant sur la largeur du disque. Il est contrôlé : si `max − min` de `hz` sur `[az − r/cos(el), az + r/cos(el)]` dépasse 0,05°, l'échantillon est marqué `maskVariesAcrossDisk: true`.

**Fraction du disque solaire visible (N3)**, dans la même approximation : `d = clip((el − hz)/r, −1, 1)`, puis `f = (π − arccos(d) + d·√(1 − d²)) / π`. On a bien f(−1) = 0, f(0) = 0,5 et f(1) = 1. C'est une fraction d'aire géométrique : ce n'est pas une puissance (pas d'assombrissement centre-bord, pas de modèle de panneau). Elle est publiée `null` quand `maskVariesAcrossDisk` est vrai.

### 8.4 Occultation du Soleil par la Terre (éclipse vue de la Lune)

Hors du MVP, il n'y a pas de calcul exact. Drapeau peu coûteux en N3 : `earthSunOcclusionPossible = séparation angulaire(Soleil, Terre vus du site) < r☉ + r⊕`, soit environ 1,24°. Sur les intervalles marqués, la métrique « éclairage direct » vaut `unknown`, alors que la métrique « Soleil dégagé du terrain » reste valide. On ne multiplie jamais deux fractions de masquage indépendantes. Calcul exact en feuille de route : `gfoclt_c` / `occult_c` avec un observateur placé au site, testé sur un cas « Soleil dégagé du terrain mais occulté ».

### 8.5 Ce que ces résultats ne démontrent pas

Le Soleil visible ne garantit ni puissance ni bilan thermique ou batterie : il n'existe aucun watt sans modèle de panneau. La Terre visible signifie une visibilité géométrique de la Terre : elle ne garantit ni station joignable ni liaison radio. Un relais demande ses propres éphémérides. Tous ces points sont dans la feuille de route et déclarés `not_evaluated` dans chaque scénario (`requestedCapabilities` / `evaluatedCapabilities`).

## 9. Événements, fenêtres et métriques

### 9.1 Détection

1. Fonction de dégagement par corps et convention : `anyDisk` → `c_upper`, `fullDisk` → `c_lower`.
2. Évaluation sur la grille de 60 s. Chaque changement de signe entre deux échantillons donne un événement candidat.
3. **Bissection à 1 s** entre les deux échantillons, en recalculant directement la géométrie à l'instant milieu (`spkpos` ponctuel + profil). On conserve `[tBefore, tAfter]` et le nombre d'itérations.
4. **Contacts rasants :** tout minimum local de `|c|` inférieur à 0,05° sans changement de signe est enregistré comme `grazing`. Une affirmation « aucun événement » sur cet intervalle est alors impossible. On raffine par un pas de 5 s autour du minimum, puis on refait la bissection si un signe change.
5. Intervalles semi-ouverts `[début, fin)`, ordonnés et disjoints par métrique. Les intervalles adjacents sont fusionnés. Un trou de données n'est jamais comblé.
6. Un intervalle qui touche une borne de la fenêtre porte `truncatedStart` / `truncatedEnd`. Un astre visible (ou masqué) sur toute la période ne reçoit aucun lever ni coucher inventé.

Risque résiduel déclaré : un événement aller-retour de moins de 60 s, sans minimum rasant détecté, peut échapper à la grille. Le réglage (1 s), la précision d'encadrement et l'incertitude physique sont trois informations distinctes (§16).

### 9.2 Métriques (identifiants stables)

| `metricId` | Définition | Unité |
|---|---|---|
| `sun.anyDisk.fraction` | Durée où au moins une partie du Soleil dépasse le terrain, divisée par la durée analysable. | — (0–1) |
| `sun.fullDisk.fraction` | Idem pour le disque entier. | — |
| `earth.anyDisk.fraction` | Idem pour la Terre (visibilité géométrique). | — |
| `overlap.sunAny_earthAny.fraction` | Intersection des deux fenêtres, sur la durée analysable. C'est un indicateur géométrique, pas une preuve d'opérations simultanées. | — |
| `sun.anyDisk.longestGapH` | Plus longue coupure **observée dans la fenêtre**, avec marqueur de troncature. | h |
| `earth.anyDisk.longestGapH` | Idem pour la Terre. | h |
| `sun.anyDisk.nextSetH` / `earth.anyDisk.nextSetH` | Temps jusqu'au prochain coucher **depuis l'instant sélectionné**. `null` + `"beyond_window"` ou `"unknown"` sinon. | h |
| `sun.maxElevDeg`, `earth.maxElevDeg` | Élévation maximale du centre sur la fenêtre. | ° |
| `sun.meanElevWhenAnyDiskDeg` | Élévation moyenne du centre pendant la visibilité. | ° |
| `analysis.analysableFraction` | Durée analysable sur durée demandée (trous et troncatures exclus). | — |

Formules : pour `W = [t0, t1)` et des intervalles visibles disjoints `I_k`, `D = Σ |I_k ∩ W|`. `fraction = D / durée analysable`. On publie aussi la durée demandée, la durée analysable et la couverture manquante. Les trous ne comptent ni comme visibles ni comme masqués. Aucun champ « sunlight » ambigu n'existe.

## 10. Comparaison et « est-ce que ça peut fonctionner ? »

### 10.1 Évaluer avant de classer

1. Contrôler les entrées, la couverture et la compatibilité des repères.
2. Calculer les métriques et leur qualité.
3. Pour chaque contrainte de l'utilisateur, verdict `pass` / `fail` / `unknown` avec la valeur, le seuil, l'unité, l'origine et la raison.
4. `nominalStatus` : `fail` si un critère obligatoire échoue. Sinon `unknown` si un critère est inconnu. `pass` si tous sont évalués et respectés. `not_evaluated` en l'absence de critère.
5. `prudentStatus` : même règle après application des marges, qui érodent les fenêtres de `timeS` à chaque bord et relèvent l'horizon de `angleDeg`. Le nominal est conservé (R8). Sans marge, `not_evaluated`. À marge explicitement nulle, prudent = nominal. Une fenêtre qui disparaît après marge reste visible en nominal, avec la raison du rejet prudent.
6. Un critère proche de son seuil (écart inférieur à l'écart de convergence mesuré au §15, T9) est marqué `fragile`, même s'il passe.

**Sens exact de `pass`** : les critères modélisés sont respectés avec les données et conventions déclarées. Cela ne valide ni la trajectoire, ni la descente, ni l'énergie, le thermique, le réseau ou les ressources. Ces exclusions sont affichées à côté du verdict.

Exemple de contrainte saisie par l'utilisateur dans l'UI (ce n'est pas un défaut) : `{metricId: "sun.anyDisk.longestGapH", op: "<=", value: 72, unit: "h", origin: "user"}`.

### 10.2 Classement sans score inventé

- **Ensemble non dominé** sur les critères par défaut proposés par l'équipe (`origin: team_default_hackathon`, modifiables) : `sun.anyDisk.fraction` ↑, `earth.anyDisk.fraction` ↑, `sun.anyDisk.longestGapH` ↓, `overlap.sunAny_earthAny.fraction` ↑. Une option est non dominée si aucune autre ne fait au moins aussi bien sur tous ces critères et strictement mieux sur au moins un. Une valeur `null` empêche toute conclusion de dominance sur ce critère. Une coupure tronquée n'est comparée qu'à une coupure de même statut.
- **Tri** : seulement si l'utilisateur choisit un ordre de priorité (lexicographique), consigné dans `comparison.method`. Pas de poids sans demande explicite. Si un score est demandé, normalisation, poids, sens et règle d'égalité sont archivés. `unknown` ne vaut jamais zéro ni une bonne note.
- Si tous les scénarios échouent ou restent inconnus, on renvoie ce constat et les contraintes en cause, sans recommandation forcée.

### 10.3 Balayages

- **Dates (N2)** : 52 débuts hebdomadaires, du 2026-12-01 au 2027-11-23, chacun sur 30 j. La série annuelle déjà calculée (§8.1) est découpée en tranches, sans aucun recalcul. Ce balayage couvre une année draconitique entière (≈346,6 j), donc toute la variation saisonnière de `subSolarLatDeg`. Sortie : un tableau de métriques pour 52 dates × chaque site, plus `subSolarLatDeg` moyen par tranche.
- **Espace (N3)** : grille 5 × 5 au pas de 1 km (±2 km) autour de chaque point polaire, avec un profil par point (25 profils par site). On publie la plage de variation de chaque métrique. C'est la réponse chiffrée au « pourquoi un petit déplacement change tout » du défi. La grille et ses limites sont publiées. Aucun « meilleur endroit de la région » ne sort d'une grille non décrite.
- **Hauteur** : 2 m contre 10 m pour les points polaires.
- Pour chaque option présentée : site, début et fin, contraintes respectées, violées ou inconnues, coupures, compromis, nominal et prudent, sources, limites, et l'ensemble exploré (« 52 dates × 13 sites, grille 5×5 »). Toute différence affichée liste les seuls paramètres modifiés.

**Comparaison historique** : pour un site Apollo, on recalcule les conditions géométriques à la date réelle de la mission avec le même moteur, sans inventer les raisons de son succès. Les dates exactes des opérations en surface sont à sourcer, champ `historicalWindowUtc`.

## 11. Sorties, cache et contrat pour la carte

### 11.1 Arborescence

```text
data/
  raw/                         # hors git : kernels/, lola/, horizons/, SOURCES.json
  interim/                     # hors git : ephem_v1.npy, caches recalculables
  processed/v1/                # versionné, lu par l'UI et l'IA (R10)
    manifest.json
    sites.json
    horizons/<siteId>_h<h>m.json
    scenarios/<scenarioId>.json
    sweeps/<siteId>_h<h>m_dates.json
    sensitivity/<siteId>_h<h>m_grid1km.json
    comparisons/<comparisonId>.json
    ai/<comparisonId>.evidence.json
docs/
  sources/                     # photo du whiteboard + empreinte
  validation/v1.md             # rapport réel des tests du §15
```

Identifiants déterministes : `scenarioId = <siteId>_<YYYYMMDD>_<durée>d_h<h>m_<modelLevel>_<hash8>`, avec `hash8` = 8 premiers caractères du SHA-256 de la requête normalisée + `kernelSetId` + `profileId` + version du moteur + `computeStepS`. Changer l'un de ces éléments change l'identifiant (R5).

### 11.2 Fichier scénario

| Bloc | Champs |
|---|---|
| Identité | `schemaVersion: "1.0.0"`, `scenarioId`, `datasetVersion: "v1"`, `generatedAt`, `engineVersion` (commit git), `kernelSetId`, `profileId` ou `null`. |
| Demande | Requête normalisée (§4.1), chaque paramètre avec `origin`. |
| États | `processingStatus` (`complete` / `partial` / `failed`), `modelLevel`, `coverageStatus`, `validationStatus`, `requestedCapabilities`, `evaluatedCapabilities`, `notEvaluated[]` avec la raison. |
| Série d'affichage | Pas de 600 s, temps implicite `t0Utc` + `stepS` + `n` (4 321 points pour 30 j), en colonnes : `sunAzDeg[]`, `sunElDeg[]`, `earthAzDeg[]`, `earthElDeg[]`, `sunState[]`, `earthState[]` (0 none, 1 partial, 2 full, `null` unknown), `subSolarLatDeg[]`, `subEarthLatDeg[]`. Angles à 3 décimales. |
| Événements | `{body, convention, type: rise/set/grazing, tUtc, bracketS: [avant, après], truncated}`, aux instants exacts (non échantillonnés). |
| Fenêtres | Par corps et convention : liste de `[startUtc, endUtc)` avec troncatures. |
| Métriques | Table du §9.2 : `{metricId, value, unit, denominatorS, quality, reason}`. |
| Évaluation | Verdicts du §10.1, nominal et prudent. |
| Provenance | Sources, SHA-256, `retrievedAt`. |

Taille estimée par calcul (non mesurée) : environ 240 ko de JSON par scénario pour la série d'affichage (6 colonnes d'angles × 4 321 valeurs × ≈8,5 caractères, plus 2 colonnes d'états). **À mesurer en N0** et à consigner dans le manifeste. Le navigateur charge d'abord `sites.json` et les tableaux de balayage (métriques seules). La série détaillée ne se charge que pour le scénario sélectionné.

Règle d'affichage : la série à 600 s sert aux courbes et à l'animation. Les fenêtres, les durées et les verdicts viennent **toujours** des événements calculés au pas de 60 s raffinés à 1 s, jamais de la série allégée. Les discontinuités 359°/0° sont signalées. Un trou de données n'est jamais interpolé.

### 11.3 Manifeste et cache

`manifest.json` liste chaque fichier du lot avec sa taille et son SHA-256, `kernelSetId`, les produits LOLA, la version du moteur et le lot parent (`parent: null` pour v1). Le lot est écrit dans `processed/v1.tmp/` puis renommé une fois tous les liens vérifiés. Un lot partiel n'apparaît jamais comme prêt. Le cache se découpe en trois couches réutilisables séparément : éphémérides (par `kernelSetId` + grille), profils (par `profileId`), évaluations (par scénario + contraintes). Les explications IA sont mises en cache par empreinte du paquet de preuves + modèle + version du gabarit.

### 11.4 Contrat pour la carte, les graphiques et l'animation

| Consommateur | Données fournies | Règle de fidélité |
|---|---|---|
| Carte 2D | `id`, `name`, `latDeg` / `lonDeg`, `frame`, `positionKind`, `polygon`, `scenarioIds`, couleur de verdict calculée côté DATA. | Une tuile Moon Trek colorée n'est pas le MNT de calcul. |
| Vue du ciel / 3D | Profil d'horizon (3 600 valeurs), az/él Soleil et Terre, rayons apparents, temps. | Une exagération verticale éventuelle relève du rendu. Les résultats viennent du calcul, pas de la scène. |
| Frise des fenêtres | Fenêtres exactes, événements, troncatures, `unknown`. | Aucun verdict n'est recalculé côté UI. |
| Comparaison | Tableau de métriques, ensemble non dominé, paramètres modifiés, limites. | Mêmes définitions de métriques pour toutes les colonnes. |
| Animation | Série à 600 s plus les événements exacts. La vitesse de lecture est indépendante du temps physique. | L'interpolation visuelle est distincte de la détection d'événements. La qualité dégradée reste visible. |

Fond de carte : [Moon Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon), couche d'affichage gérée par l'UI.

## 12. Accès machine commun à l'UI et aux agents

Un seul contrat de lecture, servi d'abord par les fichiers de `processed/v1/`. Une API interne viendra plus tard, sans être nécessaire pour la démo.

| Outil | Entrée | Sortie |
|---|---|---|
| `list_sites()` | — | `sites.json` compact : id, nom, statut, coordonnées, vérification. |
| `get_scenario(siteId, startUtc, durationDays, heightM)` | identifiants du catalogue et du balayage | Métriques et fenêtres. Série sur demande via `include=series`. |
| `compare(scenarioIds[], criteria?, priority?)` | ≤ 60 scénarios | Ensemble non dominé, verdicts, exclusions et raisons. |
| `get_sensitivity(siteId, heightM)` | — | Plages de variation sur la grille de 1 km. |
| `get_evidence(comparisonId)` | — | Paquet de preuves (§13.2). |

Chaque réponse indique les filtres appliqués, le nombre total et le nombre renvoyé, la suite éventuelle et les portions indisponibles. Une réponse tronquée ne se présente jamais comme exhaustive. Le LLM ne reçoit jamais de noyau, d'archive, de tuile, de page web entière ni de MNT. Les outils lisent, calculent et filtrent hors du modèle. Le volume de contexte se mesure en tokens par paquet, indépendamment du poids des archives.

Accès externes utilisés seulement en préparation, jamais pendant la démo : [NAIF](https://naif.jpl.nasa.gov/naif/data.html) (noyaux), [PDS Geosciences LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) (MNT), [ODE REST](https://oderest.rsl.wustl.edu/) (recherche de produits si besoin), [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) (tests, [règles d'usage](https://ssd-api.jpl.nasa.gov/) : une requête à la fois, cache, User-Agent). Aucune gratuité illimitée ni latence temps réel n'est promise.

## 13. IA : expliquer une preuve calculée (OpenRouter)

### 13.1 Rôle

Autorisé : reformuler le besoin, regrouper les résultats, présenter les compromis, citer les identifiants de preuve, orchestrer les outils du §12. Interdit (R6) : calculer de la physique, créer une coordonnée, inventer un seuil ou un poids, compléter une valeur manquante, déclarer un succès de mission. Une ambiguïté sur la date, la durée ou une contrainte déclenche une question explicite. Un texte lu dans une source n'est jamais traité comme une instruction qui modifierait les paramètres de calcul. Un échec de l'IA n'empêche jamais de lire les résultats déterministes.

### 13.2 Paquet de preuves (`ai/<comparisonId>.evidence.json`)

Requête normalisée, sites et scénarios (identifiants), métriques avec unités, dénominateurs et qualité, verdicts nominal et prudent avec leurs raisons, ensemble non dominé et méthode, ensemble exploré, contexte historique sourcé, `modelLevel`, limites, liste `notEvaluated`, provenance (versions, SHA-256). Taille du paquet mesurée en tokens en N2 et consignée.

### 13.3 Fournisseur et configuration

**Décision d'équipe : OpenRouter. Le modèle n'est pas encore choisi.**
- Transport : requête HTTP côté serveur vers `https://openrouter.ai/api/v1/chat/completions` ([référence API](https://openrouter.ai/docs/api_reference/overview)), authentification par jeton Bearer ([guide](https://openrouter.ai/docs/quickstart)).
- Clé : variable d'environnement serveur `OPENROUTER_API_KEY`. Elle n'apparaît jamais dans le navigateur, le dépôt, le lot de données ni les journaux. Le manifeste ne garde que le nom de la variable.
- Critères de choix du modèle (DATA-C, avant N2) : support des [appels d'outils](https://openrouter.ai/docs/guides/features/tool-calling) et des [sorties structurées](https://openrouter.ai/docs/guides/features/structured-outputs) **sur l'endpoint réellement routé** (option `provider.require_parameters`), essai sur un paquet de preuves réel, coût observé. Aucun modèle n'est attribué à l'utilisateur par défaut.
- On consigne le modèle demandé et le modèle renvoyé, l'identifiant de génération, les paramètres, la date et le fournisseur observé ([routage](https://openrouter.ai/docs/guides/routing/provider-selection)), ou « non renseigné ». Les fallbacks sont déclarés à l'avance et subissent les mêmes contrôles.
- Budgets configurables : tokens d'entrée et de sortie, nombre de tours et d'appels d'outils, dépense, timeout de 30 s, 1 reprise au plus. Les limites décisives ne sont jamais tronquées pour faire rentrer un paquet.

### 13.4 Contrôle après réponse

Vérifier la fin normale de la génération, le schéma JSON, l'existence de chaque identifiant cité, **chaque nombre** (égal à un champ du paquet à l'arrondi affiché près, même unité, même période), les statuts et l'absence de « garanti » ou de seuil inventé. Les nombres affichés sont rendus directement depuis les métriques par le service, l'IA ne fait que les citer. En cas d'échec, de timeout ou de budget dépassé : `explanationStatus: "unavailable" | "invalid"` avec la raison, et les tableaux déterministes restent affichés.

## 14. Intention givre/glace : besoin futur, aucune promesse de ressource

« Exploiter frost » est traduit provisoirement par « explorer de la glace supposée », **à confirmer avec l'équipe**. Ce plan ne contient aucune donnée de présence, de quantité, d'accessibilité ou d'exploitabilité. L'ombre seule ne prouve pas la glace, et l'absence de Soleil sur 30 jours ne prouve pas une ombre permanente. Intégrer ce critère demandera une source dédiée (instrument, produit, version, repère, résolution, incertitude, grandeur observée). Une carte de probabilité, un indice indirect et une détection locale ne sont pas interchangeables. Sans source adéquate, un critère « ressource » obligatoire vaut `unknown`.

## 15. Vérification : tests avec valeurs attendues

### 15.1 Tests (tolérances fixées avant essai, R9)

**Références Horizons relevées le 14/11/2026** pour le 2026-12-01 à 00:00 UTC, `APPARENT='AIRLESS'`, observateur à h = 0 sur la sphère de 1737,4 km :

| Test | Cas | Azimut attendu (°) | Élévation attendue (°) | Tolérance |
|---|---|---:|---:|---|
| T1 | Soleil depuis `apollo11` (0.67416, 23.47314) | 268.648713 | −13.422339 | 0,01° |
| T2 | Terre depuis `apollo11` | 272.422269 | 73.108865 | 0,01° |
| T3 | Soleil depuis (−80.13, 1.44) | 278.248393 | 2.921647 | 0,01° |
| T4 | Terre depuis (−80.13, 1.44) | 5.286070 | 8.221100 | 0,01° |
| T5 | Terre depuis `change4` (−45.444, 177.599) | 192.921151 | −45.370087 | 0,01° |

Justification de 0,01° : c'est très inférieur à la résolution angulaire du relief (un pixel de 80 m vu à 20 km sous-tend 0,23°), et les écarts de modèle attendus (DE440 contre DE441, `LT+S` contre déflexion, `MOON_ME` contre `MEAN_ME`) sont plus petits. Limite : au pôle, le Soleil monte lentement, donc 0,01° peut représenter plusieurs minutes. Les temps d'événements polaires sont validés par T9, pas par T1–T5. En cas d'échec, vérifier dans cet ordre : ordre lon/lat, signe des longitudes, repère (`MOON_ME`), UTC → TDB, `abcorr`, sens de l'azimut.

| Test | Cas | Attendu |
|---|---|---|
| T6 | Bornes physiques sur 2026-12-01 → 2027-12-24 | Rayon du Soleil ∈ [0,26°, 0,275°]. Rayon de la Terre ∈ [0,89°, 1,03°]. À −89,5° : élévation du Soleil ∈ [−2,1°, +2,1°] et de la Terre ∈ [−7,6°, +7,6°]. `change4` : Terre toujours sous l'horizon géométrique. `subSolarLatDeg` ∈ [−1,6°, +1,6°]. |
| T7 | Horizon synthétique : MNT plat (hauteur 0) | Profil = −0,0869° (h = 2 m) et −0,1944° (h = 10 m) à tous les azimuts, à 0,001° près, atteint à 2,64 km et 5,89 km. |
| T8 | Horizon synthétique : mur de 1 000 m à 10 km dans l'azimut 90° | Élévation = 5,533° à 0,01° près (calcul sphérique exact) dans l'azimut 90°, profil plat ailleurs. Mur à cheval sur 0°/360° : détecté des deux côtés. |
| T9 | Convergence sur `sp_s8950` | On publie l'écart de profil et des temps d'événements entre 150 km (`ldem_80s_80m`) et 300 km (`ldem_75s_120m`), entre les pas d'azimut 0,1° et 0,05°, et entre 60 s et 10 s. Seuil d'acceptation fixé maintenant : écart de temps ≤ 10 min sur chaque événement, sinon le paramètre fin est retenu ou la limite publiée. |
| T10 | Fenêtres synthétiques | Intervalles contigus fusionnés, troncatures aux bornes, trou de données exclu du dénominateur, somme = durée attendue à 1 s près. |
| T11 | Contraintes | Absence de critère → `not_evaluated`. Valeur `null` → `unknown`. Marge nulle → prudent = nominal. Une marge ne modifie pas le nominal. Tous rejetés → pas de recommandation. |
| T12 | Contrats | Le JSON ne contient ni `NaN` ni `Infinity`. Version majeure inconnue → refus. Changer la hauteur change `scenarioId` et `profileId`. Lot v1 relisible hors réseau. Une IA qui altère un nombre est rejetée. |

Contrôle de projection (avant T7 sur données réelles) : le pixel central de `ldem_80s_80m` (≈ ligne/colonne 3800 sur 7600) doit donner x = y = 0, soit −90° de latitude, à moins d'un pixel près. L'aller-retour lat/lon → pixel → lat/lon doit tenir à 1 m près.

### 15.2 Ce que les tests ne prouvent pas

T1–T5 valident une mise en œuvre contre une source quasi identique, pas l'exactitude physique (§5.4). Un cas réussi ne valide pas tous les sites, dates, hauteurs et niveaux. Les tests d'API et d'IA peuvent utiliser des réponses simulées. Les comparaisons scientifiques restent réelles.

### 15.3 Rapport de validation (`docs/validation/v1.md`)

Pour chaque test : entrées, versions, attendu et sa source, obtenu, écart, tolérance, `pass` / `fail` / `not_tested`, artefacts liés. Matrice du domaine réellement vérifié : sites, dates, hauteurs, produits, `modelLevel`. Une demande couverte mathématiquement mais hors de ce domaine reste affichée « non validée dans ce domaine ». Sans résultat réel, la matrice reste vide, sans taux de réussite inventé.

## 16. Incertitudes et performance

### 16.1 Quatre couches séparées

| Couche | Ce qu'on publie | Valeurs connues |
|---|---|---|
| Source | Précision documentée du produit et de l'époque, sinon `"unquantified"`. | Écart PA/ME ≈ 875 m en surface et écart IAU_MOON/ME ≈ 155 m d'amplitude sur 2000–2040 (commentaires du FK `moon_de440_250416.tf`). Pixel MNT de 80/120/240 m. Les données LOLA du label sont « préliminaires ». |
| Numérique | Écarts observés en T9 (rayon, pas d'azimut, pas de temps). | Bissection à 1 s = réglage, pas une précision de ±1 s. |
| Modèle | Ce qui manque : relief au-delà de `R_max`, éclipses (drapeau seulement), puissance, station, pente. | `modelLevel`, `notEvaluated[]`. |
| Marge mission | Paramètres de l'utilisateur, statut prudent séparé. | Une marge ne compense pas une incertitude inconnue. |

Résolution spatiale ≠ précision d'altitude. Une erreur angulaire ne donne pas une erreur de temps constante : près d'un contact rasant, 0,01° peut valoir des heures. Les erreurs de nature différente ne s'additionnent jamais, et aucun intervalle de confiance n'est publié sans méthode. Les composantes restent séparées et visibles dans le paquet UI/IA. Une étude de sensibilité (grille de 1 km, hauteurs) montre des variations, pas une probabilité de succès.

### 16.2 Performance

Aucune mesure n'existe aujourd'hui. En N0 et N1, on consigne simplement : machine, versions, temps de chargement des noyaux, temps du calcul d'éphémérides annuel, temps par profil d'horizon, temps par scénario et tailles réelles des fichiers. La justesse se vérifie avant toute annonce de vitesse. Un calcul plus rapide qui rate des événements n'est pas une accélération. Le temps et le coût de l'IA sont mesurés à part. Protocole complet (froid/chaud, répétitions, mémoire de pointe) en feuille de route.

## 17. Décisions

| Sujet | Décision (14/11/2026) | Reste ouvert | Responsable / échéance |
|---|---|---|---|
| Moteur | Python + SpiceyPy, méthode vectorielle du §8.1. | — | DATA-A, N0 |
| Noyaux | `naif0012.tls`, `pck00011.tpc`, `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`. | `de440.bsp` seulement hors 1849–2150. | DATA-A, N0 |
| Repère | `MOON_ME` partout, sphère de 1737,4 km. | — | DATA-A |
| Temps | UTC en entrée/sortie, TDB interne, `naif0012.tls`. | Vérifier qu'aucune seconde intercalaire nouvelle n'est annoncée (IERS Bulletin C). | DATA-A, N0 |
| Terrain | `ldem_80s_80m`, `ldem_75s_120m`, `ldem_60s_240m`, `R_max` 150 km, 0,1°. | Raffinement du terrain proche à 20 m ou 5 m. | DATA-B, N1 |
| Hauteurs | 2 m, plus 10 m en sensibilité (hypothèses d'équipe). | Valeurs du matériel réel. | Équipe |
| Pas de temps | Calcul 60 s, bissection 1 s, affichage 600 s. | — | DATA-A |
| Catalogue | 13 entrées du §6.2. | 2e source pour chaque site. Zones Artemis III, IM-2, Chang'e 6, SLIM. | DATA-C, N2 |
| Durée / dates | 30 j depuis le 2026-12-01, balayage de 52 semaines. | — | DATA-C |
| Comparaison | Ensemble non dominé sur 4 critères par défaut, pas de poids. | Ordre de priorité choisi par l'utilisateur dans l'UI. | DATA-C + UI |
| Éclipses | Drapeau de séparation < r☉ + r⊕ (N3). | Calcul exact `gfoclt_c`. | Feuille de route |
| IA | OpenRouter côté serveur, clé `OPENROUTER_API_KEY`. | Choix du modèle selon les critères du §13.3. | DATA-C, avant N2 |
| « Frost » | Intention provisoire. | Confirmation de l'équipe et source de ressources. | Équipe |
| Gel | `v1` le 15/11 à 12:00. | Heure officielle de clôture des soumissions. | Équipe |

Tant qu'une donnée manque, on publie un résultat limité et explicite ou « non confirmé », avec le champ ou le contrôle nécessaire. L'objectif DATA reste une comparaison rapide, traçable et honnête des scénarios explorés.

## Annexe A — Références vérifiées le 14/11/2026

- Tailles (`Content-Length`, HEAD) et dates `Last-Modified` NAIF : `de440s.bsp` 32 726 016 (2020-12-21), `de440.bsp` 119 799 808 (2020-12-21), `moon_pa_de440_200625.bpc` 12 863 488 (2021-06-26), `moon_de440_250416.tf` 19 478 (2025-04-16), `pck00011.tpc` 131 226 (2022-12-27), `naif0012.tls` 5 257 (2016-07-15).
- Couverture de `de440s.bsp` : 1849 DEC 26 → 2150 JAN 22 ([aa_summaries.txt](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt)).
- FK [`moon_de440_250416.tf`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf) : `MOON_ME` = `MOON_ME_DE440_ME421`. Rotation PA/ME ≈ 0,02886°, soit ≈ 875 m. Écart IAU_MOON/ME ≈ 0,0051° (≈155 m) d'amplitude sur 2000–2040.
- `pck00011.tpc` : `BODY301_RADII = (1737.4 1737.4 1737.4)`.
- LOLA GDR polaire : liste du répertoire `.../lola_gdr/polar/img/` et tailles du §7.1. Label `ldem_80s_80m.lbl` : 7600 × 7600, `LSB_INTEGER` 16 bits, ×0,5 m, offset 1 737 400 m, stéréographique polaire, `MEAN EARTH/POLAR AXIS OF DE421`, version produit V2.0, créé le 2017-06-15.
- Horizons API v1.2 : réponses de T1–T5, source DE441, `MEAN_ME (high precision)`, `AIRLESS`.

## Annexe B — Code de référence (non exécuté, à valider par T1–T12)

```python
import numpy as np
import spiceypy as sp

R_MOON_KM = 1737.4
R_BODY_KM = {"SUN": 695700.0, "EARTH": 6378.137}
sp.furnsh("data/raw/kernels/lunar_v1.tm")

def et_grid(start_utc: str, duration_s: float, step_s: float) -> np.ndarray:
    et0 = sp.str2et(start_utc)                       # ex. "2026-12-01T00:00:00"
    return et0 + step_s * np.arange(int(duration_s // step_s) + 1)

def vectors_from_moon_center(target: str, ets: np.ndarray) -> np.ndarray:
    pos, _lt = sp.spkpos(target, ets, "MOON_ME", "LT+S", "MOON")
    return np.asarray(pos)                           # (n, 3) km, indépendant du site

def site_vector_km(lat_deg: float, lon_deg: float, height_above_sphere_m: float) -> np.ndarray:
    r = R_MOON_KM + height_above_sphere_m / 1000.0
    return np.asarray(sp.latrec(r, np.radians(lon_deg), np.radians(lat_deg)))

def enu(obs: np.ndarray):
    up = obs / np.linalg.norm(obs)
    east = np.cross([0.0, 0.0, 1.0], up)
    if np.linalg.norm(east) < 1e-9:
        raise ValueError("observateur sur l'axe polaire : nord non défini")
    east /= np.linalg.norm(east)
    return east, np.cross(up, east), up              # east, north, up

def az_el(target: str, vec_center: np.ndarray, obs: np.ndarray):
    v = vec_center - obs                             # parallaxe du site
    e, n, u = enu(obs)
    dist = np.linalg.norm(v, axis=1)
    az = np.degrees(np.arctan2(v @ e, v @ n)) % 360.0
    el = np.degrees(np.arcsin((v @ u) / dist))
    rad = np.degrees(np.arcsin(R_BODY_KM[target] / dist))
    return az, el, dist, rad

def disk_state(el, rad, hz):
    """0 none, 1 partial, 2 full ; -1 = unknown (hz NaN), converti en null à l'export."""
    c_up, c_low = el + rad - hz, el - rad - hz
    state = np.where(c_low > 0, 2, np.where(c_up > 0, 1, 0))
    return np.where(np.isnan(hz), -1, state)

def horizon_at(az_deg, profile_az_deg, profile_el_deg):
    return np.interp(az_deg, profile_az_deg, profile_el_deg, period=360.0)
```

```python
import numpy as np, rasterio
from pyproj import Transformer
from scipy.ndimage import map_coordinates

R_M = 1737400.0

def load_dem(lbl_path):
    ds = rasterio.open(lbl_path)
    height_m = ds.read(1).astype(np.float32) * 0.5   # vérifier ds.scales/ds.offsets (pas de double application)
    to_xy = Transformer.from_crs("+proj=longlat +R=1737400 +no_defs", ds.crs, always_xy=True)
    return ds, height_m, to_xy

def sample_height(ds, height_m, to_xy, lat_deg, lon_deg):
    x, y = to_xy.transform(lon_deg, lat_deg)
    col, row = ~ds.transform * (np.asarray(x), np.asarray(y))
    return map_coordinates(height_m, [np.atleast_1d(row) - 0.5, np.atleast_1d(col) - 0.5],
                           order=1, mode="constant", cval=np.nan)  # hors emprise -> NaN

def unit(lat, lon):
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)

def destination(lat0, lon0, az, d_km):
    delta = d_km / 1737.4
    lat = np.arcsin(np.sin(lat0) * np.cos(delta) + np.cos(lat0) * np.sin(delta) * np.cos(az))
    lon = lon0 + np.arctan2(np.sin(az) * np.sin(delta) * np.cos(lat0),
                            np.cos(delta) - np.sin(lat0) * np.sin(lat))
    return lat, lon

def horizon_profile(ds, height_m, to_xy, lat0_deg, lon0_deg, h_obs_m, rmax_km=150.0, daz_deg=0.1):
    pix_km = abs(ds.transform.a) / 1000.0
    d = np.arange(2 * pix_km, rmax_km + pix_km / 2, pix_km)
    lat0, lon0 = np.radians(lat0_deg), np.radians(lon0_deg)
    h0 = float(sample_height(ds, height_m, to_xy, lat0_deg, lon0_deg)[0])
    if not np.isfinite(h0):
        raise ValueError("site hors emprise du MNT")
    u0 = unit(lat0, lon0)
    obs = (R_M + h0 + h_obs_m) * u0
    az_deg = np.arange(0.0, 360.0, daz_deg)
    hz = np.full(az_deg.size, np.nan); dmax = np.full(az_deg.size, np.nan); reach = np.zeros(az_deg.size)
    for i, a in enumerate(np.radians(az_deg)):
        lat, lon = destination(lat0, lon0, a, d)
        h = sample_height(ds, height_m, to_xy, np.degrees(lat), np.degrees(lon))
        v = (R_M + h)[:, None] * unit(lat, lon) - obs
        el = np.degrees(np.arcsin((v @ u0) / np.linalg.norm(v, axis=1)))
        ok = np.isfinite(el)
        if ok.any():
            reach[i] = d[ok].max()
            k = np.nanargmax(el)
            hz[i], dmax[i] = el[k], d[k]
    return az_deg, hz, dmax, reach, h0                # reach < rmax_km => azimut tronqué
```
