import {createHash} from 'crypto';
import {ERROR} from './const.js';
import {wait, isVideo} from '../util.js';

export default class PikPak {

  static id = 'pikpak';
  static name = 'PikPak';
  static shortName = 'PP';
  static cacheCheckAvailable = false;
  static configFields = [
    {
      type: 'text', 
      name: 'debridApiKey', 
      label: `PikPak Email:Password`, 
      required: true, 
      href: {value: 'https://mypikpak.com', label:'Create PikPak Account'}
    }
  ];

  #apiKey;
  #ip;

  constructor(userConfig) {
    Object.assign(this, this.constructor);
    this.#apiKey = userConfig.debridApiKey;
    this.#ip = userConfig.ip || '';
  }

  async getTorrentsCached(torrents, isValidCachedFiles){
    return []; // PikPak does not support cache checking via direct API
  }

  async getProgressTorrents(torrents){
    return torrents.reduce((progress, torrent) => {
      progress[torrent.hash] = {
        percent: 0,
        speed: 0
      }
      return progress;
    }, {});
  }

  async getFilesFromHash(infoHash){
    return this.getFilesFromMagnet(`magnet:?xt=urn:btih:${infoHash}`, infoHash);
  }

  async getFilesFromMagnet(magnet, infoHash){
    // As PikPak doesn't have a direct public API, we use StremThru as intermediary
    throw new Error("PikPak direct API not supported. Please use StremThru integration instead.");
  }

  async getFilesFromBuffer(buffer, infoHash){
    return this.getFilesFromHash(infoHash);
  }

  async getDownload(file){
    throw new Error("PikPak direct API not supported. Please use StremThru integration instead.");
  }

  async getUserHash(){
    return createHash('md5').update(this.#apiKey).digest('hex');
  }
}
