/*
 * 내 글꼴: 구글 폰트 이름으로 추가하거나, 내 글꼴 파일(.ttf .otf .woff .woff2)을 올려 쓴다.
 * 목록(이름·종류)은 localStorage의 customFonts에, 올린 파일은 IndexedDB에 이 기기에만 저장한다.
 */
(function (global) {
  'use strict';

  var KEY = 'customFonts';
  var DB_NAME = 'verse-card-fonts', STORE = 'files';
  var MAX_FILE = 12 * 1024 * 1024;
  var fonts = [];
  var fileFaces = {}; // id → FontFace (등록된 것)

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('indexedDB')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idb(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode), result;
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
        var req = fn(tx.objectStore(STORE));
        if (req) req.onsuccess = function () { result = req.result; };
      });
    });
  }

  function load() {
    var raw = global.VerseStore.get(KEY, []);
    fonts = (Array.isArray(raw) ? raw : []).filter(function (f) {
      return f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.family === 'string' && (f.kind === 'google' || f.kind === 'file');
    });
    return fonts.slice();
  }
  function save() { global.VerseStore.set(KEY, fonts); }
  function list() { return fonts.slice(); }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function googleUrl(family) {
    return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + '&display=swap';
  }

  // 글꼴을 문서에 등록한다(구글: 스타일시트 링크, 파일: FontFace).
  function register(f) {
    if (f.kind === 'google') {
      if (!document.getElementById('gf-' + f.id)) {
        var link = document.createElement('link');
        link.id = 'gf-' + f.id;
        link.rel = 'stylesheet';
        link.href = googleUrl(f.family);
        document.head.appendChild(link);
      }
      return Promise.resolve();
    }
    return idb('readonly', function (s) { return s.get(f.id); }).then(function (blob) {
      if (!blob) throw new Error('missing');
      return blob.arrayBuffer();
    }).then(function (buf) {
      var face = new FontFace(f.family, buf);
      return face.load().then(function () { document.fonts.add(face); fileFaces[f.id] = face; });
    });
  }

  function registerAll() {
    return Promise.all(fonts.map(function (f) { return register(f).catch(function () {}); }));
  }

  function addGoogle(name) {
    name = (name || '').trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-z0-9][A-Za-z0-9 ]{1,58}$/.test(name)) return Promise.reject(new Error('글꼴 이름은 영문(예: Jua, Do Hyeon)으로 입력해 주세요.'));
    if (fonts.some(function (f) { return f.kind === 'google' && f.family.toLowerCase() === name.toLowerCase(); })) return Promise.reject(new Error('이미 추가한 글꼴이에요.'));
    return fetch(googleUrl(name)).then(function (r) {
      if (!r.ok) throw new Error('구글 폰트에서 "' + name + '"을(를) 찾지 못했어요. 이름의 철자와 띄어쓰기를 확인해 주세요.');
      return r.text();
    }).then(function (css) {
      if (css.indexOf('@font-face') < 0) throw new Error('이 글꼴은 쓸 수 없어요.');
      var f = { id: newId(), name: name, kind: 'google', family: name };
      fonts.push(f); save();
      return register(f).then(function () { return f; });
    }, function (e) {
      if (e && e.message && e.message.indexOf('구글 폰트에서') === 0) throw e;
      // 없는 이름이면 구글이 오류로 답해 브라우저에서는 연결 실패처럼 보이므로, 인터넷이 켜져 있으면 이름 문제로 안내한다.
      throw new Error(navigator.onLine === false
        ? '인터넷에 연결되어 있어야 구글 폰트를 추가할 수 있어요.'
        : '구글 폰트에서 "' + name + '"을(를) 찾지 못했어요. 이름의 철자와 띄어쓰기를 확인해 주세요.');
    });
  }

  function addFile(file, name) {
    if (!file) return Promise.reject(new Error('글꼴 파일을 골라 주세요.'));
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) return Promise.reject(new Error('.ttf .otf .woff .woff2 파일만 올릴 수 있어요.'));
    if (file.size > MAX_FILE) return Promise.reject(new Error('파일이 너무 커요(12MB 이하).'));
    var id = newId();
    var f = { id: id, name: (name || '').trim() || file.name.replace(/\.[^.]+$/, ''), kind: 'file', family: 'vc-custom-' + id };
    return idb('readwrite', function (s) { return s.put(file, id); }).then(function () {
      fonts.push(f); save();
      return register(f);
    }).then(function () { return f; }, function (e) {
      idb('readwrite', function (s) { return s.delete(id); }).catch(function () {});
      fonts = fonts.filter(function (x) { return x.id !== id; }); save();
      throw new Error('이 글꼴 파일을 열 수 없어요.');
    });
  }

  function remove(id) {
    var f = fonts.filter(function (x) { return x.id === id; })[0];
    if (!f) return Promise.resolve();
    fonts = fonts.filter(function (x) { return x.id !== id; });
    save();
    var link = document.getElementById('gf-' + id);
    if (link) link.remove();
    if (fileFaces[id]) { try { document.fonts.delete(fileFaces[id]); } catch (e) { /* 무시 */ } delete fileFaces[id]; }
    return f.kind === 'file' ? idb('readwrite', function (s) { return s.delete(id); }).catch(function () {}) : Promise.resolve();
  }

  // 이미지로 저장할 때 글꼴을 파일 안에 넣기 위한 CSS.
  // 파일 글꼴: @font-face(data 주소). 구글 글꼴: 그 글꼴의 스타일시트 링크 주소 목록.
  function fileCss(families) {
    var targets = fonts.filter(function (f) { return f.kind === 'file' && families[f.family]; });
    return Promise.all(targets.map(function (f) {
      return idb('readonly', function (s) { return s.get(f.id); }).then(function (blob) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () { resolve("@font-face{font-family:'" + f.family + "';src:url(" + fr.result + ");}"); };
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
      }).catch(function () { return ''; });
    })).then(function (parts) { return parts.filter(Boolean).join('\n'); });
  }

  global.VerseFonts = { load: load, list: list, registerAll: registerAll, addGoogle: addGoogle, addFile: addFile, remove: remove, fileCss: fileCss };
})(window);
