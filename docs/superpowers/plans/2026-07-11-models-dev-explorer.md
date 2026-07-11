# models.dev Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单文件 Token 成本计算器拆分为职责清晰的原生 ES modules，并把 models.dev 弹窗升级为支持智能搜索、厂商与缓存筛选、七列排序比较和两步确认的桌面模型探索器。

**Architecture:** 先记录拆分前的真实浏览器基线，再机械抽离 HTML、CSS 和现有 JavaScript，确保行为不变；随后把纯计算、存储、预设、图表和 models.dev 逻辑逐步拆入独立模块。`js/app.js` 是唯一协调者，models.dev 通过回调提交选择，其他模块之间不形成循环依赖。

**Tech Stack:** 原生 HTML5、CSS3、JavaScript ES modules、静态 JSON、浏览器 `fetch`、`localStorage`、SVG、Chrome DevTools MCP、`uv run python -m http.server`

## Global Constraints

- 保持当前 Git 分支 `improve-models-dev-modal`，不得创建、切换、进入或删除 Git worktree。
- 保持零构建、无第三方运行时依赖，不新增 `package.json`、React、Vue 或数据表库。
- 不重写现有成本公式或 SVG 图表算法；先机械拆分，再增强 models.dev。
- 探索弹窗只支持桌面端，不增加移动端 media query、抽屉或卡片降级。
- 主计算器现有响应式行为必须保持不变。
- 动态 models.dev 预设仅在当前页面生命周期有效，不跨刷新持久化。
- 缺失数值使用 `null`；合法 `0` 必须保留、显示并参与计算和排序。
- 真实页面必须通过 HTTP Server 运行，不使用 `file://`。
- Python 命令必须使用 `uv`：`uv run python -m http.server <port>`。
- 每个任务完成后先验证，再提交；测试失败时不得提交该任务。

---

## File Map

- Modify: `index.html` — 仅保留语义化结构、`styles.css` 引用和 `js/app.js` module 入口。
- Create: `styles.css` — 现有样式机械迁移，以及后续探索表格桌面样式。
- Create: `js/dom.js` — DOM 查询、数值解析、转义和通用显示格式。
- Create: `js/pricing.js` — 无 DOM 的成本计算与序列函数。
- Create: `js/storage.js` — 主题和计算器状态的 `localStorage` 封装。
- Create: `js/presets.js` — 静态/动态预设、预设下拉框、图表模型选择器和参考表。
- Create: `js/chart.js` — 摘要、SVG 图表和 tooltip 渲染。
- Create: `js/models-dev.js` — 目录标准化、搜索、筛选、排序、弹窗状态和选择确认。
- Create: `js/app.js` — 初始化、事件注册和模块协调。
- Reference only: `model-presets.json` — 现有静态预设数据，本计划不修改其结构。
- Reference only: `docs/superpowers/specs/2026-07-11-models-dev-explorer-design.md` — 已批准设计。

---

### Task 1: Capture the Pre-Split Browser Baseline

**Files:**
- Modify: none
- Test: current `index.html` in Chrome DevTools MCP

**Interfaces:**
- Consumes: current monolithic application at `index.html`
- Produces: baseline values and screenshots used by Tasks 3, 5, and 9

- [ ] **Step 1: Start the current application from the repository root**

Run in the background:

```bash
uv run python -m http.server 4173
```

Expected: server listens on `http://127.0.0.1:4173/` and remains running for browser inspection.

- [ ] **Step 2: Open the application with Chrome DevTools MCP**

Use `mcp__chrome-devtools__new_page` with:

```json
{"url":"http://127.0.0.1:4173/","timeout":10000}
```

Then resize with `mcp__chrome-devtools__resize_page`:

```json
{"width":1440,"height":900}
```

Expected: title is `API Token 计费模拟器`; the pricing preset select, four summary cards, SVG chart, reference table, and models.dev button are visible.

- [ ] **Step 3: Record the default calculation baseline**

Use `mcp__chrome-devtools__evaluate_script`:

```js
() => ({
  preset: document.querySelector('#pricingPreset').value,
  prices: ['priceNew', 'priceOut', 'priceHit', 'priceCreate']
    .map((id) => document.getElementById(id).value),
  tokens: ['tokensNew', 'tokensOut', 'tokensHit', 'tokensCreate', 'multiplier']
    .map((id) => document.getElementById(id).value),
  summary: {
    current: document.querySelector('#currentCost').textContent,
    zero: document.querySelector('#zeroCost').textContent,
    full: document.querySelector('#fullCost').textContent,
    delta: document.querySelector('#deltaCost').textContent,
    rate: document.querySelector('#currentRateText').textContent,
    status: document.querySelector('#chartStatus').textContent,
  },
  svgNodes: document.querySelector('#chart').childElementCount,
})
```

Expected baseline for the checked-in defaults: preset `gpt55`, non-empty summary text, and `svgNodes > 0`. Copy the exact returned object into the implementation session notes; do not create a repository file solely for ephemeral evidence.

- [ ] **Step 4: Record a deterministic custom-input baseline**

Use `mcp__chrome-devtools__evaluate_script`:

```js
() => {
  const values = {
    priceNew: '2', priceOut: '8', priceHit: '0.2', priceCreate: '2.5',
    tokensNew: '1000000', tokensOut: '100000', tokensHit: '2000000',
    tokensCreate: '1000000', multiplier: '1.5',
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return {
    current: document.querySelector('#currentCost').textContent,
    zero: document.querySelector('#zeroCost').textContent,
    full: document.querySelector('#fullCost').textContent,
    delta: document.querySelector('#deltaCost').textContent,
    rate: document.querySelector('#currentRateText').textContent,
  };
}
```

Expected mathematical values:

```text
current hit rate: 50.0%
current total: $7.48
0% total: $14.55
100% total: $3.70
delta for -10 percentage points: +$0.76
```

The UI currency formatter may include the same values with standard currency punctuation; any mismatch is a pre-existing defect that must be recorded before proceeding.

- [ ] **Step 5: Capture screenshots and browser health**

Use `mcp__chrome-devtools__take_screenshot` twice:

```json
{"filePath":"/tmp/token-cost-baseline-light-1440.png","format":"png","fullPage":true}
```

Toggle `#themeToggle`, then:

```json
{"filePath":"/tmp/token-cost-baseline-dark-1440.png","format":"png","fullPage":true}
```

Use `mcp__chrome-devtools__list_console_messages` with no severity filter and `mcp__chrome-devtools__list_network_requests` with resource types `Document`, `Script`, `Stylesheet`, `Fetch`, and `XHR`.

Expected: no uncaught JavaScript errors; `index.html` and `model-presets.json` return successfully. Existing warnings may be recorded but must not increase after the split.

