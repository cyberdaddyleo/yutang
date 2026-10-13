import {readStore,writeStore} from '../../lib/storage.js';
import {STORE_KEY} from './catalog.js';
export {STORE_KEY};
export const loadMuyu=()=>readStore(STORE_KEY,null);
export const saveMuyu=value=>writeStore(STORE_KEY,value);
