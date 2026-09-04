/**
 * src/app.js — Thin orchestrator
 *
 * Loads modules in order: router → store → actions → render → here.
 * Binds events, wires up the i18n system, and exposes backward-compat globals.
 */

(function () {
  'use strict';

  /* ==============================================================
     Platform Detection Layer
  ============================================================== */
  var Platform = {
    isMobile: function() {
      return this._detectMobile();
    },
    _cached: null,
    _detectMobile: function() {
      if (this._cached !== null) return this._cached;
      
      // iOS Safari / WebView detection
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      // Android detection
      var isAndroid = /Android/.test(navigator.userAgent);
      
      // Tauri mobile detection
      var isTauriMobile = typeof window !== 'undefined' && 
                           window.__TAURI__ && 
                           window.__TAURI__.platform === 'mobile';
      
      this._cached = !!(isIOS || isAndroid || isTauriMobile);
      return this._cached;
    },
    isTauri: function() {
      return typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core);
    },
    getPlatform: function() {
      if (this.isMobile()) {
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios';
        if (/Android/.test(navigator.userAgent)) return 'android';
        return 'mobile';
      }
      if (this.isTauri()) return 'tauri';
      return 'desktop';
    }
  };
  window.Platform = Platform;

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
      saveAsNew: '另存为新记录', historyUpdated: '已更新：{name}',
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
      legacyEmptySnippet: '[空记录]',
      legacyHistoryUnavailable: '无法加载“{name}”（旧版格式不兼容）。可先备份内容后删除该记录。',
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
      saveAsNew: 'Save as a new entry', historyUpdated: 'Updated: {name}',
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
      legacyEmptySnippet: '[empty entry]',
      legacyHistoryUnavailable: 'Cannot load "{name}" (legacy format unavailable). Back up the content, then delete it.',
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
    },
    es: {
      title: 'JSON Formatter', logoText: 'JSON Formatter', mobTitle: 'Herramienta JSON',
      more: 'Más', format: 'Formatear', minify: 'Minimizar', escape: 'Escapar',
      copy: 'Copiar', download: 'Descargar', downloadFile: 'Descargar',
      upload: 'Subir', save: 'Guardar', openFile: 'Abrir archivo',
      clear: 'Limpiar', clearContent: 'Limpiar', input: 'Entrada', output: 'Salida',
      dropHint: 'Suelta para cargar archivo',
      outputPlaceholder: 'El JSON formateado aparecerá aquí',
      history: 'Historial', compare: 'Comparar', swap: 'Intercambiar', close: 'Cerrar',
      moreOps: 'Más acciones', cancelMore: 'Cancelar',
      statusReady: 'Listo',
      statusShortcuts: 'Ctrl+Enter Formatear · Ctrl+S Guardar · Ctrl+D Descargar · Ctrl+F Buscar',
      saveModalTitle: 'Guardar en el historial', saveNamePlaceholder: 'Introduce un nombre (opcional)',
      saveAsNew: 'Guardar como entrada nueva', historyUpdated: 'Actualizado: {name}',
      cancel: 'Cancelar',
      compareTitle: 'Comparar JSON', compareLoading: 'Comparando…',
      themeTitle: 'Alternar modo claro/oscuro',
      formatTitle: 'Formatear JSON (Ctrl+Enter)', minifyTitle: 'Minimizar JSON',
      escapeTitle: 'Escapar JSON', copyTitle: 'Copiar resultado',
      downloadTitle: 'Descargar archivo JSON (Ctrl+D)', uploadTitle: 'Subir archivo JSON',
      saveTitle: 'Guardar en el historial (Ctrl+S)', clearTitle: 'Limpiar',
      searchTitle: 'Buscar en la salida (Ctrl+F)',
      searchPlaceholder: 'Buscar…', searchPrev: 'Anterior (Shift+Enter)',
      searchNext: 'Siguiente (Enter)', searchClose: 'Cerrar búsqueda',
      collapseSidebar: 'Contraer barra lateral', clearAllTitle: 'Borrar todo el historial',
      expandSidebar: 'Expandir barra lateral',
      inputPlaceholder: 'Pega el texto JSON aquí',
      listTitle: 'Lista ({count})', collapseList: 'Contraer lista', expandList: 'Expandir lista',
      emptyArray: 'Arreglo vacío',
      items: '{count} elementos', keys: '{count} claves',
      loadingFile: 'Cargado {name}', saved: 'Guardado: {name}',
      copied: 'Copiado al portapapeles', copyFailed: 'Error al copiar, inténtalo de nuevo',
      nothingToCopy: 'Nada que copiar',
      nothingToDownload: 'Nada que descargar',
      downloaded: 'Archivo JSON descargado', downloadFailed: 'Error al descargar, inténtalo de nuevo',
      inputEmpty: 'La entrada está vacía', inputEmptyToast: 'Introduce JSON primero',
      formatSuccess: 'Formateado correctamente', minifySuccess: 'Minimizado correctamente',
      escapeSuccess: 'JSON escapado correctamente',
      jsonError: 'Formato JSON no válido', cleared: 'Limpiado', historyCleared: 'Historial borrado',
      loaded: 'Cargado: {name}', jsonOnly: 'Suelta solo archivos .json',
      needFormatFirst: 'Formatea primero un JSON válido',
      unnamed: 'Sin título', noHistory: 'Aún no hay historial', noHistoryHint: 'Formatea y guarda para ver el historial',
      selectForCompare: 'Selecciona para comparar', deleteItem: 'Eliminar',
      historyTooLarge: 'Entrada demasiado grande para guardar (máx 500KB)',
      legacyEmptySnippet: '[entrada vacía]',
      legacyHistoryUnavailable: 'No se puede cargar "{name}" (formato antiguo no disponible). Haz una copia de seguridad y luego bórralo.',
      autoQuoteId: ' (identificador entre comillas automáticamente)',
      autoBracket: ' (corchetes cerrados automáticamente)',
      autoBracketNotification: 'Faltaban algunos corchetes y se han cerrado automáticamente',
      unquotedIdHint: 'Las claves y los valores de cadena deben ir entre comillas dobles',
      jsonIncomplete: 'JSON incompleto, faltan corchetes, comas o valores de cierre',
      jsonSyntaxError: 'Error de sintaxis JSON: {msg}',
      stringMisplaced: 'Cadena JSON en posición incorrecta, comprueba comas o corchetes faltantes',
      numberError: 'Error de formato de número o número mal colocado',
      unquotedIdDetected: 'Se detectó un identificador sin comillas "{id}"',
      errorTitle: 'JSON no válido', nearLine: 'Cerca de la línea {line}',
      jsonRules: 'Reglas de sintaxis JSON:',
      ruleKeys: 'Las claves y los valores de cadena deben ir entre comillas dobles (")',
      ruleComma: 'Sin coma final tras el último elemento en objetos/arreglos',
      ruleBool: 'Los valores booleanos deben ser true o false (minúsculas)',
      ruleNull: 'null debe estar en minúsculas',
      ruleBracket: 'Los corchetes y las llaves deben estar emparejados',
      valid: 'Válido', invalid: 'No válido', lineCount: 'líneas',
      settings: 'Ajustes', settingsTitle: 'Ajustes de interfaz',
      watermarkLabel: 'Texto de marca de agua', watermarkPlaceholder: 'Introduce el texto de marca de agua (vacío para desactivar)',
      watermarkOpacity: 'Opacidad de marca de agua', watermarkEnabled: 'Activar marca de agua',
      bgImageLabel: 'Imagen de fondo', bgImageHint: 'Formatos de imagen comunes admitidos (JPG/PNG/WebP/HEIC, etc.)',
      bgImageUpload: 'Elegir imagen', bgImageClear: 'Quitar imagen',
      bgImageOpacity: 'Opacidad de fondo', settingsSaved: 'Ajustes guardados', resetSettings: 'Restablecer',
      bgImageTooLarge: 'Imagen demasiado grande, elige ≤ 2MB',
      settingsSaveFailed: 'Error al guardar los ajustes, es posible que el almacenamiento esté lleno',
      bgImageUnsupported: 'La imagen no se puede mostrar, formato no admitido por este navegador',
    },
    de: {
      title: 'JSON Formatter', logoText: 'JSON Formatter', mobTitle: 'JSON-Tool',
      more: 'Mehr', format: 'Formatieren', minify: 'Minimieren', escape: 'Escapen',
      copy: 'Kopieren', download: 'Herunterladen', downloadFile: 'Herunterladen',
      upload: 'Hochladen', save: 'Speichern', openFile: 'Datei öffnen',
      clear: 'Leeren', clearContent: 'Leeren', input: 'Eingabe', output: 'Ausgabe',
      dropHint: 'Zum Laden loslassen',
      outputPlaceholder: 'Formatiertes JSON wird hier angezeigt',
      history: 'Verlauf', compare: 'Vergleichen', swap: 'Tauschen', close: 'Schließen',
      moreOps: 'Weitere Aktionen', cancelMore: 'Abbrechen',
      statusReady: 'Bereit',
      statusShortcuts: 'Strg+Eingabe Formatieren · Strg+S Speichern · Strg+D Herunterladen · Strg+F Suchen',
      saveModalTitle: 'Im Verlauf speichern', saveNamePlaceholder: 'Name eingeben (optional)',
      saveAsNew: 'Als neuen Eintrag speichern', historyUpdated: 'Aktualisiert: {name}',
      cancel: 'Abbrechen',
      compareTitle: 'JSON-Vergleich', compareLoading: 'Vergleichen…',
      themeTitle: 'Hell-/Dunkelmodus umschalten',
      formatTitle: 'JSON formatieren (Strg+Eingabe)', minifyTitle: 'JSON minimieren',
      escapeTitle: 'JSON escapen', copyTitle: 'Ergebnis kopieren',
      downloadTitle: 'JSON-Datei herunterladen (Strg+D)', uploadTitle: 'JSON-Datei hochladen',
      saveTitle: 'Im Verlauf speichern (Strg+S)', clearTitle: 'Leeren',
      searchTitle: 'In Ausgabe suchen (Strg+F)',
      searchPlaceholder: 'Suchen…', searchPrev: 'Zurück (Umschalt+Eingabe)',
      searchNext: 'Weiter (Eingabe)', searchClose: 'Suche schließen',
      collapseSidebar: 'Seitenleiste einklappen', clearAllTitle: 'Gesamten Verlauf löschen',
      expandSidebar: 'Seitenleiste ausklappen',
      inputPlaceholder: 'JSON-Text hier einfügen',
      listTitle: 'Liste ({count})', collapseList: 'Liste einklappen', expandList: 'Liste ausklappen',
      emptyArray: 'Leeres Array',
      items: '{count} Elemente', keys: '{count} Schlüssel',
      loadingFile: '{name} geladen', saved: 'Gespeichert: {name}',
      copied: 'In Zwischenablage kopiert', copyFailed: 'Kopieren fehlgeschlagen, bitte erneut versuchen',
      nothingToCopy: 'Nichts zu kopieren',
      nothingToDownload: 'Nichts zum Herunterladen',
      downloaded: 'JSON-Datei heruntergeladen', downloadFailed: 'Download fehlgeschlagen, bitte erneut versuchen',
      inputEmpty: 'Eingabe ist leer', inputEmptyToast: 'Bitte zuerst JSON eingeben',
      formatSuccess: 'Erfolgreich formatiert', minifySuccess: 'Erfolgreich minimiert',
      escapeSuccess: 'JSON erfolgreich escapert',
      jsonError: 'Ungültiges JSON-Format', cleared: 'Geleert', historyCleared: 'Verlauf gelöscht',
      loaded: 'Geladen: {name}', jsonOnly: 'Bitte nur .json-Dateien ablegen',
      needFormatFirst: 'Bitte zuerst gültiges JSON formatieren',
      unnamed: 'Unbenannt', noHistory: 'Noch kein Verlauf', noHistoryHint: 'Formatieren und speichern, um Verlauf zu sehen',
      selectForCompare: 'Zum Vergleichen auswählen', deleteItem: 'Löschen',
      historyTooLarge: 'Eintrag zu groß zum Speichern (max. 500 KB)',
      legacyEmptySnippet: '[leerer Eintrag]',
      legacyHistoryUnavailable: '"{name}" kann nicht geladen werden (altes Format nicht verfügbar). Sichere den Inhalt und lösche ihn dann.',
      autoQuoteId: ' (Bezeichner automatisch in Anführungszeichen gesetzt)',
      autoBracket: ' (Klammern automatisch geschlossen)',
      autoBracketNotification: 'Einige Klammern fehlten und wurden automatisch geschlossen',
      unquotedIdHint: 'JSON-Schlüssel und Zeichenfolgenwerte müssen in doppelte Anführungszeichen gesetzt werden',
      jsonIncomplete: 'JSON unvollständig, möglicherweise fehlen schließende Klammern, Kommas oder Werte',
      jsonSyntaxError: 'JSON-Syntaxfehler: {msg}',
      stringMisplaced: 'JSON-Zeichenfolge an falscher Stelle, prüfe auf fehlende Kommas oder Klammern',
      numberError: 'Zahlenformatfehler oder falsch platziert',
      unquotedIdDetected: 'Nicht in Anführungszeichen gesetzter Bezeichner "{id}" erkannt',
      errorTitle: 'Ungültiges JSON', nearLine: 'In der Nähe von Zeile {line}',
      jsonRules: 'JSON-Syntaxregeln:',
      ruleKeys: 'Schlüssel und Zeichenfolgenwerte müssen in doppelte Anführungszeichen (") gesetzt werden',
      ruleComma: 'Kein nachgestelltes Komma nach dem letzten Element in Objekten/Arrays',
      ruleBool: 'Boolesche Werte müssen true oder false sein (Kleinbuchstaben)',
      ruleNull: 'null muss kleingeschrieben sein',
      ruleBracket: 'Klammern und geschweifte Klammern müssen paarweise sein',
      valid: 'Gültig', invalid: 'Ungültig', lineCount: 'Zeilen',
      settings: 'Einstellungen', settingsTitle: 'Oberflächeneinstellungen',
      watermarkLabel: 'Wasserzeichen-Text', watermarkPlaceholder: 'Wasserzeichen-Text eingeben (leer zum Deaktivieren)',
      watermarkOpacity: 'Wasserzeichen-Deckkraft', watermarkEnabled: 'Wasserzeichen aktivieren',
      bgImageLabel: 'Hintergrundbild', bgImageHint: 'Gängige Bildformate unterstützt (JPG/PNG/WebP/HEIC usw.)',
      bgImageUpload: 'Bild auswählen', bgImageClear: 'Bild entfernen',
      bgImageOpacity: 'Hintergrund-Deckkraft', settingsSaved: 'Einstellungen gespeichert', resetSettings: 'Auf Standard zurücksetzen',
      bgImageTooLarge: 'Bild zu groß, wähle ≤ 2 MB',
      settingsSaveFailed: 'Einstellungen konnten nicht gespeichert werden, Speicher ist möglicherweise voll',
      bgImageUnsupported: 'Bild kann nicht angezeigt werden, Format wird von diesem Browser nicht unterstützt',
    },
    ja: {
      title: 'JSON Formatter', logoText: 'JSON Formatter', mobTitle: 'JSONツール',
      more: 'その他', format: '整形', minify: '最小化', escape: 'エスケープ',
      copy: 'コピー', download: 'ダウンロード', downloadFile: 'ダウンロード',
      upload: 'アップロード', save: '保存', openFile: 'ファイルを開く',
      clear: 'クリア', clearContent: 'クリア', input: '入力', output: '出力',
      dropHint: 'ドロップしてファイルを読み込み',
      outputPlaceholder: '整形されたJSONがここに表示されます',
      history: '履歴', compare: '比較', swap: '入れ替え', close: '閉じる',
      moreOps: 'その他の操作', cancelMore: 'キャンセル',
      statusReady: '準備完了',
      statusShortcuts: 'Ctrl+Enter 整形 · Ctrl+S 保存 · Ctrl+D ダウンロード · Ctrl+F 検索',
      saveModalTitle: '履歴に保存', saveNamePlaceholder: '名前を入力（任意）',
      saveAsNew: '新しい項目として保存', historyUpdated: '更新しました: {name}',
      cancel: 'キャンセル',
      compareTitle: 'JSON比較', compareLoading: '比較中…',
      themeTitle: 'ダーク/ライトモード切替',
      formatTitle: 'JSONを整形 (Ctrl+Enter)', minifyTitle: 'JSONを最小化',
      escapeTitle: 'JSONをエスケープ', copyTitle: '結果をコピー',
      downloadTitle: 'JSONファイルをダウンロード (Ctrl+D)', uploadTitle: 'JSONファイルをアップロード',
      saveTitle: '履歴に保存 (Ctrl+S)', clearTitle: 'クリア',
      searchTitle: '出力内を検索 (Ctrl+F)',
      searchPlaceholder: '検索…', searchPrev: '前へ (Shift+Enter)',
      searchNext: '次へ (Enter)', searchClose: '検索を閉じる',
      collapseSidebar: 'サイドバーを折りたたむ', clearAllTitle: 'すべての履歴を削除',
      expandSidebar: 'サイドバーを展開',
      inputPlaceholder: 'ここにJSONテキストを貼り付け',
      listTitle: 'リスト ({count})', collapseList: 'リストを折りたたむ', expandList: 'リストを展開',
      emptyArray: '空の配列',
      items: '{count} 項目', keys: '{count} キー',
      loadingFile: '{name} を読み込みました', saved: '保存しました: {name}',
      copied: 'クリップボードにコピーしました', copyFailed: 'コピーに失敗しました。もう一度お試しください',
      nothingToCopy: 'コピーするものがありません',
      nothingToDownload: 'ダウンロードするものがありません',
      downloaded: 'JSONファイルをダウンロードしました', downloadFailed: 'ダウンロードに失敗しました。もう一度お試しください',
      inputEmpty: '入力が空です', inputEmptyToast: 'まずJSONを入力してください',
      formatSuccess: '整形しました', minifySuccess: '最小化しました',
      escapeSuccess: 'JSONをエスケープしました',
      jsonError: 'JSON形式が無効です', cleared: 'クリアしました', historyCleared: '履歴を削除しました',
      loaded: '読み込みました: {name}', jsonOnly: '.jsonファイルのみドロップしてください',
      needFormatFirst: 'まず有効なJSONを整形してください',
      unnamed: '名称未設定', noHistory: '履歴はまだありません', noHistoryHint: '整形して保存すると履歴が表示されます',
      selectForCompare: '比較用に選択', deleteItem: '削除',
      historyTooLarge: '項目が大きすぎて保存できません（最大500KB）',
      legacyEmptySnippet: '[空の項目]',
      legacyHistoryUnavailable: '"{name}"を読み込めません（旧形式は利用できません）。内容をバックアップしてから削除してください。',
      autoQuoteId: '（識別子に自動で引用符を付与）',
      autoBracket: '（括弧を自動で閉じました）',
      autoBracketNotification: '欠落していた括弧を自動で閉じました',
      unquotedIdHint: 'JSONのキーと文字列値は二重引用符で囲む必要があります',
      jsonIncomplete: 'JSONが不完全です。閉じ括弧、カンマ、または値が欠けている可能性があります',
      jsonSyntaxError: 'JSON構文エラー: {msg}',
      stringMisplaced: 'JSON文字列の位置が正しくありません。欠落しているカンマや括弧がないか確認してください',
      numberError: '数値の形式エラー、または位置が正しくありません',
      unquotedIdDetected: '引用符のない識別子 "{id}" を検出しました',
      errorTitle: '無効なJSON', nearLine: '行 {line} 付近',
      jsonRules: 'JSON構文ルール:',
      ruleKeys: 'キーと文字列値は二重引用符 (") で囲む必要があります',
      ruleComma: 'オブジェクト/配列の最後の要素の後にカンマを付けてはいけません',
      ruleBool: 'ブール値は true または false（小文字）でなければなりません',
      ruleNull: 'null は小文字でなければなりません',
      ruleBracket: '括弧と波括弧は対応している必要があります',
      valid: '有効', invalid: '無効', lineCount: '行',
      settings: '設定', settingsTitle: 'インターフェース設定',
      watermarkLabel: '透かしテキスト', watermarkPlaceholder: '透かしテキストを入力（空で無効化）',
      watermarkOpacity: '透かしの不透明度', watermarkEnabled: '透かしを有効にする',
      bgImageLabel: '背景画像', bgImageHint: '一般的な画像形式に対応（JPG/PNG/WebP/HEIC など）',
      bgImageUpload: '画像を選択', bgImageClear: '画像を削除',
      bgImageOpacity: '背景の不透明度', settingsSaved: '設定を保存しました', resetSettings: 'デフォルトに戻す',
      bgImageTooLarge: '画像が大きすぎます。2MB以下を選択してください',
      settingsSaveFailed: '設定の保存に失敗しました。ストレージがいっぱいの可能性があります',
      bgImageUnsupported: '画像を表示できません。このブラウザは形式に対応していません',
    }
  };

  // Supported languages (label shown in the switcher). Order = display order.
  var LANGUAGES = [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ja', label: '日本語' }
  ];
  var SUPPORTED_LANGS = LANGUAGES.map(function (l) { return l.code; });

  // Initial language: explicit saved choice (localStorage) → system language → English.
  // NOTE: store 的 lang 默认是 'en', 不能作为"用户偏好"依据, 否则会永远覆盖系统语言。
  function detectInitialLang() {
    var saved = localStorage.getItem('appLang');
    if (saved && SUPPORTED_LANGS.indexOf(saved) >= 0) return saved;
    var sys = (navigator.language || navigator.userLanguage || 'en').toLowerCase().split('-')[0];
    return SUPPORTED_LANGS.indexOf(sys) >= 0 ? sys : 'en';
  }

  var i18n = {
    _lang: detectInitialLang(),
    t: function (key, vars) {
      // 未知语言(如 localStorage 被写入非法值)时回退到英文, 避免整个 i18n 崩溃
      var dict = I18N[this._lang] || I18N['en'];
      var s = dict[key] || I18N['en'][key] || key;
      if (vars) {
        Object.entries(vars).forEach(function (entry) {
          // 用函数形式替换: 值中的 $&/$' 等会被 replace 当作替换模式展开
          s = s.replace(new RegExp('\\{' + entry[0] + '\\}', 'g'), function () { return entry[1]; });
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
  // 让 store 内部 lang 与检测到的语言一致(避免与 i18n._lang 不同步)
  if (window.__store) window.__store.setState({ lang: i18n._lang });
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
    var curLang = LANGUAGES.filter(function (l) { return l.code === i18n._lang; })[0] || LANGUAGES[1];
    var langBtn = document.getElementById('lang-btn');
    if (langBtn) { langBtn.textContent = curLang.label; langBtn.setAttribute('data-lang', curLang.code); }
    var mobLangLabel = document.getElementById('mobile-lang-label');
    if (mobLangLabel) { mobLangLabel.textContent = curLang.label; mobLangLabel.setAttribute('data-lang', curLang.code); }
    if (window.__render && window.__render.rerenderDynamicContent) {
      window.__render.rerenderDynamicContent();
    }
  }

  /* ==============================================================
     Language switcher popup (replaces the old zh/en toggle)
  ============================================================== */
  function ensureLangMenu() {
    var menu = document.getElementById('lang-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'lang-menu';
      menu.className = 'lang-menu';
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
    }
    return menu;
  }
  function renderLangMenu() {
    var menu = ensureLangMenu();
    menu.innerHTML = '';
    LANGUAGES.forEach(function (L) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'lang-menu-item' + (L.code === i18n._lang ? ' active' : '');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', L.code === i18n._lang ? 'true' : 'false');
      item.setAttribute('data-lang', L.code);
      item.textContent = L.label;
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        i18n.setLang(L.code);
        closeLangMenu();
      });
      menu.appendChild(item);
    });
  }
  function openLangMenu(anchor) {
    renderLangMenu();
    var menu = ensureLangMenu();
    menu.style.display = 'block';
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var r = anchor.getBoundingClientRect();
    var left = r.right - mw;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    menu.style.left = left + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    setTimeout(function () {
      document.addEventListener('click', outsideCloseLangMenu, { once: true, capture: true });
    }, 0);
  }
  function closeLangMenu() {
    var menu = document.getElementById('lang-menu');
    if (menu) menu.style.display = 'none';
  }
  function outsideCloseLangMenu(e) {
    if (e.target.closest && (e.target.closest('#lang-menu') || e.target.closest('#lang-btn') || e.target.closest('#mobile-lang-btn'))) return;
    closeLangMenu();
  }
  function toggleLangMenu(anchor) {
    var menu = document.getElementById('lang-menu');
    if (menu && menu.style.display === 'block') { closeLangMenu(); return; }
    openLangMenu(anchor);
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
    if (langBtn) langBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleLangMenu(langBtn); });
    var mobLangBtn = document.getElementById('mobile-lang-btn');
    if (mobLangBtn) mobLangBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleLangMenu(mobLangBtn); });

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
        if (window.__store) window.__store.setState({ loadedHistoryId: id });
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
    if (langLabel) {
      var ll = LANGUAGES.filter(function (l) { return l.code === i18n._lang; })[0] || LANGUAGES[1];
      langLabel.textContent = ll.label;
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
          console.warn('SW registration failed:', err);
        });
      });
    }
  });
})();
