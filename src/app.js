/**
 * src/app.js — Thin orchestrator
 *
 * Loads modules in order: router → store → actions → render → here.
 * Binds events, wires up the i18n system, and exposes backward-compat globals.
 */

(function () {
  'use strict';

  /* ==============================================================
     i18n (kept here since it drives DOM text content directly)
  ============================================================== */
  var I18N = {
    zh: {
      title: 'JSON 格式化工具', logoText: 'JSON 格式化工具', mobTitle: 'JSON工具',
      more: '更多', format: '格式化', minify: '压缩', escape: '转义',
      copy: '复制', download: '下载', downloadFile: '下载文件',
      upload: '上传', save: '保存', openFile: '打开文件',
      clear: '清空', clearContent: '清空', input: '输入', output: '输出',
      dropHint: '释放以加载文件',
      outputPlaceholder: '格式化后的 JSON 将显示在这里',
      history: '历史记录', compare: '对比', swap: '交换', close: '关闭',
      moreOps: '更多操作', cancelMore: '取消',
      statusReady: '就绪',
      statusShortcuts: 'Ctrl+Enter 格式化 · Ctrl+S 保存 · Ctrl+D 下载 · Ctrl+F 搜索',
      saveModalTitle: '保存到历史记录', saveNamePlaceholder: '输入记录名称（可选）',
      cancel: '取消',
      compareTitle: 'JSON 对比', compareLoading: '正在比对…',
      themeTitle: '切换暗色/亮色模式',
      formatTitle: '格式化 JSON (Ctrl+Enter)', minifyTitle: '压缩 JSON',
      escapeTitle: 'JSON 转义', copyTitle: '复制结果',
      downloadTitle: '下载 JSON 文件 (Ctrl+D)', uploadTitle: '上传 JSON 文件',
      saveTitle: '保存到历史 (Ctrl+S)', clearTitle: '清空',
      searchTitle: '在输出中搜索 (Ctrl+F)',
      searchPlaceholder: '搜索…', searchPrev: '上一个 (Shift+Enter)',
      searchNext: '下一个 (Enter)', searchClose: '关闭搜索',
      collapseSidebar: '收起侧栏', clearAllTitle: '清空所有历史',
      expandSidebar: '展开侧栏',
      inputPlaceholder: '在此粘贴 JSON 文本',
      listTitle: '列表 ({count})', collapseList: '收起列表', expandList: '展开列表',
      emptyArray: '空数组',
      items: '{count} 项', keys: '{count} 键',
      loadingFile: '已加载 {name}', saved: '已保存：{name}',
      copied: '已复制到剪贴板', copyFailed: '复制失败，请重试',
      nothingToCopy: '没有可复制的内容',
      nothingToDownload: '没有可下载的内容',
      downloaded: '已下载 JSON 文件', downloadFailed: '下载失败，请重试',
      inputEmpty: '输入为空', inputEmptyToast: '请先输入 JSON',
      formatSuccess: '格式化成功', minifySuccess: '压缩成功',
      escapeSuccess: 'JSON 转义成功',
      jsonError: 'JSON 格式错误', cleared: '已清空', historyCleared: '历史已清空',
      loaded: '已加载：{name}', jsonOnly: '请拖入 .json 文件',
      needFormatFirst: '请先格式化有效的 JSON',
      unnamed: '未命名', noHistory: '暂无历史记录', noHistoryHint: '格式化后保存即可',
      selectForCompare: '选中用于对比', deleteItem: '删除',
      autoQuoteId: '（已自动为标识符添加引号）',
      autoBracket: '（已自动补全括号）',
      autoBracketNotification: '原始 JSON 缺失部分括号，已自动补全',
      unquotedIdHint: 'JSON 中的键名和字符串值必须用双引号包裹',
      jsonIncomplete: 'JSON 不完整，可能缺少闭合的括号、逗号或值',
      jsonSyntaxError: 'JSON 语法错误：{msg}',
      stringMisplaced: 'JSON 字符串位置不当，检查是否缺少逗号或括号',
      numberError: '数字格式错误或位置不当',
      unquotedIdDetected: '检测到未加引号的标识符 "{id}"',
      errorTitle: 'JSON 格式错误', nearLine: '第 {line} 行附近',
      jsonRules: 'JSON 语法规则：',
      ruleKeys: '键名和字符串值必须用双引号（"）包裹',
      ruleComma: '对象和数组的最后一个元素后不能有逗号',
      ruleBool: '布尔值只能为 true 或 false（小写）',
      ruleNull: 'null 必须为小写',
      ruleBracket: '括号和花括号必须成对出现',
      valid: '有效', invalid: '无效', lineCount: '行',
      settings: '设置', settingsTitle: '界面设置',
      watermarkLabel: '水印文字', watermarkPlaceholder: '输入水印文字（留空则不显示）',
      watermarkOpacity: '水印透明度', watermarkEnabled: '启用水印',
      bgImageLabel: '背景图片', bgImageHint: '支持 JPG/PNG，建议 ≤ 2MB',
      bgImageUpload: '选择图片', bgImageClear: '清除图片',
      bgImageOpacity: '背景透明度', settingsSaved: '设置已保存', resetSettings: '恢复默认',
    },
    en: {
      title: 'JSON Formatter', logoText: 'JSON Formatter', mobTitle: 'JSON Tool',
      more: 'More', format: 'Format', minify: 'Minify', escape: 'Escape',
      copy: 'Copy', download: 'Download', downloadFile: 'Download',
      upload: 'Upload', save: 'Save', openFile: 'Open File',
      clear: 'Clear', clearContent: 'Clear', input: 'Input', output: 'Output',
      dropHint: 'Drop to load file',
      outputPlaceholder: 'Formatted JSON will appear here',
      history: 'History', compare: 'Compare', swap: 'Swap', close: 'Close',
      moreOps: 'More Actions', cancelMore: 'Cancel',
      statusReady: 'Ready',
      statusShortcuts: 'Ctrl+Enter Format · Ctrl+S Save · Ctrl+D Download · Ctrl+F Search',
      saveModalTitle: 'Save to History', saveNamePlaceholder: 'Enter name (optional)',
      cancel: 'Cancel',
      compareTitle: 'JSON Compare', compareLoading: 'Comparing…',
      themeTitle: 'Toggle dark/light mode',
      formatTitle: 'Format JSON (Ctrl+Enter)', minifyTitle: 'Minify JSON',
      escapeTitle: 'Escape JSON', copyTitle: 'Copy result',
      downloadTitle: 'Download JSON file (Ctrl+D)', uploadTitle: 'Upload JSON file',
      saveTitle: 'Save to history (Ctrl+S)', clearTitle: 'Clear',
      searchTitle: 'Search in output (Ctrl+F)',
      searchPlaceholder: 'Search…', searchPrev: 'Previous (Shift+Enter)',
      searchNext: 'Next (Enter)', searchClose: 'Close search',
      collapseSidebar: 'Collapse sidebar', clearAllTitle: 'Clear all history',
      expandSidebar: 'Expand sidebar',
      inputPlaceholder: 'Paste JSON text here',
      listTitle: 'List ({count})', collapseList: 'Collapse list', expandList: 'Expand list',
      emptyArray: 'Empty array',
      items: '{count} items', keys: '{count} keys',
      loadingFile: 'Loaded {name}', saved: 'Saved: {name}',
      copied: 'Copied to clipboard', copyFailed: 'Copy failed, please try again',
      nothingToCopy: 'Nothing to copy',
      nothingToDownload: 'Nothing to download',
      downloaded: 'JSON file downloaded', downloadFailed: 'Download failed, please try again',
      inputEmpty: 'Input is empty', inputEmptyToast: 'Please enter JSON first',
      formatSuccess: 'Formatted successfully', minifySuccess: 'Minified successfully',
      escapeSuccess: 'JSON escaped successfully',
      jsonError: 'Invalid JSON format', cleared: 'Cleared', historyCleared: 'History cleared',
      loaded: 'Loaded: {name}', jsonOnly: 'Please drop .json files only',
      needFormatFirst: 'Please format valid JSON first',
      unnamed: 'Untitled', noHistory: 'No history yet', noHistoryHint: 'Format and save to see history',
      selectForCompare: 'Select to compare', deleteItem: 'Delete',
      autoQuoteId: ' (auto-quoted identifier)',
      autoBracket: ' (auto-closed brackets)',
      autoBracketNotification: 'Some brackets were missing and have been auto-closed',
      unquotedIdHint: 'JSON keys and string values must be wrapped in double quotes',
      jsonIncomplete: 'JSON is incomplete, possibly missing closing brackets, commas, or values',
      jsonSyntaxError: 'JSON syntax error: {msg}',
      stringMisplaced: 'JSON string in wrong position, check for missing commas or brackets',
      numberError: 'Number format error or misplaced number',
      unquotedIdDetected: 'Detected unquoted identifier "{id}"',
      errorTitle: 'Invalid JSON', nearLine: 'Near line {line}',
      jsonRules: 'JSON syntax rules:',
      ruleKeys: 'Keys and string values must be wrapped in double quotes (")',
      ruleComma: 'No trailing comma after the last element in objects/arrays',
      ruleBool: 'Boolean values must be true or false (lowercase)',
      ruleNull: 'null must be lowercase',
      ruleBracket: 'Brackets and braces must be paired',
      valid: 'Valid', invalid: 'Invalid', lineCount: 'lines',
      settings: 'Settings', settingsTitle: 'Interface Settings',
      watermarkLabel: 'Watermark Text', watermarkPlaceholder: 'Enter watermark text (empty to disable)',
      watermarkOpacity: 'Watermark Opacity', watermarkEnabled: 'Enable Watermark',
      bgImageLabel: 'Background Image', bgImageHint: 'JPG/PNG supported, recommended ≤ 2MB',
      bgImageUpload: 'Choose Image', bgImageClear: 'Clear Image',
      bgImageOpacity: 'Background Opacity', settingsSaved: 'Settings saved', resetSettings: 'Reset to Default',
    }
  };

  var i18n = {
    _lang: (window.__store && window.__store.getStateForKey('lang')) || localStorage.getItem('appLang') || 'en',
    t: function (key, vars) {
      var s = I18N[this._lang][key] || I18N['en'][key] || key;
      if (vars) {
        Object.entries(vars).forEach(function (entry) {
          s = s.replace(new RegExp('\\{' + entry[0] + '\\}', 'g'), entry[1]);
        });
      }
      return s;
    },
    setLang: function (lang) {
      this._lang = lang;
      localStorage.setItem('appLang', lang);
      if (window.__store) window.__store.persistLang(lang);
      applyAllTranslations();
    },
    get lang() { return this._lang; }
  };
  window.i18n = i18n;

  function applyAllTranslations() {
    document.title = i18n.t('title');
    document.documentElement.lang = i18n._lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = i18n.t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', i18n.t(key));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', i18n.t(key).replace(/\\n/g, '\n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = i18n.t(key);
    });
    var langBtn = document.getElementById('lang-btn');
    if (langBtn) langBtn.textContent = i18n._lang === 'zh' ? 'EN' : '中';
    var mobLangBtn = document.getElementById('mobile-lang-btn');
    if (mobLangBtn) mobLangBtn.textContent = i18n._lang === 'zh' ? 'EN' : '中';
    var mobLangLabel = document.getElementById('mobile-lang-label');
    if (mobLangLabel) mobLangLabel.textContent = i18n._lang === 'zh' ? '中' : 'EN';
    if (window.__render && window.__render.rerenderDynamicContent) {
      window.__render.rerenderDynamicContent();
    }
  }

  /* ==============================================================
     Event binding (thin: delegates to __render)
  ============================================================== */
  function _bindEventListeners() {
    var render = window.__render;
    if (!render) return;

    var actions = {
      '[data-action="format"]': render.formatFromInput,
      '[data-action="minify"]': render.minifyFromInput,
      '[data-action="stringify"]': render.stringifyFromInput,
      '[data-action="copy"]': render.handleCopy,
      '[data-action="download"]': render.handleDownload,
      '[data-action="upload"]': function () {
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,.txt,application/json,text/plain';
        fileInput.onchange = function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            var input = document.getElementById('input');
            if (input) {
              input.value = String(reader.result);
              input.dispatchEvent(new Event('input'));
            }
            if (render.formatFromInput) render.formatFromInput();
            if (typeof render.handleCopy === 'function') {
              // show loaded toast via render's showToast
            }
            var toast = document.getElementById('toast');
            if (toast) {
              // 用 render.showToast 展示(内部对 msg 做 escapeHtml, 防文件名的 XSS)
              if (render.showToast) render.showToast(i18n.t('loaded', { name: file.name }), 2000, 'icon-folder-open');
              else {
                toast.innerHTML = '<svg aria-hidden="true" class="svg-icon-sm" viewBox="0 0 24 24"><use href="#icon-folder-open"/></svg>' + i18n.t('loaded', { name: file.name });
                toast.classList.add('show');
                setTimeout(function () { toast.classList.remove('show'); }, 2000);
              }
            }
          };
          reader.readAsText(file);
        };
        fileInput.click();
      },
      '[data-action="save"]': render.saveHistoryFromOutput,
      '[data-action="clear"]': render.handleClear,
      '[data-action="toggle-theme"]': render.handleToggleTheme,
      '[data-action="toggle-search"]': render.toggleSearch,
      '[data-action="toggle-sidebar"]': render.toggleSidebar,
      '[data-action="toggle-mobile-more"]': render.toggleMobileMore,
      '[data-action="compare"]': render.handleCompare,
      '[data-action="clear-history"]': render.handleClearHistory,
      '[data-action="close-save-modal"]': render.closeSaveModal,
      '[data-action="confirm-save"]': render.confirmSaveFromModal,
      '[data-action="reverse-compare"]': function () {
        if (render.reverseCompare) render.reverseCompare();
      },
      '[data-action="close-compare"]': render.closeCompare,
      '[data-action="open-save-modal"]': render.openSaveModal,
      '[data-action="open-settings"]': render.openSettings,
      '[data-action="close-settings"]': render.closeSettings,
      '[data-action="pick-bg-image"]': render.pickBackgroundImage,
      '[data-action="clear-bg-image"]': render.clearBackgroundImage,
      '[data-action="reset-settings"]': render.resetAllSettings,
    };
    for (var selector in actions) {
      if (actions.hasOwnProperty(selector)) {
        // 契约检查: handler 必须是函数, 否则 fail fast 而不是静默丢失点击
        if (typeof actions[selector] !== 'function') {
          console.error('[app] data-action handler missing for ' + selector +
            ' — 检查 window.__render 导出列表是否删掉了对应函数');
          continue;
        }
        document.querySelectorAll(selector).forEach(function (el) {
          el.addEventListener('click', actions[selector]);
        });
      }
    }

    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { render.switchMobileTab(tab.dataset.tab); });
    });

    var langBtn = document.getElementById('lang-btn');
    if (langBtn) langBtn.addEventListener('click', function () {
      i18n.setLang(i18n._lang === 'zh' ? 'en' : 'zh');
    });
    var mobLangBtn = document.getElementById('mobile-lang-btn');
    if (mobLangBtn) mobLangBtn.addEventListener('click', function () {
      i18n.setLang(i18n._lang === 'zh' ? 'en' : 'zh');
    });

    // Settings modal live preview
    var wmText = document.getElementById('watermark-text-input');
    var wmOpacity = document.getElementById('watermark-opacity-input');
    var bgOpacity = document.getElementById('bg-image-opacity-input');
    if (wmText) wmText.addEventListener('input', render.commitSettingsFromForm);
    if (wmOpacity) wmOpacity.addEventListener('input', render.commitSettingsFromForm);
    if (bgOpacity) bgOpacity.addEventListener('input', render.commitSettingsFromForm);
    var bgFile = document.getElementById('bg-image-file');
    if (bgFile) bgFile.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      render.handleBackgroundImageFile(f);
      e.target.value = '';
    });
    var settingsModal = document.getElementById('settings-modal');
    if (settingsModal) settingsModal.addEventListener('click', function (e) {
      if (e.target === settingsModal) render.closeSettings();
    });
    var saveModal = document.getElementById('save-modal');
    if (saveModal) saveModal.addEventListener('click', function (e) {
      if (e.target === saveModal) render.closeSaveModal();
    });
  }

  /* ==============================================================
     Backward-compat globals (for Tauri / external scripts)
  ============================================================== */
  function _exposeGlobals() {
    var render = window.__render;
    if (!render) return;
    var globals = {
      formatJSON: render.formatFromInput,
      minifyJSON: render.minifyFromInput,
      stringifyJSON: render.stringifyFromInput,
      copyOutput: render.handleCopy,
      downloadJSON: render.handleDownload,
      clearContent: render.handleClear,
      toggleTheme: render.handleToggleTheme,
      toggleSidebar: render.toggleSidebar,
      toggleMobileMore: render.toggleMobileMore,
      switchMobileTab: render.switchMobileTab,
      compareSelected: render.handleCompare,
      clearAllHistory: render.handleClearHistory,
      closeSaveModal: render.closeSaveModal,
      confirmSave: render.confirmSaveFromModal,
      reverseCompare: render.reverseCompare || function () {},
      closeCompare: render.closeCompare,
      openSaveModal: render.openSaveModal,
      openSettings: render.openSettings,
      closeSettings: render.closeSettings,
      pickBackgroundImage: render.pickBackgroundImage,
      clearBackgroundImage: render.clearBackgroundImage,
      resetAllSettings: render.resetAllSettings,
      loadHistory: function (id) {
        var hist = (window.__actions && window.__actions.getHistory()) || [];
        var item = hist.find(function (h) { return h.id === id; });
        if (!item) return;
        var input = document.getElementById('input');
        if (input) {
          input.value = item.content;
          input.dispatchEvent(new Event('input'));
        }
        if (render.formatFromInput) render.formatFromInput();
        if (window.__router && window.__router.isMobileDevice()) render.toggleSidebar();
        var toast = document.getElementById('toast');
        if (toast) {
          // 用 render.showToast 展示(内部 escapeHtml, 防历史名 XSS)
          if (render.showToast) render.showToast(i18n.t('loaded', { name: item.name }), 2000, 'icon-file-text');
          else {
            toast.innerHTML = '<svg aria-hidden="true" class="svg-icon-sm" viewBox="0 0 24 24"><use href="#icon-file-text"/></svg>' + i18n.t('loaded', { name: item.name });
            toast.classList.add('show');
            setTimeout(function () { toast.classList.remove('show'); }, 2000);
          }
        }
      },
      toggleSelect: function (id) {
        var sel = (window.__store && window.__store.getStateForKey('selectedIds')) || [];
        var newSel = (window.__actions && window.__actions.toggleSelect) ? window.__actions.toggleSelect(sel, id) : sel;
        if (window.__store) window.__store.setState({ selectedIds: newSel });
        if (render.renderHistory) render.renderHistory();
      },
      deleteHistory: function (id) {
        var history = (window.__actions && window.__actions.getHistory()) || [];
        var selectedIds = (window.__store && window.__store.getStateForKey('selectedIds')) || [];
        var result = (window.__actions && window.__actions.deleteHistory) ? window.__actions.deleteHistory(history, id, selectedIds) : { history: history, selectedIds: selectedIds };
        if (window.__actions && window.__actions.setHistory) window.__actions.setHistory(result.history);
        if (window.__store) window.__store.setState({ selectedIds: result.selectedIds });
        if (render.renderHistory) render.renderHistory();
      },
      toggleJsonNode: render.toggleJsonNode,
      toggleListPanel: render.toggleListPanel,
      selectListItem: render.selectListItem,
      openSearch: render.openSearch,
      closeSearch: render.closeSearch,
      toggleSearch: render.toggleSearch,
      performSearch: render.performSearch,
      nextMatch: render.nextMatch,
      prevMatch: render.prevMatch,
    };
    for (var name in globals) {
      if (globals.hasOwnProperty(name) && typeof window[name] === 'undefined') {
        window[name] = globals[name];
      }
    }
    // Persist selected state to window for any external code that reads it
    if (window.__store) {
      var state = window.__store.getState();
      window.selectedIds = state.selectedIds || [];
      window.compareOrder = state.compareOrder || [0, 1];
      window.lastFormattedContent = state.output || '';
      window.lastOutputLineCount = state.lastOutputLineCount || 0;
      window.lastParsedJson = state.outputParsed || null;
      window.listSelectedIndex = state.listSelectedIndex || 0;
      window.lastDetailContent = state.lastDetailContent || '';
    }
  }

  /* ==============================================================
     Init
  ============================================================== */
  window.addEventListener('DOMContentLoaded', function () {
    // Initialize router first (device detection)
    if (window.__router && window.__router.init) window.__router.init();

    // Initialize store with persisted values
    if (window.__store) {
      var persistedLang = localStorage.getItem('appLang') || 'en';
      var persistedTheme = localStorage.getItem('theme') || 'light';
      window.__store.persistLang(persistedLang);
      window.__store.persistTheme(persistedTheme);
    }

    _exposeGlobals();
    _bindEventListeners();

    // Initialize renderers (DOM operations, event delegation, etc.)
    if (window.__render && window.__render.init) window.__render.init();

    applyAllTranslations();
    if (window.__render && window.__render.handleToggleTheme) {
      // Apply persisted theme
      var theme = (window.__store && window.__store.getStateForKey('theme')) || persistedTheme;
      document.documentElement.setAttribute('data-theme', theme);
      var icon = document.getElementById('theme-icon');
      if (icon) {
        var use = icon.querySelector('use');
        if (use) use.setAttribute('href', theme === 'light' ? '#icon-moon' : '#icon-sun');
      }
      var mIconUse = document.getElementById('mobile-theme-icon-use');
      if (mIconUse) mIconUse.setAttribute('href', theme === 'light' ? '#icon-moon' : '#icon-sun');
      var d = document.getElementById('hljs-dark');
      var l = document.getElementById('hljs-light');
      if (d) d.disabled = theme === 'light';
      if (l) l.disabled = theme === 'dark';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0d1117');
    }

    // Render initial history
    if (window.__render && window.__render.renderHistory) window.__render.renderHistory();

    // Status bar
    var statusEl = document.getElementById('status-msg');
    if (statusEl) statusEl.textContent = i18n.t('statusReady');

    // Mobile theme icon + language label
    var themeIconUse = document.getElementById('mobile-theme-icon-use');
    if (themeIconUse) {
      var t = document.documentElement.getAttribute('data-theme') || 'dark';
      themeIconUse.setAttribute('href', t === 'light' ? '#icon-moon' : '#icon-sun');
    }
    var langLabel = document.getElementById('mobile-lang-label');
    if (langLabel) langLabel.textContent = i18n._lang === 'zh' ? '中' : 'EN';

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
          console.warn('SW registration failed:', err);
        });
      });
    }
  });
})();
