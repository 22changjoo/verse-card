/*
 * 교회 로고 처리 — 테마가 바뀌어도 어울리게 한다.
 *
 * 올린 로고를 이렇게 다듬어 두 가지로 저장한다(모두 이 기기 안에서만 처리):
 *   orig: 바깥 여백을 잘라낸 원본 색 로고
 *   mono: 로고 모양만 남긴 "모양 마스크"(투명 배경). 여기에 원하는 색을 입혀 한 가지 색 로고를 만든다.
 *
 * 모양 찾기:
 *   - 배경이 투명한 PNG: 투명하지 않은 부분이 로고
 *   - 배경이 있는 이미지(JPG 등): 네 모서리 색을 배경으로 보고, 그 색과 다른 부분이 로고
 * 여백을 잘라내므로 로고가 카드에서 너무 작아 보이지 않는다.
 */
(function (global) {
  'use strict';

  var WORK_MAX = 1600;     // 분석용 최대 크기
  var OUT_MAX_W = 800;     // 저장 크기 상한
  var OUT_MAX_H = 240;
  var PAD = 2;             // 자른 뒤 남기는 여백(px)
  var tintCache = new WeakMap();

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('이미지를 열 수 없습니다.')); };
      img.src = src;
    });
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // img(이미 로드됨) → { orig, mono } (둘 다 PNG data URL)
  function process(img) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var k = Math.min(1, WORK_MAX / Math.max(iw, ih));
    var w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));

    var work = document.createElement('canvas');
    work.width = w; work.height = h;
    var wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.drawImage(img, 0, 0, w, h);
    var src = wctx.getImageData(0, 0, w, h);
    var px = src.data;

    // 투명 배경인지 판단
    var clear = 0, total = w * h;
    for (var i = 3; i < px.length; i += 4) if (px[i] < 250) clear++;
    var hasAlpha = clear / total > 0.01;

    // 배경색(네 모서리 평균)
    var br = 0, bg = 0, bb = 0, n = 0;
    if (!hasAlpha) {
      [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].forEach(function (pt) {
        var o = (pt[1] * w + pt[0]) * 4;
        br += px[o]; bg += px[o + 1]; bb += px[o + 2]; n++;
      });
      br /= n; bg /= n; bb /= n;
    }

    // 모양 마스크 만들기 + 로고가 있는 범위 찾기
    var mono = wctx.createImageData(w, h);
    var m = mono.data;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o2 = (y * w + x) * 4;
        var a;
        if (hasAlpha) {
          a = px[o2 + 3];
        } else {
          var d = Math.max(Math.abs(px[o2] - br), Math.abs(px[o2 + 1] - bg), Math.abs(px[o2 + 2] - bb)) / 255;
          a = Math.round(clamp01((d - 0.10) / 0.30) * 255); // 잡티는 지우고 가장자리는 부드럽게
        }
        m[o2] = 0; m[o2 + 1] = 0; m[o2 + 2] = 0; m[o2 + 3] = a;
        if (a > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; } // 모양을 못 찾으면 전체 사용

    x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD);
    x1 = Math.min(w - 1, x1 + PAD); y1 = Math.min(h - 1, y1 + PAD);
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    var monoFull = document.createElement('canvas');
    monoFull.width = w; monoFull.height = h;
    monoFull.getContext('2d').putImageData(mono, 0, 0);

    var r = Math.min(1, OUT_MAX_W / bw, OUT_MAX_H / bh);
    var ow = Math.max(1, Math.round(bw * r)), oh = Math.max(1, Math.round(bh * r));

    function crop(from) {
      var c = document.createElement('canvas');
      c.width = ow; c.height = oh;
      var ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(from, x0, y0, bw, bh, 0, 0, ow, oh);
      return c.toDataURL('image/png');
    }
    return { orig: crop(work), mono: crop(monoFull) };
  }

  function fromFile(file) {
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      return process(img);
    }, function (err) { URL.revokeObjectURL(url); throw err; });
  }

  function fromDataUrl(dataUrl) {
    return loadImage(dataUrl).then(process);
  }

  // 모양 마스크(이미 로드된 Image)에 색을 입힌 data URL. 같은 색은 다시 만들지 않는다.
  function tint(monoImg, color) {
    var cache = tintCache.get(monoImg);
    if (!cache) { cache = {}; tintCache.set(monoImg, cache); }
    if (cache[color]) return cache[color];
    var c = document.createElement('canvas');
    c.width = monoImg.naturalWidth; c.height = monoImg.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(monoImg, 0, 0);
    cache[color] = c.toDataURL('image/png');
    return cache[color];
  }

  global.VerseLogo = { loadImage: loadImage, fromFile: fromFile, fromDataUrl: fromDataUrl, tint: tint };
})(window);
