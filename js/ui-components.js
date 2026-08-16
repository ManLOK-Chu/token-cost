// UI 组件模块 - 历史记录、分享等

import { $ } from './dom.js';

/**
 * Toast 通知组件
 */
export class Toast {
  static container = null;

  /**
   * 显示通知
   * @param {string} message - 消息内容
   * @param {Object} options - 选项
   */
  static show(message, options = {}) {
    const {
      type = 'info', // info, success, error, warning
      duration = 3000,
      position = 'top-right', // top-right, top-center, bottom-right, bottom-center
    } = options;

    // 确保容器存在
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.dataset.position = position;
      document.body.appendChild(this.container);
    }

    // 创建 toast 元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = this.getIcon(type);
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
    `;

    this.container.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        this.hide(toast);
      }, duration);
    }

    return toast;
  }

  /**
   * 隐藏通知
   * @param {HTMLElement} toast - Toast 元素
   */
  static hide(toast) {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }

  /**
   * 获取图标
   * @param {string} type - 类型
   * @returns {string}
   */
  static getIcon(type) {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
    };
    return icons[type] || icons.info;
  }

  /**
   * 转义 HTML
   * @param {string} text - 文本
   * @returns {string}
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * 确认对话框组件
 */
export class ConfirmDialog {
  /**
   * 显示确认对话框
   * @param {Object} options - 选项
   * @returns {Promise<boolean>}
   */
  static show(options = {}) {
    const {
      title = '确认',
      message = '确定要继续吗？',
      confirmText = '确定',
      cancelText = '取消',
      type = 'default', // default, warning, danger
    } = options;

    return new Promise((resolve) => {
      // 创建遮罩
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      // 创建对话框
      const dialog = document.createElement('div');
      dialog.className = `confirm-dialog confirm-dialog-${type}`;
      dialog.innerHTML = `
        <div class="confirm-header">
          <h3 class="confirm-title">${this.escapeHtml(title)}</h3>
        </div>
        <div class="confirm-body">
          <p class="confirm-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="confirm-footer">
          <button class="confirm-btn confirm-btn-cancel">${this.escapeHtml(cancelText)}</button>
          <button class="confirm-btn confirm-btn-confirm">${this.escapeHtml(confirmText)}</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // 触发动画
      requestAnimationFrame(() => {
        overlay.classList.add('confirm-show');
      });

      // 按钮事件
      const btnConfirm = dialog.querySelector('.confirm-btn-confirm');
      const btnCancel = dialog.querySelector('.confirm-btn-cancel');

      const close = (result) => {
        overlay.classList.remove('confirm-show');
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 200);
        resolve(result);
      };

      btnConfirm.addEventListener('click', () => close(true));
      btnCancel.addEventListener('click', () => close(false));

      // 点击遮罩关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          close(false);
        }
      });

      // ESC 键关闭
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          close(false);
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }

  /**
   * 转义 HTML
   * @param {string} text - 文本
   * @returns {string}
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * 历史记录面板组件
 */
export class HistoryPanel {
  /**
   * 创建历史记录面板
   * @param {Object} options - 选项
   */
  constructor(options = {}) {
    this.options = {
      containerId: 'historyPanel',
      onLoad: null,
      onDelete: null,
      ...options,
    };

    this.panel = null;
    this.overlay = null;
  }

  /**
   * 显示面板
   * @param {Array} items - 历史记录项
   */
  show(items) {
    // 创建遮罩
    this.overlay = document.createElement('div');
    this.overlay.className = 'history-overlay';

    // 创建面板
    this.panel = document.createElement('div');
    this.panel.className = 'history-panel';
    this.panel.innerHTML = `
      <div class="history-header">
        <h3 class="history-title">历史记录</h3>
        <button class="history-close" aria-label="关闭">×</button>
      </div>
      <div class="history-body" id="historyList"></div>
      <div class="history-footer">
        <button class="history-clear-all">清空历史</button>
      </div>
    `;

    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);

    // 渲染列表
    this.renderList(items);

    // 绑定事件
    this.bindEvents();

    // 触发动画
    requestAnimationFrame(() => {
      this.overlay.classList.add('history-show');
    });
  }

  /**
   * 渲染列表
   * @param {Array} items - 历史记录项
   */
  renderList(items) {
    const list = this.panel.querySelector('#historyList');

    if (items.length === 0) {
      list.innerHTML = '<div class="history-empty">暂无历史记录</div>';
      return;
    }

    list.innerHTML = items.map((item) => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-header">
          <span class="history-item-label">${this.escapeHtml(item.label)}</span>
          <button class="history-item-delete" data-id="${item.id}" aria-label="删除">🗑️</button>
        </div>
        <div class="history-item-time">${this.formatTime(item.timestamp)}</div>
        <button class="history-item-load" data-id="${item.id}">加载此配置</button>
      </div>
    `).join('');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 关闭按钮
    const closeBtn = this.panel.querySelector('.history-close');
    closeBtn.addEventListener('click', () => this.hide());

    // 点击遮罩关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    // 加载按钮
    this.panel.addEventListener('click', (e) => {
      if (e.target.classList.contains('history-item-load')) {
        const id = e.target.dataset.id;
        if (this.options.onLoad) {
          this.options.onLoad(id);
        }
        this.hide();
      }
    });

    // 删除按钮
    this.panel.addEventListener('click', (e) => {
      if (e.target.classList.contains('history-item-delete')) {
        const id = e.target.dataset.id;
        if (this.options.onDelete) {
          this.options.onDelete(id);
        }
      }
    });

    // 清空所有
    const clearAllBtn = this.panel.querySelector('.history-clear-all');
    clearAllBtn.addEventListener('click', async () => {
      const confirmed = await ConfirmDialog.show({
        title: '清空历史记录',
        message: '确定要清空所有历史记录吗？此操作无法撤销。',
        type: 'danger',
        confirmText: '清空',
        cancelText: '取消',
      });

      if (confirmed && this.options.onDelete) {
        this.options.onDelete('all');
        this.hide();
      }
    });

    // ESC 键关闭
    this.handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    };
    document.addEventListener('keydown', this.handleEscape);
  }

  /**
   * 隐藏面板
   */
  hide() {
    if (!this.overlay) return;

    this.overlay.classList.remove('history-show');

    setTimeout(() => {
      if (this.overlay && this.overlay.parentElement) {
        document.body.removeChild(this.overlay);
      }
      if (this.handleEscape) {
        document.removeEventListener('keydown', this.handleEscape);
      }
    }, 200);
  }

  /**
   * 格式化时间
   * @param {string} timestamp - ISO 时间戳
   * @returns {string}
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return `${Math.floor(diff / minute)} 分钟前`;
    } else if (diff < day) {
      return `${Math.floor(diff / hour)} 小时前`;
    } else if (diff < 7 * day) {
      return `${Math.floor(diff / day)} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  /**
   * 转义 HTML
   * @param {string} text - 文本
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
