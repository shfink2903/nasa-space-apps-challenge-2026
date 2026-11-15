# Audit DATA et correctifs Touchdown — 15 novembre 2026

Branche : `codex/data-pipeline-audit-fixes`. Application : `touchdown/`.

Ce rapport distingue les corrections présentes dans le code, les contrôles
effectivement exécutés et leurs limites. Il ne
constitue pas une validation physique des résultats lunaires.

## Périmètre et conservation de v1

`data/processed/v1` demeure le lot scientifique historique. Les correctifs portent
sur le code, les contrôles, les caches de préparation et la consommation des
résultats ; ils ne nécessitent aucune régénération de ce lot. Ses rapports,
empreintes, identifiants et statuts scientifiques ne doivent pas être réécrits.
La comparaison finale de l'inventaire et des empreintes avant/après est consignée
dans la section de qualification finale ci-dessous.

L'audit initial a examiné les **1 872 scénarios** : **1 352 géométriques + 520
LOLA**. Tous portaient `covered`, `complete` et `not_validated`. Les vérifications
d'ordre et de bornes des fenêtres, de durée/fraction, d'inclusion `fullDisk` dans
`anyDisk` et de chevauchement Soleil/Terre n'ont pas trouvé d'incohérence dans ce
lot. Les **5 316 levers + 5 305 couchers** étaient dans leurs encadrements ; les
**629 candidats rasants** restent distincts des événements affinés par bissection.

## Corrections du calcul et des sources

### Marges prudentes

Auparavant, chaque fin de fenêtre prudente devenait un coucher, même lorsqu'elle
provenait uniquement de la fin d'analyse ou d'un trou de données. Une Terre visible
pendant toute une analyse d'une heure pouvait ainsi recevoir un coucher prudent
inventé à une heure et faire passer une contrainte auparavant inconnue.

Le calcul conserve désormais seulement les couchers réellement détectés dont la
fenêtre survit à l'érosion temporelle. Leur date et leur encadrement sont décalés
de la marge. Les bornes d'analyse, les données absentes et les fenêtres entièrement
supprimées ne créent plus de coucher. Le nominal reste inchangé. Les scénarios v1,
sans marges mission, ne sont pas recalculés.

Source : [scenario.py](../../lunar_data/scenario.py).

### Cache terrain et provenance

L'ancien `profileId` identifiait les paramètres ; il ne vérifiait pas le contenu
des tableaux mis en cache. Une modification des élévations ou de l'altitude du sol
pouvait donc être acceptée sous un identifiant intact.

Le nouveau cache réside dans `<cache>/profiles-verified-v1/`. Chaque fichier contient
une enveloppe `cacheFormatVersion`, `contentSha256`, `profile`. À la lecture, le
SHA-256 canonique du profil, son identifiant et tous les paramètres sont contrôlés.
Le format du profil retourné et publié ne change pas.

Migration : les anciens fichiers `profile_<id>.json` sans empreinte sont ignorés
avec un avertissement et conservés intacts. Le profil est recalculé à partir des
sources vérifiées, puis écrit dans le nouveau namespace. Un cache vérifié altéré
échoue explicitement ; un autre répertoire permet une nouvelle préparation. Le
premier recalcul après migration n'a pas le coût d'une lecture en cache chaud.

Labels DEM et images raster sont vérifiés contre leurs métadonnées d'acquisition
par SHA-256 et taille avant interprétation. Les archives Horizons existantes sont
vérifiées par hash, paramètres et URL ; une archive altérée ou sans provenance
n'est pas remplacée silencieusement par un nouvel appel réseau.

Sources : [terrain.py](../../lunar_data/terrain.py),
[validation.py](../../lunar_data/validation.py).

## Contrats du lot et coût de vérification

Le vérificateur utilise le schéma courant et contrôle aussi les invariants
sémantiques : unités, valeurs et dénominateurs, paramètres, identité du scénario,
fenêtres ordonnées, inclusions, chevauchements, métriques recalculées depuis les
fenêtres, cohérence des couchers et structure des séries décompressées. Un fichier
dont le hash a été recalculé ne passe donc pas uniquement grâce à ce nouveau hash.
Les drapeaux de troncature sont obligatoires et recoupés avec les intervalles ;
la qualité des métriques est recoupée avec la couverture analysable. Supprimer ces
drapeaux ou promouvoir `partial` en `complete` ne permet plus de transformer un
verdict `unknown` en `pass`.

