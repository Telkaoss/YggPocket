import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import expressRateLimit from 'express-rate-limit';
import ngrok from '@ngrok/ngrok';
import localtunnel from 'localtunnel';
import { spawn } from 'child_process';
import { readFileSync } from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
import loki from 'lokijs';
import showdown from 'showdown';

// Import local modules
import config from './lib/config.js';
import cache, { vacuum as vacuumCache, clean as cleanCache } from './lib/cache.js';
import * as icon from './lib/icon.js';
import * as debrid from './lib/debrid.js';
import { getIndexers } from './lib/yggflix.js';
import * as jackettio from "./lib/jackettio.js";
import { cleanTorrentFolder, createTorrentFolder } from './lib/torrentInfos.js';

// Dynamic import of express-rate-limit
let rateLimit;
try {
  const rateLimitModule = await import('express-rate-limit');
  rateLimit = rateLimitModule.default;
} catch (error) {
  console.error("Erreur lors de l'importation de express-rate-limit:", error);
  // Fallback function in case the import fails
  rateLimit = () => (req, res, next) => next();
}

// Replace __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const converter = new showdown.Converter();
const welcomeMessageHtml = config.welcomeMessage ? `${converter.makeHtml(config.welcomeMessage)}<div class="my-4 border-top border-secondary-subtle"></div>` : '';
const addon = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json')));

// Configuration  LokiJS
const dbPath = path.join(process.env.HOME, '.jackettio', 'jackettio.db');
const db = new loki(dbPath, {
    autoload: true,
    autoloadCallback : databaseInitialize,
    autosave: true, 
    autosaveInterval: 4000
});

function databaseInitialize() {
    let streams = db.getCollection("streams");
    if (streams === null) {
        streams = db.addCollection("streams");
    }
    console.log("Base de données initialisée.");
}

// Initialization of the Express application
const app = express();

//  Dummy function in case the import fails
const respond = (res, data) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  res.send(data);
};

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: config.rateLimitWindow * 1000,
  max: config.rateLimitRequest,
  legacyHeaders: false,
  standardHeaders: 'draft-7',
  keyGenerator: (req) => req.clientIp || req.ip,
  handler: (req, res, next, options) => {
    if(req.route.path == '/:userConfig/stream/:type/:id.json'){
      const resetInMs = new Date(req.rateLimit.resetTime) - new Date();
      return res.json({streams: [{
        name: `${config.addonName}`,
        title: `🛑 Trop de requêtes, veuillez réessayer dans ${Math.ceil(resetInMs / 1000 / 60)} minute(s).`,
        url: '#'
      }]});
    } else {
      return res.status(options.statusCode).send(options.message);
    }
  }
});

// Apply rate limiting middleware on all routes or specific routes
app.use(limiter);

// Application configuration
app.set('trust proxy', config.trustProxy);

// Middleware
app.use((req, res, next) => {
  req.clientIp = req.ip;
  if(req.get('CF-Connecting-IP')){
    req.clientIp = req.get('CF-Connecting-IP');
  }
  next();
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'static'), {maxAge: 86400e3}));

// Logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path.replace(/\/eyJ[\w\=]+/g, '/*******************')}`);
  next();
});

// CORS preflight handler for OPTIONS requests
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// Routes
app.get('/', (req, res) => {
  res.redirect('/configure');
});

app.get('/icon', async (req, res) => {
  const filePath = await icon.getLocation();
  res.contentType(path.basename(filePath));
  res.setHeader('Cache-Control', `public, max-age=${3600}`);
  return res.sendFile(filePath);
});

