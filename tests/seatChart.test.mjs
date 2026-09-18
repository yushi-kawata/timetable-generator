/* ============================================================================
   教室の座席表の試験 ── 台帳 A4-107
   ============================================================================
   ここで守ること:
     ・★画面に出てよいのは【氏名】と【座席の位置】だけ。窓口が余計な列を返しても
       画面側のデータに残らない（学年・コース・メール・パスワード・要配慮情報）
     ・★いつのデータか（asof）が分からないものは採らない
     ・その曜日に来ない人の席は空く／来るのに席が無い人は消えずに表の外へ出る
     ・教室の広さは曜日で変わらない（同じ席が別の場所に見えないこと）
     ・同じ席が重なったら黙って片方を消さない
     ・席の入れ替えで元の配列を変えない
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const {
  normalizeSeatChart,
  buildSeatGrid,
  moveSeat,
  weekdayOf,
  SEAT_MASK_IDLE_MS,
  SEAT_ROWS_FALLBACK,
  SEAT_COLS_FALLBACK,
  nameLines,
} = await loadTs('src/lib/seatChart.ts');

const ALL = { 月: true, 火: true, 水: true, 木: true, 金: true };
const MON_ONLY = { 月: true, 火: false, 水: false, 木: false, 金: false };

function chartOf(raw) {
  const r = normalizeSeatChart(raw);
  assert.equal(r.ok, true, '取り込めるはずの形が落ちた');
  return r.chart;
}

/** ★席は曜日ごとに別。その曜日ぶんと、教室の広さを渡して表を組む */
function gridOf(chart, day) {
  return buildSeatGrid(
    {
      students: chart.students,
      seats: chart.seatsByDay[day],
      rows: chart.grid.rows,
      cols: chart.grid.cols,
    },
    day,
  );
}

// ── 形をそろえる段階 ──────────────────────────────────────────────

test('約束どおりの形は取り込める', () => {
  const r = normalizeSeatChart({
    students: [{ student_id: '90000001', name: '見本 あおい', days: MON_ONLY }],
    seats: [{ student_id: '90000001', row: 2, col: 3 }],
    asof: '2026-09-18 09:40:12',
  });
  assert.equal(r.ok, true);
  assert.equal(r.chart.asof, '2026-09-18 09:40:12');
  assert.deepEqual(r.chart.seatsByDay['月'][0], { student_id: '90000001', row: 2, col: 3 });
});

test('★窓口が余計な列を返しても画面側には残らない（学年・コース・メール・パスワード・要配慮情報）', () => {
  const chart = chartOf({
    students: [
      {
        student_id: '90000001',
        name: '見本 あおい',
        days: ALL,
        grade: '2年',
        course: 'Growth',
        dx_email: 'x@example.invalid',
        dx_password: 'himitsu',
        medication: '服薬あり',
        techou: '手帳あり',
        hoken: '保健調査の中身',
      },
    ],
    seats: [{ student_id: '90000001', row: 1, col: 1, note: '配慮あり' }],
    asof: '2026-09-18 09:40:12',
  });

  const s = chart.students[0];
  assert.deepEqual(Object.keys(s).sort(), ['days', 'name', 'student_id']);
  assert.deepEqual(Object.keys(chart.seatsByDay['月'][0]).sort(), ['col', 'row', 'student_id']);

  // 念のため、丸ごと文字にしても機微な語が出てこないこと
  const dumped = JSON.stringify(chart);
  const banned = ['2年', 'Growth', 'example.invalid', 'himitsu', '服薬', '手帳', '保健', '配慮'];
  for (const word of banned) {
    assert.equal(dumped.includes(word), false, word + ' が残っている');
  }
});

test('★いつのデータか分からないものは採らない（古い表を新しいと誤認させない）', () => {
  const r = normalizeSeatChart({ students: [], seats: [], asof: '' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'noAsof');

  const r2 = normalizeSeatChart({ students: [], seats: [] });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'noAsof');
});

