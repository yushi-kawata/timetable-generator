/* ============================================================================
   座席の決まりごとと自動配置の試験 ── 台帳 A4-107
   ============================================================================
   守ること:
     ・「近い」＝隣接8方向。1席でも空けば離れたとみなす
     ・決まりごとは曜日によらない。変わるのは「その日に誰が来るか」だけ
     ・★解が無いときに黙って諦めない。どれが衝突しているかを人の名前で出す
     ・★学籍番号を文面に出さない（名前が分からなければ言い換える）
     ・いまの席は、決まりごとに反しない限り動かさない
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const {
  normalizeConstraints,
  isAdjacent,
  findViolations,
  findContradictions,
  checkSoftWishes,
  constraintIssues,
  countConstraints,
  autoAssign,
  EMPTY_CONSTRAINTS,
} = await loadTs('src/lib/seatAssign.ts');

/** 試験で使う決まりごとの器（5種別ぶん揃える） */
function rules(part) {
  return { fixed: [], forbidden: [], apart: [], near: [], rightward: [], ...part };
}

const ROWS = 4;
const COLS = 7;
const NAMES = {
  A: '見本 あおい',
  B: '見本 はると',
  C: '見本 さくらこ',
  D: '見本 りく',
};

function seatsOf(result) {
  const m = {};
  for (const s of result.seats) m[s.student_id] = s.row + '/' + s.col;
  return m;
}

// ── 決まりごとの取り込み ──────────────────────────────────────────

test('決まりごとが無くても落ちない（窓口がまだ返していない段階）', () => {
  assert.deepEqual(normalizeConstraints(undefined), EMPTY_CONSTRAINTS);
  assert.deepEqual(normalizeConstraints(null), EMPTY_CONSTRAINTS);
  assert.deepEqual(normalizeConstraints({}), EMPTY_CONSTRAINTS);
  assert.deepEqual(normalizeConstraints({ fixed: 'x', apart: 3 }), EMPTY_CONSTRAINTS);
});

test('壊れた決まりごとは落とす（自分と自分・0番の席・空の番号）', () => {
  const c = normalizeConstraints({
    fixed: [
      { student_id: 'A', row: 1, col: 1 },
      { student_id: 'A', row: 2, col: 2 },   // 1人に固定席は1つ
      { student_id: '', row: 1, col: 1 },
      { student_id: 'B', row: 0, col: 1 },
    ],
    forbidden: [
      { student_id: 'B', row: 1, col: 1 },
      { student_id: 'B', row: 1, col: 1 },   // 同じものは1つ
    ],
    apart: [
      { a: 'A', b: 'A' },                    // 自分とは離せない
      { a: 'A', b: 'B' },
      { a: 'B', b: 'A' },                    // 向きが逆でも同じ1本
      { a: 'C', b: '' },
    ],
  });
  assert.deepEqual(c.fixed, [{ student_id: 'A', row: 1, col: 1 }]);
  assert.equal(c.forbidden.length, 1);
  assert.deepEqual(c.apart, [{ a: 'A', b: 'B' }]);
});

// ── 隣接8方向 ─────────────────────────────────────────────────────

