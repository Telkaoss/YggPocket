import fs from 'fs';
import readline from 'readline';
import { networkInterfaces } from 'os';
import { exec, spawn } from 'child_process';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Get local IP address
const getLocalIp = () => {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
};

// Execute shell command with retry
const execCommandWithRetry = async (command, retries = 5, timeout = 120000) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Executing: ${command}`);
      return await new Promise((resolve, reject) => {
        const childProcess = exec(command, { timeout }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
        childProcess.stdout.pipe(process.stdout);
        childProcess.stderr.pipe(process.stderr);
      });
    } catch (error) {
      console.error(`Attempt ${i + 1} failed: ${error.message}`);
      if (i === retries - 1) throw error;
      console.log('Waiting 10 seconds before retrying...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retrying
    }
  }
};

// Install system dependencies (Termux packages)
const installDependencies = async () => {
  console.log('Installing system dependencies...');
  try {
    // Update Termux packages
    await execCommandWithRetry('pkg update -y && pkg upgrade -y');

    // Install necessary system dependencies
    await execCommandWithRetry('pkg install -y nodejs wget');

    console.log('✅ System dependencies installed successfully.');
    console.log('ℹ️  npm packages will be installed automatically from package.json');
  } catch (error) {
    console.error('Error installing system dependencies:', error);
    throw error;
  }
};

// Yggflix doesn't require installation, it's an external API

// Update config file
const updateConfig = (configFile, key, value) => {
  // Match the key and capture the whole line
  const regex = new RegExp(`(${key}:\\s*)('(?:[^']*'|[^']*')'|process.env[^,]*|''|true|false|[0-9]*|null)`, 'i');

  // Replace with the new value, preserving the rest of the line
  return configFile.replace(regex, (match, p1) => {
    // Preserve the 'process.env' part if it exists
    if (match.includes('process.env')) {
      return `${p1}process.env.${key.toUpperCase()} || '${value || ''}'`;
    }
    return `${p1}'${value || ''}'`;
  });
};

// Function to start the server
const startServer = () => {
  console.log('Starting the server...');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Prefer src/index.js if it exists (Termux layout), otherwise fallback to root index.js (Windows layout)
  const srcIndex = path.join(__dirname, 'src', 'index.js');
  const rootIndex = path.join(__dirname, 'index.js');
  const entryPoint = fs.existsSync(srcIndex) ? srcIndex : rootIndex;
  const serverProcess = spawn('node', [entryPoint], {
    stdio: 'inherit', // Inherit stdio so that the output and errors are visible in the console
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  return serverProcess;
};

// Main script
const main = async () => {
  try {
    // Check if we're in the correct directory
    if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
      throw new Error('Please run this script from the project root directory.');
    }

    // Install dependencies
    await installDependencies();

    // Get local IP
    const localIp = getLocalIp();
    console.log(`Your local IP address is: ${localIp}`);

    // Get user input for configuration
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   TUNNEL CONFIGURATION (REQUIRED)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('A tunnel is REQUIRED to expose your addon to Stremio!');
    console.log('');
    console.log('Choose your tunnel type:');
    console.log('');
    console.log('1️⃣  Ngrok');
    console.log('   ✅ FREE permanent domain (random subdomain)');
    console.log('   ❌ Warning page (may block Windows/Web Stremio)');
    console.log('   ⚠️  Custom subdomain requires PAID plan');
    console.log('   📋 Requires: Free Ngrok account + authtoken');
    console.log('');
    console.log('2️⃣  Cloudflare Quick Tunnel (RECOMMENDED FOR WINDOWS)');
    console.log('   ✅ NO warning page (works on all platforms)');
    console.log('   ✅ FREE, no account needed');
    console.log('   ❌ Domain changes at each restart');
    console.log('   📋 Requires: Nothing!');
    console.log('');
    console.log('3️⃣  Cloudflare Named Tunnel');
    console.log('   ✅ NO warning page');
    console.log('   ✅ Permanent domain');
    console.log('   ❌ Requires personal domain (any registrar)');
    console.log('   📋 Requires: Cloudflare account + token + domain with CF nameservers');
    console.log('');
    console.log('4️⃣  Localtunnel');
    console.log('   ✅ FREE, no account needed');
    console.log('   ✅ Custom persistent subdomain');
    console.log('   ⚠️  IP confirmation needed every 7 days');
    console.log('   📋 Requires: Nothing!');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    let tunnelChoice = '';
    while (!tunnelChoice || !['1', '2', '3', '4'].includes(tunnelChoice)) {
      tunnelChoice = await question('Choose tunnel type (1, 2, 3, or 4): ');
      if (!['1', '2', '3', '4'].includes(tunnelChoice)) {
        console.log('⚠️  Please enter 1, 2, 3, or 4.');
      }
    }

    let ngrokAuthtoken = '';
    let ngrokDomain = '';
    let cloudflareToken = '';
    let localtunnelSubdomain = '';
    let tunnelType = '';

    if (tunnelChoice === '1') {
      // Ngrok configuration
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('   NGROK CONFIGURATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  Warning: Ngrok shows warning page on Windows/Web Stremio');
      console.log('');
      console.log('To get your Ngrok authtoken:');
      console.log('1. Go to https://dashboard.ngrok.com/signup (create free account)');
      console.log('2. Navigate to "Your Authtoken" section');
      console.log('3. Copy your authtoken');
      console.log('');
      console.log('Static domain (optional):');
      console.log('- FREE: Random subdomain (e.g., a1b2c3d4.ngrok.app) - permanent');
      console.log('- PAID: Custom subdomain (e.g., ygg-api.ngrok.app) - permanent');
      console.log('');
      console.log('To create a FREE static domain:');
      console.log('1. Go to https://dashboard.ngrok.com/domains');
      console.log('2. Click "+ New Domain" - you\'ll get a random subdomain');
      console.log('3. Copy the full domain (e.g., "a1b2c3d4.ngrok.app")');
      console.log('');
      console.log('⚠️  Leave empty to get a new random domain on each restart');
      console.log('');
      while (!ngrokAuthtoken || ngrokAuthtoken.trim() === '') {
        ngrokAuthtoken = await question('REQUIRED: Enter your Ngrok authtoken: ');
        if (!ngrokAuthtoken || ngrokAuthtoken.trim() === '') {
          console.log('⚠️  Ngrok authtoken is required! Please enter a valid token.');
        }
      }
      ngrokDomain = await question('Optional: Enter static domain (e.g., a1b2c3d4.ngrok.app, or press Enter to skip): ');
      tunnelType = 'ngrok';
    } else if (tunnelChoice === '2') {
      // Cloudflare Quick Tunnel
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('   CLOUDFLARE QUICK TUNNEL CONFIGURATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ No configuration needed!');
      console.log('A temporary domain will be assigned at each startup.');
      console.log('');
      tunnelType = 'cloudflare';
    } else if (tunnelChoice === '3') {
      // Cloudflare Named Tunnel
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('   CLOUDFLARE NAMED TUNNEL CONFIGURATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('To get your Cloudflare tunnel token:');
      console.log('1. Go to https://one.dash.cloudflare.com/ (create free account)');
      console.log('2. Navigate to Networks → Tunnels');
      console.log('3. Create a tunnel and copy the token');
      console.log('4. Configure a public hostname in Cloudflare dashboard');
      console.log('   (Requires a personal domain registered in Cloudflare)');
      console.log('');
      while (!cloudflareToken || cloudflareToken.trim() === '') {
        cloudflareToken = await question('REQUIRED: Enter your Cloudflare tunnel token: ');
        if (!cloudflareToken || cloudflareToken.trim() === '') {
          console.log('⚠️  Cloudflare tunnel token is required for Named Tunnel!');
        }
      }
      tunnelType = 'cloudflare';
    } else {
      // Localtunnel
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('   LOCALTUNNEL CONFIGURATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('You can optionally request a specific subdomain.');
      console.log('Example: "jackettio-android" → https://jackettio-android.loca.lt');
      console.log('');
      console.log('⚠️  Leave empty for random subdomain (will be cached)');
      console.log('⚠️  First-time visitors will see a warning page');
      console.log('   asking for your public IP as password.');
      console.log('   Get it with: curl https://loca.lt/mytunnelpassword');
      console.log('');

      localtunnelSubdomain = await question('Subdomain (optional, press Enter to skip): ');
      localtunnelSubdomain = localtunnelSubdomain.trim();

      if (localtunnelSubdomain) {
        console.log(`✅ Will request subdomain: ${localtunnelSubdomain}`);
        console.log(`   Your URL will be: https://${localtunnelSubdomain}.loca.lt`);
      } else {
        console.log('✅ Random subdomain will be assigned and cached');
      }

      tunnelType = 'localtunnel';
    }

    console.log('\n--- Yggtorrent Configuration (REQUIRED) ---');
    console.log('Yggtorrent is REQUIRED to search torrents!');
    console.log('To get your Yggtorrent passkey:');
    console.log('1. Go to Yggtorrent website');
    console.log('2. Login to your account');
    console.log('3. Go to your profile and copy your passkey (32 characters)');
    console.log('');
    let yggflixPasskey = '';
    while (!yggflixPasskey || yggflixPasskey.trim() === '') {
      yggflixPasskey = await question('REQUIRED: Enter your Yggtorrent passkey (32 characters): ');
      if (!yggflixPasskey || yggflixPasskey.trim() === '') {
        console.log('⚠️  Yggtorrent passkey is required! Please enter a valid passkey.');
      } else if (!yggflixPasskey.match(/^[a-f0-9]{32}$/i)) {
        console.log('⚠️  Warning: Passkey should be 32 hexadecimal characters.');
      }
    }
    
    console.log('\n--- TMDB Configuration (REQUIRED) ---');
    console.log('TMDB is REQUIRED for Yggtorrent to work properly!');
    console.log('To get your TMDB access token:');
    console.log('1. Go to https://www.themoviedb.org/settings/api');
    console.log('2. Create an API key if you don\'t have one');
    console.log('3. Copy the "API Read Access Token" (Bearer token starting with eyJ...)');
    console.log('');
    let tmdbAccessToken = '';
    while (!tmdbAccessToken || tmdbAccessToken.trim() === '') {
      tmdbAccessToken = await question('REQUIRED: Enter your TMDB access token: ');
      if (!tmdbAccessToken || tmdbAccessToken.trim() === '') {
        console.log('⚠️  TMDB access token is required! Please enter a valid token.');
      }
    }

    // Read config file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Prefer src/lib/config.js if it exists (Termux layout), otherwise fallback to lib/config.js (Windows layout)
    const srcConfig = path.join(__dirname, 'src', 'lib', 'config.js');
    const rootConfig = path.join(__dirname, 'lib', 'config.js');
    const configPath = fs.existsSync(srcConfig) ? srcConfig : rootConfig;
    let configFile = fs.readFileSync(configPath, 'utf8');

    // Update config file only for non-empty values
    configFile = updateConfig(configFile, 'tunnelType', tunnelType);
    configFile = updateConfig(configFile, 'ngrokAuthtoken', ngrokAuthtoken);
    configFile = updateConfig(configFile, 'ngrokDomain', ngrokDomain);
    configFile = updateConfig(configFile, 'cloudflareToken', cloudflareToken);
    configFile = updateConfig(configFile, 'localtunnelSubdomain', localtunnelSubdomain);
    configFile = updateConfig(configFile, 'yggflixPasskey', yggflixPasskey);
    configFile = updateConfig(configFile, 'tmdbAccessToken', tmdbAccessToken);

    // Save updated config file
    fs.writeFileSync(configPath, configFile, 'utf8');
    console.log('Configuration updated successfully.');

    // Start the server
    startServer();

    console.log('Setup completed successfully. You can now start the server manually.');
  } catch (err) {
    console.error('Error during setup:', err.message);
  } finally {
    rl.close();
  }
};

main();