- [ ] **Step 6: Commit policy for the baseline task**

No repository files change, so do not create an empty commit. Confirm with:

```bash
git status --short
```

Expected: clean working tree.

---

### Task 2: Extract the Stylesheet and Semantic HTML Shell

**Files:**
- Create: `styles.css`
- Modify: `index.html:1-1130`
- Test: `index.html`, `styles.css` through Chrome DevTools MCP

**Interfaces:**
- Consumes: current inline `<style>` and page markup
- Produces: unchanged DOM IDs/classes for the existing JavaScript, plus external `styles.css`

- [ ] **Step 1: Create `styles.css` by mechanically moving the current inline CSS**

Copy the complete contents currently between `index.html` `<style>` and `</style>` into `styles.css` without renaming selectors or changing declarations. The first lines must remain:

```css
:root {
  color-scheme: light;
  --bg: #f6f8fb;
  --panel: #ffffff;
  --text: #101828;
  --muted: #667085;
  --line: #e4e7ec;
  --soft-line: #f0f2f5;
  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --green: #12b76a;
  --orange: #f79009;
  --red: #f04438;
  --shadow: 0 18px 45px rgba(16, 24, 40, 0.08);
  --radius: 22px;
  --card-current-border: #3b82f6;
  --card-zero-border: #f79009;
  --card-full-border: #12b76a;
  --card-delta-border: #98a2b3;
}
```

Do not fix visual or syntax issues during this mechanical move except syntax that prevents the external stylesheet from parsing. If the existing nested dark-mode `select` block is invalid, normalize only that block to:

```css
:root.dark-mode input,
:root.dark-mode select {
  border-color: #374151;
}
```

- [ ] **Step 2: Replace the inline style with the external stylesheet link**

The complete `<head>` must become:

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Token 计费模拟器</title>
  <link rel="stylesheet" href="styles.css">
</head>
```

Keep all body markup and the existing inline `<script>` unchanged in this task.

- [ ] **Step 3: Remove the inline style attribute from the reference-table heading**

Change:

```html
<h2 class="panel-title" style="margin-bottom: 16px; padding-left: 4px;">预设模型定价参考</h2>
```

to:

```html
<h2 class="panel-title pricing-table-title">预设模型定价参考</h2>
```

Add to `styles.css` next to `.pricing-table-section`:

```css
.pricing-table-title {
  margin-bottom: 16px;
  padding-left: 4px;
}
```

This is required so `index.html` contains no visual inline styles before module extraction.

- [ ] **Step 4: Verify the external stylesheet is loaded**

Reload the Chrome page and use `mcp__chrome-devtools__list_network_requests`.

Expected: `styles.css` returns HTTP 200 and has resource type `Stylesheet`.

Use `mcp__chrome-devtools__evaluate_script`:

```js
() => ({
  styleTags: document.querySelectorAll('style').length,
  styleLinks: [...document.styleSheets].map((sheet) => sheet.href),
  pageWidth: getComputedStyle(document.querySelector('.page')).width,
  panelRadius: getComputedStyle(document.querySelector('.panel')).borderRadius,
})
```

Expected: `styleTags === 0`, one stylesheet URL ends with `/styles.css`, and the computed width/radius are non-empty.

- [ ] **Step 5: Compare the visual baseline**

Capture `/tmp/token-cost-split-css-light-1440.png` and compare it with `/tmp/token-cost-baseline-light-1440.png`.

Expected: no intentional layout or color change. Verify the Console contains no CSS resource error.

- [ ] **Step 6: Commit the stylesheet extraction**

```bash
git add index.html styles.css
git diff --check
git commit -m "refactor: extract page styles"
```

Expected: commit succeeds and only `index.html` plus `styles.css` are included.

---

### Task 3: Extract Pure DOM, Pricing, and Storage Modules

**Files:**
- Create: `js/dom.js`
- Create: `js/pricing.js`
- Create: `js/storage.js`
- Modify: `index.html:1130-1940`
- Test: module imports through Chrome DevTools MCP

**Interfaces:**
- Produces from `js/dom.js`:
  - `$(id: string): HTMLElement | null`
  - `clamp(value: number, min: number, max: number): number`
  - `readNumber(id: string): number`
  - `escapeHtml(value: unknown): string`
  - `formatExactPrice(value: number | null): string`
- Produces from `js/pricing.js`:
  - `readInputs(): PricingData`
  - `calculateCostAtRate(rate: number, data: PricingData): CostPoint`
  - `buildSeries(data: PricingData): CostPoint[]`
  - `formatMoney(value: number): string`
  - `formatToken(value: number): string`
  - `formatPercent(rate: number): string`
- Produces from `js/storage.js`:
  - `loadCalculatorState(): Record<string, unknown>`
  - `saveCalculatorState(values: Record<string, unknown>): void`
  - `loadTheme(): string | null`
  - `saveTheme(theme: string): void`
- Consumed later by: `presets.js`, `chart.js`, `models-dev.js`, `app.js`

- [ ] **Step 1: Write `js/dom.js` with complete shared helpers**

```js
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
```

`readNumber()` intentionally preserves the existing form behavior where non-positive or invalid inputs become `0`; models.dev nullable values do not use this helper.

- [ ] **Step 2: Write `js/pricing.js` as a DOM-light calculation module**

```js
import { $, readNumber } from './dom.js';

export const MILLION = 1_000_000;

export function readInputs() {
  const data = {
    priceNew: readNumber('priceNew'),
    priceOut: readNumber('priceOut'),
    priceHit: readNumber('priceHit'),
    priceCreate: readNumber('priceCreate'),
    tokensNew: readNumber('tokensNew'),
    tokensOut: readNumber('tokensOut'),
    tokensHit: readNumber('tokensHit'),
    tokensCreate: readNumber('tokensCreate'),
    multiplier: readNumber('multiplier') || 1,
  };

  data.totalInputTokens = data.tokensNew + data.tokensHit + data.tokensCreate;
  data.nonHitTokens = data.tokensNew + data.tokensCreate;
  data.nonHitNewShare = data.nonHitTokens > 0 ? data.tokensNew / data.nonHitTokens : 1;
  data.currentRate = data.totalInputTokens > 0 ? data.tokensHit / data.totalInputTokens : 0;
  return data;
}

