# Livraison locale du relief polaire — 15 novembre 2026

Version retenue : **`v1.1-relief-year`**. Build local contrôlé à 15 h 30, heure de Paris.
Statut scientifique : **expérimental, non validé physiquement**.

## Ouvrir ou relancer

Serveurs lancés pendant la livraison :

- Démo annuelle : <http://127.0.0.1:8012/?lang=fr>
- Démo de 30 jours : <http://127.0.0.1:8013/?lang=fr>
- Secours `v1` : <http://127.0.0.1:8014/?lang=fr>

Pour relancer après arrêt, depuis la racine du projet :

```sh
LUNAR_DATASET_VERSION=v1.1-relief-year .venv/bin/python scripts/run_local_demo.py --port 8012
```

Secours : même commande avec `LUNAR_DATASET_VERSION=v1` et `--port 8014`.
Lot court : `LUNAR_DATASET_VERSION=v1.1-relief-30d` et `--port 8013`.
Le lanceur ne télécharge rien et ne reconstruit rien. Il refuse un build dont la version ou l’empreinte du manifeste diffère des données locales.

Dans l’application : **Évaluer les sites** → choisir un point → **Détails scientifiques** → hauteur **2 m / 10 m**. Le tableau utilise cette même hauteur pour les trois points et l’affiche au-dessus des résultats. Le curseur de date parcourt les 52 départs hebdomadaires. Les liens de provenance et de contrôle figurent dans les limites scientifiques.

## Données livrées

Trois points d’étude : 86° S, 88° S et 89,5° S, tous à 0° de longitude. Ils ne sont pas présentés comme des sites d’alunissage certifiés.

| Lot | Calcul | Scénarios | Avec relief | Comparaisons |
|---|---|---:|---:|---:|
| `v1.1-relief-30d` | 3 sites × 2 hauteurs × 2 modèles × 1 date | 12 | 6 | 4 |
| `v1.1-relief-year` | 3 × 2 × 2 × 52 dates | 624 | 312 | 208 |

Chaque scénario couvre 30 jours. Première date : 1er décembre 2026. Dernier départ hebdomadaire : 23 novembre 2027. Les fenêtres se chevauchent ; 52 fenêtres de 30 jours ne sont pas 52 mois indépendants.

Six profils par lot. Même méthode pour les trois sites : LOLA 20 m jusqu’à 20 km, 80 m entre 20 et 150 km, 120 m entre 150 et 300 km. Altitude de l’observateur issue du produit à 20 m, conservée dans les trois bandes. Frontières échantillonnées des deux côtés. Courbure lunaire conservée.

Échantillonnage proche : 1 à 80 m par pas de 1 m, puis pas du produit. Cette interpolation ne crée pas de résolution physique supplémentaire. Pas azimutal nominal : 0,1°. Pas de calcul : 60 s ; séries d’affichage à 600 s, distinctes des événements affinés.

Les noyaux et leur jeu d’empreintes sont identiques à `v1`. Aucun résultat d’une ancienne grille de sensibilité ni ancien rapport de validation du relief n’a été recopié dans les nouveaux lots.

## Source et contrôles

Source principale : [NASA/PDS, LOLA LDEM 85S 20M, label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_85s_20m.lbl), [raster IMG](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_85s_20m.img).

- Raster acquis : **460 136 448 octets** ; label : **4 991 octets**.
- Format contrôlé : int16 little-endian, `HEIGHT = DN × 0,5 m`, rayon de référence 1 737 400 m, projection stéréographique polaire sud, repère ME/DE421. Le label décrit un produit interpolé préliminaire.
- Empreintes, URL, taille et date d’acquisition conservées dans les provenances. Le SHA-256 local assure la traçabilité ; ce n’est pas une certification indépendante de NASA.
- Tous les azimuts des six profils ont une couverture échantillonnée complète jusqu’à 300 km. Un trou de terrain reste inconnu ; le graphique est interrompu et le classement ne reçoit pas une valeur inventée.
- **636 × 7 = 4 452 valeurs** contrôlées entre scénarios, séries de dates et index compact. Tous les fichiers des manifestes ont été contrôlés par taille et SHA-256.
- **4 014 fichiers de `data/processed/v1` inchangés**, manifeste compris.

