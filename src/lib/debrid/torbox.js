import {createHash} from 'crypto';
import {ERROR} from './const.js';
import {wait, isVideo} from '../util.js';

export default class Torbox {

  static id = 'torbox';
  static name = 'TorBox';
  static shortName = 'TB';
  static cacheCheckAvailable = false;
  static configFields = [
    {
      type: 'text', 
      name: 'debridApiKey', 
      label: `TorBox API Key`, 
      required: true, 
      href: {value: 'https://torbox.app', label:'Obtenir une clé API TorBox'}
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
    return []; // TorBox ne supporte pas la vérification de cache via API directe
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
    // Comme TorBox n'a pas d'API publique documentée, nous utilisons StremThru comme intermédiaire
    throw new Error("TorBox direct API not supported. Please use StremThru integration instead.");
  }

  async getFilesFromBuffer(buffer, infoHash){
    return this.getFilesFromHash(infoHash);
  }

  async getDownload(file){
    throw new Error("TorBox direct API not supported. Please use StremThru integration instead.");
  }

  async getUserHash(){
    return createHash('md5').update(this.#apiKey).digest('hex');
  }
}