test('★「近い」は隣接8方向。1席でも空けば離れている', () => {
  const o = { row: 2, col: 2 };
  // 前後・左右・斜めの8つ
  for (const p of [
    { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
    { row: 2, col: 1 }, { row: 2, col: 3 },
    { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
  ]) {
    assert.equal(isAdjacent(o, p), true, JSON.stringify(p) + ' を隣と見ていない');
  }
  // 1つ空ければ離れている
  assert.equal(isAdjacent(o, { row: 2, col: 4 }), false);
  assert.equal(isAdjacent(o, { row: 4, col: 2 }), false);
  assert.equal(isAdjacent(o, { row: 4, col: 4 }), false);
  // 同じ席は「隣」ではない
  assert.equal(isAdjacent(o, o), false);
});

// ── いまの並びの検査 ──────────────────────────────────────────────

test('★違反はどれも人の名前で言い切る（固定席・禁止席・引き離し）', () => {
  const v = findViolations({
    placed: [
      { student_id: 'A', row: 2, col: 2 },
      { student_id: 'B', row: 2, col: 3 },
      { student_id: 'C', row: 4, col: 7 },
    ],
    constraints: {
      fixed: [{ student_id: 'C', row: 1, col: 1 }],
      forbidden: [{ student_id: 'A', row: 2, col: 2 }],
      apart: [{ a: 'A', b: 'B' }],
    },
    attendees: ['A', 'B', 'C'],
    names: NAMES,
  });
  assert.equal(v.length, 3);
  const kinds = v.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ['apart', 'fixed', 'forbidden']);
  for (const x of v) {
    assert.ok(x.message.includes('見本'), '名前が出ていない: ' + x.message);
    assert.ok(x.cells.length >= 1, '赤くするマスが無い');
  }
  const apart = v.find((x) => x.kind === 'apart');
  assert.ok(apart.message.includes('見本 あおい') && apart.message.includes('見本 はると'));
  assert.equal(apart.cells.length, 2);
});

test('★その曜日に来ない人の指定は違反にしない（決まりごとは曜日によらないが、人は来ない）', () => {
  const v = findViolations({
    placed: [
      { student_id: 'A', row: 2, col: 2 },
      { student_id: 'B', row: 2, col: 3 },
    ],
    constraints: { fixed: [], forbidden: [], apart: [{ a: 'A', b: 'B' }] },
    attendees: ['A'],                       // B は今日来ない
    names: NAMES,
  });
  assert.deepEqual(v, []);
});

test('決まりごとを満たしていれば違反は出ない', () => {
  const v = findViolations({
    placed: [
      { student_id: 'A', row: 1, col: 1 },
      { student_id: 'B', row: 1, col: 3 },  // 1つ空いている
    ],
    constraints: { fixed: [], forbidden: [], apart: [{ a: 'A', b: 'B' }] },
    attendees: ['A', 'B'],
    names: NAMES,
  });
  assert.deepEqual(v, []);
});

test('★学籍番号を文面に出さない（名簿に無い人は言い換える）', () => {
  const v = findViolations({
    placed: [
      { student_id: '25100616', row: 1, col: 1 },
      { student_id: '25100733', row: 1, col: 2 },
    ],
    constraints: { fixed: [], forbidden: [], apart: [{ a: '25100616', b: '25100733' }] },
    attendees: ['25100616', '25100733'],
    names: {},
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].message.includes('25100616'), false, '学籍番号が画面に出る文になっている');
  assert.ok(v[0].message.includes('（名簿に無い人）'));
});

// ── 自動で並べる ──────────────────────────────────────────────────

test('決まりごとが無ければ、その日の登校者が全員座る', () => {
  const r = autoAssign({
    attendees: ['A', 'B', 'C', 'D'],
    constraints: EMPTY_CONSTRAINTS,
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, true);
  assert.equal(r.seats.length, 4);
  const cells = new Set(r.seats.map((s) => s.row + '/' + s.col));
  assert.equal(cells.size, 4, '同じ席に2人置いている');
});

test('★固定席は必ず守られる', () => {
  const r = autoAssign({
    attendees: ['A', 'B'],
    constraints: { fixed: [{ student_id: 'B', row: 3, col: 5 }], forbidden: [], apart: [] },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, true);
  assert.equal(seatsOf(r).B, '3/5');
});

test('★禁止席には置かない', () => {
  const forbidden = [];
  for (let c = 1; c <= COLS; c++) forbidden.push({ student_id: 'A', row: 1, col: c });
  const r = autoAssign({
    attendees: ['A'],
    constraints: { fixed: [], forbidden, apart: [] },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, true);
  assert.notEqual(r.seats[0].row, 1, '禁止した1列目に置いている');
});

test('★引き離しは隣接8方向で守られる', () => {
  const r = autoAssign({
    attendees: ['A', 'B'],
    constraints: { fixed: [], forbidden: [], apart: [{ a: 'A', b: 'B' }] },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, true);
  const m = seatsOf(r);
  const [ar, ac] = m.A.split('/').map(Number);
  const [br, bc] = m.B.split('/').map(Number);
  assert.equal(isAdjacent({ row: ar, col: ac }, { row: br, col: bc }), false);
});

// ── ★毎回ちがう案が出ること（もとの「水曜日①②」の代わり）──────────

test('★同じ種なら同じ案に戻せる（さっきの案に戻したい、に応える）', () => {
  const mk = (seed) => autoAssign({
    attendees: ['A', 'B', 'C', 'D'],
    constraints: EMPTY_CONSTRAINTS,
    rows: ROWS, cols: COLS, names: NAMES, seed,
  });
  assert.deepEqual(seatsOf(mk(7)), seatsOf(mk(7)));
  assert.equal(mk(7).seed, 7);
});

test('★種を変えれば別の案が出る（毎回同じだとつまらない、が元の不満）', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const r = autoAssign({
      attendees: ['A', 'B', 'C', 'D'],
      constraints: EMPTY_CONSTRAINTS,
      rows: ROWS, cols: COLS, names: NAMES, seed,
    });
    assert.equal(r.ok, true);
    seen.add(JSON.stringify(seatsOf(r)));
  }
  assert.ok(seen.size >= 5, '8回の種で ' + seen.size + ' 通りしか出ていない（決まりきった案になっている）');
});

test('★いま使っている配置となるべく違う案を出す', () => {
  const avoid = [
    { student_id: 'A', row: 1, col: 1 },
    { student_id: 'B', row: 1, col: 2 },
    { student_id: 'C', row: 1, col: 3 },
    { student_id: 'D', row: 1, col: 4 },
  ];
  let sameSeatTotal = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = autoAssign({
      attendees: ['A', 'B', 'C', 'D'],
      constraints: EMPTY_CONSTRAINTS,
      rows: ROWS, cols: COLS, names: NAMES, avoid, seed,
    });
    assert.equal(r.ok, true);
    const m = seatsOf(r);
    for (const a of avoid) {
      if (m[a.student_id] === a.row + '/' + a.col) sameSeatTotal++;
    }
  }
  assert.equal(sameSeatTotal, 0, '前と同じ席に座り続けている人がいる');
});

test('★何人が動いたかを返す（似た案に気づけるように）', () => {
  const avoid = [
    { student_id: 'A', row: 1, col: 1 },
    { student_id: 'B', row: 3, col: 5 },
  ];
  const r = autoAssign({
    attendees: ['A', 'B'],
    constraints: EMPTY_CONSTRAINTS,
    rows: ROWS, cols: COLS, names: NAMES, avoid, seed: 3,
  });
  assert.equal(r.ok, true);
  assert.equal(r.moved, 2);
});

test('★固定席の人は、案を出し直しても動かない（動かないのが正しい）', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const r = autoAssign({
      attendees: ['A', 'B', 'C'],
      constraints: { fixed: [{ student_id: 'A', row: 2, col: 4 }], forbidden: [], apart: [] },
      rows: ROWS, cols: COLS, names: NAMES,
      avoid: [{ student_id: 'A', row: 2, col: 4 }],
      seed,
    });
    assert.equal(r.ok, true);
    assert.equal(seatsOf(r).A, '2/4', '固定席の人が動いている');
  }
});

