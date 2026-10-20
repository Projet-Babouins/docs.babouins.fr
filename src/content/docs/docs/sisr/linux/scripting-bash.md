---
title: Scripting Bash
description: Utiliser le shell Bash et automatiser des tâches avec des scripts.
---

## 1. Le shell

### Principe

Le shell est l'interface entre l'utilisateur et le système d'exploitation : une **coquille** autour du noyau, qui permet de l'utiliser avec des commandes et des programmes. Il peut être textuel ou graphique.

| Système | Shells courants                                                    |
| :------ | :----------------------------------------------------------------- |
| Windows | Interface graphique, CMD, PowerShell                               |
| Linux   | Ligne de commande (**Bash**, le plus répandu), interface graphique |

### L'invite de commande

```
toto@machine1:/tmp$
```

| Élément      | Signification                   |
| :----------- | :------------------------------ |
| `toto`       | Nom de l'utilisateur            |
| `machine1`   | Nom de la machine               |
| `/tmp`       | Dossier courant                 |
| `$` (ou `>`) | Utilisateur **sans privilèges** |
| `#`          | Utilisateur **root**            |

### Syntaxe d'une commande

```
commande [options] [paramètres]
```

* Une option s'écrit avec un tiret et une lettre : `-a`, `-f`, `-r`.
* Plusieurs options peuvent être regroupées : `-afr` équivaut à `-a -f -r`.
* L'**espace** (ou la tabulation) sépare la commande, ses options et ses paramètres.

Les commandes de base (`ls`, `cd`, `cp`, `mv`, `rm`…) sont détaillées sur la page [Commandes Linux utiles](/docs/sisr/linux/commandes-linux-utiles/).

### Chemin absolu, chemin relatif

* **Chemin absolu** : chemin complet depuis la racine `/` (ex : `/etc/network/interfaces`).
* **Chemin relatif** : chemin depuis le dossier courant. Depuis `/etc`, le même fichier s'écrit `network/interfaces`.

Un fichier dont le nom commence par `.` est un **fichier caché**.

### Enchaîner des commandes

| Syntaxe          | Effet                                                              |
| :--------------- | :----------------------------------------------------------------- |
| `cmd1 ; cmd2`    | `cmd2` s'exécute après `cmd1`, **sans condition**                  |
| `cmd1 && cmd2`   | `cmd2` ne s'exécute que si `cmd1` a **réussi** (code de retour `0`) |
| `cmd1 \|\| cmd2` | `cmd2` ne s'exécute que si `cmd1` a **échoué**                     |

Le code de retour de la dernière commande est disponible dans la variable `$?`.

***

## 2. Fichiers de configuration de Bash

Au démarrage, Bash exécute des scripts qui préparent l'environnement de l'utilisateur (couleurs, alias, variables…). Les fichiers lus dépendent du mode de lancement.

| Mode               | Lancement                                            | Fichiers exécutés                                                                                  |
| :----------------- | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| Connexion          | Après l'authentification en console ou en SSH        | `/etc/profile`, puis le **premier trouvé** parmi `~/.bash_profile`, `~/.bash_login`, `~/.profile` |
| Interactif simple  | Commande `bash`, ou terminal en interface graphique  | `~/.bashrc`                                                                                        |
| Non interactif     | Script, tâche cron                                   | Aucun, sauf le script indiqué dans la variable `BASH_ENV`                                          |

À la déconnexion d'un shell de connexion, `~/.bash_logout` est exécuté.

***

## 3. Écrire un script

### Créer et exécuter un script

Un script est un fichier qui regroupe une suite de commandes. Sa première ligne (le *shebang*) indique l'interpréteur à utiliser :

```bash
#!/bin/bash

# Ceci est un commentaire
echo "Bonjour $USER"
```

Pour l'exécuter, on le rend exécutable (voir [Droits Linux](/docs/sisr/linux/droits-linux/)) puis on l'appelle avec son chemin :

```bash
chmod +x mon_script.sh
./mon_script.sh
```

Sans le droit d'exécution : `bash mon_script.sh`.

### Variables

```bash
ma_variable=valeur      # pas d'espace autour du =
echo $ma_variable       # lecture : $ devant le nom
read nom                # saisie de l'utilisateur dans la variable nom
```

Pour coller du texte juste après une variable, on entoure son nom d'accolades : `${user}_file` (`$user_file` chercherait une variable nommée `user_file`).

