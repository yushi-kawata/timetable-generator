// saveStudents が「空で届いたパスワードで既存を消さない」ことを実測する。
// Apps Script の道具を最小限だけ偽物で用意して、本物のコードをそのまま読み込む。
const fs = require('fs');
const path = require('path');

function makeSheet(rows) {
  let data = rows.map(r => r.slice());
  return {
    _rows: () => data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getLastRow: () => data.length,
    clear: () => { data = []; },
    appendRow: (r) => { data.push(r.slice()); },
    getRange: () => ({ setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} }),
    setFrozenRows: () => {},
  };
}

const HEADERS = ['name','grade','course','月','火','水','木','金','dx_email','dx_password'];
const before = [
  HEADERS,
  ['山田','1','通常','○','','','','','a@dx.example','pw-AAA'],
  ['佐藤','2','Growth','','○','','','','b@dx.example','pw-BBB'],
  ['鈴木','1','通常','','','○','','','',''],           // 元から未設定
];
const sheet = makeSheet(before);

global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) };
global.ContentService = { MimeType:{JSON:'json'}, createTextOutput:(t)=>({ setMimeType:()=>t }) };
global.UrlFetchApp = { fetch: () => ({ getContentText: () => '{}' }) };

const code = fs.readFileSync(path.join(__dirname,'..','gas-script.本番_20260902.js'),'utf8');
eval(code);

// 画面から届く形：getStudents が dx_password を返さなくなったので全員空になる
const payload = [
  { name:'山田', grade:'1', course:'通常', dx_email:'a@dx.example', dx_password:'', days:{月:true,火:false,水:false,木:false,金:false} },
  { name:'佐藤', grade:'2', course:'Growth', dx_email:'b@dx.example', dx_password:'', days:{月:false,火:true,水:false,木:false,金:false} },
  { name:'鈴木', grade:'1', course:'通常', dx_email:'',              dx_password:'', days:{月:false,火:false,水:true,木:false,金:false} },
];
doPost({ postData:{ contents: JSON.stringify({ action:'saveStudents', data: payload }) } });

const after = sheet._rows();
const iPw = HEADERS.indexOf('dx_password');
const got = { 山田: after[1][iPw], 佐藤: after[2][iPw], 鈴木: after[3][iPw] };
const want = { 山田:'pw-AAA', 佐藤:'pw-BBB', 鈴木:'' };

let ok = true;
for (const k of Object.keys(want)) {
  const pass = got[k] === want[k];
  if (!pass) ok = false;
  console.log(`  ${pass?'PASS':'**FAIL**'}  ${k}: 期待「${want[k]||'(空)'}」 実際「${got[k]||'(空)'}」`);
}

// 変更したいときは通ること
const p2 = [{ name:'山田', grade:'1', course:'通常', dx_email:'a@dx.example', dx_password:'pw-NEW', days:{月:true,火:false,水:false,木:false,金:false} }];
doPost({ postData:{ contents: JSON.stringify({ action:'saveStudents', data: p2 }) } });
const changed = sheet._rows()[1][iPw];
const pass2 = changed === 'pw-NEW';
if (!pass2) ok = false;
console.log(`  ${pass2?'PASS':'**FAIL**'}  変更したいときは通る: 期待「pw-NEW」 実際「${changed}」`);

// getStudents が平文を返さないこと
const out = JSON.parse(doGet({ parameter:{ action:'getStudents' } }));
const leaked = JSON.stringify(out).includes('pw-');
console.log(`  ${leaked?'**FAIL**':'PASS'}  getStudents が平文パスワードを返さない`);
if (leaked) ok = false;
console.log(`  返ってきた項目: ${Object.keys(out[0]).join(', ')}`);

console.log(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');
process.exit(ok?0:1);
