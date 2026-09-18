/* ============================================================================
   座席表の【教室表示モード】の試験 ── 台帳 A4-119
   ============================================================================
   社長決裁（2026-09-18・5件）のうち、画面側で守れるものをここで固定します。
     (2) 専用のURL（画面上に切り替えを置かない）→ tests/route.test.mjs
     (3) ★見るだけ。席は動かせない
     (4) ★1分で伏せる（★通常の座席表は5分のまま。定数を分ける）
   ＋ その日の曜日を自動で選ぶ／月〜金でない日に【黙って月曜を出さない】

   ★★この試験が通っても、この画面だけでは守れません。
     生徒が URL を打ち替えれば戻れます。iPad の【アクセスガイド】と
     組み合わせて初めて成立します。ここで確かめているのは
     「画面が出口を1つも描かないこと」だけです。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './_load-ts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const {
  CLASSROOM_MASK_IDLE_MS,
  CLASSROOM_RELOAD_MS,
  CLASSROOM_RETRY_MS,
  CLASSROOM_TICK_MS,
  SEAT_MASK_IDLE_MS,
  SEAT_ROOM_NAME,
  classroomToday,
  seatDateLabel,
} = await loadTs('src/lib/seatChart.ts');

/** コメントを落としてからソースを見る（注意書きに書いた <button> を数えないため） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const viewSrc = readFileSync(
  path.join(ROOT, 'src/components/seats/ClassroomSeatView.tsx'),
  'utf8',
);
const view = stripComments(viewSrc);
const appSrc = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const app = stripComments(appSrc);
const pageSrc = readFileSync(
  path.join(ROOT, 'src/components/seats/SeatChartPage.tsx'),
  'utf8',
);
const page = stripComments(pageSrc);

/* ── 1. 伏せるまでの時間（★通常の5分と混ぜない）────────────────── */

test('★教室表示モードは1分で伏せる（社長決裁(4)）', () => {
  assert.equal(CLASSROOM_MASK_IDLE_MS, 60 * 1000);
});

test('★通常の座席表は5分のまま（教室表示モードの巻き添えにしない）', () => {
  assert.equal(SEAT_MASK_IDLE_MS, 5 * 60 * 1000);
});

test('★2つの時間は別の定数（片方を直しても、もう片方は動かない）', () => {
  assert.notEqual(CLASSROOM_MASK_IDLE_MS, SEAT_MASK_IDLE_MS);
  assert.equal(CLASSROOM_MASK_IDLE_MS < SEAT_MASK_IDLE_MS, true);
});

test('★通常の座席表は、教室表示モードの定数を使っていない', () => {
  assert.match(page, /SEAT_MASK_IDLE_MS/, '通常の座席表から5分の定数が消えている');
  assert.equal(
    page.includes('CLASSROOM_MASK_IDLE_MS'),
    false,
    '通常の座席表が1分の定数を使っている（5分が1分になる）',
  );
});

test('自動で読み直す間隔＞失敗したときにやり直す間隔（失敗中は短く試す）', () => {
  assert.equal(CLASSROOM_RETRY_MS <= CLASSROOM_RELOAD_MS, true);
  for (const ms of [CLASSROOM_RELOAD_MS, CLASSROOM_RETRY_MS, CLASSROOM_TICK_MS]) {
    assert.equal(Number.isFinite(ms) && ms > 0, true);
  }
});

/* ── 2. その日の曜日を自動で選ぶ ────────────────────────────────── */

test('月〜金は、その日の曜日が選ばれる（先生が選び直さない）', () => {
  const cases = [
    ['2026-09-14', '月'],
    ['2026-09-15', '火'],
    ['2026-09-16', '水'],
    ['2026-09-17', '木'],
    ['2026-09-18', '金'],
  ];
  for (const [iso, day] of cases) {
    const [y, m, d] = iso.split('-').map(Number);
    const r = classroomToday(new Date(y, m - 1, d));
    assert.equal(r.kind, 'class', iso + ' が授業日として出ていない');
    assert.equal(r.day, day, iso + ' の曜日が違う');
    assert.equal(r.weekdayLabel, day);
  }
});

test('★土曜日に、黙って月曜日を出さない（社長指示 2026-09-18）', () => {
  const sat = classroomToday(new Date(2026, 8, 19)); // 2026-09-19（土）
  assert.equal(sat.kind, 'offday');
  assert.notEqual(sat.kind, 'class');
  // ★「月」が座席表の曜日として採用されていないこと
  assert.equal('day' in sat, false, '土曜なのに曜日が決まっている（月曜が出る）');
});

test('土日は「今日は授業がありません」と、次の登校日を出せる形で返る', () => {
  const sat = classroomToday(new Date(2026, 8, 19)); // 土
  assert.equal(sat.weekdayLabel, '土');
  assert.equal(sat.dateLabel, '9月19日');
  assert.equal(sat.nextDay, '月');
  assert.equal(sat.nextDateLabel, '9月21日');

  const sun = classroomToday(new Date(2026, 8, 20)); // 日
  assert.equal(sun.kind, 'offday');
  assert.equal(sun.weekdayLabel, '日');
  assert.equal(sun.nextDay, '月');
  assert.equal(sun.nextDateLabel, '9月21日');
});