Audit détaillé : [polar20-delivery-audit.json](polar20-delivery-audit.json). Intégrité du secours : [polar20-v1-integrity.json](polar20-v1-integrity.json).

## Sensibilité numérique

**3 sites × 2 hauteurs × 3 variantes = 18 contrôles**, tous acceptés sur décembre 2026.

| Variante, un paramètre modifié à la fois | Plus grand écart entre événements appariés |
|---|---:|
| Azimut 0,1° → 0,05° | 350 s |
| Temps 60 s → 10 s | 0,469 s |
| Rayon fin 20 km → 25 km | 75,938 s |

Les événements rasants sont inclus. Aucun événement non apparié ; nombres de fenêtres et états aux bornes concordants. Le maximum de 350 s correspond à un événement rasant. Seuil accepté : 600 s, soit 10 minutes, hérité du plan numérique ; **ce seuil n’est pas une borne d’erreur physique ni une exigence mission**.

Écarts maximaux de fraction visible : Soleil `0,00001989294`, Terre `0,00001808449` (fractions sur 0–1). Chaque écart de métrique, de fenêtre et d’événement est publié dans [polar20-nominal-final.json](polar20-nominal-final.json).

Ces essais portent sur décembre. Les autres dates ont passé les contrôles de structure, d’intégrité et de cohérence ; elles n’ont pas reçu une campagne annuelle de convergence ou de comparaison aux observations.

## Vérification application

- Python : **220 tests passent**.
- Interface : **107 tests passent** ; TypeScript et les trois builds passent.
- Navigateur : production annuelle, deux dates extrêmes, trois sites, deux hauteurs, six horizons, valeurs affichées comparées aux sources, calendrier annuel.
- Lot court : mêmes trois sites et deux hauteurs ; calendrier annuel masqué.
- Secours : chargement, comparaison et ouverture d’un site avec relief vérifiés.
- Tous ces parcours ont été exécutés avec le réseau externe bloqué, sans erreur navigateur. L’IA distante n’est pas nécessaire au parcours.

Rapports : [annuel](polar20-browser-v1.1-relief-year.json), [30 jours](polar20-browser-v1.1-relief-30d.json), [secours](polar20-browser-v1.json). Empreintes des builds gelés et état de livraison : [polar20-release.json](polar20-release.json).

Le champ historique `prepared_pending_ui_review` des manifestes scientifiques reste intact ; la revue locale terminée est attestée séparément dans le rapport de livraison, sans réécrire les lots publiés.

## Limites conservées

La topographie LOLA améliore le modèle des occultations, sans prouver la fidélité aux conditions réelles d’une mission. 20 m est un espacement de pixels, pas une précision garantie. Petits obstacles, rugosité, relief au-delà de 300 km, occultation exacte du disque solaire et éclipses restent limités ou non modélisés. Aucun nouveau modèle thermique, de batterie, de liaison radio ou de véhicule.

Le sol de la scène 3D reste illustratif ; les graphiques d’horizon utilisent les profils LOLA. Le travail d’animation parallèle a été conservé. Aucun déploiement public effectué.

## Reproduire les vérifications

```sh
.venv/bin/python scripts/verify_relief_delivery.py
.venv/bin/python -m pytest -q
cd touchdown
npm test
LUNAR_DATASET_VERSION=v1.1-relief-year npm run build -- --outDir dist-relief
LUNAR_DATASET_VERSION=v1.1-relief-year LUNAR_DEMO_URL=http://127.0.0.1:8012 node scripts/check-relief-browser.mjs
```

Le build régénère automatiquement l’index compact du lot choisi. La configuration par défaut reste `LUNAR_DATASET_VERSION=v1`. Le rapport navigateur ci-dessus porte sur les empreintes de build enregistrées dans `polar20-release.json` ; un nouveau build devra être revérifié.