export function calculateCostAtRate(rate, data) {
  const hitTokens = data.totalInputTokens * rate;
  const nonHitTokens = data.totalInputTokens - hitTokens;
  const newTokens = nonHitTokens * data.nonHitNewShare;
  const createTokens = nonHitTokens - newTokens;
  const newCost = data.priceNew * newTokens;
  const outCost = data.priceOut * data.tokensOut;
  const hitCost = data.priceHit * hitTokens;
  const createCost = data.priceCreate * createTokens;

  return {
    rate,
    newTokens,
    hitTokens,
    createTokens,
    newCost: newCost / MILLION * data.multiplier,
    outCost: outCost / MILLION * data.multiplier,
    hitCost: hitCost / MILLION * data.multiplier,
    createCost: createCost / MILLION * data.multiplier,
    total: (newCost + outCost + hitCost + createCost) / MILLION * data.multiplier,
  };
}

export function buildSeries(data) {
  const rates = new Set([0, 1, Number(data.currentRate.toFixed(6))]);
  for (let percent = 0; percent <= 100; percent += 1) {
    rates.add(Number((percent / 100).toFixed(6)));
  }
  return [...rates]
    .sort((a, b) => a - b)
    .map((rate) => calculateCostAtRate(rate, data));
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatToken(value) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(rate) {
  return `${(rate * 100).toFixed(rate === 0 || rate === 1 ? 0 : 1)}%`;
}
```

- [ ] **Step 3: Write `js/storage.js` with separate theme and calculator keys**

```js
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
```

- [ ] **Step 4: Import the modules at the top of the existing inline script and remove duplicate definitions**

Change the opening script tag to:

```html
<script type="module">
  import { $, clamp, escapeHtml, formatExactPrice } from './js/dom.js';
  import {
    buildSeries,
    calculateCostAtRate,
    formatMoney,
    formatPercent,
    formatToken,
    readInputs,
  } from './js/pricing.js';
  import {
    loadCalculatorState,
    loadTheme,
    saveCalculatorState,
    saveTheme,
  } from './js/storage.js';
```

Remove the old definitions of `$`, `clamp`, `readNumber`, `MILLION`, `readInputs`, `calculateCostAtRate`, `buildSeries`, `formatMoney`, `formatToken`, `formatPercent`, `STORAGE_KEY`, `THEME_KEY`, and `escapeHtml` from the inline script.

Update theme reads/writes to `loadTheme()` and `saveTheme(theme)`. Update calculator state reads/writes so `loadFromStorage()` delegates to `loadCalculatorState()` and `saveToStorage()` builds one complete object before calling `saveCalculatorState(data)`.

When preserving visible models, merge rather than overwrite:

```js
function saveVisibleModels() {
  const saved = loadCalculatorState();
  saved.visibleModels = Array.from(visibleModels);
  saveCalculatorState(saved);
}
```

When saving form state, preserve the same property:

```js
function saveToStorage() {
  const saved = loadCalculatorState();
  tokenFields.forEach((id) => { saved[id] = $(id).value; });
  saved.multiplier = $('multiplier').value;
  saved.pricingPreset = $('pricingPreset').value;
  saved.visibleModels = Array.from(visibleModels);
  saveCalculatorState(saved);
}
```

- [ ] **Step 5: Verify pure calculation imports before UI regression**

Use Chrome DevTools MCP `evaluate_script`:

```js
async () => {
  const pricing = await import('/js/pricing.js');
  const data = {
    priceNew: 2,
    priceOut: 8,
    priceHit: 0.2,
    priceCreate: 2.5,
    tokensNew: 1000000,
    tokensOut: 100000,
    tokensHit: 2000000,
    tokensCreate: 1000000,
    multiplier: 1.5,
    totalInputTokens: 4000000,
    nonHitTokens: 2000000,
    nonHitNewShare: 0.5,
    currentRate: 0.5,
  };
  return {
    current: pricing.calculateCostAtRate(0.5, data).total,
    zero: pricing.calculateCostAtRate(0, data).total,
    full: pricing.calculateCostAtRate(1, data).total,
    points: pricing.buildSeries(data).length,
  };
}
```

Expected:

```json
{"current":7.475,"zero":14.55,"full":3.7,"points":101}
```

- [ ] **Step 6: Run UI regression against Task 1**

Reload the page, restore the deterministic values from Task 1, and read the same summary object.

Expected: exact UI values match the recorded baseline; Console has no module, import, or duplicate-identifier errors; Network shows `dom.js`, `pricing.js`, and `storage.js` with HTTP 200.

- [ ] **Step 7: Commit the foundational modules**

```bash
git add index.html js/dom.js js/pricing.js js/storage.js
git diff --check
git commit -m "refactor: extract pricing and storage modules"
```

---

### Task 4: Extract Preset and Chart Responsibilities

**Files:**
- Create: `js/presets.js`
- Create: `js/chart.js`
- Modify: `index.html:1130-1940`
- Test: browser regression and zero-price chart check

**Interfaces:**
- Produces from `js/presets.js`:
  - `loadPricingPresets(): Promise<void>`
  - `getPricingPresets(): Preset[]`
  - `findPricingPreset(id: string): Preset | undefined`
  - `initPricingPresets(defaultId: string): void`
  - `applyPricingPreset(id: string): Preset | undefined`
  - `registerRuntimePreset(preset: Preset): Preset`
  - `initModelSelector(defaultId: string, savedIds: string[], onChange: Function): void`
  - `ensureModelVisible(id: string): void`
  - `getVisibleModels(): Set<string>`
  - `renderModelSelector(defaultId: string, onChange: Function): void`
  - `renderPricingTable(): void`
- Produces from `js/chart.js`:
  - `renderSummary(data: PricingData): void`
  - `renderChart(data: PricingData, presets: Preset[], visibleIds: Set<string>, defaultId: string): void`
- Consumed later by: `app.js`, `models-dev.js`

- [ ] **Step 1: Move preset state and rendering into `js/presets.js`**

The module must own these private values:

```js
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
```

Move the existing preset loading, applying, model-selector rendering, and pricing-reference-table rendering into this module. Use `textContent` or `formatExactPrice()` when inserting names and prices; do not concatenate unescaped remote names into HTML.

The dynamic preset registration contract is:

```js
export function registerRuntimePreset(preset) {
  const existing = pricingPresets.find((item) => item.id === preset.id);
  if (existing) return existing;
  pricingPresets.push(preset);
  return preset;
}
```

`renderPricingTable()` must display `null` as `—`, `0` as `$0`, and other values through `formatExactPrice()`.

- [ ] **Step 2: Move summary and SVG code into `js/chart.js`**

Import:

```js
import { $, clamp } from './dom.js';
import {
  buildSeries,
  calculateCostAtRate,
  formatMoney,
  formatPercent,
  formatToken,
} from './pricing.js';
import { getModelStyle } from './presets.js';
```

Preserve existing SVG implementation, but change the public signature to:

```js
export function renderChart(data, presets, visibleIds, defaultId) {
  const modelsWithPrices = presets.filter((preset) => preset.id !== 'custom');
  // Existing drawing implementation follows.
}
```

Replace all price fallback expressions:

```js
priceNew: preset.priceNew || data.priceNew,
priceOut: preset.priceOut || data.priceOut,
priceHit: preset.priceHit || data.priceHit,
priceCreate: preset.priceCreate || data.priceCreate,
```

with:

```js
priceNew: preset.priceNew ?? data.priceNew,
priceOut: preset.priceOut ?? data.priceOut,
priceHit: preset.priceHit ?? data.priceHit,
priceCreate: preset.priceCreate ?? data.priceCreate,
```

Remove the unused `current` calculation in the current-point block; retain `currentPoint`, `currentX`, and `currentY` from the model series.

- [ ] **Step 3: Rewire the inline coordinator to the module APIs**

Add imports:

```js
import { renderChart, renderSummary } from './js/chart.js';
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
} from './js/presets.js';
```

Change `update()` to:

```js
function update() {
  const data = readInputs();
  renderSummary(data);
  renderChart(
    data,
    getPricingPresets(),
    getVisibleModels(),
    $('pricingPreset').value,
  );
  saveToStorage();
}
```

Change preset selection handling to call `ensureModelVisible(newPreset)`, then `renderModelSelector(newPreset, update)`. Initialization must pass saved visible IDs and `update` into `initModelSelector()`.

Delete the moved global state and functions from `index.html`.

- [ ] **Step 4: Verify the zero-price fallback fix directly**

Temporarily add a runtime preset through module import in Chrome DevTools MCP:

```js
async () => {
  const presets = await import('/js/presets.js');
  presets.registerRuntimePreset({
    id: 'zero-cache-test',
    name: 'Zero Cache Test',
    priceNew: 1,
    priceOut: 1,
    priceHit: 0,
    priceCreate: 0,
    note: 'browser verification only',
  });
  presets.ensureModelVisible('zero-cache-test');
  return presets.findPricingPreset('zero-cache-test');
}
```

Then use module imports to calculate the `100%`-hit cost for that preset and the current token data. Expected: cache hit cost is computed with `0`, not the current form's non-zero cache price.

Reload afterward so the test-only runtime preset is removed.

- [ ] **Step 5: Run full regression against Task 1**

Expected:

- Default and deterministic summary values match.
- Model selector still toggles comparison curves.
- Price-reference table still sorts by model name.
- Theme and calculator state still persist after refresh.
- SVG contains no attribute with `NaN` or `Infinity`:

```js
() => [...document.querySelectorAll('#chart *')]
  .flatMap((element) => [...element.attributes].map((attribute) => attribute.value))
  .filter((value) => /NaN|Infinity/.test(value))
