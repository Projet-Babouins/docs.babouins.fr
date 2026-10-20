---
title: Scripting Bash
description: Utiliser le shell Bash et automatiser des tâches avec des scripts (module 2).
---

| Module 2           |                                                                  |
| :----------------- | :--------------------------------------------------------------- |
| Prérequis          | Validation du module 1                                           |
| Objectifs          | Utiliser un shell Bash, automatiser des tâches via des scripts   |
| Bloc SIO           | B1.2                                                             |
| Notions théoriques | Fonctionnement du shell, redirections, pipes, filtres, variables, conditions, boucles |
| Compétences        | Commandes Linux courantes, écrire un script Bash fonctionnel, automatiser une tâche simple |
| Déroulé            | Cours + démonstration (2 h), TP (6 h)                            |
| Évaluation         | Script Bash noté ([Jeu du juste prix](#6-tp-noté--jeu-du-juste-prix)) |

## 1. Linux et le shell

### Qu'est-ce qu'un shell ?

Le shell est l'outil principal d'interaction entre l'utilisateur et le système d'exploitation. Comme une **coquille** autour du noyau, il permet de l'utiliser à l'aide de commandes et de programmes. Il peut être textuel ou graphique.

| Système | Shells courants                                    |
| :------ | :------------------------------------------------- |
| Windows | Interface graphique, CMD, PowerShell               |
| Linux   | Ligne de commande (**Bash**, le plus répandu), interface graphique |

### L'invite de commande (prompt)

L'invite de commande indique qui l'on est et où l'on se trouve dans le système de fichiers :

```
toto@machine1:/tmp$
```

| Élément      | Signification                                                        |
| :----------- | :------------------------------------------------------------------- |
| `toto`       | Nom de l'utilisateur                                                 |
| `machine1`   | Nom de la machine                                                    |
| `/tmp`       | Dossier courant                                                      |
| `$` (ou `>`) | Utilisateur **sans privilèges**                                      |
| `#`          | Utilisateur **root**                                                 |

### Syntaxe d'une commande

```
commande [options] [paramètres]
```

* Une option s'écrit avec un tiret et une lettre : `-a`, `-f`, `-r`.
* Plusieurs options peuvent être regroupées : `-afr` équivaut à `-a -f -r`.
* L'**espace** (ou la tabulation) sépare la commande, ses options et ses paramètres.

### Commandes de base

Le détail de ces commandes est sur la page [Commandes Linux utiles](/docs/sisr/linux/commandes-linux-utiles/).

| Commande         | Rôle                                                                     |
| :--------------- | :----------------------------------------------------------------------- |
| `ls`             | Lister le contenu d'un dossier (`-a` : fichiers cachés, `-l` : détails)  |
| `cd <dossier>`   | Changer de dossier (`cd` seul : retour au home, `cd ..` : dossier parent) |
| `pwd`            | Afficher le chemin absolu du dossier courant                             |
| `cat <fichier>`  | Afficher le contenu d'un fichier                                         |
| `touch <fichier>`| Créer un fichier vide, ou mettre à jour sa date de modification          |
| `mkdir <dossier>`| Créer un dossier                                                         |
| `rmdir <dossier>`| Supprimer un dossier **vide**                                            |
| `rm <fichier>`   | Supprimer un fichier (`rm -r` : un dossier et tout son contenu)          |
| `cp <src…> <dest>` | Copier un ou plusieurs fichiers (un fichier existant est écrasé)       |
| `mv <src…> <dest>` | Déplacer, ou renommer si le nom de destination est différent           |
| `ip a`           | Afficher la configuration réseau                                         |

Un fichier dont le nom commence par `.` est un **fichier caché**.

### Chemin absolu, chemin relatif

* **Chemin absolu** : chemin complet depuis la racine `/` (ex : `/etc/network/interfaces`).
* **Chemin relatif** : chemin depuis le dossier courant. Depuis `/etc`, le même fichier s'écrit `network/interfaces`.

### Enchaîner des commandes

```bash
commande1 ; commande2 ; commande3
```

Les commandes s'exécutent l'une après l'autre, **sans condition**.

```bash
commande1 && commande2 && commande3
```

Chaque commande ne s'exécute que si la précédente a **réussi** (code de retour `0`).

```bash
commande1 || commande2
```

`commande2` ne s'exécute que si `commande1` a **échoué** (code de retour différent de `0`).

Le code de retour de la dernière commande est disponible dans la variable `$?`.

***

## 2. Fichiers de configuration de Bash

Au démarrage, Bash exécute des scripts de configuration. Leur rôle est de préparer l'environnement de l'utilisateur (couleurs, alias, variables…). Les fichiers lus dépendent du mode de lancement.

| Mode                     | Lancé…                                                           | Fichiers exécutés                                                                         |
| :----------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| Shell de **connexion**   | juste après l'authentification en console (ou en SSH)            | `/etc/profile`, puis le **premier trouvé** parmi `~/.bash_profile`, `~/.bash_login`, `~/.profile` |
| Shell **interactif simple** | en tapant `bash` dans un shell, ou en ouvrant un terminal graphique | `~/.bashrc`                                                                            |
| Shell **non interactif** | par un script ou une tâche cron                                  | aucun, sauf le script indiqué dans la variable `BASH_ENV`, exécuté avant le script        |

À la déconnexion d'un shell de connexion, `~/.bash_logout` est exécuté.

***

## 3. Programmation Bash

Bash est un **interpréteur de commandes** : il vérifie la syntaxe de ce que l'on tape, puis l'exécute. Un **script** est un fichier qui regroupe une suite de commandes, exécutées comme si on les tapait une à une. Bash offre de vrais outils de programmation : variables, conditions, boucles, fonctions, saisies…

### Créer et exécuter un script

La première ligne d'un script (le *shebang*) indique l'interpréteur à utiliser :

```bash
#!/bin/bash

echo "Bonjour $USER"
```

Pour l'exécuter, il faut le rendre exécutable (voir [Droits Linux](/docs/sisr/linux/droits-linux/)) puis l'appeler avec son chemin :

```bash
chmod +x mon_script.sh
./mon_script.sh
```

On peut aussi le lancer sans le droit d'exécution : `bash mon_script.sh`.

Tout ce qui suit un `#` (hors shebang) est un **commentaire**, ignoré par Bash.

### Les variables

```bash
ma_variable=valeur      # pas d'espace autour du =
echo $ma_variable       # lecture : on ajoute $ devant le nom
```

Pour lire une saisie de l'utilisateur dans une variable :

```bash
echo "Entrez votre nom :"
read nom
```

**Variables spéciales**

| Variable         | Contenu                                                    |
| :--------------- | :--------------------------------------------------------- |
| `$0`             | Nom du script (tel qu'il a été appelé)                     |
| `$1`, `$2`, …    | Valeur du 1er, 2e… paramètre passé au script ou à la fonction |
| `$#`             | Nombre de paramètres passés                                |
| `$?`             | Code de retour de la dernière commande                     |

**Variables système utiles**

| Variable   | Contenu                                                       |
| :--------- | :------------------------------------------------------------ |
| `PATH`     | Liste des dossiers où Bash cherche les commandes              |
| `HOME`     | Chemin du home de l'utilisateur courant                       |
| `USER`     | Nom de l'utilisateur courant                                  |
| `HISTFILE` | Chemin du fichier d'historique des commandes                  |
| `RANDOM`   | Nombre aléatoire entre 0 et 32767 (nouveau à chaque lecture)  |

**Chaînes de caractères**

L'espace étant le séparateur, une chaîne qui en contient doit être protégée :

```bash
var=ma\ chaine\ de\ caractères     # espaces échappés avec \
var="ma chaine de caractères"      # guillemets doubles
var='ma chaine de caractères'      # guillemets simples
```

Les guillemets **doubles** remplacent les variables par leur valeur, les guillemets **simples** non :

```bash
a=toto
echo "mon prénom est $a"   # affiche : mon prénom est toto
echo 'mon prénom est $a'   # affiche : mon prénom est $a
```

Pour coller du texte juste après une variable, on entoure son nom d'accolades : `${user}_file` (alors que `$user_file` chercherait une variable nommée `user_file`).

**Calculs**

Les calculs sur des nombres entiers se font avec `$(( ))` :

```bash
total=$(( 3 + 4 ))           # 7
compteur=$(( compteur + 1 )) # incrémente compteur
reste=$(( 17 % 5 ))          # 2 (reste de la division entière)
```

### Les fonctions

```bash
function maFonction {
	echo "Premier paramètre : $1"
	echo "Deuxième paramètre : $2"
}
```

L'appel se fait simplement par son nom (sensible à la casse), suivi des éventuels paramètres :

```bash
maFonction param1 param2
```

Dans la fonction, `$1`, `$2`… contiennent les paramètres **de la fonction**, et non ceux du script.

### Opérateurs

| Opérateurs            | Rôle                                                   |
| :-------------------- | :----------------------------------------------------- |
| `+` `-` `*` `/` `%`   | Opérations mathématiques (dans `$(( ))` ou `(( ))`)    |
| `<` `>` `<=` `>=`     | Inférieur, supérieur, inférieur ou égal, supérieur ou égal (dans `(( ))`) |
| `==` `!=`             | Égal, différent                                        |
| `&&` `\|\|`           | Et, ou                                                 |

Dans un test `[ ]`, `<` et `>` ne comparent pas des nombres : on utilise `-lt`, `-gt`… (voir [Les tests](#les-tests)).

### Les conditions

**if**

```bash
if [ condition ]
then
	commandes
elif [ condition2 ]
then
	commandes
else
	commandes
fi
```

**case**

```bash
echo "Entrez un choix"
read choix
case $choix in
	1)
		echo "Choix 1" ;;
	2)
		echo "Choix 2" ;;
	3)
		echo "Choix 3" ;;
	*)
		echo "Choix par défaut" ;;
esac
```

### Les boucles

**while** : exécute le bloc `do … done` **tant que** la condition est vraie.

```bash
while [ condition ]
do
	commandes
done
```

**until** : exécute le bloc `do … done` **jusqu'à ce que** la condition devienne vraie.

```bash
until [ condition ]
do
	commandes
done
```

**for** : répète le bloc un nombre de fois défini.

```bash
for (( compteur=1; compteur<=10; compteur++ ))
do
	echo -n "$compteur "
done
```

### Les tests

Un test s'écrit entre crochets, **avec un espace après `[` et avant `]`** :

```bash
[ chose_à_tester ]
```

Il s'utilise dans un `if`, un `while` ou un `until`. Pensez à mettre les variables entre guillemets (`"$var"`) : si elle est vide, le test reste valide.

**Sur les fichiers**

| Option          | Vrai si…                                     |
| :-------------- | :------------------------------------------- |
| `-e`            | le fichier existe                            |
| `-f`            | c'est un fichier classique                   |
| `-d`            | c'est un dossier                             |
| `-r` / `-w` / `-x` | il est lisible / modifiable / exécutable  |
| `-s`            | il n'est pas vide                            |

```bash
if [ -e monfichier ]
then
	echo "Le fichier existe"
fi
```

**Sur les chaînes de caractères**

| Option      | Vrai si…                                     |
| :---------- | :------------------------------------------- |
| `-z`        | la chaîne est vide                           |
| `-n`        | la chaîne n'est pas vide                     |
| `=` / `!=`  | les chaînes sont identiques / différentes    |

```bash
if [ "$chaine1" = "$chaine2" ]
then
	echo "Identiques"
fi

if [ -n "$chaine" ]
then
	echo "La chaîne n'est pas vide"
fi
```

**Sur les nombres**

| Option          | Vrai si…                                       |
| :-------------- | :--------------------------------------------- |
| `-eq` / `-ne`   | égal / différent                               |
| `-lt` / `-gt`   | strictement inférieur / strictement supérieur  |
| `-le` / `-ge`   | inférieur ou égal / supérieur ou égal          |

```bash
if [ "$n1" -eq "$n2" ]
then
	echo "Égaux"
fi
```

**Tests multiples**

```bash
if [ "$a" -gt 0 ] && [ "$a" -lt 10 ]
then
	echo "a est compris entre 1 et 9"
fi

if [ -z "$1" ] || [ "$1" = "--help" ]
then
	echo "Aide"
fi
```

***

## 4. Redirections et pipes

### Les canaux

Les canaux sont les points d'entrée et de sortie des informations d'un programme :

| Canal    | Descripteur | Rôle                                   | Par défaut |
| :------- | :---------- | :------------------------------------- | :--------- |
| `stdin`  | `0`         | Entrée standard                        | Clavier    |
| `stdout` | `1`         | Sortie standard (résultats)            | Écran      |
| `stderr` | `2`         | Sortie d'erreur (messages d'erreur)    | Écran      |

Les chevrons permettent de rediriger ces canaux vers des fichiers (ou depuis des fichiers).

### Redirection de sortie

```bash
ls -l > sortie.txt
cat sortie.txt
```

* `>` crée le fichier s'il n'existe pas et **écrase** son contenu s'il existe. Le fichier est créé avant que la commande soit lancée.
* `>>` **ajoute** à la fin du fichier, sans écraser.

| Syntaxe                                         | Effet                                                    |
| :---------------------------------------------- | :------------------------------------------------------- |
| `commande > fichier` ou `commande 1> fichier`   | Sortie standard vers le fichier                          |
| `commande >> fichier`                           | Sortie standard ajoutée à la fin du fichier              |
| `commande 2> fichier`                           | Sortie d'erreur vers le fichier                          |
| `commande > fichier 2>&1` ou `commande &> fichier` | Sortie standard **et** erreurs vers le fichier        |

```bash
echo "une ligne de plus" >> journal.log
find / -name "*.conf" 2> /dev/null   # masque les erreurs
```

### Redirection d'entrée

Une commande qui attend des données au clavier peut les lire depuis un fichier avec `<` :

```bash
wc < sortie.txt
```

```
 2 11 65
```

### Les pipes et les filtres

Le pipe `|` envoie la sortie d'une commande dans l'entrée de la suivante. Les **filtres** sont des commandes qui lisent un flux, le transforment et le renvoient :

```bash
ls -l | wc -l                # nombre de lignes affichées par ls -l
cat /etc/passwd | grep toto  # lignes contenant « toto »
tail -n 5 scores.txt         # 5 dernières lignes d'un fichier
```

***

## 5. Travaux pratiques

### Création d'un fichier script

1. Connectez-vous en root et placez-vous dans `/root/`.
2. Créez un fichier `create_file.sh` et un fichier `template`.
3. Éditez `create_file.sh` pour :
   * créer un dossier `/root/user1` ;
   * créer un fichier `/root/user1/user1_file` ;
   * copier le fichier `template` dans `/root/user1` ;
   * renommer cette copie en `template_user1`.

<details>
<summary>Solution</summary>

```bash
su -
cd /root
touch create_file.sh template
nano create_file.sh
```

Contenu de `create_file.sh` :

```bash
#!/bin/bash

mkdir /root/user1
touch /root/user1/user1_file
cp /root/template /root/user1/
mv /root/user1/template /root/user1/template_user1
```

</details>

### Ajout de variables

Créez des variables pour ne pas répéter le chemin du dossier et le nom d'utilisateur, puis utilisez-les dans le script.

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

user=user1
dossier=/root

mkdir $dossier/$user
touch $dossier/$user/${user}_file
cp $dossier/template $dossier/$user/
mv $dossier/$user/template $dossier/$user/template_$user
```

</details>

### Passage de paramètres

Remplacez la variable `user`, écrite « en dur », par une variable spéciale qui récupère le paramètre passé au script :

```
root@vm:~# ./create_file.sh user2
```

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

user=$1
dossier=/root

mkdir $dossier/$user
touch $dossier/$user/${user}_file
cp $dossier/template $dossier/$user/
mv $dossier/$user/template $dossier/$user/template_$user
```

</details>

### Script de création d'utilisateur

Écrivez un script qui :

* définit dans des variables le nom d'utilisateur, le shell, le home et le groupe ;
* crée l'utilisateur avec `useradd` (voir [Droits Linux](/docs/sisr/linux/droits-linux/)) ;
* définit son mot de passe ;
* affiche des messages pour informer de l'opération en cours.

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

username=user2
shell=/bin/bash
group=sudo
home=/home/user2

echo "Création de l'utilisateur $username, définition de son shell à $shell, ajout dans le groupe $group"
useradd $username -s $shell -g $group -m -d $home
echo "Entrez le mot de passe pour l'utilisateur $username"
passwd $username
```

</details>

### Valeurs passées en paramètres

Au lieu d'écrire les valeurs en dur, récupérez-les dans les paramètres du script : `./create_user.sh username shell group home`.

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

username=$1
shell=$2
group=$3
home=$4

echo "Création de l'utilisateur $username, définition de son shell à $shell, ajout dans le groupe $group"
useradd $username -s $shell -g $group -m -d $home
echo "Entrez le mot de passe pour l'utilisateur $username"
passwd $username
```

</details>

### Ajout d'une aide

Si le premier paramètre vaut `--help`, affichez un rappel de l'utilisation de la commande au lieu de créer l'utilisateur.

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

if [ "$1" = "--help" ]
then
	echo "Utilisation de la commande : $0 username shell group home"
else
	username=$1
	shell=$2
	group=$3
	home=$4

	echo "Création de l'utilisateur $username, définition de son shell à $shell, ajout dans le groupe $group"
	useradd $username -s $shell -g $group -m -d $home
	echo "Entrez le mot de passe pour l'utilisateur $username"
	passwd $username
fi
```

</details>

### Ajout d'un mode interactif

Avec le paramètre `-i`, le script demande chaque valeur à l'utilisateur.

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

if [ "$1" = "-i" ]
then
	echo "Entrez le nom d'utilisateur :"
	read username
	echo "Entrez le shell :"
	read shell
	echo "Entrez le groupe principal :"
	read group
	echo "Entrez le home utilisateur :"
	read home

	echo "Création de l'utilisateur $username, définition de son shell à $shell, ajout dans le groupe $group"
	useradd $username -s $shell -g $group -m -d $home
	echo "Entrez le mot de passe pour l'utilisateur $username"
	passwd $username

elif [ "$1" = "--help" ]
then
	echo "Utilisation de la commande : $0 username shell group home"
	echo "Mode interactif : $0 -i"

else
	username=$1
	shell=$2
	group=$3
	home=$4

	echo "Création de l'utilisateur $username, définition de son shell à $shell, ajout dans le groupe $group"
	useradd $username -s $shell -g $group -m -d $home
	echo "Entrez le mot de passe pour l'utilisateur $username"
	passwd $username
fi
```

</details>

### Gestion des erreurs

Améliorez le script pour vérifier :

* qu'il reçoit bien **4 paramètres** ;
* qu'**aucun** paramètre n'est vide.

En cas d'erreur, affichez un message puis l'aide. Profitez-en pour supprimer la répétition du mode interactif : une fois les valeurs saisies, le script peut se relancer lui-même avec `$0`.

<details>
<summary>Solution</summary>

```bash
#!/bin/bash

if [ "$1" = "-i" ]
then
	echo "Entrez le nom d'utilisateur :"
	read username
	echo "Entrez le shell :"
	read shell
	echo "Entrez le groupe principal :"
	read group
	echo "Entrez le home utilisateur :"
	read home

	# Le script se relance avec les valeurs saisies : elles passent par les mêmes vérifications
	"$0" "$username" "$shell" "$group" "$home"

elif [ "$1" = "--help" ] || [ -z "$1" ]
then
	echo "Utilisation de la commande : $0 username shell group home"
	echo "Mode interactif : $0 -i"

elif [ $# -ne 4 ]
then
	echo "Paramètres manquants"
	"$0" --help

elif [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]
then
	echo "Tous les paramètres doivent être renseignés"
	"$0" --help

else
	username=$1
	shell=$2
	group=$3
	home=$4

	echo "Création de l'utilisateur $username, définition de son shell à $shell, ajout dans le groupe $group"
	useradd $username -s $shell -g $group -m -d $home
	echo "Entrez le mot de passe pour l'utilisateur $username"
	passwd $username
fi
```

Les guillemets autour de `"$username"`, `"$shell"`… sont importants : sans eux, une valeur laissée vide disparaîtrait au lieu d'être transmise comme paramètre vide, et le script afficherait « Paramètres manquants » au lieu de « Tous les paramètres doivent être renseignés ».

</details>

***

## 6. TP noté : jeu du juste prix

Écrivez en Bash le jeu du juste prix :

* demander à l'utilisateur son pseudo ;
* générer un nombre aléatoire entre 0 et 100 ;
* indiquer à chaque étape ce que l'utilisateur doit faire ;
* afficher « C'est plus » si le nombre proposé est trop petit, « C'est moins » s'il est trop grand ;
* afficher « Gagné » quand le bon nombre est trouvé, avec le **nombre d'essais** ;
* écrire le score dans un fichier, sur une nouvelle ligne ;
* afficher le tableau des **5 derniers scores** en lisant ce fichier.

### Aide

| Besoin                                    | Instruction                                     |
| :---------------------------------------- | :---------------------------------------------- |
| Répéter tant que le nombre n'est pas trouvé | boucle `while`                                |
| Nombre aléatoire entre 0 et 100           | `nombre=$((RANDOM % 101))`                      |
| Afficher un message                       | `echo "message"`                                |
| Écrire à la fin d'un fichier              | `echo "texte" >> fichier` ou `echo $variable >> fichier` |
| Afficher les 5 dernières lignes d'un fichier | `tail -5 fichier`                            |

### Rendu attendu

* Le script, exporté.
* Des captures d'écran prouvant qu'il fonctionne.
* Un script **indenté** et **commenté** pour en expliquer le fonctionnement.

### Barème

| Critère                                                                      | Points |
| :--------------------------------------------------------------------------- | :----- |
| Le script n'utilise que des instructions vues en cours ou données dans l'énoncé | 5   |
| Script commenté                                                              | 2      |
| Script correctement indenté                                                  | 2      |
| Script fonctionnel                                                           | 8      |
| Lisibilité et clarté de la documentation                                     | 3      |
| **Total**                                                                    | **20** |
