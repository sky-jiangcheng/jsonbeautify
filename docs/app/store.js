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