```

Expected return: `[]`.

- [ ] **Step 6: Commit preset and chart extraction**

```bash
git add index.html js/presets.js js/chart.js
git diff --check
git commit -m "refactor: extract preset and chart modules"
```

---

### Task 5: Extract the Existing models.dev Browser and Finalize `app.js`

**Files:**
- Create: `js/models-dev.js`
- Create: `js/app.js`
- Modify: `index.html:1110-1940`
- Test: complete mechanical-split browser regression

**Interfaces:**
- Produces from initial `js/models-dev.js`:
  - `setupModelsDevBrowser({ onSelect: Function }): void`
- Produces from `js/app.js`:
  - no public exports; module executes `init()` once
- Consumes: all APIs established in Tasks 3 and 4

- [ ] **Step 1: Move the current models.dev implementation into `js/models-dev.js` without feature redesign**

Import `$`, `escapeHtml`, and `formatExactPrice` from `dom.js`. Move the existing provider labels, fetch cache, catalog parsing, open/close, rendering, selection, and event setup.

The only structural change in this mechanical stage is replacing direct preset mutations with the supplied callback:

```js
let selectCallback = () => {};

function selectModelsDevModel(id) {
  const item = catalogList.find((model) => model.id === id);
  if (!item) return;
  selectCallback(item);
  closeModelsDevModal();
}

export function setupModelsDevBrowser({ onSelect }) {
  selectCallback = onSelect;
  // Register the existing listeners exactly once.
}
```

Retain current immediate row selection in this task. The two-step selection arrives in Task 8.

- [ ] **Step 2: Create `js/app.js` as the only coordinator**

The module must import theme/storage/pricing/preset/chart/models-dev APIs and define these constants:

```js
const DEFAULT_PRESET_ID = 'gpt55';
const TOKEN_FIELDS = ['tokensNew', 'tokensOut', 'tokensHit', 'tokensCreate'];
const FORM_FIELDS = [
  'priceNew', 'priceOut', 'priceHit', 'priceCreate',
  ...TOKEN_FIELDS,
  'multiplier', 'pricingPreset',
];
```

Use this complete models.dev conversion at the app boundary during the mechanical stage:

```js
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
```

Move theme initialization, form listeners, storage restoration, and async initialization from the inline script. Ensure listeners are registered only once.

- [ ] **Step 3: Replace the inline script with the external module entry**

The end of `index.html` must be:

```html
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

Verify no inline business script remains:

```bash
grep -n '<script' index.html
```

Expected output contains exactly one line with `src="js/app.js"`.

- [ ] **Step 4: Verify the completed mechanical split**

Reload the page and verify:

- `styles.css` and all seven module files return HTTP 200.
- No Console error or unhandled rejection appears.
- Task 1 default and deterministic baselines match.
- Existing models.dev search and immediate row selection still work.
- Theme persistence, form persistence, model selector, reference table, chart hover, and modal close behavior remain functional.

Use `mcp__chrome-devtools__take_screenshot` at 1440×900 in light and dark themes and compare with Task 1. Only browser-default timing differences are acceptable; no intentional design changes occur in this task.

- [ ] **Step 5: Check file boundaries**

Run:

```bash
wc -l index.html styles.css js/*.js
grep -nE '<style|style="|<script(?![^>]*src=)' index.html
```

Expected:

- `index.html` contains markup only.
- No `<style>` or inline `style="..."` remains.
- The only script is the external module entry. If the system `grep` does not support the negative lookahead, verify the single script line manually with `grep -n '<script' index.html`.

- [ ] **Step 6: Commit the completed mechanical split**

```bash
git add index.html js/app.js js/models-dev.js
git diff --check
git commit -m "refactor: split application modules"
```

---

### Task 6: Add models.dev Normalization, Search, Filter, and Sort Pure Logic

**Files:**
- Modify: `js/models-dev.js`
- Test: exported pure functions through Chrome DevTools MCP

