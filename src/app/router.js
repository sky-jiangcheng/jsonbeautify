/**
 * src/app/router.js
 * Device class & UI layer detection — single source of truth.
 *
 * 架构约定 (v1.5.64):
 *   - 设备类别 deviceClass: 稳定信号判定 (UA / 指针精度), 会话期内不变。
 *     真触屏设备 (手机/平板) 恒为 mobile, 不受窗口尺寸影响。
 *   - UI 层 uiLayer: data-device 属性的实际取值, 决定渲染哪套界面。
 *       mobile = 设备类别是 mobile, 或 (桌面浏览器 且 视口 ≤900px)
 *       desktop = 其余 (含所有 Tauri 桌面壳)
 *   - Tauri 桌面壳锁定 desktop 层: 壳内 WebView 初始化阶段 innerWidth
 *     可能短暂失真且不随窗口恢复 (v1.5.55~v1.5.59 状态栏消失事故),
 *     宽度在壳内不可作为分层依据。壳内窄窗口使用桌面层堆叠布局
 *     (styles.css @media ≤900px)。
 */

(function () {
  'use strict';

  var RE_MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i;

  function isTauriShell() {
    if (typeof window === 'undefined') return false;
    // Tauri v2 无论 withGlobalTauri 是否开启都会注入 __TAURI_INTERNALS__（IPC 桥）；
    // withGlobalTauri: true 时还会有 __TAURI__。任一存在即判定为壳内。
    return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  }

  // 稳定设备类别: 会话期内不变, 不读视口宽度。
  function deviceClass() {
    try {
      // 1) UA 明确的移动设备（含 Android 平板：UA 含 "Android" 无 "Mobi" 也命中）
      if (RE_MOBILE_UA.test(navigator.userAgent || '')) return 'mobile';

      // 2) 主指针为触摸且无 hover → 触屏设备。
      //    iPadOS WKWebView 常上报桌面风格 UA（无 Mobi/iPad），靠这一层兜住。
      //    matchMedia 不可用的老环境按桌面处理（false→mobile 只该发生在真触屏上）。
      var fineHover = typeof window.matchMedia === 'function' &&
                      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (!fineHover) return 'mobile';

      return 'desktop';
    } catch (e) {
      return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
    }
  }

  // UI 层 = 设备类别 + 视口（仅桌面浏览器引入宽度维度）。
  function detect() {
    if (deviceClass() === 'mobile') return 'mobile';
    if (isTauriShell()) return 'desktop';
    try {
      return window.innerWidth <= 900 ? 'mobile' : 'desktop';
    } catch (e) {
      return 'desktop';
    }
  }

  // 实时取层（resize 时浏览器在两套布局间正常切换, 与 v1.5.61 前行为一致）。
  function getDevice() {
    return detect();
  }

  function isMobileDevice() {
    return getDevice() === 'mobile';
  }

  function syncDeviceToDOM() {
    document.documentElement.setAttribute('data-device', getDevice());
  }

  function init() {
    syncDeviceToDOM();
    window.addEventListener('resize', syncDeviceToDOM);
    window.addEventListener('orientationchange', function () {
      setTimeout(syncDeviceToDOM, 100);
    });
    // Tauri 桌面壳全局对象注入时机可能略晚于 DOMContentLoaded，延迟再校正一次。
    window.addEventListener('load', syncDeviceToDOM);
    setTimeout(syncDeviceToDOM, 50);
  }

  window.__router = { getDevice: getDevice, isMobileDevice: isMobileDevice, init: init };
})();