test('形が違うものは採らない（配列・入れ物でない返事）', () => {
  assert.equal(normalizeSeatChart(null).reason, 'notObject');
  assert.equal(normalizeSeatChart([]).reason, 'notObject');
  assert.equal(normalizeSeatChart('うまくいきました').reason, 'notObject');
  assert.equal(normalizeSeatChart({ seats: [], asof: 'x' }).reason, 'noStudents');
  assert.equal(normalizeSeatChart({ students: [], asof: 'x' }).reason, 'noSeats');
});

test('壊れた行は落とす（氏名なし・0番の席・小数・文字）', () => {
  const chart = chartOf({
    students: [
      { student_id: '90000001', name: '見本 あおい', days: ALL },
      { student_id: '90000002', name: '   ', days: ALL },
      { student_id: '', name: '見本 はると', days: ALL },
      { student_id: '90000001', name: '同じ番号の2行目', days: ALL },
    ],
    seats: [
      { student_id: '90000001', row: 1, col: 1 },
      { student_id: '90000002', row: 0, col: 1 },
      { student_id: '90000003', row: 1.5, col: 1 },
      { student_id: '90000004', row: 'まえ', col: 1 },
    ],
    asof: '2026-09-18 09:40:12',
  });
  assert.equal(chart.students.length, 1);
  assert.equal(chart.students[0].name, '見本 あおい');
  assert.equal(chart.seatsByDay['月'].length, 1);
});

test('★席は曜日ごとに分かれる（day を持つ行はその曜日だけ）', () => {
  const chart = chartOf({
    students: [{ student_id: 'A', name: '見本 あおい', days: ALL }],
    seats: [
      { student_id: 'A', row: 1, col: 1, day: '月' },
      { student_id: 'A', row: 4, col: 7, day: '火' },
    ],
    asof: 'x',
  });
  assert.deepEqual(chart.seatsByDay['月'], [{ student_id: 'A', row: 1, col: 1 }]);
  assert.deepEqual(chart.seatsByDay['火'], [{ student_id: 'A', row: 4, col: 7 }]);
  assert.deepEqual(chart.seatsByDay['水'], [], '曜日指定の席が別の曜日に出ている');
  assert.equal(gridOf(chart, '月').cells[0][0].student.name, '見本 あおい');
  assert.equal(gridOf(chart, '火').cells[3][6].student.name, '見本 あおい');
});

test('★曜日を持たない席は全曜日に同じ席として読む（いまの窓口との互換）', () => {
  const chart = chartOf({
    students: [{ student_id: 'A', name: '見本 あおい', days: ALL }],
    seats: [{ student_id: 'A', row: 2, col: 2 }],
    asof: 'x',
  });
  for (const d of ['月', '火', '水', '木', '金']) {
    assert.deepEqual(chart.seatsByDay[d], [{ student_id: 'A', row: 2, col: 2 }], d + ' が抜けている');
  }
});

test('曜日が抜けていても「来ない」に倒す（勝手に登校させない）', () => {
  const chart = chartOf({
    students: [{ student_id: '90000001', name: '見本 あおい', days: { 月: 'true' } }],
    seats: [],
    asof: 'x',
  });
  assert.deepEqual(chart.students[0].days, {
    月: false, 火: false, 水: false, 木: false, 金: false,
  });
});

// ── 曜日でしぼって並べる ──────────────────────────────────────────

const BASE = {
  students: [
    { student_id: 'A', name: '見本 あおい', days: MON_ONLY },
    { student_id: 'B', name: '見本 はると', days: ALL },
    {
      student_id: 'C',
      name: '見本 さくらこ',
      days: { 月: false, 火: true, 水: false, 木: false, 金: false },
    },
  ],
  seats: [
    { student_id: 'A', row: 1, col: 1 },
    { student_id: 'B', row: 1, col: 2 },
    { student_id: 'C', row: 3, col: 4 },
  ],
  asof: '2026-09-18 09:40:12',
};