app.get('/:userConfig?/configure', async(req, res) => {
  let indexers = (await getIndexers().catch(() => []))
    .map(indexer => ({
      value: indexer.id, 
      label: indexer.title, 
      types: ['movie', 'series'].filter(type => indexer.searching[type].available)
    }));
  const templateConfig = {
    debrids: await debrid.list(),
    addon: {
      version: addon.version,
      name: config.addonName
    },
    userConfig: req.params.userConfig || '',
    defaultUserConfig: config.defaultUserConfig,
    qualities: config.qualities,
    languages: config.languages.map(l => ({value: l.value, label: l.label})).filter(v => v.value != 'multi'),
    sorts: config.sorts,
    indexers,
    passkey: {enabled: false},
    immulatableUserConfigKeys: config.immulatableUserConfigKeys
  };
  if(config.replacePasskey){
    templateConfig.passkey = {
      enabled: true,
      infoUrl: config.replacePasskeyInfoUrl,
      pattern: config.replacePasskeyPattern
    };
  }
  let template = readFileSync(path.join(__dirname, 'template', 'configure.html')).toString()
    .replace('/** import-config */', `const config = ${JSON.stringify(templateConfig, null, 2)}`)
    .replace('<!-- welcome-message -->', welcomeMessageHtml);
  return res.send(template);
});

app.get("/:userConfig?/manifest.json", async(req, res) => {
  const manifest = {
    id: config.addonId,
    version: addon.version,
    name: config.addonName,
    description: config.addonDescription,
    icon: `${req.hostname == 'localhost' ? 'http' : 'https'}://${req.hostname}/icon`,
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: {configurable: true}
  };
  if(req.params.userConfig){
    const userConfig = JSON.parse(Buffer.from(req.params.userConfig, 'base64').toString());
    const debridInstance = debrid.instance(userConfig);
    manifest.name += ` ${debridInstance.shortName}`;
  }
  respond(res, manifest);
});

app.get("/:userConfig/stream/:type/:id.json", limiter, async(req, res) => {
  try {
    const userConfig = JSON.parse(Buffer.from(req.params.userConfig, 'base64').toString());
    const streams = await jackettio.getStreams(
      Object.assign(userConfig, {ip: req.clientIp}),
      req.params.type,
      req.params.id,
      `${req.hostname == 'localhost' ? 'http' : 'https'}://${req.hostname}`
    );
    
    // Save streams in LokiJS
    const streamsCollection = db.getCollection("streams");
    streams.forEach(stream => {
      streamsCollection.insert(stream);
    });

    return respond(res, {streams});
  } catch(err) {
    console.log(req.params.id, err);
    return respond(res, {streams: []});
  }
});

app.get("/stream/:type/:id.json", async(req, res) => {
  return respond(res, {streams: [{
    name: config.addonName,
    title: `ℹ Kindly configure this addon to access streams.`,
    url: '#'
  }]});
});

app.use('/:userConfig/download/:type/:id/:torrentId', async(req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD'){
    return next();
  }

  try {
    const url = await jackettio.getDownload(
      Object.assign(JSON.parse(Buffer.from(req.params.userConfig, 'base64').toString()), {ip: req.clientIp}),
      req.params.type, 
      req.params.id, 
      req.params.torrentId
    );

    const parsed = new URL(url);
    const cut = (value) => value ? `${value.substr(0, 5)}******${value.substr(-5)}` : '';
    console.log(`${req.params.id} : Redirect: ${parsed.protocol}//${parsed.host}${cut(parsed.pathname)}${cut(parsed.search)}`);
    
    res.redirect(url);
  } catch(err) {
    console.log(req.params.id, err);

    switch(err.message){
      case debrid.ERROR.NOT_READY:
        res.redirect('/videos/not_ready.mp4');
        break;
      case debrid.ERROR.EXPIRED_API_KEY:
        res.redirect('/videos/expired_api_key.mp4');
        break;
      case debrid.ERROR.NOT_PREMIUM:
        res.redirect('/videos/not_premium.mp4');
        break;
      case debrid.ERROR.ACCESS_DENIED:
        res.redirect('/videos/access_denied.mp4');
        break;
      case debrid.ERROR.TWO_FACTOR_AUTH:
        res.redirect('/videos/two_factor_auth.mp4');
        break;
      default:
        res.redirect('/videos/error.mp4');
    }
  }
});

