# Prompt pour refaire l'audit complet (sans modifier l'app)

Copier le bloc ci-dessous dans une nouvelle session Claude Code ouverte sur ce dépôt.

```text
Lis CHALLENGE.md et fais un audit complet de l'app Touchdown (dossier touchdown/ et pipeline lunar_data/), pour maximiser nos chances de gagner le NASA Space Apps Challenge 2026, défi "Lunar Landing Site Navigator".

RÈGLE ABSOLUE : audit en lecture seule. Ne modifie aucun fichier de l'app, du pipeline, des tests ni des données. Les seuls fichiers que tu peux créer sont le rapport et la note de recherche décrits plus bas. Commite-les uniquement sur la branche de travail actuelle, jamais sur main, et n'ouvre pas de pull request.

Vérifie tout plusieurs fois, sous plusieurs angles. Cherche ce qui existe déjà. Marque comme "non vérifié" tout ce que tu n'as pas pu confirmer. N'invente aucun chiffre.

Étapes :

1. Contexte
   - Lis CHALLENGE.md, README.md, touchdown/README.md, DATA_PIPELINE.md, AI_GUIDE.md et SUBMISSION.md.
   - Lis docs/validation/*.md et les audits précédents dans docs/audit/.
   - Note ce qui a déjà été corrigé, pour ne pas le re-signaler.

2. Vérification technique : lance et note les résultats exacts
   - cd touchdown && npm ci && npx tsc --noEmit && npm test && npm run build
   - Sers dist/ avec : python3 -m http.server 4180 --directory dist --bind 127.0.0.1
   - Puis lance : npm run test:e2e
   - Mesure : taille de dist/, nombre de fichiers, plus gros fichier, poids du premier chargement, temps de démarrage.
   - Vérifie que le build marche servi depuis un sous-dossier, comme sur GitHub Pages.
   - Si .venv existe, lance aussi : .venv/bin/python -m pytest -q

3. Test réel dans le navigateur
   - Utilise Playwright et Chromium (args --use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist).
   - Fais des captures à 1440x900 et à 390x844, en français et en anglais.
   - Parcours : accueil, vue d'un site, atterrissage, onglet Comparer section par section, coordonnées libres, lien partagé, export CSV, guide, mode classe, assistant.
   - Relève les erreurs console, les textes tronqués, le débordement horizontal et les éléments qu'on ne peut pas toucher sur mobile.
   - Regarde toi-même chaque capture.

4. Trois relectures indépendantes en parallèle (sous-agents en lecture seule, chacun avec un brief complet et sans tes conclusions)
   a. Revue de code : bugs de correction (indices de série, temps et UTC, azimut, états), courses de chargement, fuites, accessibilité, performance, déploiement statique.
   b. Revue UX par profils, chacun avec une tâche concrète :
      - planificateur CLPS : "lancement décalé du 1er décembre à mi-janvier : quels sites restent viables ? Partager le résultat" ;
      - responsable scientifique : "heure exacte du prochain coucher du Soleil et de la Terre, et relief vers le Soleil" ;
      - enseignant : "montrer en classe pourquoi le pôle Sud est plus dur qu'Apollo 11".
   c. Recherche web (mode standard, puis extended si besoin) :
      - règles 2026 de Space Apps : critères de notation, prix, format de la démo, champs de soumission, règles IA, date limite ;
      - onglet Resources du défi ;
      - concurrents 2026 sur le même défi, avec leurs fonctions et s'ils sont en ligne ;
      - outils existants (Quickmap, Moon Trek, Horizons, PGDA, SVS) ;
      - régions Artemis et coordonnées des missions au pôle Sud, avec leurs sources.

5. Contre-vérification
   - Reproduis toi-même chaque constat grave avec un script ou une mesure (par exemple compter les valeurs concernées dans data/processed/v1).
   - Écarte ou corrige les constats faux.
   - Vérifie la géographie avant tout nom de lieu.
   - Vérifie qu'aucune comparaison affichée ne suggère l'inverse de ce qu'elle doit montrer (avec ou sans relief, par exemple).

6. Rapport, en français
   Écris docs/audit/AUDIT-<date du jour>.md avec :
   - ce qui a été vérifié (commandes et résultats) ;
   - les points forts à mettre en avant ;
   - les faiblesses, classées par gravité et reliées aux 5 critères (Impact, Créativité, Validité, Pertinence, Présentation), chacune avec preuve (fichier:ligne, capture ou chiffre), scénario d'échec et effort (S/M/L) ;
   - un plan d'action priorisé selon le temps restant avant la date limite (P0 éligibilité, P1 gros gain, P2 différenciation, à ne pas faire) ;
   - les prix à viser ;
   - la comparaison avec les concurrents.
   Écris aussi docs/audit/recherche-<date du jour>.md avec toutes les sources (URL) et les points non vérifiés.

7. Fin
   - Commite les deux fichiers sur la branche courante, jamais sur main.
   - Pousse avec : git push -u origin <branche>
   - Donne-moi un résumé court : les 5 actions les plus rentables, ce qui bloque l'éligibilité, et le chemin des fichiers.
```
