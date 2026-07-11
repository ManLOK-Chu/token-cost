import { $, formatExactPrice } from './dom.js';

let pricingPresets = [];
let visibleModels = new Set();

const MODEL_STYLES = [
  { color: '#3b82f6', dasharray: 'none', width: 4 },
  { color: '#f97316', dasharray: '8 4', width: 3 },
  { color: '#22c55e', dasharray: '4 4', width: 3 },
  { color: '#ef4444', dasharray: '12 4 4 4', width: 3 },
  { color: '#a855f7', dasharray: '3 3', width: 3 },
  { color: '#06b6d4', dasharray: '6 2 2 2', width: 3 },
  { color: '#ec4899', dasharray: '10 3', width: 3 },
  { color: '#84cc16', dasharray: '2 2', width: 3 },
  { color: '#f59e0b', dasharray: '8 2 4 2', width: 3 },
];

export function getModelStyle(index) {
  return MODEL_STYLES[index % MODEL_STYLES.length];
}

export async function loadPricingPresets() {
  try {
    const response = await fetch('model-presets.json');
    if (!response.ok) throw new Error('Failed to load presets');
    pricingPresets = await response.json();
  } catch (error) {
    console.error('加载模型预设失败:', error);
    pricingPresets = [{
      id: 'custom',
      name: '自定义 / 手动输入',
      note: '不会覆盖当前输入框，适合填写你的实际账单价格。',
    }];
  }
}

export function getPricingPresets() {
  return pricingPresets;
}

export function findPricingPreset(id) {
  return pricingPresets.find((preset) => preset.id === id);
}

export function applyPricingPreset(presetId) {
  const preset = findPricingPreset(presetId);
  if (!preset || preset.id === 'custom') {
    $('presetHint').textContent = preset?.note || '自定义价格不会被预设覆盖。';
    return preset;
  }

  $('priceNew').value = preset.priceNew;
  $('priceOut').value = preset.priceOut;
  $('priceHit').value = preset.priceHit;
  $('priceCreate').value = preset.priceCreate;
  $('presetHint').textContent = preset.note;
  return preset;
}

export function initPricingPresets(defaultId) {
  const select = $('pricingPreset');
  select.replaceChildren(...pricingPresets.map((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    return option;
  }));
  select.value = defaultId;
  applyPricingPreset(defaultId);
}

export function registerRuntimePreset(preset) {
  const existing = findPricingPreset(preset.id);
  if (existing) return existing;
  pricingPresets.push(preset);
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = preset.name;
  $('pricingPreset').appendChild(option);
  return preset;
}

export function ensureModelVisible(id) {
  visibleModels.add(id);
}

export function getVisibleModels() {
  return visibleModels;
}

export function initModelSelector(defaultId, savedIds, onChange) {
  visibleModels = new Set(Array.isArray(savedIds) ? savedIds : []);
  visibleModels.add(defaultId);
  renderModelSelector(defaultId, onChange);
}

export function renderModelSelector(defaultId, onChange) {
  const container = $('modelSelector');
  container.replaceChildren();

  pricingPresets.filter((preset) => preset.id !== 'custom').forEach((preset, index) => {
    const style = getModelStyle(index);
    const isDefault = preset.id === defaultId;
    const label = document.createElement('label');
    label.className = `model-selector-label${isDefault ? ' disabled' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = visibleModels.has(preset.id);
    checkbox.disabled = isDefault;
    checkbox.dataset.modelId = preset.id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) visibleModels.add(preset.id);
      else visibleModels.delete(preset.id);
      onChange();
    });

    const indicator = document.createElement('span');
    indicator.className = 'model-color-indicator';
    indicator.style.backgroundColor = style.color;
    if (style.dasharray !== 'none') {
      indicator.style.background = `repeating-linear-gradient(90deg, ${style.color} 0px, ${style.color} 4px, transparent 4px, transparent 8px)`;
    }

    const name = document.createElement('span');
    name.className = 'model-name';
    name.textContent = preset.name;
    label.append(checkbox, indicator, name);
    container.appendChild(label);
  });
}

export function renderPricingTable() {
  const tbody = $('pricingTableBody');
  const models = pricingPresets
    .filter((preset) => preset.id !== 'custom')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  tbody.replaceChildren(...models.map((preset) => {
    const row = document.createElement('tr');
    const values = [preset.name, preset.priceNew, preset.priceOut, preset.priceHit, preset.priceCreate];
    values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = index === 0 ? value : formatExactPrice(value);
      if (index > 0 && value === 0) cell.className = 'price-zero';
      row.appendChild(cell);
    });
    return row;
  }));
}
