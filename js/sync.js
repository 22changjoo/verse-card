/*
 * 구글 드라이브 동기화 — 로그인, 합치기, 올리기, 자동 예약, 상태 표시 패널.
 *
 * 흐름: (구글 로그인으로 임시 토큰 받기) → 드라이브 파일 읽기 → 이 기기 내용과 합치기(sync-core) → 이 기기에 반영 → 바뀌었으면 드라이브에 쓰기
 * 동기화는 사용자가 "연결"을 눌러 켰을 때만 동작하고, 켜지 않으면 네트워크 요청이 전혀 없다. (구글 로그인 스크립트도 그때만 불러온다)
 * 토큰은 메모리에만 두고 저장하지 않는다. 그래서 앱을 새로 열면 한 번 눌러서 다시 로그인해야 할 수 있다(특히 Safari).
 */
(function (global) {
  'use strict';

  var core = global.VerseSyncCore;
  var Store = global.VerseStore;
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var DEBOUNCE_MS = 4000;
  var MIN_AUTO_GAP_MS = 60000;

  var state = {
    enabled: !!Store.get('syncEnabled', false),
    token: null, tokenExp: 0,
    status: !!Store.get('syncEnabled', false) ? 'login' : 'idle', // idle | syncing | ok | login | error | offline
    error: '',
    busy: false, pending: false,
    lastSync: Store.get('syncLast', 0),
    fileId: null
  };
  var drive = null;            // 시험에서 바꿔 끼울 수 있다(useAdapter)
  var timer = null;
  var listeners = [];

  function cfg() { return global.VERSE_SYNC_CONFIG || {}; }
  function clientId() { return String(Store.get('syncClientId', '') || cfg().clientId || '').trim(); }
  function codeErr(code, msg) { var e = new Error(msg); e.code = code; return e; }

  // ── 상태 ──
  function view() {
    var status = state.status;
    if (!clientId() && !drive) status = 'unconfigured';
    else if (!state.enabled) status = 'off';
    return { status: status, error: state.error, lastSync: state.lastSync, enabled: state.enabled, clientId: !!clientId() };
  }
  function emit() { var v = view(); listeners.forEach(function (fn) { try { fn(v); } catch (e) { /* 무시 */ } }); }
  function setStatus(s, err) { state.status = s; state.error = err || ''; emit(); }
  function onChange(fn) { listeners.push(fn); fn(view()); }

  // ── 구글 로그인 ──
  var gisPromise = null;
  function loadGis() {
    if (global.google && global.google.accounts && global.google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { gisPromise = null; reject(codeErr('network', '구글 로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  function acquireToken(interactive) {
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var id = clientId();
        if (!id) { reject(codeErr('config', '동기화 설정(클라이언트 ID)이 없어요.')); return; }
        var done = false;
        var finish = function (fn, v) { if (done) return; done = true; clearTimeout(t); fn(v); };
        var t = setTimeout(function () { finish(reject, codeErr('auth', '로그인 응답이 없어요.')); }, interactive ? 120000 : 8000);
        var client = global.google.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: SCOPE,
          callback: function (r) {
            if (r && r.access_token) {
              state.token = r.access_token;
              state.tokenExp = Date.now() + ((r.expires_in || 3600) - 120) * 1000;
              finish(resolve, state.token);
            } else {
              finish(reject, codeErr('auth', (r && (r.error_description || r.error)) || '로그인에 실패했어요.'));
            }
          },
          error_callback: function (e) {
            var type = e && e.type;
            var msg = type === 'popup_closed' ? '로그인 창이 닫혔어요.'
              : type === 'popup_failed_to_open' ? '로그인 창을 열 수 없어요. 팝업 차단을 확인해 주세요.'
              : '로그인에 실패했어요.';
            finish(reject, codeErr('auth', msg));
          }
        });
        client.requestAccessToken({ prompt: interactive ? '' : 'none' });
      });
    });
  }

  function ensureToken(interactive) {
    if (state.token && Date.now() < state.tokenExp) return Promise.resolve(state.token);
    return acquireToken(interactive);
  }

  function getDrive() {
    if (!drive) {
      drive = global.VerseDrive.DriveStore(function () { return ensureToken(false); }, cfg().apiBase);
    }
    return drive;
  }

  // ── 이 기기 저장값 ↔ 스냅샷 ──
  function readParts() {
    var lib = Store.get('library', {}) || {};
    var settingsAt = Store.get('settingsAt', 0);
    var logoAt = Store.get('logoAt', 0);
    var logoOrig = Store.get('logo', null);
    return {
      library: { texts: lib.texts || {}, custom: lib.custom || [], meta: lib.meta || {}, deleted: lib.deleted || {} },
      history: Store.get('history', { entries: [], deleted: {} }),
      recent: Store.get('recent', []),
      recentClearedAt: Store.get('recentClearedAt', 0),
      settings: settingsAt ? {
        at: settingsAt, sender: Store.get('sender', ''), closing: Store.get('closing', null), design: Store.get('design', null)
      } : null,
      logo: logoAt ? (logoOrig ? { at: logoAt, orig: logoOrig, mono: Store.get('logoMono', '') } : { at: logoAt, removed: true }) : null
    };
  }

  function applyParts(parts) {
    Store.setSilent('library', parts.library);
    Store.setSilent('history', parts.history);
    Store.setSilent('recent', parts.recent);
    Store.setSilent('recentClearedAt', parts.recentClearedAt);
    if (parts.settings) {
      Store.setSilent('sender', parts.settings.sender || '');
      if (parts.settings.closing) Store.setSilent('closing', parts.settings.closing);
      if (parts.settings.design) Store.setSilent('design', parts.settings.design);
      Store.setSilent('settingsAt', parts.settings.at);
    }
    if (parts.logo) {
      if (parts.logo.removed) { Store.removeSilent('logo'); Store.removeSilent('logoMono'); }
      else { Store.setSilent('logo', parts.logo.orig); Store.setSilent('logoMono', parts.logo.mono); }
      Store.setSilent('logoAt', parts.logo.at);
    }
    if (global.VerseLibrary && global.VerseLibrary.reload) global.VerseLibrary.reload();
  }

  function diffDomains(a, b) {
    var x = core.normalize(a), y = core.normalize(b);
    var same = function (k) { return core.stable(x[k]) === core.stable(y[k]); };
    var changed = { library: !same('library'), history: !same('history'), recent: !same('recent'), settings: !same('settings'), logo: !same('logo') };
    changed.any = changed.library || changed.history || changed.recent || changed.settings || changed.logo;
    return changed;
  }

  // 동기화를 처음 켤 때: 수정 시각이 없는 예전 값에 "지금"을 찍어, 이 기기의 내용이 사라지지 않게 한다.
  function stampLocal() {
    var t = Date.now();
    if (global.VerseLibrary && global.VerseLibrary.reload) { global.VerseLibrary.reload(); global.VerseLibrary.stampLegacy(); }
    var recent = Store.get('recent', []);
    if (Array.isArray(recent)) {
      var changed = false;
      recent.forEach(function (r, i) { if (r && !r.at) { r.at = t - i; changed = true; } });
      if (changed) Store.setSilent('recent', recent);
    }
    if (!Store.get('settingsAt', 0) && (Store.get('sender', '') || Store.get('design', null) || Store.get('closing', null))) Store.setSilent('settingsAt', t);
    if (!Store.get('logoAt', 0) && Store.get('logo', null)) Store.setSilent('logoAt', t);
  }

  // ── 동기화 한 번 ──
  async function runSync(opts) {
    opts = opts || {};
    if (!state.enabled) return;
    if (state.busy) { state.pending = true; return; }
    state.busy = true;
    setStatus('syncing');
    try {
      await ensureToken(!!opts.interactive);
      var d = getDrive();
      var applied = null;
      for (var attempt = 0; attempt < 3; attempt++) {
        var remote = await d.read();
        var remoteSnap = core.normalize(remote.snapshot);
        // 읽고 합치고 반영하는 사이(await 없이)에 이 기기에서 생긴 변경은 합친 결과에 함께 들어간다.
        var localParts = readParts();
        var finalSnap = core.merge(core.fromParts(localParts), remoteSnap);
        var finalParts = core.toParts(finalSnap);
        var changed = diffDomains(core.fromParts(localParts), finalSnap);
        if (changed.any) { applyParts(finalParts); applied = Object.assign(applied || {}, changed); }
        if (!core.equal(finalSnap, remoteSnap) || !remote.fileId) {
          if (remote.fileId) {
            var h = await d.head(remote.fileId);
            if (h.rev !== remote.rev) continue; // 읽은 뒤 다른 기기가 먼저 썼다 → 다시 읽어서 합친다
          }
          var w = await d.write(finalSnap, remote.fileId);
          state.fileId = w.fileId;
        }
        break;
      }
      state.lastSync = Date.now();
      Store.setSilent('syncLast', state.lastSync);
      setStatus('ok');
      if (applied) document.dispatchEvent(new CustomEvent('verse-sync-applied', { detail: { changed: applied } }));
    } catch (e) {
      // 자동(조용한) 시도가 실패한 것은 정상적인 일이라 사유를 보여 주지 않고, 눌러서 로그인하게만 안내한다.
      if (e && e.code === 'auth') { state.token = null; setStatus('login', opts.interactive ? e.message : ''); }
      else if (e && e.code === 'config') setStatus('error', e.message);
      else if (e && (e.code === 'network' || e instanceof TypeError)) setStatus('offline', '인터넷에 연결되어 있지 않아요. 연결되면 다시 시도할게요.');
      else if (e && e.code === 'forbidden') setStatus('error', '구글 드라이브 권한이 없어요. 연결을 끊고 다시 연결해 주세요. (' + e.message + ')');
      else setStatus('error', (e && e.message) || '동기화에 실패했어요.');
    } finally {
      state.busy = false;
      if (state.pending) { state.pending = false; schedule(); }
    }
  }

  function schedule() {
    if (!state.enabled) return;
    clearTimeout(timer);
    timer = setTimeout(function () { runSync({ interactive: false }); }, DEBOUNCE_MS);
  }

  // ── 사용자 조작 ──
  function connect() {
    if (!clientId()) { setStatus('error', '먼저 클라이언트 ID를 입력해 주세요.'); return Promise.resolve(); }
    stampLocal();
    state.enabled = true;
    Store.setSilent('syncEnabled', true);
    return runSync({ interactive: true });
  }

  function syncNow() { return runSync({ interactive: true }); }

  function disconnect() {
    state.enabled = false;
    Store.setSilent('syncEnabled', false);
    clearTimeout(timer);
    try { if (state.token && global.google && global.google.accounts) global.google.accounts.oauth2.revoke(state.token, function () {}); } catch (e) { /* 무시 */ }
    state.token = null; state.tokenExp = 0;
    setStatus('idle');
  }

  function setClientId(id) {
    Store.setSilent('syncClientId', String(id || '').trim());
    emit();
  }

  // ── 시험용 ──
  function useAdapter(adapter) { drive = adapter; }
  function setToken(t, ms) { state.token = t; state.tokenExp = Date.now() + (ms || 3600000); }

  // ── 상태 표시 패널 ──
  function ago(ts) {
    if (!ts) return '아직 없음';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return '방금';
    if (s < 3600) return Math.round(s / 60) + '분 전';
    if (s < 86400) return Math.round(s / 3600) + '시간 전';
    return new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  }

  function mountPanel(root) {
    if (!root) return;
    root.className = (root.className ? root.className + ' ' : '') + 'sync-card';
    root.innerHTML =
      '<div class="sync-head"><strong>구글 드라이브 동기화</strong><span class="sync-badge" data-badge></span></div>' +
      '<p class="sync-text" data-text></p>' +
      '<div class="sync-actions" data-actions></div>' +
      '<div class="sync-setup" data-setup hidden>' +
      '<label class="sub-label" for="syncClientInput">클라이언트 ID (구글 클라우드에서 만든 것)</label>' +
      '<input id="syncClientInput" type="text" autocomplete="off" placeholder="1234567890-abc….apps.googleusercontent.com">' +
      '<button type="button" class="chip" data-saveid>저장</button>' +
      '</div>' +
      '<p class="hint" data-hint>동기화는 직접 연결했을 때만 동작하고, 데이터는 목회자님 구글 드라이브의 이 앱 전용 숨김 폴더에만 저장돼요.</p>';

    var q = function (sel) { return root.querySelector(sel); };
    var btn = function (label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip ' + (cls || ''); b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };

    function render(v) {
      var badge = q('[data-badge]'), text = q('[data-text]'), actions = q('[data-actions]'), setup = q('[data-setup]');
      actions.replaceChildren();
      setup.hidden = v.clientId;
      badge.className = 'sync-badge';
      var s = v.status;
      if (s === 'unconfigured') {
        badge.textContent = '설정 필요';
        text.textContent = '처음 한 번, 구글 클라우드에서 이 앱을 등록하고 만든 "클라이언트 ID"를 아래에 붙여넣으면 켤 수 있어요. (README의 "구글 드라이브 동기화 설정" 참고)';
      } else if (s === 'off' || s === 'idle' && !v.enabled) {
        badge.textContent = '꺼짐';
        text.textContent = '켜면 말씀 라이브러리·보낸 내역·최근 받는 분·설정·로고가 구글 드라이브를 통해 이 기기와 다른 기기에 맞춰져요.';
        actions.appendChild(btn('구글 계정으로 연결', 'primary-chip', connect));
      } else if (s === 'syncing') {
        badge.textContent = '동기화 중'; badge.classList.add('busy');
        text.textContent = '동기화하는 중이에요…';
      } else if (s === 'login') {
        badge.textContent = '로그인 필요'; badge.classList.add('warn');
        text.textContent = '연결되어 있어요. 이 기기에서 한 번 눌러 로그인하면 바로 동기화해요. ' + (v.error ? '(' + v.error + ')' : '');
        actions.appendChild(btn('로그인하고 동기화', 'primary-chip', syncNow));
        actions.appendChild(btn('연결 끊기', 'danger', confirmDisconnect));
      } else if (s === 'error' || s === 'offline') {
        badge.textContent = s === 'offline' ? '오프라인' : '오류'; badge.classList.add('warn');
        text.textContent = v.error || '동기화하지 못했어요.';
        actions.appendChild(btn('다시 시도', 'primary-chip', syncNow));
        actions.appendChild(btn('연결 끊기', 'danger', confirmDisconnect));
      } else {
        badge.textContent = '동기화됨'; badge.classList.add('ok');
        text.textContent = '마지막 동기화: ' + ago(v.lastSync) + '. 한쪽에서 고치면 몇 초 안에 다른 기기에도 반영돼요.';
        actions.appendChild(btn('지금 동기화', '', syncNow));
        actions.appendChild(btn('연결 끊기', 'danger', confirmDisconnect));
      }
    }

    function confirmDisconnect() {
      if (!confirm('이 기기의 동기화 연결을 끊을까요?\n이 기기에 있는 내용과 구글 드라이브에 저장된 내용은 지워지지 않아요.')) return;
      disconnect();
    }

    q('[data-saveid]').addEventListener('click', function () {
      setClientId(q('#syncClientInput').value);
    });

    onChange(render);
    // 로그인 창이 사용자 조작 직후에 열릴 수 있도록, 구글 로그인 스크립트는 연결을 켠 상태에서만 미리 불러 둔다.
    if (state.enabled) loadGis().catch(function () {});
  }

  // ── 자동 동기화 ──
  document.addEventListener('verse-store-changed', schedule);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.enabled && Date.now() - state.lastSync > MIN_AUTO_GAP_MS) runSync({ interactive: false });
  });
  global.addEventListener('online', function () { if (state.enabled) runSync({ interactive: false }); });
  global.addEventListener('load', function () {
    if (state.enabled) setTimeout(function () { runSync({ interactive: false }); }, 1500);
  });

  global.VerseSync = {
    onChange: onChange, mountPanel: mountPanel, connect: connect, syncNow: syncNow, disconnect: disconnect,
    setClientId: setClientId, getState: view, runSync: runSync,
    _useAdapter: useAdapter, _setToken: setToken, _readParts: readParts, _applyParts: applyParts
  };
})(window);
