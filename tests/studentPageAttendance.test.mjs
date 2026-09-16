/* ============================================================================
   画面側の日付照合の試験 ── 台帳 A4-99（2026-09-16）
   ============================================================================
   ★起きていたこと（本番）
     スプレッドシートの日付は【日付型】で返る。JSON になると
     "2026-09-15T15:00:00.000Z"（＝日本時間 9/16 0時）のような形で届く。
     これを画面が === で比べていたため、記録があるのに見つけられず、
       ・「まだ登校を記録していません」と出る
       ・「登校する」ボタンが押せるまま残る
       ・押すと younetDX へ本物の登録が【再送】される（抑止は画面にもGASにも無い）
     ＝この照合の1行が、生徒に二重登録をさせていた。

   ★この試験の作り
     模造品を置いて緑にしない。【本番のソースからその式そのものを取り出して】
     動かす。だから直す前は必ず落ちる（落ちなければ症状を捕まえていない）。
     ・src/components/student/StudentPage.tsx の myAttendance の式
     ・src/stores/useMasterStore.ts の checkIn / checkOut が set に渡す更新関数
     日付の突き合わせ自体（findAttendance）は本番と同じものを読み込んで使う。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { loadTs } from './_load-ts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const { findAttendance } = await loadTs('src/lib/attendanceMatch.ts');

const pageSrc = readFileSync(path.join(ROOT, 'src/components/student/StudentPage.tsx'), 'utf8');
const panelSrc = readFileSync(path.join(ROOT, 'src/components/student/AttendancePanel.tsx'), 'utf8');
const storeSrc = readFileSync(path.join(ROOT, 'src/stores/useMasterStore.ts'), 'utf8');

/* ── 本番のソースから式を取り出す道具 ───────────────────────────────── */

/** 文字列の終わりの位置（開きの引用符の位置を渡す） */
function skipString(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === quote) return j;
  }
  throw new Error('文字列が閉じていない');
}

/** openIdx の '(' に対応する ')' の位置。文字列とコメントの中は数えない */
function matchParen(src, openIdx) {
  assert.equal(src[openIdx], '(', '開き括弧の位置がずれている');
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  throw new Error('括弧の対応が取れない');
}

/** marker で始まる関数の中で、最初の set( に渡している更新関数のソース */
function setUpdaterSource(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `${marker} が本番のソースに見つからない（名前が変わった？）`);
  assert.equal(src.indexOf(marker, at + 1), -1, `${marker} が複数ある。取り違える`);
  const setAt = src.indexOf('set(', at);
  assert.notEqual(setAt, -1, `${marker} の中に set( が見つからない`);
  const open = setAt + 'set'.length;
  return src.slice(open + 1, matchParen(src, open));
}

/* ── ① 生徒の画面：myAttendance の式（本番のソースそのもの）────────────── */

const myAttendanceExpr = (() => {
  const m = /const myAttendance = student\s*\?([\s\S]*?)\s*:\s*null;/.exec(pageSrc);
  assert.ok(m, 'StudentPage の myAttendance の式が見つからない（形が変わった？）');
  return m[1].trim();
})();

const factoryPage = runInNewContext(
  `(function (attendance, today, student, findAttendance) { return (${myAttendanceExpr}); })`,
);
/** 本番の式を、その日の一覧・今日・本人に当てて動かす */
const myAttendanceOf = (attendance, today, student) =>
  factoryPage(attendance, today, student, findAttendance);

/* ── 試験に使う「本番のシートが返してくる形」───────────────────────── */

const TODAY = '2026-09-16';
const ME = { name: '山田 太郎', grade: '1年' };
/** 日本時間 2026-09-16 00:00 ＝ UTC では 2026-09-15T15:00Z（日付型のセル） */
const CELL_DATE = new Date(Date.UTC(2026, 8, 15, 15, 0, 0));
const row = (over = {}) => ({
  date: CELL_DATE, name: ME.name, grade: ME.grade,
  checkinTime: '09:30', checkoutTime: '', ...over,
});

// ============================================================================
// ① 生徒の画面
// ============================================================================

test('★日付型のセルで届いても、登校済みと判定できる（=== だと外れる）', () => {
  const got = myAttendanceOf([row()], TODAY, ME);
  assert.ok(got, '記録があるのに見つけられていない＝「まだ登校を記録していません」が出る');
  assert.equal(got.checkinTime, '09:30');
});

test('★ISO文字列で届いても、登校済みと判定できる', () => {
  for (const d of ['2026-09-15T15:00:00.000Z', '2026-09-16T00:00:00.000Z', '2026-09-16T09:00:00+09:00']) {
    const got = myAttendanceOf([row({ date: d })], TODAY, ME);
    assert.ok(got, `${d} で見つけられていない`);
  }
});

test('★氏名の前後に空白が入っていても当てる（シートの列は空白が入りやすい）', () => {
  const got = myAttendanceOf([row({ name: `  ${ME.name} ` })], TODAY, ME);
  assert.ok(got, '空白のせいで「未記録」に見えている');
});