Les combinaisons invalides de préparation, dont une sensibilité demandée sans
terrain, sont refusées avant création du staging ou accès aux caches. Les hauteurs
et sélections de sites vides, dupliquées ou invalides sont également refusées.
Seul le fichier de métadonnées système `.DS_Store` est ignoré dans l'inventaire
scientifique, sans suppression ni modification ; les autres fichiers non déclarés
restent des erreurs.

Une vérification complète lit tous les fichiers et décompresse les séries
référencées. Elle consomme des E/S et du CPU mais ne relance ni SPICE ni les
profils terrain, et ne contacte aucun fournisseur. Sa durée doit être mesurée
séparément de la lecture différée de l'UI et des appels OpenRouter. Aucun nouveau
temps global de vérification ni benchmark froid/chaud n'est affirmé ici.

Sources : [pipeline.py](../../lunar_data/pipeline.py),
[scenario.schema.json](../../schemas/scenario.schema.json).

## Contrat commun de Touchdown et de l'assistant

- `touchdown/` est le frontend maintenu. Les valeurs scientifiques viennent des
  fichiers v1 ; `POST /api/compare` fournit les verdicts, rangs et ensembles de
  Pareto utilisés par l'interface, via le même calcul déterministe que l'outil IA.
- Les contraintes mission sont vides par défaut. Seuls les seuils activés par
  l'utilisateur portent `origin: "user"`. Sans contrainte, un classement
  descriptif ne devient pas une validation mission.
- La sélection contient jusqu'à trois paires site/date, dont plusieurs dates du
  même site. Hauteur, modèle et durée restent communs. UI et IA utilisent les mêmes
  identifiants, ordre de priorité et contraintes. Une date absente n'est pas
  remplacée par une autre.
- Le cache des comparaisons inclut toute la requête. Une réponse lente concernant
  une ancienne sélection ne devient pas le résultat de la sélection courante.
- Si l'API manque, les valeurs statiques restent disponibles ; les verdicts sous
  contraintes restent inconnus et l'interface ne fabrique pas de résultat API.
- Les anciennes preuves de comparaison, y compris celles d'une session, doivent
  correspondre à la sélection, à la méthode et aux contraintes actuelles. Elles
  sont recalculées avant réutilisation ; leurs anciens verdicts ne sont pas
  transférés à un nouveau contexte.
- Les grilles de sensibilité v1 concernent les 30 jours à partir du 1er décembre
  2026. Leur période fixe est affichée ; changer la date sélectionnée ne produit
  pas une nouvelle grille.

Sources : [comparison.ts](../../touchdown/src/planner/comparison.ts),
[assistantRequest.ts](../../touchdown/src/planner/assistantRequest.ts),
[resources.ts](../../touchdown/src/data/resources.ts),
[ai_tools.py](../../lunar_data/ai_tools.py).

## États instantanés et absence de WebGL

Les états de visibilité et l'éligibilité à l'animation utilisent les fenêtres
publiées semi-ouvertes et les fenêtres analysables. Ils ne prennent plus les états
échantillonnés toutes les dix minutes pour une décision à un instant précis. Les
angles interpolés servent au dessin. Une valeur inconnue reste inconnue ; un
coucher appartient à l'intervalle masqué suivant, sous réserve des données
analysables disponibles.

L'initialisation des données ne dépend plus de la création du renderer WebGL.
En cas d'échec ou de perte du contexte graphique, les contrôles de vol sont
désactivés et les vues de données restent accessibles, ainsi que les contrôles de
l'assistant sous réserve de ses propres dépendances API/fournisseur. La règle de
visibilité de l'animation n'évalue ni énergie ni sécurité d'atterrissage.

Sources : [clock.ts](../../touchdown/src/planner/clock.ts),
[main.ts](../../touchdown/src/main.ts),
[renderer.ts](../../touchdown/src/scene/renderer.ts).

## Contrôles acquis pendant les corrections