**Variables spéciales**

| Variable      | Contenu                                                       |
| :------------ | :------------------------------------------------------------ |
| `$0`          | Nom du script, tel qu'il a été appelé                         |
| `$1`, `$2`, … | Valeur du 1er, 2e… paramètre passé au script ou à la fonction |
| `$#`          | Nombre de paramètres passés                                   |
| `$?`          | Code de retour de la dernière commande                        |

**Variables système utiles**

| Variable   | Contenu                                                      |
| :--------- | :----------------------------------------------------------- |
| `PATH`     | Dossiers dans lesquels Bash cherche les commandes            |
| `HOME`     | Home de l'utilisateur courant                                |
| `USER`     | Nom de l'utilisateur courant                                 |
| `HISTFILE` | Fichier d'historique des commandes                           |
| `RANDOM`   | Nombre aléatoire entre 0 et 32767 (nouveau à chaque lecture) |

### Chaînes de caractères

L'espace étant le séparateur, une chaîne qui en contient doit être protégée :

```bash
var=ma\ chaine\ de\ caractères     # espaces échappés avec \
var="ma chaine de caractères"      # guillemets doubles
var='ma chaine de caractères'      # guillemets simples
```

Les guillemets **doubles** remplacent les variables par leur valeur, les guillemets **simples** non :

```bash
a=toto
echo "mon prénom est $a"   # mon prénom est toto
echo 'mon prénom est $a'   # mon prénom est $a
```

### Calculs

Les calculs sur des entiers se font avec `$(( ))` :

```bash
total=$(( 3 + 4 ))             # 7
compteur=$(( compteur + 1 ))   # incrémente compteur
reste=$(( 17 % 5 ))            # 2 (reste de la division entière)
```

| Opérateurs               | Rôle                                                  |
| :----------------------- | :---------------------------------------------------- |
| `+` `-` `*` `/` `%`      | Addition, soustraction, multiplication, division, reste |
| `<` `>` `<=` `>=`        | Comparaisons (dans `(( ))` uniquement)                |
| `==` `!=`                | Égal, différent                                       |
| `&&` `\|\|`              | Et, ou                                                |

Dans un test `[ ]`, `<` et `>` ne comparent pas des nombres : on utilise `-lt`, `-gt`… (voir la partie 4).

### Fonctions

```bash
function maFonction {
	echo "Premier paramètre : $1"
	echo "Deuxième paramètre : $2"
}

maFonction param1 param2   # appel
```

Dans la fonction, `$1`, `$2`… sont les paramètres **de la fonction**, pas ceux du script.

***

## 4. Conditions et boucles

### Tests

Un test s'écrit entre crochets, **avec un espace après `[` et avant `]`**. Mettre les variables entre guillemets (`"$var"`) évite une erreur quand elles sont vides.

**Sur les fichiers**

| Option             | Vrai si…                                  |
| :----------------- | :---------------------------------------- |
| `-e`               | le fichier existe                         |
| `-f`               | c'est un fichier classique                |
| `-d`               | c'est un dossier                          |
| `-r` / `-w` / `-x` | il est lisible / modifiable / exécutable  |
| `-s`               | il n'est pas vide                         |

**Sur les chaînes**

| Option     | Vrai si…                                  |
| :--------- | :---------------------------------------- |
| `-z`       | la chaîne est vide                        |
| `-n`       | la chaîne n'est pas vide                  |
| `=` / `!=` | les chaînes sont identiques / différentes |

**Sur les nombres**

| Option        | Vrai si…                                      |
| :------------ | :-------------------------------------------- |
| `-eq` / `-ne` | égal / différent                              |
| `-lt` / `-gt` | strictement inférieur / strictement supérieur |
| `-le` / `-ge` | inférieur ou égal / supérieur ou égal         |

```bash
[ -e monfichier ]                      # le fichier existe
[ "$chaine1" = "$chaine2" ]            # chaînes identiques
[ -n "$chaine" ]                       # chaîne non vide
[ "$n1" -eq "$n2" ]                    # nombres égaux
[ "$a" -gt 0 ] && [ "$a" -lt 10 ]      # tests multiples : et
[ -z "$1" ] || [ "$1" = "--help" ]     # tests multiples : ou
```

### if

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

### case

```bash
read choix
case $choix in
	1)
		echo "Choix 1" ;;
	2)
		echo "Choix 2" ;;
	*)
		echo "Choix par défaut" ;;
esac
```

