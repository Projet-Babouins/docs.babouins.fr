---
title: Commandes Linux utiles
---

## 1. Navigation et consultation

**pwd** (`print working directory`) affiche le chemin du dossier courant :

```bash
pwd
```

**ls** liste le contenu d'un dossier :

```bash
ls
```

Options utiles : `ls -l` (détails), `ls -a` (fichiers cachés), `ls -lh` (tailles lisibles).

**cd** (`change directory`) change de dossier :

```bash
cd chemin/du/dossier
```

`cd ..` remonte d'un niveau, `cd ~` revient au dossier personnel.

**cat** affiche le contenu d'un fichier :

```bash
cat fichier.txt
```

## 2. Création, copie, déplacement et suppression

**touch** crée un fichier vide (ou met à jour sa date de modification s'il existe déjà) :

```bash
touch fichier.txt
```

**mkdir** crée un dossier :

```bash
mkdir nom_du_dossier
```

**cp** copie un fichier ou un dossier :

```bash
cp source destination
```

`cp -r dossier_source dossier_destination` pour copier un dossier avec tout son contenu.

**mv** déplace un fichier, ou le renomme si la destination est dans le même dossier :

```bash
mv source destination
```

**rm** supprime un fichier :

```bash
rm fichier.txt
```

`rm -r dossier` supprime un dossier et tout son contenu. **Attention : la suppression est définitive, il n'y a pas de corbeille.**

## 3. Édition de fichiers avec nano

**nano** ouvre un éditeur de texte en ligne de commande :

```bash
nano fichier.txt
```

Les raccourcis principaux sont rappelés en bas de l'écran (`^` représente la touche `Ctrl`) :

| Raccourci  | Action                  |
| :--------- | :---------------------- |
| `Ctrl + O` | Enregistrer (Write Out) |
| `Ctrl + X` | Quitter                 |
| `Ctrl + K` | Couper une ligne        |
| `Ctrl + U` | Coller                  |
| `Ctrl + W` | Rechercher              |

## 4. Identité et permissions

**whoami** affiche l'utilisateur actuellement connecté :

```bash
whoami
```

**sudo** exécute une commande avec les droits administrateur :

```bash
sudo commande
```

**chmod** modifie les droits d'un fichier ou d'un dossier :

```bash
chmod 755 fichier.sh
```

| Chiffre | Droit                          |
| :------ | :----------------------------- |
| 7       | lecture + écriture + exécution |
| 6       | lecture + écriture             |
| 5       | lecture + exécution            |
| 4       | lecture seule                  |

Les trois chiffres correspondent, dans l'ordre, au propriétaire, au groupe puis aux autres utilisateurs.

**chown** change le propriétaire (et le groupe) d'un fichier :

```bash
chown utilisateur:groupe fichier.txt
```

## 5. Recherche

**grep** recherche du texte dans un ou plusieurs fichiers :

```bash
grep "motif" fichier.txt
```

`grep -r "motif" dossier/` cherche dans tout un dossier, `grep -i` ignore la casse.

**find** recherche des fichiers ou dossiers selon des critères :

```bash
find /chemin -name "*.log"
```

## 6. Tableau récapitulatif

| Commande | Rôle                            | Exemple                    |
| :------- | :------------------------------ | :------------------------- |
| `pwd`    | Affiche le dossier courant      | `pwd`                      |
| `ls`     | Liste le contenu d'un dossier   | `ls -la`                   |
| `cd`     | Change de dossier               | `cd /var/www`              |
| `cat`    | Affiche le contenu d'un fichier | `cat fichier.txt`          |
| `touch`  | Crée un fichier vide            | `touch fichier.txt`        |
| `mkdir`  | Crée un dossier                 | `mkdir dossier`            |
| `cp`     | Copie                           | `cp source destination`    |
| `mv`     | Déplace / renomme               | `mv source destination`    |
| `rm`     | Supprime                        | `rm -r dossier`            |
| `nano`   | Édite un fichier                | `nano fichier.txt`         |
| `whoami` | Affiche l'utilisateur courant   | `whoami`                   |
| `sudo`   | Exécute en administrateur       | `sudo apt update`          |
| `chmod`  | Modifie les droits              | `chmod 755 script.sh`      |
| `chown`  | Change le propriétaire          | `chown user:group fichier` |
| `grep`   | Recherche du texte              | `grep "erreur" log.txt`    |
| `find`   | Recherche des fichiers          | `find / -name "*.conf"`    |
| `ip`     | Affiche / configure le réseau   | `ip a`                     |

## 7. Réseau

**ip** affiche et configure la configuration réseau (interfaces, adresses, routes). Elle remplace l'ancienne commande `ifconfig` :

```bash
ip a
```

`ip a` (ou `ip addr`) liste les interfaces et leurs adresses IP. Autres sous-commandes utiles :

| Commande                | Rôle                                        |
| :---------------------- | :------------------------------------------ |
| `ip a`                  | Affiche les interfaces et leurs adresses IP |
| `ip route`              | Affiche la table de routage                 |
| `ip link set eth0 up`   | Active une interface                        |
| `ip link set eth0 down` | Désactive une interface                     |
