import { $, escapeHtml } from './dom.js';

const PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', xai: 'xAI',
  deepseek: 'DeepSeek', zhipuai: 'Zhipu', mistral: 'Mistral', llama: 'Llama',
  alibaba: 'Qwen', xiaomi: 'Xiaomi', moonshotai: 'Kimi', meta: 'Meta',
  cohere: 'Cohere', perplexity: 'Perplexity', groq: 'Groq', togetherai: 'Together',
};

const providerLabel = (provider) => PROVIDER_LABELS[provider] || provider;
const formatUsd = (value) => (value >= 1 ? value.toFixed(2) : value.toFixed(value < 0.01 ? 4 : 3));

let catalogPromise = null;
let catalogList = [];
let selectCallback = () => {};

function buildCatalogList(catalog) {
  const list = [];
  const providers = catalog?.providers || {};
  for (const provider of Object.keys(providers)) {
    const models = providers[provider]?.models || {};
    for (const modelId of Object.keys(models)) {
      const model = models[modelId];
      const cost = model?.cost;
      if (!cost || cost.input == null || cost.output == null) continue;
      const name = model.name || modelId;
      list.push({
        id: `md-${provider}-${modelId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        provider,
        label: providerLabel(provider),
        name,
        priceNew: cost.input,
        priceOut: cost.output,
        priceHit: cost.cache_read || 0,
        priceCreate: cost.cache_write || 0,
        note: `来自 models.dev（${providerLabel(provider)}），为基础费率，可能存在分档/上下文溢价，以官方账单为准。`,
        search: `${provider} ${name} ${modelId} ${model.family || ''}`.toLowerCase(),
      });
    }
  }
  return list.sort((a, b) => a.label.localeCompare(b.label, 'en') || a.name.localeCompare(b.name, 'en'));
}

function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch('https://models.dev/catalog.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((catalog) => {
      catalogList = buildCatalogList(catalog);
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

function renderResults(query) {
  const list = $('mdList');
  const normalized = query.trim().toLowerCase();
  const matches = normalized ? catalogList.filter((model) => model.search.includes(normalized)) : catalogList;
  const shown = matches.slice(0, 300);
  if (!matches.length) {
    list.innerHTML = `<div class="md-empty">没有匹配 “${escapeHtml(query)}” 的模型。</div>`;
    return;
  }

  let status = normalized
    ? `匹配 ${matches.length} 个`
    : `共 ${matches.length} 个带价格的模型，输入名称或厂商筛选。`;
  if (matches.length > shown.length) status += `（显示前 ${shown.length} 个，继续输入可缩小范围）`;
  $('mdStatus').textContent = status;
  list.innerHTML = shown.map((model) => (
    `<div class="md-row" data-id="${model.id}" role="option" tabindex="0">`
      + `<div class="md-main"><div class="md-name">${escapeHtml(`${model.label} · ${model.name}`)}</div>`
      + `<div class="md-meta"><span class="md-prov">${escapeHtml(model.provider)}</span>`
      + `${model.priceCreate ? '<span class="md-cache-tag">含缓存写入价</span>' : ''}</div></div>`
      + `<div class="md-price"><span>in <b>$${formatUsd(model.priceNew)}</b></span><span>out <b>$${formatUsd(model.priceOut)}</b></span></div>`
      + '</div>'
  )).join('');
}

function showReady() {
  renderResults('');
  $('mdSearch').focus();
}

function openModal() {
  $('mdOverlay').classList.add('open');
  if (catalogList.length) {
    showReady();
    return;
  }
  if (catalogPromise) return;
  const button = $('loadModelsDev');
  button.disabled = true;
  button.textContent = '加载中…';
  $('mdStatus').textContent = '正在从 models.dev 拉取最新模型与价格…';
  loadCatalog().then(showReady).catch((error) => {
    $('mdStatus').textContent = `加载失败：${error.message}（可能是网络或跨域限制，请稍后重试）。`;
  }).finally(() => {
    button.disabled = false;
    button.innerHTML = '<span class="md-dot">●</span>浏览 models.dev 模型';
  });
}

function closeModal() {
  $('mdOverlay').classList.remove('open');
  $('mdSearch').value = '';
}

function selectModel(id) {
  const item = catalogList.find((model) => model.id === id);
  if (!item) return;
  selectCallback(item);
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
    searchTimer = setTimeout(() => renderResults(event.target.value), 120);
  });
  $('mdSearch').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = $('mdList').querySelector('.md-row');
      if (first) selectModel(first.dataset.id);
    }
  });
  $('mdList').addEventListener('click', (event) => {
    const row = event.target.closest('.md-row');
    if (row) selectModel(row.dataset.id);
  });
  $('mdList').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.classList.contains('md-row')) {
      selectModel(event.target.dataset.id);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('mdOverlay').classList.contains('open')) closeModal();
  });
}
