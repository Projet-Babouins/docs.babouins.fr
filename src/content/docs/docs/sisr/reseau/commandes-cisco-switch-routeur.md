---
title: "Commandes Cisco : switch et routeur"
description: Les commandes Cisco IOS de base pour configurer un switch et un routeur, et à quoi elles servent.
---

## 1. Connexion en console

Brancher le câble console entre le PC et le port `Console` de l'équipement, puis ouvrir un terminal avec ces paramètres :

| Paramètre        | Valeur |
| :--------------- | :----- |
| Vitesse          | 9600   |
| Bits de données  | 8      |
| Parité           | Aucune |
| Bit de stop      | 1      |
| Contrôle de flux | Aucun  |

## 2. Les modes

| Commande             | Rôle                                                   |
| :------------------- | :----------------------------------------------------- |
| `enable`             | Passe en mode privilégié (`Switch#`)                   |
| `configure terminal` | Passe en mode configuration (`Switch(config)#`)        |
| `exit`               | Remonte d'un niveau                                    |

## 3. Configuration de base (switch et routeur)

| Commande                                   | Rôle                                                              |
| :----------------------------------------- | :---------------------------------------------------------------- |
| `hostname <nom>`                           | Donne un nom à l'équipement                                       |
| `username <nom> privilege 15 secret <mdp>` | Crée un utilisateur avec les privilèges les plus élevés           |
| `service password-encryption`              | Chiffre les mots de passe dans la configuration                   |
| `banner motd #<message>#`                  | Affiche un message à la connexion (`#` délimite le message)       |

```
hostname pod1-sw1
username admin privilege 15 secret Cisco
service password-encryption
banner motd #Les acces non autorises sont interdits#
```

### Accès console

| Commande                   | Rôle                                                       |
| :------------------------- | :--------------------------------------------------------- |
| `line con 0`               | Entre dans la configuration du port console                |
| `login local`              | Demande un utilisateur créé avec `username`                |
| `exec-timeout <min> <sec>` | Déconnecte après ce temps d'inactivité                     |

```
line con 0
 login local
 exec-timeout 2 0
```

### Accès à distance (VTY)

| Commande              | Rôle                                                       |
| :-------------------- | :--------------------------------------------------------- |
| `line vty 0 15`       | Entre dans la configuration des 16 accès à distance        |
| `transport input ssh` | Autorise uniquement SSH (Telnet refusé)                    |

```
line vty 0 15
 login local
 exec-timeout 1 0
 transport input ssh
```

### Clé SSH

| Commande                   | Rôle                                         |
| :------------------------- | :------------------------------------------- |
| `ip domain-name <domaine>` | Définit le nom de domaine                    |
| `crypto key generate rsa`  | Génère la clé RSA, nécessaire à SSH (2048 bits) |

```
ip domain-name pod1
crypto key generate rsa
```

À la question `How many bits in the modulus [512]:`, répondre `2048`.

> Sans nom de domaine, la génération échoue (`% Please define a domain-name first.`) : la clé porte le nom `<hostname>.<domaine>`.

## 4. Switch : adresse IP

Un switch n'a pas d'IP sur ses ports : on la met sur l'interface virtuelle du VLAN 1.

| Commande                        | Rôle                                         |
| :------------------------------ | :------------------------------------------- |
| `interface vlan 1`              | Entre dans l'interface du VLAN 1             |
| `ip address <adresse> <masque>` | Donne une adresse IP                         |
| `no shutdown`                   | Active l'interface                           |
| `ip default-gateway <adresse>`  | Définit la passerelle par défaut du switch   |

```
interface vlan 1
 ip address 192.168.1.1 255.255.255.0
 no shutdown
 exit
ip default-gateway 192.168.1.254
```

## 5. Routeur : interface et DHCP

### Interface

Les interfaces d'un routeur sont éteintes par défaut : `no shutdown` est obligatoire.

```
interface GigabitEthernet0/0
 ip address 192.168.1.254 255.255.255.0
 no shutdown
```

### DHCP

| Commande                                 | Rôle                                         |
| :--------------------------------------- | :------------------------------------------- |
| `ip dhcp pool <nom>`                     | Crée un pool d'adresses                      |
| `network <réseau> <masque>`              | Réseau à distribuer                          |
| `default-router <adresse>`               | Passerelle donnée aux clients                |
| `ip dhcp excluded-address <début> <fin>` | Adresses à ne pas distribuer                 |

```
ip dhcp pool Lan
 network 192.168.1.0 255.255.255.0
 default-router 192.168.1.254
 exit
ip dhcp excluded-address 192.168.1.0 192.168.1.10
ip dhcp excluded-address 192.168.1.254
```

## 6. Sauvegarder

En mode privilégié :

```
copy running-config startup-config
```

Sans sauvegarde, la configuration est perdue au redémarrage.

## 7. Tester SSH

Depuis le PC :

```
ssh -l admin 192.168.1.1
```

Le PC doit avoir une adresse dans le même réseau. Sans DHCP, il n'en a pas et la connexion échoue. Une fois le DHCP configuré sur le routeur, le PC reçoit une adresse et SSH fonctionne.
