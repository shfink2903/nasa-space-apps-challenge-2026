# DATA.md — Traitement et gestion des données

Périmètre : données uniquement (sites, éphémérides, relief, format des fichiers). L'interface est traitée à part.

## 1. Principe

- **Constant** : sites et relief autour. **Variable mais calculable** : direction du Soleil et de la Terre vue du site.
- On précalcule tout hors ligne et on met le résultat en cache. L'application lit uniquement `data/processed/`. Aucun appel NASA pendant la démo.
- On compare toujours **sur une fenêtre de temps**, jamais à un instant.

## 2. Sources

| Donnée | Source | Statut MVP |
|---|---|---|
| Soleil et Terre (azimut, élévation) | JPL Horizons, observateur sur la Lune (libration incluse) | Oui |
| Relief | LOLA via PDS/ODE, MNT pôle sud | Oui pour le pôle sud (voir §5), sinon horizon géométrique |
| Carte | Moon Trek WMTS | Hors périmètre data |
| Liste de sites | Catalogue écrit à la main, 2 sources par coordonnée | Oui |

Documentation : https://ssd-api.jpl.nasa.gov/doc/horizons.html

## 3. Couche constante : `data/processed/sites.json`

Champs par site :

| Champ | Description |
|---|---|
| `id` | identifiant court, sans espace |
| `name` | nom affiché |
| `mission` | mission ou programme |
| `status` | `historical`, `confirmed` ou `candidate` (une zone d'étude n'est pas une position précise) |
| `latDeg`, `lonDeg` | coordonnées en degrés (lat nord positive, lon est positive) |
| `altKm` | altitude en km, référence à préciser |
| `frame` | référentiel de coordonnées (voir §7) |
| `sources` | au moins 2 références |

Taille initiale : 10 à 15 sites, avec quelques sites hors pôle sud pour le contraste. Un alunissage passé sert de contexte, pas de preuve d'adéquation à une nouvelle mission.

À remplir : liste réelle des sites et coordonnées sourcées (aucune valeur n'est écrite ici tant qu'elle n'est pas vérifiée).

## 4. Couche variable : `data/processed/ephemeris/<site>.json`

- Période par défaut : **30 jours**. Pas : **10 min**, raffiné à **1 min** autour des transitions (lever, coucher) détectées.
- Le raffinement décrit une résolution numérique. Il ne garantit pas la précision physique ni la détection d'événements très brefs.
- Acquisition côté serveur, requêtes **séquentielles**, résultat mis en cache (un fichier par site et par période). Rafraîchir = écraser le fichier ; garder `retrievedAt` pour tracer la version.
- Horizons renvoie un tableau sous forme de texte : demander le format CSV, extraire, convertir en nombres, vérifier unités et dates.

Format d'un échantillon :

```json
{
  "timeUtc": "2026-11-14T12:00:00Z",
  "sun":   { "azimuthDeg": 0, "elevationDeg": 0, "horizonDeg": 0, "visible": true },
  "earth": { "azimuthDeg": 0, "elevationDeg": 0, "horizonDeg": 0, "visible": false },
  "horizonModel": "geometric"
}
```

En-tête de fichier : `siteId`, `source`, paramètres de requête, `frame`, `retrievedAt`, pas de temps. Dates en UTC. Donnée manquante : `null`, jamais 0.

`horizonModel` vaut `geometric` sans relief et `lola-<résolution>` avec relief. `visible` = élévation (corrigée du rayon du disque) > `horizonDeg`.

## 5. Relief : `data/processed/horizon/<site>.json`

- Tuile pôle sud uniquement, sous-échantillonnée (20 m à 100 m).
- Par site : 360 valeurs (élévation maximale du terrain par degré d'azimut), rayon d'analyse 20 à 50 km.
- **Sans relief, les résultats du pôle sud ne sont pas fiables** : un horizon géométrique annonce « éclairé » pour des sites en réalité à l'ombre. Si le relief n'est pas prêt, l'indiquer clairement dans le fichier (`horizonModel: geometric`).

## 6. Calculs

- Un astre est au-dessus de l'horizon si son **bord haut** dépasse l'horizon : utiliser le rayon apparent du disque (Soleil environ 0,27°, Terre environ 1°, à calculer selon la distance) et non le centre.
- À partir des échantillons : intervalles visibles, durées cumulées, plus longues coupures, temps avant le prochain coucher ou « Earthset », pourcentage de temps éclairé.
- Visibilité de la Terre ne vaut pas communication garantie : une station au sol doit aussi voir la Lune. Ne pas déduire une garantie de communication de la seule visibilité.
- Marges mission (garde temporelle, seuils plus prudents) : paramètres séparés, valeurs initiales nulles, appliqués sans modifier les valeurs nominales.

## 7. Incertitudes (une page)

| Élément | Traitement |
|---|---|
| Source | Reprendre la précision documentée ; sinon écrire « non quantifiée » (jamais 0) |
| Numérique | Pas de temps et interpolation ; comparer avec un pas plus fin et conserver l'écart mesuré |
| Modèle | Relief ignoré (si géométrique), couverture incomplète. Aucune fausse borne globale |
| Marge mission | Paramètre utilisateur, ne compense pas une incertitude inconnue |

Résolution spatiale ne vaut pas précision d'altitude. Résolution temporelle ne vaut pas erreur totale. Limites des éphémérides : https://ssd.jpl.nasa.gov/horizons/manual.html#statement-of-ephemeris-limitations

À trancher : référentiel de coordonnées (repère lunaire et altitude de référence) et cohérence avec celui de Horizons.

## 8. Arborescence et responsabilités

```
data/
  raw/                       # téléchargements (hors git)
  processed/
    sites.json
    ephemeris/<site>.json
    horizon/<site>.json
scripts/
  01_sites.py                # vérifie les coordonnées
  02_ephemeris.py            # Horizons, conversion, validation, cache
  03_horizon.py              # profils LOLA
```

| Bloc | Responsable |
|---|---|
| Sites | à attribuer |
| Éphémérides | à attribuer |
| Relief | à attribuer |

Chaque fichier de `processed/` doit rester assez léger pour être chargé tel quel par l'application (viser moins de 10 à 20 Mo au total).

## 9. Validation

- Comparer 2 ou 3 résultats avec une référence connue (par exemple un site Apollo) : unités, signe de l'azimut, dates.
- Cas contrôlés : passage sous l'horizon, visibilité permanente sur la période, fenêtres tronquées, données absentes.
- Comparer les durées avec un pas plus fin.
- Modifier une marge mission ne change pas les valeurs nominales.
- Incertitude inconnue conservée comme inconnue.
- Le relief n'est activé que si provenance, couverture et référentiel sont compatibles.
