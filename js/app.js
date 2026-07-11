import { $ } from './dom.js';
import { readInputs } from './pricing.js';
import { loadCalculatorState, loadTheme, saveCalculatorState, saveTheme } from './storage.js';
import { renderChart, renderSummary } from './chart.js';
import {
  applyPricingPreset,
  ensureModelVisible,
  findPricingPreset,
  getPricingPresets,
  getVisibleModels,
  initModelSelector,
  initPricingPresets,
  loadPricingPresets,
  registerRuntimePreset,
  renderModelSelector,
  renderPricingTable,
} from './presets.js';
import { setupModelsDevBrowser } from './models-dev.js';

const DEFAULT_PRESET_ID = 'gpt55';
const TOKEN_FIELDS = ['tokensNew', 'tokensOut', 'tokensHit', 'tokensCreate'];
const FORM_FIELDS = [
  'priceNew', 'priceOut', 'priceHit', 'priceCreate',
  ...TOKEN_FIELDS,
  'multiplier', 'pricingPreset',
];

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark-mode', dark);
  $('themeToggle').textContent = dark ? '☀️' : '🌙';
  $('themeToggle').title = dark ? '切换到浅色模式' : '切换到深色模式';
}

function toggleTheme() {
  const theme = document.documentElement.classList.contains('dark-mode') ? 'light' : 'dark';
  applyTheme(theme);
  saveTheme(theme);
}

function initTheme() {
  applyTheme(loadTheme() || getSystemTheme());
  $('themeToggle').addEventListener('click', toggleTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!loadTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });
}

function saveToStorage() {
  const saved = loadCalculatorState();
  TOKEN_FIELDS.forEach((id) => { saved[id] = $(id).value; });
  saved.multiplier = $('multiplier').value;
  const selectedPreset = $('pricingPreset').value;
  saved.pricingPreset = selectedPreset.startsWith('md-') ? DEFAULT_PRESET_ID : selectedPreset;
  saved.visibleModels = Array.from(getVisibleModels()).filter((id) => !id.startsWith('md-'));
  saveCalculatorState(saved);
}

function update() {
  const data = readInputs();
  renderSummary(data);
  renderChart(data, getPricingPresets(), getVisibleModels(), $('pricingPreset').value);
  saveToStorage();
}

function applyModelsDevModel(item) {
  const preset = registerRuntimePreset({
    id: item.id,
    name: `${item.label} · ${item.name}`,
    priceNew: item.priceNew,
    priceOut: item.priceOut,
    priceHit: item.priceHit,
    priceCreate: item.priceCreate,
    note: item.note,
  });
  $('pricingPreset').value = preset.id;
  applyPricingPreset(preset.id);
  ensureModelVisible(preset.id);
  renderModelSelector(preset.id, update);
  renderPricingTable();
  update();
}

function registerFormListeners() {
  FORM_FIELDS.forEach((id) => $(id).addEventListener('input', () => {
    if (id === 'pricingPreset') {
      const newPreset = $('pricingPreset').value;
      applyPricingPreset(newPreset);
      ensureModelVisible(newPreset);
      renderModelSelector(newPreset, update);
    }
    update();
  }));
}

async function init() {
  initTheme();
  await loadPricingPresets();
  const saved = loadCalculatorState();
  initPricingPresets(DEFAULT_PRESET_ID);

  if (saved.pricingPreset && findPricingPreset(saved.pricingPreset)) {
    $('pricingPreset').value = saved.pricingPreset;
    applyPricingPreset(saved.pricingPreset);
  }
  TOKEN_FIELDS.forEach((id) => {
    if (saved[id] !== undefined && saved[id] !== '') $(id).value = saved[id];
  });
  if (saved.multiplier !== undefined && saved.multiplier !== '') $('multiplier').value = saved.multiplier;

  renderPricingTable();
  initModelSelector($('pricingPreset').value, saved.visibleModels, update);
  setupModelsDevBrowser({ onSelect: applyModelsDevModel });
  registerFormListeners();
  update();
}

init();
