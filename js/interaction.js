// 交互增强工具模块

/**
 * 防抖函数 - 延迟执行，多次调用只执行最后一次
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 节流函数 - 固定时间内只执行一次
 * @param {Function} fn - 要节流的函数
 * @param {number} interval - 时间间隔（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, interval = 150) {
  let lastTime = 0;
  let timer = null;
  return function throttled(...args) {
    const now = Date.now();
    const remaining = interval - (now - lastTime);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * 格式化数字输入 - 添加千分位分隔符
 * @param {number} value - 数字值
 * @returns {string} 格式化后的字符串
 */
export function formatNumberInput(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('en-US');
}

/**
 * 解析格式化的数字输入
 * @param {string} value - 格式化的字符串
 * @returns {number} 解析后的数字
 */
export function parseNumberInput(value) {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/,/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

/**
 * 创建加载指示器
 * @returns {Object} 包含 show 和 hide 方法的对象
 */
export function createLoadingIndicator() {
  let activeCount = 0;
  const indicators = new Set();

  return {
    show(element) {
      activeCount++;
      if (element && !indicators.has(element)) {
        indicators.add(element);
        element.classList.add('calculating');
      }
    },
    hide(element) {
      activeCount = Math.max(0, activeCount - 1);
      if (element && indicators.has(element)) {
        indicators.delete(element);
        element.classList.remove('calculating');
      }
    },
    isActive() {
      return activeCount > 0;
    },
  };
}

/**
 * 键盘快捷键管理器
 */
export class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * 注册快捷键
   * @param {string} key - 键名（如 'k', 'Enter', 'Escape'）
   * @param {Object} options - 选项 { ctrl, meta, shift, alt, handler }
   */
  register(key, options) {
    const normalizedKey = key.toLowerCase();
    const shortcutKey = this.makeKey(normalizedKey, options);
    this.shortcuts.set(shortcutKey, options.handler);
  }

  /**
   * 注销快捷键
   * @param {string} key - 键名
   * @param {Object} options - 选项
   */
  unregister(key, options) {
    const normalizedKey = key.toLowerCase();
    const shortcutKey = this.makeKey(normalizedKey, options);
    this.shortcuts.delete(shortcutKey);
  }

  makeKey(key, options = {}) {
    const parts = [];
    if (options.ctrl) parts.push('ctrl');
    if (options.meta) parts.push('meta');
    if (options.shift) parts.push('shift');
    if (options.alt) parts.push('alt');
    parts.push(key);
    return parts.join('+');
  }

  handleKeyDown(event) {
    // 忽略在输入框、文本域中的按键（除非明确指定）
    const target = event.target;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

    const key = event.key.toLowerCase();
    const shortcutKey = this.makeKey(key, {
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    });

    const handler = this.shortcuts.get(shortcutKey);
    if (handler) {
      // 对于修饰键组合，总是执行
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handler(event);
      } else if (!isInput) {
        // 对于单键快捷键，只在非输入元素时执行
        event.preventDefault();
        handler(event);
      }
    }
  }

  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.shortcuts.clear();
  }
}

/**
 * 平滑滚动到元素
 * @param {HTMLElement} element - 目标元素
 * @param {Object} options - 滚动选项
 */
export function smoothScrollTo(element, options = {}) {
  const defaultOptions = {
    behavior: 'smooth',
    block: 'start',
    inline: 'nearest',
  };
  element.scrollIntoView({ ...defaultOptions, ...options });
}

/**
 * 数字输入增强 - 添加鼠标滚轮支持
 * @param {HTMLInputElement} input - 输入元素
 * @param {Object} options - 选项 { step, min, max, onchange }
 */
export function enhanceNumberInput(input, options = {}) {
  const step = options.step || parseFloat(input.step) || 1;
  const min = options.min ?? parseFloat(input.min) ?? -Infinity;
  const max = options.max ?? parseFloat(input.max) ?? Infinity;

  const handleWheel = (event) => {
    if (document.activeElement !== input) return;

    event.preventDefault();
    const delta = event.deltaY > 0 ? -step : step;
    const currentValue = parseFloat(input.value) || 0;
    const newValue = Math.min(max, Math.max(min, currentValue + delta));
    input.value = newValue;

    if (options.onchange) {
      options.onchange(newValue);
    } else {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  input.addEventListener('wheel', handleWheel, { passive: false });

  return () => input.removeEventListener('wheel', handleWheel);
}
