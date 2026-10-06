import { IndexedDbRepository } from "./indexeddb";
import { SyncEngine } from "./sync";
import type { TimeRepository } from "./repository";

/** 应用唯一的仓储实例；设置页、记录页与同步引擎共用同一份连接。 */
export const repository: TimeRepository = new IndexedDbRepository();

/** 云端同步引擎；未配置地址与口令时不会发出任何请求。 */
export const sync = new SyncEngine(repository);

export type { TimeRepository } from "./repository";
export { syncStateLabel } from "./sync";
export type { SyncSettings, SyncState } from "./remote-settings";
export { emitLocalDataChanged, isRemoteApply, onLocalDataChanged } from "./events";