**Interfaces:**
- Produces:
  - `normalizeCatalog(catalog: object): Model[]`
  - `matchesQuery(model: Model, query: string): boolean`
  - `filterModels(models: Model[], state: FilterState): Model[]`
  - `sortModels(models: Model[], state: SortState): Model[]`
  - `formatContextWindow(value: number | null): string`
  - `formatCatalogPrice(value: number | null): string`
- Model shape:
  - `{ id, sourceId, name, providerId, providerName, family, contextWindow, priceInput, priceOutput, priceCacheRead, priceCacheWrite, supportsCache, searchText, originalIndex }`

- [ ] **Step 1: Export a nullable-number normalizer and complete catalog standardizer**

Add:

```js
const PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', xai: 'xAI',
  deepseek: 'DeepSeek', zhipuai: 'Zhipu', mistral: 'Mistral', llama: 'Llama',
  alibaba: 'Qwen', xiaomi: 'Xiaomi', moonshotai: 'Kimi', meta: 'Meta',
  cohere: 'Cohere', perplexity: 'Perplexity', groq: 'Groq', togetherai: 'Together',
};

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
      const contextWindow = nullableNumber(
        model?.limit?.context ?? model?.context_window ?? model?.context,
      );
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
        searchText: [providerId, providerName, name, sourceId, family]
          .join(' ')
          .toLowerCase(),
        originalIndex,
      });
      originalIndex += 1;
    }
  }

  return result;
}
```

Do not discard models with missing input or output prices.

- [ ] **Step 2: Export AND-query matching and combined filtering**

```js
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
```

Allowed `cacheFilter` values are exactly `all`, `supported`, and `unsupported`.

- [ ] **Step 3: Export smart relevance and nullable numeric sorting**

```js
function completeness(model) {
  return [
    model.contextWindow,
    model.priceInput,
    model.priceOutput,
    model.priceCacheRead,
    model.priceCacheWrite,
  ].filter((value) => value !== null).length;
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
```

The UI sort keys map exactly to: `contextWindow`, `priceInput`, `priceOutput`, `priceCacheRead`, `priceCacheWrite`.

- [ ] **Step 4: Export exact display formatters**

```js
export function formatContextWindow(value) {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}

export function formatCatalogPrice(value) {
  return value === null ? '—' : `$${String(value)}`;
}
```

- [ ] **Step 5: Verify normalization edge cases through module import**

Use `mcp__chrome-devtools__evaluate_script`:

```js
async () => {
  const module = await import('/js/models-dev.js');
  const models = module.normalizeCatalog({
    providers: {
      demo: {
        name: 'Demo',
        models: {
          zero: {
            name: 'Zero Cache',
            family: 'test',
            limit: { context: 128000 },
            cost: { input: 0, output: 2, cache_read: 0 },
          },
          missing: {
            name: 'Missing Prices',
            cost: { output: 3 },
          },
        },
      },
    },
  });
  return models;
}
```

Expected:

- `zero.priceInput === 0`
- `zero.priceCacheRead === 0`
- `zero.priceCacheWrite === null`
- `zero.supportsCache === true`
- `missing.priceInput === null`
- both models are retained.

- [ ] **Step 6: Verify AND search, cache filtering, and null-last sorting**

Use a second script with three synthetic models. Assert in the returned object:

```js
return {
  andSearch: module.matchesQuery(models[0], 'demo zero'),
  failedAndSearch: module.matchesQuery(models[0], 'demo absent'),
  cacheIds: module.filterModels(models, {
    query: '',
    selectedProviders: new Set(),
    cacheFilter: 'supported',
  }).map((model) => model.id),
  ascending: module.sortModels(models, {
    query: '', sortKey: 'priceInput', sortDirection: 'asc',
  }).map((model) => model.priceInput),
  descending: module.sortModels(models, {
    query: '', sortKey: 'priceInput', sortDirection: 'desc',
  }).map((model) => model.priceInput),
};
```

Expected: AND search is `true`, failed AND search is `false`, supported-cache results include zero-priced cache data, and both numeric arrays end with `null`.

- [ ] **Step 7: Commit the pure catalog logic**

```bash
git add js/models-dev.js
git diff --check
git commit -m "feat: add models.dev catalog query logic"
```

---

### Task 7: Build the Desktop Price Comparison Table and Filters

**Files:**
- Modify: `index.html:1112-1128`
- Modify: `styles.css` models.dev section
- Modify: `js/models-dev.js`
- Test: Chrome DevTools MCP DOM, interaction, and screenshot checks

**Interfaces:**
- Consumes: pure catalog APIs from Task 6
- Produces: rendered search/filter/status/table UI with state `{ catalog, query, selectedProviders, cacheFilter, sortKey, sortDirection, selectedModelId, loading, error }`

- [ ] **Step 1: Replace the old modal body with semantic desktop table markup**

Use this structure:

