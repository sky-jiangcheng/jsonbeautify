/**
 * src/app/router.js
 * Device class detection — single source of truth for mobile/desktop.
 *
 * 架构约定（设备类别 vs 视口适配）:
 *   - 设备类别 data-device: 只由"稳定信号"决定 —— UA / 指针精度(hover+pointer)。
 *     会话期内不变，决定"渲染哪套 UI 层"（桌面三栏+状态栏 vs 移动头/工具条/Tab）。
 *   - 视口适配: 完全交给 styles.css / styles.mobile.css 里的 @media 查询，
 *     决定布局随窗口宽度如何收缩。
 *   刻意不读 innerWidth 判定设备类别:
 *     1) Tauri 桌面壳初始化瞬间 innerWidth 可能 ≤900 → 曾导致 PC 上整个
 *        切进 mobile UI、状态栏消失（v1.5.55~v1.5.59，v1.5.60 首次修复）;
 *     2) 桌面浏览器缩窄窗口会话中途翻转设备层，三栏/移动两套 JS 行为互相污染。
 */

(function () {
  'use strict';

  var RE_MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i;

  function detect() {
    try {
      // 1) UA 明确的移动设备（含 Android 平板：UA 含 "Android" 无 "Mobi" 也命中）
      if (RE_MOBILE_UA.test(navigator.userAgent || '')) return 'mobile';

      // 2) 主指针为触摸且无 hover → 触屏设备。
      //    iPadOS WKWebView 常上报桌面风格 UA（无 Mobi/iPad），靠这一层兜住。
      //    matchMedia 不可用的老环境按桌面处理（false→mobile 只该发生在真触屏上）。
      var fineHover = typeof window.matchMedia === 'function' &&
                      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (!fineHover) return 'mobile';

      // 3) 其余（桌面浏览器 / Tauri 桌面壳）→ desktop。
      //    不需要 Tauri 特判：v1.5.60 的 isTauri 强制 desktop 是为 innerWidth
      //    误判打的补丁，设备类别不再读宽度后桌面壳天然落在 desktop。
      return 'desktop';
    } catch (e) {
      return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
    }
  }

  // 设备类别由稳定信号决定，结果恒定；保留实时调用接口兼容现有调用点。
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
  }

  window.__router = { getDevice: getDevice, isMobileDevice: isMobileDevice, init: init };
})();
