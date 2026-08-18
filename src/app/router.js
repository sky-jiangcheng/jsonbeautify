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

  function getDevice() {
    if (_device === null) _device = detect();
    return _device;
  }

  function isMobileDevice() {
    return getDevice() === 'mobile';
  }

  function syncDeviceToDOM() {
    var d = document.documentElement;
    var current = d.getAttribute('data-device');
    var detected = getDevice();
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
