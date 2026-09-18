/* ============================================================================
   画面の行き先（URL のハッシュ）の試験 ── 台帳 A4-120
   ============================================================================
   ★ここで守ること
     1. ★ハッシュが無い URL は【これまでどおり生徒用】に着く。
        生徒47人が毎日そのURLを開いている。ここが変わると全員が迷子になる。
     2. 5つの画面が、それぞれ決まったハッシュで開く（往復で一致する）。
     3. ★職員専用かどうかを、行き先ごとに【表で】持っている。
        URL で画面を分けた以上、「ボタンを隠す」だけでは守りにならない。
     4. 知らない行き先は黙って生徒用に飛ばさない（null を返し、画面が断る）。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './_load-ts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const { parseRoute, isStaffRoute, ROUTE_HASH, ROUTE_NAMES, STAFF_ONLY } =
  await loadTs('src/lib/route.ts');

/* ── 1. これまでのブックマーク ──────────────────────────────────── */

test('★ハッシュが無い URL は生徒用に着く（ブックマーク済みの生徒を迷子にしない）', () => {
  assert.equal(parseRoute(''), 'student');
});

test('★空に近い形（# だけ・#/ だけ）も生徒用に着く', () => {
  assert.equal(parseRoute('#'), 'student');
  assert.equal(parseRoute('#/'), 'student');
  assert.equal(parseRoute('#/student'), 'student');
});

/* ── 2. 5つの画面 ───────────────────────────────────────────────── */

test('5つの画面が、決まったハッシュで開く', () => {
  assert.equal(parseRoute('#/student'), 'student');
  assert.equal(parseRoute('#/health'), 'health');
  assert.equal(parseRoute('#/teacher'), 'teacher');
  assert.equal(parseRoute('#/admin'), 'admin');
  assert.equal(parseRoute('#/seats'), 'seats');
});

test('★行き先 → URL → 行き先 が往復で一致する（表が2つに割れていない）', () => {
  for (const name of ROUTE_NAMES) {
    assert.equal(parseRoute(ROUTE_HASH[name]), name, name + ' の往復が合わない');
  }
});

test('画面は6つ。★足したときに、この数と下の職員判定の両方を直させる', () => {
  assert.equal(ROUTE_NAMES.length, 6);
  assert.deepEqual(
    [...ROUTE_NAMES].sort(),
    ['admin', 'classroom', 'health', 'seats', 'student', 'teacher'],
  );
});

test('★教室表示モードは専用のURL（台帳 A4-119）', () => {
  assert.equal(parseRoute('#/seats/classroom'), 'classroom');
  assert.equal(ROUTE_HASH.classroom, '#/seats/classroom');
  // ★通常の座席表とは別の行き先（同じ画面に落ちない）
  assert.notEqual(parseRoute('#/seats/classroom'), parseRoute('#/seats'));
});

test('大文字・末尾のスラッシュ・ハッシュ内のクエリでも同じ場所に着く', () => {
  assert.equal(parseRoute('#/HEALTH'), 'health');
  assert.equal(parseRoute('#/health/'), 'health');
  assert.equal(parseRoute('#/seats?seatDemo=1'), 'seats');
  assert.equal(parseRoute('#seats'), 'seats');
});

/* ── 3. 職員専用かどうか ────────────────────────────────────────── */

test('★職員専用の画面が4つとも「専用」になっている（ここが false になると誰でも開ける）', () => {
  assert.equal(STAFF_ONLY.teacher, true, '教員用ページが職員専用から外れている');
  assert.equal(STAFF_ONLY.admin, true, '生徒マスターが職員専用から外れている');
  assert.equal(STAFF_ONLY.seats, true, '座席表が職員専用から外れている');
  assert.equal(STAFF_ONLY.classroom, true, '教室表示モードが職員専用から外れている');
});

test('生徒が使う画面は職員専用にしない（生徒が開けなくなる）', () => {
  assert.equal(STAFF_ONLY.student, false);
  assert.equal(STAFF_ONLY.health, false);
});

test('★すべての行き先が、職員専用かどうかを持っている（書き忘れを通さない）', () => {
  for (const name of ROUTE_NAMES) {
    assert.equal(typeof STAFF_ONLY[name], 'boolean', name + ' が職員判定の表に無い');
  }
  assert.equal(Object.keys(STAFF_ONLY).length, ROUTE_NAMES.length);
});

test('isStaffRoute は表のとおりに答える', () => {
  assert.equal(isStaffRoute('teacher'), true);
  assert.equal(isStaffRoute('admin'), true);
  assert.equal(isStaffRoute('seats'), true);
  assert.equal(isStaffRoute('student'), false);
  assert.equal(isStaffRoute('health'), false);
  assert.equal(isStaffRoute(null), false);
});

/* ── 4. 知らない行き先 ──────────────────────────────────────────── */

test('★知らない行き先は null（黙って生徒用に飛ばさない）', () => {
  assert.equal(parseRoute('#/nope'), null);
  assert.equal(parseRoute('#/admin2'), null);
  assert.equal(parseRoute('#/teacher/edit'), null);
  assert.equal(parseRoute('#/../admin'), null);
});

/* ── 5. 画面側が本当に番人を通しているか（ソースを読む）────────── */

const appSrc = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const hookSrc = readFileSync(path.join(ROOT, 'src/hooks/useRoute.ts'), 'utf8');

test('★App.tsx は、職員専用の行き先を開いた時点で止めている', () => {
  assert.match(
    appSrc,
    /if\s*\(\s*isStaffRoute\(route\)\s*&&\s*!isStaff\s*\)/,
    '行き先の番人（isStaffRoute && !isStaff）が App.tsx から消えている',
  );
  assert.match(appSrc, /StaffOnlyNotice/, '断りの画面が出されていない');
});

test('★知らない行き先には断りを出す（真っ白にしない）', () => {
  assert.match(appSrc, /if\s*\(\s*route\s*===\s*null\s*\)/);
  assert.match(appSrc, /NotFoundNotice/);
});

test('★画面の切り替えが内部の state に戻っていない（URL が正本）', () => {
  assert.equal(appSrc.includes('setMode('), false, 'setMode が復活している');
  assert.equal(/type Mode =/.test(appSrc), false, '内部の Mode 型が復活している');
  assert.match(appSrc, /useRoute\(\)/, 'App.tsx が URL を見ていない');
});

test('★戻る・進むボタンで画面が変わる（hashchange を購読している）', () => {
  assert.match(hookSrc, /addEventListener\(\s*'hashchange'/);
  assert.match(hookSrc, /removeEventListener\(\s*'hashchange'/);
});
