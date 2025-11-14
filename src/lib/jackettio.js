import pLimit from 'p-limit';
import {parseWords, numberPad, sortBy, bytesToSize, wait, promiseTimeout} from './util.js';
import config from './config.js';
import cache from './cache.js';
import * as meta from './meta.js';
import * as yggflix from './yggflix.js';
import * as debrid from './debrid.js';
import * as torrentInfos from './torrentInfos.js';

const actionInProgress = {
  getTorrents: {},
  getDownload: {}
};

// Global cache for extractMediaInfo results
const mediaInfoCache = new Map();

// Helper function to extract codec and source information from torrent name
const extractMediaInfo = (name) => {
  // Check if the result is already cached
  if (mediaInfoCache.has(name)) {
    return mediaInfoCache.get(name);
  }

  // Use a single pass for all regular expressions
  let codecInfo = '';
  let sourceInfo = '';
  let audioInfo = '';

  // Video codecs (search once)
  if (/[Hh][Ee][Vv][Cc]|[Xx]265|[Hh]\.?265/.test(name)) {
    codecInfo = 'H265';
  } else if (/[Aa][Vv][Cc]|[Xx]264|[Hh]\.?264/.test(name)) {
    codecInfo = 'H264';
  } else if (/[Aa][Vv]1/.test(name)) {
    codecInfo = 'AV1';
  }

  // Sources (search once)
  if (/[Rr][Ee][Mm][Uu][Xx]/.test(name)) {
    sourceInfo = 'REMUX';
  } else if (/[Bb][Ll][Uu][Rr][Aa][Yy]|[Bb][Dd][Rr][Ii][Pp]/.test(name)) {
    sourceInfo = 'BLURAY';
  } else if (/[Ww][Ee][Bb][ -._]?[Dd][Ll]/.test(name)) {
    sourceInfo = 'WEB-DL';
  } else if (/[Ww][Ee][Bb][Rr][Ii][Pp]/.test(name)) {
    sourceInfo = 'WEBRIP';
  } else if (/\b[Ww][Ee][Bb]\b/.test(name)) {
    sourceInfo = 'WEB';
  } else if (/[Hh][Dd][Tt][Vv]/.test(name)) {
    sourceInfo = 'HDTV';
  } else if (/[Dd][Vv][Dd][Rr][Ii][Pp]/.test(name)) {
    sourceInfo = 'DVDRIP';
  }

  // Audio (search once)
  if (/[Dd][Tt][Ss][ -._]?[Hh][Dd]/.test(name)) {
    audioInfo = 'DTS-HD';
  } else if (/[Dd][Tt][Ss][ -._]?[Xx]/.test(name)) {
    audioInfo = 'DTS:X';
  } else if (/[Aa][Tt][Mm][Oo][Ss]/.test(name)) {
    audioInfo = 'ATMOS';
  } else if (/[Tt][Rr][Uu][Ee][Hh][Dd]/.test(name)) {
    audioInfo = 'TRUEHD';
  } else if (/[Dd][Dd]\+|[Ee][-_]?[Aa][Cc][-_]?3/.test(name)) {
    audioInfo = 'DD+';
  } else if (/[Dd][Dd]/.test(name)) {
    audioInfo = 'DD';
  } else if (/[Dd][Tt][Ss]/.test(name)) {
    audioInfo = 'DTS';
  } else if (/[Aa][Aa][Cc]/.test(name)) {
    audioInfo = 'AAC';
  }

  const result = { codecInfo, sourceInfo, audioInfo };

  // Cache the result
  mediaInfoCache.set(name, result);

  return result;
};

function parseStremioId(stremioId){
  const [id, season, episode] = stremioId.split(':');
  return {id, season: parseInt(season || 0), episode: parseInt(episode || 0)};
}

async function getMetaInfos(type, stremioId){
  const {id, season, episode} = parseStremioId(stremioId);
  if(type == 'movie'){
    return meta.getMovieById(id);
  }else if(type == 'series'){
    return meta.getEpisodeById(id, season, episode);
  }else{
    throw new Error(`Unsuported type ${type}`);
  }
}

function formatIndexerName(indexerId) {
  const indexerNameMap = {
    'yggflix': 'YGG-API',
    'yggtorrent': 'YGG-API'
  };
  return indexerNameMap[indexerId.toLowerCase()] || indexerId;
}

