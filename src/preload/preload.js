'use strict';

// Renderer'a açılan tek yüzey. Node.js veya veritabanı erişimi verilmez;
// yalnızca aşağıda adı geçen IPC kanalları kullanılabilir.
const { contextBridge, ipcRenderer } = require('electron');

const cleanMessage = (m) => String(m)
  .replace(/^Error invoking remote method '[^']+': /, '')
  .replace(/^\w*Error: /, '');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args).catch((e) => {
  throw new Error(cleanMessage(e.message));
});

const EVENTS = new Set([
  'notes:changed',
  'notes:reload',
  'categories:changed',
  'settings:changed',
  'widgets:changed',
  'widget:state',
  'app:open-note',
  'app:new-note',
  'app:show-settings',
  'app:flush',
]);

contextBridge.exposeInMainWorld('glassnote', {
  notes: {
    list: call('notes:list'),
    get: call('notes:get'),
    create: call('notes:create'),
    update: call('notes:update'),
    trash: call('notes:trash'),
    restore: call('notes:restore'),
    destroy: call('notes:destroy'),
    emptyTrash: call('notes:emptyTrash'),
    discardIfEmpty: call('notes:discardIfEmpty'),
    // Yalnızca pencere kapanırken kullanılır: kaydedilmemiş içeriği bloklayarak yazar.
    updateSync: (id, patch) => ipcRenderer.sendSync('notes:update-sync', id, patch),
  },
  categories: {
    list: call('categories:list'),
    create: call('categories:create'),
    update: call('categories:update'),
    reorder: call('categories:reorder'),
    remove: call('categories:remove'),
  },
  settings: {
    get: call('settings:get'),
    set: call('settings:set'),
  },
  widgets: {
    open: call('widgets:open'),
    close: call('widgets:close'),
    openIds: call('widgets:openIds'),
  },
  widget: {
    init: call('widget:init'),
    menu: call('widget:menu'),
    close: call('widget:close'),
    setAlwaysOnTop: call('widget:setAlwaysOnTop'),
  },
  app: {
    info: call('app:info'),
    showMain: call('app:showMain'),
    openDataFolder: call('app:openDataFolder'),
    openExternal: call('app:openExternal'),
    exportBackup: call('app:export'),
    pickImport: call('app:pickImport'),
    importBackup: call('app:import'),
  },
  on(event, callback) {
    if (!EVENTS.has(event) || typeof callback !== 'function') throw new Error(`Bilinmeyen olay: ${event}`);
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
});
