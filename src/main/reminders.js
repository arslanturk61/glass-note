'use strict';

const path = require('node:path');
const { Notification, powerMonitor } = require('electron');
const { resourcesDir } = require('./paths');

const CHECK_INTERVAL = 15_000;

// Uygulama (pencere veya tepsi) çalıştığı sürece hatırlatmaları denetler.
// Uygulama kapalıyken hatırlatma gösterilmez; açıldığında kaçırılanlar bildirilir.
function startReminders(ctx) {
  const live = new Set(); // bildirimler GC'ye gitmesin diye referans tutulur
  const icon = path.join(resourcesDir, 'icon.png');

  function check() {
    const due = ctx.store.notes.dueReminders(new Date().toISOString());
    for (const n of due) {
      // Önce "tamamlandı" işaretlenir: bir hatırlatma asla iki kez tetiklenmez.
      const updated = ctx.store.notes.markReminderDone(n.id);
      ctx.notesChanged({ notes: [updated] });
      if (!Notification.isSupported()) continue;
      const when = new Date(n.reminder_at);
      const late = Date.now() - when.getTime() > 5 * 60_000;
      const body = (n.content_text || '').replace(/\s+/g, ' ').slice(0, 120)
        || when.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
      const notif = new Notification({
        title: `${late ? 'Kaçırılan hatırlatma' : 'Hatırlatma'}: ${n.title || 'Başlıksız not'}`,
        body,
        icon,
      });
      notif.on('click', () => { ctx.showMain({ noteId: n.id }); live.delete(notif); });
      notif.on('close', () => live.delete(notif));
      live.add(notif);
      notif.show();
    }
    return due.length;
  }

  const timer = setInterval(check, CHECK_INTERVAL);
  powerMonitor.on('resume', check);
  powerMonitor.on('unlock-screen', check);
  check();

  return { check, stop: () => clearInterval(timer) };
}

module.exports = { startReminders };
