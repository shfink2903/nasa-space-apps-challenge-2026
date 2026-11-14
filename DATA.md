# DATA — Plan de traitement et de gestion des données

Équipe **True Larpers** — **Lunar Landing Site Navigator**.

**Statut : plan documentaire, mis à jour le 14 novembre 2026.** Ce document ne prouve aucune implémentation, collecte, validation scientifique ou performance. Les chemins, champs, étapes et critères ci-dessous décrivent le travail à réaliser. Aucun noyau scientifique, MNT ou résultat calculé n'est livré par cette mise à jour.

**Périmètre : DATA exclusivement.** Préparer les sites, calculer les géométries Soleil/Terre, intégrer le relief, comparer des scénarios et fournir des résultats traçables à l'interface et à l'IA. L'interface est construite ailleurs : carte, animations, composants et rendu ne sont pas à implémenter ici.

Document canonique : `DATA.md`, sans second fichier `data.md`. Ce plan reprend les exigences utiles du document de la branche `claude/lister-dossier-43a061` au commit `1d84cfce190b98b926f0f70b4ef92024a512658f`, puis les actualise avec le cadrage SPICE et le whiteboard fourni par l'équipe. Il remplace notamment Horizons comme moteur principal et l'écrasement des anciens fichiers de cache. Le [défi](CHALLENGE.md) et le [README](README.md) donnent le contexte produit.

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

### 2.2 Trois dimensions temporelles séparées

1. **Distance à la date de départ/arrivée** : dans combien de temps commence le scénario ?
2. **Durée analysée** : combien de temps après ce début est évalué ?
3. **Latence** : combien de temps prend le calcul ou la lecture du cache ?

L'ancienne idée « jusqu'à 12 mois d'avance » est une hypothèse produit non validée, pas une limite de SPICE ni une précision garantie. La plage utile doit dépendre des données réellement présentes et du statut de validation. Pour les « saisons/jours lunaires », calculer les conditions aux dates demandées ; ne pas répéter une journée type. Tout libellé de saison doit définir sa grandeur astronomique et sa référence, sinon conserver uniquement les dates UTC.

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

## 4. Sites : coordonnées, altitude et provenance

Catalogue initial visé : **10 à 15 sites**, dont quelques sites hors pôle sud pour comparaison. Ce nombre est un objectif de travail, pas un catalogue déjà constitué. Aucune coordonnée exemple ne doit passer pour une mesure.

| Champ de `sites.json` | Exigence |
|---|---|
| `id`, `name` | Identifiant stable et nom affichable. |
| `mission` | Mission/programme sourcé ; vide si inconnu. |
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

## 6. Géométrie Soleil/Terre et conventions de visibilité

### 6.1 Calcul astronomique prévu

À chaque époque, convertir le temps selon la convention déclarée, obtenir direction et distance de chaque corps depuis l'observateur, puis azimut/élévation selon le zénith choisi. Déclarer corrections `abcorr`, modèle de normale, sens d'azimut et unités. Pour `azlcpo_c`, la méthode documentée `ELLIPSOID` utilise les rayons du noyau de constantes ; le relief LOLA est une étape distincte. Ne pas confondre normale de référence et normale réelle d'un panneau posé sur une pente.

Convention de sortie proposée : degrés ; azimut nord = 0°, est = 90°, croissance vers l'est ; élévation positive vers le haut. Vérifier les options SPICE et conversions contre cette convention, notamment près du pôle où la définition du nord local exige un traitement explicite. Comparer l'astre au profil dans exactement le même repère local.

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

Une portion de Terre visible n'est ni une station terrestre joignable ni une liaison garantie. L'antenne peut nécessiter une autre hauteur, un pointage, une station visible et disponible, et un bilan de liaison. Le MVP publie **visibilité géométrique Terre** ; si une contrainte exige une vraie communication, son résultat reste inconnu tant que la chaîne station/équipements n'est pas modélisée. Un relais satellitaire nécessite ses propres données et reste hors de ce premier modèle.

## 7. Recherche temporelle et métriques

### 7.1 Deux recherches distinctes

- **Dates initiales** : explorer les débuts de surface admissibles, puis raffiner les zones prometteuses ; conserver la grille parcourue et les dates ignorées. Dire « meilleur parmi les scénarios explorés », jamais optimum global non démontré.
- **Événements dans chaque scénario** : échantillonner les directions, appliquer le masque/disque, détecter transitions et affiner leurs temps.