// Error handling
app.use((req, res) => {
  if (req.xhr) {
    res.status(404).json({ error: 'Page not found!' });
  } else {
    res.status(404).send('Page not found!');
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (req.xhr) {
    res.status(500).json({ error: 'Something broke!' });
  } else {
    res.status(500).send('Something broke!');
  }
});


const startServer = async () => {
  const server = app.listen(config.port, '0.0.0.0', async () => {
    console.log(`Server started at http://localhost:${config.port}`);

    // Start tunnel based on configuration
    if (config.tunnelType === 'ngrok') {
      if (config.ngrokAuthtoken) {
        try {
          console.log('Starting Ngrok tunnel...');

          // Configure Ngrok options
          const ngrokOptions = {
            authtoken: config.ngrokAuthtoken,
            addr: config.port
          };

          // Add domain if specified (for static domains)
          if (config.ngrokDomain) {
            ngrokOptions.domain = config.ngrokDomain;
          }

          // Start Ngrok tunnel
          const listener = await ngrok.forward(ngrokOptions);
          const tunnelUrl = listener.url();

          console.log('✅ Ngrok tunnel started successfully!');
          console.log('───────────────────────────────────────');
          console.log(`🌐 Public URL: ${tunnelUrl}`);
          console.log('───────────────────────────────────────');
          console.log(`📱 Add this URL to Stremio: ${tunnelUrl}/manifest.json`);
          console.log('───────────────────────────────────────');

        } catch (error) {
          console.error('❌ Error during Ngrok tunnel setup:', error);
          console.error('Please check your Ngrok authtoken and try again.');
        }
      } else {
        console.warn('⚠️  Ngrok tunnel is selected but no authtoken provided.');
        console.warn('   Please set NGROK_AUTHTOKEN environment variable.');
        console.warn('   Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken');
      }
    } else if (config.tunnelType === 'cloudflare') {
      try {
        console.log('Starting Cloudflare tunnel...');

        // Prepare cloudflared command arguments
        let cloudflaredArgs;

        if (config.cloudflareToken) {
          // Named Tunnel with token
          cloudflaredArgs = ['tunnel', 'run', '--token', config.cloudflareToken];
        } else {
          // Quick Tunnel without token
          cloudflaredArgs = ['tunnel', '--url', `http://localhost:${config.port}`];
        }

        // Start cloudflared process
        const cloudflaredProcess = spawn('cloudflared', cloudflaredArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        // Capture tunnel URL from cloudflared output
        let tunnelUrl = '';
        let connectionStarted = false;

        cloudflaredProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log(output);

          if (config.cloudflareToken) {
            // For Named Tunnel, check for successful connection
            if ((output.includes('Connection') && output.includes('registered')) ||
                output.includes('Started') ||
                output.includes('Registered tunnel connection')) {
              if (!connectionStarted) {
                connectionStarted = true;
                console.log('✅ Cloudflare Named Tunnel connected successfully!');
                console.log('───────────────────────────────────────');
                console.log('🌐 Your tunnel is now active!');
                console.log('📋 Check your public URL in Cloudflare dashboard:');
                console.log('   https://one.dash.cloudflare.com/');
                console.log('───────────────────────────────────────');
                console.log('📱 Add your tunnel URL to Stremio: https://your-domain/manifest.json');
                console.log('───────────────────────────────────────');
              }
            }
          } else {
            // For Quick Tunnel, extract the temporary URL
            const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (urlMatch && !tunnelUrl) {
              tunnelUrl = urlMatch[0];
              console.log('✅ Cloudflare Quick Tunnel started successfully!');
              console.log('───────────────────────────────────────');
              console.log(`🌐 Public URL: ${tunnelUrl}`);
              console.log('───────────────────────────────────────');
              console.log(`📱 Add this URL to Stremio: ${tunnelUrl}/manifest.json`);
              console.log('───────────────────────────────────────');
            }
          }
        });

        cloudflaredProcess.stderr.on('data', (data) => {
          const errOutput = data.toString();
          // Cloudflared sometimes outputs info to stderr
          if (errOutput.includes('http') || errOutput.includes('https')) {
            console.log(`Cloudflare: ${errOutput}`);
          } else {
            console.error(`Cloudflare: ${errOutput}`);
          }
        });

        cloudflaredProcess.on('close', (code) => {
          console.log(`Cloudflare tunnel process exited with code ${code}`);
        });

        // Store process reference for graceful shutdown
        server.cloudflaredProcess = cloudflaredProcess;

      } catch (error) {
        console.error('❌ Error during Cloudflare tunnel setup:', error);
        console.error('Make sure cloudflared is installed and accessible.');
      }
    } else if (config.tunnelType === 'localtunnel') {
      try {
        console.log('Starting Localtunnel...');

        // Prioritize: 1. Config subdomain, 2. Cached subdomain, 3. Random
        const configSubdomain = config.localtunnelSubdomain;
        const cachedSubdomain = await cache.get('localtunnel:subdomain');
        const subdomain = configSubdomain || cachedSubdomain;

        if (subdomain) {
          console.log(`Requesting subdomain: ${subdomain}`);
        }

        // Start localtunnel
        const tunnel = await localtunnel({
          port: config.port,
          subdomain: subdomain
        });

        const tunnelUrl = tunnel.url;

        // Extract subdomain from URL and save it for future use
        const urlMatch = tunnelUrl.match(/https:\/\/(.+?)\.loca\.lt/);
        const resolvedSubdomain = urlMatch ? urlMatch[1] : null;

        if (resolvedSubdomain) {
          await cache.set('localtunnel:subdomain', resolvedSubdomain, { ttl: 86400 * 365 });
          console.log(`✅ Subdomain '${resolvedSubdomain}' cached for next restart`);
        }

        console.log('✅ Localtunnel started successfully!');
        console.log('───────────────────────────────────────');
        console.log(`🌐 Public URL: ${tunnelUrl}`);
        console.log('───────────────────────────────────────');
        console.log(`📱 Add this URL to Stremio: ${tunnelUrl}/manifest.json`);
        console.log('───────────────────────────────────────');
        console.log(`ℹ️  This subdomain will persist across restarts`);
        console.log('───────────────────────────────────────');

        // Handle tunnel close event
        tunnel.on('close', () => {
          console.log('Localtunnel closed');
        });

        // Store tunnel reference for graceful shutdown
        server.localtunnel = tunnel;

      } catch (error) {
        console.error('❌ Error during Localtunnel setup:', error);
        console.error('Please try again or check your network connection.');
      }
    }

    console.log('───────────────────────────────────────');
    console.log(`Addon ${addon.name} v${addon.version} STARTED 🚀🚀`);
    console.log('───────────────────────────────────────');

    icon.download().catch(err => console.log(`Failed to download the icon : ${err}`));

    const intervals = [];
    createTorrentFolder();
    intervals.push(setInterval(cleanTorrentFolder, 3600e3));

    vacuumCache().catch(err => console.log(`Failed to vacuum cache: ${err}`));
    intervals.push(setInterval(() => vacuumCache(), 86400e3*7));

    cleanCache().catch(err => console.log(`Failed to clean cache: ${err}`));
    intervals.push(setInterval(() => cleanCache(), 3600e3));

    function closeGracefully(signal) {
      console.log(`Received signal to terminate: ${signal}`);
      intervals.forEach(interval => clearInterval(interval));

      // Kill cloudflared process if running
      if (server.cloudflaredProcess) {
        console.log('Stopping Cloudflare tunnel...');
        server.cloudflaredProcess.kill();
      }

      // Close localtunnel if running
      if (server.localtunnel) {
        console.log('Stopping Localtunnel...');
        server.localtunnel.close();
      }

      db.saveDatabase(() => {
        console.log('Database saved successfully');
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      });
    }
    
    process.on('SIGINT', closeGracefully);
    process.on('SIGTERM', closeGracefully);
  });

  return server;
};

const server = startServer();

// Handling uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handling warnings
process.on('warning', (warning) => {
  console.warn('Warning:', warning.name, warning.message);
  console.warn('Stack:', warning.stack);
});

// Debug level configuration
if (process.env.DEBUG) {
  console.debug = console.log;
} else {
  console.debug = () => {};
}

// Export for testing
if (process.env.NODE_ENV === 'test') {
  module.exports = {
    app,
    server,
    db
  };
}

// Translation: Handling uncaught promise rejections (for Node.js >= 15)
process.setUncaughtExceptionCaptureCallback((error) => {
  console.error('Uncaught Exception:', error);
  db.saveDatabase(() => {
    console.error('Database saved after uncaught exception');
    process.exit(1);
  });
});

console.log('Application is ready and listening for requests.');

export default app;
