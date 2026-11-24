---
title: Couleurs du shell
description: Mettre de la couleur dans le terminal Linux (invite, ls, grep) pour un utilisateur ou pour tous.
---

## 1. Principe

Par défaut, un terminal peut être tout blanc sur noir. Avec un peu de configuration, on peut colorer :

- l'invite de commande (`toto@machine1:/tmp$`) ;
- le résultat de `ls` (dossiers, exécutables, liens, archives…) ;
- le résultat de `grep`, `diff`, `ip`…

Cette configuration est écrite dans les fichiers lus au démarrage de Bash (voir la page [Scripting Bash](/docs/sisr/linux/scripting-bash/)) :

| Portée                | Fichier                                                         |
| :-------------------- | :-------------------------------------------------------------- |
| Un seul utilisateur   | `~/.bashrc`                                                     |
| Tous les utilisateurs | `/etc/profile.d/colors.sh` (et `/etc/bash.bashrc` ou `/etc/bashrc`) |

Sur Debian et Ubuntu, le `~/.bashrc` fourni par défaut contient déjà une invite colorée et un `ls --color=auto`. Cette page explique comment ça fonctionne et comment le refaire soi-même.

***

## 2. Les codes couleur

Une couleur s'écrit avec une **séquence d'échappement** : `\e[` + un code + `m`.

```
\e[1;32m   → vert et gras
\e[0m      → retour à la normale (reset)
```

| Code | Couleur |
| :--- | :------ |
| `30` | noir    |
| `31` | rouge   |
| `32` | vert    |
| `33` | jaune   |
| `34` | bleu    |
| `35` | magenta |
| `36` | cyan    |
| `37` | blanc   |

Le chiffre `1;` devant le code ajoute le gras (et donne une couleur plus vive) : `1;34` = bleu gras. Penser à toujours finir par `\e[0m`, sinon la couleur « déborde » sur la suite du texte.

***

## 3. Colorer l'invite de commande

L'invite est stockée dans la variable `PS1`. Pour la tester, il suffit de la modifier dans le terminal (le changement disparaît en le fermant) :

```bash
PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
```

| Élément  | Signification                                  |
| :------- | :--------------------------------------------- |
| `\u`     | Nom de l'utilisateur                           |
| `\h`     | Nom de la machine                              |
| `\w`     | Dossier courant                                |
| `\$`     | `$` pour un utilisateur normal, `#` pour root  |
| `\[ \]`  | Entourent les codes couleur (obligatoire)      |

Les `\[` et `\]` disent à Bash que ces caractères ne s'affichent pas. Sans eux, il se trompe sur la longueur de la ligne et le texte tapé se « mélange » quand on utilise les flèches.

Pour rendre le changement permanent, ajouter la ligne `PS1=...` à la fin de `~/.bashrc`, puis recharger :

```bash
source ~/.bashrc
```

***

## 4. Colorer `ls`

### Activer la couleur

L'option `--color=auto` colore la sortie de `ls` uniquement quand elle s'affiche dans un terminal :

```bash
ls --color=auto
```

Pour ne pas avoir à la taper, on crée un alias dans `~/.bashrc` :

```bash
alias ls='ls --color=auto'
alias ll='ls -alF --color=auto'
```

### Couleurs par défaut

| Type de fichier                        | Couleur         |
| :------------------------------------- | :-------------- |
| Dossier                                | bleu gras       |
| Exécutable                             | vert gras       |
| Lien symbolique                        | cyan gras       |
| Lien cassé                             | rouge sur noir  |
| Archive (`.tar`, `.zip`, `.gz`…)       | rouge gras      |
| Image (`.png`, `.jpg`…)                | magenta gras    |
| Fichier SetUID                         | blanc sur rouge |
| Dossier avec sticky bit (ex : `/tmp`)  | noir sur vert   |

### La variable `LS_COLORS`

Ces couleurs viennent de la variable `LS_COLORS`. On ne l'écrit pas à la main : la commande `dircolors` la génère.

