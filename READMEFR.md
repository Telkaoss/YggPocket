# YggPocket - Addon Stremio pour Android

Addon Stremio qui résout les streams en utilisant **Yggtorrent** (Tracker Privé Français) et les services Debrid. Conçu pour fonctionner nativement sur Android via Termux.

## Pourquoi YggPocket ?

Nous avons tous ce vieux smartphone qui traîne dans un tiroir, ou un appareil puissant dans notre poche qui est bien trop capable pour notre usage quotidien. **YggPocket** vous permet de réutiliser cet appareil Android comme votre serveur de streaming personnel !

### Avantages Clés

- 💰 **Pas Besoin de VPS/Serveur** : Exécutez tout directement sur votre appareil Android - pas de frais d'hébergement mensuels
- 📱 **Utilisez Votre Téléphone** : Transformez cet appareil Android inutilisé en un puissant serveur d'addon
- ⚡ **Performance Native** : Construit spécifiquement pour Termux - pas d'émulation, pas de proot, juste une exécution native rapide
- 🔧 **Alternative à Jackett** : Jackett ne fonctionne pas sur Termux ou proot, donc YggPocket comble parfaitement cette lacune
- 🌐 **Toujours Avec Vous** : Votre addon fonctionne sur votre téléphone, accessible de partout via les services de tunnel

Parfait pour tous ceux qui veulent un addon Stremio auto-hébergé sans les tracas et les coûts de maintenance d'un serveur dédié !

## Fonctionnalités

- 🔥 **Intégration Yggtorrent** : Recherchez des torrents directement depuis le tracker privé Yggtorrent
- 🌐 **4 Options de Tunnel** : Ngrok, Cloudflare Quick/Named, Localtunnel
- 📱 **Natif Android** : Fonctionne directement sur Termux sans émulation
- 🚀 **9 Services Debrid** : Real-Debrid, AllDebrid, DebridLink, Premiumize, PikPak, TorBox, EasyDebrid, Offcloud, StremThru
- 🎯 **Intégration StremThru** : API debrid unifiée avec vérification de cache
- 🎬 **Métadonnées TMDB** : Requis pour une correspondance précise des films/séries
- 🔒 **Sécurité** : Toutes les dépendances à jour, 0 vulnérabilités

## Prérequis

- Appareil Android avec Termux installé
- Compte Yggtorrent avec passkey
- Token d'accès API TMDB (https://www.themoviedb.org/settings/api)
- **Tunnel** (choisir un) :
  - Compte Ngrok (gratuit) pour tunnel HTTPS, sous-domaine personnalisé optionnel
  - Compte Cloudflare (gratuit) pour Quick Tunnel ou Named Tunnel
  - Localtunnel (pas de compte nécessaire)
- **Service Debrid** (choisir un) :
  - Real-Debrid, AllDebrid, DebridLink, Premiumize (API directe)
  - PikPak, TorBox, EasyDebrid, Offcloud (via StremThru)
  - StremThru comme proxy unifié

## Installation

### 1. Installer Termux et les Dépendances

```bash
pkg update && pkg upgrade && pkg install -y nodejs-lts git && git clone https://github.com/Telkaoss/YggPocket.git && cd YggPocket/
```

### 2. Lancer l'Installation

```bash
npm install
```

