(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // 값이 바뀌면 미리보기를 다시 그리는 입력칸
  var inputIds = ['seasonTitle', 'recipient', 'honorific', 'honorificCustom', 'recipient2', 'honorific2',
    'honorific2Custom', 'greeting', 'verse', 'ref', 'version', 'sender', 'closing', 'closingCustom'];
  // 로고 크기 비율 / 로고 색 선택지
  var LOGO_SCALE = { s: 0.75, m: 1, l: 1.35 };
  var LOGO_SIZES = [['s', '작게'], ['m', '보통'], ['l', '크게']];
  var LOGO_COLORS = [['auto', '자동'], ['theme', '테마 단색'], ['original', '원본 색'], ['white', '흰색'], ['black', '검정']];
  var HONORIFICS = ['님', '성도님', '집사님', '권사님', '장로님', '목사님', '사모님'];
  var CUSTOM = '__custom';
  var STEP_MIN = -4;
  var STEP_MAX = 4;

  var config = null;
  var greetings = null;
  // splitOn: 긴 말씀을 절 단위로 여러 장으로 나누는 중 / page: 미리보기 중인 장(0부터) / showNo: "1/3" 표시
  var state = { type: 'visit', splitOn: false, page: 0, showNo: true };
  var design = { template: 'cream', size: 'square', season: null, palette: null, font: null, deco: true, step: 0,
    logoOn: true, logoColor: 'auto', logoSize: 'm', logoPref: 1 };
  var logoMonoImg = null; // 로고 모양 마스크(색을 입히는 데 사용)
  var BUILTIN_LOGO = 'assets/logo/leaf.png'; // 기본 로고(교회 로고 중 나뭇잎만)
  var logoData = { orig: null, mono: null, builtin: false };

  // 컴퓨터(넓은 화면)인지: CSS의 대시보드 배치(min-width 1024px)와 같은 기준
  var wideMQ = window.matchMedia('(min-width: 1024px)');
  function isWide() { return wideMQ.matches; }

  var previewEl = document.querySelector('.preview');
  var previewFrame = $('previewFrame');
  var previewScale = $('previewScale');

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ── 입력 / 디자인 데이터 ──
  function honorificOf(selectId, customId) {
    var v = $(selectId).value;
    return v === CUSTOM ? $(customId).value.trim() : v;
  }

  function readData() {
    return {
      seasonTitle: state.type === 'season' ? $('seasonTitle').value : '',
      recipient: $('recipient').value,
      honorific: honorificOf('honorific', 'honorificCustom'),
      recipient2: $('recipient2').value,
      honorific2: honorificOf('honorific2', 'honorific2Custom'),
      greeting: $('greeting').value,
      verse: $('verse').value,
      ref: $('ref').value,
      version: $('version').value,
      sender: $('sender').value,
      closing: $('closing').value === CUSTOM ? $('closingCustom').value.trim() : $('closing').value
    };
  }

  // 입력이 비어 있을 때 미리보기에 보여줄 안내 문구
  function withPlaceholders(data) {
    var d = Object.assign({}, data);
    if (!d.verse.trim()) d.verse = '말씀 본문을 입력하면\n이곳에 표시됩니다.';
    return d;
  }

  // 지금 쓰는 로고: 사용자가 올린 로고가 있으면 그것, 없으면 앱에 들어 있는 기본 로고(높은뜻푸른교회 나뭇잎)
  function currentLogo() { return logoData.orig; }

  // 색의 밝기(0~1). 배경이 밝은지 어두운지 판단할 때 쓴다.
  function luminance(hex) {
    var h = hex.replace('#', '');
    var ch = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  // 카드에 넣을 로고 이미지.
  //  자동: 밝은 배경에서는 원본 색, 어두운 배경에서는 테마 색 한 가지로 바꿔 넣는다.
  //  테마 단색: 항상 카드의 보조색 한 가지 / 원본 색 / 흰색 / 검정
  function logoSource() {
    if (!design.logoOn) return null;
    var orig = currentLogo();
    if (!orig) return null;
    var mode = design.logoColor || 'auto';
    if (!logoMonoImg) return orig;
    var colors = VerseCard.themeColors(design);
    if (mode === 'auto') mode = luminance(colors.bg) > 0.4 ? 'original' : 'theme';
    if (mode === 'original') return orig;
    var color = mode === 'theme' ? colors.sub : (mode === 'white' ? '#ffffff' : '#222222');
    return VerseLogo.tint(logoMonoImg, color);
  }

  // 저장된 로고의 모양 마스크를 준비한다. (예전 방식으로 저장된 로고는 여기서 다듬어 다시 저장)
  function prepareLogo() {
    var orig = VerseStore.get('logo', null);
    var ready;
    if (orig) {
      var mono = VerseStore.get('logoMono', null);
      ready = mono
        ? Promise.resolve({ orig: orig, mono: mono })
        : VerseLogo.fromDataUrl(orig).then(function (res) {
            VerseStore.set('logo', res.orig);
            VerseStore.set('logoMono', res.mono);
            return res;
          });
      ready = ready.then(function (res) { logoData = { orig: res.orig, mono: res.mono, builtin: false }; });
    } else {
      // 올린 로고가 없으면 앱에 들어 있는 기본 로고를 쓴다.
      ready = VerseLogo.fromDataUrl(BUILTIN_LOGO).then(function (res) {
        logoData = { orig: res.orig, mono: res.mono, builtin: true };
      });
    }
    return ready
      .then(function () { return VerseLogo.loadImage(logoData.mono); })
      .then(function (img) { logoMonoImg = img; })
      .catch(function () { logoData = { orig: null, mono: null, builtin: false }; logoMonoImg = null; });
  }

  function buildDesign() {
    return {
      template: design.template,
      size: design.size,
      season: design.season,
      palette: design.palette,
      font: design.font,
      deco: design.deco,
      step: design.step,
      logo: logoSource(),
      logoScale: LOGO_SCALE[design.logoSize] || 1
    };
  }

  // 설정을 고친 시각(여러 기기 동기화에서 최신 설정이 이기도록 쓴다). 앱을 열기만 해서는 갱신하지 않는다.
  var lastDesignJson = null;
  function touchSettings() { VerseStore.set('settingsAt', Date.now()); }
  function saveDesign() {
    var json = JSON.stringify(design);
    if (json === lastDesignJson) return;
    lastDesignJson = json;
    VerseStore.set('design', design);
    touchSettings();
  }

  // ── 미리보기 ──
  function fitScale() {
    var size = VerseCard.sizeOf(design);
    if (!previewEl.clientWidth) return; // 화면에 보이지 않을 때(홈 화면)는 계산하지 않는다
    var maxW, maxH;
    if (isWide()) {
      // 컴퓨터: 가운데 열 전체를 쓰는 큰 미리보기 (상자 안쪽 여백 20×2를 뺀 폭)
      maxW = Math.min(previewEl.clientWidth - 40, 720);
      maxH = Math.max(300, window.innerHeight - 400); // 아래에 보내기 영역이 함께 보이도록 여유를 둔다
    } else {
      // 휴대폰: 좌우 여백(16×2)과 미리보기 상자 안쪽 여백(12×2)을 뺀 폭
      maxW = Math.min(previewEl.clientWidth - 56, 420);
      maxH = Math.max(200, window.innerHeight * 0.34);
    }
    var scale = Math.min(maxW / size.w, maxH / size.h);
    previewFrame.style.width = Math.round(size.w * scale) + 'px';
    previewFrame.style.height = Math.round(size.h * scale) + 'px';
    previewScale.style.width = size.w + 'px';
    previewScale.style.height = size.h + 'px';
    previewScale.style.transform = 'scale(' + scale + ')';
  }

  // 지금 만들 카드의 장별 데이터. 나누기를 켰으면 절 단위로 나눈 여러 장, 아니면 한 장.
  function buildPages(design2) {
    var data = readData();
    if (state.splitOn && data.verse.trim()) return VerseSplit.split(data, design2 || buildDesign(), state.showNo);
    return [data];
  }

  // ── 최근 받는 분 (이 기기에만 저장, 카드를 실제로 만들었을 때 기록) ──
  var RECENT_MAX = 10;

  function loadRecent() {
    var r = VerseStore.get('recent', []);
    return Array.isArray(r) ? r.filter(function (x) { return x && typeof x.name === 'string' && x.name; }) : [];
  }

  function renderRecent() {
    var list = loadRecent();
    var dl = $('recentNames');
    dl.replaceChildren();
    list.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.name;
      dl.appendChild(o);
    });
    $('recentSummary').textContent = '최근 받는 분 ' + list.length + '명';
    $('clearRecent').disabled = list.length === 0;
  }

  // 홈 화면의 "최근 받는 분": 누르면 이름과 호칭이 채워진 채로 내용 입력 단계로 간다.
  function rememberRecipients(data) {
    var list = loadRecent();
    // 두 번째 분을 먼저 넣어서, 첫 번째 분이 맨 앞에 오게 한다.
    [[data.recipient2, data.honorific2], [data.recipient, data.honorific]].forEach(function (p) {
      var name = (p[0] || '').trim();
      if (!name) return;
      list = list.filter(function (x) { return x.name !== name; });
      list.unshift({ name: name, honorific: p[1] || '', at: Date.now() });
    });
    VerseStore.set('recent', list.slice(0, RECENT_MAX));
    renderRecent();
  }

  // ── 보낸 내역 ──
  function sentLabel() {
    if (state.type === 'season') {
      var s = design.season ? byId(config.seasons, design.season) : null;
      return s ? s.name : '절기 인사';
    }
    var sel = $('situation');
    return sel.value ? sel.options[sel.selectedIndex].textContent : '';
  }

  // 카드를 실제로 저장·공유·인쇄했을 때 한 줄 남긴다. via: 'save' | 'share' | 'print'
  function recordHistory(data, pages, via) {
    var recipients = [[data.recipient, data.honorific], [data.recipient2, data.honorific2]]
      .filter(function (p) { return (p[0] || '').trim(); })
      .map(function (p) { return { name: p[0].trim(), honorific: p[1] || '' }; });
    var size = VerseCard.sizeOf(design);
    VerseHistory.add({
      via: via, type: state.type, label: sentLabel(), recipients: recipients,
      ref: (data.ref || '').trim(), version: data.version || '',
      size: size.id, sizeName: size.name, template: design.template, pages: pages.length
    });
    renderHomeHistory();
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  }

  // 홈: 최근 보낸 카드 3건
  function renderHomeHistory() {
    var box = $('homeHistory');
    if (!box) return;
    box.replaceChildren();
    var list = VerseHistory.list().slice(0, 3);
    list.forEach(function (e) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'history-row';
      row.dataset.hid = e.id;
      row.setAttribute('aria-label', VerseHistory.recipientsText(e) + '께 다시 보내기');
      var main = document.createElement('div');
      main.className = 'history-main';
      var who = document.createElement('div');
      who.className = 'history-who';
      who.textContent = VerseHistory.recipientsText(e) + '께';
      var sub = document.createElement('div');
      sub.className = 'history-sub';
      sub.textContent = [e.ref, e.label].filter(Boolean).join(' · ') || '말씀 없음';
      main.appendChild(who); main.appendChild(sub);
      var when = document.createElement('div');
      when.className = 'history-when';
      when.textContent = fmtDate(e.at);
      row.appendChild(main); row.appendChild(when);
      box.appendChild(row);
    });
    $('homeHistoryEmpty').hidden = list.length > 0;
  }

  function fillRecipient(nameId, selectId, customId, name, honorific) {
    $(nameId).value = name || '';
    var sel = $(selectId), custom = $(customId);
    if (!honorific) return;
    if (HONORIFICS.indexOf(honorific) >= 0) { sel.value = honorific; custom.hidden = true; }
    else { sel.value = CUSTOM; custom.hidden = false; custom.value = honorific; }
  }

  // 보낸 기록에서 같은 분(들)께 다시 시작: 받는 분·직분·카드 유형을 채운다.
  function startFromHistory(entry) {
    setType(entry.type === 'season' ? 'season' : 'visit');
    var rs = entry.recipients || [];
    fillRecipient('recipient', 'honorific', 'honorificCustom', rs[0] && rs[0].name, rs[0] && rs[0].honorific);
    var field = $('recipient2Field');
    if (rs[1]) {
      fillRecipient('recipient2', 'honorific2', 'honorific2Custom', rs[1].name, rs[1].honorific);
      if (field.hidden) $('toggleRecipient2').click();
    } else if (!field.hidden) {
      $('toggleRecipient2').click();
    }
    render();
    ui.step = 1;
    setView('create');
  }

  // 같은 분께 같은 말씀을 이미 보냈다면 알려 준다.
  function updateSentHint() {
    var hint = $('sentHint');
    if (!hint) return;
    var d = readData();
    var names = [d.recipient, d.recipient2];
    var found = VerseHistory.findSent(names, d.ref.trim() ? VerseLibrary.refKey(d.ref) : '', VerseLibrary.refKey);
    if (!found.length) { hint.hidden = true; return; }
    var e = found[0];
    hint.textContent = VerseHistory.recipientsText(e) + '께 이 말씀(' + e.ref + ')을 ' + fmtDate(e.at) + '에 보낸 적이 있어요.' +
      (found.length > 1 ? ' (총 ' + found.length + '번)' : '');
    hint.hidden = false;
  }

  // 자동완성으로 이름을 고르면 지난번 호칭도 함께 채운다.
  function applyRecentHonorific(nameId, selectId, customId) {
    var name = $(nameId).value.trim();
    var found = loadRecent().filter(function (r) { return r.name === name; })[0];
    if (!found || !found.honorific) return;
    var sel = $(selectId), custom = $(customId);
    if (HONORIFICS.indexOf(found.honorific) >= 0) {
      sel.value = found.honorific;
      custom.hidden = true;
    } else {
      sel.value = CUSTOM;
      custom.hidden = false;
      custom.value = found.honorific;
    }
    render();
  }

  function render() {
    var data = readData();
    var d = buildDesign();
    var splitting = state.splitOn && data.verse.trim();
    var pages = splitting ? VerseSplit.split(data, d, state.showNo) : [withPlaceholders(data)];
    state.page = Math.max(0, Math.min(state.page, pages.length - 1));

    var card = VerseCard.renderCard(pages[state.page], d);
    previewScale.replaceChildren(card);
    var fit = VerseCard.fitCard(card);
    fitScale();
    updateStepLabel();
    updateSplitUi(data, fit, pages);
    state.pagesCount = pages.length;
    updateSummary();
    updateSentHint();
    prewarm();
    return fit;
  }

  // ── 화면 이동: 홈 → 내용 → 디자인 → 보내기 ──
  var STEP_NEXT_LABEL = { 1: '다음 · 디자인', 2: '다음 · 보내기' };
  var ui = { view: 'home', step: 1 };

  function setView(view, opts) {
    ui.view = view;
    document.body.dataset.view = view;
    $('viewHome').hidden = view !== 'home';
    $('viewCreate').hidden = view !== 'create';
    $('stepbar').hidden = view !== 'create';
    // 기기의 뒤로 가기 버튼으로 홈에 돌아올 수 있게 기록을 남긴다.
    if (view === 'create' && !(opts && opts.fromPop)) {
      try { history.pushState({ view: 'create' }, ''); } catch (e) { /* 무시 */ }
    }
    if (view === 'create') setStep(ui.step || 1); else { window.scrollTo(0, 0); }
  }

  function setStep(n) {
    ui.step = Math.max(1, Math.min(3, n));
    // 컴퓨터(넓은 화면)에서는 세 영역을 한 화면에 모두 펼치므로 단계 전환을 쓰지 않는다.
    if (isWide()) {
      document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = false; });
      $('stepPrev').hidden = true;
      $('stepNext').hidden = true;
      $('btnShare').hidden = false;
      render();
      return;
    }
    $('stepPrev').hidden = false;
    document.querySelectorAll('[data-panel]').forEach(function (p) {
      p.hidden = Number(p.dataset.panel) !== ui.step;
    });
    document.querySelectorAll('[data-step-go]').forEach(function (b) {
      var k = Number(b.dataset.stepGo);
      b.classList.toggle('done', k < ui.step);
      b.classList.toggle('current', k === ui.step);
      if (k === ui.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    var lines = document.querySelectorAll('.step-line');
    lines.forEach(function (l, i) { l.classList.toggle('done', ui.step > i + 1); });

    $('stepPrev').textContent = ui.step === 1 ? '홈' : '이전';
    $('stepNext').hidden = ui.step === 3;
    $('btnShare').hidden = ui.step !== 3;
    if (STEP_NEXT_LABEL[ui.step]) $('stepNext').textContent = STEP_NEXT_LABEL[ui.step];
    window.scrollTo(0, 0);
    render(); // 화면에 보이게 된 뒤에 미리보기 크기를 다시 맞춘다
  }

  // 보내기 단계의 요약(받는 분·보낸 이·크기·장 수)
  function updateSummary() {
    var d = readData();
    var names = [[d.recipient, d.honorific], [d.recipient2, d.honorific2]]
      .filter(function (p) { return (p[0] || '').trim(); })
      .map(function (p) { return p[0].trim() + ' ' + (p[1] || ''); });
    $('sumTo').textContent = names.length ? names.join(' · ') + '께' : '받는 분 없이 만들어요';
    $('sumInitial').textContent = names.length ? names[0].trim().charAt(0) : '말';
    var sender = (d.sender || '').trim();
    $('sumFrom').textContent = sender ? sender + (d.closing ? ' ' + d.closing : '') : '보낸 이를 입력하지 않았어요';
    var n = state.pagesCount || 1;
    $('sumMeta').textContent = VerseCard.sizeOf(design).name + '\n' + n + '장';
    $('shareLabel').textContent = n > 1 ? n + '장 한 번에 공유하기' : '공유하기';
  }

  // ── 즐겨찾기: 자주 쓰는 주제(심방 상황·절기)와 디자인을 5개까지 저장 ──
  var MAX_FAVORITES = 5;
  var STAR_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 5.6L20 9l-4.3 3.8L17 18.5 12 15.5 7 18.5l1.3-5.7L4 9l5.6-.4z"/></svg>';
  var CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function loadFavorites() {
    var list = VerseStore.get('favorites', []);
    return Array.isArray(list) ? list.slice(0, MAX_FAVORITES) : [];
  }
  function storeFavorites(list) {
    VerseStore.set('favorites', list);
    touchSettings();
    renderFavorites();
  }

  function favoriteLabel(f) {
    var topic = f.type === 'season'
      ? (byId(config.seasons, f.season) || {}).name
      : (byId(greetings.situations, f.situation) || {}).name;
    return [topic || (f.type === 'season' ? '절기 카드' : '심방 카드')];
  }

  function favoriteSub(f) {
    var tpl = byId(config.templates, f.template), size = byId(config.sizes, f.size);
    return [f.type === 'season' ? '절기 카드' : '심방 카드', tpl && tpl.name, size && size.name].filter(Boolean).join(' · ');
  }

  function renderFavorites() {
    var box = $('homeFav');
    if (!box) return;
    box.replaceChildren();
    var list = loadFavorites();
    list.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'fav-item';
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'fav-go';
      go.dataset.fav = f.id;
      var star = document.createElement('span');
      star.innerHTML = STAR_SVG; // 고정 문자열
      var text = document.createElement('span');
      text.style.minWidth = '0';
      var name = document.createElement('div');
      name.className = 'fav-name';
      name.textContent = f.name;
      var sub = document.createElement('div');
      sub.className = 'fav-sub';
      sub.textContent = favoriteSub(f);
      text.appendChild(name); text.appendChild(sub);
      go.appendChild(star); go.appendChild(text);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn small fav-del';
      del.dataset.favDel = f.id;
      del.setAttribute('aria-label', f.name + ' 즐겨찾기 지우기');
      del.innerHTML = CLOSE_SVG; // 고정 문자열
      row.appendChild(go); row.appendChild(del);
      box.appendChild(row);
    });
    $('homeFavEmpty').hidden = list.length > 0;
    $('homeFavCount').textContent = list.length ? list.length + '/' + MAX_FAVORITES : '';
  }

  function saveFavorite() {
    var list = loadFavorites();
    if (list.length >= MAX_FAVORITES) {
      toast('즐겨찾기는 ' + MAX_FAVORITES + '개까지예요. 홈에서 하나를 지운 뒤 저장해 주세요.');
      return;
    }
    var fav = {
      id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type: state.type,
      situation: state.type === 'visit' ? $('situation').value : '',
      season: design.season,
      template: design.template, size: design.size, palette: design.palette, font: design.font,
      deco: design.deco, step: design.step
    };
    var topic = favoriteLabel(fav)[0];
    var tpl = byId(config.templates, fav.template);
    var name = window.prompt('즐겨찾기 이름을 정해 주세요.', topic + (tpl ? ' · ' + tpl.name : ''));
    if (name === null) return;
    fav.name = name.trim() || topic;
    list.push(fav);
    storeFavorites(list);
    toast('즐겨찾기에 저장했어요. 홈에서 바로 시작할 수 있어요.');
  }

  function applyFavorite(f) {
    setType(f.type === 'season' ? 'season' : 'visit');
    if (f.type !== 'season' && f.situation && byId(greetings.situations, f.situation)) $('situation').value = f.situation;
    if (byId(config.templates, f.template)) design.template = f.template;
    if (byId(config.sizes, f.size)) design.size = f.size;
    design.palette = f.palette && byId(config.palettes, f.palette) ? f.palette : null;
    design.font = f.font && byId(config.fonts, f.font) ? f.font : null;
    design.deco = f.deco !== false;
    design.step = Math.max(STEP_MIN, Math.min(STEP_MAX, parseInt(f.step, 10) || 0));
    var season = f.type === 'season' ? byId(config.seasons, f.season) : null;
    design.season = season ? season.id : null;
    if (season) { $('season').value = season.id; $('seasonTitle').value = season.title; }
    else if (f.type === 'season') $('season').value = '';
    syncControls(); saveDesign(); refreshSuggestions(); render();
    ui.step = 1;
    setView('create');
  }

  function startCard(type) {
    setType(type);
    ui.step = 1;
    setView('create');
  }

  function syncThemeSeg() {
    var mode = VerseTheme.get();
    document.querySelectorAll('#themeSeg [data-theme-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeMode === mode));
    });
  }

  // 긴 말씀 나누기 안내·버튼, 장 이동
  function updateSplitUi(data, fit, pages) {
    var us = VerseSplit.units(data.verse);
    if (state.splitOn && us.length < 2) state.splitOn = false;

    var box = $('splitBox'), msg = $('splitMsg');
    var on = state.splitOn;
    $('splitOn').hidden = on || us.length < 2;
    $('splitOn').classList.toggle('primary-chip', !on && fit.overflow);
    $('splitOff').hidden = !on;
    $('pageNoWrap').hidden = !(on && pages.length > 1);

    if (on) {
      box.hidden = false;
      msg.textContent = pages.length > 1
        ? pages.length + '장으로 나누었습니다. 출처는 마지막 장에 표시됩니다.'
        : '한 장에 모두 들어가서 나누지 않았습니다.';
    } else if (fit.overflow) {
      box.hidden = false;
      msg.textContent = us.length >= 2
        ? '말씀이 길어 글자를 가장 작게 해도 다 들어가지 않습니다. 절 단위로 나누어 여러 장으로 만들 수 있어요.'
        : '말씀이 길어 일부가 잘립니다. 절마다 줄을 바꾸거나 절 번호(1 2 3)를 넣으면 나눌 수 있어요.';
    } else if (us.length >= 3) {
      box.hidden = false;
      msg.textContent = '원하면 절 단위로 여러 장으로 나눌 수 있어요.';
    } else {
      box.hidden = true;
    }

    var pager = $('pager');
    pager.hidden = pages.length < 2;
    $('pageLabel').textContent = (state.page + 1) + ' / ' + pages.length;
    $('pagePrev').disabled = state.page <= 0;
    $('pageNext').disabled = state.page >= pages.length - 1;
  }

  // ── 라이브러리에서 선택 ──
  var libReady = null;
  var libTheme = '';

  function renderLibList() {
    var ul = $('libList');
    ul.replaceChildren();
    var all = VerseLibrary.list().filter(function (v) { return v.text.trim(); });
    var items = all.filter(function (v) { return !libTheme || v.theme.indexOf(libTheme) >= 0; });

    if (!all.length) {
      var li = document.createElement('li');
      li.className = 'sheet-empty';
      li.innerHTML = '아직 본문이 입력된 말씀이 없습니다. <a href="library.html">말씀 라이브러리</a>에서 본문을 입력하면 여기에 나타납니다.';
      ul.appendChild(li);
      return;
    }
    if (!items.length) {
      var e = document.createElement('li');
      e.className = 'sheet-empty';
      e.textContent = '이 주제에 입력된 말씀이 없습니다.';
      ul.appendChild(e);
      return;
    }
    items.forEach(function (v) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-item';
      var r = document.createElement('div'); r.className = 'r'; r.textContent = v.ref;
      var t = document.createElement('div'); t.className = 't'; t.textContent = v.text;
      b.appendChild(r); b.appendChild(t);
      b.addEventListener('click', function () {
        $('verse').value = v.text;
        $('ref').value = v.ref;
        state.splitOn = false;
        state.page = 0;
        $('libDialog').close();
        render();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function buildLibThemes() {
    var box = $('libThemes');
    var mk = function (value, label) {
      var b = makeChip(value, label);
      b.setAttribute('aria-pressed', String(value === libTheme));
      return b;
    };
    box.replaceChildren(mk('', '전체'));
    VerseLibrary.THEMES.forEach(function (t) { box.appendChild(mk(t, t)); });
  }

  function openLibrary() {
    var dlg = $('libDialog');
    if (typeof dlg.showModal !== 'function') { location.href = 'library.html'; return; }
    if (!libReady) libReady = VerseLibrary.load();
    libReady.then(function () {
      buildLibThemes();
      renderLibList();
      dlg.showModal();
    }).catch(function () { toast('말씀 목록을 불러오지 못했습니다.'); });
  }

  var renderQueued = false;
  function renderSoon() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () { renderQueued = false; render(); });
  }

  // ── 호칭 / 상황 / 절기 ──
  function fillHonorifics(select, defaultValue) {
    HONORIFICS.forEach(function (h) {
      var o = document.createElement('option');
      o.value = h; o.textContent = h;
      select.appendChild(o);
    });
    var c = document.createElement('option');
    c.value = CUSTOM; c.textContent = '직접 입력';
    select.appendChild(c);
    select.value = defaultValue;
  }

  function bindCustomHonorific(selectId, customId) {
    var sel = $(selectId), custom = $(customId);
    function sync() {
      var on = sel.value === CUSTOM;
      custom.hidden = !on;
      if (on) custom.focus();
    }
    sel.addEventListener('change', sync);
  }

  function fillSelect(select, items) {
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it.id; o.textContent = it.name;
      select.appendChild(o);
    });
  }

  // 인사말 예시: 눌러서 인사말 칸에 넣는다(이후 자유롭게 수정).
  function showSuggestions(list) {
    var box = $('greetingSuggest'), wrap = $('greetingSuggestList');
    wrap.replaceChildren();
    if (!list || !list.length) { box.hidden = true; return; }
    list.forEach(function (text) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggest-item';
      b.textContent = text;
      b.addEventListener('click', function () {
        $('greeting').value = text;
        render();
      });
      wrap.appendChild(b);
    });
    box.hidden = false;
  }

  function refreshSuggestions() {
    if (state.type === 'visit') {
      var s = byId(greetings.situations, $('situation').value);
      showSuggestions(s ? s.items : null);
    } else {
      showSuggestions(design.season ? greetings.seasons[design.season] : null);
    }
  }

  function applySeason(id) {
    var season = byId(config.seasons, id);
    design.season = season ? season.id : null;
    if (season) {
      design.template = 'season';   // 절기 템플릿 자동 적용
      design.palette = null;        // 절기 고유 색을 쓰도록 배경색 선택 해제
      $('seasonTitle').value = season.title;
    } else if (design.template === 'season') {
      design.template = 'cream';
    }
    $('season').value = design.season || '';
    syncControls(); saveDesign(); refreshSuggestions(); render();
  }

  function setType(type) {
    state.type = type;
    VerseStore.set('type', type);
    document.querySelectorAll('.seg [data-type]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.type === type));
    });
    document.querySelectorAll('[data-only]').forEach(function (n) {
      n.hidden = n.dataset.only !== type;
    });
    // 절기 카드는 수신자 이름이 선택 항목
    $('recipientLabel').textContent = type === 'visit' ? '받는 분 이름' : '받는 분 이름 (선택)';
    // 절기 맞춤 템플릿은 절기 카드에서만 쓴다.
    if (type === 'visit' && design.template === 'season') design.template = 'cream';
    if (type === 'season' && design.season && design.template !== 'season' && !design.userPickedTemplate) {
      design.template = 'season';
    }
    syncControls(); saveDesign(); refreshSuggestions(); render();
  }

  // ── 디자인 컨트롤 ──
  function setPressed(container, value) {
    container.querySelectorAll('[data-value]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === value));
    });
  }

  function makeChip(value, label, extra) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.value = value;
    b.setAttribute('aria-pressed', 'false');
    if (extra) b.appendChild(extra);
    b.appendChild(document.createTextNode(label));
    return b;
  }

  function dot(color) {
    var s = document.createElement('span');
    s.className = 'dot';
    s.style.background = color;
    return s;
  }

  function buildControls() {
    var tplBox = $('tplChips');
    config.templates.forEach(function (t) {
      var chip = makeChip(t.id, t.name, dot(t.colors.bg));
      if (t.seasonOnly) chip.dataset.only = 'season';
      tplBox.appendChild(chip);
    });
    tplBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      design.template = b.dataset.value;
      design.userPickedTemplate = true;
      syncControls(); saveDesign(); render();
    });

    var sizeBox = $('sizeChips');
    config.sizes.forEach(function (s) {
      var b = makeChip(s.id, s.name);
      var small = document.createElement('small');
      small.textContent = s.note;
      b.appendChild(small);
      sizeBox.appendChild(b);
    });
    sizeBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      design.size = b.dataset.value;
      syncControls(); saveDesign(); render();
    });

    var palBox = $('paletteSwatches');
    var def = document.createElement('button');
    def.type = 'button';
    def.className = 'swatch default';
    def.dataset.value = '';
    def.textContent = '기본';
    def.setAttribute('aria-label', '템플릿 기본색');
    def.setAttribute('aria-pressed', 'true');
    palBox.appendChild(def);
    config.palettes.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.value = p.id;
      b.style.background = p.bg;
      b.setAttribute('aria-label', p.name);
      b.setAttribute('aria-pressed', 'false');
      palBox.appendChild(b);
    });
    palBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      design.palette = b.dataset.value || null;
      syncControls(); saveDesign(); render();
    });

    var fontBox = $('fontChips');
    fontBox.appendChild(makeChip('', '템플릿 기본'));
    config.fonts.forEach(function (f) {
      var b = makeChip(f.id, f.name);
      b.style.fontFamily = f.family;
      fontBox.appendChild(b);
    });
    fontBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      design.font = b.dataset.value || null;
      syncControls(); saveDesign(); render();
    });

    $('stepDown').addEventListener('click', function () { design.step = Math.max(STEP_MIN, design.step - 1); saveDesign(); render(); });
    $('stepUp').addEventListener('click', function () { design.step = Math.min(STEP_MAX, design.step + 1); saveDesign(); render(); });

    $('decoToggle').addEventListener('change', function () { design.deco = this.checked; saveDesign(); render(); });
    $('logoToggle').addEventListener('change', function () { design.logoOn = this.checked; saveDesign(); render(); });
    $('logoFile').addEventListener('change', onLogoPicked);
    // 올린 로고를 지우면 기본 로고(나뭇잎)로 되돌아간다.
    $('logoClear').addEventListener('click', function () {
      VerseStore.remove('logo');
      VerseStore.remove('logoMono');
      VerseStore.set('logoAt', Date.now());
      prepareLogo().then(function () { syncControls(); saveDesign(); render(); });
    });

    var colorBox = $('logoColorChips');
    LOGO_COLORS.forEach(function (c) { colorBox.appendChild(makeChip(c[0], c[1])); });
    colorBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      design.logoColor = b.dataset.value;
      syncControls(); saveDesign(); render();
    });
    var sizeBox2 = $('logoSizeChips');
    LOGO_SIZES.forEach(function (s) { sizeBox2.appendChild(makeChip(s[0], s[1])); });
    sizeBox2.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      design.logoSize = b.dataset.value;
      syncControls(); saveDesign(); render();
    });
  }

  function updateStepLabel() {
    var s = design.step;
    $('stepLabel').textContent = s === 0 ? '자동 맞춤' : (s > 0 ? '+' + s : String(s));
    $('stepDown').disabled = design.step <= STEP_MIN;
    $('stepUp').disabled = design.step >= STEP_MAX;
  }

  function syncControls() {
    setPressed($('tplChips'), design.template);
    setPressed($('sizeChips'), design.size);
    setPressed($('paletteSwatches'), design.palette || '');
    setPressed($('fontChips'), design.font || '');
    $('tplChips').querySelectorAll('[data-only]').forEach(function (c) { c.hidden = c.dataset.only !== state.type; });
    $('decoToggle').checked = design.deco;
    var hasLogo = !!currentLogo();
    $('logoToggle').disabled = !hasLogo;
    $('logoToggle').checked = hasLogo && design.logoOn;
    $('logoClear').hidden = !hasLogo || logoData.builtin;
    $('logoOptions').hidden = !hasLogo;
    $('logoName').textContent = logoData.builtin ? '기본 로고(높은뜻푸른교회 나뭇잎)' : '내가 올린 로고';
    setPressed($('logoColorChips'), design.logoColor || 'auto');
    setPressed($('logoSizeChips'), design.logoSize || 'm');
    updateStepLabel();
  }

  // 로고: 바깥 여백을 자르고 크기를 줄여, 원본 색과 모양 마스크 두 가지로 이 기기에만 저장한다.
  function onLogoPicked() {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    VerseLogo.fromFile(file).then(function (res) {
      var ok = VerseStore.set('logo', res.orig) && VerseStore.set('logoMono', res.mono);
      if (!ok) {
        VerseStore.remove('logo'); VerseStore.remove('logoMono');
        toast('로고를 저장하지 못했습니다. 더 작은 이미지를 사용해 주세요.');
        return null;
      }
      VerseStore.set('logoAt', Date.now());
      return VerseLogo.loadImage(res.mono).then(function (img) {
        logoMonoImg = img;
        logoData = { orig: res.orig, mono: res.mono, builtin: false };
        design.logoOn = true;
        design.logoColor = 'auto';
        syncControls(); saveDesign(); render();
      });
    }).catch(function () { toast('이미지를 열 수 없습니다.'); });
  }

  // ── 내보내기 ──
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // 입력이 멈추면 이미지를 미리 만들어 둔다. (공유 시트가 터치 직후 바로 열리도록)
  var prewarmTimer = null;
  function prewarm() {
    clearTimeout(prewarmTimer);
    prewarmTimer = setTimeout(function () {
      var data = readData();
      if (!data.verse.trim()) return;
      VerseExport.getBlobs(buildPages(), buildDesign()).catch(function () {});
    }, 700);
  }

  async function runExport(kind) {
    var data = readData();
    if (!data.verse.trim()) { toast('말씀 본문을 먼저 입력해 주세요.'); return; }
    var buttons = [$('btnSave'), $('btnShare'), $('btnPrint')];
    buttons.forEach(function (b) { b.disabled = true; });
    try {
      var pages = buildPages();
      if (kind === 'save') {
        await VerseExport.save(pages, buildDesign(), data);
        rememberRecipients(data);
        recordHistory(data, pages, 'save');
        toast(pages.length > 1 ? pages.length + '장을 저장했습니다.' : '이미지를 저장했습니다.');
      } else {
        var result = await VerseExport.share(pages, buildDesign(), data);
        if (result === 'unsupported') {
          toast('이 브라우저는 공유를 지원하지 않습니다. "이미지 저장"을 이용해 주세요.');
        } else if (result === 'shared') {
          rememberRecipients(data);
          recordHistory(data, pages, 'share');
          toast('공유했습니다.');
        }
      }
    } catch (err) {
      console.error(err);
      toast('이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      buttons.forEach(function (b) { b.disabled = false; });
    }
  }

  // ── 인쇄 (엽서 100×148mm) ──
  function openPrint() {
    if (!readData().verse.trim()) { toast('말씀 본문을 먼저 입력해 주세요.'); return; }
    var dlg = $('printDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  async function runPrint() {
    var data = readData();
    var layout = document.querySelector('input[name="printLayout"]:checked').value;
    $('printDialog').close();
    // 인쇄는 선택한 크기와 관계없이 항상 엽서 크기로 다시 만든다(긴 말씀 분할도 엽서 기준으로 다시 계산).
    var post = Object.assign(buildDesign(), { size: 'postcard' });
    toast('인쇄용 이미지를 만드는 중입니다…');
    try {
      var postPages = buildPages(post);
      var blobs = await VerseExport.getBlobs(postPages, post);
      rememberRecipients(data);
      recordHistory(data, postPages, 'print');
      $('toast').hidden = true;
      await VersePrint.run(blobs, layout);
    } catch (err) {
      console.error(err);
      toast('인쇄 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  function bindEvents() {
    document.querySelectorAll('.seg [data-type]').forEach(function (b) {
      b.addEventListener('click', function () { setType(b.dataset.type); });
    });

    // 홈: 카드 유형 / 절기 바로가기 / 최근 받는 분
    document.querySelectorAll('[data-start]').forEach(function (b) {
      b.addEventListener('click', function () { startCard(b.dataset.start); });
    });
    $('homeFav').addEventListener('click', function (e) {
      var del = e.target.closest('[data-fav-del]');
      if (del) {
        var f = loadFavorites().filter(function (x) { return x.id === del.dataset.favDel; })[0];
        if (f && window.confirm('즐겨찾기 "' + f.name + '"을(를) 지울까요?')) {
          storeFavorites(loadFavorites().filter(function (x) { return x.id !== f.id; }));
        }
        return;
      }
      var go = e.target.closest('[data-fav]');
      if (!go) return;
      var fav = loadFavorites().filter(function (x) { return x.id === go.dataset.fav; })[0];
      if (fav) applyFavorite(fav);
    });
    document.querySelectorAll('.fav-save').forEach(function (b) { b.addEventListener('click', saveFavorite); });
    $('homeHistory').addEventListener('click', function (e) {
      var b = e.target.closest('[data-hid]');
      if (!b) return;
      var entry = VerseHistory.list().filter(function (x) { return x.id === b.dataset.hid; })[0];
      if (entry) startFromHistory(entry);
    });
    $('brandHome').addEventListener('click', function () { setView('home'); });

    // 단계 이동
    document.querySelectorAll('[data-step-go]').forEach(function (b) {
      b.addEventListener('click', function () { setStep(Number(b.dataset.stepGo)); });
    });
    $('stepPrev').addEventListener('click', function () {
      if (ui.step === 1) setView('home'); else setStep(ui.step - 1);
    });
    $('stepNext').addEventListener('click', function () { setStep(ui.step + 1); });
    // 창 크기를 바꿔 휴대폰/컴퓨터 배치가 바뀌면 단계 표시를 다시 맞춘다.
    wideMQ.addEventListener('change', function () {
      if (ui.view === 'create') setStep(ui.step);
    });
    window.addEventListener('popstate', function () {
      if (ui.view === 'create') setView('home', { fromPop: true });
    });

    // 구글 드라이브 동기화로 다른 기기의 변경을 받았을 때: 목록은 바로 갱신하고, 설정·로고는 새로고침으로 적용한다.
    document.addEventListener('verse-sync-applied', function (ev) {
      var c = (ev.detail && ev.detail.changed) || {};
      renderRecent(); renderHomeHistory(); renderFavorites(); updateSentHint();
      if (c.settings || c.logo) $('syncBanner').hidden = false;
    });
    $('syncReload').addEventListener('click', function () { location.reload(); });

    // 화면 밝기
    $('themeToggle').addEventListener('click', function () { VerseTheme.toggle(); syncThemeSeg(); });
    document.querySelectorAll('#themeSeg [data-theme-mode]').forEach(function (b) {
      b.addEventListener('click', function () { VerseTheme.set(b.dataset.themeMode); syncThemeSeg(); });
    });
    document.addEventListener('themechange', syncThemeSeg);

    $('btnPrint').addEventListener('click', openPrint);
    $('printClose').addEventListener('click', function () { $('printDialog').close(); });
    $('printGo').addEventListener('click', runPrint);

    // 저장된 정보 지우기
    $('clearRecent').addEventListener('click', function () {
      if (!confirm('최근 받는 분 기록을 모두 지울까요?')) return;
      VerseStore.set('recentClearedAt', Date.now());
      VerseStore.remove('recent');
      renderRecent();
      toast('기록을 지웠습니다.');
    });
    $('clearAll').addEventListener('click', function () {
      if (!confirm('저장된 설정, 로고, 보낸 이 기본값, 최근 받는 분 기록과 말씀 라이브러리(입력한 본문)를 모두 지웁니다.\n라이브러리는 먼저 "파일로 내보내기"로 백업해 두는 것이 좋습니다.\n\n계속할까요?')) return;
      VerseStore.clearAll();
      location.reload();
    });

    // 이름 자동완성(최근 받는 분) → 호칭도 함께 채움
    ['recipient:honorific:honorificCustom', 'recipient2:honorific2:honorific2Custom'].forEach(function (spec) {
      var ids = spec.split(':');
      $(ids[0]).addEventListener('input', function (e) {
        if (!e.inputType || e.inputType === 'insertReplacementText') applyRecentHonorific(ids[0], ids[1], ids[2]);
      });
      $(ids[0]).addEventListener('change', function () { applyRecentHonorific(ids[0], ids[1], ids[2]); });
    });

    // 긴 말씀 나누기 / 장 이동 / 라이브러리
    $('splitOn').addEventListener('click', function () { state.splitOn = true; state.page = 0; render(); });
    $('splitOff').addEventListener('click', function () { state.splitOn = false; state.page = 0; render(); });
    $('pageNoToggle').addEventListener('change', function () { state.showNo = this.checked; render(); });
    $('pagePrev').addEventListener('click', function () { state.page -= 1; render(); });
    $('pageNext').addEventListener('click', function () { state.page += 1; render(); });
    $('openLibrary').addEventListener('click', openLibrary);
    $('libClose').addEventListener('click', function () { $('libDialog').close(); });
    $('libThemes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      libTheme = b.dataset.value;
      buildLibThemes();
      renderLibList();
    });

    $('situation').addEventListener('change', refreshSuggestions);
    $('season').addEventListener('change', function () { applySeason(this.value); });

    bindCustomHonorific('honorific', 'honorificCustom');
    bindCustomHonorific('honorific2', 'honorific2Custom');

    // 함께 받는 분(배우자 등) 추가/제거
    $('toggleRecipient2').addEventListener('click', function () {
      var field = $('recipient2Field');
      var open = field.hidden;
      field.hidden = !open;
      this.textContent = open ? '− 함께 받는 분 빼기' : '+ 함께 받는 분 추가';
      this.setAttribute('aria-expanded', String(open));
      if (open) { $('recipient2').focus(); } else { $('recipient2').value = ''; }
      render();
    });

    inputIds.forEach(function (id) {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });
    // 보낸 이는 기본값으로 기억한다.
    $('sender').addEventListener('input', function () { VerseStore.set('sender', this.value); touchSettings(); });
    // 맺음말(드림/올림 등)도 기억하고, "직접 입력"이면 입력칸을 보여 준다.
    bindCustomHonorific('closing', 'closingCustom');
    ['closing', 'closingCustom'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        VerseStore.set('closing', { v: $('closing').value, c: $('closingCustom').value });
        touchSettings();
      });
    });

    $('btnSave').addEventListener('click', function () { runExport('save'); });
    $('btnShare').addEventListener('click', function () { runExport('share'); });

    window.addEventListener('resize', fitScale);

    // 글꼴이 늦게 로드되면 줄바꿈이 달라지므로 다시 그린다.
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', renderSoon);
      if (document.fonts.ready) document.fonts.ready.then(renderSoon);
    }
  }

  function restore() {
    var saved = VerseStore.get('design', null);
    if (saved) {
      if (config.templates.some(function (t) { return t.id === saved.template; })) design.template = saved.template;
      if (config.sizes.some(function (s) { return s.id === saved.size; })) design.size = saved.size;
      if (saved.season && config.seasons.some(function (s) { return s.id === saved.season; })) design.season = saved.season;
      if (saved.palette && config.palettes.some(function (p) { return p.id === saved.palette; })) design.palette = saved.palette;
      if (saved.font && config.fonts.some(function (f) { return f.id === saved.font; })) design.font = saved.font;
      design.deco = saved.deco !== false;
      design.step = Math.max(STEP_MIN, Math.min(STEP_MAX, parseInt(saved.step, 10) || 0));
      // 기본 로고가 생기기 전에 저장된 설정은 "로고 안 씀"으로 되어 있으므로, 한 번만 켜 둔 상태로 바꾼다.
      design.logoOn = saved.logoPref === 1 ? !!saved.logoOn : true;
      if (LOGO_COLORS.some(function (c) { return c[0] === saved.logoColor; })) design.logoColor = saved.logoColor;
      if (LOGO_SCALE[saved.logoSize]) design.logoSize = saved.logoSize;
    }
    var sender = VerseStore.get('sender', '');
    if (sender) $('sender').value = sender;
    var closing = VerseStore.get('closing', null);
    if (closing && typeof closing === 'object') {
      var okClosing = ['드림', '올림', '', CUSTOM].indexOf(closing.v) >= 0;
      if (okClosing) $('closing').value = closing.v;
      if (typeof closing.c === 'string') $('closingCustom').value = closing.c;
      $('closingCustom').hidden = $('closing').value !== CUSTOM;
    }
    var type = VerseStore.get('type', 'visit');
    state.type = type === 'season' ? 'season' : 'visit';
  }

  function init(cfgs) {
    config = cfgs[0];
    greetings = cfgs[1];
    VerseCard.setConfig(config);

    fillHonorifics($('honorific'), '집사님');
    fillHonorifics($('honorific2'), '권사님');
    fillSelect($('situation'), greetings.situations);
    fillSelect($('season'), config.seasons);

    restore();
    lastDesignJson = JSON.stringify(design); // 앱을 여는 것만으로는 "설정을 고친 시각"을 바꾸지 않는다
    buildControls();
    bindEvents();
    renderRecent();
    renderHomeHistory();

    $('season').value = design.season || '';
    if (state.type === 'season' && design.season) $('seasonTitle').value = byId(config.seasons, design.season).title;
    setType(state.type);
    lastDesignJson = JSON.stringify(design); // 시작할 때의 자동 보정은 저장하지 않는다
    renderFavorites();
    syncThemeSeg();
    setView('home');
    if (window.VerseSync) VerseSync.mountPanel($('syncPanel'));
    // 로고 모양 마스크가 준비되면 테마 색으로 다시 그린다.
    prepareLogo().then(function () { syncControls(); render(); });
  }

  function loadJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }

  Promise.all([loadJson('data/templates.json'), loadJson('data/greetings.json')])
    .then(init)
    .catch(function (err) {
      console.error(err);
      toast('설정 파일을 불러오지 못했습니다. 로컬 서버로 열어 주세요.');
    });
})();