Hypothèse numérique initiale : pas grossier **10 min**, puis objectif de raffinement **1 min** autour des transitions détectées. Ce choix n'est ni une borne physique ±1 min ni une garantie de détection : un événement peut apparaître et disparaître entre deux échantillons. Prévoir recherche des faibles dégagements, extrema et contacts rasants, subdivision locale selon variation du masque, puis confrontation à un calcul plus fin. Sans méthode assurant la détection, annoncer le risque résiduel non borné.

Conserver intervalle d'encadrement de chaque transition, critère d'arrêt, convergence observée et éventuelle tangence non résolue. Les cas toujours visibles/masqués sur la période n'autorisent pas un coucher/lever inventé hors période.

### 7.2 Indicateurs prévus

| Indicateur | Définition / limite |
|---|---|
| Direction Soleil/Terre | Centre, distance, rayon apparent, azimut et élévation, horodatés. |
| Fenêtres de visibilité terrain | Intervalles selon `partial` ou `full`, convention explicitement choisie ; pas de mélange de conventions dans un classement. |
| Durée cumulée | Somme des longueurs des intervalles retenus dans la période. |
| Plus longue interruption | Plus longue coupure **observée dans la fenêtre**, avec marqueur de troncature si elle touche les bornes. |
| Temps avant coucher / Earthset | Différence avec le prochain événement trouvé et défini ; `null` + « hors fenêtre » ou « inconnu » sinon. |
| Recouvrement Soleil/Terre | Intersection temporelle des fenêtres retenues ; indicateur géométrique, pas preuve d'opération simultanée réelle. |
| Fraction du temps | Durée visible / durée analysable ; publier aussi durée demandée, durée analysable et couverture manquante. |
| Relief et qualité | Référence du masque, directions couvertes, hauteur, limites ; pas de note d'atterrissabilité sans modèle dédié. |

Calculs à conserver dans les spécifications : pour une fenêtre `W = [t0, t1]` et des intervalles visibles disjoints `I_k`, `D_visible = Σ longueur(I_k ∩ W)`. Si tout `W` est analysable, `pourcentage = 100 × D_visible / (t1 - t0)`. En cas de données manquantes, fournir une fraction sur la partie analysable clairement nommée et laisser la métrique mission complète inconnue ; ne pas compter les trous comme du temps visible ou masqué.

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

La séparation des fichiers pourra être ajustée selon les tailles mesurées, en conservant leurs identifiants et liens. La cible initiale de **10–20 Mo** au total pour un lot de démonstration est un budget proposé, pas une taille obtenue. Les gros fichiers scientifiques restent hors git ; les manifestes permettent de retrouver leurs versions.

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

## 10. IA : expliquer une preuve calculée

Le moteur remet à l'IA un dossier compact : demande, scénarios évalués, métriques avec unités, contraintes et résultats, règles de classement, comparaison historique sourcée, provenance, limites et données manquantes. Éviter les données brutes massives et tout apprentissage supposé sur des pétaoctets.

Rôle autorisé dans le plan : reformuler le besoin, regrouper les résultats, présenter les compromis et expliquer les options en citant les identifiants des preuves. Rôle exclu : calculer la physique, créer une coordonnée, inventer un seuil/poids, compléter une mesure manquante ou déclarer un succès mission.

Les anciennes missions apportent contexte et points de comparaison seulement si position, date et sources sont connues. Leur succès ne prouve pas l'adéquation d'un autre site ou matériel. Toute phrase chiffrée générée doit pouvoir être reliée à un champ calculé ou une source. En cas de manque : « Je ne peux pas le confirmer », avec le champ ou contrôle nécessaire. Un échec de l'IA ne doit pas empêcher de lire les résultats déterministes.

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

## 16. Décisions encore ouvertes

Avant de déclarer un résultat exploitable pour ce prototype, résoudre ou exposer :

1. Sens opérationnel de « frost », critères mission, seuils, préférences et relation départ/arrivée.
2. Catalogue réel ; produits et versions exacts ; constantes/LSK et cohérence de tous les référentiels/altitudes.
3. Hauteurs d'observation et règles d'acceptation d'un terrain incomplet.
4. Modèle de forme, rayon/pas de terrain, méthode disque/occultations et traitement des événements brefs/rasants.
5. Grille des dates initiales, plages validées, tolérances justifiées et incertitudes non quantifiées.
6. Schémas avec UI/IA, lot de démonstration, budget de taille et mesures de performance réelles.

Tant que ces choix ou données manquent, publier un résultat limité et explicite, ou « Je ne peux pas le confirmer ». L'objectif DATA reste une comparaison rapide, traçable et honnête des scénarios explorés.
