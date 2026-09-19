# docs.babouins.fr

Site des cours du projet Babouins : un site [Starlight](https://starlight.astro.build) (Astro) et un
espace d'édition maison sur `/admin`, pour écrire les cours sans toucher au code.

## Démarrer

```bash
npm install
cp .env.example .env   # puis renseigner ADMIN_DEV_LOGIN pour se connecter sans OAuth
npm run dev
```

- Site : <http://localhost:4321>
- Édition : <http://localhost:4321/admin>

| Commande          | Action                                |
| :---------------- | :------------------------------------ |
| `npm run dev`     | Serveur de développement              |
| `npm run build`   | Build de production dans `dist/`      |
| `npm run preview` | Lance le build de production en local |
| `npm run check`   | Vérifie les types de tout le projet   |

En production, le serveur se lance avec `node ./dist/server/entry.mjs` (variables `HOST` et `PORT`).

> **Piège connu (Astro 7.3, développement).** Quand `astro.config.mjs` est modifié, le serveur de dev se
> relance tout seul mais ne détecte plus les nouveaux fichiers de cours : un cours créé dans l'admin
> répond alors 404 sur le site. Il faut arrêter puis relancer `npm run dev`.

## Comment ça marche

Les pages du site sont **statiques** : générées au build à partir des fichiers Markdown de
`src/content/docs/`. Seules les routes `/admin` et `/api/admin` sont exécutées par le serveur Node.

- **Un cours** = un fichier `src/content/docs/cours/<dossiers>/<nom>.md`.
- **Le menu** = `src/content/docs/cours/_menu.json`. Les fichiers disent quels cours existent ; le menu
  dit dans quel ordre les afficher et comment s'appellent les dossiers (« Réseaux » et pas `reseaux`).
  Il permet aussi d'avoir un dossier encore vide. Un cours ajouté avec git, sans passer par l'admin,
  est rattrapé automatiquement à la fin de son dossier.
- **Côté site**, `src/starlight-menu.ts` applique ce menu à la barre latérale de Starlight.
- **Chaque action de l'admin** (enregistrer, déplacer, renommer…) modifie les fichiers concernés et le
  menu en un seul lot : **un seul commit** dans le dépôt en production.
- **Rien n'est publié sans relecture** : ce commit part dans une proposition (une pull request), publiée
  après 2 validations. Voir « Propositions et relectures ».
- **Mise à jour douce** : un lecteur qui a une page ouverte reçoit les modifications sans recharger.
  Voir plus bas.

```
src/
├── middleware.ts               Contrôle d'accès : /admin et /api/admin exigent une session
├── starlight-menu.ts           Ordre et noms du menu du site, d'après _menu.json
├── components/Head.astro       <head> de Starlight + empreintes de la page (mise à jour douce)
├── lib/build-id.ts             Identifiant du build en cours
├── lib/live-update.ts          Mise à jour douce des pages ouvertes (navigateur)
├── styles/admin.css            Styles de l'admin (thème clair / sombre)
├── pages/
│   ├── version.json.ts         Fichier statique { build } : « le site a-t-il été reconstruit ? »
│   ├── admin/
│   │   ├── index.astro         Coquille HTML de l'éditeur
│   │   ├── login.ts            Départ vers la connexion GitHub
│   │   ├── callback.ts         Retour de GitHub, ouverture de la session
│   │   └── logout.ts
│   └── api/admin/
│       ├── tree.ts             GET : arborescence des dossiers et des cours
│       ├── course.ts           GET / PUT / DELETE : un cours
│       ├── folder.ts           POST / PATCH / DELETE : un dossier
│       ├── move.ts             POST : déplacer ou réordonner (glisser-déposer)
│       ├── upload.ts           POST : envoi d'une image
│       ├── media.ts            GET : image affichée dans l'éditeur avant sa mise en ligne
│       ├── me.ts               GET : qui est connecté, où partent ses enregistrements · POST : publication directe
│       └── proposals.ts        GET : propositions, détail, page proposée · POST : avis, retrait, publication
└── lib/admin/
    ├── paths.ts                Identifiants, validation des chemins (partagé avec le navigateur)
    ├── menu.ts                 L'arbre du menu : fonctions pures, sans lecture ni écriture
    ├── library.ts              Toutes les opérations métier (cours, dossiers, déplacements)
    ├── frontmatter.ts          Fichier Markdown ↔ champs de l'éditeur
    ├── http.ts                 Enveloppe commune des routes API, erreurs
    ├── errors.ts               Erreur métier avec son code HTTP
    ├── github.ts               Petit client de l'API GitHub, avec le jeton de la personne connectée
    ├── github-oauth.ts         Connexion via GitHub (GitHub App), rôle d'après les droits sur le dépôt
    ├── proposals.ts            Propositions (pull requests) : lire, donner un avis, retirer, publier
    ├── store/                  Stockage bas niveau : lister, lire, appliquer un lot de changements
    │   ├── index.ts            Choisit le stockage : proposition, publication directe ou disque
    │   ├── local.ts            Développement : le disque
    │   └── github.ts           Production : un commit par lot sur une branche, via l'API GitHub
    └── client/                 Code exécuté dans le navigateur
        ├── main.ts             Relie l'arbre, le formulaire et l'éditeur
        ├── reviews.ts          Écran « Relectures » : liste, détail, avis
        ├── tree.ts             Arborescence : recherche, menus, glisser-déposer
        ├── markdown-editor.ts  Éditeur visuel (Milkdown Crepe) et mode Markdown
        ├── ui.ts               Dialogues, menus contextuels, notifications
        ├── api.ts              Appels à /api/admin
        └── icons.ts
```

Le chemin d'une requête, de haut en bas : `client/` → route `pages/api/admin/` (validation du format
avec zod) → `library.ts` (règles métier) → `store/` (fichiers).

