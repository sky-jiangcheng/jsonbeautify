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
