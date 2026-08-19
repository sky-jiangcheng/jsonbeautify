/**
 * src/app/router.js
 * Device detection abstraction — single source of truth for mobile/desktop.
 * Replaces all scattered `document.documentElement.getAttribute('data-device')` calls.
 */

(function () {
  'use strict';

  var _device = null;
  var _listeners = [];

  function detect() {
    try {
      var ua = navigator.userAgent || '';
      var isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
      var narrow = window.innerWidth <= 900;
      return (isMobileUA || (isTouch && narrow) || narrow) ? 'mobile' : 'desktop';
    } catch (e) {
      return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
    }
  }

  // 每次实时检测 (不缓存): 供 resize/orientationchange 时重新判定设备。
  // 之前用 getDevice() 缓存过一次就永远不变, 导致桌面窗口缩到手机宽度时
  // 仍然 data-device="desktop", 移动端控件完全不出现 / 点不动。
  function getDevice() {
    return detect();
  }

  function isMobileDevice() {
    return getDevice() === 'mobile';
  }

  function syncDeviceToDOM() {
    var d = document.documentElement;
    var current = d.getAttribute('data-device');
    var detected = detect();
    if (current !== detected) {
      d.setAttribute('data-device', detected);
      _device = detected;
      for (var i = 0; i < _listeners.length; i++) _listeners[i](detected);
    }
  }

  function onDeviceChange(fn) {
    _listeners.push(fn);
  }

  function init() {
    syncDeviceToDOM();
    window.addEventListener('resize', syncDeviceToDOM);
    window.addEventListener('orientationchange', function () {
      setTimeout(syncDeviceToDOM, 100);
    });
  }

  window.__router = { getDevice: getDevice, isMobileDevice: isMobileDevice, init: init };
})();

;
/**
 * src/app/store.js
 * Central state store with pub/sub. All app state lives here — no more
 * scattered window.* globals.
 */

(function () {
  'use strict';

  var _state = {
    input: '',
    output: '',
    outputType: 'empty',   // 'empty' | 'text' | 'json'
    outputFixed: false,
    outputParsed: null,
    lang: localStorage.getItem('appLang') || 'en',
    theme: localStorage.getItem('theme') || 'light',
    selectedIds: [],
    compareOrder: [0, 1],
    listSelectedIndex: 0,
    lastDetailContent: '',
    lastOutputLineCount: 0,
    searchOpen: false,
    searchQuery: '',
    searchMatches: [],
    searchIndex: -1,
    _listArr: null,
    _listArrStr: [],
    _lastRenderContent: '',
    _lastRenderType: 'empty',
    _lastRenderFixed: false,
    _lastRenderParsedObj: null,
    _compareScrollController: null,
  };

  var _subscribers = [];

  function getState() { return _state; }

  function setState(partial) {
    for (var key in partial) {
      if (partial.hasOwnProperty(key)) _state[key] = partial[key];
    }
    for (var i = 0; i < _subscribers.length; i++) _subscribers[i](_state);
  }

  function getStateForKey(key) { return _state[key]; }

  function subscribe(fn) {
    _subscribers.push(fn);
    // Immediately call with current state so renderer can do one-shot render
    fn(_state);
  }

  // Persistence helpers
  function persistLang(lang) {
    _state.lang = lang;
    localStorage.setItem('appLang', lang);
  }

  function persistTheme(theme) {
    _state.theme = theme;
    localStorage.setItem('theme', theme);
  }

  window.__store = { getState, setState, getStateForKey, subscribe, persistLang, persistTheme };
})();

;
/**
 * src/app/actions.js
 * Pure business-logic actions. No DOM manipulation.
 * Each action takes inputs, returns a result object.
 */

(function () {
  'use strict';

  /* ==============================================================
     Helpers (pure, no DOM)
  ============================================================== */
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('jsonHistory') || '[]');
    } catch (e) {
      try { localStorage.removeItem('jsonHistory'); } catch (_) {}
      return [];
    }
  }

  function setHistory(arr) {
    try {
      // 裁剪上限,避免超大历史撑爆 localStorage 配额
      if (Array.isArray(arr)) arr = arr.slice(0, 100);
      localStorage.setItem('jsonHistory', JSON.stringify(arr));
    } catch (e) {
      // 配额满/序列化失败时静默降级: 尝试只保留最近的 20 条再写一次
      console.warn('[actions] setHistory failed, trimming:', e);
      try {
        if (Array.isArray(arr)) arr = arr.slice(0, 20);
        localStorage.setItem('jsonHistory', JSON.stringify(arr));
      } catch (e2) {
        try { localStorage.removeItem('jsonHistory'); } catch (_) {}
      }
    }
  }

  /**
   * 自动修复未加引号的键名: `{key: 1}` → `{"key": 1}`。
   * 状态机扫描而非正则: 原正则不感知字符串边界, 会误改字符串内容里
   * 恰好出现的 `{key: ` 模式 (如 `{a: "x: {y: 1}"}` 会破坏字符串内容)。
   */
  function tryFixUnquotedKeys(input) {
    var out = '';
    var inString = false, escape = false;
    var i = 0;

    function isIdStart(c) { return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c === '_' || c === '$'; }
    function isIdChar(c) { return isIdStart(c) || c >= '0' && c <= '9'; }
    function isWs(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r'; }

    while (i < input.length) {
      var ch = input[i];

      // 字符串内部: 原样输出, 不做任何修复
      if (inString) {
        out += ch;
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        i++;
        continue;
      }
      if (ch === '"') { inString = true; out += ch; i++; continue; }

      // 非字符串: 仅在 `{` / `,` 后紧跟 空白? 标识符 空白? `:` 时补引号
      if (ch === '{' || ch === ',') {
        var j = i + 1;
        while (j < input.length && isWs(input[j])) j++;
        if (j < input.length && isIdStart(input[j])) {
          var k = j + 1;
          while (k < input.length && isIdChar(input[k])) k++;
          var m = k;
          while (m < input.length && isWs(input[m])) m++;
          if (m < input.length && input[m] === ':') {
            out += ch + input.slice(i + 1, j) + '"' + input.slice(j, k) + '"';
            i = m; // 跳到冒号, 后续字符原样处理
            continue;
          }
        }
      }

      out += ch;
      i++;
    }
    return out;
  }

  function tryFixJson(str) {
    var s = str.trim();
    var lc = 0, rc = 0, ls = 0, rs = 0;
    var inString = false, escape = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') lc++;
      else if (ch === '}') rc++;
      else if (ch === '[') ls++;
      else if (ch === ']') rs++;
    }
    var fixed = s, ok = false;
    while (lc > rc) { fixed += '}'; rc++; ok = true; }
    while (ls > rs) { fixed += ']'; rs++; ok = true; }
    return { success: ok, json: fixed };
  }

  function parseInput(value) {
    var jsonObj = null;
    var fixed = false;
    var fixMsg = '';
    var error = null;

    try {
      jsonObj = JSON.parse(value);
    } catch (err) {
      error = err;
      var v = value;
      var uq = tryFixUnquotedKeys(v);
      if (uq !== v) {
        try {
          jsonObj = JSON.parse(uq);
          fixed = true;
          fixMsg = 'autoQuoteId';
        } catch (e2) {}
      }
      if (!jsonObj) {
        const fixResult = tryFixJson(v);
        if (fixResult.success) {
          try {
            jsonObj = JSON.parse(fixResult.json);
            fixed = true;
            fixMsg = fixMsg || 'autoBracket';
          } catch (e2) {
            return { error: err, input: value };
          }
        } else {
          return { error: err, input: value };
        }
      }
    }

    return { json: jsonObj, fixed: fixed, fixMsg: fixMsg, input: value };
  }

  /* ==============================================================
     Actions (pure or returning { state })
  ============================================================== */

  /**
   * formatJSON: parse input → formatted JSON string.
   * Returns { content, type, fixed, parsed } for the renderer.
   */
  function formatJSON(inputValue) {
    var r = parseInput(inputValue);
    if (r.error) return { error: r.error, input: r.input };
    var content = JSON.stringify(r.json, null, 2);
    return { content: content, type: 'json', fixed: r.fixed, parsed: r.json, fixMsg: r.fixMsg };
  }

  /**
   * minifyJSON: parse input → minified JSON string.
   */
  function minifyJSON(inputValue) {
    var r = parseInput(inputValue);
    if (r.error) return { error: r.error, input: r.input };
    var content = JSON.stringify(r.json);
    return { content: content, type: 'text', fixed: r.fixed, parsed: r.json, fixMsg: r.fixMsg };
  }

  /**
   * stringifyJSON: parse input → JSON string of the stringified value.
   */
  function stringifyJSON(inputValue) {
    var r = parseInput(inputValue);
    if (r.error) return { error: r.error, input: r.input };
    var content = JSON.stringify(JSON.stringify(r.json));
    return { content: content, type: 'text', fixed: r.fixed, parsed: r.json, fixMsg: r.fixMsg };
  }

  /**
   * copyOutput: returns the content to copy.
   */
  function copyOutput(detailContent, formattedContent) {
    return detailContent || formattedContent || null;
  }

  /**
   * downloadJSON: returns { content, fileName }.
   */
  function downloadJSON(formattedContent) {
    if (!formattedContent) return null;
    return { content: formattedContent, fileName: 'formatted_' + Date.now() + '.json' };
  }

  /**
   * clearContent: returns new state for cleared output.
   */
  function clearContent() {
    return {
      input: '',
      output: '',
      outputType: 'empty',
      outputFixed: false,
      outputParsed: null,
      lastDetailContent: '',
    };
  }

  /**
   * toggleTheme: returns new theme value.
   */
  function toggleTheme() {
    var current = localStorage.getItem('theme') || 'light';
    return current === 'dark' ? 'light' : 'dark';
  }

  /**
   * saveHistory: validates and returns { name, content }.
   */
  function saveHistory(formattedContent) {
    if (!formattedContent) return { valid: false };
    return { valid: true, content: formattedContent };
  }

  /**
   * confirmSave: returns the history entry to add.
   */
  function confirmSave(formattedContent, name) {
    var id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    return {
      id: id,
      name: name || 'untitled',
      content: formattedContent,
    };
  }

  /**
   * deleteHistory: returns filtered history ids.
   */
  function deleteHistory(history, id, selectedIds) {
    var filtered = history.filter(function (item) { return item.id !== id; });
    var newSelected = selectedIds.filter(function (i) { return i !== id; });
    return { history: filtered, selectedIds: newSelected };
  }

  /**
   * clearAllHistory: returns empty state.
   */
  function clearAllHistory() {
    return { history: [], selectedIds: [] };
  }

  /**
   * loadHistory: returns { content, name }.
   */
  function loadHistory(history, id) {
    var item = history.find(function (h) { return h.id === id; });
    if (!item) return null;
    return { content: item.content, name: item.name };
  }

  /**
   * toggleSelect: returns new selectedIds array.
   */
  function toggleSelect(selectedIds, id) {
    if (selectedIds.indexOf(id) >= 0) {
      return selectedIds.filter(function (i) { return i !== id; });
    } else {
      if (selectedIds.length < 2) {
        return selectedIds.concat([id]);
      } else {
        return [selectedIds[1], id];
      }
    }
  }

  /**
   * reverseCompare: returns new compareOrder.
   */
  function reverseCompare(compareOrder) {
    return compareOrder.slice().reverse();
  }

  /**
   * parse for diff: shared helper.
   */
  function diffParse(content) {
    try { return JSON.parse(content); } catch (e) { return content; }
  }

  /* ==============================================================
     Export
  ============================================================== */
  window.__actions = {
    formatJSON: formatJSON,
    minifyJSON: minifyJSON,
    stringifyJSON: stringifyJSON,
    copyOutput: copyOutput,
    downloadJSON: downloadJSON,
    clearContent: clearContent,
    toggleTheme: toggleTheme,
    saveHistory: saveHistory,
    confirmSave: confirmSave,
    deleteHistory: deleteHistory,
    clearAllHistory: clearAllHistory,
    loadHistory: loadHistory,
    toggleSelect: toggleSelect,
    reverseCompare: reverseCompare,
    diffParse: diffParse,
    getHistory: getHistory,
    setHistory: setHistory,
    escapeHtml: escapeHtml,
  };
})();

