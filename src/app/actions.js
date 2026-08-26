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

  function normalizeHistoryItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || raw._id || '');
    if (!id) id = 'legacy-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    var name = String(raw.name || raw.title || raw.label || '');
    if (!name) name = 'untitled';
    var content = '';
    // 跨版本字段兼容：历史上可能用过 content / json / text / data / value 等字段存内容
    if (typeof raw.content === 'string') content = raw.content;
    else if (typeof raw.json === 'string') content = raw.json;
    else if (typeof raw.text === 'string') content = raw.text;
    else if (typeof raw.data === 'string') content = raw.data;
    else if (typeof raw.value === 'string') content = raw.value;
    // 老版本 {id, entries:[...]} 这种容器对象也尝试兜底取出第一个字符串
    else if (raw && typeof raw === 'object') {
      for (var k in raw) {
        var v = raw[k];
        if (typeof v === 'string' && v.length > 0 && /[{["\d\-tfnsu]/.test(v.charAt(0) === ' ' ? v.trimLeft().charAt(0) : v.charAt(0))) {
          content = v;
          break;
        }
      }
    }
    // 如果字符串本身是 stringify 过的一层 shell ("\"...\"") 就解一次
    if (content && content.length > 2 && content.charCodeAt(0) === 34 && content.charCodeAt(content.length - 1) === 34) {
      try { content = JSON.parse(content); } catch (_) {}
    }
    // 单条超大记录的降级提示：不丢弃数据，但后续调用方可以根据 size 决定 UI 提示
    var sizeBytes = content.length;
    return { id: id, name: name, content: String(content || ''), _legacy: true, _size: sizeBytes };
  }

  function getHistory() {
    var raw = null;
    try {
      raw = JSON.parse(localStorage.getItem('jsonHistory') || '[]');
    } catch (e) {
      try { localStorage.removeItem('jsonHistory'); } catch (_) {}
      return [];
    }
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var n = normalizeHistoryItem(raw[i]);
      if (n) out.push(n);
    }
    return out;
  }

  function setHistory(arr) {
    try {
      // 裁剪上限,避免超大历史撑爆 localStorage 配额
      if (Array.isArray(arr)) {
        var normalized = [];
        for (var i = 0; i < Math.min(arr.length, 100); i++) {
          var n = normalizeHistoryItem(arr[i]);
          if (n) normalized.push({ id: n.id, name: n.name, content: n.content });
        }
        arr = normalized;
      }
      localStorage.setItem('jsonHistory', JSON.stringify(arr));
    } catch (e) {
      // 配额满/序列化失败时静默降级: 尝试只保留最近的 20 条再写一次
      console.warn('[actions] setHistory failed, trimming:', e);
      try {
        if (Array.isArray(arr)) {
          var trimmed = [];
          for (var j = 0; j < Math.min(arr.length, 20); j++) {
            var m = normalizeHistoryItem(arr[j]);
            if (m) trimmed.push({ id: m.id, name: m.name, content: m.content });
          }
          localStorage.setItem('jsonHistory', JSON.stringify(trimmed));
        }
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
    var stack = [];
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
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }
    var fixed = s, ok = stack.length > 0;
    while (stack.length > 0) {
      fixed += stack.pop();
    }
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
      if (!jsonObj && uq !== v) {
        var fixUqResult = tryFixJson(uq);
        if (fixUqResult.success) {
          try {
            jsonObj = JSON.parse(fixUqResult.json);
            fixed = true;
            fixMsg = 'autoQuoteId';
          } catch (e3) {}
        }
      }
      if (!jsonObj) {
        var fixResult = tryFixJson(v);
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