test('★別の案でも決まりごとは必ず守られる（変化より決まりごとが優先）', () => {
  const attendees = ['A', 'B', 'C', 'D'];
  const constraints = {
    fixed: [{ student_id: 'D', row: 1, col: 1 }],
    forbidden: [{ student_id: 'A', row: 4, col: 7 }],
    apart: [{ a: 'A', b: 'B' }, { a: 'B', b: 'C' }],
  };
  for (let seed = 1; seed <= 10; seed++) {
    const r = autoAssign({ attendees, constraints, rows: ROWS, cols: COLS, names: NAMES, seed });
    assert.equal(r.ok, true, '種 ' + seed + ' で解が出ない');
    const v = findViolations({ placed: r.seats, constraints, attendees, names: NAMES });
    assert.deepEqual(v, [], '種 ' + seed + ' の案が決まりごとに違反している');
  }
});

test('並べた結果が、自分の検査で違反ゼロになる（込み入った指定でも）', () => {
  const attendees = ['A', 'B', 'C', 'D'];
  const constraints = {
    fixed: [{ student_id: 'D', row: 1, col: 1 }],
    forbidden: [
      { student_id: 'A', row: 1, col: 2 },
      { student_id: 'A', row: 1, col: 3 },
      { student_id: 'B', row: 4, col: 7 },
    ],
    apart: [{ a: 'A', b: 'B' }, { a: 'B', b: 'C' }],
  };
  const r = autoAssign({ attendees, constraints, rows: ROWS, cols: COLS, names: NAMES });
  assert.equal(r.ok, true);
  const v = findViolations({ placed: r.seats, constraints, attendees, names: NAMES });
  assert.deepEqual(v, [], '自分で並べた結果が自分の検査に落ちる');
});

