import { $ } from './dom.js';

const PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', xai: 'xAI',
  deepseek: 'DeepSeek', zhipuai: 'Zhipu', mistral: 'Mistral', llama: 'Llama',
  alibaba: 'Qwen', xiaomi: 'Xiaomi', moonshotai: 'Kimi', meta: 'Meta',
  cohere: 'Cohere', perplexity: 'Perplexity', groq: 'Groq', togetherai: 'Together',
};
const RENDER_LIMIT = 300;
const state = {
  catalog: [], query: '', selectedProviders: new Set(), cacheFilter: 'all',
  sortKey: null, sortDirection: 'asc', selectedModelId: null, loading: false, error: null,
};
let catalogPromise = null;
let selectCallback = () => {};
let returnFocusElement = null;

function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeCatalog(catalog) {
  const providers = catalog?.providers;
  if (!providers || typeof providers !== 'object') throw new Error('models.dev 返回了无法识别的目录结构');
  const result = [];
  let originalIndex = 0;
  for (const [providerId, provider] of Object.entries(providers)) {
    const models = provider?.models;
    if (!models || typeof models !== 'object') continue;
    for (const [sourceId, model] of Object.entries(models)) {
      const cost = model?.cost || {};
      const providerName = PROVIDER_LABELS[providerId] || provider?.name || providerId;
      const name = model?.name || sourceId;
      const family = model?.family || '';
      const contextWindow = nullableNumber(model?.limit?.context ?? model?.context_window ?? model?.context);
      const priceInput = nullableNumber(cost.input);
      const priceOutput = nullableNumber(cost.output);
      const priceCacheRead = nullableNumber(cost.cache_read);
      const priceCacheWrite = nullableNumber(cost.cache_write);
      result.push({
        id: `md-${providerId}-${sourceId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sourceId, name,
        providerId, providerName, family, contextWindow, priceInput, priceOutput, priceCacheRead,
        priceCacheWrite, supportsCache: priceCacheRead !== null || priceCacheWrite !== null,
        searchText: [providerId, providerName, name, sourceId, family].join(' ').toLowerCase(), originalIndex,
      });
      originalIndex += 1;
    }
  }
  return result;
}

function queryTerms(query) { return query.trim().toLowerCase().split(/\s+/).filter(Boolean); }
export function matchesQuery(model, query) { return queryTerms(query).every((term) => model.searchText.includes(term)); }
export function filterModels(models, { query, selectedProviders, cacheFilter }) {
  return models.filter((model) => matchesQuery(model, query)
    && (selectedProviders.size === 0 || selectedProviders.has(model.providerId))
    && (cacheFilter !== 'supported' || model.supportsCache)
    && (cacheFilter !== 'unsupported' || !model.supportsCache));
}
function completeness(model) { return [model.contextWindow, model.priceInput, model.priceOutput, model.priceCacheRead, model.priceCacheWrite].filter((value) => value !== null).length; }
function relevanceScore(model, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const name = model.name.toLowerCase();
  const sourceId = model.sourceId.toLowerCase();
  if (name === normalized) return 400;
  if (name.startsWith(normalized)) return 300;
  if (name.includes(normalized) || sourceId.includes(normalized)) return 200;
  return 100;
}
function stableFallback(a, b) { return a.providerName.localeCompare(b.providerName, 'en') || a.name.localeCompare(b.name, 'en') || a.originalIndex - b.originalIndex; }
function compareNullableNumber(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}
export function sortModels(models, { query, sortKey, sortDirection }) {
  return [...models].sort((a, b) => {
    if (sortKey) return compareNullableNumber(a[sortKey], b[sortKey], sortDirection) || stableFallback(a, b);
    return relevanceScore(b, query) - relevanceScore(a, query)
      || completeness(b) - completeness(a)
      || (a.supportsCache === b.supportsCache ? 0 : a.supportsCache ? -1 : 1)
      || stableFallback(a, b);
  });
}
export function formatContextWindow(value) {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}
export function formatCatalogPrice(value) { return value === null ? '—' : `$${String(value)}`; }

function resetViewState() {
  state.query = '';
  state.selectedProviders.clear();
  state.cacheFilter = 'all';
  state.sortKey = null;
  state.sortDirection = 'asc';
  state.selectedModelId = null;
}
function renderProviderMenu() {
  const providers = [...new Map(state.catalog.map((model) => [model.providerId, model.providerName]))]
    .sort((a, b) => a[1].localeCompare(b[1], 'en'));
  $('mdProviderMenu').replaceChildren(...providers.map(([providerId, providerName]) => {
    const label = document.createElement('label');
    label.className = 'md-provider-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.value = providerId; checkbox.checked = state.selectedProviders.has(providerId);
    const text = document.createElement('span'); text.textContent = providerName;
    label.append(checkbox, text); return label;
  }));
  $('mdProviderSummary').textContent = state.selectedProviders.size ? `厂商（${state.selectedProviders.size}）` : '厂商';
}
function createCell(value, formatter) {
  const cell = document.createElement('td');
  cell.className = `md-number${value === null ? ' md-missing' : ''}`;
  cell.textContent = formatter(value); return cell;
}
function createModelRow(model) {
  const row = document.createElement('tr');
  row.dataset.modelId = model.id; row.tabIndex = 0;
  row.setAttribute('aria-selected', String(state.selectedModelId === model.id));
  row.classList.toggle('selected', state.selectedModelId === model.id);
  const modelCell = document.createElement('td');
  const name = document.createElement('span'); name.className = 'md-model-name'; name.textContent = model.name;
  const id = document.createElement('span'); id.className = 'md-model-id'; id.textContent = model.sourceId;
  modelCell.append(name, id);
  const provider = document.createElement('td'); provider.textContent = model.providerName;
  row.append(modelCell, provider, createCell(model.contextWindow, formatContextWindow),
    createCell(model.priceInput, formatCatalogPrice), createCell(model.priceOutput, formatCatalogPrice),
    createCell(model.priceCacheRead, formatCatalogPrice), createCell(model.priceCacheWrite, formatCatalogPrice));
  return row;
}
function renderSortHeaders() {
  document.querySelectorAll('.md-table th[data-sort-key]').forEach((header) => {
    const active = header.dataset.sortKey === state.sortKey;
    header.setAttribute('aria-sort', active ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
    header.querySelector('span').textContent = active ? (state.sortDirection === 'asc' ? '↑' : '↓') : '↕';
  });
}
function selectedModel() {
  return state.catalog.find((model) => model.id === state.selectedModelId) || null;
}
function canUseModel(model) {
  return model !== null && model.priceInput !== null && model.priceOutput !== null;
}
function renderSelection() {
  const model = selectedModel();
  const confirm = $('mdConfirm');
  if (!model) {
    $('mdSelectedName').textContent = '请先选择一个模型';
    $('mdSelectedMeta').textContent = '';
    confirm.disabled = true;
    return;
  }
  $('mdSelectedName').textContent = model.name;
  $('mdSelectedMeta').textContent = canUseModel(model)
    ? model.providerName
    : `${model.providerName} · 缺少输入或输出价格，不能使用`;
  confirm.disabled = !canUseModel(model);
}
function renderResults() {
  const filtered = filterModels(state.catalog, state);
  const shown = sortModels(filtered, state).slice(0, RENDER_LIMIT);
  $('mdTableBody').replaceChildren(...shown.map(createModelRow));
  $('mdEmpty').hidden = shown.length > 0;
  $('mdEmpty').textContent = shown.length ? '' : '没有匹配当前搜索和筛选条件的模型。';
  $('mdStatus').textContent = `匹配 ${filtered.length} / 总计 ${state.catalog.length} 个模型 · USD / 1M tokens · 来源 models.dev${filtered.length > shown.length ? ` · 当前显示前 ${shown.length} 个` : ''}`;
  renderSortHeaders();
  renderSelection();
}
function renderControls() {
  $('mdSearch').value = state.query;
  $('mdCacheFilter').value = state.cacheFilter;
  renderProviderMenu(); renderResults();
}
function setSort(sortKey) {
  if (state.sortKey === sortKey) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  else { state.sortKey = sortKey; state.sortDirection = 'asc'; }
  renderResults();
}
function renderError() {
  $('mdTableBody').replaceChildren();
  $('mdEmpty').hidden = false;
  $('mdEmpty').replaceChildren();
  const message = document.createElement('p');
  message.textContent = '无法加载 models.dev 目录。静态预设和成本计算器仍可继续使用。';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.id = 'mdRetry';
  retry.className = 'md-clear';
  retry.textContent = '重新加载';
  $('mdEmpty').append(message, retry);
  $('mdStatus').textContent = `加载失败：${state.error?.message || '未知错误'}`;
}
function loadCatalog() {
  if (state.catalog.length) return Promise.resolve(state.catalog);
  if (catalogPromise) return catalogPromise;
  state.loading = true;
  catalogPromise = fetch('https://models.dev/catalog.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((catalog) => { state.catalog = normalizeCatalog(catalog); return state.catalog; })
    .catch((error) => { catalogPromise = null; state.error = error; throw error; })
    .finally(() => { state.loading = false; });
  return catalogPromise;
}
function focusableElements() {
  return [...$('mdOverlay').querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.offsetParent !== null);
}
function openModal() {
  returnFocusElement = document.activeElement;
  $('mdOverlay').classList.add('open');
  document.body.classList.add('md-modal-open');
  resetViewState();
  renderSelection();
  $('mdStatus').textContent = '正在从 models.dev 拉取最新模型与价格…';
  loadCatalog().then(() => {
    state.error = null;
    renderControls();
    $('mdSearch').focus();
  }).catch(() => {
    renderError();
    $('mdRetry')?.focus();
  });
}
function closeModal() {
  $('mdOverlay').classList.remove('open');
  document.body.classList.remove('md-modal-open');
  resetViewState();
  renderSelection();
  returnFocusElement?.focus();
}
function selectRow(modelId) {
  state.selectedModelId = modelId;
  renderResults();
}
function confirmSelection() {
  const model = selectedModel();
  if (!canUseModel(model)) return;
  selectCallback(model);
  closeModal();
}
function handleDialogKeydown(event) {
  if (!$('mdOverlay').classList.contains('open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function setupModelsDevBrowser({ onSelect }) {
  selectCallback = onSelect;
  $('loadModelsDev').addEventListener('click', openModal);
  $('mdClose').addEventListener('click', closeModal);
  $('mdOverlay').addEventListener('click', (event) => { if (event.target === $('mdOverlay')) closeModal(); });
  let timer = null;
  $('mdSearch').addEventListener('input', (event) => { clearTimeout(timer); const query = event.target.value; timer = setTimeout(() => { state.query = query; state.selectedModelId = null; renderResults(); }, 120); });
  $('mdProviderMenu').addEventListener('change', (event) => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) state.selectedProviders.add(event.target.value); else state.selectedProviders.delete(event.target.value);
    state.selectedModelId = null; renderProviderMenu(); renderResults();
  });
  $('mdCacheFilter').addEventListener('change', (event) => { state.cacheFilter = event.target.value; state.selectedModelId = null; renderResults(); });
  $('mdClearFilters').addEventListener('click', () => { resetViewState(); renderControls(); });
  $('mdConfirm').addEventListener('click', confirmSelection);
  $('mdTableWrap').addEventListener('click', (event) => {
    if (event.target.id !== 'mdRetry') return;
    state.error = null;
    $('mdEmpty').hidden = true;
    $('mdStatus').textContent = '正在重新加载 models.dev 目录…';
    loadCatalog().then(() => { renderControls(); $('mdSearch').focus(); }).catch(() => { renderError(); $('mdRetry')?.focus(); });
  });
  document.querySelector('.md-table thead').addEventListener('click', (event) => { const header = event.target.closest('th[data-sort-key]'); if (header) setSort(header.dataset.sortKey); });
  $('mdTableBody').addEventListener('click', (event) => { const row = event.target.closest('tr[data-model-id]'); if (row) selectRow(row.dataset.modelId); });
  $('mdTableBody').addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-model-id]')) { event.preventDefault(); selectRow(event.target.dataset.modelId); } });
  document.addEventListener('keydown', handleDialogKeydown);
}
