/*
 * 카드 렌더링 — 입력 화면과 분리된 순수 함수 모음.
 * 나중에 일괄 생성·자동 발송 모듈에서도 같은 함수를 재사용한다.
 *
 * data   = { seasonTitle, recipient, honorific, recipient2, honorific2, greeting, verse, ref, version, sender }
 * design = { template, size, season, palette, font, deco, step, logo }
 *   season:  절기 id (template이 'season'일 때 색·장식을 결정)
 *   palette: 팔레트 id 또는 null(템플릿 기본색)
 *   font:    글꼴 id 또는 null(템플릿 기본 글꼴)
 *   deco:    장식 표시 여부
 *   step:    글자 크기 수동 조절 단계(-4 ~ +4)
 *   logo:    로고 이미지 data URL 또는 null(표시 안 함)
 */
(function (global) {
  'use strict';

  var MIN_VERSE_PX = 34;
  var STEP_PX = 4;
  var WIDTH_MARGIN_PCT = 4; // 글자 크기 계산 시 말씀 폭에 두는 여유(%)
  var LINE_HEIGHTS = [1.75, 1.65, 1.55, 1.5, 1.45, 1.4]; // 말씀 줄간격: 넓은 쪽부터 시험, 가장 좁은 값(1.4)이 최소
  var config = null;

  // 템플릿별 장식. 모두 이 프로젝트용으로 직접 만든 도형이며, 고정된 내부 문자열만 사용한다.
  var DECOR = {
    cream: {
      layer: '<div class="frame-a"></div><div class="frame-b"></div>',
      icon: '<svg viewBox="0 0 64 40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M32 36 V12"/><path d="M32 26 C22 26 16 20 15 12 C24 12 31 17 32 26Z"/>' +
        '<path d="M32 20 C42 20 48 14 49 6 C40 6 33 11 32 20Z"/><path d="M8 36 H56" opacity="0.5"/></svg>'
    },
    navy: {
      layer: '<div class="frame-a"></div><div class="circle c1"></div><div class="circle c2"></div>',
      icon: '<svg viewBox="0 0 26 34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M13 2 V32"/><path d="M3 11 H23"/></svg>'
    },
    sky: {
      layer: '<div class="blob b1"></div><div class="blob b2"></div>',
      icon: '<div class="bar"></div>'
    },
    paper: {
      layer: '<div class="grain"></div><div class="frame-a"></div>',
      // 펼친 성경책(Lucide book-open)
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>'
    }
  };

  // 절기별 상징 장식(64×64, 선 위주). 색은 카드의 --accent를 따른다. 모두 이 프로젝트용으로 직접 그린 도형이다.
  var SVG_OPEN = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var SEASON_ICON = {
    // 해돋이
    newyear: SVG_OPEN + '<path d="M8 44 H56"/><path d="M18 44 a14 14 0 0 1 28 0"/><path d="M32 18 v6 M15 26 l4 4 M49 26 l-4 4 M8 36 h5 M51 36 h5"/><path d="M12 53 q5-4 10 0 t10 0 t10 0 t10 0"/></svg>',
    // 매화
    seol: SVG_OPEN + '<circle cx="32" cy="20" r="8"/><circle cx="43.4" cy="28.3" r="8"/><circle cx="39" cy="41.7" r="8"/><circle cx="25" cy="41.7" r="8"/><circle cx="20.6" cy="28.3" r="8"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/></svg>',
    // 사순절: 둥근 십자가
    lent: SVG_OPEN + '<circle cx="32" cy="32" r="24"/><path d="M32 15 V50 M22 25 H42"/></svg>',
    // 고난주간: 가시관
    holyweek: SVG_OPEN + '<ellipse cx="32" cy="34" rx="22" ry="10"/><path d="M10 34 l-5 -4 M54 34 l5 -4 M18 27 l-2 -6 M46 27 l2 -6 M32 24 v-6 M18 41 l-2 6 M46 41 l2 6 M32 44 v6"/></svg>',
    // 부활절: 해 뜨는 빈 십자가
    easter: SVG_OPEN + '<circle cx="32" cy="26" r="17" fill="currentColor" fill-opacity="0.22" stroke="none"/><path d="M32 8 V54 M20 24 H44"/><path d="M8 54 H56" stroke-opacity="0.55"/></svg>',
    // 어버이주일: 카네이션
    parents: SVG_OPEN + '<path d="M15 27 c1-8 7-10 10-5 c2-6 10-6 13 0 c3-5 9-3 11 5 c1 5-1 8-5 10 H20 c-4-2-6-5-5-10Z"/><path d="M32 37 V58"/><path d="M32 50 c-7 0-11-3-12-8 c7 0 11 3 12 8Z"/></svg>',
    // 맥추감사절: 보리 이삭
    barley: SVG_OPEN + '<path d="M32 58 V14"/><path d="M32 10 v6"/><path d="M32 26 c-7 0-9-6-9-10 c7 0 9 5 9 10Z"/><path d="M32 26 c7 0 9-6 9-10 c-7 0-9 5-9 10Z"/><path d="M32 38 c-7 0-9-6-9-10 c7 0 9 5 9 10Z"/><path d="M32 38 c7 0 9-6 9-10 c-7 0-9 5-9 10Z"/><path d="M32 50 c-7 0-9-6-9-10 c7 0 9 5 9 10Z"/><path d="M32 50 c7 0 9-6 9-10 c-7 0-9 5-9 10Z"/></svg>',
    // 추석: 보름달
    chuseok: SVG_OPEN + '<circle cx="32" cy="29" r="19"/><circle cx="25" cy="24" r="3"/><circle cx="38" cy="35" r="4"/><path d="M9 55 q6-6 12 0 t12 0 t12 0 t10 0"/></svg>',
    // 추수감사절: 감
    thanks: SVG_OPEN + '<path d="M32 22 c-14 0-20 10-18 20 c2 10 10 14 18 14 s16-4 18-14 c2-10-4-20-18-20Z"/><path d="M22 22 l10 7 l10-7"/><path d="M32 13 v9"/></svg>',
    // 대림절: 네 개의 초
    advent: SVG_OPEN + '<rect x="9" y="38" width="9" height="18" rx="1.5"/><rect x="22" y="34" width="9" height="22" rx="1.5"/><rect x="35" y="30" width="9" height="26" rx="1.5"/><rect x="48" y="38" width="9" height="18" rx="1.5"/><path d="M13.5 27 c-3 4-3 7 0 8 c3-1 3-4 0-8Z M26.5 23 c-3 4-3 7 0 8 c3-1 3-4 0-8Z M39.5 19 c-3 4-3 7 0 8 c3-1 3-4 0-8Z M52.5 27 c-3 4-3 7 0 8 c3-1 3-4 0-8Z"/><path d="M5 58 H59"/></svg>',
    // 성탄절: 별
    christmas: SVG_OPEN + '<path d="M32 5 L38.5 24 L59 32 L38.5 40 L32 59 L25.5 40 L5 32 L25.5 24Z" fill="currentColor" fill-opacity="0.9"/></svg>'
  };

  function setConfig(cfg) { config = cfg; }

  // 종이 질감: SVG 필터는 이미지 변환 시 검게 나오므로, 고정 시드 노이즈를 PNG로 한 번 만들어 쓴다.
  var grainUrl = null;
  function paperGrainUrl() {
    if (grainUrl) return grainUrl;
    var n = 128, canvas = document.createElement('canvas'); // CSS에서 256px로 늘려 알갱이를 키움(용량 절감)
    canvas.width = n; canvas.height = n;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(n, n);
    var seed = 20261009;
    function rand() { // mulberry32
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (var i = 0; i < img.data.length; i += 4) {
      img.data[i] = 115; img.data[i + 1] = 97; img.data[i + 2] = 71;
      // 알파를 4단계로 단순화해 PNG 용량을 줄인다(최대 약 14%).
      img.data[i + 3] = Math.floor(rand() * 4) * 12;
    }
    ctx.putImageData(img, 0, 0);
    grainUrl = canvas.toDataURL('image/png');
    return grainUrl;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function sizeOf(design) {
    return byId(config.sizes, design.size) || config.sizes[0];
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function toLine(data) {
    // 부부처럼 직분이 다른 두 분: "홍길동 장로님 · 유관순 권사님께"
    var people = [
      [(data.recipient || '').trim(), data.honorific],
      [(data.recipient2 || '').trim(), data.honorific2]
    ].filter(function (p) { return p[0]; })
     .map(function (p) { return p[0] + ' ' + (p[1] || ''); });
    if (!people.length) return '';
    return people.join(' · ') + '께';
  }

  function refLine(data) {
    var ref = (data.ref || '').trim();
    if (!ref) return '';
    return data.version ? ref + ' · ' + data.version : ref;
  }

  function applyTheme(card, tpl, design, size, season) {
    var c = season ? season.colors : tpl.colors;
    var pal = design.palette ? byId(config.palettes, design.palette) : null;
    if (pal) c = pal;
    var font = byId(config.fonts, design.font || tpl.font) || config.fonts[0];
    var verseSize = size.verseSize + (design.step || 0) * STEP_PX;

    var vars = {
      '--logo-scale': String(design.logoScale || 1),
      '--bg': c.bg, '--ink': c.ink, '--sub': c.sub, '--accent': c.accent, '--line': c.line,
      '--font': font.family,
      '--verse-size': verseSize + 'px',
      '--verse-weight': String(tpl.verseWeight || 400),
      '--ai': tpl.align === 'left' ? 'flex-start' : 'center',
      '--ta': tpl.align === 'left' ? 'left' : 'center'
    };
    Object.keys(vars).forEach(function (k) { card.style.setProperty(k, vars[k]); });
    card.style.width = size.w + 'px';
    card.style.height = size.h + 'px';
  }

  function renderCard(data, design) {
    var tpl = byId(config.templates, design.template) || config.templates[0];
    var size = sizeOf(design);
    // 절기 맞춤 템플릿: 선택한 절기의 색·장식을 쓴다. (절기를 아직 고르지 않았으면 기본 모양)
    var season = tpl.id === 'season' ? byId(config.seasons, design.season) : null;
    var decor = DECOR[tpl.id] || DECOR.cream;
    if (tpl.id === 'season') {
      decor = {
        layer: '<div class="wash"></div><div class="frame-a"></div><div class="frame-b"></div>',
        icon: season ? SEASON_ICON[season.id] : DECOR.cream.icon
      };
    }

    var card = el('div', 'card tpl-' + tpl.id + (season ? ' season-' + season.id : '') +
      ' size-' + size.id + (design.deco === false ? ' no-deco' : ''));
    applyTheme(card, tpl, design, size, season);

    var layer = el('div', 'decor');
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = decor.layer; // 고정 문자열(사용자 입력 아님)
    var grain = layer.querySelector('.grain');
    if (grain) grain.style.backgroundImage = 'url(' + paperGrainUrl() + ')';
    card.appendChild(layer);

    var content = el('div', 'content');

    var icon = el('div', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = decor.icon; // 고정 문자열(사용자 입력 아님)
    content.appendChild(icon);

    var title = (data.seasonTitle || '').trim();
    if (title) content.appendChild(el('div', 'season-title', title));

    var to = toLine(data);
    if (to) content.appendChild(el('div', 'to', to));

    var greeting = (data.greeting || '').trim();
    if (greeting) content.appendChild(el('div', 'greeting', greeting));

    var body = el('div', 'body');
    body.appendChild(el('div', 'rule'));
    body.appendChild(el('div', 'verse', (data.verse || '').trim()));
    var ref = refLine(data);
    if (ref) body.appendChild(el('div', 'ref', ref));
    if (data.pageLabel) body.appendChild(el('div', 'pageno', data.pageLabel));
    content.appendChild(body);

    var sender = (data.sender || '').trim();
    // 맺음말: 드림 / 올림 / 직접 입력 / 없음 (지정하지 않으면 "드림")
    var closing = data.closing === undefined ? '드림' : (data.closing || '').trim();
    if (design.logo || sender) {
      var footer = el('div', 'footer');
      if (design.logo) {
        var img = el('img', 'logo');
        img.alt = '';
        img.src = design.logo;
        footer.appendChild(img);
      }
      if (sender) footer.appendChild(el('div', 'from', closing ? sender + ' ' + closing : sender));
      content.appendChild(footer);
    }

    card.appendChild(content);
    return card;
  }

  // 말씀이 영역을 넘치면 글자 크기를 줄인다. DOM에 붙은 뒤에 호출해야 한다.
  // 반환값: 최종 글자 크기(px), 최소값에도 넘치면 overflow=true
  function fitCard(card) {
    var verse = card.querySelector('.verse');
    if (!verse) return { size: 0, overflow: false };

    // 말씀 영역만 줄어들 수 있으므로, 넘침은 말씀 영역 자체로 판단한다.
    var isOver = function () { return verse.scrollHeight > verse.clientHeight + 1; };
    verse.style.fontSize = '';
    verse.style.lineHeight = '';
    // 화면에서 딱 맞게 들어가도 이미지로 변환하면 글자 폭이 미세하게 달라져 줄이 늘 수 있다.
    // 그래서 폭에 여유를 두고 재어, 경계에 걸린 크기를 피한다. (측정 후 원래 폭으로 되돌림)
    verse.style.width = (100 - WIDTH_MARGIN_PCT) + '%';

    // 글자 크기를 줄이기 전에 줄간격부터 좁혀 본다.
    // 같은 글자 크기에서 줄간격(넓은 쪽부터)을 하나씩 시험하고, 그래도 안 들어가면 글자를 1px 줄여 다시 시험한다.
    var size = parseFloat(getComputedStyle(verse).fontSize);
    var lh = LINE_HEIGHTS[0];
    var fitted = false;
    for (;;) {
      verse.style.fontSize = size + 'px';
      for (var i = 0; i < LINE_HEIGHTS.length; i++) {
        lh = LINE_HEIGHTS[i];
        verse.style.lineHeight = String(lh);
        if (!isOver()) { fitted = true; break; }
      }
      if (fitted || size <= MIN_VERSE_PX) break;
      size -= 1;
    }
    verse.style.width = '';
    return { size: size, lineHeight: lh, overflow: !fitted };
  }

  // 지금 디자인에 쓰이는 색 (로고를 테마 색으로 맞출 때 사용)
  function themeColors(design) {
    var tpl = byId(config.templates, design.template) || config.templates[0];
    var season = tpl.id === 'season' ? byId(config.seasons, design.season) : null;
    var pal = design.palette ? byId(config.palettes, design.palette) : null;
    return pal || (season ? season.colors : tpl.colors);
  }

  global.VerseCard = {
    MIN_VERSE_PX: MIN_VERSE_PX,
    setConfig: setConfig,
    themeColors: themeColors,
    sizeOf: sizeOf,
    renderCard: renderCard,
    fitCard: fitCard
  };
})(window);
