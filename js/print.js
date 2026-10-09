/*
 * 엽서(100×148mm) 인쇄
 *  - single: 엽서 한 장 = 한 페이지 (용지를 엽서 크기로 맞춰 인쇄)
 *  - a4x2:   A4 가로 한 장에 같은 엽서 2장 (가운데 점선을 따라 자름)
 * 저장되는 PNG와 같은 이미지를 쓰므로 글꼴·줄바꿈이 미리보기와 같다.
 */
(function (global) {
  'use strict';

  var PAGE_STYLES = {
    single: '@page { size: 100mm 148mm; margin: 0; }',
    a4x2: '@page { size: A4 landscape; margin: 0; }'
  };

  function img(url) {
    var i = document.createElement('img');
    i.src = url;
    i.alt = '';
    return i;
  }

  function setPageStyle(layout) {
    var style = document.getElementById('printPageStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'printPageStyle';
      document.head.appendChild(style);
    }
    style.textContent = PAGE_STYLES[layout] || PAGE_STYLES.single;
  }

  function cleanup(area, urls) {
    area.replaceChildren();
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    var style = document.getElementById('printPageStyle');
    if (style) style.remove();
  }

  // blobs: 엽서 크기로 만든 PNG들. layout: 'single' | 'a4x2'
  async function run(blobs, layout) {
    var area = document.getElementById('printArea');
    var urls = blobs.map(function (b) { return URL.createObjectURL(b); });
    area.replaceChildren();

    urls.forEach(function (url) {
      var sheet = document.createElement('div');
      if (layout === 'a4x2') {
        sheet.className = 'print-sheet a4x2';
        for (var k = 0; k < 2; k++) {
          var cell = document.createElement('div');
          cell.className = 'cell';
          cell.appendChild(img(url));
          sheet.appendChild(cell);
        }
      } else {
        sheet.className = 'print-sheet single';
        sheet.appendChild(img(url));
      }
      area.appendChild(sheet);
    });

    setPageStyle(layout);

    // 이미지가 모두 준비된 뒤에 인쇄 창을 연다.
    await Promise.all(Array.prototype.map.call(area.querySelectorAll('img'), function (i) {
      return i.decode ? i.decode().catch(function () {}) : Promise.resolve();
    }));

    var done = function () {
      window.removeEventListener('afterprint', done);
      cleanup(area, urls);
    };
    window.addEventListener('afterprint', done);
    window.print();
    // afterprint를 지원하지 않는 브라우저를 위한 안전장치
    setTimeout(function () { if (area.firstChild) { done(); } }, 60000);
  }

  global.VersePrint = { run: run };
})(window);
