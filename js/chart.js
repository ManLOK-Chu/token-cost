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

  // 计算所有可见模型的全局 Y 轴范围
  let globalMinCost = Infinity;
  let globalMaxCost = -Infinity;

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

    modelSeries.forEach((point) => {
      globalMinCost = Math.min(globalMinCost, point.total);
      globalMaxCost = Math.max(globalMaxCost, point.total);
    });

    visibleModelsData.push({
      id: preset.id,
      name: preset.name,
      series: modelSeries,
      style: getModelStyle(index),
      isDefault: preset.id === defaultId
    });
  });

  const pad = Math.max((globalMaxCost - globalMinCost) * 0.12, globalMaxCost === 0 ? 1 : globalMaxCost * 0.04);
  const yMin = Math.max(0, globalMinCost - pad);
  const yMax = globalMaxCost + pad;
  const x = scaleLinear(0, 1, margin.left, margin.left + innerW);
  const y = scaleLinear(yMin, yMax, margin.top + innerH, margin.top);

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
      'stroke-width': model.style.width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    if (model.style.dasharray !== 'none') {
      lineAttrs['stroke-dasharray'] = model.style.dasharray;
    }
    plot.appendChild(makeSvgEl('polyline', lineAttrs));
  });

  // 当前命中率指示线（只对默认模型）
  const defaultModel = visibleModelsData.find((m) => m.isDefault);
  if (defaultModel) {
    const current = calculateCostAtRate(data.currentRate, { ...data, ...defaultModel.series.find((p) => Math.abs(p.rate - data.currentRate) < 0.01) || {} });
    const currentPoint = defaultModel.series.reduce((best, point) => {
      return Math.abs(point.rate - data.currentRate) < Math.abs(best.rate - data.currentRate) ? point : best;
    }, defaultModel.series[0]);
    const currentX = x(data.currentRate);
    const currentY = y(currentPoint.total);
    plot.appendChild(makeSvgEl('line', {
      x1: currentX, y1: margin.top, x2: currentX, y2: margin.top + innerH, class: 'current-line'
    }));
    plot.appendChild(makeSvgEl('circle', {
      cx: currentX, cy: currentY, r: 7, class: 'current-dot'
    }));
  }

  // 悬浮点和交互层
  const hoverDots = visibleModelsData.map((model) => {
    const dot = makeSvgEl('circle', {
      cx: -100, cy: -100, r: 6,
      fill: model.style.color,
      stroke: '#ffffff',
      'stroke-width': 3
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

  function showPoint(clientX) {
    const rect = svg.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const svgX = ratio * width;
    const rate = clamp((svgX - margin.left) / innerW, 0, 1);

    // 找到最近的数据点
    const nearestRate = visibleModelsData[0]?.series.reduce((best, point) => {
      return Math.abs(point.rate - rate) < Math.abs(best.rate - rate) ? point.rate : best;
    }, visibleModelsData[0].series[0].rate) || rate;

    // 更新每个模型的悬浮点
    hoverDots.forEach(({ dot, model }) => {
      const nearest = model.series.reduce((best, point) => {
        return Math.abs(point.rate - nearestRate) < Math.abs(best.rate - nearestRate) ? point : best;
      }, model.series[0]);
      const dotX = x(nearest.rate);
      const dotY = y(nearest.total);
      dot.setAttribute('cx', dotX);
      dot.setAttribute('cy', dotY);
    });

    const wrapRect = chartWrap.getBoundingClientRect();
    const firstDot = hoverDots[0];
    if (!firstDot) return;

    const dotX = parseFloat(firstDot.dot.getAttribute('cx'));
    const dotY = parseFloat(firstDot.dot.getAttribute('cy'));
    const screenX = rect.left + dotX / width * rect.width - wrapRect.left;
    const screenY = rect.top + dotY / height * rect.height - wrapRect.top;
    tooltip.style.left = `${screenX}px`;
    tooltip.style.top = `${screenY}px`;
    tooltip.style.opacity = '1';

    // 生成 tooltip 内容
    let tooltipHtml = `<strong>${formatPercent(nearestRate)}</strong><br><br>`;
    visibleModelsData.forEach((model) => {
      const nearest = model.series.reduce((best, point) => {
        return Math.abs(point.rate - nearestRate) < Math.abs(best.rate - nearestRate) ? point : best;
      }, model.series[0]);
      tooltipHtml += `<span style="color:${model.style.color}">●</span> ${model.name}: <strong>${formatMoney(nearest.total)}</strong><br>`;
    });
    tooltip.innerHTML = tooltipHtml;
  }

  hoverRect.addEventListener('mousemove', (event) => showPoint(event.clientX));
  hoverRect.addEventListener('mouseenter', (event) => showPoint(event.clientX));
  hoverRect.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
    hoverDots.forEach(({ dot }) => {
      dot.setAttribute('cx', -100);
      dot.setAttribute('cy', -100);
    });
  });
}
