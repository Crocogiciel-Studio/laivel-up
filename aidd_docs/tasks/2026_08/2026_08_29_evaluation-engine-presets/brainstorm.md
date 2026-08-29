# Moteur d'évaluation de développeur — critères branchables et grilles en preset

Le produit est un **moteur générique d'évaluation de développeur** : il prend un dossier (activité
Git, PR, code, analyse statique, contexte de dépôt, déclaratif, session — jamais tout à la fois) et
une **définition de grille**, et il rend une évaluation — niveau par axe, niveau global, confiance,
trace des observations, plan de progression. « L'évaluateur de niveau AIDD » n'est pas le produit :
c'est un **preset**. La cible est plus large (progression dans un jeu vidéo, évaluation par des
admins, etc.), donc le caractère **ultra-paramétrable** est une contrainte dure, pas un confort. La
clean architecture est là pour ça : le cœur ne dépend d'aucune stack, d'aucun format, d'aucune
grille ; lecteurs de dossier, évaluateurs de critères, grilles et formats de sortie sont tous des
adaptateurs.

Suite du brainstorm produit du 2026-08-28 (`aidd_docs/tasks/2026_08/2026_08_28_aidd-level-evaluator/brainstorm.md`),
dont le socle reste valable : confiance à trois facteurs, `min()` entre axes, signaux ordinaux,
familles d'indépendance à la main, aucun LLM dans le chemin critique.

## Ce qui est clair

### Produit et grille

- **Le cœur ne connaît ni « AIDD » ni les axes en dur.** Il sait faire tourner `(grille + dossier)`
  → évaluation.
- **Une grille = un fichier de config (un preset).** Il déclare : les axes, les niveaux ordonnés,
  quels critères nourrissent quel axe, les seuils, les poids, la méthode d'agrégation. L'utilisateur
  prend un preset ou compose le sien.
- **Le preset AIDD garde les 4 axes du référentiel du jury** (Taille, Harness, Intervention,
  Parallèle) — ils sont bons. Modifier la grille, rendu compris, est autorisé par les
  organisateurs ; on ne traite plus celle du jury comme une cible de score figée.
- **Trois surfaces de réglage, toutes dans le fichier de grille :** les seuils ; la méthode
  d'analyse quand plusieurs se défendent (moyenne / médiane / écart-type / quartile…) ; la
  composition et les poids des faisceaux.
- **Réutilisation visée hors AIDD :** progression dans un jeu vidéo, outil d'évaluation pour des
  admins, etc. C'est ce qui justifie « paramétrable à tous les niveaux ».
- **Skill futur** pour générer une grille compatible — noté, pas maintenant.

### Critères et faisceaux

- **Chaque critère = un évaluateur branchable derrière une interface générique.** Il déclare les
  pièces d'entrée dont il a besoin ; répond **« inconnu »** (jamais « faux ») si elles manquent ;
  émet une lecture ordinale (niveau pointé ou répartition sur les niveaux) + la valeur brute
  mesurée + une confiance + une phrase de preuve ; il est déterministe et se dégrade proprement
  sans clé API ni réseau.
- **Un évaluateur peut nourrir plusieurs axes** ; il émet des lectures étiquetées par axe.
- **La calibration vit dans la grille, jamais dans l'évaluateur.** Même évaluateur + grille
  différente → verdict différent.
- **Par axe : un faisceau de plusieurs critères**, nombre variable selon l'axe, travaillés un par
  un dans des sessions dédiées.
- **Verdict d'axe = vote entre ses critères, pondéré par la confiance de chacun.** Pas un produit
  de confiances (qui s'effondrerait à mesure qu'on ajoute des critères). « Confiance d'un critère
  ≈ son maillon le plus faible parmi trois vérifications » : accord entre familles d'indices
  indépendantes, marge au seuil, suffisance des données (pièce manquante → inconnu). Le rapport
  nomme le maillon limitant.
- **Déclaratif vs faits : les faits gagnent.** Une contradiction baisse la confiance, s'affiche, et
  peut **plafonner** ou déclasser un axe — jamais le rehausser.
- **Les outils qualité / sécurité / duplication sont de simples plugins.** La grille décide si un
  tel critère compte pour le niveau, pour la confiance seule, ou pour un plafond. Le référentiel
  AIDD sortant la qualité du périmètre, un preset AIDD les branche en confiance/plafond ; un autre
  preset (ou une grille maison) peut en faire un axe à part entière.

### Sortie