test('★渡した日付を書き換えない（次の登校日を探すために進めた分が残らない）', () => {
  const sat = new Date(2026, 8, 19);
  classroomToday(sat);
  assert.equal(seatDateLabel(sat), '9月19日');
});

test('日付の札は「◯月◯日」（年は出さない）', () => {
  assert.equal(seatDateLabel(new Date(2026, 0, 5)), '1月5日');
  assert.equal(seatDateLabel(new Date(2026, 11, 31)), '12月31日');
});

/* ── 3. ★見るだけ（操作子を1つも描かない）──────────────────────── */

test('★教室表示モードに、押せる部品が1つも無い（他の画面への道＝0本）', () => {
  const banned = [
    ['<button', 'ボタン'],
    ['<a ', 'リンク'],
    ['<a>', 'リンク'],
    ['<input', '入力欄'],
    ['<select', '選択欄'],
    ['<textarea', '入力欄'],
    ['onClick', '押したときの動き'],
    ['role="button"', 'ボタンの役割'],
    ['tabIndex', 'キーボードで止まる部品'],
    ['href', 'リンク先'],
  ];
  for (const [needle, what] of banned) {
    assert.equal(
      view.includes(needle),
      false,
      '教室表示モードに ' + what + '（' + needle + '）が足されている',
    );
  }
});

test('★編集の道具を1つも持ち込んでいない（見るだけ・社長決裁(3)）', () => {
  const banned = ['saveSeating', 'autoAssign', 'moveSeat', 'SeatPlanHeader', 'ConstraintDraft'];
  for (const needle of banned) {
    assert.equal(view.includes(needle), false, '教室表示モードに ' + needle + ' が入っている');
  }
});

test('★席は動かせない（SeatGridView に editing={false} を渡している）', () => {
  assert.match(view, /editing=\{false\}/, '編集できる状態で描いている');
  assert.match(view, /pickedId=\{null\}/);
  assert.equal(view.includes('editing={true}'), false);
});

test('★伏せている間は席を描かない（氏名が DOM に残らない）', () => {
  const guard = view.indexOf("!masked");
  const gridAt = view.indexOf('<SeatGridView');
  assert.equal(guard > 0, true, '伏せているかどうかで描き分けていない');
  assert.equal(gridAt > guard, true, '席の並びが「伏せていない」の条件の外にある');
  assert.equal(view.split('<SeatGridView').length - 1, 1, '席の並びを2か所で描いている');
});

test('★取りに行くのは座席表の窓口だけ（名簿・時間割は取りに行かない）', () => {
  assert.match(view, /fetchSeatChart/);
  assert.equal(view.includes('fetchAll'), false);
  assert.equal(view.includes('useAppStore'), false);
});

/* ── 4. 失敗したときの出し方 ────────────────────────────────────── */

test('★失敗したら古い座席表を消す（新しいものだと誤認させない）', () => {
  // 失敗の枝で chart を null にしていること
  assert.match(view, /setChart\(null\)/);
  assert.match(viewSrc, /古いものを表示し続けない/);
});

test('★いつのデータかを必ず出す（自動で読み直すので、なおさら要る）', () => {
  assert.match(view, /このデータ：/);
  assert.match(view, /に取得/);
  assert.match(view, /自動で読み直します/);
});

/* ── 5. 画面の組み立て（App.tsx）────────────────────────────────── */

test('★教室表示モードは、ヘッダーより手前で返す（他の画面への道を描かない）', () => {
  const branchAt = app.indexOf("route === 'classroom'");
  const headerAt = app.indexOf('<header');
  assert.equal(branchAt > 0, true, '教室表示モードの分岐が App.tsx に無い');
  assert.equal(headerAt > 0, true);
  assert.equal(
    branchAt < headerAt,
    true,
    'ヘッダー（戻る・他の画面への入口・ログアウト）が描かれてしまう位置にある',
  );
  assert.match(app, /<ClassroomSeatView \/>/);
});

test('★教室表示モードでは名簿・時間割を取りに行かない（置きっぱなしの端末に降ろさない）', () => {
  assert.match(app, /const isClassroom = route === 'classroom';/);
  assert.match(app, /if \(isClassroom\) return;/);
});

test('★職員でなければ開けない（行き先の表で職員専用にしてある）', async () => {
  const { STAFF_ONLY } = await loadTs('src/lib/route.ts');
  assert.equal(STAFF_ONLY.classroom, true);
});

/* ── 6. 通常の座席表が壊れていないこと ──────────────────────────── */

test('★通常の座席表は、これまでどおり編集できる', () => {
  assert.match(page, /座席を編集/);
  assert.match(page, /この曜日を保存/);
  assert.match(page, /自動で並べる/);
  assert.match(page, /saveSeating/);
});

test('教室名は1か所（2つの画面が同じ名前を出す）', () => {
  assert.equal(SEAT_ROOM_NAME, 'A教室（2年）');
  assert.match(page, /ROOM_NAME = SEAT_ROOM_NAME/);
  assert.match(view, /SEAT_ROOM_NAME/);
});
