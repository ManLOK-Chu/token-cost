import { $, clamp } from './dom.js';
import { MILLION, buildSeries, calculateCostAtRate, formatMoney, formatPercent, formatToken } from './pricing.js';
import { getModelStyle } from './presets.js';

const chartSize = { width: 980, height: 430 };
const margin = { top: 34, right: 34, bottom: 58, left: 78 };

export function renderSummary(data) {
  const current = calculateCostAtRate(data.currentRate, data);
  const zero = calculateCostAtRate(0, data);
  const full = calculateCostAtRate(1, data);
  const delta = (data.priceNew * data.nonHitNewShare + data.priceCreate * (1 - data.nonHitNewShare) - data.priceHit) * data.totalInputTokens * 0.1 / MILLION;
  const saved = zero.total - full.total;

  $('currentCost').textContent = formatMoney(current.total);
  $('currentRateText').textContent = `当前命中率 ${formatPercent(data.currentRate)}，总输入 tokens ${formatToken(data.totalInputTokens)}`;
  $('zeroCost').textContent = formatMoney(zero.total);
  $('fullCost').textContent = formatMoney(full.total);
  $('deltaCost').textContent = `${delta >= 0 ? '+' : ''}${formatMoney(delta)}`;
  $('deltaText').textContent = delta >= 0
    ? '命中率每降低 10 个百分点的额外成本'
    : '命中率降低时成本反而下降，因为创建价低于命中价';

  const direction = saved >= 0 ? '最多可节省' : '100% 命中反而增加';
  $('chartStatus').textContent = `${direction} ${formatMoney(Math.abs(saved))}；当前点 ${formatMoney(current.total)}`;

  const warnings = [];
  if (data.totalInputTokens === 0) warnings.push('没有输入 token，命中率不会影响总成本。');
  if (data.priceCreate < data.priceHit) warnings.push('缓存创建成本低于命中成本，因此曲线会随命中率上升而上升。');
  $('inlineWarning').innerHTML = warnings.length ? ` <span class="warning">${warnings.join(' ')}</span>` : '';
}

function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
  if (domainMax === domainMin) {
    return () => (rangeMin + rangeMax) / 2;
  }
  return (value) => rangeMin + (value - domainMin) * (rangeMax - rangeMin) / (domainMax - domainMin);
}

function makeSvgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

