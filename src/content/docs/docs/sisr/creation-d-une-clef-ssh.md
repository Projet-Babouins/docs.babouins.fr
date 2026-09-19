---
title: Création d'une clef SSH
description: Cette documentation permet de créer une clef SSH afin de sécuriser l'accès SSH à nos machines.
---

## 1. Création de la clef

Pour créer la clef, ouvrir le `Terminal Windows` et taper :

```powershell
ssh-keygen
```

La commande demande le fichier dans lequel enregistrer la clef. Dans l'exemple, on garde le chemin par défaut (appuyer sur `Entrée`) :

```
Generating public/private ed25519 key pair.
Enter file in which to save the key (C:\Users\Olivier/.ssh/id_ed25519):
```

Il est ensuite demandé de saisir une **passphrase**. Elle n'est pas obligatoire mais vivement recommandée : si la clef privée est volée, elle ne pourra pas être utilisée sans cette passphrase.

```
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in C:\Users\Olivier/.ssh/id_ed25519
Your public key has been saved in C:\Users\Olivier/.ssh/id_ed25519.pub
The key fingerprint is:
SHA256:1a4PAv4uIdEg+3CzaPcd7D1pWrqJH+7kebm9mVThkfs olivier@DESKTOP-CN27RMU
The key's randomart image is:
+--[ED25519 256]--+
|                 |
|  . .      .   . |
|   o o    . . +  |
|  o + .  . . . + |
|   = +..S   . +  |
|  o =...o  . . . |
| . . o.++o+o.   E|
|      o*oBB= o   |
|      .=&=.o*.   |
+----[SHA256]-----+
```

## 2. Comprendre le résultat

Deux fichiers ont été créés dans `C:\Users\<utilisateur>\.ssh\` :

| Fichier          | Rôle                                                                       |
| :--------------- | :------------------------------------------------------------------------- |
| `id_ed25519`     | **Clef privée** : reste sur votre poste, ne doit **jamais** être partagée. |
| `id_ed25519.pub` | **Clef publique** : c'est elle que l'on dépose sur les machines distantes. |

* **Fingerprint (empreinte)** : identifiant court et unique de la clef, qui permet de la reconnaître sans afficher la clef entière.
* **Randomart image** : représentation visuelle de cette empreinte. Elle sert uniquement à comparer deux clefs d'un coup d'œil (deux clefs différentes donneront des dessins différents). Elle n'a aucun rôle dans la connexion et n'a pas besoin d'être conservée.

## 3. Déposer la clef publique sur la VM

Afficher la clef publique sur le poste Windows et la copier :

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Sur la VM, connecté avec l'utilisateur concerné, créer le dossier `.ssh` s'il n'existe pas puis ouvrir le fichier `authorized_keys` :

```bash
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
```

> `~/.ssh` correspond à `/home/<utilisateur>/.ssh` (ou `/root/.ssh` pour root).

Coller la clef publique sur **une seule ligne**, enregistrer, puis appliquer les bons droits (sinon SSH refuse la clef) :

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

## 4. Tester la connexion

Depuis le poste Windows :

```powershell
ssh <utilisateur>@<ip_de_la_vm>
```

La connexion doit se faire sans mot de passe du compte (seule la passphrase de la clef est demandée si elle a été définie).
