# DATA — Plan de traitement et de gestion des données

Équipe **True Larpers** — **Lunar Landing Site Navigator**.

**Statut : plan documentaire, mis à jour le 14 novembre 2026.** Ce document ne prouve aucune implémentation, collecte, validation scientifique ou performance. Les chemins, champs, étapes et critères ci-dessous décrivent le travail à réaliser. Aucun noyau scientifique, MNT ou résultat calculé n'est livré par cette mise à jour.

**Périmètre : DATA exclusivement.** Préparer les sites, calculer les géométries Soleil/Terre, intégrer le relief, comparer des scénarios et fournir des résultats traçables à l'interface et à l'IA. L'interface est construite ailleurs : carte, animations, composants et rendu ne sont pas à implémenter ici.

Document canonique : **`data.md` en minuscules**, sans doublon de casse. Ce plan reprend les exigences utiles du document de la branche `claude/lister-dossier-43a061` au commit `1d84cfce190b98b926f0f70b4ef92024a512658f`, puis du plan publié au commit `04e33837f8d1217c29fca6a67075b6b5d1ce435a`. Il intègre le cadrage SPICE, le whiteboard et les besoins d'accès des agents. Il remplace notamment Horizons comme moteur principal, l'écrasement des anciens caches et tout plafond global non justifié de taille des données. Le [défi](CHALLENGE.md) et le [README](README.md) donnent le contexte produit.

## 0. Comment utiliser ce plan

Le futur exécutant doit d'abord fixer les contrats d'entrée et les conventions scientifiques, puis avancer étape par étape selon les conditions de passage du §13. Préparer une première chaîne vérifiée sur un site avant de l'étendre au catalogue, sans réduire le périmètre final aux seules données d'une démo. Une étape non résolue doit laisser une raison exploitable, jamais une valeur de remplacement plausible.

Repères de lecture : **besoin et entrées §1–2 ; sources/sites/terrain §3–5 ; calculs et critères §6–8 ; livraison et volumes §9 ; IA et ressources §10–11 ; incertitudes §12 ; exécution, benchmark et vérification §13–15 ; décisions ouvertes §16.**

Vocabulaire : **MNT** = modèle numérique de terrain ; **SPK** = noyau de trajectoires ; **PCK** = noyau d'orientation ou de constantes selon le fichier ; **FK** = définition de référentiels ; **LSK** = données nécessaires notamment aux conversions de temps ; **provenance** = sources, versions et transformations ayant produit une valeur. Un *profil d'horizon* donne l'élévation des obstacles selon la direction vue du site, pas une image de fond de carte.

### 0.1 Flux de bout en bout

| Étape | Entrée | Traitement prévu | Sortie et contrôle avant suite |
|---|---|---|---|
| 1. Comprendre | Demande mission | Séparer intention, contraintes, dates de départ/arrivée et durée ; lister ambiguïtés. | Demande normalisée ou précision manquante identifiée. |
| 2. Découvrir | Références/catalogues | Rechercher métadonnées et produits adaptés, sans livrer les archives au LLM. | Inventaire versionné des sources retenues et de leurs limites. |
| 3. Acquérir | Identifiants de produits validés | Récupération contrôlée lors d'une future préparation ; conserver brut et métadonnées. | Fichiers complets, empreintes et journal d'acquisition. |
| 4. Valider/normaliser | Sources brutes et sites | Vérifier unités, référentiels, altitudes, qualité, couverture et conversions. | Données cohérentes ; produits incompatibles écartés explicitement. |
| 5. Préparer | Terrain et points d'observation | Profils d'horizon par site/hauteur ; chargement des noyaux par processus. | Profils et environnement scientifique identifiés, couvertures contrôlées. |
| 6. Calculer | Site, époque et conventions | Directions/distances/disques, visibilité terrain et occultations requises. | Séries nominales, indicateurs de qualité et inconnus. |
| 7. Détecter | Séries et fonctions de dégagement | Rechercher transitions et tangences, raffiner puis agréger. | Événements encadrés, fenêtres et durées traçables. |
| 8. Évaluer | Métriques, contraintes, marges | Verdicts par critère, comparaison nominale/prudente et compromis. | Résultats sans score ou seuil inventé. |
| 9. Publier | Résultats contrôlés | Manifestes immuables, cache, paquet UI/LLM et références détaillées. | Lot cohérent et reproductible, qualité conservée dans chaque vue. |
| 10. Vérifier | Lot et cas de référence | Contrôles scientifiques/numériques ; benchmark séparé après justesse. | Rapports réels distingués du présent plan. |

### 0.2 Couverture du défi, côté DATA

| Besoin du défi | Livraison DATA prévue | Limite à afficher |
|---|---|---|
| Sites notables et coordonnées personnalisées | Catalogue sourcé, historique Apollo, cibles CLPS/autres missions si vérifiées ; même validation pour un point personnalisé. | Une cible future peut changer ; zone et point exact distincts. |
| Comparaison de sites et dates | Scénarios comparables, critères, classements justifiés et alternatives (§7–8). | Résultat relatif aux scénarios réellement explorés. |
| Position Soleil/Terre par rapport à l'horizon | Directions, profil terrain et états de disque (§5–6). | Pas de masque polaire fiable sans terrain compatible. |
| Éclairage, Earthset et fenêtres | Événements, intervalles, durées, coupures et troncatures (§7). | Géométrie, énergie et liaison opérationnelle distinctes. |
| Jours/saisons et changement de calendrier | Dates libres dans le domaine couvert, durée explicite, comparaison d'un report de date. | Pas de répétition artificielle d'un cycle supposé identique. |
| Libration et variations orbitales | Trajectoires et orientation cohérentes de la chaîne SPICE, contrôlées par références. | Ne pas ajouter un mouvement périodique arbitraire en supplément. |
| Carte 2D/3D et animation | Coordonnées/projection, vecteurs/directions, relief ou références de produits et séries d'affichage (§9.7). | Choix et réalisation de l'interface hors périmètre. |
| Publics différents | Données détaillées pour vérification et paquet explicatif compact pour IA/public. | Simplifier la présentation sans retirer les inconnus déterminants. |

Le défi propose plusieurs formes de produit ; cette table trace leur support DATA, sans rendre obligatoire une interface particulière. Les modèles supplémentaires conditionnés par une demande mission sont détaillés au §6.4 : ils font partie de la feuille de route, sans être annoncés comme disponibles.

## 1. Besoin exprimé sur le whiteboard

Source d'intention : photo fournie par l'équipe, `IMG_5920.HEIC`. Cette photo décrit une idée produit ; ce n'est pas une source scientifique.

| Élément lisible | Traduction en exigence DATA |
|---|---|
| Input : type de mission, fourchette de temps | Formaliser l'intention, les dates admissibles, la durée et les critères mission (§2). |
| Meilleure solution : communication Terre–Lune, éclairage Soleil–Lune, relief lunaire | Comparer plusieurs couples site–date sur une période et expliquer leurs compromis (§8). |
| Map interactive | Fournir positions, résultats et références aux couches affichables ; contrat de sortie seulement (§9). |
| IA : regrouper les données, comparer avec les anciennes missions, relier au moteur, donner les meilleures options | Construire un dossier de résultats vérifiables ; l'IA explique le classement calculé (§10). |
| Moteur de calcul : prévision | Calculer localement les positions et fenêtres futures couvertes ; distinguer couverture et validation (§3–7). |
| « Où atterrir ? », « Quand ? » ; saisons/jours lunaires | Explorer sites et dates sur la même durée d'observation ; publier les fenêtres UTC et la convention de tout indicateur saisonnier. |
| « Est-ce que ça pourra fonctionner ? » | Répondre sur les critères modélisés, avec statut nominal, statut prudent et critères inconnus. Aucune validation de mission complète. |
| « Exploiter frost » ; position/hauteur du Soleil, durée d'éclairage, communication Terre | Retenir provisoirement une intention d'exploration de givre/glace supposé ; ajouter un besoin futur de données de ressources sourcées (§11). |

**Ambiguïtés conservées :** je ne peux pas confirmer le texte central pâle/effacé ni les extrémités coupées. L'interprétation opérationnelle de « frost » et le matériel mission restent à confirmer. Aucune phrase illisible n'est reconstituée. Aucun gisement exploitable n'est établi par cette photo.

## 2. Entrées : exprimer la demande sans inventer de paramètres

L'unité de comparaison est un **scénario = site + instant initial de surface + durée analysée + paramètres mission + versions des données/modèles**.

### 2.1 Contrat d'entrée proposé

| Champ | Sens et règle |
|---|---|
| `missionIntent` | Objectif déclaré : démonstration, observation, exploration de ressources, autre texte utilisateur. Ne génère pas automatiquement des capacités matérielles. |
| `candidateSiteIds` / coordonnées personnalisées | Sites du catalogue ou position fournie ; coordonnées personnalisées soumises aux mêmes contrôles de référentiel et de terrain. |
| `departureRangeUtc` | Plage admissible des dates de départ/lancement, si connue. Ne vaut pas plage d'alunissage. |
| `surfaceStartRangeUtc` | Plage des débuts possibles d'opérations à la surface, utilisée pour comparer les dates. |
| `transferDuration` / `arrivalMapping` | Relation départ → arrivée fournie et documentée, si le départ doit servir d'entrée. Sans cette relation, demander une plage d'arrivée ; aucune trajectoire n'est déduite par le LLM. |
| `analysisDuration` | Durée évaluée après chaque début de surface. Proposition initiale : **30 jours terrestres**, réglable ; ce n'est ni une durée de transfert ni un mois lunaire exact. |
| `candidateStartSampling` | Grille d'exploration des dates initiales et règle de raffinement. Séparée du pas d'échantillonnage des éphémérides. À fixer selon la demande. |
| `observerHeightsM` | Hauteurs des points évalués au-dessus du terrain : panneau, antenne ou autre observateur ; distinctes de l'altitude du sol. Une hauteur inconnue reste inconnue. |
| `hardConstraints` | Critères bloquants, opérateur, unité et seuil explicites : par exemple durée maximale d'obscurité tolérée, si fournie. |
| `preferences` | Objectifs à favoriser après filtrage : éclairage, visibilité Terre, coupures plus courtes ; ordre ou poids fournis et enregistrés. |
| `missionMargins` | Gardes temporelles ou angulaires choisies par l'utilisateur ; champs distincts des incertitudes scientifiques. |
| `resourceRequirement` | Besoin éventuel de ressources ; provenance nécessaire pour le vérifier, sinon critère inconnu. |

Pour chaque seuil ou poids, conserver `value`, `unit`, `origin` et le caractère obligatoire ou optionnel. Ni le moteur ni le LLM ne doivent inventer poids, seuils, coordonnées ou caractéristiques d'un véhicule. Un profil prédéfini reste une proposition à documenter et à faire choisir, pas une mission réelle validée.

**Validation préalable :** vérifier types, valeurs finies, domaines des coordonnées, dates avec échelle/convention explicite, début avant fin, durée strictement positive et unités de chaque seuil. Refuser coordonnées ambiguës plutôt que deviner signe ou référentiel. Fixer une limite de volume de demande configurable et publiée ; si une recherche doit être découpée, conserver son périmètre total et signaler les morceaux non calculés. Ce plafond technique ne doit pas devenir une fausse limite scientifique.

Préciser dans la demande si l'utilisateur attend une **visibilité géométrique**, un **éclairage direct tenant compte des occultations**, une **accessibilité d'une station** ou un **bilan mission**. Les données minimales diffèrent. Un besoin non modélisé n'est pas satisfait par une métrique voisine moins exigeante.

### 2.2 Trois dimensions temporelles séparées

1. **Distance à la date de départ/arrivée** : dans combien de temps commence le scénario ?
2. **Durée analysée** : combien de temps après ce début est évalué ?
3. **Latence** : combien de temps prend le calcul ou la lecture du cache ?

L'ancienne idée « jusqu'à 12 mois d'avance » est une hypothèse produit non validée, pas une limite de SPICE ni une précision garantie. La plage utile doit dépendre des données réellement présentes et du statut de validation. Pour les « saisons/jours lunaires », calculer les conditions aux dates demandées ; ne pas répéter une journée type. Tout libellé de saison doit définir sa grandeur astronomique et sa référence, sinon conserver uniquement les dates UTC.