function mergeDefaultUserConfig(userConfig){
  config.immulatableUserConfigKeys.forEach(key => delete userConfig[key]);
  return Object.assign({}, config.defaultUserConfig, userConfig);
}

function priotizeItems(allItems, priotizeItems, max){
  max = max || 0;
  if(typeof(priotizeItems) == 'function'){
    priotizeItems = allItems.filter(priotizeItems);
    if(max > 0)priotizeItems.splice(max);
  }
  if(priotizeItems && priotizeItems.length){
    allItems = allItems.filter(item => !priotizeItems.find(i => i == item));
    allItems.unshift(...priotizeItems);
  }
  return allItems;
}

function searchEpisodeFile(files, season, episode){
  // Try exact patterns first (most reliable)
  // Pattern 1: S01E01 format (with leading zeros)
  let match = files.find(file => file.name.match(new RegExp(`S0*${season}E0*${episode}(?!\\d)`, 'i')));
  if (match) return match;

  // Pattern 2: 1x01 format
  match = files.find(file => file.name.match(new RegExp(`\\b${season}x0*${episode}(?!\\d)`, 'i')));
  if (match) return match;

  // Pattern 3: Season X Episode Y format
  match = files.find(file => file.name.match(new RegExp(`Season\\s*0*${season}.*Episode\\s*0*${episode}(?!\\d)`, 'i')));
  if (match) return match;

  // Pattern 4: Episode only (e.g., E01, ep01) - but verify it's in the right season context
  match = files.find(file => {
    const hasEpisode = file.name.match(new RegExp(`\\bE0*${episode}(?!\\d)|\\bep\\.?\\s*0*${episode}(?!\\d)`, 'i'));
    const hasSeason = file.name.match(new RegExp(`S0*${season}(?!\\d)`, 'i'));
    return hasEpisode && (!hasSeason || hasSeason); // If season mentioned, it must match
  });
  if (match) return match;

  // Fallback: Old pattern for backward compatibility (but more strict)
  match = files.find(file => file.name.includes(`${season}${numberPad(episode)}`));
  if (match) return match;

  return false;
}

