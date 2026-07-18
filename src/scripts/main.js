/* ==============================================================
   State
============================================================== */
window.selectedIds = [];
window.compareOrder = [0, 1];
window.lastFormattedContent = '';
window.lastOutputLineCount = 0;
window.lastParsedJson = null;
window.listSelectedIndex = 0;
window.lastDetailContent = '';

/* ==============================================================
   Utilities
============================================================== */
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(msg, duration, iconId) {
    const t = document.getElementById('toast');
    const iconSvg = iconId ? `<svg class="svg-icon-sm" viewBox="0 0 24 24"><use href="#${iconId}"/></svg>` : '';
    t.innerHTML = iconSvg + escapeHtml(msg);
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration || 2000);
}

function setStatus(msg) {
    document.getElementById('status-msg').textContent = msg;
}

function getHistory() {
    return JSON.parse(localStorage.getItem('jsonHistory') || '[]');
}

function setHistory(arr) {
    localStorage.setItem('jsonHistory', JSON.stringify(arr));
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/* I18N - see i18n.js */

/* ==============================================================
   Output Line Numbers
============================================================== */
function renderLineNumbers(lineCount) {
    const area = document.getElementById('output-content-area');
    let linenos = area.querySelector('.output-linenos');
    if (lineCount > 0) {
        if (!linenos) {
            linenos = document.createElement('div');
            linenos.className = 'output-linenos';
            area.insertBefore(linenos, area.firstChild);
        }
        linenos.innerHTML = Array.from({length: lineCount}, (_, i) => `<span>${i + 1}</span>`).join('');
        window.lastOutputLineCount = lineCount;
    } else if (linenos) {
        linenos.remove();
        window.lastOutputLineCount = 0;
    }
}

function syncLineNumberScroll() {
    const area = document.getElementById('output-content-area');
    const content = area.querySelector('.output-content');
    const linenos = area.querySelector('.output-linenos');
    if (content && linenos) {
        linenos.scrollTop = content.scrollTop;
    }
}

/* ==============================================================
   Core: Format / Minify / Fix
============================================================== */
function getFriendlyJsonError(error, input) {
    var msg = error.message || String(error);
    var raw = msg;
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
            return i18n.t('unquotedIdDetected', {id: id}) + '\n' + i18n.t('unquotedIdHint') + context;
        }
        return i18n.t('jsonSyntaxError', {msg: msg}) + context;
    }

    if (msg.indexOf('Unexpected end of JSON') >= 0) {
        return i18n.t('jsonIncomplete') + context;
    }

    if (msg.indexOf('Expected') >= 0 && msg.indexOf('got') >= 0) {
        return i18n.t('jsonSyntaxError', {msg: msg}) + context;
    }

    if (msg.indexOf('Unexpected string') >= 0) {
        return i18n.t('stringMisplaced') + context;
    }

    if (msg.indexOf('Unexpected number') >= 0) {
        return i18n.t('numberError') + context;
    }

    return i18n.t('jsonSyntaxError', {msg: msg}) + context;
}

function tryFixUnquotedKeys(input) {
    var result = input.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    return result;
}

function tryFixJson(str) {
    let s = str.trim();
    let lc = (s.match(/\{/g) || []).length;
    let rc = (s.match(/\}/g) || []).length;
    let ls = (s.match(/\[/g) || []).length;
    let rs = (s.match(/\]/g) || []).length;
    let fixed = s, ok = false;
    while (lc > rc) { fixed += '}'; rc++; ok = true; }
    while (ls > rs) { fixed += ']'; rs++; ok = true; }
    return { success: ok, json: fixed };
}

function getIndent() { return 2; }

