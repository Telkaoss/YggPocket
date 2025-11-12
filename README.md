# YggPocket - Stremio Addon for Android

Stremio addon that resolves streams using **Yggtorrent** (French Private Tracker) and Debrid services. Designed to run natively on Android via Termux.

## Why YggPocket?

We all have that old smartphone sitting in a drawer, or a powerful device in our pocket that's way too capable for our daily usage. **YggPocket** lets you repurpose that Android device as your personal streaming server!

### Key Benefits

- 💰 **No VPS/Server Needed**: Run everything directly on your Android device - no monthly hosting costs
- 📱 **Use Your Spare Phone**: Turn that unused Android device into a powerful addon server
- ⚡ **Native Performance**: Built specifically for Termux - no emulation, no proot, just fast native execution
- 🔧 **Jackett Alternative**: Jackett doesn't work on Termux or proot, so YggPocket fills that gap perfectly
- 🌐 **Always With You**: Your addon runs on your phone, accessible from anywhere via tunnel services

Perfect for anyone who wants a self-hosted Stremio addon without the hassle and cost of maintaining a dedicated server!

## Features

- 🔥 **Yggtorrent Integration**: Search torrents directly from Yggtorrent private tracker
- 🌐 **4 Tunnel Options**: Ngrok, Cloudflare Quick/Named, Localtunnel
- 📱 **Android Native**: Runs directly on Termux without emulation
- 🚀 **9 Debrid Services**: Real-Debrid, AllDebrid, DebridLink, Premiumize, PikPak, TorBox, EasyDebrid, Offcloud, StremThru
- 🎯 **StremThru Integration**: Unified debrid API with cache checking
- 🎬 **TMDB Metadata**: Required for accurate movie/series matching
- 🔒 **Security**: All dependencies up-to-date, 0 vulnerabilities

## Prerequisites

