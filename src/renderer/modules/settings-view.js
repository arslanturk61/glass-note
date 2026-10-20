import { api, state, render, setCategories, upsertNotes } from './state.js';
import { h, clear, debounce } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { openPopover } from '../components/popover.js';
import { openDialog, confirmDialog } from '../components/dialog.js';
import { colorPicker } from '../components/color-picker.js';
import { toast } from '../components/toast.js';
import { reportError } from './actions.js';

const WIDGET_SIZES = [
  { label: 'Küçük', w: 250, h: 240 },
  { label: 'Orta', w: 300, h: 320 },
  { label: 'Büyük', w: 380, h: 440 },
];

export function createSettingsView() {
  const el = h('div', { class: 'notes-scroll settings-scroll' });
  const head = h('div', { class: 'content-head' }, h('h1', null, 'Ayarlar'));

  async function set(key, value) {
    const prev = state.settings[key];
    state.settings[key] = value;
    render();
    try {
      await api.settings.set(key, value);
      return true;
    } catch (e) {
      state.settings[key] = prev;
      render();
      reportError(e);
      return false;
    }
  }

  const row = (title, hint, control, { disabled = false } = {}) => h('div', { class: `setting-row${disabled ? ' disabled' : ''}` },
    h('div', { class: 'text' }, h('strong', null, title), hint ? h('span', { class: 'hint' }, hint) : null),
    h('div', { class: 'control' }, control));

  const toggle = (key, label, { disabled = false, onChange } = {}) => h('label', { class: 'switch' },
    h('input', {
      type: 'checkbox', role: 'switch', checked: !!state.settings[key], disabled, 'aria-label': label,
      onchange: async (e) => {
        const ok = await (onChange ? onChange(e.target.checked) : set(key, e.target.checked));
        if (!ok) e.target.checked = !e.target.checked;
      },
    }), h('span'));

  const segmented = (key, options, label) => h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([value, text, ic]) => h('button', {
      type: 'button', 'aria-pressed': String(state.settings[key] === value), onclick: () => set(key, value),
    }, ic ? icon(ic, 'xs') : null, text)));

  function colorControl(key, { allowAuto = false, autoLabel } = {}) {
    const v = state.settings[key];
    const btn = h('button', {
      class: `color-btn${v ? '' : ' auto'}`, style: v ? { '--c': v } : null, type: 'button',
      'aria-label': `Renk seç (şu an ${v ?? 'otomatik'})`, title: v ?? autoLabel,
      onclick: () => {
        const save = debounce((c) => set(key, c), 200);
        openPopover(btn, colorPicker({ value: state.settings[key], palette: state.info.palette, allowAuto, autoLabel, onChange: save }), { align: 'end' });
      },
    });
    return h('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px' } },
      h('span', { class: 'hint', style: { 'font-family': 'ui-monospace, Consolas, monospace' } }, v ?? autoLabel), btn);
  }

  function glassControl() {
    const out = h('output', null, `%${state.settings.glassIntensity}`);
    const save = debounce((v) => api.settings.set('glassIntensity', v).catch(reportError), 250);
    const input = h('input', {
      type: 'range', min: '0', max: '100', step: '5', value: String(state.settings.glassIntensity), 'aria-label': 'Cam efekti yoğunluğu',
      disabled: !state.info.supportsGlass,
      oninput: (e) => {
        const v = Number(e.target.value);
        out.value = `%${v}`;
        state.settings.glassIntensity = v;
        document.documentElement.style.setProperty('--glass', String(v / 100));
        document.documentElement.classList.toggle('no-glass', v === 0);
        save(v);
      },
    });
    return h('div', { class: 'range-wrap' }, input, out);
  }

  async function doExport() {
    try {
      const r = await api.app.exportBackup();
      if (!r.canceled) toast(`${r.notes} not ve ${r.categories} kategori dışa aktarıldı`);
    } catch (e) {
      reportError(e, 'Dışa aktarma başarısız: ');
    }
  }

  async function doImport() {
    let r;
    try {
      r = await api.app.pickImport();
    } catch (e) {
      reportError(e, 'Dosya okunamadı: ');
      return;
    }
    if (r.canceled) return;
    if (!r.ok) {
      await openDialog((close) => h('div', null,
        h('div', { class: 'modal-body' },
          h('h2', null, 'Yedek içe aktarılamadı'),
          h('p', null, `“${r.fileName}” doğrulanamadı. Mevcut verilerinizde hiçbir değişiklik yapılmadı.`),
          h('ul', { class: 'error-list' }, r.errors.map((e) => h('li', null, e)))),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', autofocus: true, onclick: () => close() }, 'Tamam'))));
      return;
    }
    const exported = r.summary.exported_at ? new Date(r.summary.exported_at).toLocaleString('tr-TR') : 'bilinmiyor';
    const mode = await openDialog((close) => {
      let choice = 'merge';
      const opt = (value, title, hint) => h('label', { class: 'option' },
        h('input', { type: 'radio', name: 'import-mode', value, checked: value === choice, onchange: () => { choice = value; } }),
        h('strong', null, title), h('span', { class: 'hint' }, hint));
      return h('form', { onsubmit: (e) => { e.preventDefault(); close(choice); } },
        h('div', { class: 'modal-body' },
          h('h2', null, 'Yedekten içe aktar'),
          h('p', null, `“${r.fileName}” doğrulandı: ${r.summary.notes} not, ${r.summary.categories} kategori (dışa aktarma: ${exported}).`),
          h('div', { class: 'option-list' },
            opt('merge', 'Birleştir (önerilen)', 'Mevcut notlarınız korunur; yedekteki notlar yanlarına eklenir. Aynı adlı kategoriler birleştirilir.'),
            opt('replace', 'Değiştir', 'Mevcut tüm notlar ve kategoriler yedektekilerle değiştirilir. İşlemden önce otomatik bir güvenlik yedeği alınır.'))),
        h('div', { class: 'modal-actions' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => close(null) }, 'Vazgeç'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Devam')));
    });
    if (!mode) return;
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'Mevcut veriler değiştirilsin mi?',
        message: 'Şu anki tüm notlarınız ve kategorileriniz yedekteki verilerle değiştirilecek. Öncesinde veritabanının tam bir kopyası “backups” klasörüne kaydedilecek.',
        confirmText: 'Değiştir', danger: true,
      });
      if (!ok) return;
    }
    try {
      const res = await api.app.importBackup(r.token, mode);
      setCategories(await api.categories.list());
      state.notes.clear();
      upsertNotes(await api.notes.list());
      render();
      toast(`${res.notes} not içe aktarıldı${res.safetyBackup ? ' · güvenlik yedeği alındı' : ''}`, { duration: 6000 });
    } catch (e) {
      reportError(e, 'İçe aktarma başarısız, verileriniz değiştirilmedi: ');
    }
  }

  function updateText(u) {
    switch (u.state) {
      case 'checking': return 'Güncellemeler denetleniyor…';
      case 'none': return 'En güncel sürümü kullanıyorsunuz.';
      case 'downloading': return `Sürüm ${u.version} indiriliyor… %${u.percent ?? 0}`;
      case 'ready': return `Sürüm ${u.version} indirildi. Yeniden başlattığınızda kurulacak.`;
      case 'error': return u.message;
      case 'disabled': return 'Otomatik güncelleme kapalı. İsterseniz elle denetleyebilirsiniz.';
      case 'unsupported': return u.message;
      default: return 'Güncellemeler denetlenmedi.';
    }
  }

  function updateAction(u) {
    if (u.state === 'unsupported') return null;
    if (u.state === 'ready') {
      return h('button', { class: 'btn sm primary', onclick: () => api.app.installUpdate().catch(reportError) }, 'Yeniden başlat ve kur');
    }
    return h('button', {
      class: 'btn sm', disabled: u.state === 'checking' || u.state === 'downloading',
      onclick: () => api.app.checkUpdates().catch(reportError),
    }, 'Şimdi denetle');
  }

  function renderSettings() {
    const s = state.settings;
    const info = state.info;
    const keep = el.scrollTop;
    const focusLabel = el.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    const sizeIdx = WIDGET_SIZES.findIndex((z) => z.w === s.widgetWidth && z.h === s.widgetHeight);

    clear(el, h('div', { class: 'settings-page' },
      h('section', { class: 'settings-section' },
        h('h2', null, 'Görünüm'),
        h('div', { class: 'settings-card' },
          row('Tema', 'Sistem seçeneği Windows ayarınızı izler.', segmented('theme', [['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']], 'Tema')),
          row('Vurgu rengi', 'Butonlar, seçimler ve odak halkaları.', colorControl('accentColor')),
          row('Varsayılan not rengi', 'Yeni notlara uygulanır. Otomatik: notlar kategorinin rengini alır.', colorControl('defaultNoteColor', { allowAuto: true, autoLabel: 'Otomatik' })),
          row('Not kartları', null, segmented('cardStyle', [['comfortable', 'Rahat'], ['compact', 'Kompakt']], 'Not kartları')),
          row('Yazı boyutu', null, segmented('fontSize', [['small', 'Küçük'], ['medium', 'Orta'], ['large', 'Büyük']], 'Yazı boyutu')),
          row('Cam efekti yoğunluğu',
            info.supportsGlass ? '0 tamamen opak yüzeyler demektir. Metin alanları her zaman okunaklı kalır.' : 'Bu Windows sürümü sistem bulanıklığını (akrilik) desteklemiyor; opak yüzeyler kullanılıyor. Windows 11 22H2 veya üstü gerekir.',
            glassControl(), { disabled: !info.supportsGlass }),
          row("Varsayılan widget boyutu", 'Daha önce hiç açılmamış notların widget boyutu.', h('div', { class: 'segmented', role: 'group', 'aria-label': 'Widget boyutu' },
            WIDGET_SIZES.map((z, i) => h('button', {
              type: 'button', 'aria-pressed': String(sizeIdx === i), title: `${z.w}×${z.h}`,
              onclick: async () => { if (await set('widgetWidth', z.w)) set('widgetHeight', z.h); },
            }, z.label)))))),

      h('section', { class: 'settings-section' },
        h('h2', null, 'Davranış'),
        h('div', { class: 'settings-card' },
          row(`Windows açıldığında ${info.name}'u başlat`,
            info.openAtLoginActual === s.openAtLogin ? 'Windows oturumu açıldığında otomatik başlatılır.' : 'Uyarı: Windows başlangıç kaydı bu ayarla eşleşmiyor. Ayarı kapatıp açarak yeniden uygulayın.',
            toggle('openAtLogin', 'Windows başlangıcında çalıştır', {
              onChange: async (v) => {
                const ok = await set('openAtLogin', v);
                if (ok) {
                  state.info = await api.app.info();
                  toast(v ? 'Windows başlangıcına eklendi' : 'Windows başlangıcından kaldırıldı');
                  render();
                }
                return ok;
              },
            })),
          row(`Windows ile başlatıldığında`, 'Yalnızca otomatik başlatmada geçerlidir; uygulamayı kendiniz açtığınızda ana pencere her zaman açılır.',
            segmented('startupMode', [['window', 'Ana pencereyi aç'], ['tray', 'Tepside başlat']], 'Başlangıç davranışı'), { disabled: !s.openAtLogin }),
          row('Kapatınca sistem tepsisinde kalsın', `Pencereyi kapatmak ${info.name}'u tepsiye gizler. Tamamen çıkmak için tepsi menüsünü kullanın.`, toggle('closeToTray', 'Tepside kal')),
          row("Önceki widget'ları geri yükle", "Uygulama başladığında açık bıraktığınız masaüstü widget'ları aynı konumda yeniden açılır.", toggle('restoreWidgets', "Widget'ları geri yükle")),
          row("Yeni widget'lar her zaman üstte", 'Her widget için ayrıca widget menüsünden değiştirilebilir.', toggle('widgetAlwaysOnTop', 'Her zaman üstte varsayılanı')),
          row('Otomatik kaydetme', s.autosave ? 'Yazarken değişiklikler kısa bir gecikmeyle diske yazılır.' : 'Kapalı: Ctrl+S ile kaydedin. Güvenlik için not değiştirilirken veya pencere kapanırken yine de kaydedilir.', toggle('autosave', 'Otomatik kaydetme')),
          row('Son görünümü hatırla', 'Ana pencere açıldığında son seçili liste ve filtre geri yüklenir.', toggle('restoreLastView', 'Son görünümü hatırla')))),

      h('section', { class: 'settings-section' },
        h('h2', null, 'Veriler'),
        h('div', { class: 'settings-card' },
          row('Veritabanı konumu', h('span', { class: 'path' }, info.dbPath),
            h('button', { class: 'btn sm', onclick: () => api.app.openDataFolder() }, icon('folderOpen', 'sm'), 'Klasörü aç')),
          row('Dışa aktar', 'Tüm notları, kategorileri ve ayarları tek bir JSON dosyasına kaydeder.',
            h('button', { class: 'btn sm', onclick: doExport }, icon('download', 'sm'), 'Dışa aktar')),
          row('İçe aktar', 'Dosya önce doğrulanır; birleştirme veya değiştirme seçeneği sunulur. Hiçbir veri sessizce üzerine yazılmaz.',
            h('button', { class: 'btn sm', onclick: doImport }, icon('upload', 'sm'), 'İçe aktar')))),

      h('section', { class: 'settings-section' },
        h('h2', null, 'Güncellemeler'),
        h('div', { class: 'settings-card' },
          row('Otomatik güncelleme', 'Yeni sürümler GitHub üzerinden denetlenir, arka planda indirilir ve uygulamadan çıkarken kurulur. Notlarınız hiçbir zaman gönderilmez.',
            toggle('autoUpdate', 'Otomatik güncelleme')),
          row(`Sürüm ${info.version}`, updateText(state.update), updateAction(state.update)))),

      h('section', { class: 'settings-section' },
        h('div', { class: 'settings-card about' },
          h('div', { class: 'brand-logo', 'aria-hidden': 'true' }, icon('notes')),
          h('div', { class: 'text', style: { display: 'grid', gap: '3px' } },
            h('strong', null, `${info.name} ${info.version}`),
            h('span', { class: 'hint' }, `Şema sürümü ${info.schemaVersion} · Tüm veriler bu bilgisayarda saklanır. Hesap veya telemetri yoktur; internete yalnızca güncelleme denetimi için çıkılır.`)),
          h('span', { style: { 'margin-left': 'auto', color: 'var(--success)' } }, icon('shield')))),
    ));
    el.scrollTop = keep;
    if (focusLabel) el.querySelector(`[aria-label="${CSS.escape(focusLabel)}"]`)?.focus({ preventScroll: true });
  }

  return { el, head, render: renderSettings };
}