### 2.3 Durées, bornes et recherche de dates

Décision de contrat proposée : représenter les durées de calcul en **secondes sur l'échelle interne déclarée**, afficher les instants en UTC avec leur convention, et distinguer durée fixe de sélection calendaire. Le budget « 30 jours à 10 min » du §9.6 suppose `30 × 24 × 60 × 60` secondes et une grille régulière, sans raffinement ; ce n'est pas une définition d'un jour solaire lunaire.

Les échantillons peuvent contenir les deux bornes pour interpolation. Pour additionner des fenêtres contiguës, utiliser une convention uniforme, par exemple intervalles semi-ouverts `[début, fin)`, avec l'état à la dernière borne conservé séparément. Définir inclusivité des seuils et contacts exacts afin d'éviter double comptage et changements de résultat selon l'ordre d'agrégation.

Pour explorer une plage de dates : enregistrer la durée analysée commune, la grille initiale, les règles de raffinement, le nombre de dates examinées et les exclusions. Une recherche large peut réutiliser une série couvrant l'union des fenêtres lorsque ses conventions et sa résolution suffisent ; elle ne doit pas recalculer ou répliquer inutilement les mêmes instants. Si une demande porte sur 30 jours dans dix ans, il suffit de calculer la fenêtre utile et les époques requises par le modèle, pas dix ans de séries intermédiaires.

## 3. Sources et moteur astronomique retenu

### 3.1 Choix d'architecture

**Moteur principal prévu : SPICE/CSPICE local + éphéméride DE440.** Horizons sert à la comparaison, avec requêtes archivées et paramètres rapprochés. Le plan ne délègue aucun calcul physique au LLM.