;
/**
 * src/app/render.js
 * Renders application state to the DOM. Subscribes to __store.
 * No business logic — purely UI updates.
 */

(function () {
  'use strict';

  var _store = window.__store;
  var _actions = window.__actions;
  var _router = window.__router;
  var _i18n = window.i18n || { t: function (k, v) { return k; }, _lang: 'en' };

  // 单条历史记录最大字符数 (≈1MB UTF-8): 防止 localStorage 配额被单条撑爆
  var HISTORY_MAX_CHARS = 500 * 1024;

  // HTML-escape a string before injecting into innerHTML.
  // JSON.stringify does NOT escape <, >, & — without this, a JSON value
  // like "<img src=x onerror=alert(1)>" becomes live HTML (XSS).
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ==============================================================
     Core rendering
  ============================================================== */

  function renderLineNumbers(lineCount) {
    var area = document.getElementById('output-content-area');
    if (!area) return;
    var linenos = area.querySelector('.output-linenos');
    if (lineCount > 0) {
      if (!linenos) {
        linenos = document.createElement('div');
        linenos.className = 'output-linenos';
        area.insertBefore(linenos, area.firstChild);
      }
      // 用 DocumentFragment + textContent 批量生成行号, 避免超大 JSON 时
      // 生成巨大 innerHTML 字符串(高内存 + 慢)。textContent 也更安全(纯数字)。
      var frag = document.createDocumentFragment();
      for (var i = 0; i < lineCount; i++) {
        var span = document.createElement('span');
        span.textContent = i + 1;
        frag.appendChild(span);
      }
      linenos.textContent = '';
      linenos.appendChild(frag);
      _store.setState({ lastOutputLineCount: lineCount });
    } else if (linenos) {
      linenos.remove();
      _store.setState({ lastOutputLineCount: 0 });
    }
  }

  function syncLineNumberScroll() {
    var area = document.getElementById('output-content-area');
    if (!area) return;
    var content = area.querySelector('.output-content');
    var linenos = area.querySelector('.output-linenos');
    if (content && linenos) linenos.scrollTop = content.scrollTop;
  }

  function renderEmptyContent() {
    var area = document.getElementById('output-content-area');
    if (!area) return;
    area.innerHTML =
      '<div class="output-placeholder" id="output-placeholder">' +
      '<svg aria-hidden="true" class="svg-icon" viewBox="0 0 24 24"><use href="#icon-braces"/></svg>' +
      _i18n.t('outputPlaceholder') +
      '</div>';
    renderLineNumbers(0);
  }

  function renderTextOutput(content) {
    var area = document.getElementById('output-content-area');
    if (!area) return;
    area.innerHTML = '<div class="output-content"><pre><code class="language-json hljs"></code></pre></div>';
    var lineCount = content.split('\n').length;
    renderLineNumbers(lineCount);
    var codeEl = area.querySelector('code');
    if (codeEl) {
      // 无条件先写文本: 即使 hljs 未加载, 输出也不会空白
      codeEl.textContent = content;
      if (typeof hljs !== 'undefined') hljs.highlightElement(codeEl);
    }
    var contentEl = area.querySelector('.output-content');
    if (contentEl) contentEl.onscroll = syncLineNumberScroll;
  }

  function renderRegularOutput(content) {
    var area = document.getElementById('output-content-area');
    if (!area) return;
    var obj;
    try { obj = JSON.parse(content); } catch (e) { obj = null; }
    var treeHtml = obj !== null
      ? renderJsonNode(null, obj)
      : '<pre><code class="language-json hljs">' + _actions.escapeHtml(content) + '</code></pre>';
    area.innerHTML = '<div class="output-content"><div class="json-tree">' + treeHtml + '</div></div>';

    var treeEl = area.querySelector('.json-tree');
    var lineCount = treeEl ? countVisibleLines(treeEl, false) : content.split('\n').length;
    renderLineNumbers(lineCount);

    if (obj === null) {
      var codeEl = area.querySelector('code');
      if (codeEl && typeof hljs !== 'undefined') {
        codeEl.textContent = content;
        hljs.highlightElement(codeEl);
      }
    }

    var contentEl = area.querySelector('.output-content');
    if (contentEl) contentEl.onscroll = syncLineNumberScroll;
  }

  function getItemPreview(item) {
    if (item === null) return 'null';
    if (item === undefined) return 'undefined';
    if (typeof item === 'boolean') return String(item);
    if (typeof item === 'number') return String(item);
    if (typeof item === 'string') {
      return item.length > 50 ? '"' + item.substring(0, 50) + '\u2026"' : JSON.stringify(item);
    }
    if (Array.isArray(item)) {
      return '[...] (' + _i18n.t('items', { count: item.length }) + ')';
    }
    if (typeof item === 'object') {
      var keys = Object.keys(item);
      var preview = keys.slice(0, 2).join(', ');
      return '{' + preview + (keys.length > 2 ? ', ...' : '') + '} (' + _i18n.t('keys', { count: keys.length }) + ')';
    }
    return String(item);
  }

  function renderListOutput(arr) {
    var area = document.getElementById('output-content-area');
    if (!area) return;

    area.innerHTML =
      '<div class="list-view" id="list-view">' +
      '  <div class="list-panel" id="list-panel">' +
      '    <div class="list-panel-header">' +
      '      <span class="list-title">' + _i18n.t('listTitle', { count: arr.length }) + '</span>' +
      '      <button class="list-panel-toggle" id="list-panel-toggle" data-list-toggle="1" title="' + _i18n.t('collapseList') + '" aria-label="' + _i18n.t('collapseList') + '">' +
      '        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
      '      </button>' +
      '    </div>' +
      '    <div class="list-panel-body" id="list-panel-body"></div>' +
      '  </div>' +
      '  <div class="list-detail" id="list-detail">' +
      '    <div class="list-expand-tab" id="list-expand-tab" role="button" tabindex="0" data-list-toggle="1" title="' + _i18n.t('expandList') + '" aria-label="' + _i18n.t('expandList') + '">' +
      '      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '    </div>' +
      '    <div class="list-detail-linenos" id="list-detail-linenos"></div>' +
      '    <div class="list-detail-content" id="list-detail-content"></div>' +
      '  </div>' +
      '</div>';

    var listPanelBody = document.getElementById('list-panel-body');
    _store.setState({ _listArr: arr, _listArrStr: [] });

    if (arr.length === 0) {
      listPanelBody.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center">' + _i18n.t('emptyArray') + '</div>';
      return;
    }

    var items = [];
    for (var i = 0; i < arr.length; i++) {
      items.push(
        '<div class="list-item" role="button" tabindex="0" aria-label="查看第 ' + i + ' 项" data-list-item="' + i + '">' +
        '  <span class="list-item-index">[' + i + ']</span>' +
        '  <span class="list-item-preview">' + _actions.escapeHtml(getItemPreview(arr[i])) + '</span>' +
        '</div>'
      );
    }
    listPanelBody.innerHTML = items.join('');

    _store.setState({ listSelectedIndex: 0 });
    selectListItem(0, arr);
  }

  function getIndent() { return 2; }

  function selectListItem(index, arr) {
    var detailStr = JSON.stringify(arr[index], null, getIndent());
    _store.setState({ listSelectedIndex: index, lastDetailContent: detailStr });
    var detailContent = document.getElementById('list-detail-content');
    var detailLinenos = document.getElementById('list-detail-linenos');
    if (detailContent) {
      detailContent.innerHTML = '<div class="json-tree">' + renderJsonNode(null, arr[index]) + '</div>';
      updateTreeLineNumbers();
      detailContent.onscroll = function () {
        if (detailLinenos) detailLinenos.scrollTop = detailContent.scrollTop;
      };
    }
  }

  function toggleListPanel() {
    var panel = document.getElementById('list-panel');
    var view = document.getElementById('list-view');
    if (panel) panel.classList.toggle('collapsed');
    if (view) view.classList.toggle('list-collapsed');
  }

  function renderJsonNode(key, value) {
    var prefix = key !== null ? '<span class="jt-key">' + esc(JSON.stringify(key)) + '</span>: ' : '';

    if (value === null) return '<span class="jt-line">' + prefix + '<span class="jt-null">null</span></span>';
    if (typeof value === 'boolean') return '<span class="jt-line">' + prefix + '<span class="jt-bool">' + value + '</span></span>';
    if (typeof value === 'number') return '<span class="jt-line">' + prefix + '<span class="jt-number">' + value + '</span></span>';
    if (typeof value === 'string') return '<span class="jt-line">' + prefix + '<span class="jt-string">' + esc(JSON.stringify(value)) + '</span></span>';

    var toggleAttrs = 'role="button" tabindex="0" aria-label="折叠/展开" data-jt-toggle="1"';

    if (Array.isArray(value)) {
      var count = value.length;
      if (count === 0) return '<span class="jt-line">' + prefix + '<span class="jt-bracket">[]</span></span>';
      var html = '<div class="jt-group">';
      html += '<span class="jt-line">' + prefix + '<span class="jt-toggle" ' + toggleAttrs + '>&#9660;</span><span class="jt-bracket">[</span><span class="jt-collapsed-summary"> [' + _i18n.t('items', { count: count }) + ']</span></span>';
      html += '<div class="jt-children">';
      for (var i = 0; i < count; i++) {
        html += renderJsonNode(String(i), value[i]);
        if (i < count - 1) html += '<span class="jt-comma">,</span>';
      }
      html += '</div>';
      html += '<span class="jt-line jt-closing"><span class="jt-bracket">]</span></span>';
      html += '</div>';
      return html;
    }

    if (typeof value === 'object') {
      var keys = Object.keys(value);
      var kcount = keys.length;
      if (kcount === 0) return '<span class="jt-line">' + prefix + '<span class="jt-bracket">{}</span></span>';
      var html2 = '<div class="jt-group">';
      html2 += '<span class="jt-line">' + prefix + '<span class="jt-toggle" ' + toggleAttrs + '>&#9660;</span><span class="jt-bracket">{</span><span class="jt-collapsed-summary"> {' + _i18n.t('keys', { count: kcount }) + '}</span></span>';
      html2 += '<div class="jt-children">';
      for (var k = 0; k < kcount; k++) {
        html2 += renderJsonNode(keys[k], value[keys[k]]);
        if (k < kcount - 1) html2 += '<span class="jt-comma">,</span>';
      }
      html2 += '</div>';
      html2 += '<span class="jt-line jt-closing"><span class="jt-bracket">}</span></span>';
      html2 += '</div>';
      return html2;
    }

    return '';
  }

  function toggleJsonNode(el) {
    var group = el.closest('.jt-group');
    if (group) {
      group.classList.toggle('collapsed');
      var toggle = group.querySelector('.jt-toggle');
      if (toggle) toggle.innerHTML = group.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
      updateTreeLineNumbers();
    }
  }

  function updateTreeLineNumbers() {
    var target = document.getElementById('list-detail-linenos');
    if (!target) target = document.querySelector('.output-linenos');
    var tree = document.querySelector('.json-tree');
    if (!target || !tree) return;
    var count = countVisibleLines(tree, false);
    target.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var span = document.createElement('span');
      span.textContent = i + 1;
      target.appendChild(span);
    }
  }

  function countVisibleLines(el, skipHidden) {
    if (el.classList && el.classList.contains('jt-line')) {
      if (skipHidden) return 1;
      var parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (parent.classList && parent.classList.contains('jt-group') && parent.classList.contains('collapsed')) return 0;
        parent = parent.parentElement;
      }
      return 1;
    }
    var count = 0;
    for (var i = 0; i < el.children.length; i++) {
      count += countVisibleLines(el.children[i], false);
    }
    return count;
  }

  function updateOutputStatus(content) {
    var lines = content.split('\n').length;
    var size = new Blob([content]).size;
    var el = document.getElementById('output-status');
    if (el) el.textContent = lines + ' ' + _i18n.t('lineCount') + ' ' + formatBytes(size);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024, sizes = ['B', 'KB', 'MB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /* ==============================================================
     Search rendering
  ============================================================== */
  var _searchDebounce = null;

  function isSearchOpen() {
    var bar = document.getElementById('output-search-bar');
    return !!bar && bar.classList.contains('open');
  }

  function openSearch() {
    var bar = document.getElementById('output-search-bar');
    var btn = document.getElementById('output-search-btn');
    if (!bar) return;
    bar.classList.add('open');
    if (btn) btn.classList.add('active');
    var input = document.getElementById('output-search-input');
    if (input) setTimeout(function () { input.focus(); input.select(); }, 30);
    _store.setState({ searchOpen: true });
  }

  function closeSearch() {
    var bar = document.getElementById('output-search-bar');
    var btn = document.getElementById('output-search-btn');
    if (bar) bar.classList.remove('open');
    if (btn) btn.classList.remove('active');
    var input = document.getElementById('output-search-input');
    if (input) input.value = '';
    var count = document.getElementById('output-search-count');
    if (count) { count.textContent = ''; count.classList.remove('no-match'); }
    _store.setState({ searchOpen: false, searchQuery: '', searchMatches: [], searchIndex: -1 });
    clearSearchHighlights();
  }

  function toggleSearch() {
    if (isSearchOpen()) closeSearch();
    else openSearch();
  }

  function clearSearchHighlights() {
    var marks = document.querySelectorAll('#output-content-area mark.jt-match');
    var parents = new Set();
    marks.forEach(function (m) {
      if (m.parentNode) {
        parents.add(m.parentNode);
        m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
      }
    });
    parents.forEach(function (p) { p.normalize(); });
    var listView = document.getElementById('list-view');
    if (listView) {
      listView.querySelectorAll('.list-item.has-match').forEach(function (r) { r.classList.remove('has-match'); });
    }
    _store.setState({ searchMatches: [], searchIndex: -1 });
  }

  function getSearchRoots() {
    var area = document.getElementById('output-content-area');
    if (!area) return [];
    var listView = area.querySelector('#list-view');
    if (listView) {
      var detail = document.getElementById('list-detail-content');
      var tree = detail && detail.querySelector('.json-tree');
      return tree ? [tree] : [];
    }
    var tree = area.querySelector('.json-tree');
    if (tree) return [tree];
    var code = area.querySelector('code');
    return code ? [code] : [];
  }

  function performSearch(query) {
    var q = String(query || '');
    _store.setState({ searchQuery: q });
    clearSearchHighlights();
    var countEl = document.getElementById('output-search-count');
    if (!q) {
      if (countEl) { countEl.textContent = ''; countEl.classList.remove('no-match'); }
      return;
    }
    var roots = getSearchRoots();
    if (!roots.length) {
      if (countEl) { countEl.textContent = '0'; countEl.classList.add('no-match'); }
      return;
    }
    var lower = q.toLowerCase();
    var matches = [];

    roots.forEach(function (root) {
      var textNodes = [];
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var n = walker.currentNode;
        if (n.nodeValue && n.nodeValue.length) textNodes.push(n);
      }
      textNodes.forEach(function (node) {
        var text = node.nodeValue;
        var lowerText = text.toLowerCase();
        // 用 lower.length 而非 q.length: idx 来自 lowerText/小写字符串,长度以转换后为准,
        // 避免个别字符 (如 İ→i̇) 在 toLowerCase 后 码元跨度变化导致切割错位。
        var needleLen = lower.length;
        var idx = lowerText.indexOf(lower);
        if (idx === -1) return;
        var parts = [];
        var last = 0;
        while (idx !== -1) {
          if (idx > last) parts.push({ text: text.substring(last, idx), isMatch: false });
          parts.push({ text: text.substring(idx, idx + needleLen), isMatch: true });
          last = idx + needleLen;
          idx = lowerText.indexOf(lower, last);
        }
        if (last < text.length) parts.push({ text: text.substring(last), isMatch: false });

        var frag = document.createDocumentFragment();
        parts.forEach(function (p) {
          if (p.isMatch) {
            var mark = document.createElement('mark');
            mark.className = 'jt-match';
            mark.textContent = p.text;
            frag.appendChild(mark);
          } else if (p.text) {
            frag.appendChild(document.createTextNode(p.text));
          }
        });
        node.parentNode.replaceChild(frag, node);
      });
    });

    roots.forEach(function (root) {
      root.querySelectorAll('mark.jt-match').forEach(function (m) { matches.push(m); });
    });
    flagListItemMatches(q);
    _store.setState({ searchMatches: matches });
    if (countEl) {
      countEl.textContent = matches.length ? '0/' + matches.length : '0';
      countEl.classList.toggle('no-match', matches.length === 0);
    }
    if (matches.length) {
      goToMatch(0);
    }
  }

  function goToMatch(index) {
    var matches = _store.getStateForKey('searchMatches');
    if (!matches || !matches.length) return;
    var n = matches.length;
    index = ((index % n) + n) % n;
    _store.setState({ searchIndex: index });
    matches.forEach(function (m, i) { m.classList.toggle('active', i === index); });
    var target = matches[index];
    var el = target.parentElement;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('jt-group') && el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        var toggle = el.querySelector('.jt-toggle');
        if (toggle) toggle.innerHTML = '&#9660;';
      }
      el = el.parentElement;
    }
    updateTreeLineNumbers();
    target.scrollIntoView({ block: 'nearest' });
    var countEl = document.getElementById('output-search-count');
    if (countEl) countEl.textContent = (index + 1) + '/' + n;
  }

  function nextMatch() {
    var matches = _store.getStateForKey('searchMatches');
    if (!matches || !matches.length) return;
    goToMatch((_store.getStateForKey('searchIndex') || 0) + 1);
  }

  function prevMatch() {
    var matches = _store.getStateForKey('searchMatches');
    if (!matches || !matches.length) return;
    goToMatch((_store.getStateForKey('searchIndex') || 0) - 1);
  }

  function flagListItemMatches(query) {
    var listView = document.getElementById('list-view');
    if (!listView) return;
    var listArr = _store.getStateForKey('_listArr');
    if (!listArr) return;
    var listArrStr = _store.getStateForKey('_listArrStr') || [];
    var lower = query.toLowerCase();
    var updatedArrStr = listArrStr.slice();
    listArr.forEach(function (item, i) {
      var row = listView.querySelector('.list-item[data-list-item="' + i + '"]');
      if (!row) return;
      if (updatedArrStr[i] === undefined) {
        updatedArrStr[i] = (typeof item === 'string' ? item : JSON.stringify(item)).toLowerCase();
      }
      row.classList.toggle('has-match', updatedArrStr[i].indexOf(lower) !== -1);
    });
    _store.setState({ _listArrStr: updatedArrStr });
  }

  function refreshSearch() {
    if (!isSearchOpen()) return;
    var input = document.getElementById('output-search-input');
    performSearch(input ? input.value : '');
  }

  // After the output DOM is rebuilt (re-render / language change), any stored
  // <mark> elements from a previous search become detached. Re-run the search
  // against the fresh DOM so highlights + stored match references stay valid.
  // Guarded to avoid re-entrancy loops via the store subscriber.
  var _restoringSearch = false;
  function restoreSearchHighlights() {
    if (_restoringSearch) return;
    var q = _store.getStateForKey('searchQuery');
    if (!q || !isSearchOpen()) return;
    _restoringSearch = true;
    try { performSearch(q); } finally { _restoringSearch = false; }
  }

  function initSearch() {
    var input = document.getElementById('output-search-input');
    if (!input) return;
    var prevBtn = document.getElementById('output-search-prev');
    var nextBtn = document.getElementById('output-search-next');
    input.addEventListener('input', function () {
      clearTimeout(_searchDebounce);
      var val = input.value;
      _searchDebounce = setTimeout(function () { performSearch(val); }, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) prevMatch();
        else nextMatch();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      }
    });
    if (prevBtn) prevBtn.addEventListener('click', prevMatch);
    if (nextBtn) nextBtn.addEventListener('click', nextMatch);
  }

  /* ==============================================================
     Output render (orchestrator called by Action handlers)
  ============================================================== */
  function renderOutput(content, type, fixed, parsedObj) {
    var state = {
      output: content,
      outputType: type,
      outputFixed: !!fixed,
      outputParsed: parsedObj || null,
    };
    _store.setState(state);
  }

  /* ==============================================================
     History rendering
  ============================================================== */
  function renderHistory() {
    var history = _actions.getHistory();
    var selectedIds = _store.getStateForKey('selectedIds') || [];
    var list = document.getElementById('history-list');
    var compareBtn = document.getElementById('compare-btn');

    if (!list) return;

    if (history.length === 0) {
      list.innerHTML =
        '<div class="history-empty">' +
        '<svg aria-hidden="true" class="svg-icon" viewBox="0 0 24 24"><use href="#icon-clock"/></svg>' +
        '<div>' + _i18n.t('noHistory') + '</div>' +
        '<div style="font-size:11px;opacity:0.6">' + _i18n.t('noHistoryHint') + '</div>' +
        '</div>';
      if (compareBtn) compareBtn.disabled = true;
      return;
    }

    var html = history.map(function (item) {
      var snippet = item.content.replace(/\s+/g, '').slice(0, 50);
      var checked = selectedIds.indexOf(item.id) >= 0 ? 'checked' : '';
      var selected = selectedIds.indexOf(item.id) >= 0 ? 'selected' : '';
      return (
        '<div class="history-item ' + selected + '">' +
        '  <input type="checkbox" class="history-checkbox" data-select-id="' + item.id + '" ' + checked + ' title="' + _i18n.t('selectForCompare') + '" aria-label="' + _i18n.t('selectForCompare') + '" />' +
        '  <button type="button" class="history-info" data-load-id="' + item.id + '" aria-label="加载历史：' + _actions.escapeHtml(item.name) + '">' +
        '    <div class="history-name">' + _actions.escapeHtml(item.name) + '</div>' +
        '    <div class="history-snippet">' + _actions.escapeHtml(snippet) + '</div>' +
        '  </button>' +
        '  <button type="button" class="history-delete" data-delete-id="' + item.id + '" title="' + _i18n.t('deleteItem') + '" aria-label="' + _i18n.t('deleteItem') + '">&times;</button>' +
        '</div>'
      );
    }).join('');

    list.innerHTML = html;
    if (compareBtn) compareBtn.disabled = selectedIds.length !== 2;
  }

  /* ==============================================================
     Status bar
  ============================================================== */
  function setStatus(msg, flash) {
    var el = document.getElementById('status-msg');
    var bar = document.querySelector('.statusbar');
    if (!el) return;
    if (el.textContent === msg && !flash) return;
    el.classList.add('updating');
    setTimeout(function () {
      el.textContent = msg;
      el.classList.remove('updating');
    }, 100);
    if (flash && bar) {
      bar.classList.remove('flash');
      void bar.offsetWidth;
      bar.classList.add('flash');
      setTimeout(function () { bar.classList.remove('flash'); }, 800);
    }
  }

  function showToast(msg, duration, iconId) {
    var t = document.getElementById('toast');
    if (!t) return;
    var iconSvg = iconId ? '<svg aria-hidden="true" class="svg-icon-sm" viewBox="0 0 24 24"><use href="#' + iconId + '"/></svg>' : '';
    t.innerHTML = iconSvg + _actions.escapeHtml(msg);
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, duration || 2000);
  }

  function clearNotifications() {
    var el = document.getElementById('output-notifications');
    if (el) el.innerHTML = '';
  }

  function showNotification(type, message) {
    clearNotifications();
    var container = document.getElementById('output-notifications');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'output-notification ' + type;
    div.textContent = message;
    container.appendChild(div);
  }

  /* ==============================================================
     Theme
  ============================================================== */
  function applyTheme(theme) {
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
    if (_store.persistTheme) _store.persistTheme(theme);
    else localStorage.setItem('theme', theme);
    _store.setState({ theme: theme });
  }

  /* ==============================================================
     Mobile tab switching
  ============================================================== */
  function switchMobileTab(tab) {
    var inputPanel = document.getElementById('input-panel');
    var outputPanel = document.getElementById('output-panel');
    var tabs = document.querySelectorAll('.mob-tab');
    if (!inputPanel || !outputPanel) return;

    tabs.forEach(function (t) {
      t.classList.remove('is-active');
      t.setAttribute('aria-selected', 'false');
    });
    inputPanel.classList.remove('is-active');
    outputPanel.classList.remove('is-active');

    if (tab === 'input') {
      inputPanel.classList.add('is-active');
      if (tabs[0]) { tabs[0].classList.add('is-active'); tabs[0].setAttribute('aria-selected', 'true'); }
    } else {
      outputPanel.classList.add('is-active');
      if (tabs[1]) { tabs[1].classList.add('is-active'); tabs[1].setAttribute('aria-selected', 'true'); }
    }
  }

  /* ==============================================================
     Sidebar
  ============================================================== */
  function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var openBtn = document.getElementById('sidebar-open-btn');
    var overlay = document.getElementById('sidebar-overlay');
    var isMobile = _router.isMobileDevice();

    if (isMobile) {
      var sheet = document.getElementById('mob-sheet');
      var sheetOverlay = document.getElementById('mob-sheet-overlay');
      var moreBtn = document.getElementById('mob-more-btn');
      if (sheet && sheet.classList.contains('open')) {
        sheet.classList.remove('open');
        if (sheetOverlay) sheetOverlay.classList.remove('open');
        if (moreBtn) moreBtn.classList.remove('active');
      }
      var isActive = sidebar.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active', isActive);
      // 移动端 sidebar 全屏抽屉打开时，临时隐藏底部 mob-toolbar，
      // 避免 sidebar-footer 的 Compare/Clear 与主操作栏重叠
      var mobToolbar = document.querySelector('.mob-toolbar');
      if (mobToolbar) mobToolbar.style.display = isActive ? 'none' : '';
      // 打开历史界面时重置状态栏, 避免上一界面的 format 结果消息残留
      if (isActive) setStatus(_i18n.t('statusReady'));
    } else {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('active');
      if (openBtn) openBtn.style.display = sidebar.classList.contains('collapsed') ? 'block' : 'none';
    }
  }

  /* ==============================================================
     Compare
  ============================================================== */
  function renderCompareView(items, compareOrder) {
    var leftTitle = document.getElementById('compare-left-title');
    var rightTitle = document.getElementById('compare-right-title');
    var leftContent = document.getElementById('compare-left-content');
    var rightContent = document.getElementById('compare-right-content');
    var container = document.getElementById('compare-container');
    if (!container) return;
    if (!leftContent || !rightContent) return;

    container.classList.add('active');
    if (leftTitle) leftTitle.textContent = items[0].name;
    if (rightTitle) rightTitle.textContent = items[1].name;
    if (leftContent) leftContent.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">' + _i18n.t('compareLoading') + '</div>';
    if (rightContent) rightContent.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">' + _i18n.t('compareLoading') + '</div>';

    var leftScroll = document.getElementById('compare-left-content');
    var rightScroll = document.getElementById('compare-right-content');

    if (_store.getStateForKey('_compareScrollController')) {
      _store.getStateForKey('_compareScrollController').abort();
    }
    var scrollController = new AbortController();
    _store.setState({ _compareScrollController: scrollController });

    var syncing = false;
    leftScroll.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      rightScroll.scrollTop = leftScroll.scrollTop;
      requestAnimationFrame(function () { syncing = false; });
    }, { signal: scrollController.signal });
    rightScroll.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      leftScroll.scrollTop = rightScroll.scrollTop;
      requestAnimationFrame(function () { syncing = false; });
    }, { signal: scrollController.signal });

    requestAnimationFrame(function () {
      var oldObj = _actions.diffParse(items[0].content);
      var newObj = _actions.diffParse(items[1].content);
      var diff = diffJson(oldObj, newObj);
      var leftMap = {}, rightMap = {};
      collectDiffPaths(diff, '', leftMap, rightMap);
      var leftHtml = renderJsonNodeWithDiff(null, oldObj, '', leftMap, 'left', oldObj);
      var rightHtml = renderJsonNodeWithDiff(null, newObj, '', rightMap, 'right', newObj);
      if (leftContent) leftContent.innerHTML = '<div class="json-tree">' + leftHtml + '</div>';
      if (rightContent) rightContent.innerHTML = '<div class="json-tree">' + rightHtml + '</div>';
    });
  }

  // diff 路径分隔符: 用 NUL 而非 '/', 避免 JSON key 本身含 '/' 时
  // (如 {"a/b":1} vs {"a":{"b":1}}) 两条不同路径映射到同一个 map key, 高亮互相覆盖
  var PATH_SEP = '\u0000';

  function diffJson(a, b) {
    if (a === b) return { t: 'same', v: a };
    var ta = typeof a, tb = typeof b;
    if (ta !== tb) return { t: 'chg', o: a, n: b };
    if (a === null || b === null) return { t: 'chg', o: a, n: b };
    if (ta !== 'object') return { t: 'chg', o: a, n: b };
    var isArrA = Array.isArray(a), isArrB = Array.isArray(b);
    if (isArrA !== isArrB) return { t: 'chg', o: a, n: b };

    if (isArrA) {
      var children = [], hasDiff = false;
      var maxLen = Math.max(a.length, b.length);
      for (var i = 0; i < maxLen; i++) {
        if (i >= a.length) { children.push({ k: String(i), d: { t: 'add', v: b[i] } }); hasDiff = true; }
        else if (i >= b.length) { children.push({ k: String(i), d: { t: 'rem', v: a[i] } }); hasDiff = true; }
        else { var cd = diffJson(a[i], b[i]); children.push({ k: String(i), d: cd }); if (cd.t !== 'same') hasDiff = true; }
      }
      return hasDiff ? { t: 'arr', c: children } : { t: 'same', v: a };
    }

    var children = [], hasDiff = false;
    var allKeys = [];
    for (var k in a) { if (allKeys.indexOf(k) < 0) allKeys.push(k); }
    for (var k in b) { if (allKeys.indexOf(k) < 0) allKeys.push(k); }
    allKeys.sort();
    for (var i = 0; i < allKeys.length; i++) {
      var key = allKeys[i];
      if (!(key in a)) { children.push({ k: key, d: { t: 'add', v: b[key] } }); hasDiff = true; }
      else if (!(key in b)) { children.push({ k: key, d: { t: 'rem', v: a[key] } }); hasDiff = true; }
      else { var cd = diffJson(a[key], b[key]); children.push({ k: key, d: cd }); if (cd.t !== 'same') hasDiff = true; }
    }
    return hasDiff ? { t: 'obj', c: children } : { t: 'same', v: a };
  }

  function collectDiffPaths(d, path, leftMap, rightMap) {
    switch (d.t) {
      case 'chg':
        leftMap[path] = 'chg'; rightMap[path] = 'chg';
        break;
      case 'add':
        rightMap[path] = 'add';
        break;
      case 'rem':
        leftMap[path] = 'rem';
        break;
      case 'obj':
      case 'arr':
        for (var i = 0; i < d.c.length; i++) {
          collectDiffPaths(d.c[i].d, path ? path + PATH_SEP + d.c[i].k : d.c[i].k, leftMap, rightMap);
        }
        break;
    }
  }

  function renderJsonNodeWithDiff(key, value, path, diffMap, side, rootVal) {
    var prefix = key !== null ? '<span class="jt-key">' + esc(JSON.stringify(key)) + '</span>: ' : '';
    var diffType = diffMap[path] || '';
    var diffCls = diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '';
    var toggleAttrs = 'role="button" tabindex="0" aria-label="折叠/展开" data-jt-toggle="1"';

    if (value === null) return '<span class="jt-line' + diffCls + '">' + prefix + '<span class="jt-null">null</span></span>';
    if (typeof value === 'boolean') return '<span class="jt-line' + diffCls + '">' + prefix + '<span class="jt-bool">' + value + '</span></span>';
    if (typeof value === 'number') return '<span class="jt-line' + diffCls + '">' + prefix + '<span class="jt-number">' + value + '</span></span>';
    if (typeof value === 'string') return '<span class="jt-line' + diffCls + '">' + prefix + '<span class="jt-string">' + esc(JSON.stringify(value)) + '</span></span>';

    if (Array.isArray(value)) {
      var count = value.length;
      if (count === 0) return '<span class="jt-line' + diffCls + '">' + prefix + '<span class="jt-bracket">[]</span></span>';
      var html = '<div class="jt-group' + diffCls + '">';
      html += '<span class="jt-line">' + prefix + '<span class="jt-toggle" ' + toggleAttrs + '>&#9660;</span><span class="jt-bracket">[</span><span class="jt-collapsed-summary"> [' + _i18n.t('items', { count: count }) + ']</span></span>';
      html += '<div class="jt-children">';
      for (var i = 0; i < count; i++) {
        html += renderJsonNodeWithDiff(String(i), value[i], path ? path + PATH_SEP + i : String(i), diffMap, side, rootVal);
        if (i < count - 1) html += '<span class="jt-comma">,</span>';
      }
      html += '</div>';
      html += '<span class="jt-line jt-closing"><span class="jt-bracket">]</span></span>';
      html += '</div>';
      return html;
    }

    if (typeof value === 'object') {
      var keys = Object.keys(value);
      var kcount = keys.length;
      if (kcount === 0) return '<span class="jt-line' + diffCls + '">' + prefix + '<span class="jt-bracket">{}</span></span>';
      var html2 = '<div class="jt-group' + diffCls + '">';
      html2 += '<span class="jt-line">' + prefix + '<span class="jt-toggle" ' + toggleAttrs + '>&#9660;</span><span class="jt-bracket">{</span><span class="jt-collapsed-summary"> {' + _i18n.t('keys', { count: kcount }) + '}</span></span>';
      html2 += '<div class="jt-children">';
      for (var k = 0; k < kcount; k++) {
        var keyStr = keys[k];
        var childPath = path ? path + PATH_SEP + keyStr : keyStr;
        html2 += renderJsonNodeWithDiff(keyStr, value[keyStr], childPath, diffMap, side, rootVal);
        if (k < kcount - 1) html2 += '<span class="jt-comma">,</span>';
      }
      html2 += '</div>';
      html2 += '<span class="jt-line jt-closing"><span class="jt-bracket">}</span></span>';
      html2 += '</div>';
      return html2;
    }
    return '';
  }

  function closeCompare() {
    var container = document.getElementById('compare-container');
    if (container) container.classList.remove('active');
    var ctrl = _store.getStateForKey('_compareScrollController');
    if (ctrl) { ctrl.abort(); _store.setState({ _compareScrollController: null }); }
  }

  function reverseCompare() {
    var order = _store.getStateForKey('compareOrder') || [0, 1];
    var newOrder = order.slice().reverse();
    _store.setState({ compareOrder: newOrder });
    // Re-render compare view with swapped order
    var selectedIds = _store.getStateForKey('selectedIds') || [];
    if (selectedIds.length === 2) {
      var history = _actions.getHistory();
      var items = [
        history.find(function (h) { return h.id === selectedIds[newOrder[0]]; }),
        history.find(function (h) { return h.id === selectedIds[newOrder[1]]; }),
      ];
      if (items[0] && items[1]) renderCompareView(items, newOrder);
    }
  }

  /* ==============================================================
     Mobile more sheet
  ============================================================== */
  function toggleMobileMore() {
    var s = document.getElementById('mob-sheet');
    var o = document.getElementById('mob-sheet-overlay');
    var b = document.getElementById('mob-more-btn');
    if (!s) return;
    var isOpen = s.classList.toggle('open');
    if (o) o.classList.toggle('open', isOpen);
    if (b) b.classList.toggle('active', isOpen);
  }

  /* ==============================================================
     Settings
  ============================================================== */
  var SETTINGS_KEY = 'appSettings';
  var DEFAULT_SETTINGS = {
    watermarkText: 'JSON Formatter',
    watermarkOpacity: 0.15,
    bgImageData: '',
    bgImageOpacity: 0.25,
  };
  var _settings = getSettings();
  var _bgIsDark = false;

  function getSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {
      try { localStorage.removeItem(SETTINGS_KEY); } catch (_) {}
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(obj) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      console.warn('Failed to save settings:', e);
      return false;
    }
  }

  function renderWatermark() {
    var layer = document.getElementById('watermark-layer');
    if (!layer) return;
    var text = (_settings.watermarkText || '').trim();
    if (!text) {
      layer.classList.remove('active');
      layer.style.backgroundImage = '';
      return;
    }
    var angle = -22;
    var rad = (angle * Math.PI) / 180;
    var fontPx = 14;
    var fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
    var tilePadX = 80, tilePadY = 60;

    var measureCanvas = document.createElement('canvas');
    var mctx = measureCanvas.getContext('2d');
    mctx.font = fontPx + 'px ' + fontFamily;
    var textWidth = Math.ceil(mctx.measureText(text).width);
    var tileW = Math.max(textWidth + tilePadX * 2, 120);
    var tileH = Math.max(fontPx + tilePadY * 2, 80);

    var canvas = document.createElement('canvas');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = tileW * dpr;
    canvas.height = tileH * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.font = fontPx + 'px ' + fontFamily;
    ctx.fillStyle = _bgIsDark ? '#ffffff' : '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(tileW / 2, tileH / 2);
    ctx.rotate(rad);
    ctx.fillText(text, 0, 0);
    ctx.restore();

    var dataUrl = canvas.toDataURL('image/png');
    layer.style.backgroundImage = 'url("' + dataUrl + '")';
    layer.style.setProperty('--watermark-opacity', String(_settings.watermarkOpacity));
    layer.classList.add('active');
  }

  function applyBackgroundImage() {
    var layer = document.getElementById('bg-image-layer');
    if (!layer) return;
    if (_settings.bgImageData) {
      layer.style.backgroundImage = 'url("' + _settings.bgImageData + '")';
      layer.style.setProperty('--bg-image-opacity', String(_settings.bgImageOpacity));
      layer.classList.add('has-image');
    } else {
      layer.style.backgroundImage = '';
      layer.classList.remove('has-image');
    }
    computeBgLuminance();
  }

  // 采样背景图平均亮度，深色背景时水印自动切换为白色
  function computeBgLuminance() {
    if (!_settings.bgImageData) {
      _bgIsDark = false;
      renderWatermark();
      return;
    }
    var img = new Image();
    img.onload = function () {
      try {
        var sampleSize = 16;
        var c = document.createElement('canvas');
        c.width = sampleSize;
        c.height = sampleSize;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        var data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
        var sum = 0, count = 0;
        for (var i = 0; i < data.length; i += 4) {
          // 感知亮度: 0.299R + 0.587G + 0.114B
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          count++;
        }
        _bgIsDark = (sum / count) < 128;
      } catch (e) {
        _bgIsDark = false;
      }
      renderWatermark();
    };
    img.onerror = function () {
      _bgIsDark = false;
      renderWatermark();
      // 浏览器可能不支持该图片格式(如 HEIC 在 Chrome/WebView2), 提示而非静默失败
      showToast(_i18n.t('bgImageUnsupported'), 3000, 'icon-alert-triangle');
    };
    img.src = _settings.bgImageData;
  }

  function applyAllSettings() {
    renderWatermark();
    applyBackgroundImage();
  }

  function syncSettingsForm() {
    var t = document.getElementById('watermark-text-input');
    var o = document.getElementById('watermark-opacity-input');
    var bo = document.getElementById('bg-image-opacity-input');
    if (t) t.value = _settings.watermarkText;
    if (o) o.value = _settings.watermarkOpacity;
    if (bo) bo.value = _settings.bgImageOpacity;
  }

  function openSettings() {
    syncSettingsForm();
    var sheet = document.getElementById('mob-sheet');
    var overlay = document.getElementById('mob-sheet-overlay');
    var moreBtn = document.getElementById('mob-more-btn');
    if (sheet && sheet.classList.contains('open')) {
      sheet.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      if (moreBtn) moreBtn.classList.remove('active');
    }
    var m = document.getElementById('settings-modal');
    if (m) m.classList.add('active');
  }

  function closeSettings() {
    var m = document.getElementById('settings-modal');
    if (m) m.classList.remove('active');
  }

  function commitSettingsFromForm() {
    var wmTextInput = document.getElementById('watermark-text-input');
    var wmOpacityInput = document.getElementById('watermark-opacity-input');
    var bgOpacityInput = document.getElementById('bg-image-opacity-input');
    _settings.watermarkText = (wmTextInput ? wmTextInput.value : '').slice(0, 40);
    _settings.watermarkOpacity = clampOpacity(parseFloat(wmOpacityInput ? wmOpacityInput.value : DEFAULT_SETTINGS.watermarkOpacity), 0.05, 0.6, DEFAULT_SETTINGS.watermarkOpacity);
    _settings.bgImageOpacity = clampOpacity(parseFloat(bgOpacityInput ? bgOpacityInput.value : DEFAULT_SETTINGS.bgImageOpacity), 0, 1, DEFAULT_SETTINGS.bgImageOpacity);
    if (!saveSettings(_settings)) {
      showToast(_i18n.t('settingsSaveFailed'), 2500, 'icon-alert-triangle');
      return;
    }
    applyAllSettings();
  }

  function clampOpacity(v, min, max, fallback) {
    if (typeof v !== 'number' || isNaN(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function pickBackgroundImage() {
    var input = document.getElementById('bg-image-file');
    if (input) input.click();
  }

  function handleBackgroundImageFile(file) {
    if (!file) return;
    if (!isSupportedImageFile(file)) {
      showToast(_i18n.t('bgImageHint'), 2500, 'icon-alert-triangle');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast(_i18n.t('bgImageTooLarge'), 3000, 'icon-alert-triangle');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      _settings.bgImageData = String(reader.result || '');
      if (!saveSettings(_settings)) {
        showToast(_i18n.t('settingsSaveFailed'), 2500, 'icon-alert-triangle');
        return;
      }
      applyBackgroundImage();
      showToast(_i18n.t('settingsSaved'), 1500, 'icon-check');
    };
    reader.onerror = function () {
      showToast(_i18n.t('jsonError'), 2000, 'icon-alert-triangle');
    };
    reader.readAsDataURL(file);
  }

  // MIME 或扩展名任一命中即视为支持的图片格式
  function isSupportedImageFile(file) {
    var type = (file.type || '').toLowerCase();
    if (type.indexOf('image/') === 0) return true;
    var name = (file.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|ico)$/.test(name);
  }

  function clearBackgroundImage() {
    _settings.bgImageData = '';
    if (!saveSettings(_settings)) {
      showToast(_i18n.t('settingsSaveFailed'), 2500, 'icon-alert-triangle');
      return;
    }
    applyBackgroundImage();
    showToast(_i18n.t('cleared'), 1500, 'icon-check');
  }

  function resetAllSettings() {
    _settings = Object.assign({}, DEFAULT_SETTINGS);
    if (!saveSettings(_settings)) {
      showToast(_i18n.t('settingsSaveFailed'), 2500, 'icon-alert-triangle');
      return;
    }
    syncSettingsForm();
    applyAllSettings();
    showToast(_i18n.t('settingsSaved'), 1500, 'icon-check');
  }

  function initWatermarkResizeHandler() {
    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(renderWatermark, 200);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(renderWatermark, 300);
    });
  }

  /* ==============================================================
     Dynamic event delegation (re-used by app.js)
  ============================================================== */
  function bindDynamicDelegation() {
    var historyList = document.getElementById('history-list');
    if (historyList) {
      historyList.addEventListener('click', function (e) {
        var delBtn = e.target.closest('[data-delete-id]');
        if (delBtn) {
          e.stopPropagation();
          // id 是字符串("<timestamp>-<base36>"),不能 Number() 转换,否则变 NaN 导致删除失效
          var id = delBtn.dataset.deleteId;
          var history = _actions.getHistory();
          var selectedIds = _store.getStateForKey('selectedIds') || [];
          var result = _actions.deleteHistory(history, id, selectedIds);
          _actions.setHistory(result.history);
          _store.setState({ selectedIds: result.selectedIds });
          renderHistory();
          return;
        }
        var checkbox = e.target.closest('[data-select-id]');
        if (checkbox) {
          e.stopPropagation();
          var sid = checkbox.dataset.selectId;
          var sel = _store.getStateForKey('selectedIds') || [];
          var newSel = _actions.toggleSelect(sel, sid);
          _store.setState({ selectedIds: newSel });
          renderHistory();
          return;
        }
        var infoBtn = e.target.closest('[data-load-id]');
        if (infoBtn) {
          var hid = infoBtn.dataset.loadId;
          var hist = _actions.getHistory();
          var loaded = _actions.loadHistory(hist, hid);
          if (loaded) {
            var input = document.getElementById('input');
            if (input) input.value = loaded.content;
            input && input.dispatchEvent(new Event('input'));
            // Format using actions
            var result = _actions.formatJSON(loaded.content);
            if (result.error) {
              renderErrorOutput(result.error, result.input);
              setStatus(_i18n.t('jsonError'));
            } else {
              var notifMsg = result.fixed ? _i18n.t(result.fixMsg) : '';
              renderOutput(result.content, result.type, result.fixed, result.parsed);
              setStatus(_i18n.t('formatSuccess') + notifMsg, true);
              updateOutputStatus(result.content);
            }
            if (_router.isMobileDevice()) toggleSidebar();
            showToast(_i18n.t('loaded', { name: loaded.name }), 2000, 'icon-file-text');
          }
          return;
        }
      });
      historyList.addEventListener('keydown', function (e) {
        var infoBtn = e.target.closest('[data-load-id]');
        if (infoBtn && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          infoBtn.click();
          return;
        }
        var checkbox = e.target.closest('[data-select-id]');
        if (checkbox && e.key === ' ') {
          e.preventDefault();
          checkbox.click();
          return;
        }
      });
    }

    document.addEventListener('click', function (e) {
      var toggle = e.target.closest('[data-jt-toggle]');
      if (toggle) toggleJsonNode(toggle);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var toggle = e.target.closest('[data-jt-toggle]');
      if (toggle) { e.preventDefault(); toggleJsonNode(toggle); }
    });

    document.addEventListener('click', function (e) {
      var listToggle = e.target.closest('[data-list-toggle]');
      if (listToggle) { toggleListPanel(); return; }
      var listItem = e.target.closest('[data-list-item]');
      if (listItem) {
        var arr = _store.getStateForKey('_listArr');
        if (arr) selectListItem(Number(listItem.dataset.listItem), arr);
        return;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var listToggle = e.target.closest('[data-list-toggle]');
      if (listToggle) { e.preventDefault(); toggleListPanel(); return; }
      var listItem = e.target.closest('[data-list-item]');
      if (listItem) {
        e.preventDefault();
        var arr = _store.getStateForKey('_listArr');
        if (arr) selectListItem(Number(listItem.dataset.listItem), arr);
        return;
      }
    });
  }

  /* ==============================================================
     Drag & Drop
  ============================================================== */
  function initDragDrop() {
    var inputBody = document.getElementById('input-body');
    var overlay = document.getElementById('drop-overlay');
    var dragCounter = 0;

    inputBody.addEventListener('dragenter', function (e) {
      e.preventDefault();
      dragCounter++;
      overlay.classList.add('active');
    });
    inputBody.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
    });
    inputBody.addEventListener('dragover', function (e) { e.preventDefault(); });
    inputBody.addEventListener('drop', function (e) {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');
      var file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        showToast(_i18n.t('jsonOnly'), 3000, 'icon-alert-triangle');
        return;
      }
      var reader = new FileReader();
      reader.onload = function (evt) {
        var input = document.getElementById('input');
        if (input) {
          input.value = evt.target.result;
          input.dispatchEvent(new Event('input'));
        }
        // Format using actions
        var result = _actions.formatJSON(evt.target.result);
        if (result.error) {
          renderErrorOutput(result.error, result.input);
          setStatus(_i18n.t('jsonError'));
        } else {
          renderOutput(result.content, result.type, result.fixed, result.parsed);
          setStatus(_i18n.t('formatSuccess'), true);
          updateOutputStatus(result.content);
        }
        showToast(_i18n.t('loaded', { name: file.name }), 3000, 'icon-file-text');
      };
      reader.readAsText(file);
    });

    var resetDrag = function () {
      dragCounter = 0;
      overlay.classList.remove('active');
    };
    document.addEventListener('dragend', resetDrag);
    document.addEventListener('drop', resetDrag);
    document.addEventListener('dragleave', function (e) {
      if (e.relatedTarget === null) resetDrag();
    });
  }

  /* ==============================================================
     Keyboard Shortcuts
  ============================================================== */
  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // 中文/日文等 IME 组合输入期间 (isComposing 或 keyCode 229) 应按回车选词,
      // 不应触发格式化/保存等快捷键,否则选词时误触发操作。
      if (e.isComposing || e.keyCode === 229) return;
      var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      var mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key === 'f') { e.preventDefault(); openSearch(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); formatFromInput(); return; }
      if (mod && e.key === 's') { e.preventDefault(); saveHistoryFromOutput(); return; }
      if (mod && e.key === 'd') { e.preventDefault(); handleDownload(); return; }

      if (e.key === 'Escape') {
        if (isSearchOpen()) { closeSearch(); }
        else {
          var modal = document.getElementById('save-modal');
          var settings = document.getElementById('settings-modal');
          var compare = document.getElementById('compare-container');
          var sheet = document.getElementById('mob-sheet');
          var sidebar = document.getElementById('sidebar');
          if (modal && modal.classList.contains('active')) closeSaveModal();
          else if (settings && settings.classList.contains('active')) closeSettings();
          else if (compare && compare.classList.contains('active')) closeCompare();
          else if (sheet && sheet.classList.contains('open')) toggleMobileMore();
          else if (sidebar && sidebar.classList.contains('active')) toggleSidebar();
        }
      }
    });

    var saveNameInput = document.getElementById('save-name-input');
    if (saveNameInput) {
      saveNameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmSaveFromModal(); }
      });
    }

    // Mobile tap-to-reset
    if (_router.isMobileDevice()) {
      (function _initMobileTapToReset() {
        var interactiveSelectors = [
          'button', '.btn', '.mob-btn', '.mob-icon-btn', '.mob-tab',
          '.mob-sheet-item', '.mob-sheet-close', '.mob-sheet-overlay',
          'a', 'input', 'textarea', 'select', '[data-action]',
          '[data-jt-toggle]', '[data-list-toggle]', '[data-list-item]',
          '.panel-icon-btn', '.search-nav-btn', '.search-close-btn'
        ].join(', ');
        document.addEventListener('touchstart', function (e) {
          if (e.target.closest(interactiveSelectors) ||
            e.target.closest('.mob-toolbar') ||
            e.target.closest('.mob-sheet') ||
            e.target.closest('.mob-tabs') ||
            e.target.closest('.statusbar')) {
            return;
          }
          window.scrollTo(0, 0);
        }, { passive: true });
      })();
    }
  }

  /* ==============================================================
     Input tracker
  ============================================================== */
  function initInputTracker() {
    var input = document.getElementById('input');
    var indicator = document.getElementById('validation-indicator');
    var validateTimer = null;

    input.addEventListener('input', function () {
      var val = input.value;
      if (val) {
        var size = new Blob([val]).size;
        var el = document.getElementById('input-size');
        if (el) el.textContent = formatBytes(size);
      } else {
        var el2 = document.getElementById('input-size');
        if (el2) el2.textContent = '';
      }
      _store.setState({ input: val });

      clearTimeout(validateTimer);
      if (!val.trim()) {
        if (indicator) indicator.style.display = 'none';
        return;
      }
      validateTimer = setTimeout(function () {
        try {
          JSON.parse(val);
          if (indicator) { indicator.style.display = 'inline-flex'; indicator.className = 'validation-indicator valid'; indicator.innerHTML = '<span class="dot"></span> ' + _i18n.t('valid'); }
        } catch (e) {
          if (indicator) { indicator.style.display = 'inline-flex'; indicator.className = 'validation-indicator invalid'; indicator.innerHTML = '<span class="dot"></span> ' + _i18n.t('invalid'); }
        }
      }, 400);
    });
  }

  /* ==============================================================
     Error rendering
  ============================================================== */
  function renderErrorOutput(error, input) {
    var msg = getFriendlyJsonError(error, input);
    var posMatch = error.message.match(/position\s+(\d+)/i);
    var pos = posMatch ? parseInt(posMatch[1]) : -1;

    var snippetHtml = '';
    if (pos >= 0 && input) {
      var start = Math.max(0, pos - 60);
      var end = Math.min(input.length, pos + 60);
      var before = _actions.escapeHtml(input.substring(start, pos));
      var at = _actions.escapeHtml(input.charAt(pos) || '');
      var after = _actions.escapeHtml(input.substring(pos + 1, end));
      if (start > 0) snippetHtml += '\u2026';
      snippetHtml += before + '<span class="error-marker">' + at + '</span>' + after;
      if (end < input.length) snippetHtml += '\u2026';
    }

    var area = document.getElementById('output-content-area');
    var lineCount = input ? input.substring(0, pos).split('\n').length : 0;

    var hints = [
      _i18n.t('ruleKeys'),
      _i18n.t('ruleComma'),
      _i18n.t('ruleBool'),
      _i18n.t('ruleNull'),
      _i18n.t('ruleBracket')
    ];

    if (area) {
      area.innerHTML = '<div class="error-display">' +
        '<div class="error-title">' + _i18n.t('errorTitle') + '</div>' +
        '<div class="error-msg">' + _actions.escapeHtml(msg.split('\n')[0]) + '</div>' +
        (snippetHtml ? '<div class="error-snippet">' + snippetHtml + '</div>' : '') +
        (lineCount ? '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + _i18n.t('nearLine', { line: lineCount }) + '</div>' : '') +
        '<div class="error-hint">' + _i18n.t('jsonRules') + hints.join('; ') + '</div>' +
        '</div>';
    }
    renderLineNumbers(0);
  }

  function getFriendlyJsonError(error, input) {
    var msg = error.message || String(error);
    var posMatch = msg.match(/position\s+(\d+)/i);
    var pos = posMatch ? parseInt(posMatch[1]) : -1;

    var context = '';
    if (pos >= 0 && input) {
      var start = Math.max(0, pos - 30);
      var end = Math.min(input.length, pos + 30);
      var snippet = input.substring(start, end);
      var marker = '';
      for (var i = 0; i < Math.min(30, pos - start); i++) marker += ' ';
      marker += '^';
      context = '\n\n' + snippet + '\n' + marker;
    }

    if (msg.indexOf('Unexpected identifier') >= 0 || msg.indexOf('Unexpected token') >= 0) {
      var idMatch = msg.match(/["']([^"']+)["']/);
      var id = idMatch ? idMatch[1] : '';
      if (id && /^[a-zA-Z_$]/.test(id)) {
        return _i18n.t('unquotedIdDetected', { id: id }) + '\n' + _i18n.t('unquotedIdHint') + context;
      }
      return _i18n.t('jsonSyntaxError', { msg: msg }) + context;
    }
    if (msg.indexOf('Unexpected end of JSON') >= 0) return _i18n.t('jsonIncomplete') + context;
    if (msg.indexOf('Expected') >= 0 && msg.indexOf('got') >= 0) return _i18n.t('jsonSyntaxError', { msg: msg }) + context;
    if (msg.indexOf('Unexpected string') >= 0) return _i18n.t('stringMisplaced') + context;
    if (msg.indexOf('Unexpected number') >= 0) return _i18n.t('numberError') + context;
    return _i18n.t('jsonSyntaxError', { msg: msg }) + context;
  }

  /* ==============================================================
     Public action wrappers (called from app.js event handlers)
  ============================================================== */

  function formatFromInput() {
    var inputValue = _store.getStateForKey('input') || '';
    if (!inputValue.trim()) {
      renderOutput('', 'empty');
      setStatus(_i18n.t('inputEmpty'));
      return;
    }
    var result = _actions.formatJSON(inputValue);
    if (result.error) {
      renderErrorOutput(result.error, result.input);
      setStatus(_i18n.t('jsonError'));
      if (_router.isMobileDevice()) switchMobileTab('output');
      return;
    }
    var notifMsg = result.fixed ? _i18n.t(result.fixMsg) : '';
    renderOutput(result.content, result.type, result.fixed, result.parsed);
    setStatus(_i18n.t('formatSuccess') + notifMsg, true);
    updateOutputStatus(result.content);
  }

  function minifyFromInput() {
    var inputValue = _store.getStateForKey('input') || '';
    if (!inputValue.trim()) {
      showToast(_i18n.t('inputEmptyToast'), 2000, 'icon-alert-triangle');
      return;
    }
    var result = _actions.minifyJSON(inputValue);
    if (result.error) {
      renderErrorOutput(result.error, result.input);
      setStatus(_i18n.t('jsonError'));
      if (_router.isMobileDevice()) switchMobileTab('output');
      return;
    }
    var notifMsg = result.fixed ? _i18n.t(result.fixMsg) : '';
    renderOutput(result.content, result.type, result.fixed, result.parsed);
    setStatus(_i18n.t('minifySuccess') + notifMsg);
    updateOutputStatus(result.content);
  }

  function stringifyFromInput() {
    var inputValue = _store.getStateForKey('input') || '';
    if (!inputValue.trim()) {
      showToast(_i18n.t('inputEmptyToast'), 2000, 'icon-alert-triangle');
      return;
    }
    var result = _actions.stringifyJSON(inputValue);
    if (result.error) {
      renderErrorOutput(result.error, result.input);
      setStatus(_i18n.t('jsonError'));
      if (_router.isMobileDevice()) switchMobileTab('output');
      return;
    }
    var notifMsg = result.fixed ? _i18n.t(result.fixMsg) : '';
    renderOutput(result.content, result.type, result.fixed, result.parsed);
    setStatus(_i18n.t('escapeSuccess') + notifMsg);
    updateOutputStatus(result.content);
  }

  function handleCopy() {
    var detail = _store.getStateForKey('lastDetailContent') || '';
    var formatted = _store.getStateForKey('output') || '';
    var content = _actions.copyOutput(detail, formatted);
    if (!content) {
      showToast(_i18n.t('nothingToCopy'), 2000, 'icon-alert-triangle');
      return;
    }
    var fallbackCopy = function () {
      var ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(ok ? _i18n.t('copied') : _i18n.t('copyFailed'), 2000, ok ? 'icon-check' : 'icon-alert-triangle');
    };
    var isTauri = typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core);
    if (isTauri) {
      // Tauri v2 plugin-clipboard-manager exposes `clipboard`; the v1 name was
      // `clipboardManager`. Resolve the object and its writeText in both shapes.
      var clipboardObj = window.__TAURI__.clipboardManager || window.__TAURI__.clipboard;
      var clipboard2 = window.__TAURI__.clipboard;
      var writeText = null;
      if (clipboardObj && typeof clipboardObj.writeText === 'function') writeText = clipboardObj.writeText.bind(clipboardObj);
      else if (clipboard2 && typeof clipboard2.writeText === 'function') writeText = clipboard2.writeText.bind(clipboard2);
      if (writeText) {
        writeText(content).then(function () {
          showToast(_i18n.t('copied'), 2000, 'icon-check');
        }).catch(function () {
          showToast(_i18n.t('copyFailed'), 2000, 'icon-alert-triangle');
        });
      } else {
        fallbackCopy();
      }
      return;
    }
    if (!navigator.clipboard) { fallbackCopy(); return; }
    navigator.clipboard.writeText(content).then(function () {
      showToast(_i18n.t('copied'), 2000, 'icon-check');
    }).catch(function () { fallbackCopy(); });
  }

  /**
   * Tauri 写文件, 先尝试把目标路径加入临时 fs scope(allow-apply-scope),
   * 使 dialog.save 用户所选任意路径都能写入; apply_scope 不可用时回退到受限 scope 写入。
   * 返回 Promise 且成功时 resolve(true)。
   */
  function writeWithAppliedScope(path, content) {
    function doWrite() {
      return window.__TAURI__.fs.writeTextFile(path, content).then(function () { return true; });
    }
    var tauri = window.__TAURI__;
    var core = tauri && tauri.core;
    // 尝试 apply_scope (tauri-plugin-fs v2): 把 path 加入允许范围。
    // apply_scope 失败(命令不存在/未授权/路径不被允许)不阻断, 继续走受限 scope 直接写。
    var pre = [];
    if (core && typeof core.invoke === 'function') {
      pre.push(core.invoke('plugin:fs|apply_scope', { paths: [path] }).catch(function () {}));
    }
    return Promise.all(pre).then(doWrite);
  }

  function handleDownload() {
    var formatted = _store.getStateForKey('output') || '';
    var download = _actions.downloadJSON(formatted);
    if (!download) {
      showToast(_i18n.t('nothingToDownload'), 2000, 'icon-alert-triangle');
      return;
    }
    var isTauri = typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core);
    if (isTauri) {
      window.__TAURI__.dialog.save({
        defaultPath: download.fileName,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }).then(function (path) {
        if (!path) return;
        // 把用户所选路径加入临时写范围(apply_scope), 允许保存到任意位置,
        // 而不必全局放开 fs:scope "**"。若该命令不可用/未授权, 静默回退到
        // 原有限 scope 的 writeTextFile, 不影响已授权路径的保存。
        return writeWithAppliedScope(path, download.content);
      }).then(function (done) {
        if (done) showToast(_i18n.t('downloaded'), 2000, 'icon-download');
      }).catch(function () {
        showToast(_i18n.t('downloadFailed'), 2000, 'icon-alert-triangle');
      });
      return;
    }
    var blob = new Blob([download.content], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = download.fileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast(_i18n.t('downloaded'), 2000, 'icon-download');
  }

  function handleClear() {
    var state = _actions.clearContent();
    _store.setState(state);
    renderOutput('', 'empty');
    var input = document.getElementById('input');
    if (input) {
      input.value = '';
      // dispatch input 事件让 initInputTracker 同步 store 并隐藏校验指示灯,
      // 否则红灯/绿灯在清空后残留
      input.dispatchEvent(new Event('input'));
    }
    clearNotifications();
    var inputSize = document.getElementById('input-size');
    if (inputSize) inputSize.textContent = '';
    var outputStatus = document.getElementById('output-status');
    if (outputStatus) outputStatus.textContent = '';
    setStatus(_i18n.t('cleared'));
  }

  function handleToggleTheme() {
    var newTheme = _actions.toggleTheme();
    applyTheme(newTheme);
  }

  function saveHistoryFromOutput() {
    var formatted = _store.getStateForKey('output') || '';
    var result = _actions.saveHistory(formatted);
    if (!result.valid) {
      showToast(_i18n.t('needFormatFirst'), 2000, 'icon-alert-triangle');
      return;
    }
    openSaveModal();
  }

  function openSaveModal() {
    var modal = document.getElementById('save-modal');
    if (!modal) return;
    modal.classList.add('active');
    var input = document.getElementById('save-name-input');
    if (input) {
      input.value = '';
      if (!_router.isMobileDevice()) setTimeout(function () { input.focus(); }, 50);
    }
  }

  function closeSaveModal() {
    var modal = document.getElementById('save-modal');
    if (modal) modal.classList.remove('active');
  }

  function confirmSaveFromModal() {
    var formatted = _store.getStateForKey('output') || '';
    // 单条历史大小上限: 超大 JSON 会迅速写满 localStorage 配额,
    // setHistory 降级裁剪失败后会把整个 jsonHistory 键删除, 用户历史静默全丢
    if (formatted.length > HISTORY_MAX_CHARS) {
      showToast(_i18n.t('historyTooLarge'), 2500, 'icon-alert-triangle');
      return;
    }
    var nameInput = document.getElementById('save-name-input');
    var name = nameInput ? nameInput.value.trim() : '';
    var entry = _actions.confirmSave(formatted, name || _i18n.t('unnamed'));
    var history = _actions.getHistory();
    history.unshift(entry);
    _actions.setHistory(history);
    closeSaveModal();
    renderHistory();
    showToast(_i18n.t('saved', { name: entry.name }), 2000, 'icon-save');
  }

  function handleCompare() {
    var selectedIds = _store.getStateForKey('selectedIds') || [];
    if (selectedIds.length !== 2) return;
    var compareOrder = _store.getStateForKey('compareOrder') || [0, 1];
    var history = _actions.getHistory();
    var items = [
      history.find(function (h) { return h.id === selectedIds[compareOrder[0]]; }),
      history.find(function (h) { return h.id === selectedIds[compareOrder[1]]; }),
    ];
    if (!items[0] || !items[1]) return;
    renderCompareView(items, compareOrder);
  }

  function handleClearHistory() {
    var result = _actions.clearAllHistory();
    _actions.setHistory(result.history);
    _store.setState({ selectedIds: result.selectedIds });
    renderHistory();
    showToast(_i18n.t('historyCleared'), 2000, 'icon-trash');
  }

  /* ==============================================================
     i18n re-render (called when language changes)
  ============================================================== */
  function rerenderDynamicContent() {
    var output = _store.getStateForKey('output') || '';
    var type = _store.getStateForKey('outputType') || 'empty';
    var fixed = _store.getStateForKey('outputFixed') || false;
    var parsed = _store.getStateForKey('outputParsed') || null;
    if (output) {
      // Force a re-render: the store subscriber guards on _lastRenderContent,
      // so reset it to bypass the guard and let the JSON tree re-localize its
      // "N items"/"N keys" labels under the new language.
      _store.setState({ _lastRenderContent: '__force_i18n__' });
      renderOutput(output, type, fixed, parsed);
    }
    renderHistory();
    var sm = document.getElementById('status-msg');
    if (sm && (sm.textContent === _i18n.t('statusReady'))) {
      setStatus(_i18n.t('statusReady'));
    }
    var cc = document.getElementById('compare-container');
    if (cc && cc.classList.contains('active')) {
      renderHistory();
      var selectedIds = _store.getStateForKey('selectedIds') || [];
      if (selectedIds.length === 2) handleCompare();
    }
    var vi = document.getElementById('validation-indicator');
    if (vi && vi.style.display !== 'none') {
      vi.textContent = _i18n.t(vi.classList.contains('valid') ? 'valid' : 'invalid');
    }
  }

  /* ==============================================================
     Init
  ============================================================== */
  function init() {
    // render.js 先于 app.js 加载, 顶层求值时 window.i18n 尚不存在,
    // 这里重新绑定保证运行时 _i18n.t 走真实翻译表而不是返回 key 字面量
    if (window.i18n) _i18n = window.i18n;
    initSearch();
    initDragDrop();
    initKeyboard();
    initInputTracker();
    initWatermarkResizeHandler();
    bindDynamicDelegation();
    applyAllSettings();

    // Subscribe to store — 输出渲染的唯一入口（单向数据流）:
    // format/minify/stringify -> renderOutput() 只 setState,
    // 这里检测 output 状态变化后真正渲染 DOM, 保证状态与视图永远同步
    _store.subscribe(function (state) {
      if (state.output !== state._lastRenderContent || state.outputType !== state._lastRenderType) {
        // 先打标记再渲染: 渲染函数内部的 renderLineNumbers 等会触发 setState,
        // 重入此订阅者时变更检测不再成立, 避免无限递归
        _store.setState({
          _lastRenderContent: state.output,
          _lastRenderType: state.outputType,
          _lastRenderFixed: state.outputFixed,
          _lastRenderParsedObj: state.outputParsed,
        });
        if (!state.output || state.outputType === 'empty') {
          renderEmptyContent();
        } else if (state.outputType === 'text') {
          renderTextOutput(state.output);
        } else {
          renderRegularOutput(state.output);
        }
        // 移动端: 仅在输出真正变化时切到 output tab（避免每次 setState 都切）
        if (state.outputType && state.outputType !== 'empty' && _router.isMobileDevice()) {
          switchMobileTab('output');
        }
        // 输出已重建: 刷新搜索高亮, 防止存储的 <mark> 节点失效
        restoreSearchHighlights();
      }
    });
  }

  /* ==============================================================
     Export public API
  ============================================================== */
  window.__render = {
    // Actions
    formatFromInput: formatFromInput,
    minifyFromInput: minifyFromInput,
    stringifyFromInput: stringifyFromInput,
    handleCopy: handleCopy,
    handleDownload: handleDownload,
    handleClear: handleClear,
    handleToggleTheme: handleToggleTheme,
    saveHistoryFromOutput: saveHistoryFromOutput,
    handleCompare: handleCompare,
    handleClearHistory: handleClearHistory,
    closeCompare: closeCompare,
    reverseCompare: reverseCompare,
    // UI
    openSaveModal: openSaveModal,
    closeSaveModal: closeSaveModal,
    confirmSaveFromModal: confirmSaveFromModal,
    openSettings: openSettings,
    closeSettings: closeSettings,
    commitSettingsFromForm: commitSettingsFromForm,
    pickBackgroundImage: pickBackgroundImage,
    handleBackgroundImageFile: handleBackgroundImageFile,
    clearBackgroundImage: clearBackgroundImage,
    resetAllSettings: resetAllSettings,
    // Switchers
    toggleSidebar: toggleSidebar,
    switchMobileTab: switchMobileTab,
    toggleMobileMore: toggleMobileMore,
    // Search
    openSearch: openSearch,
    closeSearch: closeSearch,
    toggleSearch: toggleSearch,
    performSearch: performSearch,
    nextMatch: nextMatch,
    prevMatch: prevMatch,
    // Init
    init: init,
    rerenderDynamicContent: rerenderDynamicContent,
    // Toast (带 XSS 转义, 外部调用请走这里而不是直接改 toast.innerHTML)
    showToast: showToast,
  };
})();

