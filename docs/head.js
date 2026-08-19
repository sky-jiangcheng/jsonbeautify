/**
 * src/head.js — Runs synchronously in <head> before any CSS mobile rules take effect.
 * Sets the initial data-device attribute to avoid a flash of mobile layout on
 * desktop (and vice-versa). router.js re-runs proper detection on DOMContentLoaded.
 * Extracted from an inline <script> so the Tauri CSP can drop 'unsafe-inline'.
 */
(function () {
  'use strict';
  try { document.documentElement.setAttribute('data-device', 'desktop'); } catch (e) {}
})();
