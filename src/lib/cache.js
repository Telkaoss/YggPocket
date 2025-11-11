import cacheManager from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';
import config from './config.js';
import path from 'path';
import fs from 'fs';

// Assurez-vous que le dossier de données existe
if (!fs.existsSync(config.dataFolder)) {
  fs.mkdirSync(config.dataFolder, { recursive: true });
}

// Créez le dossier de cache à l'intérieur du dossier de données
const cacheFolder = path.join(config.dataFolder, 'cache');
if (!fs.existsSync(cacheFolder)) {
  fs.mkdirSync(cacheFolder, { recursive: true });
}

const cacheOptions = {
  store: fsStore,
  path: cacheFolder,
  ttl: 60 * 60, // 1 heure
  max: 1000 // nombre maximum d'éléments dans le cache
};

const cache = cacheManager.caching(cacheOptions);

export const get = (key) => cache.get(key);
export const set = (key, value, options) => cache.set(key, value, options);
export const del = (key) => cache.del(key);

export const vacuum = async () => {
  console.log('Cache vacuum not needed for file-based cache');
};

export const clean = async () => {
  await cache.reset();
  console.log('Cache cleaned');
};

export default cache;
