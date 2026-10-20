const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' });

export function relativeTime(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'şimdi';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return dateFmt.format(new Date(iso));
}

export const shortDateTime = (iso) => shortFmt.format(new Date(iso));
export const fullDateTime = (iso) => fullFmt.format(new Date(iso));

// <input type="datetime-local"> yerel saatle çalışır; veritabanında ISO (UTC) saklanır.
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value); // yerel saat olarak yorumlanır
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
