'use strict';

const path = require('node:path');
const { Tray, Menu, nativeImage } = require('electron');
const { resourcesDir } = require('./paths');
const { APP_NAME } = require('../shared/constants');

function createTray(ctx) {
  const tray = new Tray(nativeImage.createFromPath(path.join(resourcesDir, 'tray.png')));
  tray.setToolTip(APP_NAME);
  let template = [];

  function rebuild() {
    const n = ctx.widgets.openIds().length;
    template = [
      { id: 'open', label: `${APP_NAME}'u aç`, click: () => ctx.showMain() },
      { id: 'new', label: 'Yeni not oluştur', click: () => ctx.showMain({ newNote: true }) },
      { type: 'separator' },
      { id: 'show-widgets', label: n ? `Widget'ları göster (${n})` : "Widget'ları göster", enabled: n > 0, click: () => ctx.widgets.showAll() },
      { id: 'hide-widgets', label: "Widget'ları gizle", enabled: n > 0, click: () => ctx.widgets.hideAll() },
      { type: 'separator' },
      { id: 'settings', label: 'Ayarlar', click: () => ctx.showMain({ settings: true }) },
      { type: 'separator' },
      { id: 'quit', label: 'Uygulamadan çık', click: () => ctx.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  tray.on('click', () => ctx.showMain());
  rebuild();

  return {
    rebuild,
    // Test ve teşhis amaçlı: menü öğelerini kimliğiyle tetikler.
    items: () => template.filter((t) => t.id).map(({ id, label, enabled }) => ({ id, label, enabled: enabled !== false })),
    trigger: (id) => template.find((t) => t.id === id)?.click?.(),
    balloon: (title, content) => tray.displayBalloon({ title, content, iconType: 'info' }),
    destroy: () => tray.destroy(),
  };
}

module.exports = { createTray };
