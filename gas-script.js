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

  return ContentService.createTextOutput(JSON.stringify({ok:false})).setMimeType(ContentService.MimeType.JSON);
}
