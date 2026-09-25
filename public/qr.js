/* ==========================================================================
   登校・下校QRの教室表示ページ
   --------------------------------------------------------------------------
   ★このページは、QRの窓口の「呼び出しの約束ごと」に強く依存しています。
     窓口の側（URL・引数・返す中身・呼び出しの通し方）を変えると、
     このページは黙って動かなくなります。
     窓口を変える人は、必ずこのページも合わせて直してください。

   ★このファイルは public/ にあります。ここに書いた注記は【そのまま配信されます】
     （src/ と違い、ビルドで落ちません）。校内の呼び名や管理番号を書かないこと。
   ========================================================================== */
(function (root) {
  'use strict';

  /* ── 決まった数（★ここだけ見れば間隔が分かる）───────────────────── */
  /** うまく取れているときに取り直す間隔 */
  var RELOAD_MS = 10 * 60 * 1000;
  /** 取れなかったときに取り直す間隔 */
  var RETRY_MS = 60 * 1000;
  /** 時計と日付の変わり目を見張る間隔 */
  var TICK_MS = 15 * 1000;
  /** 窓口の名前 */
  var ACTION = 'api';

  /**
   * QRがつくられる時刻（毎朝）。★判定も文言も、ここから作ります。
   *   この時刻より前なら、前の日のQRが出ているのは【正常】です。
   *   過ぎてもまだ前の日のままなら、そのときは本当におかしい。
   *
   * ★★この時刻は、QRを用意している側が動く時刻に合わせてあります。
   *   向こうの時刻が変わると、ここの判定も下の文言も一緒にずれます。
   *   向こうを変える人は、必ずここも合わせてください。
   */
  var MADE_AT_HOUR = 8;
  var MADE_AT_MINUTE = 30;
  var MADE_AT_MIN = MADE_AT_HOUR * 60 + MADE_AT_MINUTE;
  var MADE_AT_LABEL = MADE_AT_HOUR + ':' + (MADE_AT_MINUTE < 10 ? '0' : '') + MADE_AT_MINUTE;

  /** ★画面に出す文言はここだけ。差し替えるときはここを直します */
  var MESSAGES = {
    /** 今日のQRは出ているが、取り直しに失敗した */
    retryFailed: '新しく取り直せていません。上のQRはそのまま使えます。',
    /** 前の日のQRが出ている。まだつくられる時刻の前なので、これは正常 */
    staleEarly: '今日のQRはまだつくられていません（毎朝' + MADE_AT_LABEL + 'ごろ）。上は前の日のものです。',
    /** 前の日のQRが出ていて、もう使えない */
    staleBad: '上は前の日のQRです。いまは使えません。職員に知らせてください。',
    /** まだ一度も取れていない */
    noneYet: 'QRを取得できませんでした。時間をおいて自動でやり直します',
  };

  /** 画像として受け取ってよい形。★data: の PNG だけ。外のURLは通さない */
  var DATA_PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

  /* ── ここから：画面を触らない部分（試験が直接叩く）─────────────── */

  /** 窓口を叩くURLを作る */
  function requestUrl(base) {
    return base + '?action=' + encodeURIComponent(ACTION);
  }

  function isPng(value) {
    return typeof value === 'string' && DATA_PNG_RE.test(value);
  }

  /**
   * 受け取った中身から、画面に出すものだけを取り出す。
   * ★出席URL（tokou_url / gekou_url）は【取り出しません】。
   *   取り出さなければ、画面に出る道がそもそもできません。
   */
  function normalize(json) {
    if (!json || typeof json !== 'object') return { ok: false, reason: 'badShape' };
    if (!isPng(json.tokou_qr) || !isPng(json.gekou_qr)) return { ok: false, reason: 'badImage' };
    var date = String(json.date === null || json.date === undefined ? '' : json.date).trim();
    if (!date) return { ok: false, reason: 'noDate' };
    return {
      ok: true,
      campus: String(json.campus || ''),
      date: date,
      tokou: json.tokou_qr,
      gekou: json.gekou_qr,
      updatedAt: String(json.updated_at || ''),
    };
  }

  var WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

  /**
   * 'yyyy-mm-dd' を、その日の 0 時として読む。読めなければ null。
   * ★年月日を取り出してから組み立てます。文字列をそのまま Date に渡すと、
   *   時間帯の扱いで日が1日ずれることがあるためです。
   */
  function parseYmd(date) {
    var t = String(date === null || date === undefined ? '' : date).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var dt = new Date(y, mo - 1, d);
    // ★2月30日のような、暦に無い日をはじく
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  /** 「9月25日（金）」の形にする。読めない日付なら空 */
  function dateLabel(date) {
    var d = parseYmd(date);
    if (!d) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEKDAY_JA[d.getDay()] + '）';
  }

  /**
   * 見出しに出す文字列。
   * ★★曜日は【窓口が返した日付】から出します。端末の時計からは出しません。
   *   古いQRが出たままのとき、端末の時計から曜日を出すと、
   *   前の日のQRの横に今日の曜日が並び、見出しが嘘をつくためです。
   */
  function headingText(campus, date) {
    var name = String(campus === null || campus === undefined ? '' : campus);
    var label = dateLabel(date);
    if (name && label) return name + '　' + label;
    return name || label;
  }

  /** その日の日付を yyyy-mm-dd にする */
  function ymd(d) {
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  /** 受け取ったQRが、今日のものでないか */
  function isStale(date, now) {
    if (!date) return true;
    return String(date) !== ymd(now);
  }

  /**
   * 画面に出す文言を、状態の組から決める。空文字なら何も出さない。
   *
   * ★★「誰が最後に書いたか」で決めてはいけません。
   *   「前の日のQRだ」と「取り直しに失敗した」は【同時に真になりえます】。
   *   出す場所は1つしかないので、後から書いたほうが勝つ作りにすると、
   *   ★前の日のQRに「そのまま使えます」と書いてしまいます＝画面が嘘をつきます。
   *   この関数を通せば、その形の間違いが起きなくなります。
   *
   * ★★画面に出る文字は、すべてこの関数の戻り値です。
   *   1つでも外に分岐を足すと、この決まりが崩れて元の形に戻ります。
   *
   * @param {boolean} hasQr  いまQRが画面に出ているか
   * @param {boolean} stale  出ているQRが前の日のものか
   * @param {boolean} failed 取り直しに失敗しているか
   * @param {Date} now       いまの時刻
   */
  function statusMessage(hasQr, stale, failed, now) {
    // ★QRが1枚も出ていないなら、「前の日か」は意味を持たない。ここで返す
    if (!hasQr) return failed ? MESSAGES.noneYet : '';
    if (stale) {
      var minutes = now.getHours() * 60 + now.getMinutes();
      // ★つくられる時刻より前なら、前の日のQRが出ているのは正常。
      //   ここで「職員に知らせてください」と出すと、毎朝かならず鳴る警報になり、
      //   誰も読まなくなります。
      if (!failed && minutes < MADE_AT_MIN) return MESSAGES.staleEarly;
      return MESSAGES.staleBad;
    }
    return failed ? MESSAGES.retryFailed : '';
  }

  var api = {
    RELOAD_MS: RELOAD_MS,
    RETRY_MS: RETRY_MS,
    TICK_MS: TICK_MS,
    ACTION: ACTION,
    requestUrl: requestUrl,
    isPng: isPng,
    normalize: normalize,
    dateLabel: dateLabel,
    headingText: headingText,
    ymd: ymd,
    isStale: isStale,
    statusMessage: statusMessage,
    MESSAGES: MESSAGES,
    MADE_AT_MIN: MADE_AT_MIN,
    /** ★試験から1回だけ取り直させるための入口（ブラウザでは使わない） */
    _loadForTest: null,
    /** ★試験から時計の見張りを1回だけ回すための入口（ブラウザでは使わない） */
    _tickForTest: null,
    /** ★試験から時計を差し替えるための入口（ブラウザでは使わない） */
    _setNowForTest: null,
  };

  root.QrCore = api;

  /* ── ここから下：画面を触る部分（ブラウザでだけ動く）─────────────── */

  if (typeof document === 'undefined') return;

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbxVpj2Uyi_20_eO_JbTM0fVcGK0znTzk7Odbuf6xz0Gs_5V6DYS1nU30xooIVdiKsADpQ/exec';

  var elCampus, elClock, elTokou, elGekou, elAsof, elFail;
  /** いま画面に出ている中身。★取れなかったときに消さないため控える */
  var shown = null;
  var failedLast = false;
  var lastLoadAt = 0;
  /** 最後に取りにいった日。★日付が変わったことに気づくために控える */
  var lastLoadDate = '';

  /** いまの時刻。★試験から差し替えられるようにしてあります */
  var nowFn = function () { return new Date(); };

  function text(el, value) {
    if (el) el.textContent = String(value === null || value === undefined ? '' : value);
  }

  function hhmm(d) {
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  /**
   * ★★画面の下に出す文言を書くのは、ここ1か所だけ。
   *   2か所から書くと、あとから書いたほうが勝って嘘になります。
   */
  function applyStatus() {
    var now = nowFn();
    // ★分岐はこの中に作らない。文言はすべて statusMessage が決める
    var msg = statusMessage(!!shown, !!shown && isStale(shown.date, now), failedLast, now);
    text(elFail, msg);
    if (elFail) elFail.style.display = msg ? 'block' : 'none';
  }

  function render(view) {
    shown = view;
    // ★見出しの日付・曜日は、窓口が返した日付から出す（端末の時計からではない）
    text(elCampus, headingText(view.campus, view.date));
    // ★QR画像そのものは、前の日のものでも消さない（手がかりとして残す）
    if (elTokou) elTokou.src = view.tokou;
    if (elGekou) elGekou.src = view.gekou;
    text(elAsof, view.updatedAt ? (view.updatedAt + ' につくられたQRです') : '');
    applyStatus();
  }

  function load(opts) {
    var startedAt = nowFn();
    lastLoadAt = startedAt.getTime();
    lastLoadDate = ymd(startedAt);
    var forceFail = !!(opts && opts.fail);
    var p = forceFail
      ? Promise.reject(new Error('forced'))
      : fetch(requestUrl(GAS_URL), { method: 'GET', credentials: 'omit', redirect: 'follow' })
          .then(function (res) {
            if (!res.ok) throw new Error('http');
            return res.json();
          });
    return p
      .then(function (json) {
        var view = normalize(json);
        if (!view.ok) { failedLast = true; applyStatus(); return; }
        failedLast = false;
        render(view);
      })
      .catch(function () { failedLast = true; applyStatus(); });
  }

  api._loadForTest = load;
  api._setNowForTest = function (fn) { nowFn = fn; };

  function tick() {
    var now = nowFn();
    text(elClock, hhmm(now));

    // ★日付が変わったら取り直す（QRは毎朝つくり直されるため）。
    //   ★1日に1回だけ。前の日のQRが出ている間ずっと叩き続けると、
    //     朝までの間に窓口を何百回も叩くことになります。
    if (ymd(now) !== lastLoadDate) { load(); return; }

    var due = failedLast ? RETRY_MS : RELOAD_MS;
    if (now.getTime() - lastLoadAt >= due) load();
  }

  api._tickForTest = tick;

  function start() {
    elCampus = document.getElementById('campus');
    elClock = document.getElementById('clock');
    elTokou = document.getElementById('tokouImg');
    elGekou = document.getElementById('gekouImg');
    elAsof = document.getElementById('asof');
    elFail = document.getElementById('fail');
    load();
    setInterval(tick, TICK_MS);

    // ★★見張りを1回、自分で呼ぶ。
    //   見張りの初回は【登録の15秒後】に来るので、これが無いと
    //   教室の画面は最初の15秒、時計が空のままになります。
    //   ★ここより前に load() を済ませてあるので、この呼び出しで
    //     窓口をもう一度叩くことはありません（試験が見張っています）。
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