async function getTorrents(userConfig, metaInfos, debridInstance){

  while(actionInProgress.getTorrents[metaInfos.stremioId]){
    await wait(500);
  }
  actionInProgress.getTorrents[metaInfos.stremioId] = true;

  try {

    const {qualities, excludeKeywords, maxTorrents, sortCached, sortUncached, priotizePackTorrents, priotizeLanguages, indexerTimeoutSec} = userConfig;
    const {id, season, episode, type, stremioId} = metaInfos;

    let torrents = [];
    let startDate = new Date();

    console.log(`${stremioId} : Searching torrents ...`);

    const sortSearch = [['seeders', true]];
    const filterSearch = (torrent) => {
      if(!qualities.includes(torrent.quality))return false;
      const torrentWords = parseWords(torrent.name.toLowerCase());
      if(excludeKeywords.find(word => torrentWords.includes(word)))return false;

      // For series, filter by season
      if(type === 'series' && season) {
        const torrentName = torrent.name;
        // Check if torrent is a season pack or episode from the requested season
        // Pattern 1: S01, S02, etc. (with leading zero)
        const seasonPattern = new RegExp(`S0*${season}(?:E\\d+)?(?!\\d)`, 'i');
        // Pattern 2: Season 1, Season 01, etc.
        const seasonTextPattern = new RegExp(`Season\\s*0*${season}(?!\\d)`, 'i');
        // Pattern 3: Complete series packs (usually contain all seasons)
        const completePattern = /complete|integr[ae]l/i;

        const matchesSeason = seasonPattern.test(torrentName) ||
                             seasonTextPattern.test(torrentName) ||
                             completePattern.test(torrentName);

        if(!matchesSeason) {
          return false;
        }
      }

      return true;
    };
    const filterLanguage = (torrent) => {
      if(priotizeLanguages.length == 0)return true;
      return torrent.languages.find(lang => ['multi'].concat(priotizeLanguages).includes(lang.value));
    }

    let indexers = (await yggflix.getIndexers());
    let availableIndexers = indexers.filter(indexer => indexer.searching[type].available);
    let userIndexers = availableIndexers.filter(indexer => (userConfig.indexers.includes(indexer.id) || userConfig.indexers.includes('all')));

    if(userIndexers.length){
      indexers = userIndexers;
    }else if(availableIndexers.length){
      console.log(`${stremioId} : User defined indexers "${userConfig.indexers.join(', ')}" not available, fallback to all "${type}" indexers`);
      indexers = availableIndexers;
    }else if(indexers.length){
      console.log(`${stremioId} : User defined indexers "${userConfig.indexers.join(', ')}" or "${type}" indexers not available, fallback to all indexers`);
    }else{
      throw new Error(`${stremioId} : No indexer configured in yggflix`);
    }

    console.log(`${stremioId} : ${indexers.length} indexers selected : ${indexers.map(indexer => indexer.title).join(', ')}`);

    if(type == 'movie'){

      const promises = indexers.map(indexer => promiseTimeout(yggflix.searchMovieTorrents({...metaInfos, indexer: indexer.id}), indexerTimeoutSec*1000).catch(err => []));
      torrents = [].concat(...(await Promise.all(promises)));

      console.log(`${stremioId} : ${torrents.length} torrents found in ${(new Date() - startDate) / 1000}s`);

      torrents = torrents.filter(filterSearch).sort(sortBy(...sortSearch));
      torrents = priotizeItems(torrents, filterLanguage, Math.max(1, Math.round(maxTorrents * 0.33)));
      torrents = torrents.slice(0, maxTorrents + 2);

    }else if(type == 'series'){

      const episodesPromises = indexers.map(indexer => promiseTimeout(yggflix.searchEpisodeTorrents({...metaInfos, indexer: indexer.id}), indexerTimeoutSec*1000).catch(err => []));
      // const packsPromises = indexers.map(indexer => promiseTimeout(yggflix.searchSeasonTorrents({...metaInfos, indexer: indexer.id}), indexerTimeoutSec*1000).catch(err => []));
      const packsPromises = indexers.map(indexer => promiseTimeout(yggflix.searchSerieTorrents({...metaInfos, indexer: indexer.id}), indexerTimeoutSec*1000).catch(err => []));

      const allEpisodesTorrents = [].concat(...(await Promise.all(episodesPromises)));
      const episodesTorrents = allEpisodesTorrents.filter(filterSearch);

      const allPacksTorrents = [].concat(...(await Promise.all(packsPromises)));

      // const packsTorrents = [].concat(...(await Promise.all(packsPromises))).filter(torrent => filterSearch(torrent) && parseWords(torrent.name.toUpperCase()).includes(`S${numberPad(season)}`));
      const packsTorrents = allPacksTorrents.filter(torrent => {
        if(!filterSearch(torrent)){
          return false;
        }
        const words = parseWords(torrent.name.toLowerCase());
        const wordsStr = words.join(' ');
        if(
          // Season x
          wordsStr.includes(`season ${season}`)
          // SXX or SXXEXX
          || wordsStr.includes(`s${numberPad(season)}`)
        ){
          return true;
        }
        // From SXX to SXX
        const range = wordsStr.match(/s([\d]{2,}) s([\d]{2,})/);
        if(range && season >= parseInt(range[1]) && season <= parseInt(range[2])){
          return true;
        }
        // Complete without season number (serie pack)
        if(words.includes('complete') && !wordsStr.match(/ (s[\d]{2,}|season [\d]) /)){
          return true;
        }
        return false;
      });

      torrents = [].concat(episodesTorrents, packsTorrents);

      console.log(`${stremioId} : ${torrents.length} torrents found in ${(new Date() - startDate) / 1000}s`);

      torrents = torrents.filter(filterSearch).sort(sortBy(...sortSearch));

      torrents = priotizeItems(torrents, filterLanguage, Math.max(1, Math.round(maxTorrents * 0.33)));

      // Filter by episode BEFORE slice to keep only torrents containing the requested episode
      const exactEpisodePattern = new RegExp(`s0*${season}e0*${episode}(?!\\d)`, 'i');
      const seasonOnlyPattern = new RegExp(`s0*${season}(?!e\\d)`, 'i'); // S30 but NOT S30E (season pack)
      torrents = torrents.filter(torrent => {
        const torrentNameNoSpaces = torrent.name.replace(/[\s\.\-_]/g, '').toLowerCase();

        // Accept if matches exact episode (S30E04)
        if(exactEpisodePattern.test(torrentNameNoSpaces)) {
          return true;
        }

        // Accept if it's a season pack (S30 without episode number)
        // Check if name contains S30 but NOT followed by an episode number
        if(torrentNameNoSpaces.includes(`s${numberPad(season)}`) && !torrentNameNoSpaces.match(/s0*\d+e\d+/i)) {
          return true;
        }

        return false;
      });

      torrents = torrents.slice(0, maxTorrents + 2);

      if(priotizePackTorrents > 0 && packsTorrents.length && !torrents.find(t => packsTorrents.includes(t))){
        const bestPackTorrents = packsTorrents.slice(0, Math.min(packsTorrents.length, priotizePackTorrents));
        torrents.splice(bestPackTorrents.length * -1, bestPackTorrents.length, ...bestPackTorrents);
      }

    }

    console.log(`${stremioId} : ${torrents.length} torrents filtered, get torrents infos ...`);
    startDate = new Date();

    const limit = pLimit(5);
    torrents = await Promise.all(torrents.map(torrent => limit(async () => {
      try {
        torrent.infos = await promiseTimeout(torrentInfos.get(torrent), Math.min(30, indexerTimeoutSec)*1000);
        return torrent;
      }catch(err){
        console.log(`${stremioId} ✗ Failed getting torrent infos for ${torrent.id} from indexer ${torrent.indexerId}: ${err.message}`);
        return false;
      }
    })));

    torrents = torrents.filter(torrent => torrent && torrent.infos);

    torrents = torrents.filter((torrent, index, items) => items.findIndex(t => t.infos.infoHash == torrent.infos.infoHash) === index);

    torrents = torrents.slice(0, maxTorrents);

    console.log(`${stremioId} : ${torrents.length} torrents infos found in ${(new Date() - startDate) / 1000}s`);

    if(torrents.length == 0){
      throw new Error(`No torrent infos for type ${type} and id ${stremioId}`);
    }

    if(debridInstance){

      try {

        const isValidCachedFiles = type == 'series' ? files => !!searchEpisodeFile(files, season, episode) : files => true;
        const cachedTorrents = (await debridInstance.getTorrentsCached(torrents, isValidCachedFiles)).map(torrent => {
          torrent.isCached = true;
          return torrent;
        });
        let uncachedTorrents = torrents.filter(torrent => cachedTorrents.indexOf(torrent) === -1);

        // Filter uncached torrents to only show those that contain the requested episode
        if(type == 'series') {
          uncachedTorrents = uncachedTorrents.filter(torrent => {
            // Always keep torrents without file info (will be checked at download time)
            if(!torrent.infos || !torrent.infos.files || torrent.infos.files.length === 0) {
              return true;
            }
            // For torrents with file info, check if the episode exists
            const episodeFile = searchEpisodeFile(torrent.infos.files, season, episode);
            return !!episodeFile;
          });
        }

        if(config.replacePasskey && !(userConfig.passkey && userConfig.passkey.match(new RegExp(config.replacePasskeyPattern)))){
          uncachedTorrents.forEach(torrent => {
            if(torrent.infos.private){
              torrent.disabled = true;
              torrent.infoText = 'Uncached torrent require a passkey configuration';
            }
          });
        }

        console.log(`${stremioId} : ${cachedTorrents.length} cached, ${uncachedTorrents.length} uncached on ${debridInstance.shortName}`);

        torrents = [].concat(priotizeItems(cachedTorrents.sort(sortBy(...sortCached)), filterLanguage))
                     .concat(priotizeItems(uncachedTorrents.sort(sortBy(...sortUncached)), filterLanguage));

        const progress = await debridInstance.getProgressTorrents(torrents);
        torrents.forEach(torrent => torrent.progress = progress[torrent.infos.infoHash] || null);

      }catch(err){

        console.log(`${stremioId} : ${debridInstance.shortName} : ${err.message || err}`);

        if(err.message == debrid.ERROR.EXPIRED_API_KEY){
          torrents.forEach(torrent => {
            torrent.disabled = true;
            torrent.infoText = 'Unable to verify cache (+): Expired Debrid API Key.';
          });
        }

      }

    }

    return torrents;

  }finally{

    delete actionInProgress.getTorrents[metaInfos.stremioId];

  }

}