test('その曜日に来ない人の席は空く', () => {
  const chart = chartOf(BASE);
  const mon = gridOf(chart, '月');
  assert.equal(mon.cells[0][0].student.name, '見本 あおい');
  assert.equal(mon.cells[0][1].student.name, '見本 はると');
  assert.equal(mon.cells[2][3].student, null, '火曜だけ来る人が月曜に並んでいる');
  assert.equal(mon.attendingCount, 2);

  const tue = gridOf(chart, '火');
  assert.equal(tue.cells[0][0].student, null, '月曜だけ来る人が火曜に並んでいる');
  assert.equal(tue.cells[2][3].student.name, '見本 さくらこ');
  assert.equal(tue.attendingCount, 2);
});

test('★教室の広さは窓口の grid どおりで、曜日で変わらない', () => {
  const chart = chartOf({ ...BASE, grid: { rows: 4, cols: 7 } });
  assert.equal(chart.gridProvided, true);
  assert.deepEqual(chart.grid, { rows: 4, cols: 7 });
  for (const d of ['月', '火', '水', '木', '金']) {
    const g = gridOf(chart, d);
    assert.equal(g.rows, 4, d + ' で行数が変わった');
    assert.equal(g.cols, 7, d + ' で列数が変わった');
    assert.equal(g.cells.length, 4);
    assert.equal(g.cells[0].length, 7);
    assert.equal(g.outOfRoom, false);
  }
});

test('★窓口が別の広さを返せば、その広さで描く（4×7を決め打ちしない）', () => {
  const chart = chartOf({ ...BASE, grid: { rows: 6, cols: 5 } });
  assert.deepEqual(chart.grid, { rows: 6, cols: 5 });
  const g = gridOf(chart, '月');
  assert.equal(g.rows, 6);
  assert.equal(g.cols, 5);
  assert.equal(g.cells.flat().length, 30);
});

test('★窓口が grid を返さなければ控えの値を使い、そうと分かる印を立てる', () => {
  const chart = chartOf(BASE);
  assert.equal(chart.gridProvided, false, '控えを使ったことが分からない');
  assert.deepEqual(chart.grid, { rows: SEAT_ROWS_FALLBACK, cols: SEAT_COLS_FALLBACK });
});

test('★壊れた grid は控えに落とす（0や文字で教室を消さない）', () => {
  for (const bad of [{ rows: 0, cols: 7 }, { rows: 'よん', cols: 7 }, { rows: 4 }, null]) {
    const chart = chartOf({ ...BASE, grid: bad });
    assert.equal(chart.gridProvided, false);
    assert.deepEqual(chart.grid, { rows: SEAT_ROWS_FALLBACK, cols: SEAT_COLS_FALLBACK });
  }
});

test('★席が1つも無くても 4行×7列のマス目を描ける（空の教室が出る）', () => {
  const chart = chartOf({ students: [], seats: [], asof: 'x', grid: { rows: 4, cols: 7 } });
  const g = gridOf(chart, '月');
  assert.equal(g.rows, 4);
  assert.equal(g.cols, 7);
  assert.equal(g.cells.flat().length, 28);
  assert.equal(g.cells.flat().filter((c) => c.student).length, 0);
});

test('★教室の外を指す席があっても落とさず、はみ出しとして知らせる', () => {
  const chart = chartOf({
    students: [{ student_id: 'A', name: '見本 あおい', days: ALL }],
    seats: [{ student_id: 'A', row: 6, col: 9 }],
    asof: 'x',
  });
  const g = gridOf(chart, '月');
  assert.equal(g.outOfRoom, true);
  assert.equal(g.rows, 6);
  assert.equal(g.cols, 9);
  assert.equal(g.cells[5][8].student.name, '見本 あおい', 'はみ出した人が消えている');
});

test('★登校するのに席が無い人は消えずに表の外へ出る（編入を想定）', () => {
  const chart = chartOf({
    students: [
      { student_id: 'A', name: '見本 あおい', days: ALL },
      { student_id: 'Z', name: '見本 ことは', days: ALL },
    ],
    seats: [{ student_id: 'A', row: 1, col: 1 }],
    asof: 'x',
  });
  const g = gridOf(chart, '月');
  assert.equal(g.unseated.length, 1);
  assert.equal(g.unseated[0].name, '見本 ことは');
  assert.equal(g.attendingCount, 2);
});