// ── ★解が無いときに黙って諦めない ────────────────────────────────

test('★同じ席に2人を固定したら、2人の名前を出して止める', () => {
  const r = autoAssign({
    attendees: ['A', 'B'],
    constraints: {
      fixed: [
        { student_id: 'A', row: 2, col: 2 },
        { student_id: 'B', row: 2, col: 2 },
      ],
      forbidden: [], apart: [],
    },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'contradiction');
  assert.equal(r.reasons.length > 0, true, '理由が空だと先生は直せない');
  const all = r.reasons.join(' ');
  assert.ok(all.includes('見本 あおい') && all.includes('見本 はると'));
  assert.ok(all.includes('2列目2番'));
});

test('★固定席が禁止席と食い違っていたら名指しで止める', () => {
  const r = autoAssign({
    attendees: ['A'],
    constraints: {
      fixed: [{ student_id: 'A', row: 1, col: 1 }],
      forbidden: [{ student_id: 'A', row: 1, col: 1 }],
      apart: [],
    },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'contradiction');
  assert.ok(r.reasons.join(' ').includes('見本 あおい'));
});

test('★離す指定の2人が固定席で隣り合っていたら名指しで止める', () => {
  const r = autoAssign({
    attendees: ['A', 'B'],
    constraints: {
      fixed: [
        { student_id: 'A', row: 2, col: 2 },
        { student_id: 'B', row: 2, col: 3 },
      ],
      forbidden: [],
      apart: [{ a: 'A', b: 'B' }],
    },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'contradiction');
  const all = r.reasons.join(' ');
  assert.ok(all.includes('見本 あおい') && all.includes('見本 はると'));
  assert.ok(all.includes('離す'));
});

test('★席より人が多ければ、人数を出して止める', () => {
  const attendees = [];
  for (let i = 0; i < 29; i++) attendees.push('S' + i);
  const r = autoAssign({
    attendees, constraints: EMPTY_CONSTRAINTS, rows: ROWS, cols: COLS, names: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'contradiction');
  assert.ok(r.reasons.join(' ').includes('29'));
  assert.ok(r.reasons.join(' ').includes('28'));
});

test('★教室の外を固定席にしていたら名指しで止める', () => {
  const r = autoAssign({
    attendees: ['A'],
    constraints: { fixed: [{ student_id: 'A', row: 9, col: 9 }], forbidden: [], apart: [] },
    rows: ROWS, cols: COLS, names: NAMES,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'contradiction');
  assert.ok(r.reasons.join(' ').includes('教室の外'));
});

test('★矛盾の形でなくても、置けないときは詰まった人を名指しする', () => {
  // 3×1 の細長い教室に、互いに離したい3人＝どう置いても隣り合う
  const r = autoAssign({
    attendees: ['A', 'B', 'C'],
    constraints: {
      fixed: [], forbidden: [],
      apart: [{ a: 'A', b: 'B' }, { a: 'B', b: 'C' }, { a: 'A', b: 'C' }],
    },
    rows: 3, cols: 1, names: NAMES,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'noSolution');
  assert.ok(r.reasons.length > 0);
  assert.ok(r.reasons.join(' ').includes('見本'), '誰のことか分からない理由になっている');
});

test('矛盾が無いときは findContradictions が空を返す', () => {
  assert.deepEqual(
    findContradictions({
      attendees: ['A', 'B'],
      constraints: { fixed: [{ student_id: 'A', row: 1, col: 1 }], forbidden: [], apart: [{ a: 'A', b: 'B' }] },
      rows: ROWS, cols: COLS, names: NAMES,
    }),
    [],
  );
});

test('26人を4行7列に並べても一瞬で解ける（総当たりが暴れない）', () => {
  const attendees = [];
  for (let i = 0; i < 26; i++) attendees.push('S' + i);
  const apart = [];
  for (let i = 0; i + 1 < 10; i += 2) apart.push({ a: 'S' + i, b: 'S' + (i + 1) });
  const t0 = Date.now();
  const r = autoAssign({
    attendees,
    constraints: { fixed: [{ student_id: 'S0', row: 1, col: 1 }], forbidden: [], apart },
    rows: ROWS, cols: COLS, names: {},
  });
  const ms = Date.now() - t0;
  assert.equal(r.ok, true);
  assert.equal(r.seats.length, 26);
  assert.ok(ms < 1000, '遅すぎる: ' + ms + 'ms');
});


// ============================================================================
// ★【希望】近づけたい・右寄せ（2026-09-18 追加。絶対とは扱いが違う）
// ============================================================================

test('★近づけたい・右寄せは【希望】＝満たせなくても配置は出す', () => {
  // わざと叶わない形：離す指定と近づけたい指定が同じ人に同時にかかる
  const r = autoAssign({
    attendees: ['A', 'B', 'C'],
    constraints: rules({
      // A と B は絶対に離す。C は A に近づけたいが、席は 3x1 しかない
      apart: [{ a: 'A', b: 'B' }],
      near: [{ a: 'A', b: 'C' }],
    }),
    rows: 3, cols: 1, names: NAMES, seed: 1,
  });
  // ★絶対（離す）は守られ、配置そのものは出る
  assert.equal(r.ok, true, '希望が叶わないだけで配置を出さないのは誤り');
  const v = findViolations({
    placed: r.seats,
    constraints: rules({ apart: [{ a: 'A', b: 'B' }] }),
    attendees: ['A', 'B', 'C'],
    names: NAMES,
  });
  assert.deepEqual(v, [], '絶対の決まりごとが破られている');
});

test('★叶わなかった希望は黙って捨てず、名前つきで持ち帰る', () => {
  const soft = checkSoftWishes({
    placed: [
      { student_id: 'A', row: 1, col: 1 },
      { student_id: 'B', row: 4, col: 7 },
    ],
    constraints: rules({ near: [{ a: 'A', b: 'B' }] }),
    attendees: ['A', 'B'],
    names: NAMES,
    cols: COLS,
  });
  assert.equal(soft.nearTotal, 1);
  assert.equal(soft.nearMet, 0);
  assert.equal(soft.nearUnmetMessages.length, 1);
  assert.ok(soft.nearUnmetMessages[0].includes('見本 あおい'));
  assert.ok(soft.nearUnmetMessages[0].includes('見本 はると'));
});

test('近づけたいが叶っていれば、叶ったと数える', () => {
  const soft = checkSoftWishes({
    placed: [
      { student_id: 'A', row: 2, col: 2 },
      { student_id: 'B', row: 2, col: 3 },
    ],
    constraints: rules({ near: [{ a: 'A', b: 'B' }] }),
    attendees: ['A', 'B'],
    names: NAMES,
    cols: COLS,
  });
  assert.equal(soft.nearMet, 1);
  assert.deepEqual(soft.nearUnmetMessages, []);
});

test('★その日に来ない人が入る希望は数に入れない（叶わなかった扱いにしない）', () => {
  const soft = checkSoftWishes({
    placed: [{ student_id: 'A', row: 1, col: 1 }],
    constraints: rules({ near: [{ a: 'A', b: 'B' }] }),
    attendees: ['A'],
    names: NAMES,
    cols: COLS,
  });
  assert.equal(soft.nearTotal, 0);
  assert.deepEqual(soft.nearUnmetMessages, []);
});

test('★同じ2人に「離す」と「近づけたい」が両方あれば、離すを採る（絶対が優先）', () => {
  const c = normalizeConstraints({
    apart: [{ a: 'A', b: 'B' }],
    near: [{ a: 'B', b: 'A' }],
  });
  assert.equal(c.apart.length, 1);
  assert.deepEqual(c.near, [], '絶対と希望が同居している');
});

test('★実データの形で解ける：固定席2・引き離し6（三角あり）・近づけたい3（ハブ）', () => {
  // 実際の指定と同じ構造。氏名は使わない（学籍番号の代わりの記号）
  const attendees = [];
  for (let i = 1; i <= 17; i++) attendees.push('S' + i);
  const constraints = rules({
    fixed: [
      { student_id: 'S1', row: 2, col: 1 },
      { student_id: 'S2', row: 4, col: 2 },
    ],
    // ★S3 が3組に登場＝三角（S3-S4, S3-S5, S4-S5）＋ ほかに3組
    apart: [
      { a: 'S3', b: 'S4' },
      { a: 'S3', b: 'S5' },
      { a: 'S4', b: 'S5' },
      { a: 'S6', b: 'S7' },
      { a: 'S8', b: 'S9' },
      { a: 'S10', b: 'S3' },
    ],
    // ★S11 が3組すべてに登場＝ハブ。その S11 は引き離しにも入っていない形に近い
    near: [
      { a: 'S11', b: 'S12' },
      { a: 'S11', b: 'S13' },
      { a: 'S11', b: 'S14' },
    ],
    rightward: ['S15', 'S16', 'S17'],
  });

  const r = autoAssign({ attendees, constraints, rows: ROWS, cols: COLS, names: {}, seed: 5 });
  assert.equal(r.ok, true, '実データの形で解が出ない');

  // 絶対はすべて守られている
  const v = findViolations({ placed: r.seats, constraints, attendees, names: {} });
  assert.deepEqual(v, [], '絶対の決まりごとが破られている');

  // 固定席は指定どおり
  const m = seatsOf(r);
  assert.equal(m.S1, '2/1');
  assert.equal(m.S2, '4/2');

  // ★三角の3人は互いに隣り合っていない
  const pos = (id) => {
    const [row, col] = m[id].split('/').map(Number);
    return { row, col };
  };
  assert.equal(isAdjacent(pos('S3'), pos('S4')), false);
  assert.equal(isAdjacent(pos('S3'), pos('S5')), false);
  assert.equal(isAdjacent(pos('S4'), pos('S5')), false);

  // 希望は「できる限り」。叶った数を持ち帰っていること
  assert.equal(r.soft.nearTotal, 3);
  assert.ok(r.soft.nearMet >= 0 && r.soft.nearMet <= 3);
});

test('★ハブの3人は、席に余裕があれば実際に寄る（希望が効いている）', () => {
  const attendees = ['H', 'N1', 'N2', 'N3', 'X1', 'X2'];
  const constraints = rules({
    near: [
      { a: 'H', b: 'N1' },
      { a: 'H', b: 'N2' },
      { a: 'H', b: 'N3' },
    ],
  });
  let bestMet = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const r = autoAssign({ attendees, constraints, rows: ROWS, cols: COLS, names: {}, seed });
    assert.equal(r.ok, true);
    bestMet = Math.max(bestMet, r.soft.nearMet);
  }
  assert.equal(bestMet, 3, '隣接8方向に3人ぶんの空きがあるのに寄せられていない');
});

test('★右寄せは、ほかに縛りが無ければ右側に寄る', () => {
  const attendees = ['R1', 'R2', 'R3'];
  const constraints = rules({ rightward: ['R1', 'R2', 'R3'] });
  let best = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const r = autoAssign({ attendees, constraints, rows: ROWS, cols: COLS, names: {}, seed });
    assert.equal(r.ok, true);
    best = Math.max(best, r.soft.rightMet);
  }
  assert.equal(best, 3, '右寄せがまったく効いていない');
});

test('★右寄せより、近づけたいのほうが強い', () => {
  // R は右へ寄せたいが、H の近くにも置きたい。H は左端に固定
  const attendees = ['H', 'R'];
  const constraints = rules({
    fixed: [{ student_id: 'H', row: 1, col: 1 }],
    near: [{ a: 'H', b: 'R' }],
    rightward: ['R'],
  });
  const r = autoAssign({ attendees, constraints, rows: ROWS, cols: COLS, names: {}, seed: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.soft.nearMet, 1, '弱い希望（右寄せ）が強い希望（近づけたい）を押しのけている');
});


// ============================================================================
// ★契約 v4 の実物どおりに読めるか（2026-09-18 裏側の v4 で確認した形）
// ============================================================================

test('★v4 の実物の形（student_id / student_id2・英語 type）をそのまま読める', () => {
  const c = normalizeConstraints([
    { type: 'fixed', student_id: '99999001', row: 2, col: 1 },
    { type: 'banned', student_id: '99999002', row: 4, col: 7 },
    { type: 'apart', student_id: '99999001', student_id2: '99999002' },
    { type: 'near', student_id: '99999003', student_id2: '99999004' },
    { type: 'rightside', student_id: '99999003' },
  ]);
  assert.deepEqual(c.fixed, [{ student_id: '99999001', row: 2, col: 1 }]);
  assert.deepEqual(c.forbidden, [{ student_id: '99999002', row: 4, col: 7 }]);
  assert.deepEqual(c.apart, [{ a: '99999001', b: '99999002' }]);
  assert.deepEqual(c.near, [{ a: '99999003', b: '99999004' }]);
  assert.deepEqual(c.rightward, ['99999003']);
});

test('★知らない種別・項目の足りない行は、黙って捨てずに数える', () => {
  const raw = [
    { type: 'fixed', student_id: '99999001', row: 2, col: 1 },
    { type: 'sideways', student_id: '99999002' },   // 知らない種別
    { type: 'apart', student_id: '99999003' },      // 相手がいない
    { type: 'near' },                               // 空
  ];
  const c = normalizeConstraints(raw);
  assert.equal(c.fixed.length, 1);
  assert.equal(c.apart.length, 0);
  const issues = constraintIssues(raw);
  assert.equal(issues.length, 1);
  assert.ok(issues[0].includes('3 件'), issues[0]);
});

test('決まりごとが1件も無ければ知らせも出ない', () => {
  assert.deepEqual(constraintIssues([]), []);
  assert.deepEqual(constraintIssues(undefined), []);
});

test('★件数を数えられる（0件が「指定なし」か「読めていない」かを見分けるため）', () => {
  const c = normalizeConstraints([
    { type: 'fixed', student_id: '99999001', row: 2, col: 1 },
    { type: 'apart', student_id: '99999001', student_id2: '99999002' },
    { type: 'rightside', student_id: '99999003' },
  ]);
  assert.equal(countConstraints(c), 3);
  assert.equal(countConstraints(EMPTY_CONSTRAINTS), 0);
});