function formatLanguages(languages, torrentName = '') {
  // If no language is specified, return an empty array
  if (!languages || languages.length === 0) return [];

  // Check if "multi" is present
  const hasMulti = languages.some(lang => lang.value === 'multi');

  // Check if French is present (VF, VFF, VFI, french)
  const hasFrench = languages.some(lang =>
    lang.value === 'french' ||
    (lang.value && (
      lang.value.toLowerCase().includes('vf') ||
      lang.value.toLowerCase().includes('français') ||
      lang.value.toLowerCase().includes('francais')
    ))
  );

  // Also check in the torrent name for "multi.vff", "multi.vfi", etc.
  const hasFrenchInName = torrentName && (
    (torrentName.toLowerCase().includes('multi') || torrentName.toLowerCase().includes('dual')) &&
    (torrentName.toLowerCase().includes('.vf') || torrentName.toLowerCase().includes('vff') ||
     torrentName.toLowerCase().includes('vfi') || torrentName.toLowerCase().includes('truefrench') ||
     torrentName.toLowerCase().includes('french'))
  );

  // Get all language emojis
  const languageEmojis = languages.map(lang => lang.emoji);

  // If "multi" is present and French is also present (in the language or the name), add the French flag next to the globe
  if (hasMulti && (hasFrench || hasFrenchInName)) {
    // Find the index of the globe emoji (multi)
    const multiIndex = languages.findIndex(lang => lang.value === 'multi');
    if (multiIndex !== -1) {
      // Replace the globe emoji with "globe+French flag"
      const frenchEmoji = '🇫🇷';
      languageEmojis[multiIndex] = `${languages[multiIndex].emoji} ${frenchEmoji}`;
    }
  }

  return languageEmojis;
}

