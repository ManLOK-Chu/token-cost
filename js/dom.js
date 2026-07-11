export const $ = (id) => document.getElementById(id);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function readNumber(id) {
  const value = Number($(id).value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

export function formatExactPrice(value) {
  if (value == null) return '—';
  return `$${String(value)}`;
}