```bash
eval "$(dircolors -b)"
```

Pour la modifier, on exporte d'abord la configuration par défaut dans un fichier, puis on l'édite :

```bash
dircolors --print-database > ~/.dircolors
nano ~/.dircolors
```

Chaque ligne associe un type (ou une extension) à un code couleur :

```
DIR 01;34      # dossiers : bleu gras
EXEC 01;32     # exécutables : vert gras
.sh 01;33      # fichiers .sh : jaune gras
.log 00;90     # fichiers .log : gris
```

Pour l'utiliser, remplacer la ligne précédente dans `~/.bashrc` :

```bash
eval "$(dircolors -b ~/.dircolors)"
```

***

## 5. Colorer `grep`, `diff` et `ip`

Même principe, avec des alias dans `~/.bashrc` :

```bash
alias grep='grep --color=auto'
alias diff='diff --color=auto'
alias ip='ip -color=auto'
```

`grep` met alors en rouge le texte trouvé dans chaque ligne.

***

## 6. Pour tous les utilisateurs

Plutôt que de modifier le `~/.bashrc` de chaque utilisateur, on crée un script dans `/etc/profile.d/`. Tous les fichiers `.sh` de ce dossier sont exécutés à l'ouverture d'une session.

```bash
sudo nano /etc/profile.d/colors.sh
```

```bash
# Couleurs pour tous les utilisateurs
if [ -t 1 ] && [ -n "$BASH_VERSION" ]; then

    # Invite : rouge pour root, vert pour les autres
    if [ "$(id -u)" -eq 0 ]; then
        PS1='\[\e[1;31m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
    else
        PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
    fi

    # Couleurs de ls
    eval "$(dircolors -b)"

    # Alias
    alias ls='ls --color=auto'
    alias ll='ls -alF --color=auto'
    alias grep='grep --color=auto'
    alias diff='diff --color=auto'
    alias ip='ip -color=auto'
fi
```

Les utilisateurs doivent ouvrir une nouvelle session pour voir le changement.

### Terminaux sans connexion

Le dossier `/etc/profile.d/` n'est lu que par les **shells de connexion**. Pour un terminal ouvert dans l'interface graphique, ou après un `su`, on ajoute une ligne au fichier Bash global :

| Distribution              | Fichier            |
| :------------------------ | :----------------- |
| Debian, Ubuntu            | `/etc/bash.bashrc` |
| RedHat, Fedora, AlmaLinux | `/etc/bashrc`      |

```bash
echo '[ -r /etc/profile.d/colors.sh ] && . /etc/profile.d/colors.sh' | sudo tee -a /etc/bash.bashrc
```

### Attention au `~/.bashrc` des utilisateurs

Sur Debian et Ubuntu, le `~/.bashrc` de chaque utilisateur est lu **après** les fichiers globaux et redéfinit `PS1`. Il écrase donc l'invite du script global.

- Pour les utilisateurs existants : supprimer ou commenter le bloc `PS1` dans leur `~/.bashrc`.
- Pour les futurs utilisateurs : modifier le modèle `/etc/skel/.bashrc`, copié dans le home à la création du compte.

***

## Mémo rapide

| Besoin                                 | Commande                                    |
| :------------------------------------- | :------------------------------------------ |
| Tester une invite colorée              | `PS1='\[\e[1;32m\]\u@\h\[\e[0m\]\$ '`       |
| Recharger la configuration             | `source ~/.bashrc`                          |
| Colorer `ls`                           | `alias ls='ls --color=auto'`                |
| Générer `LS_COLORS`                    | `eval "$(dircolors -b)"`                    |
| Exporter la configuration des couleurs | `dircolors --print-database > ~/.dircolors` |
| Colorer `grep`                         | `alias grep='grep --color=auto'`            |
| Configuration pour tous                | `/etc/profile.d/colors.sh`                  |
| Modèle des futurs utilisateurs         | `/etc/skel/.bashrc`                         |