async function prepareNextEpisode(userConfig, metaInfos, debridInstance){

  try {

    const {stremioId} = metaInfos;
    const nextEpisodeIndex = metaInfos.episodes.findIndex(e => e.episode == metaInfos.episode && e.season == metaInfos.season) + 1;
    const nextEpisode = metaInfos.episodes[nextEpisodeIndex] || false;

    if(nextEpisode){

      metaInfos = await meta.getEpisodeById(metaInfos.id, nextEpisode.season, nextEpisode.episode);
      const torrents = await getTorrents(userConfig, metaInfos, debridInstance);

      // Cache next episode on debrid when not cached
      if(userConfig.forceCacheNextEpisode && torrents.length && !torrents.find(torrent => torrent.isCached)){
        console.log(`${stremioId} : Force cache next episode (${metaInfos.episode}) on debrid`);
        const bestTorrent = torrents.find(torrent => !torrent.disabled);
        if(bestTorrent)await getDebridFiles(userConfig, bestTorrent.infos, debridInstance);
      }

    }

  }catch(err){

    if(err.message != debrid.ERROR.NOT_READY){
      console.log('cache next episode:', err);
    }

  }

}

async function getDebridFiles(userConfig, infos, debridInstance){

  if(infos.magnetUrl){

    return debridInstance.getFilesFromMagnet(infos.magnetUrl, infos.infoHash);

  }else{

    let buffer = await torrentInfos.getTorrentFile(infos);

    if(config.replacePasskey){

      if(infos.private && !userConfig.passkey){
        return debridInstance.getFilesFromHash(infos.infoHash);
      }

      if(!userConfig.passkey.match(new RegExp(config.replacePasskeyPattern))){
        throw new Error(`Invalid user passkey, pattern not match: ${config.replacePasskeyPattern}`);
      }

      const from = buffer.toString('binary');
      let to = from.replace(new RegExp(config.replacePasskey, 'g'), userConfig.passkey);
      const diffLength = from.length - to.length;
      const announceLength = from.match(/:announce([\d]+):/);
      if(diffLength && announceLength && announceLength[1]){
        to = to.replace(announceLength[0], `:announce${parseInt(announceLength[1]) - diffLength}:`);
      }
      buffer = Buffer.from(to, 'binary');

    }

    return debridInstance.getFilesFromBuffer(buffer, infos.infoHash);

  }

}

