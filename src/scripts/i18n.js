/* ==============================================================
   Internationalization (i18n)
============================================================== */
const I18N = {
    zh: {
        title: 'JSON 格式化工具',
        logoText: 'JSON 格式化工具',
        format: '格式化',
        minify: '压缩',
        escape: '转义',
        copy: '复制',
        download: '下载',
        upload: '上传',
        save: '保存',
        clear: '清空',
        input: '输入',
        output: '输出',
        dropHint: '释放以加载文件',
        outputPlaceholder: '格式化后的 JSON 将显示在这里',
        history: '历史记录',
        compare: '对比',
        swap: '交换',
        close: '关闭',
        statusReady: '就绪',
        statusShortcuts: 'Ctrl+Enter 格式化 \u00b7 Ctrl+S 保存 \u00b7 Ctrl+D 下载',
        saveModalTitle: '保存到历史记录',
        saveNamePlaceholder: '输入记录名称（可选）',
        cancel: '取消',
        compareTitle: 'JSON 对比',
        compareLoading: '正在比对\u2026',
        themeTitle: '切换暗色/亮色模式',
        formatTitle: '格式化 JSON (Ctrl+Enter)',
        minifyTitle: '压缩 JSON',
        escapeTitle: 'JSON 转义',
        copyTitle: '复制结果',
        downloadTitle: '下载 JSON 文件 (Ctrl+D)',
        uploadTitle: '上传 JSON 文件',
        saveTitle: '保存到历史 (Ctrl+S)',
        clearTitle: '清空',
        collapseSidebar: '收起侧栏',
        clearAllTitle: '清空所有历史',
        expandSidebar: '展开侧栏',
        inputPlaceholder: '在此粘贴 JSON，或拖拽 JSON 文件到此处\n\n快捷键：\n  Ctrl+Enter  格式化\n  Ctrl+S      保存\n  Ctrl+D      下载',
        listTitle: '列表 ({count})',
        collapseList: '收起列表',
        expandList: '展开列表',
        emptyArray: '空数组',
        items: '{count} 项',
        keys: '{count} 键',
        loadingFile: '已加载 {name}',
        saved: '已保存：{name}',
        copied: '已复制到剪贴板',
        nothingToCopy: '没有可复制的内容',
        nothingToDownload: '没有可下载的内容',
        downloaded: '已下载 JSON 文件',
        inputEmpty: '输入为空',
        inputEmptyToast: '请先输入 JSON',
        formatSuccess: '格式化成功',
        minifySuccess: '压缩成功',
        escapeSuccess: 'JSON 转义成功',
        jsonError: 'JSON 格式错误',
        cleared: '已清空',
        historyCleared: '历史已清空',
        loaded: '已加载：{name}',
        jsonOnly: '请拖入 .json 文件',
        needFormatFirst: '请先格式化有效的 JSON',
        unnamed: '未命名',
        noHistory: '暂无历史记录',
        noHistoryHint: '格式化后保存即可',
        selectForCompare: '选中用于对比',
        deleteItem: '删除',
        autoQuoteId: '（已自动为标识符添加引号）',
        autoBracket: '（已自动补全括号）',
        autoBracketNotification: '原始 JSON 缺失部分括号，已自动补全',
        unquotedIdHint: 'JSON 中的键名和字符串值必须用双引号包裹',
        jsonIncomplete: 'JSON 不完整，可能缺少闭合的括号、逗号或值',
        jsonSyntaxError: 'JSON 语法错误：{msg}',
        stringMisplaced: 'JSON 字符串位置不当，检查是否缺少逗号或括号',
        numberError: '数字格式错误或位置不当',
        unquotedIdDetected: '检测到未加引号的标识符 "{id}"',
        errorTitle: 'JSON 格式错误',
        nearLine: '第 {line} 行附近',
        jsonRules: 'JSON 语法规则：',
        ruleKeys: '键名和字符串值必须用双引号（"）包裹',
        ruleComma: '对象和数组的最后一个元素后不能有逗号',
        ruleBool: '布尔值只能为 true 或 false（小写）',
        ruleNull: 'null 必须为小写',
        ruleBracket: '括号和花括号必须成对出现',
        valid: '有效',
        invalid: '无效',
        lineCount: '行',
    },
    en: {
        title: 'JSON Formatter',
        logoText: 'JSON Formatter',
        format: 'Format',
        minify: 'Minify',
        escape: 'Escape',
        copy: 'Copy',
        download: 'Download',
        upload: 'Upload',
        save: 'Save',
        clear: 'Clear',
        input: 'Input',
        output: 'Output',
        dropHint: 'Drop to load file',
        outputPlaceholder: 'Formatted JSON will appear here',
        history: 'History',
        compare: 'Compare',
        swap: 'Swap',
        close: 'Close',
        statusReady: 'Ready',
        statusShortcuts: 'Ctrl+Enter Format \u00b7 Ctrl+S Save \u00b7 Ctrl+D Download',
        saveModalTitle: 'Save to History',
        saveNamePlaceholder: 'Enter name (optional)',
        cancel: 'Cancel',
        compareTitle: 'JSON Compare',
        compareLoading: 'Comparing\u2026',
        themeTitle: 'Toggle dark/light mode',
        formatTitle: 'Format JSON (Ctrl+Enter)',
        minifyTitle: 'Minify JSON',
        escapeTitle: 'Escape JSON',
        copyTitle: 'Copy result',
        downloadTitle: 'Download JSON file (Ctrl+D)',
        uploadTitle: 'Upload JSON file',
        saveTitle: 'Save to history (Ctrl+S)',
        clearTitle: 'Clear',
        collapseSidebar: 'Collapse sidebar',
        clearAllTitle: 'Clear all history',
        expandSidebar: 'Expand sidebar',
        inputPlaceholder: 'Paste JSON here, or drag a JSON file here\n\nShortcuts:\n  Ctrl+Enter  Format\n  Ctrl+S      Save\n  Ctrl+D      Download',
        listTitle: 'List ({count})',
        collapseList: 'Collapse list',
        expandList: 'Expand list',
        emptyArray: 'Empty array',
        items: '{count} items',
        keys: '{count} keys',
        loadingFile: 'Loaded {name}',
        saved: 'Saved: {name}',
        copied: 'Copied to clipboard',
        nothingToCopy: 'Nothing to copy',
        nothingToDownload: 'Nothing to download',
        downloaded: 'JSON file downloaded',
        inputEmpty: 'Input is empty',
        inputEmptyToast: 'Please enter JSON first',
        formatSuccess: 'Formatted successfully',
        minifySuccess: 'Minified successfully',
        escapeSuccess: 'JSON escaped successfully',
        jsonError: 'Invalid JSON format',
        cleared: 'Cleared',
        historyCleared: 'History cleared',
        loaded: 'Loaded: {name}',
        jsonOnly: 'Please drop .json files only',
        needFormatFirst: 'Please format valid JSON first',
        unnamed: 'Untitled',
        noHistory: 'No history yet',
        noHistoryHint: 'Format and save to see history',
        selectForCompare: 'Select to compare',
        deleteItem: 'Delete',
        autoQuoteId: ' (auto-quoted identifier)',
        autoBracket: ' (auto-closed brackets)',
        autoBracketNotification: 'Some brackets were missing and have been auto-closed',
        unquotedIdHint: 'JSON keys and string values must be wrapped in double quotes',
        jsonIncomplete: 'JSON is incomplete, possibly missing closing brackets, commas, or values',
        jsonSyntaxError: 'JSON syntax error: {msg}',
        stringMisplaced: 'JSON string in wrong position, check for missing commas or brackets',
        numberError: 'Number format error or misplaced number',
        unquotedIdDetected: 'Detected unquoted identifier "{id}"',
        errorTitle: 'Invalid JSON',
        nearLine: 'Near line {line}',
        jsonRules: 'JSON syntax rules:',
        ruleKeys: 'Keys and string values must be wrapped in double quotes (")',
        ruleComma: 'No trailing comma after the last element in objects/arrays',
        ruleBool: 'Boolean values must be true or false (lowercase)',
        ruleNull: 'null must be lowercase',
        ruleBracket: 'Brackets and braces must be paired',
        valid: 'Valid',
        invalid: 'Invalid',
        lineCount: 'lines',
    }
};

