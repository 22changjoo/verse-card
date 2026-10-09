/* 서비스 워커 등록 — 홈 화면에 추가한 앱이 오프라인에서도 열리게 한다. (HTTPS 또는 localhost에서만 동작) */
(function () {
  'use strict';

  // "파일 열기"(file://)로 열면 말씀 목록을 불러오지 못하고 저장도 믿을 수 없다. 안내 배너를 띄운다.
  if (location.protocol === 'file:') {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:sticky;top:0;z-index:50;padding:12px 16px;background:#ffe3e0;color:#7a1f16;font:14px/1.5 sans-serif;text-align:center';
    bar.innerHTML = '이 방식(파일 열기)으로는 정상 동작하지 않고, 입력한 내용이 저장되지 않을 수 있습니다.<br>' +
      '<a href="https://22changjoo.github.io/verse-card/" style="color:#7a1f16;font-weight:700">https://22changjoo.github.io/verse-card/</a> 로 열어 주세요.';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (!('serviceWorker' in navigator)) return;
  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'https:' && !local) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 등록 실패해도 앱은 그대로 동작 */ });
  });
})();
