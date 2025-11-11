import crypto from 'crypto';
import config from './config.js';
import cache from './cache.js';
import {numberPad, parseWords} from './util.js';

export const CATEGORY = {
  MOVIE: 'movie',
  SERIES: 'tvshow'
};

class YggflixAPI {
  constructor() {
    this.baseUrl = `${config.yggflixUrl}/api`;
    this.timeout = 10000;
  }

  async _makeRequest(method, endpoint, params = null) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    }

    try {
      const response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error making request to ${url}:`, error);
      throw error;
    }
  }

  async search(query = '') {
    return this._makeRequest('GET', '/search', { q: query });
  }

  async getHome() {
    return this._makeRequest('GET', '/home');
  }

  async getMovieDetail(movieId) {
    return this._makeRequest('GET', `/movie/${movieId}`);
  }

  async getMovieTorrents(movieId) {
    return this._makeRequest('GET', `/movie/${movieId}/torrents`);
  }

  async getTvshowDetail(tvshowId) {
    return this._makeRequest('GET', `/tvshow/${tvshowId}`);
  }

  async getTvshowTorrents(tvshowId) {
    return this._makeRequest('GET', `/tvshow/${tvshowId}/torrents`);
  }

  async getTorrents(page = 1, q = '', categoryId = null, orderBy = 'uploaded_at') {
    const params = { page, q, order_by: orderBy };
    if (categoryId !== null) {
      params.category_id = categoryId;
    }
    return this._makeRequest('GET', '/torrents', params);
  }

  async getTorrentDetail(torrentId) {
    return this._makeRequest('GET', `/torrent/${torrentId}`);
  }

  getDownloadUrl(torrentId, passkey) {
    if (!passkey || passkey.length !== 32) {
      throw new Error('Passkey must be exactly 32 characters long');
    }
    return `${this.baseUrl}/torrent/${torrentId}/download?passkey=${passkey}`;
  }
}

const yggflixApi = new YggflixAPI();

export async function searchMovieTorrents({tmdbId, name, year}) {
  if (!tmdbId) {
    console.warn('Yggflix requires TMDB ID for movie search');
    return [];
  }

  const cacheKey = `yggflixItems:1:movie:${tmdbId}`;
  let items = await cache.get(cacheKey);

  if (!items) {
    try {
      const results = await yggflixApi.getMovieTorrents(parseInt(tmdbId));
      items = results || [];
      cache.set(cacheKey, items, {ttl: items.length > 0 ? 3600*36 : 60});
    } catch (error) {
      console.error(`Error searching Yggflix for movie ${name}:`, error);
      items = [];
      cache.set(cacheKey, items, {ttl: 60});
    }
  }

  return normalizeItems(items, 'movie', tmdbId);
}

export async function searchSerieTorrents({tmdbId, name, year}) {
  if (!tmdbId) {
    console.warn('Yggflix requires TMDB ID for series search');
    return [];
  }

  const cacheKey = `yggflixItems:1:serie:${tmdbId}`;
  let items = await cache.get(cacheKey);

  if (!items) {
    try {
      const results = await yggflixApi.getTvshowTorrents(parseInt(tmdbId));
      items = results || [];
      cache.set(cacheKey, items, {ttl: items.length > 0 ? 3600*36 : 60});
    } catch (error) {
      console.error(`Error searching Yggflix for series ${name}:`, error);
      items = [];
      cache.set(cacheKey, items, {ttl: 60});
    }
  }

  return normalizeItems(items, 'series', tmdbId);
}

export async function searchSeasonTorrents({tmdbId, name, year, season}) {
  // Yggflix returns all series torrents, we'll filter by season in jackettio.js
  return searchSerieTorrents({tmdbId, name, year});
}

export async function searchEpisodeTorrents({tmdbId, name, year, season, episode}) {
  // Yggflix returns all series torrents, we'll filter by episode in jackettio.js
  return searchSerieTorrents({tmdbId, name, year});
}

export async function getIndexers() {
  // Yggflix is a single indexer
  return [{
    id: 'yggflix',
    configured: true,
    title: 'Yggtorrent (Yggflix)',
    language: 'fr-FR',
    type: 'private',
    categories: [2000, 5000],
    searching: {
      movie: {
        available: true,
        supportedParams: ['tmdbId', 'q']
      },
      series: {
        available: true,
        supportedParams: ['tmdbId', 'q']
      }
    }
  }];
}

function detectLanguages(title) {
  const titleLower = ` ${title.toLowerCase()} `;
  const languages = [];

  // Check for French indicators
  if (titleLower.match(/ (french|vf|truefrench|vff|vfq) /i)) {
    languages.push(config.languages.find(l => l.value === 'french'));
  }

  // Check for English indicators
  if (titleLower.match(/ (english|eng|vostfr|vo) /i)) {
    languages.push(config.languages.find(l => l.value === 'english'));
  }

  // Check for multi-language
  if (titleLower.match(/ (multi|multilangues) /i)) {
    languages.push(config.languages.find(l => l.value === 'multi'));
  }

  // Default to French if no language detected (Yggflix is French tracker)
  if (languages.length === 0) {
    languages.push(config.languages.find(l => l.value === 'french'));
  }

  return languages.filter(Boolean);
}

function normalizeItems(items, type, tmdbId) {
  return items.map(item => {
    const quality = item.title.match(/(2160|1080|720|480|360)p/);
    const title = parseWords(item.title).join(' ');
    const downloadLink = config.yggflixPasskey ?
      yggflixApi.getDownloadUrl(item.id, config.yggflixPasskey) :
      null;

    return {
      name: item.title,
      guid: `yggflix-${item.id}`,
      indexerId: 'yggflix',
      id: crypto.createHash('sha1').update(`yggflix-${item.id}`).digest('hex'),
      size: parseInt(item.size || 0),
      link: downloadLink,
      seeders: parseInt(item.seeders || 0),
      peers: parseInt(item.seeders || 0) + parseInt(item.leechers || 0),
      infoHash: '',
      magneturl: '',
      type: type,
      quality: quality ? parseInt(quality[1]) : 0,
      languages: detectLanguages(item.title),
      tmdbId: tmdbId,
      yggflixId: item.id
    };
  });
}
