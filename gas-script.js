// ============================================
// Google Apps Script — 時間割システム用バックエンド
// ============================================
// 1. https://script.google.com/ で新しいプロジェクトを作成
// 2. このコードを貼り付けて保存
// 3.「デプロイ」→「新しいデプロイ」→ 種類：ウェブアプリ
//    アクセスできるユーザー：「全員」
//    → デプロイ → URLをコピー
// 4. コピーしたURLをフロントエンドの GAS_URL に設定
// ============================================

const SHEET_RECORDS = 'records';
const SHEET_TT = 'timetable';
const SHEET_STUDENTS = 'students';
const SHEET_ATTENDANCE = 'attendance';
const SHEET_PERIOD2 = 'period2';

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_RECORDS) {
      sheet.appendRow(['id', 'week', 'name', 'grade', 'days', 'sel', 'timestamp']);
    }
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getRecs') {
    const sheet = getOrCreateSheet(SHEET_RECORDS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const recs = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      try { obj.days = JSON.parse(obj.days); } catch(e) { obj.days = []; }
      try { obj.sel = JSON.parse(obj.sel); } catch(e) { obj.sel = {}; }
      return obj;
    });
    return ContentService.createTextOutput(JSON.stringify(recs)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getStudents') {
    const sheet = getOrCreateSheet(SHEET_STUDENTS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
    const headers = data[0];
    const students = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      // 曜日フラグをbooleanに
      ['月','火','水','木','金'].forEach(d => { obj[d] = obj[d] === true || obj[d] === '○' || obj[d] === 'TRUE'; });
      return {
        name: obj.name || '',
        grade: obj.grade || '',
        course: obj.course || '通常',
        dx_email: obj.dx_email || '',
        days: { 月: obj['月'], 火: obj['火'], 水: obj['水'], 木: obj['木'], 金: obj['金'] }
      };
    });
    return ContentService.createTextOutput(JSON.stringify(students)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getAttendance') {
    const date = e.parameter.date || '';
    const sheet = getOrCreateSheet(SHEET_ATTENDANCE);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
    const headers = data[0];
    const records = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    }).filter(r => !date || r.date === date);
    return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getPeriod2') {
    const week = e.parameter.week || '';
    const sheet = getOrCreateSheet(SHEET_PERIOD2);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
    const headers = data[0];
    const records = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      var sel = {};
      ['月','火','水','木','金'].forEach(function(d) {
        var v = obj[d] || '';
        if (typeof v === 'string' && v.indexOf('{') === 0) {
          try { sel[d] = JSON.parse(v); } catch(ex) { sel[d] = {}; }
        } else if (v) {
          sel[d] = { 2: v };
        } else {
          sel[d] = {};
        }
      });
      return {
        week: obj.week || '',
        name: obj.name || '',
        selections: sel
      };
    }).filter(r => !week || r.week === week);
    return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getTT') {
    const sheet = getOrCreateSheet(SHEET_TT);
    const data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      try {
        const tt = JSON.parse(data[1][0]);
        return ContentService.createTextOutput(JSON.stringify(tt)).setMimeType(ContentService.MimeType.JSON);
      } catch(e) {}
    }
    return ContentService.createTextOutput('null').setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);

  if (body.action === 'saveRec') {
    const d = body.data;
    const sheet = getOrCreateSheet(SHEET_RECORDS);
    sheet.appendRow([
      d.id, d.week, d.name, d.grade,
      JSON.stringify(d.days), JSON.stringify(d.sel), d.timestamp
    ]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'deleteRec') {
    const sheet = getOrCreateSheet(SHEET_RECORDS);
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(body.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'clearRecs') {
    const sheet = getOrCreateSheet(SHEET_RECORDS);
    if (sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'saveTT') {
    const sheet = getOrCreateSheet(SHEET_TT);
    sheet.clear();
    sheet.appendRow(['data']);
    sheet.appendRow([JSON.stringify(body.data)]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'saveStudents') {
    const sheet = getOrCreateSheet(SHEET_STUDENTS);
    sheet.clear();
    sheet.appendRow(['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password']);
    (body.data || []).forEach(s => {
      sheet.appendRow([
        s.name, s.grade, s.course || '通常',
        s.days['月'] ? '○' : '', s.days['火'] ? '○' : '',
        s.days['水'] ? '○' : '', s.days['木'] ? '○' : '', s.days['金'] ? '○' : '',
        s.dx_email || '', s.dx_password || ''
      ]);
    });
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'checkIn') {
    const sheet = getOrCreateSheet(SHEET_ATTENDANCE);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['date', 'name', 'grade', 'checkinTime', 'checkoutTime']);
    }
    // 同日同名の既存レコードを探す
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.date && data[i][1] === body.name) {
        // 既に登校済み → 更新しない
        return ContentService.createTextOutput(JSON.stringify({ok:true, message:'already checked in'})).setMimeType(ContentService.MimeType.JSON);
      }
    }
    sheet.appendRow([body.date, body.name, body.grade || '', body.time || '', '']);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'checkOut') {
    const sheet = getOrCreateSheet(SHEET_ATTENDANCE);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === body.date && data[i][1] === body.name) {
        sheet.getRange(i + 1, 5).setValue(body.time || '');
        return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok:false, message:'no checkin record'})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'savePeriod2') {
    const sheet = getOrCreateSheet(SHEET_PERIOD2);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['week', 'name', '月', '火', '水', '木', '金']);
    }
    // 同週同名の既存レコードを削除
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === body.week && data[i][1] === body.name) {
        sheet.deleteRow(i + 1);
      }
    }
    const sel = body.selections || {};
    sheet.appendRow([
      body.week, body.name,
      JSON.stringify(sel['月'] || {}),
      JSON.stringify(sel['火'] || {}),
      JSON.stringify(sel['水'] || {}),
      JSON.stringify(sel['木'] || {}),
      JSON.stringify(sel['金'] || {})
    ]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'authStudent') {
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const sheet = getOrCreateSheet(SHEET_STUDENTS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, msg:'no students'})).setMimeType(ContentService.MimeType.JSON);
    }
    const headers = data[0];
    for (let i = 1; i < data.length; i++) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = data[i][j]);
      const dxEmail = (obj.dx_email || '').toString().trim().toLowerCase();
      const dxPw = (obj.dx_password || '').toString();
      if (dxEmail === email && dxPw === password) {
        ['月','火','水','木','金'].forEach(d => { obj[d] = obj[d] === true || obj[d] === '○' || obj[d] === 'TRUE'; });
        return ContentService.createTextOutput(JSON.stringify({
          ok: true,
          student: {
            name: obj.name || '',
            grade: obj.grade || '',
            course: obj.course || '通常',
            dx_email: dxEmail,
            days: { '月': obj['月'], '火': obj['火'], '水': obj['水'], '木': obj['木'], '金': obj['金'] }
          }
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok:false, msg:'auth failed'})).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'dxCheckIn') {
    const email = (body.email || '').trim().toLowerCase();
    const dxUrl = body.dxUrl || '';
    if (!dxUrl) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, msg:'no dxUrl'})).setMimeType(ContentService.MimeType.JSON);
    }
    // studentsシートから認証情報を取得
    const sheet = getOrCreateSheet(SHEET_STUDENTS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    let creds = null;
    for (let i = 1; i < data.length; i++) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = data[i][j]);
      if ((obj.dx_email || '').toString().trim().toLowerCase() === email) {
        creds = { email: obj.dx_email.toString(), password: (obj.dx_password || '').toString() };
        break;
      }
    }
    if (!creds) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, msg:'student not found'})).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      // ステップ1: ログインページにGET（セッションcookie取得）
      var getResp = UrlFetchApp.fetch('https://you-net-dx.jp/yushi/student/index.php', {
        followRedirects: true,
        muteHttpExceptions: true
      });
      var getCookies = getResp.getAllHeaders()['Set-Cookie'];
      var sessionCookie = '';
      if (getCookies) {
        if (typeof getCookies === 'string') {
          sessionCookie = getCookies.split(';')[0];
        } else {
          sessionCookie = getCookies.map(function(c) { return c.split(';')[0]; }).join('; ');
        }
      }

      // ステップ2: login.phpにPOST（login_flag含む）
      var loginResp = UrlFetchApp.fetch('https://you-net-dx.jp/yushi/student/pages/login.php', {
        method: 'post',
        payload: {
          login_id: creds.email,
          password: creds.password,
          login_flag: ''
        },
        headers: { 'Cookie': sessionCookie },
        followRedirects: false,
        muteHttpExceptions: true
      });
      // ログイン後の新しいセッションcookieを取得
      var loginCookies = loginResp.getAllHeaders()['Set-Cookie'];
      if (loginCookies) {
        if (typeof loginCookies === 'string') {
          sessionCookie = loginCookies.split(';')[0];
        } else {
          sessionCookie = loginCookies.map(function(c) { return c.split(';')[0]; }).join('; ');
        }
      }

      var loginCode = loginResp.getResponseCode();

      // ステップ3: 出席ページにGET（student_idを取得）
      var attendPage = UrlFetchApp.fetch(dxUrl, {
        headers: { 'Cookie': sessionCookie },
        followRedirects: true,
        muteHttpExceptions: true
      });
      var pageHtml = attendPage.getContentText();
      var sidMatch = pageHtml.match(/name="student_id" value="(\d+)"/);
      var studentId = sidMatch ? sidMatch[1] : '';
      if (!studentId) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, msg:'no student_id'})).setMimeType(ContentService.MimeType.JSON);
      }

      // ステップ4: 出席フォームをPOST送信（これが実際の登録）
      var typeMatch = dxUrl.match(/type=(\d)/);
      var studioMatch = dxUrl.match(/studio_id=(\d)/);
      var submitResp = UrlFetchApp.fetch(dxUrl, {
        method: 'post',
        payload: {
          student_id: studentId,
          type: typeMatch ? typeMatch[1] : '0',
          studio_id: studioMatch ? studioMatch[1] : '3',
          attend: '送信する'
        },
        headers: { 'Cookie': sessionCookie },
        followRedirects: true,
        muteHttpExceptions: true
      });
      var code = submitResp.getResponseCode();
      return ContentService.createTextOutput(JSON.stringify({ok: code >= 200 && code < 400, code: code})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, msg: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ok:false})).setMimeType(ContentService.MimeType.JSON);
}
