import { $ } from './dom.js';

const PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', xai: 'xAI',
  deepseek: 'DeepSeek', zhipuai: 'Zhipu', mistral: 'Mistral', llama: 'Llama',
  alibaba: 'Qwen', xiaomi: 'Xiaomi', moonshotai: 'Kimi', meta: 'Meta',
  cohere: 'Cohere', perplexity: 'Perplexity', groq: 'Groq', togetherai: 'Together',
};

let catalogPromise = null;
let catalogList = [];
let selectCallback = () => {};

function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeCatalog(catalog) {
  const providers = catalog?.providers;
  if (!providers || typeof providers !== 'object') {
    throw new Error('models.dev 返回了无法识别的目录结构');
  }

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
        id: `md-${providerId}-${sourceId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        sourceId,
        name,
        providerId,
        providerName,
        family,
        contextWindow,
        priceInput,
        priceOutput,
        priceCacheRead,
        priceCacheWrite,
        supportsCache: priceCacheRead !== null || priceCacheWrite !== null,
        searchText: [providerId, providerName, name, sourceId, family].join(' ').toLowerCase(),
        originalIndex,
      });
      originalIndex += 1;
    }
  }
  return result;
}

function queryTerms(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesQuery(model, query) {
  return queryTerms(query).every((term) => model.searchText.includes(term));
}

export function filterModels(models, { query, selectedProviders, cacheFilter }) {
  return models.filter((model) => {
    if (!matchesQuery(model, query)) return false;
    if (selectedProviders.size > 0 && !selectedProviders.has(model.providerId)) return false;
    if (cacheFilter === 'supported' && !model.supportsCache) return false;
    if (cacheFilter === 'unsupported' && model.supportsCache) return false;
    return true;
  });
}

function completeness(model) {
  return [model.contextWindow, model.priceInput, model.priceOutput, model.priceCacheRead, model.priceCacheWrite]
    .filter((value) => value !== null).length;
}

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

function stableFallback(a, b) {
  return a.providerName.localeCompare(b.providerName, 'en')
    || a.name.localeCompare(b.name, 'en')
    || a.originalIndex - b.originalIndex;
}

function compareNullableNumber(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

export function sortModels(models, { query, sortKey, sortDirection }) {
  return [...models].sort((a, b) => {
    if (sortKey) {
      const numeric = compareNullableNumber(a[sortKey], b[sortKey], sortDirection);
      return numeric || stableFallback(a, b);
    }
    const scoreDifference = relevanceScore(b, query) - relevanceScore(a, query);
    if (scoreDifference) return scoreDifference;
    const completenessDifference = completeness(b) - completeness(a);
    if (completenessDifference) return completenessDifference;
    if (a.supportsCache !== b.supportsCache) return a.supportsCache ? -1 : 1;
    return stableFallback(a, b);
  });
}

export function formatContextWindow(value) {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}

export function formatCatalogPrice(value) {
  return value === null ? '—' : `$${String(value)}`;
}

function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch('https://models.dev/catalog.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((catalog) => {
      catalogList = normalizeCatalog(catalog);
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

function legacyModel(model) {
  return {
    id: model.id,
    provider: model.providerId,
    label: model.providerName,
    name: model.name,
    priceNew: model.priceInput,
    priceOut: model.priceOutput,
    priceHit: model.priceCacheRead ?? 0,
    priceCreate: model.priceCacheWrite ?? 0,
    note: `来自 models.dev（${model.providerName}），为基础费率，可能存在分档/上下文溢价，以官方账单为准。`,
  };
}

function renderResults(query) {
  const list = $('mdList');
  const matches = sortModels(filterModels(catalogList, {
    query,
    selectedProviders: new Set(),
    cacheFilter: 'all',
  }), { query, sortKey: null, sortDirection: 'asc' });
  const shown = matches.filter((model) => model.priceInput !== null && model.priceOutput !== null).slice(0, 300);
  if (!shown.length) {
    list.innerHTML = '<div class="md-empty">没有匹配的模型。</div>';
    return;
  }
  $('mdStatus').textContent = `共 ${matches.length} 个模型，当前显示前 ${shown.length} 个带输入与输出价格的模型。`;
  list.replaceChildren(...shown.map((model) => {
    const row = document.createElement('div');
    row.className = 'md-row';
    row.dataset.id = model.id;
    row.tabIndex = 0;
    row.setAttribute('role', 'option');
    row.textContent = `${model.providerName} · ${model.name} · in ${formatCatalogPrice(model.priceInput)} · out ${formatCatalogPrice(model.priceOutput)}`;
    return row;
  }));
}

function showReady() {
  renderResults('');
  $('mdSearch').focus();
}

function openModal() {
  $('mdOverlay').classList.add('open');
  if (catalogList.length) return showReady();
  if (catalogPromise) return;
  $('mdStatus').textContent = '正在从 models.dev 拉取最新模型与价格…';
  loadCatalog().then(showReady).catch((error) => {
    $('mdStatus').textContent = `加载失败：${error.message}`;
  });
}

function closeModal() {
  $('mdOverlay').classList.remove('open');
  $('mdSearch').value = '';
}

function selectModel(id) {
  const model = catalogList.find((item) => item.id === id);
  if (!model || model.priceInput === null || model.priceOutput === null) return;
  selectCallback(legacyModel(model));
  closeModal();
}

export function setupModelsDevBrowser({ onSelect }) {
  selectCallback = onSelect;
  $('loadModelsDev').addEventListener('click', openModal);
  $('mdClose').addEventListener('click', closeModal);
  $('mdOverlay').addEventListener('click', (event) => {
    if (event.target === $('mdOverlay')) closeModal();
  });
  let searchTimer = null;
  $('mdSearch').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(() => renderResults(query), 120);
  });
  $('mdList').addEventListener('click', (event) => {
    const row = event.target.closest('.md-row');
    if (row) selectModel(row.dataset.id);
  });
  $('mdList').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.classList.contains('md-row')) selectModel(event.target.dataset.id);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('mdOverlay').classList.contains('open')) closeModal();
  });
}
