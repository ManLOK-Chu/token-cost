export const STORAGE_KEY = 'token-cost-calculator';
export const THEME_KEY = 'token-calc-theme';

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch (_) {
    return {};
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

export function loadCalculatorState() {
  return readJson(STORAGE_KEY);
}

export function saveCalculatorState(values) {
  writeJson(STORAGE_KEY, values);
}

export function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (_) {
    return null;
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_) {}
}
