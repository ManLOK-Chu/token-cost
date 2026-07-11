import { readNumber } from './dom.js';

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