### Enregistrer = un commit (production)

En développement, l'admin écrit sur le disque (`store/local.ts`) et git reste à la main. En production,
écrire sur le disque du serveur ne publierait rien : `store/github.ts` passe donc par l'API de GitHub,
avec le jeton de la personne connectée.

1. `GET /git/trees/<branche>?recursive=1` : tous les fichiers avec leur empreinte git (sha).
2. `GET /git/blobs/<sha>` : le contenu d'un fichier. Une empreinte désigne un contenu précis, donc ce
   qui a été lu une fois est gardé en mémoire sans risque d'être périmé.
3. `POST /git/trees`, `POST /git/commits`, puis `PATCH /git/refs/heads/<branche>` : toutes les créations,
   modifications, déplacements et suppressions d'une action, en **un seul commit**, au nom de l'étudiant.

La branche n'avance que si personne n'a écrit entre-temps (`force: false`) : sinon GitHub refuse et
l'admin affiche « Le dépôt a changé entre-temps ». Personne n'écrase le travail de personne. Un fichier
dont le contenu ne change pas n'est pas renvoyé, et une action qui ne change rien ne crée aucun commit.

### Propositions et relectures

Ce que l'éditeur appelle une **proposition** est une vraie pull request GitHub. Les deux façons de
contribuer (l'éditeur, ou Git) arrivent donc au même endroit et attendent les mêmes validations.

| Dans l'éditeur                            | Sur GitHub                                                       |
| :---------------------------------------- | :--------------------------------------------------------------- |
| Premier enregistrement                    | Commit sur la branche `proposition-<login>`, pull request ouverte |
| Enregistrements suivants                  | Commits sur la même branche : la proposition se met à jour       |
| « Valider », « Demander des corrections » | Une « review », faite avec le compte du relecteur                |
| 2 validations                             | Fusion automatique (squash) dans `main`, branche supprimée       |
| « Retirer ma proposition »                | Pull request fermée, branche supprimée                           |
| Référent : publication directe            | Commit sur `main`, ou fusion immédiate, raison dans l'historique |

Tant que sa proposition est ouverte, une personne lit et modifie **sa** version des pages (sa branche) ;
les autres voient le site publié. Une seule proposition ouverte par personne : tout ce qu'elle
enregistre s'y ajoute jusqu'à la publication.

**La règle des 2 validations n'est pas dans ce code.** C'est GitHub qui l'applique, par le « ruleset »
de la branche `main` : un bug ou une requête trafiquée ne peut donc pas publier sans relecture. Le code
ne fait qu'afficher le compteur (`REQUIRED_APPROVALS` dans `proposals.ts`, à garder égal au ruleset).
De même, on ne peut pas valider sa propre proposition : GitHub le refuse.

**Les rôles viennent du dépôt**, lus à la connexion : le droit d'écriture (« Write ») donne accès à
l'éditeur ; « Maintain » ou « Admin » fait un **référent**. Un référent peut publier sans attendre, en
donnant une raison : elle est écrite dans le commit (« Publication directe : … ») et en commentaire de
la proposition. Pour nommer un référent, on change son rôle sur GitHub, rien d'autre.

**Le menu bouge le moins possible.** Deux propositions qui modifient le même fichier se gênent ; or
`_menu.json` est commun à tout le monde. Une nouvelle page n'y est donc pas écrite (elle est rangée à la
fin de son dossier, comme le fait le site), et corriger un texte n'y touche pas. Seuls un rangement, un
renommage ou un dossier créé le modifient. Si deux propositions le changent quand même, la seconde est
« en conflit » : un référent règle le conflit sur GitHub.

En attendant la mise en ligne, l'éditeur affiche les images par `/api/admin/media`, et la page d'un
cours tout neuf (404) se recharge seule dès qu'elle existe.

#### Mise en place sur GitHub

1. **GitHub App** pour la connexion : voir `.env.example`. Elle remplace tout jeton de « bot » : le jeton
   d'un étudiant est limité aux permissions de l'App et au seul dépôt de la doc, il expire en 8 heures
   et ne quitte jamais la session côté serveur.