test('★同じ席に2人いたら、黙って片方を消さずに知らせる', () => {
  const chart = chartOf({
    students: [
      { student_id: 'A', name: '見本 あおい', days: ALL },
      { student_id: 'B', name: '見本 はると', days: ALL },
    ],
    seats: [
      { student_id: 'A', row: 1, col: 1 },
      { student_id: 'B', row: 1, col: 1 },
    ],
    asof: 'x',
  });
  const g = gridOf(chart, '月');
  assert.equal(g.conflicts.length, 1);
  assert.deepEqual(g.conflicts[0], {
    row: 1, col: 1, kept: '見本 あおい', hidden: '見本 はると',
  });
  assert.equal(g.cells[0][0].conflict, true);
  assert.equal(g.cells[0][0].student.name, '見本 あおい', '先に入れた人を消している');
  // ★表に出せなかった人の名前が必ず残ること（誰も黙って消えない）
  assert.equal(g.conflicts[0].hidden, '見本 はると');
});

test('★名簿に無い学籍番号の席は、位置つきで残して「空席」に見せない', () => {
  const chart = chartOf({
    students: [{ student_id: 'A', name: '見本 あおい', days: ALL }],
    seats: [
      { student_id: 'A', row: 1, col: 1 },
      { student_id: 'NOBODY', row: 1, col: 2 },
    ],
    asof: 'x',
  });
  const g = gridOf(chart, '月');
  assert.deepEqual(g.orphans, [{ row: 1, col: 2 }]);
  assert.equal(g.cells[0][1].student, null);
  assert.equal(g.cells[0][1].orphan, true, '空席と同じ見た目になってしまう');
  // ほかのマスは空席のまま
  assert.equal(g.cells[0][2].orphan, false);
});

test('その曜日に来ない人の席も、名簿に居るなら「？」にはしない', () => {
  const chart = chartOf({
    students: [{ student_id: 'A', name: '見本 あおい', days: MON_ONLY }],
    seats: [{ student_id: 'A', row: 1, col: 1 }],
    asof: 'x',
  });
  const g = gridOf(chart, '火');
  assert.equal(g.cells[0][0].student, null);
  assert.equal(g.cells[0][0].orphan, false);
});

// ── 席を動かす ────────────────────────────────────────────────────

test('空いている席へ移せる。★元の配列は変えない', () => {
  const seats = [{ student_id: 'A', row: 1, col: 1 }];
  const next = moveSeat(seats, 'A', { row: 2, col: 2 });
  assert.deepEqual(next, [{ student_id: 'A', row: 2, col: 2 }]);
  assert.deepEqual(seats, [{ student_id: 'A', row: 1, col: 1 }], '元の配列が書き換わっている');
});

test('人がいる席へ移すと入れ替わる（押し出して消さない）', () => {
  const seats = [
    { student_id: 'A', row: 1, col: 1 },
    { student_id: 'B', row: 2, col: 2 },
  ];
  const next = moveSeat(seats, 'A', { row: 2, col: 2 });
  assert.equal(next.length, 2);
  assert.deepEqual(next.find((s) => s.student_id === 'A'), { student_id: 'A', row: 2, col: 2 });
  assert.deepEqual(next.find((s) => s.student_id === 'B'), { student_id: 'B', row: 1, col: 1 });
});

test('席を持っていない人を空席に置ける（編入した人の席を決める）', () => {
  const seats = [{ student_id: 'A', row: 1, col: 1 }];
  const next = moveSeat(seats, 'Z', { row: 3, col: 3 });
  assert.equal(next.length, 2);
  assert.deepEqual(next[1], { student_id: 'Z', row: 3, col: 3 });
});