const i18n = {
    _lang: localStorage.getItem('appLang') || (navigator.language.startsWith('zh') ? 'zh' : 'en'),

    t(key, vars) {
        let s = I18N[this._lang][key] || I18N['en'][key] || key;
        if (vars) {
            Object.entries(vars).forEach(([k, v]) => {
                s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
            });
        }
        return s;
    },

    setLang(lang) {
        this._lang = lang;
        localStorage.setItem('appLang', lang);
        applyAllTranslations();
    },

    get lang() { return this._lang; }
};

function applyAllTranslations() {
    // Document title
    document.title = i18n.t('title');
    document.documentElement.lang = i18n._lang;
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = i18n.t(key);
    });
    // Title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.setAttribute('title', i18n.t(key));
    });
    // Placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.setAttribute('placeholder', i18n.t(key).replace(/\\n/g, '\n'));
    });
    // HTML content
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (key) el.innerHTML = i18n.t(key);
    });
    // Update language switcher button text
    const langBtn = document.getElementById('lang-btn');
    if (langBtn) langBtn.textContent = i18n._lang === 'zh' ? 'EN' : '\u4e2d';
    // Re-render dynamic content
    rerenderDynamicContent();
}

function rerenderDynamicContent() {
    // Refresh output panel if it has content
    if (window._lastRenderContent) {
        renderOutput(window._lastRenderContent, window._lastRenderType, window._lastRenderFixed, window._lastRenderParsedObj);
    }
    // Refresh history list
    renderHistory();
    // Update status bar
    const sm = document.getElementById('status-msg');
    if (sm && (sm.textContent === I18N.zh.statusReady || sm.textContent === I18N.en.statusReady)) {
        setStatus(i18n.t('statusReady'));
    }
    // Refresh compare open state
    const cc = document.getElementById('compare-container');
    if (cc && cc.classList.contains('visible')) {
        renderHistory();
        refreshCompareView();
    }
    // Refresh validation indicator
    const vi = document.getElementById('validation-indicator');
    if (vi && vi.style.display !== 'none') {
        vi.textContent = i18n.t(vi.classList.contains('valid') ? 'valid' : 'invalid');
    }
}