| Contrôle | Résultat observé | Périmètre |
|---|---|---|
| Nouvelles régressions scientifiques | **19 réussies**, 1,11 s | Marges non nulles, trous, fenêtres supprimées, cache valide/altéré/ancien, labels/raster et archives Horizons. |
| Science existante + contrats + nouvelles régressions | **49 réussies**, 13,03 s | Inclut les 19 ci-dessus ; ces nombres ne s'additionnent pas. Cache Geometry redirigé vers `TemporaryDirectory`, autres sorties sous `tmp_path`. |
| Provenance locale réelle | **3 labels + 3 images DEM** acceptés | Contrôle SHA-256 et taille, en lecture seule. |
| Références Horizons archivées | **5 références** acceptées | Hash, paramètres et URL vérifiés ; aucune requête réseau. |
| `git diff --check` sur les fichiers scientifiques modifiés | Réussi | Contrôle effectué sur `scenario.py`, `terrain.py`, `validation.py` et les nouvelles régressions. |

Fichier de régression :
[test_scientific_regressions.py](../../tests/test_scientific_regressions.py).
Ces observations ont été acquises pendant le travail de correction ;
elles ne remplacent pas la suite complète sur la révision finale intégrée.

L'audit initial a également reproduit cinq scénarios complets de trente jours avec
SPICE direct, sans réutiliser le cache de vecteurs : Apollo 11, `sp_s8950`,
`sp_s8600`, IM-1 et Chandrayaan-3, à différentes dates/hauteurs. Les **35 événements
lever/coucher comparés** avaient un écart temporel nul et les fractions/coupures
étaient identiques. L'écart maximal des métriques angulaires était
**3,17 × 10⁻¹²°** : il s'agit d'un écart de reproduction numérique, absolument pas
d'une borne d'exactitude physique. Deux séries comportaient des différences de
dernier chiffre arrondi sur la distance solaire après interpolation annuelle.

## Qualification finale

| Contrôle | Résultat |
|---|---|
| Suite Python complète, `pytest -q -p no:cacheprovider` | **213 réussis**, 70,61 s ; aucun échec ou test ignoré. Cache Geometry temporaire ; écritures v1/raw/interim et réseau externe bloqués par le harnais. Zéro tentative d'écriture protégée. |
| Touchdown, `npm test` | **98 réussis**, 11 fichiers de tests. |
| Touchdown, `npm run build` | TypeScript et Vite réussis ; **4 013 fichiers** du manifeste vérifiés et copiés, **1 872 copies gzip** pour le navigateur. |
| Vérificateur renforcé sur v1 | **4 013 fichiers / 1 872 scénarios acceptés**, contrôle exhaustif réel en 43,61 s ; inclus également dans la suite Python finale. |
| Inventaire et SHA-256 v1 avant/après | **4 015 fichiers identiques**, manifeste et `.DS_Store` compris ; zéro ajout, suppression ou changement de contenu. |
| E2E du build stable, `npm run test:e2e` | **28 contrôles réussis** dans Chrome ; zéro erreur JavaScript non interceptée, zéro requête de données échouée. API Python réelle, transport du modèle simulé. |
| Parcours OpenRouter réel | **Réussi après correction de compatibilité**, modèle `deepseek/deepseek-v4.1-flash-1017`, fournisseur Sail Research. Appel `compare` réel, contraintes et deux dates exactes, preuve validée, deux lignes affichées dans Touchdown. |

Empreinte SHA-256 inchangée du manifeste :
`175bc0048f3fefb50fdba02dc87f768644af18f7333b2d8aa9c665c9342a7b92`.

Traces archivées : [résultats navigateur](touchdown-audit-browser-2026-11-15.json),
[résultats Python](touchdown-audit-python-2026-11-15.txt),
[intégrité v1 et périmètre](touchdown-audit-integrity-2026-11-15.json).

Le parcours navigateur vérifie les valeurs publiées sur les cinq sites polaires,
les treize sites géométriques, les 52 dates, les grilles de sensibilité, le vol et
son refus dans l'obscurité, les contacts exacts et la fin d'analyse, les contraintes,
les preuves IA, les sélections zéro/un/deux scénarios, plusieurs dates du même site,
les réponses tardives et trois pannes simulées. Chaque mode de panne est testé en
français/anglais, à 390 et 749 px, dans les deux onglets. Le débordement mobile
détecté pendant ces tests est corrigé : le tableau défile dans sa carte, sans
forcer une grille de 981 px dans un écran de 390 px.