2. **Membres** : les étudiants ont le rôle « Write » sur le dépôt, les référents « Maintain ».
3. **Ruleset** sur `main` (Settings > Rules > Rulesets) :
   - « Require a pull request before merging », 2 approbations, et « Dismiss stale pull request
     approvals when new commits are pushed » (une validation ne vaut que pour la version relue) ;
   - « Require status checks to pass » : le check `build` (`.github/workflows/check.yml`) ;
   - « Bypass list » : les rôles « Maintain » et « Repository admin ».
4. **Settings > General** : cocher « Allow auto-merge », « Allow squash merging » et « Automatically
   delete head branches ». Si « Allow auto-merge » est oublié, la dernière validation faite dans
   l'éditeur déclenche quand même la publication ; une validation faite sur github.com, non.
5. Le dépôt doit contenir un premier commit. Pour essayer depuis son poste : `ADMIN_STORE=github`.

`GITHUB_REPO` et `GITHUB_BRANCH` sont lues **au build** ; les secrets (`OAUTH_*`) au démarrage du serveur.

### Mise à jour douce des pages ouvertes

En production, quand un cours est enregistré, le site est reconstruit. Les pages déjà ouvertes chez les
lecteurs se mettent à jour seules, sans rechargement ni flash (`src/lib/live-update.ts`) :

1. Au build, `components/Head.astro` écrit trois empreintes dans chaque page : le **build** (le même
   pour tout le site), le **contenu** de la page, et le **menu**.
2. Toutes les minutes, et quand l'onglet redevient visible, la page lit `/version.json` (quelques octets).
3. Si le build a changé, elle télécharge sa propre nouvelle version et compare les empreintes :
   - contenu différent → seule la zone du cours est remplacée, la position de lecture est conservée, un
     petit message apparaît quelques secondes ;
   - menu différent → le menu (et les liens précédent / suivant) est remplacé, sans message, en gardant
     les dossiers ouverts ou repliés par le lecteur ;
   - rien de différent (c'est un autre cours qui a changé) → rien ne bouge.
4. Deux cas où la page ne se modifie pas toute seule, et propose un bouton à la place : la nouvelle
   version a besoin d'un script ou d'un style que la page n'a pas (premier bloc de code d'un cours,
   nouvelle version du code du site) → « Recharger » ; la page n'existe plus → « Retour à l'accueil ».

Le délai vu par un lecteur = temps du build et du déploiement + une minute au plus. En développement le
script ne fait rien : le serveur Astro recharge déjà les pages. Pour l'essayer en local :
`npm run build`, `node ./dist/server/entry.mjs`, ouvrir un cours, modifier son fichier, relancer
`npm run build`, attendre une minute. Si un cache est placé devant le site, `/version.json` et les pages
HTML ne doivent pas y rester plus de quelques secondes.

## Sécurité : les règles du projet

- **Le serveur décide, jamais le navigateur.** Le code de `client/` n'est que de l'affichage ; toutes
  les vérifications sont dans le middleware, l'API et `library.ts`.
- **Un seul point de contrôle d'accès** : `src/middleware.ts`.
- **Un seul endroit valide les chemins** : `lib/admin/paths.ts`. Un nom de cours ou de dossier ne
  contient que des minuscules, chiffres et tirets : impossible de sortir du dossier des cours. Le
  stockage revérifie en dernier filet (`store/local.ts`), et `_menu.json` est revalidé à chaque lecture.
- **Connexion via GitHub.** Seuls les comptes ayant le droit d'écriture sur le dépôt entrent.
- **Aucun jeton durable, aucun compte « bot ».** Chaque action est faite avec le jeton de la personne
  connectée : limité par la GitHub App (contenu et pull requests du seul dépôt de la doc), valable
  8 heures, gardé dans la session côté serveur, jamais envoyé au navigateur ni écrit dans un journal.
- **GitHub est le juge.** Les 2 validations, l'interdiction de valider sa propre proposition et le
  droit de publier directement sont des règles du dépôt : ce code ne peut pas les contourner.
- **Vie privée** : les commits sont signés avec l'adresse publique du compte (`login@noreply…`), pas
  avec la vraie adresse e-mail de l'étudiant : l'historique d'un dépôt public est lisible par tous.
- **Images** : PNG, JPEG, WebP ; le format est lu dans le contenu du fichier. Pas de SVG.
- **Aucun texte saisi n'est injecté comme du HTML** dans l'admin (`textContent` partout).
- Les éditeurs sont des membres de confiance : le HTML écrit dans un cours est publié tel quel sur
  le site, comme s'il avait été poussé avec git.

## Reste à faire

- Premier commit du projet sur GitHub, puis la « Mise en place sur GitHub » décrite plus haut.
- Mise à jour du serveur à chaque publication : après une fusion dans `main`, le serveur doit récupérer
  la nouvelle version, reconstruire le site et redémarrer.
- Déploiement derrière un reverse proxy : Astro compare l'en-tête `Origin` des formulaires à l'adresse
  du site (`security.checkOrigin`). Le proxy doit transmettre `Host` et `X-Forwarded-Proto`, et
  `security.allowedDomains` doit autoriser `docs.babouins.fr`, sinon les enregistrements répondent 403.
