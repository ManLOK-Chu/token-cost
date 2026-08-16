// 状态管理模块 - 用于撤销/重做和历史记录

/**
 * 状态管理器 - 支持撤销/重做功能
 */
export class StateManager {
  constructor(maxHistory = 20) {
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * 保存当前状态
   * @param {Object} state - 状态对象
   */
  push(state) {
    // 如果不在最新位置，删除后面的历史
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // 添加新状态
    this.history.push(JSON.parse(JSON.stringify(state)));

    // 限制历史记录数量
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  /**
   * 撤销到上一个状态
   * @returns {Object|null} 上一个状态，如果没有则返回 null
   */
  undo() {
    if (!this.canUndo()) return null;
    this.currentIndex--;
    return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
  }

  /**
   * 重做到下一个状态
   * @returns {Object|null} 下一个状态，如果没有则返回 null
   */
  redo() {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
  }

  /**
   * 是否可以撤销
   * @returns {boolean}
   */
  canUndo() {
    return this.currentIndex > 0;
  }

  /**
   * 是否可以重做
   * @returns {boolean}
   */
  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * 获取当前状态
   * @returns {Object|null}
   */
  getCurrentState() {
    if (this.currentIndex < 0) return null;
    return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
  }

  /**
   * 清空历史
   */
  clear() {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * 获取历史记录数量
   * @returns {number}
   */
  getHistorySize() {
    return this.history.length;
  }
}

/**
 * 历史记录管理器 - 保存最近的配置
 */
export class HistoryManager {
  constructor(maxItems = 5, storageKey = 'calculator-history') {
    this.maxItems = maxItems;
    this.storageKey = storageKey;
    this.items = this.load();
  }

  /**
   * 添加历史记录
   * @param {Object} state - 状态对象
   * @param {string} label - 记录标签
   */
  add(state, label = null) {
    const timestamp = new Date().toISOString();
    const item = {
      state: JSON.parse(JSON.stringify(state)),
      label: label || this.generateLabel(state),
      timestamp,
      id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
    };

    // 检查是否与最近一条重复
    if (this.items.length > 0) {
      const last = this.items[0];
      if (this.areStatesEqual(last.state, state)) {
        return; // 不添加重复项
      }
    }

    // 添加到开头
    this.items.unshift(item);

    // 限制数量
    if (this.items.length > this.maxItems) {
      this.items = this.items.slice(0, this.maxItems);
    }

    this.save();
  }

  /**
   * 获取所有历史记录
   * @returns {Array}
   */
  getAll() {
    return [...this.items];
  }

  /**
   * 根据 ID 获取历史记录
   * @param {string} id - 记录 ID
   * @returns {Object|null}
   */
  getById(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  /**
   * 删除历史记录
   * @param {string} id - 记录 ID
   */
  remove(id) {
    this.items = this.items.filter((item) => item.id !== id);
    this.save();
  }

  /**
   * 清空历史记录
   */
  clear() {
    this.items = [];
    this.save();
  }

  /**
   * 生成标签
   * @param {Object} state - 状态对象
   * @returns {string}
   */
  generateLabel(state) {
    const preset = state.pricingPreset || 'custom';
    const total = (state.tokensNew || 0) + (state.tokensOut || 0) +
                  (state.tokensHit || 0) + (state.tokensCreate || 0);
    const totalM = (total / 1000000).toFixed(1);
    return `${preset} · ${totalM}M tokens`;
  }

  /**
   * 比较两个状态是否相等
   * @param {Object} state1
   * @param {Object} state2
   * @returns {boolean}
   */
  areStatesEqual(state1, state2) {
    const keys = ['tokensNew', 'tokensOut', 'tokensHit', 'tokensCreate',
                  'multiplier', 'pricingPreset'];
    return keys.every((key) => state1[key] === state2[key]);
  }

  /**
   * 从 localStorage 加载
   * @returns {Array}
   */
  load() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('加载历史记录失败:', error);
      return [];
    }
  }

  /**
   * 保存到 localStorage
   */
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    } catch (error) {
      console.error('保存历史记录失败:', error);
    }
  }
}

/**
 * URL 状态管理器 - 将状态编码到 URL
 */
export class URLStateManager {
  /**
   * 将状态编码到 URL
   * @param {Object} state - 状态对象
   * @returns {string} 包含状态的完整 URL
   */
  static encodeState(state) {
    const params = new URLSearchParams();

    // 只编码核心字段
    const fields = {
      preset: state.pricingPreset,
      new: state.tokensNew,
      out: state.tokensOut,
      hit: state.tokensHit,
      create: state.tokensCreate,
      mult: state.multiplier,
    };

    // 只添加非默认值
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value);
      }
    });

    const baseUrl = window.location.origin + window.location.pathname;
    return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  }

  /**
   * 从 URL 解码状态
   * @returns {Object|null} 解码的状态对象，如果没有则返回 null
   */
  static decodeState() {
    const params = new URLSearchParams(window.location.search);

    if (params.toString() === '') return null;

    const state = {};

    // 解码字段
    const mapping = {
      preset: 'pricingPreset',
      new: 'tokensNew',
      out: 'tokensOut',
      hit: 'tokensHit',
      create: 'tokensCreate',
      mult: 'multiplier',
    };

    Object.entries(mapping).forEach(([paramKey, stateKey]) => {
      const value = params.get(paramKey);
      if (value !== null) {
        // token 和 multiplier 字段转为数字
        if (stateKey !== 'pricingPreset') {
          const num = Number(value);
          if (Number.isFinite(num)) {
            state[stateKey] = num;
          }
        } else {
          state[stateKey] = value;
        }
      }
    });

    return Object.keys(state).length > 0 ? state : null;
  }

  /**
   * 更新 URL 而不刷新页面
   * @param {Object} state - 状态对象
   */
  static updateURL(state) {
    const url = this.encodeState(state);
    window.history.replaceState(null, '', url);
  }

  /**
   * 清空 URL 参数
   */
  static clearURL() {
    const baseUrl = window.location.origin + window.location.pathname;
    window.history.replaceState(null, '', baseUrl);
  }

  /**
   * 复制分享链接到剪贴板
   * @param {Object} state - 状态对象
   * @returns {Promise<boolean>} 是否成功
   */
  static async copyShareLink(state) {
    const url = this.encodeState(state);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      } else {
        // 降级方案
        const input = document.createElement('input');
        input.value = url;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const success = document.execCommand('copy');
        document.body.removeChild(input);
        return success;
      }
    } catch (error) {
      console.error('复制失败:', error);
      return false;
    }
  }
}