```html
<div class="md-overlay" id="mdOverlay" role="dialog" aria-modal="true" aria-labelledby="mdTitle" aria-describedby="mdDescription">
  <div class="md-modal">
    <div class="md-head">
      <div>
        <div class="md-titleline">
          <span class="md-ledger-mark">$/M</span>
          <h3 id="mdTitle">models.dev 价格目录</h3>
        </div>
        <p class="md-sub" id="mdDescription">搜索、筛选并比较当前模型价格。确认后仅加入本次页面会话，不修改本地预设。</p>
      </div>
      <button type="button" class="md-close" id="mdClose" aria-label="关闭">×</button>
    </div>

    <div class="md-controls">
      <input type="search" class="md-search" id="mdSearch" placeholder="搜索模型名称、ID、family 或厂商…" autocomplete="off">
      <div class="md-filter-bar">
        <details class="md-provider-filter" id="mdProviderFilter">
          <summary id="mdProviderSummary">厂商</summary>
          <div class="md-provider-menu" id="mdProviderMenu"></div>
        </details>
        <label class="md-cache-filter">缓存支持
          <select id="mdCacheFilter">
            <option value="all">全部</option>
            <option value="supported">支持缓存</option>
            <option value="unsupported">不支持缓存</option>
          </select>
        </label>
        <button type="button" class="md-clear" id="mdClearFilters">清除筛选</button>
      </div>
      <div class="md-status" id="mdStatus" aria-live="polite"></div>
    </div>

    <div class="md-table-wrap" id="mdTableWrap">
      <table class="md-table">
        <thead>
          <tr>
            <th scope="col">模型</th>
            <th scope="col">厂商</th>
            <th scope="col" data-sort-key="contextWindow" aria-sort="none"><button type="button">Context <span aria-hidden="true">↕</span></button></th>
            <th scope="col" data-sort-key="priceInput" aria-sort="none"><button type="button">输入 <span aria-hidden="true">↕</span></button></th>
            <th scope="col" data-sort-key="priceOutput" aria-sort="none"><button type="button">输出 <span aria-hidden="true">↕</span></button></th>
            <th scope="col" data-sort-key="priceCacheRead" aria-sort="none"><button type="button">缓存读取 <span aria-hidden="true">↕</span></button></th>
            <th scope="col" data-sort-key="priceCacheWrite" aria-sort="none"><button type="button">缓存写入 <span aria-hidden="true">↕</span></button></th>
          </tr>
        </thead>
        <tbody id="mdTableBody"></tbody>
      </table>
      <div class="md-empty" id="mdEmpty" hidden></div>
    </div>

    <div class="md-confirm-bar">
      <div>
        <span class="md-selection-label">当前选择</span>
        <strong id="mdSelectedName">请先选择一个模型</strong>
        <span id="mdSelectedMeta"></span>
      </div>
      <button type="button" class="md-confirm" id="mdConfirm" disabled>使用此模型</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace old card-list CSS with desktop table styles**

Remove `.md-list`, `.md-row`, `.md-main`, `.md-name`, `.md-meta`, `.md-prov`, `.md-cache-tag`, `.md-price`, and the models.dev rules inside `@media (max-width: 620px)`.

Add explicit desktop rules, including these required dimensions and behaviors:

```css
body.md-modal-open { overflow: hidden; }
.md-overlay { overflow-x: auto; }
.md-modal {
  width: min(1240px, calc(100vw - 56px));
  min-width: 1100px;
  max-height: min(88vh, 820px);
}
.md-controls { padding: 18px 24px 12px; }
.md-search { width: 100%; margin: 0; }
.md-filter-bar { display: flex; align-items: end; gap: 10px; margin-top: 12px; }
.md-provider-filter { position: relative; }
.md-provider-filter summary,
.md-clear,
.md-confirm {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.md-provider-filter summary { min-width: 150px; padding: 10px 12px; }
.md-provider-menu {
  position: absolute;
  z-index: 4;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.md-provider-option { display: flex; grid-template-columns: 18px 1fr; align-items: center; gap: 8px; padding: 7px; }
.md-cache-filter { display: flex; align-items: center; gap: 8px; }
.md-cache-filter select { width: 160px; padding: 9px 11px; }
.md-clear { padding: 10px 12px; }
.md-table-wrap { flex: 1; overflow: auto; border-top: 1px solid var(--soft-line); border-bottom: 1px solid var(--soft-line); }
.md-table { width: 100%; min-width: 1080px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.md-table th { position: sticky; top: 0; z-index: 2; background: var(--panel); color: var(--muted); }
.md-table th,
.md-table td { padding: 12px 14px; border-bottom: 1px solid var(--soft-line); text-align: left; white-space: nowrap; }
.md-table th button { border: 0; background: transparent; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.md-table tbody tr { cursor: pointer; outline: none; }
.md-table tbody tr:hover,
.md-table tbody tr:focus-visible { background: rgba(59, 130, 246, .06); }
.md-table tbody tr.selected { background: rgba(59, 130, 246, .12); box-shadow: inset 3px 0 0 var(--primary); }
.md-model-name { display: block; color: var(--text); font-weight: 700; }
.md-model-id { display: block; max-width: 340px; overflow: hidden; text-overflow: ellipsis; color: var(--muted); font-family: "SF Mono", "Fira Code", monospace; font-size: 11px; }
.md-number { text-align: right; font-family: "SF Mono", "Fira Code", monospace; font-variant-numeric: tabular-nums; }
.md-missing { color: var(--muted); }
.md-confirm-bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 24px; background: var(--panel); }
.md-selection-label { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.md-confirm { padding: 11px 18px; background: var(--primary); color: white; border-color: var(--primary); font-weight: 700; }
.md-confirm:disabled { opacity: .5; cursor: not-allowed; }
```

Add dark-mode adjustments only where existing CSS variables are insufficient. Do not add an exploration-specific mobile media query.

- [ ] **Step 3: Define and reset modal UI state in `js/models-dev.js`**

```js
const RENDER_LIMIT = 300;
const state = {
  catalog: [],
  query: '',
  selectedProviders: new Set(),
  cacheFilter: 'all',
  sortKey: null,
  sortDirection: 'asc',
  selectedModelId: null,
  loading: false,
  error: null,
};

function resetViewState() {
  state.query = '';
  state.selectedProviders.clear();
  state.cacheFilter = 'all';
  state.sortKey = null;
  state.sortDirection = 'asc';
  state.selectedModelId = null;
}
```

Closing the modal calls `resetViewState()` and re-renders controls, but does not clear `state.catalog`.

- [ ] **Step 4: Render provider filters and selected-count text**

Build provider options from unique `providerId/providerName` pairs sorted by display name. Use DOM APIs:

```js
function renderProviderMenu() {
  const providers = [...new Map(
    state.catalog.map((model) => [model.providerId, model.providerName]),
  )].sort((a, b) => a[1].localeCompare(b[1], 'en'));

  const menu = $('mdProviderMenu');
  menu.replaceChildren(...providers.map(([providerId, providerName]) => {
    const label = document.createElement('label');
    label.className = 'md-provider-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = providerId;
    checkbox.checked = state.selectedProviders.has(providerId);
    const text = document.createElement('span');
    text.textContent = providerName;
    label.append(checkbox, text);
    return label;
  }));

  $('mdProviderSummary').textContent = state.selectedProviders.size
    ? `厂商（${state.selectedProviders.size}）`
    : '厂商';
}
```

Use one delegated `change` listener on `#mdProviderMenu` to update the set and call `renderResults()`.

- [ ] **Step 5: Render filtered and sorted table rows with the 300-row cap**

```js
function getVisibleModels() {
  const filtered = filterModels(state.catalog, state);
  return {
    total: filtered.length,
    shown: sortModels(filtered, state).slice(0, RENDER_LIMIT),
  };
}

function createCell(value, formatter, className = 'md-number') {
  const cell = document.createElement('td');
  cell.className = `${className}${value === null ? ' md-missing' : ''}`;
  cell.textContent = formatter(value);
  return cell;
}

function createModelRow(model) {
  const row = document.createElement('tr');
  row.dataset.modelId = model.id;
  row.tabIndex = 0;
  row.setAttribute('aria-selected', String(state.selectedModelId === model.id));
  row.classList.toggle('selected', state.selectedModelId === model.id);

  const modelCell = document.createElement('td');
  const name = document.createElement('span');
  name.className = 'md-model-name';
  name.textContent = model.name;
  const id = document.createElement('span');
  id.className = 'md-model-id';
  id.textContent = model.sourceId;
  modelCell.append(name, id);

  const provider = document.createElement('td');
  provider.textContent = model.providerName;

  row.append(
    modelCell,
    provider,
    createCell(model.contextWindow, formatContextWindow),
    createCell(model.priceInput, formatCatalogPrice),
    createCell(model.priceOutput, formatCatalogPrice),
    createCell(model.priceCacheRead, formatCatalogPrice),
    createCell(model.priceCacheWrite, formatCatalogPrice),
  );
  return row;
}
```

`renderResults()` must update status text to `匹配 N / 总计 M 个模型 · USD / 1M tokens · 来源 models.dev`; append ` · 当前显示前 300 个` when truncated; hide the table and show `#mdEmpty` with a clear-filter action when no results remain.

- [ ] **Step 6: Wire search debounce, cache filter, clear, and sortable headers**

Use a 120 ms debounce for search. Cache filter changes immediately. Clear resets all view state.

Sortable header logic:

```js
function setSort(sortKey) {
  if (state.sortKey === sortKey) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = sortKey;
    state.sortDirection = 'asc';
  }
  renderResults();
}
```

After rendering, set every sortable header to `aria-sort="none"`, then set the current one to `ascending` or `descending`; update the visible arrow to `↑` or `↓`.

- [ ] **Step 7: Verify the table UI through Chrome DevTools MCP**

At 1440×900, verify:

- table has seven headers in the approved order;
- `thead th` remains at the same top coordinate after scrolling `#mdTableWrap`;
- searching a known multi-word query returns only rows containing all terms across search fields;
- selecting two providers changes summary text to `厂商（2）`;
- `supported` filter leaves only rows with `priceCacheRead !== null || priceCacheWrite !== null`;
- clicking input-price header twice produces ascending then descending `aria-sort`;
- rows displaying `—` appear after numeric values in both directions;
- a synthetic or real zero price displays `$0`.

Capture `/tmp/models-dev-table-light-1440.png` and `/tmp/models-dev-table-dark-1440.png`.

- [ ] **Step 8: Commit the desktop explorer table**

```bash
git add index.html styles.css js/models-dev.js
git diff --check
git commit -m "feat: add models.dev price comparison table"
```

---

### Task 8: Add Two-Step Selection, Retry States, and Accessible Modal Behavior

**Files:**
- Modify: `js/models-dev.js`
- Modify: `js/app.js`
- Modify: `styles.css`
- Test: Chrome DevTools MCP interaction and accessibility checks

**Interfaces:**
- Consumes: table state and `onSelect(model)` callback
- Produces: explicit temporary selection, confirmation, loading/error/empty states, focus trap, and body scroll lock

- [ ] **Step 1: Change row activation to temporary selection only**

```js
function selectRow(modelId) {
  state.selectedModelId = modelId;
  renderResults();
  renderSelection();
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
```

Click, `Enter`, and `Space` call `selectRow()` only. Clicking an already selected row leaves it selected.

- [ ] **Step 2: Confirm the selected model through the callback**

```js
function confirmSelection() {
  const model = selectedModel();
  if (!canUseModel(model)) return;
  selectCallback(model);
  closeModelsDevModal();
}
```

Update `app.js` conversion to the normalized shape:

```js
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
```

The callback must run only when the confirm button is clicked.

- [ ] **Step 3: Implement loading, error, retry, and empty rendering**

Use one cached promise only for successful/in-flight loads:

```js
let catalogPromise = null;

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  if (catalogPromise) return catalogPromise;

  state.loading = true;
  state.error = null;
  renderState();

  catalogPromise = fetch('https://models.dev/catalog.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((catalog) => {
      state.catalog = normalizeCatalog(catalog);
      return state.catalog;
    })
    .catch((error) => {
      catalogPromise = null;
      state.error = error;
      throw error;
    })
    .finally(() => {
      state.loading = false;
      renderState();
    });

  return catalogPromise;
}
```

On failure, `#mdTableWrap` must show an error panel with the exact actions:

```html
<p>无法加载 models.dev 目录。静态预设和成本计算器仍可继续使用。</p>
<button type="button" id="mdRetry">重新加载</button>
```

Register retry through delegated click handling so repeated failures do not add listeners.

- [ ] **Step 4: Add focus management, trap, Escape, overlay close, and scroll lock**

```js
let returnFocusElement = null;

function focusableElements() {
  return [...$('mdOverlay').querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.offsetParent !== null);
}

function openModelsDevModal() {
  returnFocusElement = document.activeElement;
  $('mdOverlay').classList.add('open');
  document.body.classList.add('md-modal-open');
  resetViewState();
  renderState();
  loadCatalog().then(() => $('mdSearch').focus()).catch(() => $('mdRetry')?.focus());
}

function closeModelsDevModal() {
  $('mdOverlay').classList.remove('open');
  document.body.classList.remove('md-modal-open');
  resetViewState();
  renderState();
  returnFocusElement?.focus();
}

function handleDialogKeydown(event) {
  if (!$('mdOverlay').classList.contains('open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModelsDevModal();
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
```

Register this handler once. Overlay clicks close only when `event.target === #mdOverlay`.

- [ ] **Step 5: Verify two-step selection and state reset**

With Chrome DevTools MCP:

1. Record four price input values.
2. Open the modal and click a usable row.
3. Verify inputs are unchanged, row `aria-selected` is `true`, and confirm is enabled.
4. Click confirm.
5. Verify four prices update, preset selector contains the dynamic option, model selector/reference table update, and modal closes.
6. Reopen and verify query, providers, cache filter, manual sorting, and selected row are reset while the catalog request count remains one.
7. Reload and verify the dynamic option disappears.

- [ ] **Step 6: Verify inaccessible-model and keyboard paths**

Find a row with missing input or output. Select it and verify confirm remains disabled with explanatory text.

Then verify:

- focus enters search on open;
- `Enter` and `Space` select a focused row;
- `Tab` from the last focusable element wraps to the first;
- `Shift+Tab` from the first wraps to the last;
- `Escape` closes;
- focus returns to `#loadModelsDev`;
- body overflow is locked only while open.

- [ ] **Step 7: Verify retry behavior without changing production code**

Use Chrome DevTools MCP request interception if available in the active MCP version; otherwise, temporarily use `evaluate_script` to replace `window.fetch` before opening the modal, then reload to restore it:

```js
() => {
  window.__originalFetch = window.fetch;
  window.fetch = (...args) => String(args[0]).includes('models.dev/catalog.json')
    ? Promise.resolve(new Response('', { status: 503 }))
    : window.__originalFetch(...args);
}
```

Expected: error panel and retry button appear; the main calculator remains usable. Restore a successful fetch path or reload, click retry, and verify the table loads.

- [ ] **Step 8: Commit selection and accessibility behavior**

```bash
git add js/models-dev.js js/app.js styles.css
git diff --check
git commit -m "feat: add confirmed model selection flow"
```

---

### Task 9: Run Full Chrome DevTools MCP Acceptance and Quality Audit

**Files:**
- Modify only if defects are found: `index.html`, `styles.css`, `js/*.js`
- Test: full application at desktop viewports

**Interfaces:**
- Consumes: completed implementation from Tasks 1–8
- Produces: verified behavior and evidence for completion report

- [ ] **Step 1: Restart from a clean browser and server state**

Stop any stale HTTP server, then run:

```bash
uv run python -m http.server 4173
```

Open a fresh Chrome page at `http://127.0.0.1:4173/`, clear the origin's `localStorage`, and reload.

Expected: no stale dynamic preset or theme state affects the test.

- [ ] **Step 2: Verify static resources and Console health**

Use Network and Console MCP tools.

Expected successful resources:

```text
/
/styles.css
/model-presets.json
/js/app.js
/js/dom.js
/js/pricing.js
/js/storage.js
/js/presets.js
/js/chart.js
/js/models-dev.js
https://models.dev/catalog.json
```

Expected: no uncaught error, unhandled rejection, missing module, failed local resource, or invalid DOM exception.

- [ ] **Step 3: Re-run the calculator regression matrix**

Verify:

- Task 1 default baseline.
- Task 1 deterministic custom-input baseline.
- multiplier `0` continues to follow existing behavior (`1`) because formulas were not redesigned.
- all token inputs `0` show the existing warning and finite SVG coordinates.
- a preset with legitimate cache prices `0` uses those zeros in chart series.
- theme and token/multiplier/static-preset state survive refresh.
- dynamic models.dev preset does not survive refresh.

- [ ] **Step 4: Re-run explorer functional acceptance**

Verify all of the following with real UI actions and DOM reads:

- one catalog request per page lifecycle;
- model name, ID, family, and provider searches;
- multi-word AND behavior;
- provider multi-select;
- `all`, `supported`, `unsupported` cache filters;
- intelligent default ordering;
- all five sortable numeric columns in both directions;
- `null` values always last;
- exact price rendering including `$0`;
- Context compact formatting;
- 300-row truncation message when applicable;
- empty result and clear-filters behavior;
- two-step selection and disabled incomplete-model confirmation;
- retry after simulated failure.

- [ ] **Step 5: Run accessibility checks**

Use `mcp__chrome-devtools__take_snapshot` to inspect semantic structure and verify:

- dialog name comes from `#mdTitle`;
- description comes from `#mdDescription`;
- table, row, and column-header roles are present;
- sortable headers expose `aria-sort`;
- selected row exposes `aria-selected="true"`;
- loading/status text uses an `aria-live` region;
- keyboard focus is visible and trapped.

Run `mcp__chrome-devtools__lighthouse_audit` for categories `accessibility` and `best-practices` if the installed schema supports category selection; otherwise run the available Lighthouse audit and report those category results.

Expected: no new critical issue caused by this implementation. Fix concrete regressions before continuing; score itself is not a hard gate.

- [ ] **Step 6: Run desktop visual acceptance at both approved sizes**

At 1440×900 and 1920×1080, in both light and dark themes, capture:

```text
/tmp/models-dev-final-light-1440.png
/tmp/models-dev-final-dark-1440.png
/tmp/models-dev-final-light-1920.png
/tmp/models-dev-final-dark-1920.png
```

Verify visually:

- seven columns remain readable;
- long model names truncate only the secondary ID, not critical prices;
- sticky header remains distinguishable while scrolling;
- provider menu is not clipped;
- selected row and sort direction are clear;
- confirm bar remains visible;
- modal does not add mobile card behavior;
- horizontal scrolling is available below the minimum desktop width.

- [ ] **Step 7: Measure search/sort responsiveness only if visually slow**

If search or sort appears delayed, run a performance trace around entering a broad query and sorting a full result set. Inspect long-task insights.

Expected: no repeated long task attributable to rendering beyond the 300-row cap. If interaction is already immediate, record that no trace was necessary, as allowed by the design.

- [ ] **Step 8: Fix any acceptance defects and re-run only affected checks plus Console/Network**

Every fix must remain within the approved scope. After each fix:

```bash
git diff --check
```

Then repeat the failed scenario and ensure Console/Network remain clean.

- [ ] **Step 9: Commit verification fixes, if any**

If files changed during acceptance:

```bash
git add index.html styles.css js/
git diff --cached --check
git commit -m "fix: address explorer acceptance issues"
```

If no files changed, do not create an empty commit.

---

### Task 10: Final Repository Verification and Handoff

**Files:**
- Modify: none unless a final defect is found
- Test: Git status, static structure, browser evidence summary

**Interfaces:**
- Consumes: all completed tasks
- Produces: clean, reviewable branch ready for code review or integration decision

- [ ] **Step 1: Verify repository state and diff scope**

```bash
git status --short --branch
git diff main...HEAD --stat
git diff --check main...HEAD
```

Expected: branch is `improve-models-dev-modal`; working tree is clean; no whitespace error; changes are limited to the approved design, stylesheet/modules, and explorer implementation.

- [ ] **Step 2: Verify HTML/module references and forbidden additions**

```bash
grep -n '<script' index.html
grep -n '<style\|style="' index.html || true
find js -maxdepth 1 -type f -name '*.js' -print | sort
find . -maxdepth 2 -name 'package.json' -o -name 'node_modules'
```

Expected:

- one external module script in `index.html`;
- no inline style or style tag;
- exactly the seven planned JS files;
- no `package.json` or `node_modules` introduced.

- [ ] **Step 3: Summarize verification evidence**

Prepare the final user-facing report with:

- actual local URL `http://127.0.0.1:4173/`;
- commits created per task;
- default and deterministic calculator regression results;
- models.dev request count and interaction results;
- Console and Network result;
- Lighthouse accessibility/best-practices summary;
- screenshot paths for both desktop sizes and themes;
- performance-trace status;
- any skipped or failed check and its exact reason.

Do not claim completion if any required acceptance scenario remains unresolved.

- [ ] **Step 4: Request code review before integration**

Invoke `superpowers:requesting-code-review` after all verification passes. Address confirmed findings before offering merge/PR/cleanup options.

- [ ] **Step 5: Commit only if final review causes code changes**

Use a focused commit message matching the change. If the review causes no changes, keep the clean working tree and do not create an empty commit.