| Besoin | Source / traitement prévu | Statut du plan |
|---|---|---|
| Positions Soleil, Terre, Lune | SPK `de440.bsp` ; vérifier corps et couverture dans le [résumé NAIF](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt). | Retenu, non téléchargé ici. |
| Orientation lunaire | PCK binaire `moon_pa_de440_200625.bpc` ; [commentaires du noyau](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.cmt). | À associer à un FK compatible. |
| Référentiels lunaires | [`moon_de440_250416.tf`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf), explicitement compatible avec ce PCK. | Version à figer dans le manifeste. |
| Constantes de forme et conversion temps | PCK de constantes et noyau LSK compatibles ; noms et versions exacts à sélectionner et consigner. | Décision restante ; aucun fichier « latest » implicite. |
| Azimut/élévation depuis un site | [`azlcpo_c`](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/azlcpo_c.html), position fixe dans un repère lunaire, corrections déclarées. | Candidat de calcul ; n'applique pas le masque LOLA. |
| Topographie | [LOLA, PDS Geosciences](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) / ODE, produit de terrain polaire à identifier précisément. | Inclus dans le plan pôle sud ; produit exact non choisi. |
| Comparaison astronomique | [Horizons : documentation API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) et [manuel](https://ssd.jpl.nasa.gov/horizons/manual.html). | Comparaison ciblée ; pas moteur de chaque scénario. |
| Catalogue des sites | Références de missions et de coordonnées à collecter. | 10–15 sites visés, aucune liste réelle validée ici. |
| Ressources givre/glace | Future source scientifique spécifique au produit et au site. | Manquante ; aucune présence ou exploitabilité déduite. |
| Fond cartographique | [Moon Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon), tuiles raster d'affichage. | Couche UI, hors implémentation DATA ; pas mesures numériques brutes pour le moteur. |

Charger et contrôler les noyaux **une fois par processus**, puis les réutiliser sur les sites/dates compatibles. Conserver ordre de chargement, versions et empreintes : deux noyaux chargés différemment ne doivent pas produire un résultat présenté comme le même scénario.

Proposition de cycle de vie : un processus de calcul reste attaché à un manifeste de noyaux immuable. Un autre jeu de versions déclenche un environnement distinct ou une réinitialisation contrôlée et traçable. Avant parallélisation, vérifier les garanties de l'adaptateur retenu ; ne pas supposer qu'une modification concurrente des noyaux chargés est sûre. Une optimisation future ne doit pas mélanger les dépendances de deux scénarios.

### 3.2 Couverture mathématique et plage validée

Les résumés NAIF du DE440 complet et du PCK d'orientation indiquent une couverture voisine de **1550–2650** (bornes exactes en ET dans les sources ci-dessus). Cette couverture permet une interrogation mathématique ; elle ne garantit ni précision uniforme ni adéquation mission. Ne pas attribuer ces bornes à un autre fichier, notamment une variante courte, sans vérifier son propre résumé.

Plage calculable = intersection des couvertures nécessaires : trajectoires, orientation, transformations et conventions temporelles applicables. Vérifier la période entière `[surfaceStart, surfaceStart + analysisDuration]`, ainsi que les époques supplémentaires nécessaires aux corrections de temps de lumière. Pas d'extrapolation silencieuse.

Publier séparément :

- `coverageStatus` : période couverte, partielle ou hors couverture ;
- `validationStatus` : contrôlée sur les cas de référence documentés, non validée ou échec ;
- hypothèses de conversion UTC ↔ ET/TDB et version LSK. Une date future dépend des conventions disponibles pour les secondes intercalaires ; ne pas présenter cette conversion comme une connaissance de toutes les futures corrections UTC.

Une très grande avance temporelle n'autorise pas une annonce de même précision qu'aux dates de validation. Incertitude non documentée pour un cas : **non quantifiée**. Voir les [limites des éphémérides Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html#statement-of-ephemeris-limitations).

### 3.3 Usage de Horizons pour comparaison

Archiver observateur, coordonnées et altitude, corps cibles, repères, échelle de temps, unités, corrections, dates, requête et réponse, version API et date de récupération. Comparer d'abord les directions astronomiques sans masque terrain. Ensuite contrôler le masque LOLA séparément.

Les corrections ne sont pas automatiquement identiques : Horizons inclut une déflexion gravitationnelle dans ses angles apparents, tandis que les corrections SPICE usuelles de [lecture d'état](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkezr_c.html) traitent notamment temps de lumière et aberration stellaire ; voir aussi leurs [limites relativistes](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/abcorr.html). Relever les différences de modèles ; ne pas les masquer sous une tolérance arbitraire. Si les deux chaînes utilisent une éphéméride commune, leur accord n'est pas une validation entièrement indépendante.

Respecter les [règles du service SSD](https://ssd-api.jpl.nasa.gov/) : une requête à la fois, cache, gestion des erreurs avec temporisation croissante et User-Agent applicatif valide. Appels de préparation/comparaison côté serveur, pas intégration directe de l'API dans le navigateur. Pour extraire une table : conserver le brut, demander CSV, vérifier délimiteurs, en-têtes, version, unités et valeurs absentes avant conversion numérique.

### 3.4 Acquisition et normalisation reproductibles

Avant toute future collecte, créer une fiche par produit : organisme, instrument/modèle, identifiant/version, URL d'origine, date de publication si connue, date de récupération, taille annoncée, empreinte publiée si disponible, format, unités, échelles de temps, référentiel horizontal/vertical, emprise et valeurs invalides. Une URL seule ne suffit pas si son contenu peut changer.

Procédure à réaliser :

1. **Découvrir par métadonnées** : filtrer corps, instrument, niveau de produit, zone et dates utiles. Distinguer produit global, tuile et sous-ensemble généré. Conserver la requête de sélection ; ne pas retenir le premier résultat par défaut.
2. **Examiner les labels et documents** : vérifier adéquation au besoin, repère, résolution, qualité et couverture. Si un champ déterminant manque, bloquer son usage scientifique et identifier la question à résoudre.
3. **Récupérer de façon contrôlée** : timeout, reprises uniquement si supportées, tentatives bornées, respect des règles de chaque service. Stocker d'abord en zone temporaire ; un fichier partiel ne doit jamais apparaître comme prêt.
4. **Contrôler après récupération** : statut de réponse, format réel, taille, empreinte calculée et comparaison avec une empreinte officielle lorsqu'elle existe. Une empreinte calculée localement identifie le contenu ; elle ne prouve seule ni authenticité ni exactitude scientifique.
5. **Normaliser sans perdre le brut** : convertir les unités, lire les valeurs invalides avant tout calcul, préserver l'échelle/origine, la projection et les transformations appliquées. Ne pas réinterpréter un pixel absent en altitude zéro.
6. **Publier l'inventaire** : état prêt/rejeté/incomplet, raisons, manifestes et liens entre produit source, sous-ensemble et dérivé. Réutiliser un produit seulement si son identité et son adéquation sont vérifiées.

Les noyaux sont des entrées du moteur, pas du texte à reconstituer depuis un affichage web ; utiliser les fichiers officiels lors de la future acquisition. Pour un MNT, documenter aussi dimensions, emprise, ordre des axes, type numérique, facteur d'échelle, décalage, valeur invalide et transformation pixel → coordonnée. Vérifier l'inverse sur des points de contrôle avant construction d'horizon.

**Conservation :** garder les tuiles nécessaires aux scénarios publiés et à leur vérification, ou une stratégie de récupération reproductible avec produit/version/empreinte et disponibilité contrôlée. Ne pas imposer une suppression automatique qui empêcherait nouveaux sites ou vérification. Toute politique de rétention doit distinguer brut reproductible, résultat publié et cache jetable ; décider de l'archivage avant suppression, sans invalider silencieusement une provenance.

### 3.5 Gestion des erreurs et états de traitement

Les noms ci-dessous sont une proposition de contrat à figer au §13, pas une API implémentée.

| Cas | État / action attendue | Effet sur résultat |
|---|---|---|
| Entrée invalide ou ambiguë | `invalid_request`, champs et raison précis ; corriger la demande. | Aucun calcul inventé, pas de tentative réseau répétée. |
| Produit/repère/hauteur manquant | `missing_dependency` ou `incompatible_reference`. | Bloquer métriques concernées ; conserver les autres avec couverture explicite. |
| Période hors couverture | `outside_coverage`, bornes utiles publiées. | Pas d'extrapolation ni réduction de période silencieuse. |
| HTTP 429/503, indisponibilité | Respecter indication de reprise si présente ; temporisation et tentatives bornées, journalisées. | Ancien cache possible seulement si version/fraîcheur clairement indiquées ; sinon indisponible. |
| HTTP 400/404 ou produit introuvable | Vérifier requête/identifiant ; ne pas boucler à l'identique. | Erreur de découverte ou dépendance manquante, pas résultat physique. |
| HTTP 401/403 | Identifier accès refusé ; aucune promesse d'accès universel. | Dépendance indisponible tant que l'accès légitime n'est pas résolu. |
| Réponse vide, version modifiée ou schéma inattendu | `source_format_changed` ou absence documentée ; conserver réponse utile au diagnostic. | Parser arrêté, pas de colonnes devinées. |
| Taille/empreinte/lecture incohérente | `integrity_error`, produit isolé. | Interdire publication comme donnée prête. |
| Trou de MNT ou échec numérique | `partial` avec portions invalides ou `calculation_failed`. | Inconnus propagés ; aucun remplacement par zéro. |
| Arrêt/cancellation/écriture interrompue | Lot temporaire incomplet, reprise à partir des artefacts contrôlés. | Manifeste final publié uniquement après vérification de tous ses liens. |

Séparer état du traitement (`pending`, `running`, `complete`, `partial`, `failed`, `cancelled`), couverture scientifique (§3.2) et verdict mission (§8). « Calcul terminé » ne signifie pas « mission viable ». Fournir identifiant de demande, étape, dépendance concernée, raison, portions affectées et action possible ; éviter que le consommateur reconstruise un sens à partir d'un seul message libre.

## 4. Sites : coordonnées, altitude et provenance

Catalogue initial visé : **10 à 15 sites**, dont quelques sites hors pôle sud pour comparaison. Ce nombre est un objectif de travail, pas un catalogue déjà constitué. Aucune coordonnée exemple ne doit passer pour une mesure.

| Champ de `sites.json` | Exigence |
|---|---|
| `id`, `name` | Identifiant stable et nom affichable. |
| `mission` | Mission/programme sourcé ; `null` si inconnu. |
| `status` | `historical`, `confirmed` ou `candidate`, selon une source datée ; `confirmed` qualifie ici le statut du site, pas son aptitude mission. |
| `positionKind` | Point mesuré, cible annoncée ou zone d'étude. Une zone ne devient pas un point exact sans hypothèse explicitement identifiée. |
| `latDeg`, `lonDeg` | Nord positif, est positif ; domaine de longitude déclaré. Latitude planétocentrique ou planétographique explicitée. |
| `altKm`, `altitudeReference` | Altitude du sol et sa référence : rayon/sphère/ellipsoïde ou autre convention sourcée. Ne pas confondre avec hauteur d'antenne. |
| `frame`, `frameRealization` | Repère lunaire exact et réalisation ; pas seulement « Moon ». |
| `positionUncertainty` | Incertitude documentée ou non quantifiée ; résolution d'affichage séparée. |
| `sources` | Au moins deux références pour la coordonnée, date d'accès et passages utiles ; signaler si elles reprennent la même source primaire. |
| `terrainCompatibility` | Correspondance avec le produit LOLA et transformation appliquée, ou blocage explicite. |

Le FK retenu définit des réalisations PA et ME distinctes. Ne pas traiter `MOON_PA`, `MOON_ME` et `IAU_MOON` comme interchangeables. Consigner toute transformation de coordonnées et sa source. Un succès historique fournit du contexte ; il ne valide pas une nouvelle mission, date ou position.

**Ordre de préparation :** retrouver les coordonnées et leur nature → vérifier les deux références → identifier référentiel et altitude → convertir de façon traçable → contrôler compatibilité terrain → accepter ou marquer le site incomplet. Une coordonnée personnalisée suit ce même chemin.

### 4.1 Constitution du catalogue et comparaison historique

Rechercher d'abord les sources primaires du programme ou de la mission pour le statut, puis une source de position avec son référentiel et sa précision. Les coordonnées d'un site Apollo réellement atteint, d'une cible CLPS annoncée et du centre d'une région candidate n'ont pas la même signification. Enregistrer séparément site prévu et position atteinte lorsqu'ils existent ; ne pas utiliser l'un comme l'autre.

Pour la comparaison avec une ancienne mission, conserver la date réelle des opérations étudiées, les critères connus, la position correspondante et la référence des conclusions historiques. Si les critères ou le matériel ne sont pas documentés, comparer uniquement les conditions géométriques recalculées avec le même moteur et les mêmes conventions ; ne pas inventer les raisons du succès passé. Pour un nouveau scénario, expliquer ce qui change : date, point, hauteur, durée, besoin ou modèle.

Une région d'alunissage demande une analyse spatiale distincte : enregistrer polygone/emprise, points réellement calculés et règle de sélection. Un seul point ne représente pas toute la région. Un balayage de points supplémentaires doit publier sa résolution et ses limites ; aucun « meilleur endroit dans la région » sans recherche décrite.

## 5. Terrain LOLA : construire le masque d'horizon

LOLA est la source topographique prévue ; le PDS fournit notamment des produits maillés. Le produit exact, sa projection, son repère, ses unités, sa référence verticale et ses indicateurs de qualité doivent être lus dans ses métadonnées, pas supposés depuis le nom de fichier.

### 5.1 Préparation par site et par hauteur

1. Sélectionner le produit couvrant le site et les directions d'analyse ; archiver identifiant, version, URL, empreinte et métadonnées.
2. Mettre site et terrain dans une géométrie cohérente : sphérique/ellipsoïdale et conversion cartésienne documentées. Ne pas appliquer un plan plat sur des dizaines de kilomètres sans justifier l'approximation.
3. Placer l'observateur à la hauteur demandée au-dessus du sol. Produire des profils distincts si antenne et panneau n'ont pas la même hauteur.
4. Calculer, par azimut, l'élévation maximale des obstacles dans cette géométrie ; inclure correctement le limbe géométrique et l'éventuelle dépression d'horizon.
5. Enregistrer trous, directions non couvertes, bord du MNT, distance maximale et approximation angulaire. Une absence de terrain n'est jamais un obstacle de hauteur zéro.
6. Contrôler sensibilité au rayon, au pas spatial et au pas azimutal ; préserver les obstacles éloignés ou étroits susceptibles de modifier les événements.

Hypothèses initiales héritées du plan : maille de travail **20–100 m**, **360 azimuts** (un par degré), rayon **20–50 km**. **À valider**, pas garanties de précision ni d'horizon complet. Sous-échantillonner peut effacer des crêtes ; un relief hors rayon peut masquer un astre rasant. Élargir/raffiner l'analyse ou marquer les limites, sans déclarer le profil complet par défaut.

### 5.2 Contrat du profil

Prévoir `siteId`, position et hauteur utilisées, repère, modèle de forme, produit/version LOLA, résolution source et de travail, projection, rayon, azimuts, `horizonElevationDeg`, règle d'interpolation, masque de validité, limites et contrôles. Versionner ce profil et son empreinte ; changer hauteur ou source invalide sa réutilisation comme profil identique.

`horizonModel` : `geometric` ou `lola` accompagné de la référence du profil. Sans relief compatible, une vue géométrique peut servir de comparaison pédagogique, avec avertissement et statut dégradé. Elle ne doit pas permettre de valider une contrainte d'éclairage locale au pôle sud. Des directions manquantes propagent un statut inconnu vers les métriques concernées.

Un profil d'horizon ne suffit pas à décrire pente sous l'atterrisseur, rugosité ou dangers d'alunissage. Si une mission impose ces critères, prévoir des produits et méthodes distincts ; sinon les déclarer non évalués.

### 5.3 Méthode géométrique proposée et contrôles nécessaires

La méthode doit comparer des **directions vues depuis l'observateur**. Proposition à valider : convertir terrain et observateur en positions cartésiennes dans un même repère lunaire, former les vecteurs observateur → terrain, puis exprimer leurs élévations/azimuts dans le repère local défini au §6. Le maximum d'élévation dans une direction définit l'obstacle retenu, avec la distance et le produit source qui le portent. Cela évite de soustraire des altitudes comme si la surface était plane.

Ne pas confondre résolution du MNT et distance entre points du profil. Près du site, petits obstacles et hauteur d'observation peuvent dominer ; au loin, courbure et couverture deviennent déterminantes. Documenter l'échantillonnage radial/azimutal, la façon de conserver les sommets, l'interpolation et l'horizon de référence hors terrain connu. Une règle de maximum peut être prudente dans une approximation donnée, mais ne fournit pas une borne globale sans analyse des zones absentes.

Avant activation d'un profil, confronter au moins : forme sans relief de solution contrôlable, obstacle synthétique de position/hauteur connues, changement de hauteur observateur, limite de tuile, directions 0°/360°, pôle et latitude voisine. Augmenter successivement rayon et résolutions puis comparer horizons et temps d'événements. Fixer les critères d'écart acceptable **avant** de déclarer un profil validé ; si aucun seuil mission n'est disponible, publier convergence observée sans promesse de précision opérationnelle.

Un observateur fixe suffit pour un atterrisseur immobile. Un rover ou un équipement déplacé change position et horizon : une future extension devra recevoir trajectoire de surface, temps et hauteurs, puis produire plusieurs profils ou une méthode équivalente vérifiée. Aucun profil fixe n'est réutilisé silencieusement pour une trajectoire mobile.

## 6. Géométrie Soleil/Terre et conventions de visibilité

### 6.1 Calcul astronomique prévu

À chaque époque, convertir le temps selon la convention déclarée, obtenir direction et distance de chaque corps depuis l'observateur, puis azimut/élévation selon le zénith choisi. Déclarer corrections `abcorr`, modèle de normale, sens d'azimut et unités. Pour `azlcpo_c`, la méthode documentée `ELLIPSOID` utilise les rayons du noyau de constantes ; le relief LOLA est une étape distincte. Ne pas confondre normale de référence et normale réelle d'un panneau posé sur une pente.

Convention de sortie proposée : degrés ; azimut nord = 0°, est = 90°, croissance vers l'est ; élévation positive vers le haut. Vérifier les options SPICE et conversions contre cette convention, notamment près du pôle où la définition du nord local exige un traitement explicite. Comparer l'astre au profil dans exactement le même repère local.

Le modèle du défi n'applique pas de réfraction atmosphérique à l'observateur lunaire. Ne pas activer par défaut une correction terrestre de lever/coucher. Pour une future station sur Terre, les hypothèses de réfraction éventuelles relèvent de son propre modèle et doivent être déclarées.

### 6.2 Disque visible, partiel ou masqué

Éviter le booléen unique `visible`, trop ambigu. Conserver centre, rayon apparent calculé avec distance et constante physique sourcée, profil appliqué et convention du disque. Aucun rayon angulaire fixe ne vaut pour toutes les dates.

Définir les états terrain :

- `none` : aucune portion du disque au-dessus du masque ;
- `partial` : une portion seulement ;
- `full` : disque entier au-dessus du masque ;
- `unknown` : données ou méthode insuffisantes ; contact rasant signalé séparément.

Pour un horizon supposé constant sur toute la largeur du disque, approximation explicite :

`c_upper = elevationCentre + rayonApparent - horizonElevation`

`c_lower = elevationCentre - rayonApparent - horizonElevation`

Alors `c_upper > 0` indique une portion potentiellement visible et `c_lower > 0` un disque entièrement dégagé **dans cette approximation**. Pour un masque variable avec l'azimut, évaluer les directions couvrant le disque et la variation du masque ; le seul profil à l'azimut du centre ne prouve pas une visibilité complète. Méthode de discrétisation, convergence et traitement des tangences restent à valider. Une fraction visible n'est publiée que si elle est calculée et contrôlée ; sinon `null` avec motif.

Ces états décrivent le **masquage par le terrain**. Toute occultation supplémentaire, par exemple Soleil occulté par la Terre, doit être traitée dans un module explicite ou signalée comme non évaluée. Ne pas transformer une durée de Soleil dégagé du terrain en durée d'éclairement physique complète si ces effets sont absents.

### 6.3 Ce que les indicateurs ne démontrent pas

Un bord supérieur du Soleil visible n'est ni un plein éclairement ni une puissance solaire garantie. Aucun résultat en watts sans modèle de panneau, orientation, rendement, ombres propres et autres hypothèses nécessaires. Pas de bilan thermique ou batterie implicite.

Une portion de Terre visible n'est ni une station terrestre joignable ni une liaison garantie. L'antenne peut nécessiter une autre hauteur, un pointage, une station visible et disponible, et un bilan de liaison. Le premier niveau publie **visibilité géométrique Terre** ; si une contrainte exige une vraie communication, son résultat reste inconnu tant que la chaîne station/équipements n'est pas modélisée. Un relais satellitaire nécessite ses propres données et relève d'une extension conditionnée (§6.4).

### 6.4 Niveaux de calcul : couvrir le besoin complet sans confondre les résultats

Chaque scénario déclare `requestedCapabilities` et `evaluatedCapabilities`, avec motif des capacités absentes. Les extensions ci-dessous sont planifiées conditionnellement à leur besoin et à leurs sources, pas éliminées au seul motif qu'elles dépassent une démonstration minimale.

| Niveau | Données supplémentaires nécessaires | Sorties prévues / condition avant utilisation |
|---|---|---|
| A. Géométrie astronomique | Sites/hauteurs, trajectoires, orientation, constantes et temps cohérents. | Directions et disques par rapport à une référence géométrique ; ne valide pas ombres polaires. |
| B. Visibilité terrain | MNT compatible et profils contrôlés. | États Soleil/Terre par rapport au terrain ; couverture et limites attachées aux fenêtres. |
| C. Éclairage direct avec occultations | Géométrie Soleil–Terre vue **depuis le site**, formes/rayons, corrections et recherche des contacts. | Fenêtres distinguant terrain et occultation ; nécessaire avant de qualifier un résultat d'éclairage direct tenant compte de ces effets. |
| D. Accès d'une station terrestre | Coordonnées/référentiel/hauteur de station, orientation terrestre et données temporelles adaptées, masques d'antenne et règles de pointage. | Visibilité mutuelle pour la station nommée et intervalles d'accès, avec couverture propre des données terrestres. |
| E. Liaison/énergie/thermique | Caractéristiques des équipements, fréquence/puissance/gains/pertes, orientation panneaux, rendement, besoins et modèle physique pertinent. | Critères d'ingénierie définis et validés séparément ; aucune conversion automatique d'un angle en succès de mission. |
| F. Ressources, mobilité ou relais | Produits de ressources (§11), trajet de surface, éphéméride du relais et éléments mission nécessaires, selon le besoin. | Résultats spécifiques et sources ; chaque capacité inconnue reste explicitement inconnue. |

**Occultations/éclipses :** les fonctions NAIF [`occult_c`](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/occult_c.html) et [`gfoclt_c`](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/gfoclt_c.html) documentent des calculs d'état et d'intervalles d'occultation. Ce sont des candidats à étudier, pas une chaîne prête pour un site arbitraire : vérifier comment représenter l'observateur requis par l'API, ses données de position et les restrictions de corrections. Utiliser le centre de la Lune à la place du site n'est pas un remplacement exact. Une méthode vectorielle depuis le site peut aussi être envisagée si elle est contrôlée sur des cas de référence.

Définir contacts et états séparés (`none`, `partial`, `total`, autre cas pertinent) et conserver la convention des formes. Une fraction d'aire solaire non occultée ne devient une puissance que dans un modèle énergétique explicitement défini. Le masquage terrain et l'occultation peuvent retirer les mêmes parties du disque : ne pas multiplier naïvement deux fractions indépendantes ; évaluer le disque restant selon une méthode commune ou rester sur des fenêtres de disponibilité définies. Tester notamment un Soleil dégagé du terrain mais occulté, puis une occultation partielle combinée à une crête.

**Station terrestre :** calculer direction du site vers la station, masquage par le terrain lunaire à la hauteur d'antenne, direction inverse et élévation du site lunaire par rapport au masque de station. Spécifier conventions de réception/transmission et corrections adaptées au besoin. Intersecter les fenêtres géométriques avec disponibilité et limites de pointage uniquement si ces données sont fournies. Une visibilité de la station n'est pas un bilan radio ; si disponibilité inconnue, publier accès géométrique seulement. La couverture des noyaux d'orientation terrestre peut réduire fortement celle de la chaîne lunaire ; recalculer l'intersection au lieu de reprendre 1550–2650.

## 7. Recherche temporelle et métriques

### 7.1 Deux recherches distinctes

- **Dates initiales** : explorer les débuts de surface admissibles, puis raffiner les zones prometteuses ; conserver la grille parcourue et les dates ignorées. Dire « meilleur parmi les scénarios explorés », jamais optimum global non démontré.
- **Événements dans chaque scénario** : échantillonner les directions, appliquer le masque/disque, détecter transitions et affiner leurs temps.

Hypothèse numérique initiale : pas grossier **10 min**, puis objectif de raffinement **1 min** autour des transitions détectées. Ce choix n'est ni une borne physique ±1 min ni une garantie de détection : un événement peut apparaître et disparaître entre deux échantillons. Prévoir recherche des faibles dégagements, extrema et contacts rasants, subdivision locale selon variation du masque, puis confrontation à un calcul plus fin. Sans méthode assurant la détection, annoncer le risque résiduel non borné.

Conserver intervalle d'encadrement de chaque transition, critère d'arrêt, convergence observée et éventuelle tangence non résolue. Les cas toujours visibles/masqués sur la période n'autorisent pas un coucher/lever inventé hors période.

Procédure de recherche à détailler lors de la réalisation : définir une fonction de dégagement par convention → évaluer grille initiale et variations du masque → rechercher changements de signe **et minima/maxima proches du contact** → isoler candidats → raffiner encadrements → reconstruire états/fenêtres → comparer avec recherche plus fine sur les cas difficiles. Une tangence peut ne pas changer de signe. Une interpolation lisse des centres ne suffit pas si le masque d'horizon comporte une crête étroite.

Pour chaque méthode, documenter plus petit événement que la stratégie est conçue pour rechercher, justification et limites. S'il est impossible de garantir la complétude, conserver un état de détection non garanti au lieu de donner une précision temporelle totale. Les réglages de raffinement, la précision d'encadrement et l'incertitude scientifique sont trois informations distinctes.

### 7.2 Indicateurs prévus

| Indicateur | Définition / limite |
|---|---|
| Direction Soleil/Terre | Centre, distance, rayon apparent, azimut et élévation, horodatés. |
| Fenêtres de visibilité terrain | Convention `anyDisk` : états `partial` ou `full` ; convention `fullDisk` : état `full` seulement. Pas de mélange de conventions dans un classement. |
| Durée cumulée | Somme des longueurs des intervalles retenus dans la période. |
| Plus longue interruption | Plus longue coupure **observée dans la fenêtre**, avec marqueur de troncature si elle touche les bornes. |
| Temps avant coucher / Earthset | Différence avec le prochain événement trouvé et défini ; `null` + « hors fenêtre » ou « inconnu » sinon. |
| Recouvrement Soleil/Terre | Intersection temporelle des fenêtres retenues ; indicateur géométrique, pas preuve d'opération simultanée réelle. |
| Fraction du temps | Durée visible / durée analysable ; publier aussi durée demandée, durée analysable et couverture manquante. |
| Relief et qualité | Référence du masque, directions couvertes, hauteur, limites ; pas de note d'atterrissabilité sans modèle dédié. |

Calculs à conserver dans les spécifications : pour une fenêtre `W = [t0, t1)` et des intervalles visibles disjoints `I_k`, `D_visible = Σ longueur(I_k ∩ W)`. Si tout `W` est analysable, `pourcentage = 100 × D_visible / (t1 - t0)`. En cas de données manquantes, fournir une fraction sur la partie analysable clairement nommée et laisser la métrique mission complète inconnue ; ne pas compter les trous comme du temps visible ou masqué.

### 7.3 Conventions des métriques à figer

Attribuer un identifiant à chaque métrique, sa définition, son unité, la convention de disque, les effets inclus et la capacité requise. Distinguer, par exemple, durée où au moins une portion du Soleil est dégagée du terrain (`anyDisk`), durée de disque entier dégagé (`fullDisk`) et durée d'éclairage direct avec occultations. Ne pas les ranger sous un seul champ « sunlight » ambigu.

Les intervalles doivent être ordonnés et disjoints pour une même métrique ; fusionner les portions adjacentes selon la convention publiée, sans combler un trou de données. Les temps avant événement sont calculés par rapport à l'instant sélectionné, pas nécessairement au début du scénario. Une prolongation de recherche au-delà de la fenêtre peut être proposée avec durée maximale déclarée et couverture contrôlée ; elle ne doit pas modifier silencieusement la période analysée.

Prévoir séries et agrégats pour la sensibilité : même site à plusieurs dates, sites voisins à même date, plusieurs hauteurs ou marges. Publier différences avec leurs unités et la liste des seuls paramètres modifiés. La meilleure option selon l'éclairage peut différer de celle selon les coupures Terre ; préserver ces compromis.

## 8. Comparaison et réponse « est-ce que ça fonctionne ? »

### 8.1 Évaluer avant de classer

1. Contrôler entrées, couverture et compatibilité des données.
2. Calculer les métriques nominales et leur qualité.
3. Évaluer chaque contrainte : `pass`, `fail` ou `unknown`, avec valeur, seuil, unité et raison.
4. Produire `nominalStatus` : `fail` si au moins un critère obligatoire échoue ; `unknown` si aucun n'échoue mais au moins un est inconnu ; `pass` seulement si tous les critères obligatoires sont évaluables et respectés. Sans critères définis, publier « non évalué », pas une réussite par défaut.
5. Calculer séparément `prudentStatus` avec les marges mission demandées, en conservant les valeurs nominales. Sans marges définies, statut prudent « non évalué ». Une incertitude inconnue reste affichée même si ce statut passe.
6. Classer les scénarios éligibles selon préférences explicites. Conserver à part ceux en échec ou incomplets et leurs raisons.

**Sens précis de `pass` : critères modélisés respectés avec les données et conventions déclarées.** Cela ne valide pas trajectoire, descente, atterrisseur, énergie complète, thermique, disponibilité réseau ou exploitation de ressources. Le rapport doit garder visibles ces exclusions et le statut de validation du modèle.

### 8.2 Aucune « meilleure solution » sans objectif défini

Sans poids ou ordre de priorité, fournir une comparaison des compromis et éventuellement les options non dominées, sans score global arbitraire. Si un score est demandé, définir normalisation, poids, sens des métriques, données manquantes et règle d'égalité ; archiver ces paramètres. Ne pas convertir `unknown` en zéro ou en bonne note.

Pour chaque option proposée : site, début/fin de surface, contraintes respectées/violées/inconnues, coupures, compromis, nominal/prudent, sources, limites et scénarios effectivement explorés. Un changement de date, hauteur, durée, marge ou préférence produit une nouvelle évaluation traçable.

Une option est « non dominée » si aucune autre option comparable ne fait au moins aussi bien sur tous les critères retenus et strictement mieux sur au moins un. Ne comparer ainsi que métriques de même définition et couverture suffisante ; valeurs manquantes empêchent une conclusion de dominance sur les critères concernés. Si tous les scénarios échouent ou restent inconnus, retourner cette conclusion et les contraintes en cause, sans forcer une recommandation.

Les gardes temporelles doivent préciser leur action : par exemple éroder le début/la fin d'une fenêtre opérationnelle valide, plutôt que déplacer les événements physiques nominaux. Déclarer aussi sens d'une marge angulaire. À marge nulle explicite, prudent et nominal doivent coïncider pour les seules règles concernées ; une marge non renseignée reste distincte de zéro. Si une fenêtre disparaît après marge, conserver la fenêtre nominale et expliquer le rejet prudent.

## 9. Sorties DATA, cache et contrat pour la carte

### 9.1 Arborescence cible, non créée par ce plan

```text
data/
  raw/                            # noyaux/MNT/réponses brutes, hors git
  processed/
    manifests/<datasetVersion>.json
    sites.json
    horizon/<profileId>.json
    scenarios/<scenarioId>/
      manifest.json
      ephemeris.json
      windows.json
      metrics.json
      assessment.json
    comparisons/<comparisonId>.json
    ai/<comparisonId>-evidence.json
docs/
  validation/                     # futurs comptes rendus, pas résultats fictifs
  benchmarks/                     # futurs relevés réels
```

La séparation des fichiers pourra être ajustée selon les tailles mesurées, en conservant leurs identifiants et liens. **Aucun plafond global « moins de 10 Mo » ni « 10–20 Mo pour toutes les données » n'est retenu.** Stockage du moteur, caches, chargement navigateur et contexte LLM ont des besoins différents (§9.6). Les gros fichiers scientifiques restent hors git ; les manifestes permettent de retrouver leurs versions.

### 9.2 Métadonnées obligatoires

| Bloc | Champs à prévoir |
|---|---|
| Identité | `schemaVersion`, `scenarioId`, `datasetVersion`, date de génération, version du moteur et empreinte de configuration. |
| Demande | Site, nature du point/zone, date initiale, durée, hauteurs, contraintes, préférences et marges demandées. |
| Astronomie | Noyaux/empreintes/ordre de chargement, repères, conventions du temps, constantes, corrections et couverture. |
| Terrain | Profil/version, produit LOLA, résolution, rayon, géométrie, hauteur et validité directionnelle. |
| Méthode | Échantillonnage des dates et des événements, convention disque, tolérances numériques et contrôles réalisés. |
| Qualité | Statut de couverture/validation, incertitudes documentées ou non quantifiées, erreurs de convergence et limites du modèle séparées. |
| Provenance | Références, versions, date de récupération (`retrievedAt`) et empreintes des sources. |

Valeur manquante : `null` + raison structurée ; jamais `0`. Zéro signifie une mesure/calcul valide égal à zéro. Aucun exemple numérique de ce plan n'est un résultat scientifique.

### 9.3 Contrat d'échantillons et d'événements

Un échantillon contient `timeUtc`, temps interne et convention, puis pour Soleil/Terre : `azimuthDeg`, `elevationDeg`, `distanceKm`, `angularRadiusDeg`, horizon appliqué, état de visibilité terrain, méthode et qualité. Horizons complémentaires ou fraction du disque : seulement si calculés, sinon `null`. Une sortie `horizonDeg` scalaire doit préciser qu'elle représente le masque au centre, pas nécessairement tout le disque.

Un événement contient corps, type et convention (`anyDisk` ou `fullDisk`, par exemple), temps estimé, intervalle d'encadrement, troncature et état de validation. Les fenêtres et métriques référencent les mêmes conventions et données.

Contrats minimaux à préciser dans le futur schéma :

| Objet | Champs / invariants minimaux |
|---|---|
| `SourceRecord` | Identifiant, organisme, produit/version, URL, dates, empreinte, métadonnées scientifiques, état de récupération et limites. |
| `NormalizedRequest` | Identité de demande ; sites/positions, dates/durée, hauteurs, capacités, contraintes/préférences/marges, options numériques et éventuelles ambiguïtés. |
| `ScenarioManifest` | Références immuables de demande/sources/profil/moteur ; tous les fichiers, tailles et empreintes du lot ; états distincts de calcul/couverture/validation. |
| `SampleSeries` | Instants strictement ordonnés ; pas et origine ou liste explicite des instants ; champs avec unités et conventions ; masques d'invalidité et raisons. |
| `Event` / `Window` | Corps, métrique/convention, début/fin, encadrements, troncatures, portion analysable et lien vers méthode/sources. |
| `Metric` | Identifiant/définition, valeur ou `null`, unité, période/dénominateur, capacité et qualité requises, raisons d'inconnu. |
| `ConstraintAssessment` | Identité de contrainte, opérateur/seuil/unité/origine, valeur nominale/prudente, verdict et preuves ; marges référencées séparément. |
| `Comparison` | Ensemble exploré, exclusions, critères, méthode de classement, résultats/égalités/compromis et liens des scénarios. |
| `EvidencePacket` | Sélection compacte de résultats et contraintes ; provenance, versions, unités, limites, inconnus et références résolubles. |

Écrire les futurs schémas avec types, champs obligatoires/optionnels, enums et règles de compatibilité, sans considérer ces noms proposés comme une interface déjà stable. Les consommateurs doivent refuser une version majeure inconnue au lieu de deviner les champs. En JSON, aucune valeur `NaN`/infinie ; absence et invalidité sont explicites. Pour les séries binaires futures, déclarer boutisme, type numérique, dimensions, ordre des colonnes, temps et masque de validité.

Pour la carte interactive, fournir identifiant, nom, coordonnées et leur type/référentiel, étendue éventuelle d'une zone, identifiants des scénarios, séries temporelles, métriques, raisons du classement, sources et qualité. Si une couche cartographique exige une autre projection, spécifier la transformation et ses métadonnées. Le contrat décrit les données affichables ; aucun fond de carte, composant ou moteur 3D n'est construit ici.

### 9.4 Cache reproductible

La clé doit dépendre des entrées et versions scientifiques/numériques, pas seulement du nom de site : position, hauteur, période, noyaux, profil, corrections, pas, convention disque et version du moteur. Distinguer calcul physique, évaluation des contraintes et explication IA pour pouvoir réutiliser un calcul sans confondre les variantes mission.

**Ne pas écraser silencieusement un ancien résultat.** Nouvelle version ou nouvel identifiant, manifeste immuable, filiation vers la précédente. Garder les scénarios utilisés pour une présentation et les réponses brutes de comparaison. Un simple `retrievedAt` ne suffit pas à reproduire un résultat.

La démonstration doit lire un **lot préparé** dans `data/processed/` sans appel NASA pour ces scénarios. Une demande hors lot sera soit calculée ultérieurement par le moteur local si les sources nécessaires sont présentes, soit déclarée indisponible ; pas de résultat inventé ni de téléchargement scientifique implicite pendant la démo. La première génération du lot exige une préparation distincte, encore à réaliser.

### 9.5 Accès machine et maîtrise du contexte des agents

**Contrat commun prévu pour UI et agents/outils :** sélectionner → filtrer → calculer/agréger → renvoyer un paquet structuré compact. Ce contrat peut d'abord être servi par les fichiers préparés ; une API interne est une évolution future, pas une obligation de réseau pour la démonstration ni une API déjà construite.

| Accès externe | Usage adapté | Ce que reçoit le modèle |
|---|---|---|
| [ODE REST : documentation](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Additional_Resources/ODE_REST_API.htm), [service](https://oderest.rsl.wustl.edu/) | Rechercher des produits PDS, lire leurs métadonnées ; GDS pour des sous-ensembles, notamment LOLA. Les capacités exactes dépendent du produit et de l'endpoint. | Identifiants des produits retenus, métadonnées utiles, couverture et provenance ; pas une archive entière. |
| [Moon Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon) | Tuiles image pour affichage cartographique ; ne remplace pas l'accès au MNT numérique. | Références de couches et limites utiles, pas les tuiles. |
| [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Comparaison ciblée côté serveur, paramètres explicites, cache et appels séquentiels (§3.3). | Résumé des comparaisons, écarts, paramètres et sources ; pas la réponse brute entière. |
| [NAIF : données SPICE](https://naif.jpl.nasa.gov/naif/data.html) | Obtenir ultérieurement les noyaux sélectionnés et les traiter par le moteur local. | Manifeste des noyaux et résultats dérivés ; jamais contenu des noyaux. |

La documentation ODE confirme ces familles de capacités ; la disponibilité opérationnelle de son service et d'un produit donné reste à vérifier avant collecte. Aucun portail unique ni API universelle couvrant tous les besoins n'est confirmé. Ne promettre ni gratuité illimitée ni latence temps réel.

Séparer deux familles de lecture :

- **Statique/métadonnées :** catalogue des sites, produits, couvertures, versions, unités et conventions. Réutiliser par identifiant/version sans répéter tout le catalogue à chaque demande.
- **Séries calculées :** résultats pour les seuls sites, dates, durées et champs demandés. Fournir d'abord agrégats/fenêtres et n'exposer les échantillons détaillés que si nécessaires.

Prévoir sélection spatiale/temporelle, liste des champs, agrégation et pagination ou découpage borné, selon les capacités de chaque source. La réponse interne doit indiquer filtres appliqués, nombre d'éléments total/renvoyé, suite éventuelle et portions indisponibles. Une réponse tronquée ne doit pas passer pour une recherche exhaustive. Limiter les volumes sans cacher les scénarios rejetés ou les données manquantes qui changent la conclusion.

Paquet retourné à l'agent : demande normalisée, sites sélectionnés, indicateurs et unités, critères/raisons, provenance et versions, couverture, incertitudes, limites et marges distinctes. Les références détaillées restent résolubles par identifiant ; un complément ciblé peut être demandé via un outil. UI et agent doivent partager les mêmes résultats et conventions.

**Budget tokens :** le coût de contexte dépend du contenu effectivement renvoyé au modèle, pas du poids des archives sur disque. Ne pas envoyer pages web entières, archives, tuiles ou noyaux au LLM. Les outils lisent/parsent/calculent en dehors du modèle puis sélectionnent les champs utiles. Conserver documents bruts et données scientifiques pour provenance sans les injecter à chaque tour. Aucune économie chiffrée n'est annoncée sans mesure.

Cache ciblé : clés par requête normalisée, paramètres et versions de sources ; réutiliser séparément métadonnées, profils et résultats. Conserver date de récupération et règle explicite de fraîcheur, notamment pour les statuts de missions ; invalidation traçable et aucun écrasement silencieux (§9.4).

### 9.6 Quatre budgets de volume distincts

Dans cette section, **1 Mo = 1 000 000 octets**. Les calculs ci-dessous sont des estimations de structure ou des informations d'en-tête, pas des mesures de résultats NASA ni de performances du futur système.

| Budget | Ce qu'il contient | Règle de conception |
|---|---|---|
| A. Stockage scientifique du moteur | Noyaux, MNT/tuiles, métadonnées, logiciels et éventuels fichiers temporaires. | Adapter aux sources et à l'emprise nécessaires ; ne pas le confondre avec téléchargement navigateur. |
| B. Résultats et cache conservés | Profils, séries, événements, métriques, variantes mission, manifestes et versions publiées. | Dédupliquer les artefacts identiques, conserver les versions utiles à la reproduction et budgéter la croissance. |
| C. Chargement navigateur | Catalogue compact, scénarios/agrégats sélectionnés, niveaux de détail et tuiles affichées. | Chargement ciblé, temporel/spatial et progressif ; pas de noyaux scientifiques embarqués par défaut. |
| D. Contexte LLM | Demande et paquet de preuves effectivement retournés par les outils. | Taille pilotée par sélection des champs, agrégats et besoin de raisonnement ; pas par poids total des archives. |

**A — Noyaux scientifiques.** En-têtes `Content-Length` contrôlés par requêtes HTTP HEAD le **14 novembre 2026**, sans téléchargement des corps binaires :

| Fichier | Taille annoncée en octets | Taille décimale |
|---|---:|---:|
| `de440.bsp` — [répertoire NAIF SPK](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/) | 119 799 808 | 119,799808 Mo |
| `moon_pa_de440_200625.bpc` — [répertoire NAIF PCK](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/) | 12 863 488 | 12,863488 Mo |
| **Somme de ces deux fichiers seulement** | **132 663 296** | **132,663296 Mo** |

Calcul : `119 799 808 + 12 863 488 = 132 663 296 octets`. Ce total exclut FK, autres constantes/LSK, éventuelle orientation terrestre pour stations, logiciel, MNT et temporaires. Taille annoncée ≠ empreinte de contenu ; contrôler l'intégrité lors d'une future acquisition. La taille terrain reste **inconnue** avant choix du produit, de l'emprise, de la résolution, des marges autour des sites et de la stratégie de conservation. Aucune borne arbitraire n'est donnée.

**B — Compte de base des séries.** Pour 30 jours de 24 h, un pas de 10 min, grille régulière avec les deux bornes incluses et 10 sites :

- Intervalles par site : `30 × 24 × 60 / 10 = 4 320`.
- Échantillons par site : `4 320 + 1 = 4 321`.
- Total : `4 321 × 10 = 43 210 échantillons`.

Raffinement d'événements, instants supplémentaires, distances, rayons, qualité, conventions, métadonnées et versions **exclus** de ce compte minimal. Une recherche sur plusieurs dates et hauteurs peut accroître le volume, avec réutilisation des instants/profils réellement identiques.

| Représentation illustrative | Calcul brut | Taille hors métadonnées | Limite de comparaison |
|---|---|---:|---|
| 4 angles float64 + horodatage 64 bits | `(4 × 8 + 8) = 40 octets/échantillon` ; `43 210 × 40` | 1 728 400 octets = **1,7284 Mo** | Seulement azimut/élévation Soleil/Terre et temps ; pas le contrat scientifique complet. |
| 4 angles float32, temps implicite | `4 × 4 = 16 octets/échantillon` ; `43 210 × 16` | 691 360 octets = **0,69136 Mo** | Précision et temps régulier à vérifier ; sortie plus pauvre, comparaison sans égalité de fonctionnalités. |
| Profil de 360 élévations float32 | `360 × 4` | **1 440 octets/site** | Azimuts supposés implicites ; métadonnées, distances, validité et profils de hauteurs distinctes exclus. |

Le temps implicite exige origine/pas/nombre déclarés. Il ne représente pas à lui seul les instants irréguliers du raffinement : prévoir une série d'événements ou des horodatages supplémentaires. Ne pas passer en float32 sans mesurer l'écart sur les angles, dégagements et temps d'événements, notamment rasants. Les calculs scientifiques et le format d'affichage peuvent garder des précisions différentes si la conversion est contrôlée et traçable.

**Repère JSON synthétique communiqué pendant le cadrage.** Un essai antérieur a répété un même échantillon de l'ancien schéma (`timeUtc`, Soleil/Terre avec `azimuthDeg`, `elevationDeg`, `horizonDeg`, `visible`, puis `horizonModel`) : environ **250 octets par objet JSON compact** ; pour 43 210 objets, taille rapportée de **10 845 720 octets = 10,84572 Mo**, séparateurs et enveloppe inclus. Avec indentation, taille rapportée de **15 339 570 octets = 15,33957 Mo**. Vérification d'ordre de grandeur : `43 210 × 250 = 10 802 500 octets` avant séparateurs/enveloppe.

Cet essai est **synthétique**, non rejoué dans cette mise à jour, sans données NASA : échantillon répété, chiffres et champs fixes. Il ne mesure ni le fichier futur, ni un taux de compression, ni la mémoire nécessaire après lecture. L'ancien booléen `visible` n'est pas réintroduit comme convention scientifique recommandée (§6.2). La longueur réelle dépendra des champs, des décimales, des instants et de la structure définitive.

À durée presque multipliée par douze, compte d'échantillons presque multiplié par douze : `365 / 30 ≈ 12,17`, à pas constant, hors effet des bornes et des événements. Cela concerne une **année entière calculée**, pas la distance entre aujourd'hui et une fenêtre future de 30 jours.

**C — Transport et mémoire navigateur.** Commencer par JSON pour inspection/debug et contrats lisibles, transmettre les seuls résultats demandés, puis mesurer taille sérialisée, taille transportée compressée, temps de lecture et mémoire après parsing. Activer une compression de transport adaptée lors de la future livraison ; aucune promesse de ratio. Envisager un format binaire/colonnaire seulement si ces mesures justifient sa complexité, avec précision et fonctionnalités équivalentes ou écarts explicitement décrits. Les noyaux/MNT du serveur ne doivent pas gonfler automatiquement ce budget.

**D — Agents et LLM.** Un agent peut orchestrer des outils contrôlés, filtrés et bornés ; il n'a pas besoin de naviguer à l'improviste sur les portails ni d'ouvrir les archives. La taille du paquet de preuves et le nombre de tours/outils déterminent le contenu transmis au modèle. Mesurer ces volumes séparément des octets scientifiques. Une requête n'est pas nécessairement lente : coût et latence dépendent de la sélection, du cache, du calcul et du fournisseur ; mesurer chaque étape avant de les qualifier.

### 9.7 Contrats de données pour graphiques et animation

| Consommateur | Données minimales à fournir | Règles de fidélité |
|---|---|---|
| Courbes azimut/élévation | Instants, directions, horizon associé et qualité ; angles et temps dans conventions publiées. | Gérer discontinuité 359°/0° ; pas d'interpolation d'un trou de données comme si la série était continue. |
| Frise des fenêtres | Intervalles/événements exacts retenus par le calcul, conventions, bornes tronquées et inconnus. | Ne pas recalculer les verdicts depuis une courbe réduite pour affichage. |
| Comparaison de scénarios | Mêmes métriques/unités, dates/durée/hauteurs et raisons de classement. | Permettre lecture des différences de paramètres et des limites. |
| Carte 2D | Point/zone, repère/projection, emprise, produits de fond et scénario associé. | Une tuile colorée d'altitude n'est pas le MNT numérique de calcul. |
| Vue 3D / direction dans le ciel | Position de l'observateur, repère local, directions ou vecteurs unitaires, temps et références du relief affiché. | Déclarer exagération verticale éventuelle côté rendu ; résultats issus du modèle scientifique, pas de la scène graphique. |
| Animation | Sous-ensemble temporel régulier ou interpolable, vitesse de lecture indépendante du temps physique, événements référencés. | Distinguer interpolation visuelle et recherche d'événements ; qualité dégradée visible. |

Une série allégée pour affichage peut supprimer des points redondants selon une méthode à mesurer, mais doit préserver événements et extrema pertinents ou fournir leurs références séparées. Ne jamais utiliser ce sous-ensemble simplifié pour recalculer les durées, les coupures ou les critères mission. Publier intervalle demandé et résolution effectivement servie ; laisser le consommateur demander un détail ciblé.

## 10. IA : expliquer une preuve calculée

Le moteur remet à l'IA un dossier compact : demande, scénarios évalués, métriques avec unités, contraintes et résultats, règles de classement, comparaison historique sourcée, provenance, limites et données manquantes. Éviter les données brutes massives et tout apprentissage supposé sur des pétaoctets.

Rôle autorisé dans le plan : reformuler le besoin, regrouper les résultats, présenter les compromis et expliquer les options en citant les identifiants des preuves. Rôle exclu : calculer la physique, créer une coordonnée, inventer un seuil/poids, compléter une mesure manquante ou déclarer un succès mission.

L'IA peut **orchestrer des outils contrôlés** : rechercher un site dans le catalogue, demander un scénario, lire un état de traitement, récupérer métriques/fenêtres et compléter une preuve ciblée. Chaque outil valide ses entrées, limites, capacités et versions ; le moteur renvoie les valeurs. La formulation libre de l'IA n'élargit pas automatiquement le périmètre scientifique ni le volume de la recherche. Une ambiguïté sur départ/arrivée, durée ou contrainte déclenche une précision explicite, sans valeur déduite par invention.

Conserver demande normalisée, identifiants des appels/résultats, version du modèle et du gabarit d'explication pour vérifier une réponse publiée. Comparer les affirmations de l'explication aux preuves structurées : nombre, unité, période, convention, statut et source. Si une explication contredit les résultats, la rejeter ou la signaler ; afficher la comparaison déterministe demeure possible. Ne pas traiter du texte récupéré dans une source comme une instruction permettant de modifier les paramètres de calcul.

Les anciennes missions apportent contexte et points de comparaison seulement si position, date et sources sont connues. Leur succès ne prouve pas l'adéquation d'un autre site ou matériel. Toute phrase chiffrée générée doit pouvoir être reliée à un champ calculé ou une source. En cas de manque : « Je ne peux pas le confirmer », avec le champ ou contrôle nécessaire. Un échec de l'IA ne doit pas empêcher de lire les résultats déterministes.

### 10.1 Fournisseur décidé : OpenRouter

**Décision utilisateur : OpenRouter pour la couche IA. Le modèle précis n'est pas choisi.** Aucune clé, configuration réelle, installation ou requête d'inférence n'est créée par ce plan. Aucun prix, niveau de qualité ou temps de réponse d'un modèle n'est présumé.

Le [contrat officiel OpenRouter](https://openrouter.ai/docs/api_reference/overview) documente notamment Chat Completions et Responses. **Proposition initiale de transport à valider lors de la réalisation :** requête HTTP serveur vers `https://openrouter.ai/api/v1/chat/completions`, avec modèle explicitement configuré ; Responses reste une autre possibilité documentée, sans mélange des champs des deux API. L'[authentification montrée dans le guide officiel](https://openrouter.ai/docs/quickstart) utilise un jeton Bearer.

Architecture prévue : UI/agent → service DATA contrôlé → paquet compact → appel OpenRouter côté serveur → validation → explication liée aux résultats. **La clé reste exclusivement dans la configuration secrète du serveur**, jamais dans le navigateur, les fichiers de démonstration, le dépôt ou les journaux de provenance. Conserver une référence de configuration, pas sa valeur secrète. Les données scientifiques déjà préparées restent lisibles si l'appel IA est absent.

| Configuration à décider | Exigence du plan |
|---|---|
| Modèle | Identifiant explicite ; choisir après examen des capacités utiles et vérification sur le dossier de preuves. Aucun modèle arbitraire attribué à l'utilisateur. |
| Modèle/version effective | Archiver identifiant demandé et celui retourné, version identifiable si fournie, date, paramètres et identifiant de génération. Si une version exacte n'est pas disponible, l'indiquer ; pas de promesse de reproductibilité textuelle à l'identique. |
| Routage/fournisseurs | Définir politique autorisée, éventuels fournisseurs ciblés et fallbacks ; enregistrer ce qui est effectivement observable dans la réponse, sinon « non renseigné ». |
| Budgets | Plafonds d'entrée/sortie, nombre de tours et appels outils, budget de dépense et limites de concurrence configurables. Réserver place aux instructions, schéma, preuves et sortie ; ne pas tronquer les limites décisives pour faire rentrer la demande. |
| Paramètres de génération | Déclarer ceux utilisés et vérifier leur support. Aucun paramètre ni température ne garantit vérité ou déterminisme. |
| Délai/erreurs | Timeout et reprises bornées ; état explicite en cas d'échec, sortie tronquée, limite de crédit, refus ou schéma invalide. |
| Cache d'explications | Clé incluant paquet de preuves, modèle/configuration et version du gabarit ; ne pas réutiliser une ancienne explication pour de nouveaux chiffres. |

Les [sorties structurées](https://openrouter.ai/docs/guides/features/structured-outputs) dépendent du modèle **et de l'endpoint fournisseur**. Si un schéma JSON est retenu, vérifier le support puis demander les paramètres appropriés ; `provider.require_parameters` est une option documentée pour filtrer les endpoints compatibles. Cela ne remplace pas une validation locale de la structure et de la fidélité des valeurs. Si le support requis manque, refuser ce mode ou choisir explicitement un mode de repli contrôlé ; ne pas supposer JSON strict universel.

Les [appels d'outils](https://openrouter.ai/docs/guides/features/tool-calling) sont disponibles pour des modèles compatibles. Le modèle propose des appels ; notre service vérifie/exécute les seuls outils autorisés, puis renvoie leurs résultats compacts. Aucun accès automatique aux fichiers bruts, shell ou portails scientifiques n'est nécessaire. Une explication seule peut fonctionner sans outils si son paquet de preuves est complet.

Le [routage fournisseur](https://openrouter.ai/docs/guides/routing/provider-selection) peut varier et possède des réglages de fallback. Distinguer fallback entre fournisseurs et changement de modèle. Choisir et consigner ces politiques avant utilisation ; pas de routage supposé immuable, ni de changement silencieux de capacité/budget. Une réponse provenant d'un fallback subit les mêmes contrôles.

### 10.2 Contrôle de l'explication et fonctionnement dégradé

La sortie explicative proposée contient : résumé du besoin, options et compromis, critères respectés/échoués/inconnus, citations par identifiant de preuve et limites. Les champs chiffrés doivent pointer vers les métriques déterministes ; la présentation des nombres peut être rendue directement par le service pour éviter leur réécriture inutile.

Après réponse : vérifier fin normale/absence de troncature, type et schéma, références existantes, nombres/unités/périodes, statuts et cohérence des conclusions. Un JSON conforme peut encore être faux : le contrôle sémantique reste nécessaire. Une réponse « garanti », un seuil inventé ou une source absente ne doit pas être publiée comme explication validée.

Sur timeout, indisponibilité, dépassement de budget ou validation échouée : garder visibles tableaux/fenêtres/métriques déterministes ; publier `explanationStatus: unavailable` ou `invalid` et raison. Une reprise éventuelle reste bornée, avec coûts observables lorsqu'ils sont disponibles. Ne jamais bloquer ni altérer les résultats physiques pour faire réussir une génération.

## 11. Intention givre/glace : besoin futur, aucune promesse de ressource

Lecture de la photo : « Exploiter frost ». Traduction provisoire : explorer du givre/de la glace supposé, **à confirmer avec l'équipe**. Ce plan ne contient aucune donnée démontrant présence, quantité, accessibilité ou exploitabilité au site choisi.

Pour pouvoir intégrer ce besoin au classement, il faudra une source spécifique avec instrument/méthode, produit, date/version, repère, couverture, résolution, incertitude, grandeur réellement observée et limites d'interprétation. Une carte de probabilité, un indice indirect et une détection locale ne sont pas des réserves extractibles interchangeables.

**L'ombre permanente seule ne prouve ni présence de glace, ni quantité, ni exploitabilité.** Une absence de Soleil sur une simulation de 30 jours ne démontre pas non plus une ombre permanente. Les calculs d'éclairage/visibilité permettent d'étudier certains compromis autour d'une cible de ressources ; ils ne remplacent ni observation de ressources ni étude d'extraction. Si une ressource confirmée est un critère bloquant sans source adéquate, l'évaluation retourne `unknown`.

## 12. Incertitudes : quatre couches à garder séparées

| Couche | Traitement prévu | Ce qu'il faut éviter |
|---|---|---|
| Scientifique / source | Précision documentée pour le produit et l'époque ; référence exacte. À défaut : « non quantifiée ». | Déduire une erreur nulle du nombre de décimales, ou appliquer une borne non pertinente. |
| Numérique | Mesurer sensibilité aux pas, interpolation, discrétisation disque et tolérances ; conserver écarts observés. | Appeler un raffinement à 1 min une précision physique ±1 min. |
| Modèle | Déclarer relief/rayon limité, géométrie simplifiée, occultations absentes, puissance et station non modélisées. | Transformer absence de modèle en réussite. |
| Marge mission | Paramètres utilisateur distincts ; recalcul prudent traçable, nominal inchangé. | Prétendre qu'une garde compense une incertitude inconnue. |

Résolution spatiale ≠ précision d'altitude ; erreur angulaire ≠ erreur temporelle constante, surtout lors d'une tangence. Ne pas additionner arbitrairement des erreurs de nature différente, ni publier intervalle de confiance ou pourcentage de fiabilité sans fondement. Une estimation globale n'est possible qu'avec une méthode documentée ; sinon les composantes restent séparées et les inconnues visibles.

**Performance informatique séparée :** latence, mémoire et variabilité du benchmark ne mesurent aucune erreur physique.

### 12.1 Registre d'incertitudes par résultat

Pour chaque composante, prévoir `quantity`, `unit`, `scope` (site/produit/période), méthode/source, valeur ou intervalle documenté si disponible, nature de la borne, hypothèses, date/version et état `documented`, `observed_numerically` ou `unquantified`. Un écart entre deux calculs est une observation, pas automatiquement une borne d'erreur par rapport à la réalité.

Si une propagation est proposée, documenter dépendances/corrélations et hypothèses avant de combiner des termes. Une étude de sensibilité aux positions, hauteurs ou altitudes peut montrer des changements de résultat pour des variations déclarées ; sans distribution d'entrée justifiée, elle ne produit pas une probabilité de succès. Les inconnus restants doivent apparaître dans le paquet UI/IA, pas seulement dans un document annexe.

Avant utilisation d'un verdict prudent, vérifier ce qu'il couvre exactement : garde utilisateur, enveloppe scientifique documentée ou simple essai de sensibilité. Les trois ne sont pas interchangeables. Un critère très proche d'un seuil avec erreur non bornée doit être signalé comme fragile, même si la valeur nominale passe.

## 13. Ordre futur de réalisation et responsabilités

Toutes les tâches ci-dessous sont **à réaliser après ce plan**, sans installation ou exécution autorisée implicitement par ce document. Responsables humains : à attribuer.

| Étape | Travail DATA | Livrable / condition de passage |
|---|---|---|
| 1. Contrats | Figer dates, types de mission, unités, inconnus, classement et accès machine commun UI/agents (§9.5). | Schéma versionné, champs/filtres/volumes et décisions ouvertes explicites. |
| 2. Sources | Choisir noyaux compatibles et produit LOLA, relever versions/couvertures/référentiels. | Manifeste de sources ; aucune promesse de précision globale. |
| 3. Sites | Constituer et vérifier le catalogue initial. | Coordonnées avec deux références, nature point/zone et altitude explicites. |
| 4. Astronomie | Préparer la chaîne locale ; charger les noyaux une fois ; contrôler directions et temps. | Comparaisons astronomiques documentées et divergences expliquées. |
| 5. Terrain | Préparer un premier site et chaque hauteur nécessaire, puis élargir. | Profil avec couverture, convergence et limites. |
| 6. Événements | Construire fenêtres, tangences et métriques. | Cas contrôlés et sensibilité numérique documentés. |
| 7. Comparaison | Appliquer contraintes puis préférences, produire nominal/prudent. | Résultats justifiables et inconnus conservés. |
| 8. Livraison | Construire lot reproductible et dossier de preuves IA. | Fichiers consommables, démo du lot sans réseau NASA. |
| 9. Mesures | Réaliser le benchmark prévu au §14 après contrôle de justesse. | Relevés réels, protocole et limites ; aucune performance annoncée avant. |

Les anciens noms `01_sites.py`, `02_ephemeris.py`, `03_horizon.py` restent des possibilités d'organisation future, pas des scripts existants. Si retenu, le deuxième pilote désormais SPICE, avec comparaison Horizons séparée. Langage, bibliothèque d'accès à CSPICE et découpage exact restent à choisir ; aucune dépendance n'est installée par ce plan.

### 13.1 Découpage de responsabilités techniques

Ces blocs désignent des responsabilités à attribuer, pas des personnes déjà désignées ni des services à déployer séparément.

| Bloc | Reçoit | Produit | Contrôle sous sa responsabilité |
|---|---|---|---|
| Catalogue et sources | Références de missions, catalogues de produits | Sites, inventaire et manifeste des sources | Statuts datés, repères, intégrité, acquisition et erreurs de format. |
| Référentiels et temps | Sites, noyaux, conventions | Positions/époques normalisées et domaine calculable | Conversions, compatibilité, ordre des noyaux et périodes réellement couvertes. |
| Terrain | MNT et observateurs | Profils d'horizon et qualité directionnelle | Projection, courbure, hauteurs, couverture et convergence. |
| Géométrie/événements | Sources normalisées, profils et demande | Séries, états, événements et fenêtres | Corps/corrections, disques, occultations, tangences et données manquantes. |
| Critères/comparaison | Métriques et paramètres mission | Verdicts nominal/prudent et compromis | Absence de poids arbitraires, inconnus, cohérence des périodes. |
| Livraison/cache | Artefacts et manifestes | Lot fichiers, index et contrat d'accès commun | Atomicité, identité, volumes, liens, compatibilité et reproduction. |
| IA OpenRouter | Paquet de preuves et configuration décidée | Explication vérifiée ou état d'indisponibilité | Budgets, capacités, secret serveur, fidélité et provenance. |
| Vérification | Cas de référence et résultats | Rapports de validation et benchmark séparés | Critères fixés avant essai, écarts et limites réelles. |

### 13.2 Première chaîne vérifiée, puis généralisation

**Lot 1 — Contrats et inventaire.** Définir les schémas du §9.3, les conventions de date/temps/angles, le sens des états et les capacités demandées. Remplir le registre du §16 avec décision, justification, propriétaire et preuve attendue. Établir un inventaire distinguant sources nécessaires, disponibles, manquantes et à vérifier. Sortie attendue : aucune ambiguïté bloquante masquée dans un champ par défaut.

**Lot 2 — Un site contrôlable.** Choisir un site réel aux coordonnées vérifiables, une période couverte et les hauteurs nécessaires, sans encore promettre un catalogue complet. Préparer les références astronomiques et terrain de ce cas, puis comparer les conversions et directions. Sortie attendue : preuve que la même position et le même temps sont effectivement utilisés par les deux chaînes, avec écarts expliqués.

**Lot 3 — Horizon et événements difficiles.** Construire le profil du site avec qualité directionnelle, puis tester disque partiel/complet, tangence, masque variable et trous de couverture. Introduire les occultations si l'éclairage direct fait partie des critères. Sortie attendue : fenêtres/agrégats et encadrements traçables, contrôles de convergence, risques de non-détection exposés.

**Lot 4 — Plusieurs dates/sites.** Étendre au catalogue réellement vérifié, réutiliser profils et instants compatibles, explorer les dates puis appliquer contraintes/préférences. Tester report de calendrier, durée ou hauteur modifiée. Sortie attendue : comparaison cohérente, aucun scénario inconnu promu comme meilleur par défaut, et résultat limité à la recherche effectuée.

**Lot 5 — Livraison aux consommateurs.** Produire lots immuables, index de scénarios et paquet compact ; faire valider champs/unités/conventions par les responsables UI et IA. Vérifier chargement sans réseau NASA, lecture d'une version précédente et détails à la demande. Sortie attendue : même preuve scientifique dans carte, tableaux, graphiques et outil d'agent.

**Lot 6 — Explication OpenRouter.** Choisir modèle et politiques de routage/budget ; vérifier capacités utiles selon documentation en vigueur. Tester d'abord le contrat et les erreurs avec réponses contrôlées, puis évaluer une explication sur les preuves déterministes lorsque cette intégration sera réalisée. Sortie attendue : contrôles de structure/fidélité et mode sans IA fonctionnel. Aucun appel payant n'est lancé par le présent plan.

**Lot 7 — Validation et mesures.** Compléter la matrice du §15 pour les capacités effectivement publiées, puis réaliser le protocole §14. Sortie attendue : rapport distinguant cas réussis, échoués, non testés et hors domaine, plus mesures de volume/latence/mémoire séparées. Un résultat de démo ne devient pas un domaine mission validé par simple publication.

Les extensions stations, énergie, ressources, relais ou mobilité suivent les mêmes lots pour leurs nouvelles dépendances. Elles ne peuvent hériter sans examen des tolérances et couvertures du calcul géométrique initial.

### 13.3 Conditions de remise du futur travail DATA

Remettre ensemble : contrats et décisions, inventaire des sources, catalogue sourcé, manifestes/artefacts publiés, configuration reproductible du moteur, matrice de capacités/couverture/validation, rapport de contrôles, protocole et résultats réels de benchmark, limites encore ouvertes et instructions de régénération. Les instructions doivent permettre de choisir un scénario, vérifier ses sources puis retrouver fenêtres/métriques sans solliciter le LLM.

**Arrêt de publication d'un verdict physique** si données déterminantes incompatibles, provenance absente, période hors couverture ou contrôle scientifique en échec. Une sortie pédagogique partielle reste possible si identifiée comme telle et si les métriques non évaluables restent inconnues. Aucun succès documentaire ou benchmark rapide ne contourne cette règle.

## 14. Benchmark : protocole prévu uniquement

**Aucun benchmark exécuté dans cette mise à jour. Aucun temps ou débit mesuré disponible.**

Matrice à préparer :

| Axe | Cas prévus |
|---|---|
| Sites | 1 puis 15 sites réellement vérifiés ; si le catalogue en contient moins, déclarer le nombre disponible, sans dupliquer artificiellement des sites. |
| Période par scénario | 2 jours et 30 jours terrestres. |
| Date initiale | Dates proches et lointaines à l'intérieur de la couverture ; documenter leurs statuts de validation. |
| Processus | Froid : démarrage/chargement des noyaux inclus ; chaud : noyaux déjà chargés. |
| Terrain | Première préparation puis profil déjà présent, mesurés séparément. |
| Cache résultat | Absent puis présent, avec contrôle que la même configuration est demandée. |
| Cas numériques | Conditions simples et rasantes/fragmentées ; les difficultés de détection peuvent changer la charge. |

Mesurer séparément démarrage/chargement des noyaux, préparation terrain, astronomie, recherche d'événements, agrégation/classement, sérialisation/lecture cache et IA. L'IA a son propre temps, fournisseur/modèle et statut ; ne pas inclure sa variabilité dans une précision astronomique. Si un téléchargement est nécessaire lors d'une future préparation, mesurer son coût à part du calcul local.

Consigner machine, système, versions, configuration, sources, parallélisme, nombre de scénarios/date et répétitions. Rapporter durées, mémoire de pointe et variabilité observée ; préciser si le cache disque du système est contrôlé. Répéter suffisamment pour décrire les observations sans inventer de confiance statistique.

Comparer seulement des cas de qualité équivalente : mêmes dates/sites, relief, hauteurs, conventions, corrections, pas et critères d'arrêt. Une exécution plus rapide qui rate des événements n'est pas une accélération validée. Vérifier justesse avant toute annonce ; ne pas extrapoler le temps d'un site à quinze comme une mesure réelle.

### 14.1 Procédure future de mesure

1. Figer machine, versions, scénarios, critères numériques/scientifiques et nombre de répétitions avant le relevé ; préparer la matrice sans utiliser des coordonnées fictives comme des cas réels.
2. Contrôler les résultats de référence, puis exécuter démarrage froid, moteur chaud et lecture cache en distinguant préparation terrain et calcul astronomique.
3. Chronométrer séparément durée bout en bout et phases ; si elles se chevauchent, ne pas additionner leurs temps comme une durée séquentielle réelle. Consigner échecs et reprises, pas seulement les meilleures exécutions.
4. Relever mémoire de pointe, échantillons réellement évalués, nombre d'événements, qualité de sortie et volumes des quatre budgets §9.6. Tester séparément JSON compact, transport compressé et éventuel binaire à contenu comparable.
5. Mesurer l'IA OpenRouter à part : modèle demandé/effectif, routage observable, paquet d'entrée, tokens d'entrée/sortie rapportés, statut, durée et coût observé lorsqu'il est fourni. Les cas sans appel IA restent comparables sur le seul moteur physique.
6. Publier relevés individuels et synthèse (par exemple médiane et étendue observées) avec nombre de répétitions, conditions et inconnus. Aucun percentile robuste, ratio de compression ou gain global n'est affirmé sans données suffisantes.

### 14.2 Fiche minimale d'un relevé

Prévoir : identifiant/date du relevé, machine/système, moteur/configuration/sources, scénario et capacités, sites uniques/hauteurs/dates/durée, nombre d'échantillons prévu/réel, état froid/chaud/cache, état terrain, timings par phase et bout en bout, mémoire, octets scientifiques/cache/transport, données UI et paquet IA, modèle/routage/tokens si IA, erreurs/reprises, contrôle de justesse et limites. Les unités doivent accompagner les colonnes.

Ne pas confondre capacité de calcul de fenêtres distantes et coût de calcul d'une longue série. Le cas « 30 jours dans dix ans » et le cas « dix ans complets » doivent porter des intitulés différents. Si une dépendance station ou temporelle n'est pas couverte à une date lointaine, le relevé doit mesurer un rejet explicite, pas un calcul présenté comme validé.

## 15. Vérification future et critères d'acceptation

- **Contrats :** unités, signes d'azimut, UTC/temps interne, valeurs absentes, point/zone, départ/arrivée et durée distincts.
- **Astronomie :** comparer deux ou trois sites/époques sourcés avec Horizons ; inclure un cas historique et un cas polaire si disponibles. Identifier source commune et différences de corrections. Tolérances à motiver, jamais choisies après coup pour cacher un écart.
- **Référentiels :** vérifier transformation site ↔ terrain ↔ observateur et référence d'altitude. Incompatibilité non résolue = blocage du critère concerné.
- **Terrain :** couverture partielle, bord de MNT, obstacle éloigné, variation avec hauteur, raffinement azimutal/spatial et rayon d'analyse. Sans terrain valide, aucun verdict local polaire complet.
- **Disques/événements :** centre sous horizon avec bord visible, disque partiel, disque entier, tangence, événement bref entre deux pas, franchissement d'azimut 359°/0°, visibilité continue et absence de visibilité.
- **Fenêtres :** périodes tronquées, événements hors fenêtre et trous de données ; somme et dénominateur vérifiés. Comparer avec un pas plus fin, rapporter écarts et limites de détection.
- **Contraintes :** nominal inchangé après modification de marge ; critères inconnus propagés ; aucun `pass` global sans critères définis ; aucun classement unique sans préférence explicite.
- **Ressources :** exigence glace sans donnée adéquate = inconnue, jamais validée par la seule ombre.
- **Cache/livraison :** changement de source/hauteur/méthode produit une nouvelle identité ; ancien scénario reproductible ; lot préparé lisible sans appel NASA.
- **Accès agents :** filtre/pagination explicites, distinction statique/séries ; paquet compact avec unités et provenance ; aucun noyau, archive, page entière ou tuile injecté au LLM. Vérifier qu'un résumé préserve inconnus et raisons d'exclusion.
- **IA :** nombres et conclusions reliés aux preuves ; aucun résultat physique inventé ; résultats déterministes accessibles si génération indisponible.
- **Performances :** protocole et relevés distincts de la validation scientifique ; aucune latence cible présentée comme mesure.

Ces contrôles décrivent les vérifications attendues, pas des tests déjà passés.

### 15.1 Matrice de tests à préparer

Les cas synthétiques ci-dessous servent à isoler une propriété mathématique ou de contrat ; ils ne deviennent pas des observations NASA. Les cas réels doivent conserver leurs sources et leur domaine de validité.

| Famille | Cas à prévoir | Preuve attendue avant activation |
|---|---|---|
| Entrées/temps | Dates inversées, durée nulle, unité absente, départ sans arrivée, temps futur/convention UTC, borne exacte de couverture. | Refus ou précision ciblée ; aucune conversion ambiguë ; périodes et raisons conservées. |
| Géométrie/repères | Axes contrôlés, latitudes proches du pôle, pôle exact, longitudes équivalentes, conversion aller/retour documentée. | Sens d'azimut et zénith vérifiés ; convention polaire explicite ; écarts attribués aux conversions. |
| Référence astronomique | Cas sourcés comparés à Horizons avec paramètres alignés ; corrections et sources communes recensées. | Écarts par angle/date et explication ; pas de validation indépendante prétendue si source commune. |
| Terrain/horizon | Forme sans relief, obstacle synthétique, crête étroite/lointaine, trou/bord de tuile, unités/NoData incorrects, plusieurs hauteurs. | Obstacles attendus détectés ; cas incomplets marqués ; variation de rayon/pas documentée. |
| Disques | Centre masqué/bord visible, disque complet, contact exact, masque différent aux deux bords, Soleil/Terre de tailles variables. | États correctement distingués selon convention ; scalaire au centre non confondu avec masque du disque. |
| Événements/convergence | Double transition entre deux pas, tangence sans changement de signe, fenêtre très brève, visibilité continue, bornes tronquées. | Détection/limites exposées ; encadrements et raffinement comparés à une résolution plus fine. |
| Éclipses | Soleil dégagé du terrain mais occulté, occultation partielle/combinée au terrain ; observateur site vs centre lunaire. | Chaîne depuis le site vérifiée ; états terrain/occultation séparés puis combinaison justifiée. |
| Stations, si activées | Terre partiellement visible sans station accessible, station sous son masque, orientation terrestre hors couverture, disponibilité inconnue. | Accès géométrique, disponibilité et bilan radio séparés ; aucune garantie déduite de la Terre visible. |
| Fenêtres/métriques | Intervalles contigus, dernier échantillon, absence d'événement, trou de données et dénominateur partiel. | Pas de double comptage, bornes/durée analysable explicites et inconnus propagés. |
| Contraintes/classement | Aucun seuil, tous scénarios rejetés, valeur inconnue, égalité, conflit éclairage/Terre, marge nulle et marge supprimant une fenêtre. | Verdicts et compromis conformes ; pas de poids inventés ; nominal immuable. |
| Cache/reproduction | Même requête normalisée, source/hauteur/temps/méthode changés, cache interrompu/corrompu, ancienne version publiée. | Réutilisation seulement compatible ; invalidation/version explicites ; aucun lot partiel annoncé complet. |
| API/acquisition | 429/503, timeout, 404/403, réponse vide, changement de version/colonnes, produit incomplet, pagination. | Reprises bornées adaptées ; états/réponses conservés ; aucune boucle ou donnée de remplacement. |
| Livraison/graphique | Série allégée vs série scientifique, unités/projections, angles 359°/0°, schéma majeur inconnu, lecture du lot hors réseau. | Fenêtres et verdicts identiques ; détail récupérable ; pas de confusion interpolation/calcul. |
| IA OpenRouter | Modèle sans capacité requise, fallback, JSON invalide/conforme mais faux, nombres/unités altérés, source absente, budget/timeout. | Réponse rejetée ou indisponible si nécessaire ; preuves et résultats physiques toujours accessibles. |
| Ressources | Ombre sur 30 jours, région sans observation de glace, résolution insuffisante pour point demandé. | Aucune « réserve exploitable » inventée ; critère inconnu si preuve inadéquate. |
| Volume/précision | JSON enrichi réel, compression, float32 vs float64, temps implicite face aux événements irréguliers. | Comparaison à fonctionnalités égales ou pertes explicites ; précision mesurée avant changement de format. |

### 15.2 Rapport de validation et domaine utilisable

Chaque contrôle produit cas, entrées, versions, résultat attendu et sa source, résultat obtenu, écart/unité, tolérance et justification, statut `pass`/`fail`/`not_tested`, limites et artefacts liés. Une tolérance sans justification reste ouverte. Un cas contrôlé ne valide pas automatiquement tous sites, périodes, hauteurs et niveaux de calcul.

Publier une matrice du domaine réellement vérifié : régions/sites, plages de dates, durées, hauteurs, résolutions, méthodes et capacités. Une demande peut être couverte mathématiquement tout en restant **non validée dans ce domaine** ; afficher les deux états. Si aucun résultat réel n'a été produit, la matrice est vide/non testée, sans taux de réussite inventé.

Les tests de robustesse API et d'IA peuvent commencer par réponses contrôlées pour éviter de dépendre du réseau ; les comparaisons scientifiques réelles restent distinctes. Les relevés de benchmark ne remplacent aucun contrôle de cette matrice.

## 16. Décisions encore ouvertes

Avant de déclarer un résultat exploitable pour ce prototype, compléter ce registre. **Décidé** signifie choix d'architecture, pas preuve d'exécution ou de validation. Les responsables restent à attribuer ; ne pas inventer de noms ou de dates de livraison.

| Sujet | État actuel | Méthode de résolution / condition avant utilisation |
|---|---|---|
| Moteur | SPICE/CSPICE local + DE440 décidé ; aucun moteur construit ici. | Choisir langage/adaptateur maintenu, figer versions et contrôler temps/repères/corrections sur références. |
| Orientation lunaire | PCK et FK compatibles identifiés au §3. | Lire couvertures réelles, choisir constantes/LSK et contrôler l'ensemble effectivement chargé. |
| Mission et « frost » | Intention et matériel incomplets ; « frost » provisoire. | Clarifier départ/arrivée, durée, capacités, seuils/préférences et nature de ressource ; pas de valeurs générées par le LLM. |
| Sites | Taille visée, pas de catalogue réel livré. | Vérifier coordonnées, nature point/zone, deux références et statut daté (§4). |
| Repère/altitude | Contrat détaillé, réalisation canonique restant à fixer. | Choisir selon produits retenus, documenter transformations et contrôle aller/retour avant mélange sites/LOLA. |
| Terrain | LOLA retenu, produit/emprise/qualité non arrêtés. | Lire labels, choisir couverture avec marges, contrôler NoData et convergence ; taille encore inconnue. |
| Hauteurs | Dépendent du matériel. | Valeurs et référence données explicitement ; profils distincts ou réutilisation justifiée. |
| Profil d'horizon | 360 azimuts, 20–50 km et 20–100 m : hypothèses initiales. | Étudier résolution/rayon et effets sur événements ; ne pas annoncer horizon complet sans preuve. |
| Disque/occultations | Conventions décrites, méthode finale à valider. | Choisir discrétisation/forme/corrections, représenter observateur site et tester contacts/masques combinés. |
| Recherche temporelle | 10 min puis 1 min : proposition de résolution. | Définir détection des événements brefs/rasants, encadrements et critères de convergence selon besoin ; publier risque résiduel. |
| Recherche spatiale/dates | Points/dates candidats et stratégie à préciser. | Grille initiale, raffinement, budget et ensemble réellement exploré enregistrés ; aucune optimalité globale présumée. |
| Tolérances/incertitudes | Pas de borne physique globale prouvée. | Relever erreurs sources, mesurer numérique séparément, justifier seuils ; conserver non quantifié sinon. |
| Stations/énergie/relais | Capacités conditionnelles ; données absentes de ce plan. | Réunir dépendances et valider les modèles dédiés avant tout critère opérationnel correspondant. |
| Cache et volumes | Immutabilité et quatre budgets décidés. | Choisir formats/rétention selon mesures, préserver versions et reproduction ; pas de plafond global arbitraire. |
| UI/agents | Contrat commun proposé, schémas pas encore figés. | Valider types/champs/unités/pagination et vues allégées sans modifier la preuve scientifique. |
| IA | **OpenRouter décidé ; modèle non choisi.** | Choisir modèle/routage/budgets, vérifier capacités d'endpoint et fidélité ; secret serveur, aucune configuration réelle ici. |
| Performance | Protocole prévu, aucune mesure du futur moteur. | Exécuter après justesse sur cas comparables ; volumes, latence, mémoire et tokens rapportés séparément. |

Tant que ces choix ou données manquent, publier un résultat limité et explicite, ou « Je ne peux pas le confirmer ». L'objectif DATA reste une comparaison rapide, traçable et honnête des scénarios explorés.
