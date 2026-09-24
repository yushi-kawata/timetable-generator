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

const { parseRoute, isStaffRoute, isPersonSwitched, ROUTE_HASH, ROUTE_NAMES, STAFF_ONLY } =
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

/* ── 6. ★起動したとき、URL どおりの画面に着くか（2026-09-19／台帳 A4-119）──
   【何があったか】
     教室表示モード（#/seats/classroom）を iPad で開いても出ない、という報告。
     調べたら iPad は関係なく、URL を直接開くと【必ず】生徒用（#/）へ
     飛ばされていた。#/seats も #/health も #/admin も全部。
     ＝ハッシュで画面を分ける仕組み（A4-120）が、ブックマークからは
       1つも効いていなかった。

   【なぜ誰も気づかなかったか】★ここが一番大事
     描画確認のハーネス（tmp_verify/seats-main.tsx）が、1回目の描画から
     「ログイン済み」を差し込んでいた。本番の Firebase は必ず
       1回目: 復元中（user:null） → しばらく後: 復元できた（user:あり）
     の順で来る。ハーネスはその【変わり目】を作っていなかったので、
     変わり目でしか起きないこの不具合を、構造上ひとつも捕まえられなかった。
     ★検査する側が、壊れる瞬間を再現していなかった。
     ★ハーネスを足すときは「本番と同じ順番で状態が変わるか」を必ず確かめること。

   【ここで守ること】
     ・ページを開いて復元できただけでは、生徒用へ飛ばさない
     ・ログアウト・人の入れ替わりでは、必ず生徒用へ戻す（引き継がせない） */

test('★開いた直後に「誰が入っているか」が分かっただけでは、生徒用へ飛ばさない', () => {
  // undefined ＝ まだ一度も確かめていない（＝ページを開いた直後）
  assert.equal(isPersonSwitched(undefined, 'uid-A'), false);
  assert.equal(isPersonSwitched(undefined, null), false);
});

test('★これが false でないと、ブックマークした URL が全部 #/ に化ける', () => {
  // 本番で実際に起きていた順番をそのままなぞる
  //   1回目の描画: 復元中（uid は null 扱い）→ この時点では何も判断しない
  //   復元できた  : null → 'uid-A'
  // ★前の実装はこれを「人が変わった」と数えて #/ に差し替えていた
  assert.equal(isPersonSwitched(undefined, 'uid-A'), false);
});

test('ログアウトしたら生徒用へ戻す（次の人に前の画面を引き継がせない）', () => {
  assert.equal(isPersonSwitched('uid-A', null), true);
});

test('★人が入れ替わったら生徒用へ戻す', () => {
  assert.equal(isPersonSwitched('uid-A', 'uid-B'), true);
});

test('同じ人のままなら何もしない（描き直しのたびに飛ばさない）', () => {
  assert.equal(isPersonSwitched('uid-A', 'uid-A'), false);
  assert.equal(isPersonSwitched(null, null), false);
});

test('★App.tsx が、この判断を自前で書き直していない（正本は lib/route.ts）', () => {
  assert.match(appSrc, /isPersonSwitched\(/, 'App.tsx が判断を自前で持っている');
  assert.equal(
    /prevUidRef\s*=\s*useRef<[^>]*>\(uid\)/.test(appSrc),
    false,
    '★prevUidRef を uid で初期化する書き方が復活している（この不具合の正体）',
  );
  assert.match(
    appSrc,
    /if\s*\(\s*authLoading\s*\)\s*return\s*;/,
    '★確認中（authLoading）に判断してしまっている',
  );
});