export async function getStreams(userConfig, type, stremioId, publicUrl){

  userConfig = mergeDefaultUserConfig(userConfig);
  const {id, season, episode} = parseStremioId(stremioId);
  const debridInstance = debrid.instance(userConfig);

  let metaInfos = await getMetaInfos(type, stremioId);

  const torrents = await getTorrents(userConfig, metaInfos, debridInstance);

  // Prepare next expisode torrents list
  if(type == 'series'){
    prepareNextEpisode({...userConfig, forceCacheNextEpisode: false}, metaInfos, debridInstance);
  }

  return torrents.map(torrent => {
    const file = type == 'series' && torrent.infos.files.length ? searchEpisodeFile(torrent.infos.files.sort(sortBy('size', true)), season, episode) : {};
    const quality = torrent.quality > 0 ? `(${config.qualities.find(q => q.value == torrent.quality).label})` : '';
    const { codecInfo, sourceInfo, audioInfo } = extractMediaInfo(torrent.name);

    // Format media information nicely
    const mediaInfo = [];
    if (codecInfo) mediaInfo.push(`🎬 ${codecInfo}`);
    if (sourceInfo) mediaInfo.push(`📀 ${sourceInfo}`);
    if (audioInfo) mediaInfo.push(`🔊 ${audioInfo}`);

    const rows = [type == 'series' && file.name ? file.name : torrent.name];
    if(torrent.infoText) rows.push(`ℹ️ ${torrent.infoText}`);

    // Format main info line with improved styling
    rows.push([
      `💾 ${bytesToSize(file.size || torrent.size)}`,
      `👥 ${torrent.seeders}`,
      `⚙️ ${formatIndexerName(torrent.indexerId)}`,
      ...formatLanguages(torrent.languages || [], torrent.name)
    ].join(' '));

    // Add media info if available
    if (mediaInfo.length > 0) {
      rows.push(mediaInfo.join(' '));
    }

    // Only show download progress if there's actual progress (not 0%)
    if(torrent.progress && !torrent.isCached && (torrent.progress.percent > 0 || torrent.progress.speed > 0)) {
      rows.push(`⬇️ ${torrent.progress.percent}% ${bytesToSize(torrent.progress.speed)}/s`);
    }

    // Use the appropriate status icon
    let statusIcon = '';
    if (torrent.isCached) {
      // For cached torrents, use the yellow lightning bolt
      statusIcon = '⚡';
    } else {
      // For non-cached torrents, use the down arrow
      statusIcon = '⬇️';
    }

    return {
      name: `[${debridInstance.shortName}${statusIcon}] ${quality}`,
      title: rows.join("\n"),
      url: torrent.disabled ? '#' : `${publicUrl}/${btoa(JSON.stringify(userConfig))}/download/${type}/${stremioId}/${torrent.id}`
    };
  });

}

export async function getDownload(userConfig, type, stremioId, torrentId){

  userConfig = mergeDefaultUserConfig(userConfig);
  const debridInstance = debrid.instance(userConfig);
  const infos = await torrentInfos.getById(torrentId);
  const {id, season, episode} = parseStremioId(stremioId);
  const cacheKey = `download:2:${await debridInstance.getUserHash()}:${stremioId}:${torrentId}`;
  let files;
  let download;
  let waitMs = 0;

  while(actionInProgress.getDownload[cacheKey]){
    await wait(Math.min(300, waitMs+=50));
  }
  actionInProgress.getDownload[cacheKey] = true;

  try {

    // Prepare next expisode debrid cache
    if(type == 'series' && userConfig.forceCacheNextEpisode){
      getMetaInfos(type, stremioId).then(metaInfos => prepareNextEpisode(userConfig, metaInfos, debridInstance));
    }

    download = await cache.get(cacheKey);
    if(download) return download;

    console.log(`${stremioId} : ${debridInstance.shortName} : ${infos.infoHash} : get files ...`);
    files = await getDebridFiles(userConfig, infos, debridInstance);
    console.log(`${stremioId} : ${debridInstance.shortName} : ${infos.infoHash} : ${files.length} files found`);

    files = files.sort(sortBy('size', true));

    if(type == 'movie'){

      download = await debridInstance.getDownload(files[0]);

    }else if(type == 'series'){

      let bestFile = searchEpisodeFile(files, season, episode) || files[0];
      download = await debridInstance.getDownload(bestFile);

    }

    if(download){
      await cache.set(cacheKey, download, {ttl: 3600}); // 1 heure
      return download;
    }

    throw new Error(`No download for type ${type} and ID ${torrentId}`);

  }finally{

    delete actionInProgress.getDownload[cacheKey];

  }

}
