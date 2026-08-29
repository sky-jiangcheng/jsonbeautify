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
      var isMobileUA = /Mobi/i.test(ua);

      // Tauri desktop WebView: 初始化时 innerWidth 可能短暂 ≤900，
      // 但 UA 不含 mobile 标识。直接强制 desktop，避免误判为 mobile。
      var isTauri = typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core);
      if (isTauri && !isMobileUA) return 'desktop';

      isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
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
