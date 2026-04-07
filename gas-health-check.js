// ============================================================
// Google Apps Script - 健康観察API
// スプレッドシート: https://docs.google.com/spreadsheets/d/16AtoTfJxu5SYFGjKcBjXNz_ohB9DHX_2m37Je371PDk/
//
// 【セットアップ】
// 1. スプレッドシートにシート「名簿」「記録」を作成済み
// 2. このスクリプトをApps Scriptエディタに貼り付け
// 3. ウェブアプリとしてデプロイ（アクセス: 全員）
// ============================================================

const SHEET_ID = '16AtoTfJxu5SYFGjKcBjXNz_ohB9DHX_2m37Je371PDk';

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    if (action === 'roster') result = getRoster(e.parameter.day);
    else if (action === 'records') result = getRecords(e.parameter.date);
    else if (action === 'allRoster') result = getAllRoster();
    else result = { error: 'Unknown action' };
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  let result;
  try {
    if (body.action === 'submit') result = submitRecords(body);
    else if (body.action === 'updateRoster') result = updateRoster(body);
    else result = { error: 'Unknown action' };
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 指定曜日の生徒一覧を取得
function getRoster(day) {
  const sheet = getSheet('名簿');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const dayIndex = headers.indexOf(day);
  if (dayIndex === -1) return { students: [] };

  const students = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][dayIndex] === '○') {
      students.push(data[i][0]);
    }
  }
  return { students };
}

// 全名簿データを取得（編集用）
function getAllRoster() {
  const sheet = getSheet('名簿');
  const data = sheet.getDataRange().getValues();
  const days = ['月', '火', '水', '木', '金'];

  const roster = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const entry = { name: data[i][0], days: {} };
    days.forEach(d => {
      const idx = data[0].indexOf(d);
      entry.days[d] = idx !== -1 && data[i][idx] === '○';
    });
    roster.push(entry);
  }
  return { roster };
}

// 指定日の健康観察記録を取得
function getRecords(dateStr) {
  const sheet = getSheet('記録');
  const data = sheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < data.length; i++) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (rowDate === dateStr) {
      records.push({
        date: rowDate,
        name: data[i][1],
        condition: data[i][2],
        attendance: data[i][3],
        arrivalTime: data[i][4],
        recorder: data[i][5],
        recordedAt: data[i][6],
      });
    }
  }
  return { records };
}

// 健康観察記録を保存
function submitRecords(body) {
  const sheet = getSheet('記録');
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  const records = body.records;
  const date = body.date;
  const recorder = body.recorder;

  // 同日・同名の既存レコードを削除（上書き）
  const data = sheet.getDataRange().getValues();
  const namesToUpdate = records.map(r => r.name);
  const rowsToDelete = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (rowDate === date && namesToUpdate.includes(data[i][1])) {
      rowsToDelete.push(i + 1);
    }
  }
  rowsToDelete.forEach(row => sheet.deleteRow(row));

  // 新しいレコードを追加
  records.forEach(r => {
    sheet.appendRow([date, r.name, r.condition, r.attendance, r.arrivalTime, recorder, now]);
  });

  return { success: true, count: records.length };
}

// 名簿を更新
function updateRoster(body) {
  const sheet = getSheet('名簿');
  const roster = body.roster;
  const days = ['月', '火', '水', '木', '金'];

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 6).setValues([['名前', '月', '火', '水', '木', '金']]);

  roster.forEach((entry, i) => {
    const row = [entry.name];
    days.forEach(d => {
      row.push(entry.days[d] ? '○' : '');
    });
    sheet.getRange(i + 2, 1, 1, 6).setValues([row]);
  });

  return { success: true };
}