Cela va :
- Installer toutes les dépendances
- Lancer l'assistant de configuration interactif
- Créer une commande globale `yggpocket` (accessible depuis n'importe où dans Termux)
- Ajouter automatiquement `~/.local/bin` à votre PATH

Après l'installation, activez la commande globale :
```bash
source ~/.bashrc
# OU redémarrez Termux
```

Pendant l'installation, il vous sera demandé de choisir un type de tunnel et de fournir la configuration :

#### Options de Tunnel

**1. Ngrok**
- ✅ Fonctionne immédiatement avec Stremio sur Android
- ⚠️ Le plan gratuit affiche une page d'avertissement interstitielle qui bloque Stremio Web/Desktop (protections CORS/X-Frame de Chromium)
- 🔁 Le plan gratuit fournit un sous-domaine permanent (aléatoire) lié à votre compte
- ✅ Un sous-domaine personnalisé payant supprime la page d'avertissement et reste fixe
- Configuration :
  1. Allez sur [Ngrok Dashboard](https://dashboard.ngrok.com/signup) et créez un compte gratuit
  2. Naviguez vers "Your Authtoken" et copiez-le
  3. Allez sur [Domains](https://dashboard.ngrok.com/domains) et cliquez sur "+ New Domain"
     - Les comptes gratuits obtiennent un sous-domaine aléatoire (ex : a1b2c3d4.ngrok.app)
     - Les comptes payants peuvent choisir un sous-domaine personnalisé
  4. Entrez l'authtoken pendant l'installation
  5. Optionnel (payant) : entrez votre sous-domaine personnalisé si acheté

**2. Cloudflare Quick Tunnel**
- ✅ PAS de page d'avertissement (fonctionne sur toutes les plateformes)
- ✅ GRATUIT, pas de compte nécessaire
- ❌ Le domaine change à chaque redémarrage
- Configuration : Aucune nécessaire ! Sélectionnez simplement cette option pendant l'installation

**3. Cloudflare Named Tunnel**
- ✅ PAS de page d'avertissement
- ✅ Domaine permanent
- ❌ Nécessite un domaine personnel (n'importe quel registrar)
- Configuration https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/

**4. Localtunnel**
- ✅ GRATUIT, pas de compte nécessaire
- ✅ Sous-domaine personnalisé persistant
- ⚠️ Confirmation IP nécessaire tous les 7 jours
- Configuration :
  1. Choisissez optionnellement un sous-domaine pendant l'installation (ex : "yggpocket-android")
  2. Votre URL sera `https://votre-sous-domaine.loca.lt`
  3. Les visiteurs pour la première fois voient une page d'avertissement demandant votre IP publique comme mot de passe
  4. Obtenez votre IP : `curl https://loca.lt/mytunnelpassword`
  5. Après confirmation, fonctionne pendant 7 jours avant de nécessiter une re-confirmation

#### Configuration Yggtorrent (REQUIS)
1. Allez sur le site Yggtorrent
2. Connectez-vous à votre compte
3. Allez sur votre profil et copiez votre **passkey** (32 caractères)

#### Configuration TMDB (REQUIS)
1. Allez sur [TMDB API Settings](https://www.themoviedb.org/settings/api)
2. Créez une clé API si vous n'en avez pas
3. Copiez le **API Read Access Token** (Token Bearer, commence par "eyJ...")

## Utilisation

### Commandes Globales

Après l'installation, vous pouvez utiliser la commande `yggpocket` depuis n'importe où dans Termux :

```bash
# Démarrer l'addon
yggpocket start

# Installer/réinstaller les dépendances
yggpocket install

# Relancer l'installation (reconfigurer)
yggpocket setup
```

### Démarrer l'Addon

**Depuis n'importe où (en utilisant la commande globale) :**
```bash
yggpocket start
```

**Ou manuellement depuis le répertoire du projet :**
```bash
cd ~/YggPocket
npm start
```

**Mode arrière-plan (continue après avoir fermé Termux) :**
```bash
# Acquérir le wake-lock pour empêcher Android de tuer le processus
termux-wake-lock

# Exécuter en arrière-plan avec les logs
nohup yggpocket start > ~/yggpocket.log 2>&1 &

# Voir les logs
tail -f ~/yggpocket.log
```

**Pour arrêter le processus en arrière-plan :**
```bash
pkill -9 node
termux-wake-unlock
```

L'URL de l'addon sera affichée dans la console en fonction de votre choix de tunnel :
- **Ngrok Gratuit** : `https://a1b2c3d4.ngrok.app` (sous-domaine persistant assigné à votre compte ; fonctionne sur Android uniquement à cause de la page d'avertissement sur Web/Desktop)
- **Ngrok Payant** : `https://ygg-api.ngrok.app` (sous-domaine persistant et personnalisé ; fonctionne sur Android, Web et Desktop)
- **Cloudflare Quick** : `https://sous-domaine-aleatoire.trycloudflare.com` (change à chaque redémarrage)
- **Cloudflare Named** : `https://votre-sous-domaine.votre-domaine.com` (permanent)
- **Localtunnel** : `https://votre-sous-domaine.loca.lt` (persistant)

### Configurer dans Stremio

1. Ouvrez Stremio
2. Allez dans **Addons** > **Community Addons**
3. Cliquez sur l'icône puzzle (en haut à droite)
4. Entrez l'URL de votre addon avec le chemin `/configure` :
   - Exemple : `https://votre-sous-domaine.loca.lt/configure`
5. Configurez vos préférences :
   - Sélectionnez votre service Debrid
   - Entrez votre clé API Debrid
   - Choisissez les qualités (720p, 1080p, 4K, etc.)
   - Sélectionnez les langues
   - Configurez les autres options
6. Cliquez sur **Install**

### Confirmation IP Localtunnel

Si vous utilisez Localtunnel, les visiteurs pour la première fois verront une page d'avertissement :

1. Obtenez votre mot de passe IP publique :
   ```bash
   curl https://loca.lt/mytunnelpassword
   ```
2. Entrez cette IP sur la page d'avertissement
3. L'accès est accordé pour 7 jours
4. Après 7 jours, répétez le processus de confirmation

**Note** : Le sous-domaine persiste entre les redémarrages, donc vous n'avez besoin de reconfigurer Stremio que si vous changez votre sous-domaine.

### Configuration Manuelle

Vous pouvez également éditer `src/lib/config.js` directement pour changer les paramètres.

## Services Debrid Supportés

### Intégration API Directe
- **Real-Debrid** - Intégration API directe
- **AllDebrid** - Intégration API directe
- **DebridLink** - Intégration API directe
- **Premiumize** - Intégration API directe

### Via StremThru (Automatique)
- **PikPak** - Utilise automatiquement le wrapper StremThru
- **TorBox** - Utilise automatiquement le wrapper StremThru
- **EasyDebrid** - Utilise automatiquement le wrapper StremThru
- **Offcloud** - Utilise automatiquement le wrapper StremThru

### StremThru comme Service Unifié
- **StremThru** - Peut être utilisé comme proxy unifié pour tout service debrid supporté
- Fournit une vérification de cache cohérente à travers tous les services
- Recommandé pour les services sans intégration API directe

## Dépannage

### Commande 'yggpocket' non trouvée

Si la commande globale ne fonctionne pas après l'installation :

```bash
# Assurez-vous que ~/.local/bin est dans votre PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Ou redémarrez Termux
```

Si le problème persiste, relancez l'installation :
```bash
cd ~/YggPocket
npm install
```

### Port 4000 Déjà Utilisé

Si vous voyez une erreur indiquant que le port 4000 est déjà utilisé :

```bash
# Tuer tous les processus Node
pkill -9 node

# Si ça ne fonctionne pas, tuez manuellement :
ps aux
kill -9 <PID>
```

Puis redémarrez l'addon avec `npm start`.

### "Aucun torrent trouvé"
- Assurez-vous que votre Token d'Accès TMDB est correctement configuré
- Vérifiez que votre passkey Yggtorrent est valide (32 caractères)
- Vérifiez que le film/série existe sur Yggtorrent

### Problèmes de Tunnel

**Ngrok ne fonctionne pas :**
- Vérifiez que votre authtoken est correct
- Erreur ERR_NGROK_314 (nom d'hôte personnalisé) : Les sous-domaines personnalisés nécessitent un plan payant
  - Les comptes gratuits obtiennent un sous-domaine persistant assigné à leur compte (ex : a1b2c3d4.ngrok.app)
  - Les comptes payants peuvent choisir le sous-domaine (ex : ygg-api.ngrok.app)
- Si vous ne réclamez pas votre sous-domaine gratuit, ngrok change l'URL à chaque redémarrage—réservez-le sous Domains pour le garder fixe
- La page d'avertissement du plan gratuit bloque Stremio Web/Desktop ; utilisez Cloudflare ou passez à un domaine statique payant pour l'éviter

**Cloudflare Quick Tunnel ne fonctionne pas :**
- Vérifiez que le port 4000 n'est pas bloqué
- Le domaine change à chaque redémarrage - mettez à jour l'URL de l'addon Stremio si nécessaire
- Aucune configuration nécessaire, devrait fonctionner automatiquement

**Cloudflare Named Tunnel ne fonctionne pas :**
- Vérifiez que votre token de tunnel est correct
- Vérifiez que le tunnel est actif dans le tableau de bord Cloudflare
- Assurez-vous que les serveurs de noms de votre domaine pointent vers Cloudflare
- Assurez-vous que le port 4000 n'est pas bloqué dans la configuration du tunnel

**Localtunnel ne fonctionne pas :**
- Vérifiez que vous avez complété la confirmation IP (valide pendant 7 jours)
- Obtenez votre mot de passe IP : `curl https://loca.lt/mytunnelpassword`
- Si le sous-domaine est déjà pris, essayez-en un différent
- Le sous-domaine persiste dans le cache - supprimez le dossier `.yggpocket` pour réinitialiser

### "Service Debrid ne fonctionne pas"
- Vérifiez que votre clé API Debrid est valide
- Vérifiez que votre compte Debrid est actif/premium
- Assurez-vous que vous avez assez de bande passante/quota
- Pour PikPak/TorBox/EasyDebrid/Offcloud : StremThru doit fonctionner
- Essayez de basculer l'option "Use StremThru" dans la configuration de l'addon

## Crédits

- Basé sur le [Jackettio](https://github.com/arvida42/jackettio) original par arvida42
- Intégration Yggtorrent inspirée par [StreamFusion](https://github.com/LimeDrive/stream-fusion) par LimeDrive
- Port Android adapté pour Termux

## Licence

MIT

## Avertissement

Cet addon est à des fins éducatives uniquement. Assurez-vous d'avoir le droit d'accéder au contenu que vous diffusez. Les auteurs ne sont pas responsables de toute mauvaise utilisation de ce logiciel.
