import debridlink from "./debrid/debridlink.js";
import alldebrid from "./debrid/alldebrid.js";
import realdebrid from './debrid/realdebrid.js';
import premiumize from './debrid/premiumize.js';
import stremthru from './debrid/stremthru.js';
import pikpak from './debrid/pikpak.js';
import easydebrid from './debrid/easydebrid.js';
import offcloud from './debrid/offcloud.js';
import torbox from './debrid/torbox.js';
export {ERROR} from './debrid/const.js';

const debrid = {debridlink, alldebrid, realdebrid, premiumize, stremthru, pikpak, easydebrid, offcloud, torbox};

export function instance(userConfig){

  if(!debrid[userConfig.debridId]){
    throw new Error(`Debrid service "${userConfig.debridId} not exists`);
  }

  // Services that require StremThru (no public API)
  const stremthruOnlyServices = ['pikpak', 'torbox', 'easydebrid', 'offcloud'];

  // If StremThru is enabled or service requires it, use StremThru as wrapper
  if (userConfig.debridId !== 'stremthru' &&
      (userConfig.useStremThru || stremthruOnlyServices.includes(userConfig.debridId))) {

    // Use default StremThru URL if not provided
    const stremthruUrl = userConfig.stremthruUrl || 'https://stremthru.13377001.xyz';

    // Create a StremThru configuration that uses the selected debrid service
    const stremthruConfig = {
      ...userConfig,
      debridId: 'stremthru',
      stremthruStore: userConfig.debridId,
      stremthruUrl: stremthruUrl
    };
    return new stremthru(stremthruConfig);
  }

  return new debrid[userConfig.debridId](userConfig);
}

export async function list(){
  const values = [];
  for(const instance of Object.values(debrid)){
    values.push({
      id: instance.id,
      name: instance.name,
      shortName: instance.shortName,
      configFields: instance.configFields
    })
  }
  return values;
}