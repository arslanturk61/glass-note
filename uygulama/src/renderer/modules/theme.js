import { readableOn } from '../components/dom.js';

// Kullanıcı görünüm ayarlarını CSS değişkenlerine yansıtır.
// Açık/koyu tema ana süreçte nativeTheme.themeSource ile seçilir ve
// CSS'teki prefers-color-scheme sorgusu bunu otomatik izler.
export function applyAppearance(settings, { glassEnabled }) {
  const root = document.documentElement;
  root.style.setProperty('--accent', settings.accentColor);
  root.style.setProperty('--on-accent', readableOn(settings.accentColor));
  root.dataset.font = settings.fontSize;
  const glass = glassEnabled ? settings.glassIntensity / 100 : 0;
  root.style.setProperty('--glass', String(glass));
  root.classList.toggle('no-glass', glass === 0);
  root.classList.toggle('compact', settings.cardStyle === 'compact');
}
