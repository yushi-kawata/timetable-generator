// ===== 時間割作成ツール 裏側プログラム（Google Apps Script）=====
//
// ★2026-09-01 に本番の Apps Script から取得した実物で置き換えた（バックアップ）。
//   それまでリポジトリ側と本番が一致している保証が無かった。
//
// ★★未解決の問題（台帳 A4-41）: このコードには認証が1つも入っていない。
//   ・doGet の getRecs は、申告データの全件（**氏名・学年つき**）を誰にでも返す
//   ・doPost の clearRecs は、**申告データの2行目以降を全削除する**。認証なし
//   ・doPost の deleteRec は、**指定した1件を削除する**。認証なし
//   つまり URL を知っている人は「読める」だけでなく「消せる」。
//   同種の穴（A4-19 資産台帳／A4-21 面談通知）と同じ型。対処の手順書は
//   ~/yushi-documents/GAS認証_適用手順_20260831_v1.md に既にある。
//
//   ★直すまでの間、このURLを人に渡さないこと。
//
// 元のプロジェクト名は「無題のプロジェクト」（名前が付いていない）。
// 本番を触るときは、Apple Script エディタ側の名前も付け直すこと。

function myFunction() {

}
const SHEET_RECS = '申告データ';
const SHEET_TT   = '時間割';

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'getRecs') return respond(getRecs());
    if (action === 'getTT')   return respond(getTT());
    return respond({ error: 'unknown action' });
  } catch(err) {
    return respond({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'saveRec')   return respond(saveRec(body.data));
    if (action === 'deleteRec') return respond(deleteRec(body.id));
    if (action === 'clearRecs') return respond(clearRecs());
    if (action === 'saveTT')    return respond(saveTT(body.data));
    return respond({ error: 'unknown action' });
  } catch(err) {
    return respond({ error: err.message });
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

const REC_HEADERS = ['id','week','name','grade','days','sel','timestamp'];

function getRecsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_RECS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_RECS);
    sh.appendRow(REC_HEADERS);
    sh.getRange(1,1,1,REC_HEADERS.length).setFontWeight('bold').setBackground('#1c1917').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getRecs() {
  const sh = getRecsSheet();
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(r => ({
    id:        r[0],
    week:      r[1],
    name:      r[2],
    grade:     r[3],
    days:      JSON.parse(r[4] || '[]'),
    sel:       JSON.parse(r[5] || '{}'),
    timestamp: r[6],
  }));
}

function saveRec(rec) {
  const sh = getRecsSheet();
  sh.appendRow([
    rec.id, rec.week, rec.name, rec.grade || '',
    JSON.stringify(rec.days), JSON.stringify(rec.sel), rec.timestamp,
  ]);
  return { ok: true };
}

function deleteRec(id) {
  const sh = getRecsSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false };
}

function clearRecs() {
  const sh = getRecsSheet();
  const last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  return { ok: true };
}

function getTTSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_TT);
  if (!sh) {
    sh = ss.insertSheet(SHEET_TT);
    sh.appendRow(['data']);
    sh.getRange(1,1).setFontWeight('bold').setBackground('#1c1917').setFontColor('#ffffff');
  }
  return sh;
}

function getTT() {
  const sh = getTTSheet();
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1 || !rows[1][0]) return null;
  try { return JSON.parse(rows[1][0]); } catch(e) { return null; }
}

function saveTT(data) {
  const sh = getTTSheet();
  if (sh.getLastRow() <= 1) {
    sh.appendRow([JSON.stringify(data)]);
  } else {
    sh.getRange(2, 1).setValue(JSON.stringify(data));
  }
  return { ok: true };
}
