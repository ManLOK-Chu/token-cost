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
import {
  debounce,
  createLoadingIndicator,
  KeyboardShortcuts,
  enhanceNumberInput,
} from './interaction.js';
import { StateManager, HistoryManager, URLStateManager } from './state-manager.js';
import { NumberFormatter, SmartNumberInput } from './number-formatter.js';
import { Toast, ConfirmDialog, HistoryPanel } from './ui-components.js';

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
  'deepseek-v4-pro': 'deepseek-v4-pro-off-peak',
  'deepseek-v4-flash': 'deepseek-v4-flash-off-peak',
};
const TOKEN_FIELDS = ['tokensNew', 'tokensOut', 'tokensHit', 'tokensCreate'];
const FORM_FIELDS = [
  'priceNew', 'priceOut', 'priceHit', 'priceCreate',
  ...TOKEN_FIELDS,
  'multiplier', 'pricingPreset',
];

// 全局交互管理器
const loadingIndicator = createLoadingIndicator();
const keyboard = new KeyboardShortcuts();
const stateManager = new StateManager(20);
const historyManager = new HistoryManager(5);
let isRestoringState = false; // 防止恢复状态时触发保存

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

async function clearStoredData() {
  const confirmed = await ConfirmDialog.show({
    title: '清理本地数据',
    message: '这将清除所有保存的配置、历史记录和主题设置。确定继续吗？',
    type: 'danger',
    confirmText: '清理',
    cancelText: '取消',
  });

  if (confirmed) {
    clearLocalStorage();
    historyManager.clear();
    URLStateManager.clearURL();
    Toast.show('本地数据已清理，页面即将刷新...', { type: 'success', duration: 2000 });
    setTimeout(() => window.location.reload(), 2000);
  }
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

/**
 * 捕获当前状态
 * @returns {Object} 当前状态对象
 */
function captureState() {
  const state = {};
  TOKEN_FIELDS.forEach((id) => {
    state[id] = NumberFormatter.parse($(id).value);
  });
  state.multiplier = parseFloat($('multiplier').value) || 1;
  state.pricingPreset = $('pricingPreset').value;
  return state;
}

/**
 * 恢复状态
 * @param {Object} state - 状态对象
 */
function restoreState(state) {
  isRestoringState = true;

  TOKEN_FIELDS.forEach((id) => {
    if (state[id] !== undefined) {
      $(id).value = state[id];
    }
  });

  if (state.multiplier !== undefined) {
    $('multiplier').value = state.multiplier;
  }

  if (state.pricingPreset) {
    const preset = findPricingPreset(state.pricingPreset);
    if (preset) {
      $('pricingPreset').value = state.pricingPreset;
      applyPricingPreset(state.pricingPreset);
      ensureModelVisible(state.pricingPreset);
      renderModelSelector(state.pricingPreset, update);
    }
  }

  update();
  isRestoringState = false;
}

/**
 * 保存当前状态到历史
 */
function saveStateToHistory() {
  if (isRestoringState) return;

  const state = captureState();
  stateManager.push(state);
  updateUndoRedoButtons();

  // 更新 URL（静默）
  URLStateManager.updateURL(state);
}

/**
 * 更新撤销/重做按钮状态
 */
function updateUndoRedoButtons() {
  $('undoBtn').disabled = !stateManager.canUndo();
  $('redoBtn').disabled = !stateManager.canRedo();
}

function update() {
  const summaryCards = document.querySelectorAll('.card');
  const chartPanel = document.querySelector('.chart-panel');

  // 显示加载状态
  summaryCards.forEach((card) => loadingIndicator.show(card));
  if (chartPanel) loadingIndicator.show(chartPanel);

  // 使用 requestAnimationFrame 优化渲染
  requestAnimationFrame(() => {
    try {
      const data = readInputs();
      renderSummary(data);
      renderChart(data, getPricingPresets(), getVisibleModels(), $('pricingPreset').value);
      saveToStorage();

      // 保存状态到历史（防抖后执行）
      if (!isRestoringState) {
        debouncedSaveState();
      }
    } finally {
      // 隐藏加载状态
      summaryCards.forEach((card) => loadingIndicator.hide(card));
      if (chartPanel) loadingIndicator.hide(chartPanel);
    }
  });
}

// 创建防抖版本的 update 函数和状态保存
const debouncedUpdate = debounce(update, 250);
const debouncedSaveState = debounce(saveStateToHistory, 800);

/**
 * 撤销
 */
function undo() {
  const prevState = stateManager.undo();
  if (prevState) {
    restoreState(prevState);
    Toast.show('已撤销', { type: 'info', duration: 2000 });
  }
}

/**
 * 重做
 */
function redo() {
  const nextState = stateManager.redo();
  if (nextState) {
    restoreState(nextState);
    Toast.show('已重做', { type: 'info', duration: 2000 });
  }
}

/**
 * 显示历史记录面板
 */
function showHistory() {
  const items = historyManager.getAll();
  const panel = new HistoryPanel({
    onLoad: (id) => {
      const item = historyManager.getById(id);
      if (item) {
        restoreState(item.state);
        Toast.show('已加载历史配置', { type: 'success', duration: 2000 });
      }
    },
    onDelete: (id) => {
      if (id === 'all') {
        historyManager.clear();
        Toast.show('已清空历史记录', { type: 'success', duration: 2000 });
      } else {
        historyManager.remove(id);
        showHistory(); // 刷新面板
      }
    },
  });
  panel.show(items);
}

/**
 * 分享链接
 */
async function shareLink() {
  const state = captureState();
  const success = await URLStateManager.copyShareLink(state);

  if (success) {
    const btn = $('shareBtn');
    btn.classList.add('share-success');
    btn.innerHTML = '<span class="toolbar-icon">✓</span><span>已复制</span>';

    Toast.show('分享链接已复制到剪贴板', { type: 'success', duration: 2000 });

    setTimeout(() => {
      btn.classList.remove('share-success');
      btn.innerHTML = '<span class="toolbar-icon">🔗</span><span>分享</span>';
    }, 2000);
  } else {
    Toast.show('复制失败，请手动复制地址栏链接', { type: 'error', duration: 3000 });
  }
}

/**
 * 保存到历史记录
 */
function saveToHistoryRecord() {
  const state = captureState();
  historyManager.add(state);
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
  FORM_FIELDS.forEach((id) => {
    const element = $(id);
    const isPresetSelect = id === 'pricingPreset';
    const eventType = isPresetSelect ? 'change' : 'input';

    element.addEventListener(eventType, async () => {
      if (isPresetSelect) {
        const newPresetId = element.value;
        const oldPresetId = element.dataset.lastValue || '';

        // 检查是否有修改，显示确认对话框
        if (oldPresetId && oldPresetId !== newPresetId) {
          const confirmed = await ConfirmDialog.show({
            title: '切换预设',
            message: '切换预设将覆盖当前的价格设置，确定继续吗？',
            type: 'warning',
            confirmText: '继续',
            cancelText: '取消',
          });

          if (!confirmed) {
            element.value = oldPresetId;
            return;
          }
        }

        applyPricingPreset(newPresetId);
        ensureModelVisible(newPresetId);
        renderModelSelector(newPresetId, update);
        update(); // 预设切换立即更新
        element.dataset.lastValue = newPresetId;
      } else {
        // 普通输入使用防抖
        debouncedUpdate();
      }
    });

    // 为数字输入框添加鼠标滚轮支持和单位解析
    if (element.type === 'number') {
      enhanceNumberInput(element, {
        onchange: () => debouncedUpdate(),
      });

      // 为 token 输入框添加单位解析支持
      if (TOKEN_FIELDS.includes(id)) {
        SmartNumberInput.applyToInput(element);
      }
    }
  });

  // 保存初始预设值
  $('pricingPreset').dataset.lastValue = $('pricingPreset').value;
}

function initKeyboardShortcuts() {
  // Ctrl/Cmd + K 打开模型浏览器
  keyboard.register('k', {
    ctrl: true,
    meta: true,
    handler: (event) => {
      const button = $('loadModelsDev');
      if (button && !button.disabled) {
        button.click();
      }
    },
  });

  // Escape 关闭模态框（已在 models-dev.js 中处理，这里作为备用）
  keyboard.register('escape', {
    handler: (event) => {
      const overlay = $('mdOverlay');
      if (overlay && overlay.classList.contains('open')) {
        const closeButton = $('mdClose');
        if (closeButton) closeButton.click();
      }
    },
  });

  // Ctrl/Cmd + Z 撤销
  keyboard.register('z', {
    ctrl: true,
    meta: true,
    handler: (event) => {
      event.preventDefault();
      undo();
    },
  });

  // Ctrl/Cmd + Shift + Z 重做
  keyboard.register('z', {
    ctrl: true,
    meta: true,
    shift: true,
    handler: (event) => {
      event.preventDefault();
      redo();
    },
  });

  // Ctrl/Cmd + H 显示历史记录
  keyboard.register('h', {
    ctrl: true,
    meta: true,
    handler: (event) => {
      event.preventDefault();
      showHistory();
    },
  });

  // Ctrl/Cmd + S 保存到历史记录
  keyboard.register('s', {
    ctrl: true,
    meta: true,
    handler: (event) => {
      event.preventDefault();
      saveToHistoryRecord();
      Toast.show('已保存到历史记录', { type: 'success', duration: 2000 });
    },
  });

  // Ctrl/Cmd + R 重置为默认值
  keyboard.register('r', {
    ctrl: true,
    meta: true,
    handler: async (event) => {
      event.preventDefault();
      const confirmed = await ConfirmDialog.show({
        title: '重置为默认值',
        message: '确定要将所有输入重置为默认值吗？',
        type: 'warning',
        confirmText: '重置',
        cancelText: '取消',
      });

      if (confirmed) {
        $('pricingPreset').value = DEFAULT_PRESET_ID;
        applyPricingPreset(DEFAULT_PRESET_ID);
        TOKEN_FIELDS.forEach((id) => {
          const defaults = {
            tokensNew: 799000,
            tokensOut: 24000,
            tokensHit: 1983000,
            tokensCreate: 0,
          };
          $(id).value = defaults[id] || 0;
        });
        $('multiplier').value = 1;
        update();
        Toast.show('已重置为默认值', { type: 'success', duration: 2000 });
      }
    },
  });

  // 添加快捷键提示到按钮
  const loadModelsBtn = $('loadModelsDev');
  if (loadModelsBtn) {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const modKey = isMac ? '⌘' : 'Ctrl';
    const hintHTML = `<span class="shortcut-hint"><span class="kbd">${modKey}</span><span class="kbd">K</span></span>`;
    loadModelsBtn.innerHTML += hintHTML;
  }
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
  initKeyboardShortcuts();

  // 绑定工具栏按钮
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('historyBtn').addEventListener('click', showHistory);
  $('shareBtn').addEventListener('click', shareLink);

  // 初始化状态管理
  const initialState = captureState();
  stateManager.push(initialState);
  updateUndoRedoButtons();

  // 检查 URL 参数
  const urlState = URLStateManager.decodeState();
  if (urlState) {
    restoreState(urlState);
    Toast.show('已从 URL 加载配置', { type: 'info', duration: 3000 });
  }

  // 页面卸载前保存到历史
  window.addEventListener('beforeunload', () => {
    saveToHistoryRecord();
  });

  update();
}

init();