function formatJSON() {
    const input = document.getElementById('input');
    const value = input.value.trim();
    clearNotifications();
    if (!value) {
        renderOutput('', 'empty');
        setStatus(i18n.t('inputEmpty'));
        return;
    }

    let jsonObj = null;
    let fixed = false;
    try {
        jsonObj = JSON.parse(value);
    } catch (error) {
        var fixMsg = '';
        var v = value;
        var uq = tryFixUnquotedKeys(v);
        if (uq !== v) {
            try {
                jsonObj = JSON.parse(uq);
                fixed = true;
                fixMsg = i18n.t('autoQuoteId');
            } catch (e2) {}
        }
        if (!jsonObj) {
            const fixResult = tryFixJson(v);
            if (fixResult.success) {
                try {
                    jsonObj = JSON.parse(fixResult.json);
                    fixed = true;
                    fixMsg = fixMsg || i18n.t('autoBracket');
                } catch (e2) {
                    showError(error, value);
                    return;
                }
            } else {
                showError(error, value);
                return;
            }
        }
    }

    const indent = 2;
    window.lastFormattedContent = JSON.stringify(jsonObj, null, indent);
    window.lastParsedJson = jsonObj;
    renderOutput(window.lastFormattedContent, 'json', fixed, jsonObj);
    setStatus(i18n.t('formatSuccess') + (fixed ? fixMsg : ''));
    updateOutputStatus(window.lastFormattedContent);
}

function minifyJSON() {
    const input = document.getElementById('input');
    const value = input.value.trim();
    clearNotifications();
    if (!value) {
        showToast(i18n.t('inputEmptyToast'), 2000, 'icon-alert-triangle');
        return;
    }

    let jsonObj = null;
    let fixed = false;
    try {
        jsonObj = JSON.parse(value);
    } catch (error) {
        var v = value;
        var uq = tryFixUnquotedKeys(v);
        if (uq !== v) {
            try { jsonObj = JSON.parse(uq); fixed = true; } catch (e2) {}
        }
        if (!jsonObj) {
            const fixResult = tryFixJson(v);
            if (fixResult.success) {
                try { jsonObj = JSON.parse(fixResult.json); fixed = true; } catch (e2) {
                    showError(error, value);
                    return;
                }
            } else {
                showError(error, value);
                return;
            }
        }
    }

    window.lastFormattedContent = JSON.stringify(jsonObj);
    window.lastParsedJson = jsonObj;
    renderOutput(window.lastFormattedContent, 'text', fixed, jsonObj);
    setStatus(i18n.t('minifySuccess') + (fixed ? i18n.t('autoBracket') : ''));
    updateOutputStatus(window.lastFormattedContent);
}

/* ==============================================================
   Output Rendering
============================================================== */
function clearNotifications() {
    document.getElementById('output-notifications').innerHTML = '';
}

function showNotification(type, message) {
    clearNotifications();
    const container = document.getElementById('output-notifications');
    const div = document.createElement('div');
    div.className = 'output-notification ' + type;
    div.textContent = message;
    container.appendChild(div);
}

