---
title: Droits Linux
---

## 1. Utilisateurs et groupes

### Commandes

| Action       | Utilisateur | Groupe     |
| :----------- | :---------- | :--------- |
| Création     | `useradd`   | `groupadd` |
| Modification | `usermod`   | `groupmod` |
| Suppression  | `userdel`   | `groupdel` |

### Options courantes de `useradd` / `usermod`

| Option        | Rôle                                                                                         |
| :------------ | :------------------------------------------------------------------------------------------- |
| `-s <shell>`  | Shell de connexion (ex : `/bin/bash`)                                                        |
| `-m`          | Crée le répertoire personnel (home)                                                          |
| `-d <chemin>` | Chemin du home (si on n'utilise pas le chemin par défaut)                                    |
| `-g <groupe>` | Groupe principal                                                                             |
| `-G <g1,g2>`  | Groupes secondaires (avec `usermod`, ajouter `-a` pour ne pas écraser les groupes existants) |

```
useradd -m -s /bin/bash -g compta toto
usermod -aG sudo toto
groupadd compta

```

### Mot de passe : `passwd`

`passwd <user>` : définit le mot de passe de l'utilisateur.

| Option   | Rôle                                                                         |
| :------- | :--------------------------------------------------------------------------- |
| `-l`     | Lock : verrouille le compte                                                  |
| `-u`     | Unlock : déverrouille le compte                                              |
| `-d`     | Supprime le mot de passe                                                     |
| `-n <j>` | Durée de vie minimale du mot de passe (en jours)                             |
| `-x <j>` | Durée de vie maximale du mot de passe (en jours)                             |
| `-w <j>` | Nombre de jours d'avertissement avant expiration                             |
| `-i <j>` | Délai de grâce avant désactivation du compte une fois le mot de passe expiré |

```
passwd toto
passwd -x 90 -w 7 toto
passwd -l toto

```

***

## 2. Fichiers de configuration

### `/etc/passwd` : les utilisateurs

Une ligne par utilisateur, 7 champs séparés par `:`

```
toto:x:1001:1001:Toto Dupont:/home/toto:/bin/bash

```

| #  | Champ                                          |
| :- | :--------------------------------------------- |
| 1  | Nom d'utilisateur                              |
| 2  | Mot de passe (`x` = stocké dans `/etc/shadow`) |
| 3  | UID (identifiant utilisateur)                  |
| 4  | GID du groupe principal                        |
| 5  | Informations personnelles (champ GECOS)        |
| 6  | Répertoire personnel (home)                    |
| 7  | Shell de connexion                             |

### `/etc/group` : les groupes

```
compta:x:1002:toto,titi

```

| #  | Champ                                                           |
| :- | :-------------------------------------------------------------- |
| 1  | Nom du groupe                                                   |
| 2  | Mot de passe (non utilisé, `x`)                                 |
| 3  | GID (identifiant du groupe)                                     |
| 4  | Liste des membres (groupe secondaire), séparés par des virgules |

### `/etc/shadow` : les mots de passe

Les mots de passe sont stockés **hachés** (SHA-512, ou yescrypt sur les distributions récentes) et le fichier n'est lisible que par root. Historiquement, ils étaient stockés dans `/etc/passwd`, lisible par tous.

```
toto:$6$sel$hash...:20380:0:90:7:14::

```

| #  | Champ                                                                   |
| :- | :---------------------------------------------------------------------- |
| 1  | Nom d'utilisateur                                                       |
| 2  | Mot de passe haché (`!` ou `*` = compte verrouillé / sans mot de passe) |
| 3  | Date du dernier changement (en jours depuis le 01/01/1970)              |
| 4  | Âge minimum du mot de passe (jours)                                     |
| 5  | Âge maximum du mot de passe (jours)                                     |
| 6  | Période d'avertissement avant expiration (jours)                        |
| 7  | Période d'inactivité après expiration (jours)                           |
| 8  | Date d'expiration du compte                                             |
| 9  | Champ réservé                                                           |

***

## 3. Droits sur les fichiers

### Principe

Chaque objet (fichier ou répertoire) possède :

* un **utilisateur propriétaire**
* un **groupe propriétaire**

Trois catégories de droits lui sont associées :

| Lettre | Catégorie                       |
| :----- | :------------------------------ |
| `u`    | Utilisateur propriétaire (user) |
| `g`    | Groupe propriétaire (group)     |
| `o`    | Les autres (other)              |

Chaque catégorie est codée sur **3 bits** :

| Position du bit | Droit                     | Valeur |
| :-------------- | :------------------------ | :----- |
| 2               | `r` : read (lecture)      | 4      |
| 1               | `w` : write (écriture)    | 2      |
| 0               | `x` : execute (exécution) | 1      |

### `chmod` en mode symbolique

```
chmod u=rwx fichier   # droits de l'utilisateur
chmod g=rx  fichier   # droits du groupe
chmod o=r   fichier   # droits des autres

```

On peut aussi ajouter ou retirer un droit : `chmod g+w fichier`, `chmod o-r fichier`.

### `chmod` en mode octal

On additionne les valeurs : `r = 4`, `w = 2`, `x = 1`.

| Droits | Calcul    | Valeur |
| :----- | :-------- | :----- |
| `rwx`  | 4 + 2 + 1 | 7      |
| `rw-`  | 4 + 2     | 6      |
| `r-x`  | 4 + 1     | 5      |
| `r--`  | 4         | 4      |
| `---`  | 0         | 0      |

Syntaxe : `chmod <user><group><other> fichier`

```
chmod 754 fichier   # rwx pour user, r-x pour group, r-- pour other

```

### Propriétaires : `chown` et `chgrp`

```
chown toto fichier         # change l'utilisateur propriétaire
chgrp grp fichier          # change le groupe propriétaire
chown toto:grp fichier     # les deux en une seule commande

```

Option utile : `-R` pour appliquer récursivement à un répertoire.

***

## 4. Droits spéciaux

Les droits spéciaux s'ajoutent en **premier chiffre** de la valeur octale.

| Droit      | Valeur octale | Emplacement dans `ls -l`   |
| :--------- | :------------ | :------------------------- |
| SetUID     | 4             | à la place du `x` de user  |
| SetGID     | 2             | à la place du `x` de group |
| Sticky bit | 1             | à la place du `x` de other |

Règle d'affichage : **minuscule** (`s`, `t`) si le droit `x` est présent, **majuscule** (`S`, `T`) s'il est absent.

### SetUID / SetGID

Permettent d'exécuter un fichier avec les droits de l'utilisateur (SetUID) ou du groupe (SetGID) **propriétaire du fichier**, et non de l'utilisateur courant. Exemple classique : `/usr/bin/passwd` est SetUID root, ce qui permet à un utilisateur de modifier `/etc/shadow`.

Sur un **répertoire**, le SetGID fait hériter aux nouveaux fichiers le groupe du répertoire (pratique pour les dossiers partagés).

```
chmod 4775 monfichier   # SetUID
chmod 2775 monfichier   # SetGID

```

**SetUID :**

```
chmod 4650  →  -rwSr-x---  1 sysdaxx sysdaxx  3089 févr.  7 14:21  test.txt
chmod 4750  →  -rwsr-x---  1 sysdaxx sysdaxx  3089 févr.  7 14:21  test.txt

```

**SetGID :**

```
chmod 2760  →  -rwxrwS---  1 sysdaxx sysdaxx  3089 févr.  7 14:21  test.txt
chmod 2770  →  -rwxrws---  1 sysdaxx sysdaxx  3089 févr.  7 14:21  test.txt

```

### Sticky bit

S'applique aux **répertoires** : dans un répertoire où tout le monde a le droit d'écriture, seul le propriétaire d'un fichier (ou root) peut le supprimer ou le renommer. Exemple typique : `/tmp` (`drwxrwxrwt`).

```
chmod 1777 /partage

```

```
chmod 1776  →  -rwxrwxrwT  1 sysdaxx sysdaxx  3089 févr.  7 14:21  test.txt
chmod 1777  →  -rwxrwxrwt  1 sysdaxx sysdaxx  3089 févr.  7 14:21  test.txt

```

***

## Mémo rapide

| Besoin                                  | Commande                            |
| :-------------------------------------- | :---------------------------------- |
| Créer un utilisateur avec home et bash  | `useradd -m -s /bin/bash toto`      |
| Ajouter à un groupe secondaire          | `usermod -aG grp toto`              |
| Définir le mot de passe                 | `passwd toto`                       |
| Verrouiller / déverrouiller             | `passwd -l toto` / `passwd -u toto` |
| Voir les groupes d'un utilisateur       | `id toto` ou `groups toto`          |
| Changer les droits                      | `chmod 754 fichier`                 |
| Changer propriétaire et groupe          | `chown toto:grp fichier`            |
| Dossier partagé avec héritage du groupe | `chmod 2770 dossier`                |
| Dossier commun protégé                  | `chmod 1777 dossier`                |