- Niveau global (le plus bas des axes) + niveau par axe + confiance avec facteur limitant + trace
  des observations + plan de progression (écart entre l'axe contraignant et son prochain seuil →
  actions concrètes tirées de la grille).

### Données d'exemple

- **Les 4 profils (perceval Red, bohort Blue, leodagan Green, arthur Copper) sont des tests de
  non-régression, pas un jeu d'entraînement.** Les seuils sont écrits depuis le référentiel et le
  bon sens métier, puis vérifiés « ne contredit aucun des quatre ». On ne cale rien dessus.

## Architecture (hexagonale, ports & adapters)

- **Le cœur (domaine)** contient le modèle — dossier développeur, grille, résultat d'évaluation,
  tous en objets métier — et la logique : faisceaux, confiance, agrégation, `min()` entre axes. Il
  ne connaît ni JSON, ni fichier, ni DB, ni HTTP, ni rendu. Il définit les ports ; les adaptateurs
  dépendent de lui, jamais l'inverse.
- **Hypothèse :** trois modèles métier liés à la frontière — dossier, grille, résultat — chacun
  avec son adaptateur d'entrée et/ou de sortie. Seul le modèle traverse la frontière.
- **Ports possédés par le cœur :**
  - source de dossier → rend un dossier au format modèle ;
  - source de grille → rend une grille au format modèle ;
  - puits de résultat → consomme une évaluation au format modèle ;
  - évaluateur de critère → lit une tranche du dossier-modèle, émet des lectures ordinales
    étiquetées par axe + confiance + preuve ;
  - catalogue où les évaluateurs s'enregistrent.
- **Adaptateurs, plug'n'play des deux côtés :**
  - entrée : `JSON → modèle` d'abord ; plus tard `DB → modèle`, `API → modèle`, `état de jeu → modèle` ;
  - sortie : `modèle → JSON` d'abord ; plus tard `modèle → HTML/graphe`, `modèle → DB`, `modèle → texte CLI` ;
  - chargement de grille : `preset YAML/JSON → grille-modèle` ;
  - chaque évaluateur de critère est un adaptateur derrière son port ; ceux qui enrobent un outil
    externe (Sonar, scan de vulnérabilités) ne sont que des adaptateurs qui appellent un binaire.
- **Conséquence :** ajouter la DB ou le rendu graphique plus tard = un nouvel adaptateur, zéro
  ligne changée dans le cœur. Le JSON n'est pas privilégié, c'est juste le premier adaptateur de
  chaque côté.
- **MVP hackathon :** adaptateur `JSON → modèle`, adaptateur `modèle → JSON`, preset AIDD, un
  premier lot d'évaluateurs de critères. Le reste est repoussé sans dette.

## Encore ouvert

- **Calibration par axe** (l'essentiel des points ouverts) — liste des critères par axe, leurs
  signaux, les familles d'indépendance, les seuils, les poids : objet des sessions par axe, à faire
  à la construction des presets.
- **Frontière du paramétrable pour le rendu :** la grille compose à partir d'un catalogue de
  critères codés (retenu) plutôt qu'un mini-langage de définition de critères (repoussé au stage 2) ;
  idem pour la possibilité de déclarer des axes inédits dans un fichier de grille.
- **« L'intention prime sur la taille brute » sans LLM** — méthode indécise (modules touchés,
  mots-clés titre/corps, narratif du corps de PR, vs se fier au `size_distribution` fourni).
- **Détection des « boucles » :** aucun exemple Silver/Gold pour calibrer — jusqu'où être agressif.
- **Barre minimale de preuve** sous laquelle l'outil refuse de trancher.
- **Schéma JSON de sortie**, et rendu texte lisible à côté ou non.

## Tranché après coup

- **Langage : TypeScript en mode `strict`**, exigence forte sur le typage et le lint (dev backend
  Java à l'origine). Distribution par Docker, donc la portabilité machine n'est pas un sujet.
  Intégrations futures (HTTP / stdio / file d'événements) = adaptateurs supplémentaires sur
  l'hexagone, sans impact sur le cœur.

## Prochaine étape

Trancher la stack/le langage (bloque tout code), puis monter un squelette qui marche de bout en
bout : les trois modèles, l'adaptateur `JSON → modèle`, l'adaptateur `modèle → JSON`, le port
évaluateur et un critère bidon qui tourne. Ensuite, session par axe en commençant par **Taille** :
lister ses critères candidats et la donnée que chacun lit, choisir la méthode d'analyse, poser le
seuil en le justifiant depuis le référentiel, puis vérifier contre les 4 profils.