test('素の YYYY-MM-DD は今までどおり当たる（後戻りしない）', () => {
  const got = myAttendanceOf([row({ date: TODAY })], TODAY, ME);
  assert.ok(got);
  assert.equal(got.checkinTime, '09:30');
});

test('下校まで済んでいる行も、そのまま取り出せる', () => {
  const got = myAttendanceOf([row({ date: CELL_DATE, checkoutTime: '15:40' })], TODAY, ME);
  assert.ok(got);
  assert.equal(got.checkoutTime, '15:40');
});

test('★別の人・別の日は当てない（他人の記録で「登校済み」にしない）', () => {
  const others = [
    row({ name: '佐藤 花子' }),
    row({ date: new Date(Date.UTC(2026, 8, 14, 15, 0, 0)) }), // 前日
    row({ date: '2026-09-17' }),
  ];
  assert.ok(!myAttendanceOf(others, TODAY, ME), '関係のない行を自分の記録にしている');
});

test('一覧が空でも落ちない（未記録として扱う）', () => {
  assert.ok(!myAttendanceOf([], TODAY, ME));
});

test('見つけた行は AttendancePanel に渡り、ボタンの出し分けを決める（経路の固定）', () => {
  // ★ここは経路が切れていないことの確認。判定そのものは上の試験で見ている。
  assert.match(pageSrc, /checkinTime=\{myAttendance\?\.checkinTime \|\| ''\}/);
  assert.match(pageSrc, /checkoutTime=\{myAttendance\?\.checkoutTime \|\| ''\}/);
  assert.match(panelSrc, /const checkedIn = !!checkinTime;/);
});

// ============================================================================
// ② 台帳（useMasterStore）の checkIn ── 同じ === が残っていた
// ============================================================================

const checkInUpdater = (() => {
  const src = setUpdaterSource(storeSrc, 'checkIn: async (name, grade, date, time)');
  const make = runInNewContext(
    `(function (findAttendance, name, grade, date, time) { return ${src}; })`,
  );
  return (name, grade, date, time) => make(findAttendance, name, grade, date, time);
})();

test('★checkIn：日付型の行が既にあるのに、もう1行足してしまわない', () => {
  const state = { attendance: [row()] };
  const next = checkInUpdater(ME.name, ME.grade, TODAY, '09:45');
  const after = next(state);
  const list = after.attendance || state.attendance;
  assert.equal(list.length, 1, '同じ日の行が二重になっている（画面に2件出る）');
  assert.equal(list[0].checkinTime, '09:30', '既にある記録を上書きしている');
});

test('checkIn：その日の記録がまだ無ければ足す（後戻りしない）', () => {
  const state = { attendance: [row({ name: '佐藤 花子' })] };
  const after = checkInUpdater(ME.name, ME.grade, TODAY, '09:45')(state);
  assert.equal(after.attendance.length, 2, '新しい記録が足されていない');
  assert.equal(state.attendance.length, 1, '元の配列を書き換えている');
  const mine = after.attendance.find((a) => a.name === ME.name);
  assert.equal(mine.checkinTime, '09:45');
  assert.equal(mine.checkoutTime, '');
});

// ============================================================================
// ③ 台帳（useMasterStore）の checkOut ── 同じ === が残っていた
// ============================================================================

const checkOutUpdater = (() => {
  const src = setUpdaterSource(storeSrc, 'checkOut: async (name, date, time)');
  const make = runInNewContext(
    `(function (findAttendance, name, date, time) { return ${src}; })`,
  );
  return (name, date, time) => make(findAttendance, name, date, time);
})();

test('★checkOut：日付型の行にも下校の時刻が入る', () => {
  const state = { attendance: [row()] };
  const after = checkOutUpdater(ME.name, TODAY, '15:40')(state);
  const list = after.attendance || state.attendance;
  assert.equal(list.length, 1);
  assert.equal(list[0].checkoutTime, '15:40', '下校の時刻が画面に出ない');
  assert.equal(state.attendance[0].checkoutTime, '', '元の配列を書き換えている');
});

test('checkOut：他の人の行には触らない', () => {
  const other = row({ name: '佐藤 花子' });
  const state = { attendance: [other, row()] };
  const after = checkOutUpdater(ME.name, TODAY, '15:40')(state);
  const list = after.attendance || state.attendance;
  assert.equal(list[0].checkoutTime, '', '他人の行に書き込んでいる');
  assert.equal(list[1].checkoutTime, '15:40');
});

test('checkOut：その日の行が無ければ何も起きない（勝手に作らない）', () => {
  const state = { attendance: [row({ date: '2026-09-15' })] };
  const after = checkOutUpdater(ME.name, TODAY, '15:40')(state);
  const list = (after && after.attendance) || state.attendance;
  assert.equal(list.length, 1, '無い行を作っている');
  assert.equal(list[0].checkoutTime, '', '別の日の行に書き込んでいる');
});