function renderErrorOutput(error, input) {
    var msg = getFriendlyJsonError(error, input);
    var posMatch = error.message.match(/position\s+(\d+)/i);
    var pos = posMatch ? parseInt(posMatch[1]) : -1;

    var snippetHtml = '';
    if (pos >= 0 && input) {
        var start = Math.max(0, pos - 60);
        var end = Math.min(input.length, pos + 60);
        var before = escapeHtml(input.substring(start, pos));
        var at = escapeHtml(input.charAt(pos) || '');
        var after = escapeHtml(input.substring(pos + 1, end));
        if (start > 0) snippetHtml += '…';
        snippetHtml += before + '<span class="error-marker">' + at + '</span>' + after;
        if (end < input.length) snippetHtml += '…';
    }

    var area = document.getElementById('output-content-area');
    var lineCount = input ? input.substring(0, pos).split('\n').length : 0;

    var hints = [
        i18n.t('ruleKeys'),
        i18n.t('ruleComma'),
        i18n.t('ruleBool'),
        i18n.t('ruleNull'),
        i18n.t('ruleBracket')
    ];

    area.innerHTML = '<div class="error-display">' +
        '<div class="error-title">' + i18n.t('errorTitle') + '</div>' +
        '<div class="error-msg">' + escapeHtml(msg.split('\n')[0]) + '</div>' +
        (snippetHtml ? '<div class="error-snippet">' + snippetHtml + '</div>' : '') +
        (lineCount ? '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + i18n.t('nearLine', {line: lineCount}) + '</div>' : '') +
        '<div class="error-hint">' + i18n.t('jsonRules') + hints.join('; ') + '</div>' +
        '</div>';
    renderLineNumbers(0);
}

function showError(error, input) {
    renderErrorOutput(error, input);
    setStatus(i18n.t('jsonError'));
}

function renderEmptyContent() {
    const area = document.getElementById('output-content-area');
    area.innerHTML = `
        <div class="output-placeholder" id="output-placeholder">
            <svg class="svg-icon" viewBox="0 0 24 24"><use href="#icon-braces"/></svg>
            ${i18n.t('outputPlaceholder')}
        </div>`;
    renderLineNumbers(0);
}

function renderTextOutput(content) {
    const area = document.getElementById('output-content-area');
    area.innerHTML = '<div class="output-content"><pre><code class="language-json hljs"></code></pre></div>';
    const lineCount = content.split('\n').length;
    renderLineNumbers(lineCount);
    const codeEl = area.querySelector('code');
    if (codeEl) { codeEl.textContent = content; hljs.highlightElement(codeEl); }
    const contentEl = area.querySelector('.output-content');
    if (contentEl) {
        contentEl.addEventListener('scroll', syncLineNumberScroll, { once: false });
    }
}

function renderOutput(content, type, fixed, parsedObj) {
    // Store for re-render on language change
    window._lastRenderContent = content;
    window._lastRenderType = type;
    window._lastRenderFixed = fixed || false;
    window._lastRenderParsedObj = parsedObj || null;

    if (type === 'empty') {
        renderEmptyContent();
        return;
    }

    if (type === 'text') {
        renderTextOutput(content);
        return;
    }

    if (type === 'json') {
        if (parsedObj && Array.isArray(parsedObj)) {
            renderListOutput(parsedObj);
        } else {
            renderRegularOutput(content);
        }
        if (fixed) {
            showNotification('warning', i18n.t('autoBracketNotification'));
        }
    }
}

function renderRegularOutput(content) {
    const area = document.getElementById('output-content-area');
    var obj;
    try { obj = JSON.parse(content); } catch (e) { obj = null; }

    var treeHtml = obj !== null ? renderJsonNode(null, obj) : '<pre><code class="language-json hljs">' + escapeHtml(content) + '</code></pre>';
    area.innerHTML = '<div class="output-content"><div class="json-tree">' + treeHtml + '</div></div>';

    var treeEl = area.querySelector('.json-tree');
    var lineCount = treeEl ? countVisibleLines(treeEl, true) : content.split('\n').length;
    renderLineNumbers(lineCount);

    if (obj === null) {
        var codeEl = area.querySelector('code');
        if (codeEl) { codeEl.textContent = content; hljs.highlightElement(codeEl); }
    }

    var contentEl = area.querySelector('.output-content');
    if (contentEl) {
        contentEl.addEventListener('scroll', syncLineNumberScroll, { once: false });
    }
}

function renderListOutput(arr) {
    const area = document.getElementById('output-content-area');
    area.innerHTML = `
        <div class="list-view" id="list-view">
            <div class="list-panel" id="list-panel">
                <div class="list-panel-header">
                    <span class="list-title">${i18n.t('listTitle', {count: arr.length})}</span>
                    <button class="list-panel-toggle" id="list-panel-toggle" onclick="toggleListPanel()" title="${i18n.t('collapseList')}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                </div>
                <div class="list-panel-body" id="list-panel-body"></div>
            </div>
            <div class="list-detail" id="list-detail">
                <div class="list-expand-tab" id="list-expand-tab" onclick="toggleListPanel()" title="${i18n.t('expandList')}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div class="list-detail-linenos" id="list-detail-linenos"></div>
                <div class="list-detail-content" id="list-detail-content"></div>
            </div>
        </div>`;

    const listPanelBody = document.getElementById('list-panel-body');
    window._listArr = arr;

    if (arr.length === 0) {
        listPanelBody.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center">' + i18n.t('emptyArray') + '</div>';
        return;
    }

    arr.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span class="list-item-index">[${i}]</span>
            <span class="list-item-preview">${escapeHtml(getItemPreview(item))}</span>`;
        div.addEventListener('click', () => selectListItem(i, arr));
        listPanelBody.appendChild(div);
    });

    window.listSelectedIndex = 0;
    selectListItem(0, arr);
}

function toggleListPanel() {
    const panel = document.getElementById('list-panel');
    const view = document.getElementById('list-view');
    panel.classList.toggle('collapsed');
    view.classList.toggle('list-collapsed');
}

function selectListItem(index, arr) {
    window.listSelectedIndex = index;
    window.lastDetailContent = JSON.stringify(arr[index], null, getIndent());
    const items = document.querySelectorAll('.list-item');
    items.forEach((el, i) => el.classList.toggle('active', i === index));

    const detailContent = document.getElementById('list-detail-content');
    const detailLinenos = document.getElementById('list-detail-linenos');

    detailContent.innerHTML = '<div class="json-tree">' + renderJsonNode(null, arr[index]) + '</div>';
    updateTreeLineNumbers();

    detailContent.addEventListener('scroll', () => {
        detailLinenos.scrollTop = detailContent.scrollTop;
    }, { once: false });
}

function renderJsonNode(key, value) {
    var prefix = key !== null ? '<span class="jt-key">' + JSON.stringify(key) + '</span>: ' : '';

    if (value === null) return '<span class="jt-line">' + prefix + '<span class="jt-null">null</span></span>';
    if (typeof value === 'boolean') return '<span class="jt-line">' + prefix + '<span class="jt-bool">' + value + '</span></span>';
    if (typeof value === 'number') return '<span class="jt-line">' + prefix + '<span class="jt-number">' + value + '</span></span>';
    if (typeof value === 'string') return '<span class="jt-line">' + prefix + '<span class="jt-string">' + JSON.stringify(value) + '</span></span>';

    if (Array.isArray(value)) {
        var count = value.length;
        if (count === 0) return '<span class="jt-line">' + prefix + '<span class="jt-bracket">[]</span></span>';
        var html = '<div class="jt-group">';
        html += '<span class="jt-line">' + prefix + '<span class="jt-toggle" onclick="toggleJsonNode(this)">&#9660;</span><span class="jt-bracket">[</span><span class="jt-collapsed-summary"> [' + i18n.t('items', {count: count}) + ']</span></span>';
        html += '<div class="jt-children">';
        for (var i = 0; i < count; i++) {
            html += renderJsonNode(String(i), value[i]);
            if (i < count - 1) {
                html = html.replace(/<\/span>$/, '<span class="jt-comma">,</span></span>');
            }
        }
        html += '</div>';
        html += '<span class="jt-line jt-closing"><span class="jt-bracket">]</span></span>';
        html += '</div>';
        return html;
    }

    if (typeof value === 'object') {
        var keys = Object.keys(value);
        var count = keys.length;
        if (count === 0) return '<span class="jt-line">' + prefix + '<span class="jt-bracket">{}</span></span>';
        var html = '<div class="jt-group">';
        html += '<span class="jt-line">' + prefix + '<span class="jt-toggle" onclick="toggleJsonNode(this)">&#9660;</span><span class="jt-bracket">{</span><span class="jt-collapsed-summary"> {' + i18n.t('keys', {count: count}) + '}</span></span>';
        html += '<div class="jt-children">';
        for (var k = 0; k < count; k++) {
            html += renderJsonNode(keys[k], value[keys[k]]);
            if (k < count - 1) {
                html = html.replace(/<\/span>$/, '<span class="jt-comma">,</span></span>');
            }
        }
        html += '</div>';
        html += '<span class="jt-line jt-closing"><span class="jt-bracket">}</span></span>';
        html += '</div>';
        return html;
    }

    return '';
}

function toggleJsonNode(el) {
    var group = el.closest('.jt-group');
    if (group) {
        group.classList.toggle('collapsed');
        var toggle = group.querySelector('.jt-toggle');
        toggle.innerHTML = group.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
        updateTreeLineNumbers();
    }
}

function updateTreeLineNumbers() {
    var target = document.getElementById('list-detail-linenos');
    if (!target) target = document.querySelector('.output-linenos');
    var tree = document.querySelector('.json-tree');
    if (!target || !tree) return;
    var count = countVisibleLines(tree, true);
    target.innerHTML = '';
    for (var i = 0; i < count; i++) {
        var span = document.createElement('span');
        span.textContent = i + 1;
        target.appendChild(span);
    }
}

function countVisibleLines(el, skipHidden) {
    if (!skipHidden && el.offsetParent === null && el.style.display === 'none') return 0;
    if (el.classList.contains('jt-line') && (skipHidden || el.offsetParent !== null)) {
        return 1;
    }
    var count = 0;
    for (var i = 0; i < el.children.length; i++) {
        count += countVisibleLines(el.children[i], false);
    }
    return count;
}

function getItemPreview(item) {
    if (item === null) return 'null';
    if (item === undefined) return 'undefined';
    if (typeof item === 'boolean') return String(item);
    if (typeof item === 'number') return String(item);
    if (typeof item === 'string') {
        return item.length > 50 ? '"' + item.substring(0, 50) + '..."' : JSON.stringify(item);
    }
    if (Array.isArray(item)) {
        return '[...] (' + i18n.t('items', {count: item.length}) + ')';
    }
    if (typeof item === 'object') {
        const keys = Object.keys(item);
        const preview = keys.slice(0, 2).join(', ');
        return '{' + preview + (keys.length > 2 ? ', ...' : '') + '} (' + i18n.t('keys', {count: keys.length}) + ')';
    }
    return String(item);
}

function updateOutputStatus(content) {
    const lines = content.split('\n').length;
    const size = new Blob([content]).size;
    document.getElementById('output-status').textContent = lines + ' ' + i18n.t('lineCount') + ' ' + formatBytes(size);
}

/* ==============================================================
   Copy / Download / Clear
============================================================== */
function copyOutput() {
    let content = window.lastDetailContent || window.lastFormattedContent;
    if (!content) {
        showToast(i18n.t('nothingToCopy'), 2000, 'icon-alert-triangle');
        return;
    }
    navigator.clipboard.writeText(content).then(() => {
        showToast(i18n.t('copied'), 2000, 'icon-check');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(i18n.t('copied'), 2000, 'icon-check');
    });
}

function downloadJSON() {
    if (!window.lastFormattedContent) {
        showToast(i18n.t('nothingToDownload'), 2000, 'icon-alert-triangle');
        return;
    }
    const blob = new Blob([window.lastFormattedContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(i18n.t('downloaded'), 2000, 'icon-download');
}

function clearContent() {
    document.getElementById('input').value = '';
    window.lastFormattedContent = '';
    window.lastParsedJson = null;
    window.lastDetailContent = '';
    clearNotifications();
    renderOutput('', 'empty');
    document.getElementById('input-size').textContent = '';
    document.getElementById('output-status').textContent = '';
    setStatus(i18n.t('cleared'));
}

/* ==============================================================
   Upload / Stringify / Unstringify
============================================================== */
function uploadFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json,text/plain';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            document.getElementById('input').value = String(reader.result);
            document.getElementById('input').dispatchEvent(new Event('input'));
            showToast(i18n.t('loaded', {name: file.name}), 2000, 'icon-folder-open');
        };
        reader.readAsText(file);
    };
    input.click();
}

function stringifyJSON() {
    const input = document.getElementById('input');
    const value = input.value.trim();
    clearNotifications();
    if (!value) {
        showToast(i18n.t('inputEmptyToast'), 2000, 'icon-alert-triangle');
        return;
    }

    let jsonObj = null;
    let fixed = false;
    try {
        jsonObj = JSON.parse(value);
    } catch (error) {
        var v = value;
        var uq = tryFixUnquotedKeys(v);
        if (uq !== v) {
            try { jsonObj = JSON.parse(uq); fixed = true; } catch (e2) {}
        }
        if (!jsonObj) {
            const fixResult = tryFixJson(v);
            if (fixResult.success) {
                try { jsonObj = JSON.parse(fixResult.json); fixed = true; } catch (e2) {
                    showError(error, value);
                    return;
                }
            } else {
                showError(error, value);
                return;
            }
        }
    }

    const result = JSON.stringify(JSON.stringify(jsonObj));
    window.lastFormattedContent = result;
    window.lastParsedJson = jsonObj;
    renderOutput(result, 'text', false, result);
    setStatus(i18n.t('escapeSuccess') + (fixed ? i18n.t('autoBracket') : ''));
    updateOutputStatus(result);
}

/* ==============================================================
   History
============================================================== */
function saveHistory() {
    if (!window.lastFormattedContent) {
        showToast(i18n.t('needFormatFirst'), 2000, 'icon-alert-triangle');
        return;
    }
    openSaveModal();
}

function openSaveModal() {
    document.getElementById('save-modal').classList.add('active');
    const input = document.getElementById('save-name-input');
    input.value = '';
    setTimeout(() => input.focus(), 50);
}

function closeSaveModal() {
    document.getElementById('save-modal').classList.remove('active');
}

function confirmSave() {
    let name = document.getElementById('save-name-input').value.trim() || i18n.t('unnamed');
    const id = Date.now();
    const history = getHistory();
    history.unshift({ id, name, content: window.lastFormattedContent });
    setHistory(history);
    closeSaveModal();
    renderHistory();
    showToast(i18n.t('saved', {name: name}), 2000, 'icon-save');
}

function deleteHistory(id) {
    let history = getHistory().filter(item => item.id !== id);
    setHistory(history);
    window.selectedIds = window.selectedIds.filter(i => i !== id);
    renderHistory();
}

function clearAllHistory() {
    if (getHistory().length === 0) return;
    setHistory([]);
    window.selectedIds = [];
    renderHistory();
    showToast(i18n.t('historyCleared'), 2000, 'icon-trash');
}

function loadHistory(id) {
    const history = getHistory();
    const item = history.find(h => h.id === id);
    if (!item) return;
    document.getElementById('input').value = item.content;
    formatJSON();
    showToast(i18n.t('loaded', {name: item.name}), 2000, 'icon-file-text');
}

function toggleSelect(id) {
    if (window.selectedIds.includes(id)) {
        window.selectedIds = window.selectedIds.filter(i => i !== id);
    } else {
        if (window.selectedIds.length < 2) {
            window.selectedIds.push(id);
        } else {
            window.selectedIds = [window.selectedIds[1], id];
        }
    }
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    const list = document.getElementById('history-list');
    const compareBtn = document.getElementById('compare-btn');

    if (history.length === 0) {
        list.innerHTML = `
            <div class="history-empty">
                <svg class="svg-icon" viewBox="0 0 24 24"><use href="#icon-clock"/></svg>
                <div>${i18n.t('noHistory')}</div>
                <div style="font-size:11px;opacity:0.6">${i18n.t('noHistoryHint')}</div>
            </div>`;
        compareBtn.disabled = true;
        return;
    }

    list.innerHTML = history.map(item => {
        const snippet = item.content.replace(/\s+/g, '').slice(0, 50);
        const checked = window.selectedIds.includes(item.id) ? 'checked' : '';
        const selected = window.selectedIds.includes(item.id) ? 'selected' : '';
        return `
            <div class="history-item ${selected}" onclick="loadHistory(${item.id})">
                <input type="checkbox" class="history-checkbox"
                       onclick="event.stopPropagation();toggleSelect(${item.id})"
                       ${checked} title="${i18n.t('selectForCompare')}" />
                <div class="history-info">
                    <div class="history-name">${escapeHtml(item.name)}</div>
                    <div class="history-snippet">${escapeHtml(snippet)}</div>
                </div>
                <button class="history-delete" onclick="event.stopPropagation();deleteHistory(${item.id})" title="${i18n.t('deleteItem')}">&times;</button>
            </div>`;
    }).join('');

    compareBtn.disabled = window.selectedIds.length !== 2;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('sidebar-open-btn');
    sidebar.classList.toggle('collapsed');
    openBtn.style.display = sidebar.classList.contains('collapsed') ? 'block' : 'none';
}

/* ==============================================================
   Compare View
============================================================== */
function compareSelected() {
    if (window.selectedIds.length !== 2) return;
    const history = getHistory();
    const items = [
        history.find(h => h.id === window.selectedIds[window.compareOrder[0]]),
        history.find(h => h.id === window.selectedIds[window.compareOrder[1]])
    ];
    if (!items[0] || !items[1]) return;

    document.getElementById('compare-left-title').textContent = items[0].name;
    document.getElementById('compare-right-title').textContent = items[1].name;
    document.getElementById('compare-left-content').innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">' + i18n.t('compareLoading') + '</div>';
    document.getElementById('compare-right-content').innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">' + i18n.t('compareLoading') + '</div>';
    document.getElementById('compare-container').classList.add('active');

    const leftScroll = document.getElementById('compare-left-content');
    const rightScroll = document.getElementById('compare-right-content');
    let syncing = false;
    leftScroll.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        rightScroll.scrollTop = leftScroll.scrollTop;
        requestAnimationFrame(() => { syncing = false; });
    });
    rightScroll.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        leftScroll.scrollTop = rightScroll.scrollTop;
        requestAnimationFrame(() => { syncing = false; });
    });

    requestAnimationFrame(() => {
        var oldObj, newObj;
        try { oldObj = JSON.parse(items[0].content); } catch { oldObj = items[0].content; }
        try { newObj = JSON.parse(items[1].content); } catch { newObj = items[1].content; }

        var diff = diffJson(oldObj, newObj);
        var leftMap = {}, rightMap = {};
        collectDiffPaths(diff, '', leftMap, rightMap);

        var leftHtml = renderJsonNodeWithDiff(null, oldObj, '', leftMap, 'left', oldObj);
        var rightHtml = renderJsonNodeWithDiff(null, newObj, '', rightMap, 'right', newObj);

        document.getElementById('compare-left-content').innerHTML = '<div class="json-tree">' + leftHtml + '</div>';
        document.getElementById('compare-right-content').innerHTML = '<div class="json-tree">' + rightHtml + '</div>';
    });
}

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
        var k = allKeys[i];
        if (!(k in a)) { children.push({ k: k, d: { t: 'add', v: b[k] } }); hasDiff = true; }
        else if (!(k in b)) { children.push({ k: k, d: { t: 'rem', v: a[k] } }); hasDiff = true; }
        else { var cd = diffJson(a[k], b[k]); children.push({ k: k, d: cd }); if (cd.t !== 'same') hasDiff = true; }
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
                collectDiffPaths(d.c[i].d, path ? path + '/' + d.c[i].k : d.c[i].k, leftMap, rightMap);
            }
            break;
    }
}

function renderJsonNodeWithDiff(key, value, path, diffMap, side, rootVal) {
    var prefix = key !== null ? '<span class="jt-key">' + JSON.stringify(key) + '</span>: ' : '';
    var diffType = diffMap[path] || '';

    if (value === null) return '<span class="jt-line' + (diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '') + '">' + prefix + '<span class="jt-null">null</span></span>';
    if (typeof value === 'boolean') return '<span class="jt-line' + (diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '') + '">' + prefix + '<span class="jt-bool">' + value + '</span></span>';
    if (typeof value === 'number') return '<span class="jt-line' + (diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '') + '">' + prefix + '<span class="jt-number">' + value + '</span></span>';
    if (typeof value === 'string') return '<span class="jt-line' + (diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '') + '">' + prefix + '<span class="jt-string">' + JSON.stringify(value) + '</span></span>';

    if (Array.isArray(value)) {
        var count = value.length;
        if (count === 0) return '<span class="jt-line' + (diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '') + '">' + prefix + '<span class="jt-bracket">[]</span></span>';
        var groupCls = diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '';
        var html = '<div class="jt-group' + groupCls + '">';
        html += '<span class="jt-line">' + prefix + '<span class="jt-toggle" onclick="toggleJsonNode(this)">&#9660;</span><span class="jt-bracket">[</span><span class="jt-collapsed-summary"> [' + i18n.t('items', {count: count}) + ']</span></span>';
        html += '<div class="jt-children">';
        for (var i = 0; i < count; i++) {
            html += renderJsonNodeWithDiff(String(i), value[i], path ? path + '/' + i : String(i), diffMap, side, rootVal);
            if (i < count - 1) {
                html = html.replace(/<\/span>$/, '<span class="jt-comma">,</span></span>');
            }
        }
        html += '</div>';
        html += '<span class="jt-line jt-closing"><span class="jt-bracket">]</span></span>';
        html += '</div>';
        return html;
    }

    if (typeof value === 'object') {
        var keys = Object.keys(value);
        var count = keys.length;
        if (count === 0) return '<span class="jt-line' + (diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '') + '">' + prefix + '<span class="jt-bracket">{}</span></span>';
        var groupCls = diffType ? ' jt-diff-' + (diffType === 'chg' ? 'changed' : diffType === 'add' ? 'added' : 'removed') : '';
        var html = '<div class="jt-group' + groupCls + '">';
        html += '<span class="jt-line">' + prefix + '<span class="jt-toggle" onclick="toggleJsonNode(this)">&#9660;</span><span class="jt-bracket">{</span><span class="jt-collapsed-summary"> {' + i18n.t('keys', {count: count}) + '}</span></span>';
        html += '<div class="jt-children">';
        for (var k = 0; k < count; k++) {
            var keyStr = keys[k];
            var childPath = path ? path + '/' + keyStr : keyStr;
            html += renderJsonNodeWithDiff(keyStr, value[keyStr], childPath, diffMap, side, rootVal);
            if (k < count - 1) {
                html = html.replace(/<\/span>$/, '<span class="jt-comma">,</span></span>');
            }
        }
        html += '</div>';
        html += '<span class="jt-line jt-closing"><span class="jt-bracket">}</span></span>';
        html += '</div>';
        return html;
    }
    return '';
}

function reverseCompare() {
    window.compareOrder.reverse();
    compareSelected();
}

function closeCompare() {
    document.getElementById('compare-container').classList.remove('active');
}

/* ==============================================================
   Drag & Drop
============================================================== */
function initDragDrop() {
    const inputBody = document.getElementById('input-body');
    const overlay = document.getElementById('drop-overlay');
    let dragCounter = 0;

    inputBody.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.classList.add('active');
    });

    inputBody.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) overlay.classList.remove('active');
    });

    inputBody.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    inputBody.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('active');

        const file = e.dataTransfer.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            showToast(i18n.t('jsonOnly'), 3000, 'icon-alert-triangle');
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            document.getElementById('input').value = evt.target.result;
            formatJSON();
            showToast(i18n.t('loaded', {name: file.name}), 3000, 'icon-file-text');
        };
        reader.readAsText(file);
    });
}

/* ==============================================================
   Keyboard Shortcuts
============================================================== */
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const mod = isMac ? e.metaKey : e.ctrlKey;

        if (mod && e.key === 'Enter') {
            e.preventDefault();
            formatJSON();
            return;
        }

        if (mod && e.key === 's') {
            e.preventDefault();
            saveHistory();
            return;
        }

        if (mod && e.key === 'd') {
            e.preventDefault();
            downloadJSON();
            return;
        }

        if (e.key === 'Escape') {
            const modal = document.getElementById('save-modal');
            const compare = document.getElementById('compare-container');
            if (modal.classList.contains('active')) {
                closeSaveModal();
            } else if (compare.classList.contains('active')) {
                closeCompare();
            }
        }
    });

    document.getElementById('save-name-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmSave();
        }
    });
}

/* ==============================================================
   Input Size Tracker
============================================================== */
function initInputTracker() {
    const input = document.getElementById('input');
    const indicator = document.getElementById('validation-indicator');
    let validateTimer = null;

    input.addEventListener('input', () => {
        const val = input.value;
        if (val) {
            const size = new Blob([val]).size;
            document.getElementById('input-size').textContent = formatBytes(size);
        } else {
            document.getElementById('input-size').textContent = '';
        }

        clearTimeout(validateTimer);
        if (!val.trim()) {
            indicator.style.display = 'none';
            return;
        }
        validateTimer = setTimeout(() => {
            try {
                JSON.parse(val);
                indicator.style.display = 'inline-flex';
                indicator.className = 'validation-indicator valid';
                indicator.innerHTML = '<span class="dot"></span> ' + i18n.t('valid');
            } catch (e) {
                indicator.style.display = 'inline-flex';
                indicator.className = 'validation-indicator invalid';
                indicator.innerHTML = '<span class="dot"></span> ' + i18n.t('invalid');
            }
        }, 400);
    });
}

/* ==============================================================
   Theme
============================================================== */
function getTheme() {
    return localStorage.getItem('theme') || 'dark';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var icon = document.getElementById('theme-icon');
    if (icon) icon.querySelector('use').setAttribute('href', theme === 'light' ? '#icon-moon' : '#icon-sun');
    var mIcon = document.getElementById('mobile-theme-icon');
    if (mIcon) mIcon.querySelector('use').setAttribute('href', theme === 'light' ? '#icon-moon' : '#icon-sun');
    var d = document.getElementById('hljs-dark');
    var l = document.getElementById('hljs-light');
    if (d) d.disabled = theme === 'light';
    if (l) l.disabled = theme === 'dark';
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

(function() {
    document.documentElement.setAttribute('data-theme', getTheme());
})();

/* ==============================================================
   Init
============================================================== */
window.addEventListener('DOMContentLoaded', () => {
    applyAllTranslations();
    applyTheme(getTheme());
    renderHistory();
    initDragDrop();
    initKeyboard();
    initInputTracker();
    setStatus(i18n.t('statusReady'));
});
