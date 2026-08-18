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
    localStorage.setItem('jsonHistory', JSON.stringify(arr));
  }

  function tryFixUnquotedKeys(input) {
    return input.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
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