;
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
      historyTooLarge: '记录过大，无法保存（上限 500KB）',
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
      bgImageLabel: '背景图片', bgImageHint: '支持常见图片格式（JPG/PNG/WebP/HEIC 等）',
      bgImageUpload: '选择图片', bgImageClear: '清除图片',
      bgImageOpacity: '背景透明度', settingsSaved: '设置已保存', resetSettings: '恢复默认',
      bgImageTooLarge: '图片过大，请选择 ≤ 2MB 的图片',
      settingsSaveFailed: '设置保存失败，存储空间可能不足',
      bgImageUnsupported: '图片无法显示，当前浏览器不支持该格式',
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
      historyTooLarge: 'Entry too large to save (max 500KB)',
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
      bgImageLabel: 'Background Image', bgImageHint: 'Common image formats supported (JPG/PNG/WebP/HEIC etc.)',
      bgImageUpload: 'Choose Image', bgImageClear: 'Clear Image',
      bgImageOpacity: 'Background Opacity', settingsSaved: 'Settings saved', resetSettings: 'Reset to Default',
      bgImageTooLarge: 'Image too large, choose ≤ 2MB',
      settingsSaveFailed: 'Failed to save settings, storage may be full',
      bgImageUnsupported: 'Image cannot be displayed, format not supported by this browser',
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
    // 状态栏快捷键: macOS 用 ⌘ 替代 Ctrl
    var shortcutsEl = document.getElementById('status-shortcuts');
    if (shortcutsEl) {
      var shortcutsText = i18n.t('statusShortcuts');
      if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
        shortcutsText = shortcutsText.replace(/Ctrl/g, '\u2318');
      }
      shortcutsEl.textContent = shortcutsText;
    }
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
    // 实时同步到 window.* 只读 getter: 外部代码读取时始终拿到 store 最新值,
    // 而不是初始化时拷贝一次后永久过期
    if (window.__store) {
      var liveState = {
        selectedIds: { key: 'selectedIds', def: [] },
        compareOrder: { key: 'compareOrder', def: [0, 1] },
        lastFormattedContent: { key: 'output', def: '' },
        lastOutputLineCount: { key: 'lastOutputLineCount', def: 0 },
        lastParsedJson: { key: 'outputParsed', def: null },
        listSelectedIndex: { key: 'listSelectedIndex', def: 0 },
        lastDetailContent: { key: 'lastDetailContent', def: '' },
      };
      for (var gk in liveState) {
        if (liveState.hasOwnProperty(gk) && typeof window[gk] === 'undefined') {
          (function (name, cfg) {
            Object.defineProperty(window, name, {
              configurable: true,
              get: function () {
                var v = window.__store.getStateForKey(cfg.key);
                return v === undefined || v === null ? cfg.def : v;
              }
            });
          })(gk, liveState[gk]);
        }
      }
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
