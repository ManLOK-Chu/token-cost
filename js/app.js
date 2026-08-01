import { $ } from './dom.js';
import { readInputs } from './pricing.js';
import {
  clearLocalStorage,
  loadCalculatorState,
  loadTheme,
  saveCalculatorState,
  saveTheme,
} from './storage.js';
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

const DEFAULT_PRESET_ID = 'gpt-5.6-sol';
const LEGACY_PRESET_IDS = {
  gpt55: 'gpt-5.5',
  gpt56sol: 'gpt-5.6-sol',
  gpt56terra: 'gpt-5.6-terra',
  gpt56luna: 'gpt-5.6-luna',
  'claude-opus-48': 'claude-opus-5',
  'claude-opus-4-8': 'claude-opus-5',
  'claude-sonnet-46': 'claude-sonnet-5',
  'claude-sonnet-4-6': 'claude-sonnet-5',
  'glm-52': 'glm-5.2',
  'cursor-composer-25': 'cursor-composer-2.5',
};
const TOKEN_FIELDS = ['tokensNew', 'tokensOut', 'tokensHit', 'tokensCreate'];
const FORM_FIELDS = [
  'priceNew', 'priceOut', 'priceHit', 'priceCreate',
  ...TOKEN_FIELDS,
  'multiplier', 'pricingPreset',
];

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function migratePresetId(id) {
  return LEGACY_PRESET_IDS[id] || id;
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

function clearStoredData() {
  if (!window.confirm('确定清理本地存储中的计算器设置吗？页面将重新加载。')) return;
  clearLocalStorage();
  window.location.reload();
}

function initStorageControls() {
  $('clearStorage').addEventListener('click', clearStoredData);
}

function saveToStorage() {
  const saved = loadCalculatorState();
  TOKEN_FIELDS.forEach((id) => { saved[id] = $(id).value; });
  saved.multiplier = $('multiplier').value;
  const selectedPreset = $('pricingPreset').value;
  saved.pricingPreset = selectedPreset.startsWith('md-') ? DEFAULT_PRESET_ID : migratePresetId(selectedPreset);
  saved.visibleModels = Array.from(getVisibleModels())
    .filter((id) => !id.startsWith('md-'))
    .map(migratePresetId);
  saveCalculatorState(saved);
}

function update() {
  const data = readInputs();
  renderSummary(data);
  renderChart(data, getPricingPresets(), getVisibleModels(), $('pricingPreset').value);
  saveToStorage();
}

function applyModelsDevModel(model) {
  const missingCacheFields = [];
  if (model.priceCacheRead === null) missingCacheFields.push('缓存读取价');
  if (model.priceCacheWrite === null) missingCacheFields.push('缓存写入价');
  const missingNote = missingCacheFields.length
    ? `models.dev 未提供${missingCacheFields.join('和')}，计算器暂按 $0 填充。`
    : 'models.dev 提供了缓存读取和写入价格。';

  const preset = registerRuntimePreset({
    id: model.id,
    name: `${model.providerName} · ${model.name}`,
    vendor: model.providerName,
    priceNew: model.priceInput,
    priceOut: model.priceOutput,
    priceHit: model.priceCacheRead ?? 0,
    priceCreate: model.priceCacheWrite ?? 0,
    note: `来自 models.dev（${model.providerName}）。${missingNote} 实际价格以供应商账单为准。`,
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
  initStorageControls();
  await loadPricingPresets();
  const saved = loadCalculatorState();
  initPricingPresets(DEFAULT_PRESET_ID);

  const savedPresetId = migratePresetId(saved.pricingPreset);
  if (savedPresetId && findPricingPreset(savedPresetId)) {
    $('pricingPreset').value = savedPresetId;
    applyPricingPreset(savedPresetId);
  }
  TOKEN_FIELDS.forEach((id) => {
    if (saved[id] !== undefined && saved[id] !== '') $(id).value = saved[id];
  });
  if (saved.multiplier !== undefined && saved.multiplier !== '') $('multiplier').value = saved.multiplier;

  renderPricingTable();
  const savedVisibleModels = Array.isArray(saved.visibleModels)
    ? saved.visibleModels.map(migratePresetId)
    : saved.visibleModels;
  initModelSelector($('pricingPreset').value, savedVisibleModels, update);
  setupModelsDevBrowser({ onSelect: applyModelsDevModel });
  registerFormListeners();
  update();
}

init();