Revue indépendante : les deux dernières failles de troncature/qualité sont
reproduites puis rejetées par les contrôles corrigés ; aucun autre P1/P2 identifié
dans les correctifs relus. Cela ne constitue pas une preuve d'absence universelle
de défauts.

Le test live est `node touchdown/scripts/check-live-browser.mjs` : une
question, deux scénarios LOLA du point `sp_s8600` (1er et 8 décembre 2026, 2 m),
priorité Terre et nuit maximale 360 h, plafond conservateur de 0,05 USD. Les
scénarios sélectionnés et leurs preuves ont été transmis au modèle configuré
après autorisation explicite de l'utilisateur. Le contrôle automatique avait
initialement bloqué cette étape ; l'autorisation obtenue a permis son exécution.

### Compatibilité OpenRouter vérifiée en conditions réelles

La même question a fait l'objet de **quatre tentatives**, avec un plafond restant
diminué à chaque fois. Les trois premières ont reçu HTTP 400 avant génération,
sans relevé de coût. Le diagnostic disponible ne précisait pas la cause interne.
La désactivation explicite du thinking DeepSeek V4, documentée pour les outils
forcés, n'a pas suffi seule. La séparation du schéma de réponse finale et du tour
d'outil forcé a ensuite permis le succès sur **le même fournisseur Sail Research**.
Aucun changement du modèle, du fournisseur configuré ou de `.env` n'a été requis.

Les tours `required`/outil nommé n'envoient plus `response_format` ; leurs arguments
restent validés par le schéma de l'outil. Les tours `auto`/`none` conservent le schéma
final strict et toutes les preuves finales sont revalidées côté serveur. DeepSeek
V4 utilise `reasoning.enabled=false` avec outils ; R1 et les autres familles ne
changent pas. Les erreurs HTTP fournissent désormais un diagnostic borné et
expurgé de la clé ; une absence de relevé fournisseur ne devient plus un coût nul.

Calcul des réservations cumulées :
`3 × 0,00572552 + 0,01196776 = 0,02914432 USD < 0,05 USD`.
Le dernier essai comprend **deux appels fournisseur** et rapporte
**0,000334976 USD**. La facturation totale des quatre tentatives ne peut pas être
confirmée : les trois HTTP 400 n'ont pas fourni de relevé. Leurs réservations ont
été conservées dans le calcul de plafond, sans supposer leur gratuité.

Preuves : [essai réussi et budget cumulé](touchdown-audit-live-2026-11-15.json),
[essai 1](touchdown-audit-live-attempt-1-2026-11-15.json),
[essai 2](touchdown-audit-live-attempt-2-2026-11-15.json),
[essai 3](touchdown-audit-live-attempt-3-2026-11-15.json).
Références protocolaires :
[choix d'outil DeepSeek](https://api-docs.deepseek.com/api/create-chat-completion/),
[contrôle du raisonnement OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
Ce succès qualifie le parcours et l'endpoint observés ; il ne garantit pas toutes
les futures routes, questions ou disponibilités du fournisseur.

Le service [serve_e2e.py](../../scripts/serve_e2e.py) remplace uniquement le transport
du modèle pour les tests navigateur hors fournisseur. Un appel simulé réussi ne
prouve ni disponibilité ni coût d'un endpoint réel. Les coûts OpenRouter observés
ne couvrent que les montants rapportés par le fournisseur dans les cas enregistrés ;
un champ de coût absent n'est pas une preuve de gratuité.

## Limites scientifiques inchangées

Le **T9 original reste en échec**. Les contrôles supplémentaires de la méthode
composite ne l'annulent pas et ne valident pas tous les sites, dates et hauteurs.
Les sorties LOLA restent expérimentales et les scénarios v1 `not_validated`.
Couverture des noyaux, exactitude numérique et précision physique sont distinctes.

La bissection à une seconde est un réglage numérique, pas une incertitude physique
de ±1 s. Les contacts rasants et événements très courts restent limités par la
méthode déclarée. Les occultations exactes, la puissance, les batteries, le bilan
thermique, les stations et liaisons radio, les relais, la sécurité d'atterrissage,
les ressources et les trajectoires de transfert ne sont pas validés par ce travail.

Références historiques conservées : [validation scientifique v1](v1.md),
[rapport scientifique de livraison](scientific-release-v1.json),
[contrôles Touchdown du 14 novembre](touchdown-south-pole-planner-v1.md).