### Boucles

| Boucle  | Exécute le bloc `do … done`…                    |
| :------ | :---------------------------------------------- |
| `while` | **tant que** la condition est vraie             |
| `until` | **jusqu'à ce que** la condition devienne vraie  |
| `for`   | un nombre de fois défini                        |

```bash
while [ condition ]
do
	commandes
done

until [ condition ]
do
	commandes
done

for (( compteur=1; compteur<=10; compteur++ ))
do
	echo -n "$compteur "
done
```

***

## 5. Redirections et pipes

### Les canaux

| Canal    | Descripteur | Rôle                        | Par défaut |
| :------- | :---------- | :-------------------------- | :--------- |
| `stdin`  | `0`         | Entrée standard             | Clavier    |
| `stdout` | `1`         | Sortie standard (résultats) | Écran      |
| `stderr` | `2`         | Sortie d'erreur             | Écran      |

### Redirections

| Syntaxe                                            | Effet                                                  |
| :------------------------------------------------- | :----------------------------------------------------- |
| `commande > fichier`                               | Sortie standard vers le fichier (**écrase** son contenu) |
| `commande >> fichier`                              | Sortie standard **ajoutée** à la fin du fichier        |
| `commande 2> fichier`                              | Erreurs vers le fichier                                |
| `commande > fichier 2>&1` ou `commande &> fichier` | Sortie standard **et** erreurs vers le fichier         |
| `commande < fichier`                               | Le fichier remplace la saisie au clavier               |

Avec `>` et `>>`, le fichier est créé s'il n'existe pas, avant le lancement de la commande.

```bash
ls -l > sortie.txt
echo "une ligne de plus" >> journal.log
find / -name "*.conf" 2> /dev/null   # masque les erreurs
wc < sortie.txt
```

### Pipes et filtres

Le pipe `|` envoie la sortie d'une commande dans l'entrée de la suivante. Les **filtres** lisent un flux, le transforment et le renvoient :

```bash
ls -l | wc -l                # nombre de lignes affichées par ls -l
cat /etc/passwd | grep toto  # lignes contenant « toto »
tail -n 5 scores.txt         # 5 dernières lignes d'un fichier
```

***

## 6. Exemples de scripts

### Créer un dossier pour un utilisateur

Crée `/root/<user>` avec un fichier `<user>_file` et une copie de `/root/template` renommée `template_<user>`. Le nom de l'utilisateur est passé en paramètre : `./create_file.sh user2`.

```bash
#!/bin/bash

user=$1
dossier=/root

mkdir $dossier/$user
touch $dossier/$user/${user}_file
cp $dossier/template $dossier/$user/
mv $dossier/$user/template $dossier/$user/template_$user
```

### Créer un utilisateur

Utilisation :

```
./create_user.sh username shell group home   # valeurs en paramètres
./create_user.sh -i                          # mode interactif
./create_user.sh --help                      # aide
```

```bash
#!/bin/bash

if [ "$1" = "-i" ]
then
	# Mode interactif : saisie de chaque valeur
	echo "Entrez le nom d'utilisateur :"
	read username
	echo "Entrez le shell :"
	read shell
	echo "Entrez le groupe principal :"
	read group
	echo "Entrez le home utilisateur :"
	read home

	# Le script se relance avec les valeurs saisies, qui passent par les mêmes vérifications
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

***

## Mémo rapide

| Besoin                                  | Syntaxe                              |
| :-------------------------------------- | :----------------------------------- |
| Première ligne d'un script              | `#!/bin/bash`                        |
| Rendre un script exécutable             | `chmod +x script.sh`                 |
| Définir / lire une variable             | `var=valeur` / `$var`                |
| Lire une saisie                         | `read var`                           |
| Paramètres du script                    | `$1`, `$2`… et leur nombre `$#`      |
| Calcul                                  | `$(( a + b ))`                       |
| Nombre aléatoire entre 0 et 100         | `$(( RANDOM % 101 ))`                |
| Tester l'existence d'un fichier         | `[ -e fichier ]`                     |
| Comparer deux nombres                   | `[ "$a" -lt "$b" ]`                  |
| Écrire à la fin d'un fichier            | `echo "texte" >> fichier`            |
| Masquer les erreurs                     | `commande 2> /dev/null`              |
| Afficher les 5 dernières lignes         | `tail -n 5 fichier`                  |