export function renderChart(data, presets, visibleIds, defaultId) {
  const svg = $('chart');
  svg.innerHTML = '';

  const { width, height } = chartSize;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const modelsWithPrices = presets.filter((preset) => preset.id !== 'custom');
  const visibleModelsData = [];

  modelsWithPrices.forEach((preset, index) => {
    if (!visibleIds.has(preset.id)) return;

    const modelData = {
      ...data,
      priceNew: preset.priceNew ?? data.priceNew,
      priceOut: preset.priceOut ?? data.priceOut,
      priceHit: preset.priceHit ?? data.priceHit,
      priceCreate: preset.priceCreate ?? data.priceCreate,
    };
    const modelSeries = buildSeries(modelData);

    visibleModelsData.push({
      id: preset.id,
      name: preset.name,
      data: modelData,
      series: modelSeries,
      style: getModelStyle(index),
      isDefault: preset.id === defaultId,
    });
  });

  if (!visibleModelsData.length) {
    visibleModelsData.push({
      id: 'current-input',
      name: '当前输入价格',
      data,
      series: buildSeries(data),
      style: getModelStyle(0),
      isDefault: true,
    });
  }

  const defaultModel = visibleModelsData.find((model) => model.isDefault) || visibleModelsData[0];
  const allPoints = visibleModelsData.flatMap((model) => model.series);
  const globalMinCost = Math.min(...allPoints.map((point) => point.total));
  const globalMaxCost = Math.max(...allPoints.map((point) => point.total));

  const pad = Math.max((globalMaxCost - globalMinCost) * 0.12, globalMaxCost === 0 ? 1 : globalMaxCost * 0.04);
  const yMin = Math.max(0, globalMinCost - pad);
  const yMax = globalMaxCost + pad;
  const x = scaleLinear(0, 1, margin.left, margin.left + innerW);
  const y = scaleLinear(yMin, yMax, margin.top + innerH, margin.top);

  const title = makeSvgEl('title', { id: 'chartSvgTitle' });
  title.textContent = '缓存命中率与总成本折线图';
  const description = makeSvgEl('desc', { id: 'chartSvgDescription' });
  description.textContent = `显示 ${visibleModelsData.length} 个模型从 0% 到 100% 缓存命中率的总成本。当前命中率为 ${formatPercent(data.currentRate)}，主模型为 ${defaultModel.name}。`;
  svg.setAttribute('aria-labelledby', 'chartSvgTitle chartSvgDescription');
  svg.append(title, description);

  const defs = makeSvgEl('defs');
  svg.appendChild(defs);

  const plot = makeSvgEl('g');
  svg.appendChild(plot);

  // 绘制网格线和坐标轴
  for (let i = 0; i <= 5; i += 1) {
    const rate = i / 5;
    const xPos = x(rate);
    plot.appendChild(makeSvgEl('line', {
      x1: xPos, y1: margin.top, x2: xPos, y2: margin.top + innerH, class: 'grid-line'
    }));
    const label = makeSvgEl('text', {
      x: xPos, y: height - 24, 'text-anchor': 'middle', class: 'tick-label'
    });
    label.textContent = `${rate * 100}%`;
    plot.appendChild(label);
  }

  for (let i = 0; i <= 4; i += 1) {
    const value = yMin + (yMax - yMin) * i / 4;
    const yPos = y(value);
    plot.appendChild(makeSvgEl('line', {
      x1: margin.left, y1: yPos, x2: margin.left + innerW, y2: yPos, class: 'grid-line'
    }));
    const label = makeSvgEl('text', {
      x: margin.left - 12, y: yPos + 4, 'text-anchor': 'end', class: 'tick-label'
    });
    label.textContent = formatMoney(value);
    plot.appendChild(label);
  }

  plot.appendChild(makeSvgEl('line', {
    x1: margin.left, y1: margin.top + innerH, x2: margin.left + innerW, y2: margin.top + innerH, class: 'axis-line'
  }));
  plot.appendChild(makeSvgEl('line', {
    x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + innerH, class: 'axis-line'
  }));

  const xLabel = makeSvgEl('text', {
    x: margin.left + innerW / 2, y: height - 8, 'text-anchor': 'middle', class: 'axis-label'
  });
  xLabel.textContent = '缓存命中率';
  plot.appendChild(xLabel);

  const yLabel = makeSvgEl('text', {
    x: 18, y: margin.top + innerH / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 18 ${margin.top + innerH / 2})`
  });
  yLabel.textContent = '总成本（USD）';
  plot.appendChild(yLabel);

  // 绘制每个可见模型的折线
  visibleModelsData.forEach((model) => {
    const linePoints = model.series.map((point) => `${x(point.rate)},${y(point.total)}`).join(' ');

    // 为默认模型添加面积填充
    if (model.isDefault) {
      const areaPoints = `${margin.left},${margin.top + innerH} ${linePoints} ${margin.left + innerW},${margin.top + innerH}`;
      const areaGradientId = `areaGradient-${model.id}`;
      const gradient = makeSvgEl('linearGradient', { id: areaGradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
      gradient.appendChild(makeSvgEl('stop', { offset: '0%', 'stop-color': model.style.color, 'stop-opacity': '0.20' }));
      gradient.appendChild(makeSvgEl('stop', { offset: '100%', 'stop-color': model.style.color, 'stop-opacity': '0.00' }));
      defs.appendChild(gradient);
      plot.appendChild(makeSvgEl('polygon', { points: areaPoints, fill: `url(#${areaGradientId})` }));
    }

    const lineAttrs = {
      points: linePoints,
      fill: 'none',
      stroke: model.style.color,
      'stroke-width': model.isDefault ? 4 : model.style.width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    if (model.style.dasharray !== 'none') {
      lineAttrs['stroke-dasharray'] = model.style.dasharray;
    }
    plot.appendChild(makeSvgEl('polyline', lineAttrs));
  });

  const currentPoint = calculateCostAtRate(data.currentRate, defaultModel.data);
  const currentX = x(data.currentRate);
  const currentY = y(currentPoint.total);
  plot.appendChild(makeSvgEl('line', {
    x1: currentX, y1: margin.top, x2: currentX, y2: margin.top + innerH, class: 'current-line',
  }));
  plot.appendChild(makeSvgEl('circle', {
    cx: currentX, cy: currentY, r: 7, class: 'current-dot',
  }));

  const selectionLine = makeSvgEl('line', {
    x1: currentX, y1: margin.top, x2: currentX, y2: margin.top + innerH, class: 'selection-line',
  });
  plot.appendChild(selectionLine);

  function addKeyPoint(rate, label, xOffset, anchor, drawDot = true) {
    const point = calculateCostAtRate(rate, defaultModel.data);
    const pointX = x(rate);
    const pointY = y(point.total);
    const labelY = pointY - 14 < margin.top + 12 ? pointY + 24 : pointY - 14;
    if (drawDot) {
      plot.appendChild(makeSvgEl('circle', {
        cx: pointX, cy: pointY, r: 5, fill: defaultModel.style.color, class: 'key-point-dot',
      }));
    }
    const text = makeSvgEl('text', {
      x: pointX + xOffset,
      y: labelY,
      'text-anchor': anchor,
      class: 'key-point-label',
    });
    text.textContent = `${label} · ${formatMoney(point.total)}`;
    plot.appendChild(text);
  }

  const currentAtZero = data.currentRate <= 0.005;
  const currentAtFull = data.currentRate >= 0.995;
  addKeyPoint(0, currentAtZero ? '0% · 当前' : '0%', 10, 'start', !currentAtZero);
  addKeyPoint(1, currentAtFull ? '100% · 当前' : '100%', -10, 'end', !currentAtFull);
  if (!currentAtZero && !currentAtFull) {
    addKeyPoint(
      data.currentRate,
      `当前 ${formatPercent(data.currentRate)}`,
      data.currentRate > 0.72 ? -10 : 10,
      data.currentRate > 0.72 ? 'end' : 'start',
      false,
    );
  }

  // 悬浮点和交互层
  const hoverDots = visibleModelsData.map((model) => {
    const dot = makeSvgEl('circle', {
      cx: -100, cy: -100, r: 6,
      fill: model.style.color,
      class: 'hover-dot',
    });
    plot.appendChild(dot);
    return { dot, model };
  });

  const hoverRect = makeSvgEl('rect', {
    x: margin.left, y: margin.top, width: innerW, height: innerH, fill: 'transparent', class: 'hover-layer'
  });
  plot.appendChild(hoverRect);

  const tooltip = $('tooltip');
  const chartWrap = svg.parentElement;
  const rateExplorer = $('chartRateExplorer');
  const rateValue = $('chartRateValue');
  const pointDetails = $('chartPointDetails');

  function pointAtRate(model, rate) {
    return calculateCostAtRate(rate, model.data);
  }

  function tooltipSwatch(model) {
    const swatch = document.createElement('span');
    swatch.className = 'tooltip-swatch';
    swatch.style.backgroundColor = model.style.color;
    swatch.setAttribute('aria-hidden', 'true');
    return swatch;
  }

  function tooltipSummaryRow(model, point, className) {
    const row = document.createElement('div');
    row.className = className;
    const name = document.createElement('span');
    name.className = 'tooltip-model-name';
    name.textContent = model.name;
    const total = document.createElement('span');
    total.className = 'tooltip-total';
    total.textContent = formatMoney(point.total);
    row.append(tooltipSwatch(model), name, total);
    return row;
  }

  function renderTooltip(rate) {
    const primaryPoint = pointAtRate(defaultModel, rate);
    const heading = document.createElement('div');
    heading.className = 'tooltip-heading';
    heading.textContent = `命中率 ${formatPercent(rate)}`;

    const breakdown = document.createElement('div');
    breakdown.className = 'tooltip-breakdown';
    [
      ['新增输入', primaryPoint.newCost],
      ['输出', primaryPoint.outCost],
      ['缓存命中', primaryPoint.hitCost],
      ['缓存创建', primaryPoint.createCost],
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'tooltip-breakdown-row';
      const labelElement = document.createElement('span');
      labelElement.textContent = label;
      const valueElement = document.createElement('span');
      valueElement.textContent = formatMoney(value);
      row.append(labelElement, valueElement);
      breakdown.appendChild(row);
    });

    const children = [heading, tooltipSummaryRow(defaultModel, primaryPoint, 'tooltip-model-summary'), breakdown];
    if (visibleModelsData.length > 1) {
      const comparison = document.createElement('div');
      comparison.className = 'tooltip-comparison';
      visibleModelsData
        .filter((model) => model !== defaultModel)
        .forEach((model) => comparison.appendChild(
          tooltipSummaryRow(model, pointAtRate(model, rate), 'tooltip-comparison-row'),
        ));
      children.push(comparison);
    }
    tooltip.replaceChildren(...children);
  }

  function updatePointDetails(rate) {
    const primaryPoint = pointAtRate(defaultModel, rate);
    const comparisonText = visibleModelsData
      .filter((model) => model !== defaultModel)
      .map((model) => `${model.name} ${formatMoney(pointAtRate(model, rate).total)}`)
      .join(' · ');
    pointDetails.textContent = [
      `命中率 ${formatPercent(rate)}`,
      `${defaultModel.name} 总成本 ${formatMoney(primaryPoint.total)}（新增输入 ${formatMoney(primaryPoint.newCost)}，输出 ${formatMoney(primaryPoint.outCost)}，缓存命中 ${formatMoney(primaryPoint.hitCost)}，缓存创建 ${formatMoney(primaryPoint.createCost)}）`,
      comparisonText,
    ].filter(Boolean).join(' · ');
  }

  function updateSelection(rate) {
    const selectedRate = clamp(rate, 0, 1);
    rateExplorer.value = String(Number((selectedRate * 100).toFixed(1)));
    rateValue.textContent = formatPercent(selectedRate);
    selectionLine.setAttribute('x1', x(selectedRate));
    selectionLine.setAttribute('x2', x(selectedRate));
    selectionLine.style.visibility = Math.abs(selectedRate - data.currentRate) < 0.0005 ? 'hidden' : 'visible';
    hoverDots.forEach(({ dot, model }) => {
      const point = pointAtRate(model, selectedRate);
      dot.setAttribute('cx', x(selectedRate));
      dot.setAttribute('cy', y(point.total));
    });
    updatePointDetails(selectedRate);
    return selectedRate;
  }

  function positionTooltip(rate) {
    const rect = svg.getBoundingClientRect();
    const wrapRect = chartWrap.getBoundingClientRect();
    const point = pointAtRate(defaultModel, rate);
    const screenX = rect.left + x(rate) / width * rect.width - wrapRect.left;
    const screenY = rect.top + y(point.total) / height * rect.height - wrapRect.top;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const plotLeft = rect.left + margin.left / width * rect.width - wrapRect.left;
    const plotRight = rect.left + (margin.left + innerW) / width * rect.width - wrapRect.left;
    const plotTop = rect.top + margin.top / height * rect.height - wrapRect.top;
    const plotBottom = rect.top + (margin.top + innerH) / height * rect.height - wrapRect.top;
    const minLeft = Math.max(8, plotLeft);
    const maxLeft = Math.max(minLeft, Math.min(wrapRect.width - tooltipWidth - 8, plotRight - tooltipWidth));
    const minTop = Math.max(8, plotTop);
    const maxTop = Math.max(minTop, Math.min(wrapRect.height - tooltipHeight - 8, plotBottom - tooltipHeight));
    let left = screenX + 12;
    if (left > maxLeft) left = screenX - tooltipWidth - 12;
    let top = screenY - tooltipHeight - 12;
    if (top < minTop) top = screenY + 12;
    tooltip.style.left = `${clamp(left, minLeft, maxLeft)}px`;
    tooltip.style.top = `${clamp(top, minTop, maxTop)}px`;
  }

  function showTooltip(rate) {
    renderTooltip(rate);
    tooltip.style.opacity = '1';
    tooltip.setAttribute('aria-hidden', 'false');
    positionTooltip(rate);
  }

  function hideTooltip() {
    tooltip.style.opacity = '0';
    tooltip.setAttribute('aria-hidden', 'true');
  }

  function showPoint(clientX) {
    const rect = svg.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const svgX = ratio * width;
    const rate = updateSelection((svgX - margin.left) / innerW);
    showTooltip(rate);
  }

  rateExplorer.disabled = false;
  rateExplorer.oninput = (event) => {
    hideTooltip();
    updateSelection(Number(event.target.value) / 100);
  };
  hoverRect.addEventListener('mousemove', (event) => showPoint(event.clientX));
  hoverRect.addEventListener('mouseenter', (event) => showPoint(event.clientX));
  hoverRect.addEventListener('mouseleave', hideTooltip);
  updateSelection(data.currentRate);
}
