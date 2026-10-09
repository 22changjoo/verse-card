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

  // 구글 폰트는 다른 도메인의 스타일시트라서 이미지 변환 도구가 안의 글꼴 정보를 읽지 못한다.
  // 그러면 저장된 이미지에서만 글꼴이 기본 글꼴로 바뀌어 글자가 더 넓어지고, 줄이 늘어 말씀이 잘린다.
  // 그래서 구글 폰트 CSS를 직접 받아 이 카드에 쓰인 글꼴·글자만 골라 변환 도구에 넘긴다.
  var fontCssPromise = null;
  function loadGoogleFontCss() {
    if (!fontCssPromise) {
      var link = document.querySelector('link[href*="fonts.googleapis.com/css"]');
      fontCssPromise = link
        ? fetch(link.href).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
        : Promise.resolve('');
      fontCssPromise.then(function (t) { if (!t) fontCssPromise = null; }); // 실패하면 다음에 다시 시도
    }
    return fontCssPromise;
  }

  function inRanges(code, rangeText) {
    return rangeText.split(',').some(function (part) {
      var m = part.trim().match(/^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i);
      if (!m) return false;
      var lo = parseInt(m[1], 16), hi = m[2] ? parseInt(m[2], 16) : lo;
      return code >= lo && code <= hi;
    });
  }

  // 글꼴 파일은 변환 도구가 알아서 내려받지 않으므로 직접 받아 data 주소로 바꿔 넣는다.
  var fontDataCache = new Map(); // url → Promise<data url>
  function fontDataUrl(url) {
    if (!fontDataCache.has(url)) {
      var p = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('font ' + r.status);
        return r.blob();
      }).then(function (blob) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
      });
      p.catch(function () { fontDataCache.delete(url); });
      fontDataCache.set(url, p);
    }
    return fontDataCache.get(url);
  }

  async function buildFontCss(card) {
    var css = await loadGoogleFontCss();
    if (!css) return '';
    var families = {}, weights = { 400: true };
    card.querySelectorAll('*').forEach(function (n) {
      if (!n.childNodes.length || !Array.prototype.some.call(n.childNodes, function (c) { return c.nodeType === 3 && c.textContent.trim(); })) return;
      var cs = getComputedStyle(n);
      families[cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()] = true;
      var w = parseInt(cs.fontWeight, 10) || 400;
      weights[w >= 600 ? 700 : (w === 500 ? 500 : 400)] = true;
    });
    var chars = {};
    (card.textContent || '').split('').forEach(function (ch) { chars[ch.charCodeAt(0)] = true; });
    var codes = Object.keys(chars).map(Number);
    var out = [];
    css.split('@font-face').slice(1).forEach(function (block) {
      var fam = (block.match(/font-family:\s*['"]?([^;'"]+)['"]?\s*;/) || [])[1];
      var wt = parseInt((block.match(/font-weight:\s*(\d+)/) || [])[1], 10);
      var range = (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
      if (!fam || !families[fam] || !weights[wt]) return;
      if (range && !codes.some(function (c) { return inRanges(c, range); })) return;
      out.push('@font-face' + block.slice(0, block.indexOf('}') + 1));
    });
    var inlined = await Promise.all(out.map(function (block) {
      var m = block.match(/url\(([^)]+)\)/);
      if (!m) return block;
      var url = m[1].replace(/["']/g, '');
      return fontDataUrl(url).then(function (data) {
        return block.replace(m[0], 'url(' + data + ')');
      }).catch(function () { return ''; }); // 받지 못한 조각은 건너뛴다
    }));
    return inlined.filter(Boolean).join('\n');
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
      var fontCss = await buildFontCss(card);
      var opts = {
        width: size.w,
        height: size.h,
        scale: PIXEL_RATIO,
        type: 'image/png'
      };
      if (fontCss) opts.font = { cssText: fontCss };
      return await global.modernScreenshot.domToBlob(card, opts);
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
