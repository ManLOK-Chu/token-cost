// 数字格式化模块 - 千分位分隔符支持

/**
 * 数字输入格式化器
 */
export class NumberFormatter {
  /**
   * 格式化数字为带千分位分隔符的字符串
   * @param {number|string} value - 数字值
   * @param {Object} options - 格式化选项
   * @returns {string}
   */
  static format(value, options = {}) {
    const {
      decimals = 0,
      locale = 'en-US',
      fallback = '',
    } = options;

    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (!Number.isFinite(num)) {
      return fallback;
    }

    return num.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * 解析格式化的字符串为数字
   * @param {string} value - 格式化的字符串
   * @returns {number}
   */
  static parse(value) {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    // 移除千分位分隔符（逗号和空格）
    const cleaned = String(value).replace(/[,\s]/g, '');
    const num = Number(cleaned);

    return Number.isFinite(num) && num >= 0 ? num : 0;
  }

  /**
   * 为输入框添加自动格式化
   * @param {HTMLInputElement} input - 输入框元素
   * @param {Object} options - 格式化选项
   * @returns {Function} 清理函数
   */
  static applyToInput(input, options = {}) {
    const {
      formatOnBlur = true,
      allowNegative = false,
      maxValue = Infinity,
      minValue = 0,
    } = options;

    let isFormatted = false;

    const handleFocus = () => {
      if (isFormatted) {
        // 移除格式，显示原始数字
        const value = this.parse(input.value);
        input.value = value === 0 ? '' : String(value);
        isFormatted = false;
      }
    };

    const handleBlur = () => {
      if (formatOnBlur && input.value !== '') {
        // 应用格式
        let value = this.parse(input.value);

        // 应用范围限制
        value = Math.max(minValue, Math.min(maxValue, value));

        input.value = this.format(value, { decimals: 0 });
        isFormatted = true;

        // 触发 change 事件
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const handleInput = (event) => {
      // 在输入时移除非数字字符（允许的除外）
      let value = input.value;
      const cursorPos = input.selectionStart;

      // 只保留数字和小数点
      const cleaned = value.replace(/[^\d.-]/g, '');

      if (cleaned !== value) {
        input.value = cleaned;
        // 尝试保持光标位置
        const offset = value.length - cleaned.length;
        input.setSelectionRange(cursorPos - offset, cursorPos - offset);
      }
    };

    input.addEventListener('focus', handleFocus);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('input', handleInput);

    // 如果输入框已有值，格式化它
    if (input.value !== '') {
      const value = this.parse(input.value);
      input.value = this.format(value, { decimals: 0 });
      isFormatted = true;
    }

    // 返回清理函数
    return () => {
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('input', handleInput);
    };
  }

  /**
   * 批量应用格式化到多个输入框
   * @param {Array<HTMLInputElement>} inputs - 输入框数组
   * @param {Object} options - 格式化选项
   * @returns {Function} 清理函数
   */
  static applyToInputs(inputs, options = {}) {
    const cleanupFns = inputs.map((input) => this.applyToInput(input, options));

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }
}

/**
 * 实时数字格式化显示组件
 */
export class FormattedNumberDisplay {
  /**
   * 创建格式化数字显示
   * @param {HTMLInputElement} input - 输入框
   * @param {HTMLElement} display - 显示元素
   * @param {Object} options - 选项
   */
  constructor(input, display, options = {}) {
    this.input = input;
    this.display = display;
    this.options = {
      prefix: '',
      suffix: '',
      decimals: 0,
      ...options,
    };

    this.update = this.update.bind(this);
    this.input.addEventListener('input', this.update);
    this.update();
  }

  /**
   * 更新显示
   */
  update() {
    const value = NumberFormatter.parse(this.input.value);
    const formatted = NumberFormatter.format(value, {
      decimals: this.options.decimals,
    });

    this.display.textContent = `${this.options.prefix}${formatted}${this.options.suffix}`;
  }

  /**
   * 销毁
   */
  destroy() {
    this.input.removeEventListener('input', this.update);
  }
}

/**
 * 智能数字输入组件 - 支持单位缩写
 */
export class SmartNumberInput {
  /**
   * 解析带单位的输入（如 "1.5M", "500K"）
   * @param {string} value - 输入值
   * @returns {number}
   */
  static parseWithUnit(value) {
    if (!value || value === '') return 0;

    const str = String(value).trim().toUpperCase();
    const multipliers = {
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
      万: 10_000,
      亿: 100_000_000,
    };

    // 检查是否有单位后缀
    const lastChar = str.charAt(str.length - 1);
    const multiplier = multipliers[lastChar];

    if (multiplier) {
      // 解析数字部分
      const numStr = str.slice(0, -1);
      const num = parseFloat(numStr);

      if (Number.isFinite(num)) {
        return Math.floor(num * multiplier);
      }
    }

    // 没有单位，直接解析
    return NumberFormatter.parse(str);
  }

  /**
   * 为输入框添加单位解析支持
   * @param {HTMLInputElement} input - 输入框
   * @returns {Function} 清理函数
   */
  static applyToInput(input) {
    const handleBlur = () => {
      const rawValue = input.value;
      if (rawValue === '') return;

      const parsed = this.parseWithUnit(rawValue);
      input.value = String(parsed);

      // 触发 input 事件以更新计算
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    input.addEventListener('blur', handleBlur);

    // 添加 placeholder 提示
    const originalPlaceholder = input.placeholder;
    input.placeholder = originalPlaceholder || '支持 1M, 500K 等';

    return () => {
      input.removeEventListener('blur', handleBlur);
      input.placeholder = originalPlaceholder;
    };
  }
}