test('席を持っていない人を、人のいる席に置いても相手を消さない', () => {
  const seats = [{ student_id: 'A', row: 1, col: 1 }];
  const next = moveSeat(seats, 'Z', { row: 1, col: 1 });
  assert.equal(next.length, 2);
  assert.equal(next.filter((s) => s.student_id === 'A').length, 1);
});

test('同じ席に置き直しても何も起きない', () => {
  const seats = [{ student_id: 'A', row: 1, col: 1 }];
  assert.equal(moveSeat(seats, 'A', { row: 1, col: 1 }), seats);
});

// ── その他 ────────────────────────────────────────────────────────

test('土日は曜日が無い（月〜金しか無い）', () => {
  assert.equal(weekdayOf(new Date(2026, 8, 14)), '月');
  assert.equal(weekdayOf(new Date(2026, 8, 17)), '木');
  assert.equal(weekdayOf(new Date(2026, 8, 18)), '金');
  assert.equal(weekdayOf(new Date(2026, 8, 19)), null);   // 土
  assert.equal(weekdayOf(new Date(2026, 8, 20)), null);   // 日
  assert.equal(weekdayOf(new Date(2026, 8, 21)), '月');
});

test('★氏名は姓と名で行を分ける（名前の途中で切れると遠くから読めない）', () => {
  assert.deepEqual(nameLines('見本 あおい'), ['見本', 'あおい']);
  assert.deepEqual(nameLines('見本　あおい'), ['見本', 'あおい']);   // 全角の空白
  assert.deepEqual(nameLines('  見本   あおい  '), ['見本', 'あおい']);
  assert.deepEqual(nameLines('ひとつなぎ'), ['ひとつなぎ'], '空白が無いのに切っている');
  assert.deepEqual(nameLines(''), ['']);
  assert.deepEqual(nameLines('見本 あおい すみれ'), ['見本', 'あおい すみれ'], '2回以上は割らない');
});

test('★伏せるまでの時間は1か所の定数で決まっている（既定5分）', () => {
  assert.equal(SEAT_MASK_IDLE_MS, 5 * 60 * 1000);
});


// ============================================================================
// ★契約 v4：seats が曜日をキーにした入れ物になった
// ============================================================================

test('★v4：seats が曜日ごとの入れ物でも読める', () => {
  const chart = chartOf({
    students: [
      { student_id: 'A', name: '見本 あおい', days: ALL },
      { student_id: 'B', name: '見本 はると', days: ALL },
    ],
    grid: { rows: 4, cols: 7 },
    seats: {
      月: [{ student_id: 'A', row: 1, col: 1 }],
      火: [{ student_id: 'B', row: 4, col: 7 }],
      水: [],
      木: [],
      金: [],
    },
    asof: 'x',
  });
  assert.deepEqual(chart.seatsByDay['月'], [{ student_id: 'A', row: 1, col: 1 }]);
  assert.deepEqual(chart.seatsByDay['火'], [{ student_id: 'B', row: 4, col: 7 }]);
  assert.deepEqual(chart.seatsByDay['水'], []);
  assert.equal(gridOf(chart, '月').cells[0][0].student.name, '見本 あおい');
  assert.equal(gridOf(chart, '火').cells[3][6].student.name, '見本 はると');
});

test('★v4：ある曜日がまるごと空でも、マス目は描ける（空席が消えない）', () => {
  const chart = chartOf({
    students: [{ student_id: 'A', name: '見本 あおい', days: ALL }],
    grid: { rows: 4, cols: 7 },
    seats: { 月: [], 火: [], 水: [], 木: [], 金: [] },
    asof: 'x',
  });
  const g = gridOf(chart, '水');
  assert.equal(g.cells.flat().length, 28, '席が0件だとマス目が消えている');
  assert.equal(g.unseated.length, 1, '登校するのに席が無い人が出ていない');
});

test('★seats が配列でも入れ物でもなければ採らない（黙って0件にしない）', () => {
  assert.equal(normalizeSeatChart({ students: [], seats: 'なし', asof: 'x' }).reason, 'noSeats');
  assert.equal(normalizeSeatChart({ students: [], asof: 'x' }).reason, 'noSeats');
});
