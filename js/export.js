/*
 * PNG 변환 · 저장 · 공유
 * 화면 미리보기는 축소(transform)되어 있으므로, 내보낼 때는 실제 크기 카드를 따로 만들어 변환한다.
 * 긴 말씀을 나눈 경우 pages(장별 데이터 배열)를 순서대로 여러 장 만든다.
 */
(function (global) {
  'use strict';

  var PIXEL_RATIO = 2; // 1080px 너비 → 2160px
  var MAX_CACHE = 8;
  var cache = new Map(); // key → Promise<Blob> (같은 입력이면 미리 만든 결과를 재사용)

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function makeKey(data, design) {
    return JSON.stringify([data, design]);
  }

  function firstFamily(card, selector) {
    var node = card.querySelector(selector);
    if (!node) return null;
    return getComputedStyle(node).fontFamily.split(',')[0].trim();
  }

  async function renderToBlob(data, design) {
    // 폰트가 모두 로드될 때까지 대기 (미리보기와 같은 글꼴로 저장하기 위함)
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    var size = global.VerseCard.sizeOf(design);
    var stage = document.createElement('div');
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = 'position:fixed;left:0;top:0;width:' + size.w + 'px;height:' + size.h + 'px;z-index:-1;pointer-events:none;opacity:0';
    var card = global.VerseCard.renderCard(data, design);
    stage.appendChild(card);
    document.body.appendChild(stage);
    try {
      // 카드에서 실제로 쓰이는 글꼴을 명시적으로 불러온 뒤 레이아웃을 확정한다.
      if (document.fonts && document.fonts.load) {
        var text = card.textContent || ' ';
        var serif = firstFamily(card, '.verse');
        var jobs = [document.fonts.load("400 24px 'Noto Sans KR'", text)];
        if (serif) {
          jobs.push(document.fonts.load('400 40px ' + serif, text));
          jobs.push(document.fonts.load('700 40px ' + serif, text));
        }
        await Promise.all(jobs);
      }
      global.VerseCard.fitCard(card);
      return await global.modernScreenshot.domToBlob(card, {
        width: size.w,
        height: size.h,
        scale: PIXEL_RATIO,
        type: 'image/png'
      });
    } finally {
      stage.remove();
    }
  }

  function getBlob(data, design) {
    var key = makeKey(data, design);
    if (!cache.has(key)) {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      var p = renderToBlob(data, design).catch(function (err) {
        cache.delete(key);
        throw err;
      });
      cache.set(key, p);
    }
    return cache.get(key);
  }

  // 장이 여러 개여도 한 번에 만든다(차례대로 만들어 메모리 사용을 낮춤).
  async function getBlobs(pages, design) {
    var blobs = [];
    for (var i = 0; i < pages.length; i++) blobs.push(await getBlob(pages[i], design));
    return blobs;
  }

  function fileName(data, i, n) {
    var d = new Date();
    var ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var name = (data.recipient || '').trim().replace(/[\\/:*?"<>|\s]+/g, '');
    return '말씀카드' + (name ? '_' + name : '') + '_' + ymd + (n > 1 ? '_' + (i + 1) + '-' + n : '') + '.png';
  }

  // 이름은 첫 장 기준(2장부터는 받는 분을 비우므로)
  function names(pages, firstData) {
    return pages.map(function (_, i) { return fileName(firstData, i, pages.length); });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  async function save(pages, design, firstData) {
    var blobs = await getBlobs(pages, design);
    var list = names(pages, firstData || pages[0]);
    for (var i = 0; i < blobs.length; i++) {
      downloadBlob(blobs[i], list[i]);
      if (i < blobs.length - 1) await sleep(350); // 브라우저가 연속 다운로드를 막지 않도록 간격을 둔다
    }
    return 'saved';
  }

  function canShareFiles(files) {
    if (!navigator.share || !navigator.canShare) return false;
    try { return navigator.canShare({ files: files }); } catch (e) { return false; }
  }

  // 반환: 'shared' | 'cancelled' | 'unsupported'
  async function share(pages, design, firstData) {
    var blobs = await getBlobs(pages, design);
    var list = names(pages, firstData || pages[0]);
    var files = blobs.map(function (b, i) { return new File([b], list[i], { type: 'image/png' }); });
    if (!canShareFiles(files)) return 'unsupported';
    try {
      await navigator.share({ files: files });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }

  global.VerseExport = { getBlob: getBlob, getBlobs: getBlobs, save: save, share: share };
})(window);