- Android device with Termux installed
- Yggtorrent account with passkey
- TMDB API Access Token (https://www.themoviedb.org/settings/api)
- **Tunnel** (choose one):
  - Ngrok account (free) for HTTPS tunnel, custom subdomain optional
  - Cloudflare account (free) for Quick Tunnel or Named Tunnel
  - Localtunnel (no account needed)
- **Debrid service** (choose one):
  - Real-Debrid, AllDebrid, DebridLink, Premiumize (direct API)
  - PikPak, TorBox, EasyDebrid, Offcloud (via StremThru)
  - StremThru as unified proxy

## Installation

### 1. Install Termux and Dependencies

```bash
pkg update && pkg upgrade && pkg install -y nodejs-lts git && git clone https://github.com/Telkaoss/YggPocket.git && cd YggPocket/
```

### 2. Run Setup

```bash
npm install
```

During installation, you will be asked to choose a tunnel type and provide configuration:

#### Tunnel Options

**1. Ngrok**
- ✅ Works immediately with Stremio on Android
- ⚠️ Free plan shows an interstitial warning page that blocks Stremio Web/Desktop (Chromium CORS/X-Frame protections)
- 🔁 Free plan provides a permanent (random-looking) subdomain tied to your account
- ✅ Paid custom subdomain removes the warning page and stays fixed
- Configuration:
  1. Go to [Ngrok Dashboard](https://dashboard.ngrok.com/signup) and create free account
  2. Navigate to "Your Authtoken" and copy it
  3. Optional: Go to [Domains](https://dashboard.ngrok.com/domains) and click "+ New Domain"
     - Free accounts get random subdomain (e.g., a1b2c3d4.ngrok.app)
     - Paid accounts can choose custom subdomain
  4. Enter authtoken during setup
  5. Optional (paid): enter your custom subdomain if purchased

**2. Cloudflare Quick Tunnel**
- ✅ NO warning page (works on all platforms)
- ✅ FREE, no account needed
- ❌ Domain changes at each restart
- Configuration: None needed! Just select this option during setup

**3. Cloudflare Named Tunnel**
- ✅ NO warning page
- ✅ Permanent domain
- ❌ Requires personal domain (any registrar)
- Configuration https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/

**4. Localtunnel**
- ✅ FREE, no account needed
- ✅ Custom persistent subdomain
- ⚠️ IP confirmation needed every 7 days
- Configuration:
  1. Optionally choose a subdomain during setup (e.g., "yggpocket-android")
  2. Your URL will be `https://your-subdomain.loca.lt`
  3. First-time visitors see a warning page asking for your public IP as password
  4. Get your IP: `curl https://loca.lt/mytunnelpassword`
  5. After confirmation, works for 7 days before requiring re-confirmation

#### Yggtorrent Configuration (REQUIRED)
1. Go to Yggtorrent website
2. Login to your account
3. Go to your profile and copy your **passkey** (32 characters)

#### TMDB Configuration (REQUIRED)
1. Go to [TMDB API Settings](https://www.themoviedb.org/settings/api)
2. Create an API key if you don't have one
3. Copy the **API Read Access Token** (Bearer token, starts with "eyJ...")

## Usage

### Start the Addon

**Foreground (normal):**
```bash
npm start
```

**Background (continues after closing Termux):**
```bash
# Acquire wake-lock to prevent Android from killing the process
termux-wake-lock

# Run in background with logs
nohup npm start > ~/yggpocket.log 2>&1 &

# View logs
tail -f ~/yggpocket.log
```

**To stop background process:**
```bash
pkill -9 node
termux-wake-unlock
```

The addon URL will be displayed in the console based on your tunnel choice:
- **Ngrok Free**: `https://a1b2c3d4.ngrok.app` (persistent subdomain assigned to your account; works on Android only because of warning page on Web/Desktop)
- **Ngrok Paid**: `https://ygg-api.ngrok.app` (persistent and custom subdomain; works on Android, Web, and Desktop)
- **Cloudflare Quick**: `https://random-subdomain.trycloudflare.com` (changes each restart)
- **Cloudflare Named**: `https://your-subdomain.your-domain.com` (permanent)
- **Localtunnel**: `https://your-subdomain.loca.lt` (persistent)

### Configure in Stremio

1. Open Stremio
2. Go to **Addons** > **Community Addons**
3. Click the puzzle icon (top right)
4. Enter your addon URL with `/configure` path:
   - Example: `https://your-subdomain.loca.lt/configure`
5. Configure your preferences:
   - Select your Debrid service
   - Enter your Debrid API key
   - Choose qualities (720p, 1080p, 4K, etc.)
   - Select languages
   - Configure other options
6. Click **Install**

### Localtunnel IP Confirmation

If using Localtunnel, first-time visitors will see a warning page:

1. Get your public IP password:
   ```bash
   curl https://loca.lt/mytunnelpassword
   ```
2. Enter this IP on the warning page
3. Access is granted for 7 days
4. After 7 days, repeat the confirmation process

**Note**: The subdomain persists across restarts, so you only need to reconfigure Stremio if you change your subdomain.

### Manual Config

You can also edit `src/lib/config.js` directly to change settings.


## Supported Debrid Services

### Direct API Integration
- **Real-Debrid** - Direct API integration
- **AllDebrid** - Direct API integration
- **DebridLink** - Direct API integration
- **Premiumize** - Direct API integration

### Via StremThru (Automatic)
- **PikPak** - Automatically uses StremThru wrapper
- **TorBox** - Automatically uses StremThru wrapper
- **EasyDebrid** - Automatically uses StremThru wrapper
- **Offcloud** - Automatically uses StremThru wrapper

### StremThru as Unified Service
- **StremThru** - Can be used as a unified proxy for any supported debrid service
- Provides consistent cache checking across all services
- Recommended for services without direct API integration

## Troubleshooting

### Port 4000 Already in Use

If you see an error that port 4000 is already in use:

```bash
# Kill all Node processes
pkill -9 node

# If that doesn't work, kill manually:
ps aux
kill -9 <PID>
```

Then restart the addon with `npm start`.

### "No torrents found"
- Make sure your TMDB Access Token is correctly configured
- Verify your Yggtorrent passkey is valid (32 characters)
- Check that the movie/series exists on Yggtorrent

### Tunnel Issues

**Ngrok not working:**
- Verify your authtoken is correct
- Error ERR_NGROK_314 (custom hostname): Custom subdomains require paid plan
  - Free accounts get a persistent subdomain assigned to their account (e.g., a1b2c3d4.ngrok.app)
  - Paid accounts can choose subdomain (e.g., ygg-api.ngrok.app)
- If you don't claim your free subdomain, ngrok rotates the URL at each restart—reserve it under Domains to keep it fixed
- Free plan warning page blocks Stremio Web/Desktop; use Cloudflare or upgrade to a paid static domain to avoid it

**Cloudflare Quick Tunnel not working:**
- Check that port 4000 is not blocked
- Domain changes at each restart - update Stremio addon URL if needed
- No configuration needed, should work automatically

**Cloudflare Named Tunnel not working:**
- Verify your tunnel token is correct
- Check that the tunnel is active in Cloudflare dashboard
- Ensure your domain's nameservers are pointing to Cloudflare
- Make sure port 4000 is not blocked in tunnel configuration

**Localtunnel not working:**
- Check you've completed IP confirmation (valid for 7 days)
- Get your IP password: `curl https://loca.lt/mytunnelpassword`
- If subdomain is already taken, try a different one
- Subdomain persists in cache - delete `.yggpocket` folder to reset

### "Debrid service not working"
- Verify your Debrid API key is valid
- Check your Debrid account is active/premium
- Ensure you have enough bandwidth/quota
- For PikPak/TorBox/EasyDebrid/Offcloud: StremThru must be working
- Try toggling "Use StremThru" option in addon configuration

## Credits

- Based on the original [Jackettio](https://github.com/arvida42/jackettio) by arvida42
- Yggtorrent integration inspired by [StreamFusion](https://github.com/LimeDrive/stream-fusion) by LimeDrive
- Android port adapted for Termux

## License

MIT

## Disclaimer

This addon is for educational purposes only. Make sure you have the right to access the content you're streaming. The authors are not responsible for any misuse of this software.
