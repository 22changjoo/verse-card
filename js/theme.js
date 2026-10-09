/*
 * 화면 밝기(라이트/다크) — 기기 설정을 따르되, 직접 고르면 그 선택을 기억한다.
 * 페이지가 그려지기 전에(head에서) 실행해서 깜빡임을 막는다.
 *   모드: 'auto'(기기 설정) | 'light' | 'dark'
 */
(function (global) {
  'use strict';

  var KEY = 'verseCard.theme';
  var DARK_BAR = '#0b1020';
  var LIGHT_BAR = '#f5f2e8';
  var mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function resolve(mode) {
    return mode === 'dark' || (mode === 'auto' && mq && mq.matches) ? 'dark' : 'light';
  }

  function apply(mode) {
    var t = resolve(mode);
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.getElementById('metaTheme');
    if (meta) meta.setAttribute('content', t === 'dark' ? DARK_BAR : LIGHT_BAR);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { mode: mode, theme: t } }));
  }

  function set(mode) {
    try { localStorage.setItem(KEY, JSON.stringify(mode)); } catch (e) { /* 저장 못 해도 이번 화면에는 적용 */ }
    apply(mode);
  }

  function toggle() {
    set(resolve(read()) === 'dark' ? 'light' : 'dark');
  }

  apply(read());
  document.addEventListener('DOMContentLoaded', function () { apply(read()); });
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (read() === 'auto') apply('auto'); });
  }

  global.VerseTheme = { get: read, set: set, toggle: toggle, resolved: function () { return resolve(read()); } };
})(window);
