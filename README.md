# 📚 Documentation docs.babouins.fr

Bienvenue sur le dépôt de [docs.babouins.fr](https://docs.babouins.fr), la documentation du projet **Babouins** : les procédures, les commandes et les aide-mémoire du BTS SIO, écrits et relus par ses étudiants.

> 🐒 Ce README reprend la trame de [celui du projet d'origine](https://github.com/BABOUINS-PROJECT/docs.babouins.fr), écrit par Dimitri Chassignol en 2024. À l'époque, la doc tournait sous Docusaurus et tout passait par des forks. La règle des deux validations est restée ; ce qui change en 2026, c'est qu'on peut aussi écrire depuis un éditeur en ligne, sans connaître Git.

| Où ? | Quoi ? |
| --- | --- |
| [docs.babouins.fr](https://docs.babouins.fr) | Ce dépôt : la documentation |
| [docs.babouins.fr/admin](https://docs.babouins.fr/admin) | Ce dépôt aussi : l'éditeur en ligne, pour écrire une page sans connaître Git |
| [www.babouins.fr](https://www.babouins.fr) | La vitrine, le concept, le guide de contribution (projet séparé) |
| [GitHub Discussions](https://github.com/Projet-Babouins/www.babouins.fr/discussions) | Les échanges entre contributeurs |

### 📚 Concept du projet

**Babouins** est une plateforme collaborative où chaque étudiant de BTS SIO peut participer. On y centralise les procédures, les commandes et les tutos vus en cours, on les relit ensemble, et on les garde à jour. Le BTS SIO est dense : l'idée est d'avoir un seul endroit où chercher, accessible à toute la classe.

### 🚀 Fonctionnalités

- **Centralisation** des procédures, commandes et aide-mémoire, rangés par thème et lisibles sans compte.
- **Un éditeur en ligne** sur `/admin` : titres, listes, blocs de code, images, et un mode Markdown pour qui préfère.
- **Collaboration** avec Git et les pull requests, pour qui veut pratiquer les outils du métier.
- **Validation** de chaque page par deux personnes de la classe, depuis l'éditeur ou depuis GitHub.
- **Mise à jour douce** : une page ouverte chez un lecteur se met à jour toute seule quand elle est corrigée.

### 🛠️ Tutoriel sur les pull requests

Un guide pas à pas est en ligne : [www.babouins.fr/contribuer](https://www.babouins.fr/contribuer/). Il explique comment proposer une modification, comment la faire relire, et comment travailler à plusieurs sans se marcher dessus. Jamais touché à Git ? Le guide part de zéro, et l'éditeur en ligne s'en passe complètement.

### 🏠 Et la page d'accueil du projet ?

Elle n'est pas ici : la vitrine vit dans [le dépôt www.babouins.fr](https://github.com/Projet-Babouins/www.babouins.fr), et elle se modifie aussi par pull request. Ici, l'adresse `/` ouvre directement la doc (`src/content/docs/index.md`).

## 📝 Contribution

Il y a deux façons d'écrire, à égalité. Le résultat est le même, et la relecture aussi.

**Depuis l'éditeur en ligne**, sans rien installer :

1. Ouvre [docs.babouins.fr/admin](https://docs.babouins.fr/admin) et connecte-toi avec ton compte GitHub (il doit être membre de l'organisation [Projet-Babouins](https://github.com/Projet-Babouins)).
2. Crée une page ou choisis-en une dans la liste, écris, puis enregistre (`Ctrl` + `S`).
3. Ta page part en relecture : c'est une **proposition**. Tes enregistrements suivants la complètent.

**Avec Git et GitHub** :

1. **Forke** le dépôt (bouton "Fork" en haut à droite).

> Un **fork** est une copie du dépôt sur ton propre compte GitHub. Tu peux y travailler sans risque : l'original n'est pas touché. Quand ta modification est prête, tu demandes à l'intégrer au projet principal avec une pull request.

2. **Clone** ton fork sur ta machine :
    ```bash
    git clone https://github.com/<ton-pseudo>/docs.babouins.fr.git
    ```
3. **Crée** une nouvelle branche pour ta modification :
    ```bash
    git checkout -b <branche>
    ```
4. **Fais** ta modification (les pages sont dans `src/content/docs/cours/`), vérifie que le site se construit, puis **commite** :
    ```bash
    npm run build
    git add .
    git commit -m "Décris ta modification en une phrase"
    ```
5. **Pousse** vers ton fork :
    ```bash
    git push -u origin <branche>
    ```
6. **Ouvre** une pull request vers le dépôt principal.

Pas envie d'installer quoi que ce soit ? Ouvre le fichier sur GitHub, clique sur le crayon, et GitHub crée le fork et la pull request pour toi.

## ✅ Validation des contributions

Toute contribution doit être validée par **au moins deux personnes de la classe** : la règle date du projet d'origine, en 2024. Ce que l'éditeur appelle une proposition est une vraie pull request : on peut donc relire depuis l'éditeur (bouton "Relectures") ou depuis l'onglet "Pull requests" de GitHub, et un avis donné d'un côté apparaît de l'autre. On ne valide pas sa propre proposition. Après deux validations, la page est publiée toute seule.

Les référents du projet peuvent publier sans attendre, pour les urgences. Ils doivent donner une raison, et elle reste dans l'historique, à leur nom.

> ⚠️ Règle d'or : **aucune information venant d'une entreprise d'alternance** (adresses IP, noms de domaines internes, identifiants, captures d'écran non anonymisées). Git garde tout dans son historique.

## 📦 Déploiement

Sur chaque pull request, `.github/workflows/check.yml` vérifie les types et que le site se construit (GitHub Actions). Une fois la pull request validée et fusionnée dans `main`, le site est mis à jour sur son serveur.

Le site est hébergé sur un serveur Node.js (panel [Pelican](https://pelican.dev)), comme www.babouins.fr. Les pages de la doc sont statiques, fabriquées au build ; seules les routes `/admin` et `/api/admin` sont exécutées par le serveur (`@astrojs/node`). Sur le serveur, la mise à jour tient en trois commandes, après avoir récupéré `main` :

```bash
npm ci
npm run build
npm start
```

`npm start` lance `node ./dist/server/entry.mjs`. Le serveur lit ces variables d'environnement :

| Variable | Rôle |
| --- | --- |
| `HOST` | Mettre `0.0.0.0` pour être joignable depuis l'extérieur |
| `PORT` | Le port attribué par Pelican |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | La GitHub App qui sert à la connexion (voir `.env.example`) |

`GITHUB_REPO` et `GITHUB_BRANCH` ont de bonnes valeurs par défaut et sont lues **au build**, pas au démarrage.

Le HTTPS et le nom de domaine sont gérés par le reverse proxy placé devant. Il doit transmettre `Host` et `X-Forwarded-Proto`, et `security.allowedDomains` (dans `astro.config.mjs`) doit autoriser `docs.babouins.fr` : Astro compare l'en-tête `Origin` des formulaires à l'adresse du site, et sans ça les enregistrements répondent 403. Après le tout premier build avec une nouvelle configuration des blocs de code, lance une fois `npx astro build --force` pour vider le cache du contenu.

### 🔧 Mise en place sur GitHub

À faire une fois, par un administrateur de l'organisation :

1. **GitHub App** pour la connexion : voir `.env.example`. Il n'y a aucun compte "bot" : le jeton d'un étudiant est limité aux permissions de l'App et au seul dépôt de la doc, il expire en 8 heures et ne quitte jamais la session côté serveur.
2. **Membres** : les étudiants ont le rôle "Write" sur le dépôt, les référents "Maintain".
3. **Ruleset** sur `main` (Settings > Rules > Rulesets) :
   - "Require a pull request before merging", 2 approbations, et "Dismiss stale pull request approvals when new commits are pushed" (une validation ne vaut que pour la version relue) ;
   - "Require status checks to pass" : le check `build` ;
   - "Bypass list" : les rôles "Maintain" et "Repository admin".
4. **Settings > General** : cocher "Allow auto-merge", "Allow squash merging" et "Automatically delete head branches". Si "Allow auto-merge" est oublié, la dernière validation faite dans l'éditeur déclenche quand même la publication ; une validation faite sur github.com, non.
5. **Serveur** : après chaque fusion dans `main`, il doit récupérer la nouvelle version, reconstruire le site et redémarrer.

## 🚀 Lancer le site en local

Il te faut [Node.js](https://nodejs.org) en version LTS (22.12 ou plus récent).

```bash
npm install
cp .env.example .env
npm run dev
```

Le site est visible sur `http://localhost:4321`, l'éditeur sur `http://localhost:4321/admin`. Dans `.env`, renseigne `ADMIN_DEV_LOGIN` avec ton pseudo : en local, l'éditeur te connecte alors directement, sans GitHub, et il écrit sur ton disque (ni proposition, ni relecture). Pour essayer le vrai fonctionnement depuis ton poste, mets `ADMIN_STORE=github` et les identifiants de la GitHub App : attention, tes enregistrements partent alors dans le vrai dépôt.

| Commande | Effet |
| --- | --- |
| `npm install` | Installe les dépendances (à faire une fois, après le clone) |
| `npm run dev` | Lance le site en local, avec rechargement automatique |
| `npm run check` | Vérifie les types de tout le projet |
| `npm run build` | Construit le site final dans `dist/` (à lancer avant chaque PR) |
| `npm start` | Lance le serveur de production, après un build (c'est ce que fait l'hébergement) |
| `npm run preview` | Affiche le résultat du build, tel qu'il sera en ligne |

> Piège connu (Astro 7.3, en développement) : quand `astro.config.mjs` est modifié, ou quand un fichier de contenu est remplacé par un autre, le serveur de dev peut garder l'ancien état en mémoire (page en 404, ou erreur "UnknownContentCollectionError"). Arrête puis relance `npm run dev`.

## 🗂️ Structure du projet

Le site est fait avec [Starlight](https://starlight.astro.build), le thème de documentation d'[Astro](https://astro.build). L'éditeur de `/admin` est fait maison, avec [Milkdown Crepe](https://milkdown.dev) pour la partie visuelle.

```text
.
├── .github/workflows/
│   └── check.yml                 Vérifie les types et le build, sur chaque PR
├── public/                       Fichiers copiés tels quels (favicon, images envoyées dans media/)
├── src/
│   ├── content/docs/
│   │   ├── index.md              Page d'accueil de la doc (/)
│   │   └── cours/                Les pages : un fichier Markdown = une page
│   │       └── _menu.json        Ordre du menu et noms des dossiers
│   ├── middleware.ts             Contrôle d'accès : /admin et /api/admin exigent une session
│   ├── starlight-menu.ts         Applique _menu.json à la barre latérale du site
│   ├── components/Head.astro     <head> de Starlight + empreintes de la page (mise à jour douce)
│   ├── lib/
│   │   ├── build-id.ts           Identifiant du build en cours
│   │   ├── live-update.ts        Mise à jour douce des pages ouvertes (navigateur)
│   │   └── admin/
│   │       ├── paths.ts          Identifiants, validation des chemins (partagé avec le navigateur)
│   │       ├── menu.ts           L'arbre du menu : fonctions pures, sans lecture ni écriture
│   │       ├── library.ts        Toutes les opérations métier (pages, dossiers, déplacements)
│   │       ├── frontmatter.ts    Fichier Markdown vers champs de l'éditeur, et retour
│   │       ├── http.ts           Enveloppe commune des routes de l'API
│   │       ├── errors.ts         Erreur métier avec son code HTTP
│   │       ├── github.ts         Petit client de l'API GitHub, avec le jeton de la personne connectée
│   │       ├── github-oauth.ts   Connexion via GitHub, rôle d'après les droits sur le dépôt
│   │       ├── proposals.ts      Propositions (pull requests) : lire, donner un avis, retirer, publier
│   │       ├── store/            Stockage bas niveau : lister, lire, appliquer un lot de changements
│   │       │   ├── index.ts        Choisit le stockage : proposition, publication directe ou disque
│   │       │   ├── local.ts        Développement : le disque
│   │       │   └── github.ts       Production : un commit par lot sur une branche, via l'API GitHub
│   │       └── client/           Code exécuté dans le navigateur
│   │           ├── main.ts         Relie l'arbre, le formulaire et l'éditeur
│   │           ├── reviews.ts      Écran "Relectures" : liste, détail, avis
│   │           ├── tree.ts         Arborescence : recherche, menus, glisser-déposer
│   │           ├── markdown-editor.ts  Éditeur visuel (Milkdown Crepe) et mode Markdown
│   │           ├── ui.ts           Dialogues, menus contextuels, notifications
│   │           ├── api.ts          Appels à /api/admin
│   │           └── icons.ts
│   ├── pages/
│   │   ├── version.json.ts       Fichier statique { build } : "le site a-t-il été reconstruit ?"
│   │   ├── admin/                index.astro (coquille de l'éditeur), login.ts, callback.ts, logout.ts
│   │   └── api/admin/            tree, course, folder, move, upload, media, me, proposals
│   └── styles/
│       ├── theme.css             Couleurs de la doc : la même palette que la vitrine
│       └── admin.css             Styles de l'éditeur (thème clair et sombre)
├── astro.config.mjs              Configuration d'Astro et de Starlight, variables d'environnement
└── package.json                  Dépendances et commandes npm
```

Quelques repères pour débuter :

- **Corriger une page** : le plus simple est l'éditeur. Avec Git, ouvre son fichier dans `src/content/docs/cours/`.
- **Ajouter une page avec Git** : crée un fichier `.md` avec un `title` dans son en-tête. Pas besoin de toucher à `_menu.json` : la page est rangée à la fin de son dossier.
- **Changer une couleur** : `src/styles/theme.css` pour la doc, le début de `src/styles/admin.css` pour l'éditeur.
- **Le chemin d'une requête de l'éditeur**, de haut en bas : `client/`, puis une route de `pages/api/admin/` (validation du format avec zod), puis `library.ts` (règles métier), puis `store/` (fichiers).
- Pas de tiret long dans les textes du site : on utilise des deux-points, des virgules ou des parenthèses.

### 🔁 Enregistrer, proposer, publier

Les pages du site sont **statiques**. En développement, l'éditeur écrit sur le disque et git reste à la main. En production, écrire sur le disque du serveur ne publierait rien : l'éditeur passe par l'API de GitHub, avec le jeton de la personne connectée. Chaque action (enregistrer, déplacer, renommer) devient **un seul commit**, à son nom.

| Dans l'éditeur | Sur GitHub |
| --- | --- |
| Premier enregistrement | Commit sur la branche `proposition-<login>`, pull request ouverte |
| Enregistrements suivants | Commits sur la même branche : la proposition se met à jour |
| "Valider", "Demander des corrections" | Une "review", faite avec le compte du relecteur |
| 2 validations | Fusion automatique (squash) dans `main`, branche supprimée |
| "Retirer ma proposition" | Pull request fermée, branche supprimée |
| Référent : publication directe | Commit sur `main`, ou fusion immédiate, raison dans l'historique |

- Tant que sa proposition est ouverte, une personne lit et modifie **sa** version des pages ; les autres voient le site publié. Une seule proposition ouverte par personne.
- **La règle des 2 validations n'est pas dans ce code.** C'est GitHub qui l'applique, par le ruleset de `main` : un bug ou une requête trafiquée ne peut pas publier sans relecture. Le code ne fait qu'afficher le compteur (`REQUIRED_APPROVALS` dans `proposals.ts`, à garder égal au ruleset).
- **Les rôles viennent du dépôt**, lus à la connexion : "Write" donne accès à l'éditeur, "Maintain" ou "Admin" fait un référent. Pour nommer un référent, on change son rôle sur GitHub, rien d'autre.
- **La branche n'avance que si personne n'a écrit entre-temps** (`force: false`) : sinon l'éditeur affiche "Le dépôt a changé entre-temps". Personne n'écrase le travail de personne.
- **Le menu bouge le moins possible.** `_menu.json` est commun à tout le monde, et deux propositions qui modifient le même fichier se gênent. Une nouvelle page n'y est donc pas écrite, et corriger un texte n'y touche pas : seuls un rangement, un renommage ou un dossier créé le modifient. Si deux propositions le changent quand même, la seconde est "en conflit" : un référent règle le conflit sur GitHub.

### 🔄 Mise à jour douce des pages ouvertes

Quand une page est publiée, le site est reconstruit. Les pages déjà ouvertes chez les lecteurs se mettent à jour seules, sans rechargement (`src/lib/live-update.ts`) :

1. Au build, `components/Head.astro` écrit trois empreintes dans chaque page : le **build** (le même pour tout le site), le **contenu** de la page, et le **menu**.
2. Toutes les minutes, et quand l'onglet redevient visible, la page lit `/version.json` (quelques octets).
3. Si le build a changé, elle télécharge sa propre nouvelle version et compare les empreintes : contenu différent, seule la zone du texte est remplacée (la position de lecture est conservée) ; menu différent, le menu est remplacé en gardant les dossiers ouverts ou repliés ; rien de différent, rien ne bouge.
4. Si la nouvelle version a besoin d'un script ou d'un style que la page n'a pas, elle propose un bouton "Recharger" ; si la page n'existe plus, "Retour à l'accueil".

Si un cache est placé devant le site, `/version.json` et les pages HTML ne doivent pas y rester plus de quelques secondes.

### 🔒 Les règles de sécurité du code

- **Le serveur décide, jamais le navigateur.** Le code de `client/` n'est que de l'affichage ; toutes les vérifications sont dans le middleware, l'API et `library.ts`.
- **GitHub est le juge.** Les 2 validations, l'interdiction de valider sa propre proposition et le droit de publier directement sont des règles du dépôt : ce code ne peut pas les contourner.
- **Un seul point de contrôle d'accès** (`src/middleware.ts`) et **un seul endroit qui valide les chemins** (`lib/admin/paths.ts`) : un nom de page ou de dossier ne contient que des minuscules, des chiffres et des tirets, impossible de sortir du dossier des pages.
- **Aucun jeton durable.** Le jeton de la personne connectée vit 8 heures, reste dans la session côté serveur, et n'est jamais envoyé au navigateur ni écrit dans un journal.
- **Vie privée** : les commits sont signés avec l'adresse "noreply" du compte GitHub, pas avec la vraie adresse e-mail de l'étudiant.
- **Images** : PNG, JPEG, WebP, format lu dans le contenu du fichier, métadonnées (dont la position GPS) retirées. Pas de SVG.
- **Aucun texte saisi n'est injecté comme du HTML** dans l'éditeur. En revanche, le HTML écrit dans une page est publié tel quel sur le site, comme s'il avait été poussé avec Git : c'est aussi pour ça que chaque page est relue.

## 📄 Licences

- Code : [MIT](LICENSE), copyright Projet Babouins et contributeurs.
- Contenu (textes et images de la doc) : [CC BY-SA 4.0](LICENSE-content).

En contribuant, vous acceptez que votre contenu soit publié sous CC BY-SA 4.0.

---

<br>
Créé avec ❤️ en 2024 par Dimitri Chassignol, Jordan Digat et Mathis Norel. Repris avec ❤️ en 2026 par la promo BTS SIO 2026-2028 (Olivier Dutoit). Les deux équipes viennent du même centre de formation : le CFAI LDA de Saint-Étienne.
