/* 서비스 워커 등록 — 홈 화면에 추가한 앱이 오프라인에서도 열리게 한다. (HTTPS 또는 localhost에서만 동작) */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'https:' && !local) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 등록 실패해도 앱은 그대로 동작 */ });
  });
})();
