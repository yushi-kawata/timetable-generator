// ============================================================================
// 座席の決まりごとと、自動で並べる処理 ── 台帳 A4-107
// ============================================================================
// ★★席を「どこに置くか」を決める処理は、このファイルだけに置くこと。
//   画面（SeatChartPage / SeatGridView）は結果を描くだけ。
//   buildSeatGrid（seatChart.ts）は【並べ終わったものを表に流し込む】係で、
//   置き場所の判断はしません。役割を混ぜないこと。
//
// ★runtime の import を持たせないこと（型の import だけ）。
//   試験の読み込み器（tests/_load-ts.mjs）が単体で変換して読むため。
//
// 決まりごとは4種類＋弱い希望が1つ（2026-09-18 社長決裁）:
//   【絶対】固定席   … この生徒はこの席でなければならない
//   【絶対】禁止席   … この生徒はこの席はだめ
//   【絶対】引き離し … この2人は近いとだめ
//   【希望】近づけたい … この2人はできる限り近くに
//   【弱い希望】右寄せ … この生徒はできる限り列の番号が大きいほう（窓側）へ
//
// ★「近い」＝隣接8方向（前後・左右・斜め）。1席でも空けば離れたとみなす。
// ★決まりごとは曜日によらない（その生徒の性質）。変わるのは「その日に誰が来るか」だけ。
//
// ★★【絶対】と【希望】を混ぜないこと。
//   ・絶対を満たせないときは配置を出さず、衝突を名指しする
//   ・希望は満たせない日があっても配置は出す
//     （1人のまわりに3人を寄せる指定なので、欠席や固定席との兼ね合いで
//       満たせない日が必ず出ます。絶対にすると解が消えます）
//   ・満たせなかった希望は【黙って捨てず】、満たせなかったと画面に出す
//
// ★右寄せは「列の番号が大きいほうへ寄せる」という位置の希望としてだけ扱います。
//   ★性別など、なぜ寄せたいのかの理由はこのシステムが持ちません（社長決裁 A-1）。
//     ここにも画面にも、その種の語を書かないこと。
//
// ★★解が無いときに黙って諦めないこと。
//   どの決まりごとが衝突しているのかを、人の名前で言い切る。
//   「配置できませんでした」だけでは、先生は直しようがない。

export type SeatPos = { row: number; col: number };

/** この生徒はこの席でなければならない */
export type FixedRule = { student_id: string; row: number; col: number };
/** この生徒はこの席はだめ */
export type ForbiddenRule = { student_id: string; row: number; col: number };
/** この2人は近いとだめ（絶対） */
export type ApartRule = { a: string; b: string };
/** この2人はできる限り近くに（希望） */
export type NearRule = { a: string; b: string };

export type SeatConstraints = {
  fixed: FixedRule[];
  forbidden: ForbiddenRule[];
  apart: ApartRule[];
  /** 【希望】できる限り隣接8方向に置きたい組 */
  near: NearRule[];
  /** 【弱い希望】できる限り列の番号が大きいほうへ寄せたい生徒 */
  rightward: string[];
};

export const EMPTY_CONSTRAINTS: SeatConstraints = {
  fixed: [], forbidden: [], apart: [], near: [], rightward: [],
};

/** 総当たりの打ち切り。★無限に探し続けて画面を固めないための上限 */
export const ASSIGN_STEP_LIMIT = 200000;

/**
 * 1回の「並べる」で作ってみる案の数。
 * ★【絶対】を満たす案をこれだけ作り、その中から【希望】がいちばん叶うものを選びます。
 *   希望を探索そのものに混ぜると、「希望のせいで解が出ない」が起きるため。
 */
export const ASSIGN_CANDIDATES = 12;

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asPos(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(asText(v));
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * 決まりごとを画面が扱える形に作り直す。
 * ★窓口がまだ返していない段階でも動くように、無ければ「無し」として扱う。
 *   ここで例外を投げないこと（決まりごとが無いだけで座席表が出なくなるのは筋が悪い）。
 * ★必要な鍵だけで作り直す（余計な列を持ち込まない）。
 */
/**
 * 決まりごとを画面が扱える形に作り直す。
 *
 * ★窓口（契約 v4）は【1本の配列】で返します。種別は type に英語で入ります:
 *     fixed（固定席）/ banned（禁止席）/ apart（引き離し）/
 *     near（近づけたい）/ rightside（右寄せ）
 *   ★シートの日本語が変わっても画面を直さずに済むよう、英語で受けます。
 *     ここで日本語を見ないこと。
 *
 * ★古い形（種別ごとのオブジェクト）でも読めるようにしてあります。
 *   裏側と画面の入れ替えがずれた瞬間に、決まりごとだけが黙って空になるのを防ぐためです。
 * ★窓口がまだ返していない段階でも動くように、無ければ「無し」として扱います。
 * ★必要な鍵だけで作り直す（余計な列を持ち込まない）。
 */
export function normalizeConstraints(raw: unknown): SeatConstraints {
  const buckets = toBuckets(raw);
  return fromBuckets(buckets);
}

/**
 * 2人組を読む。
 * ★正解は student_id / student_id2 です（2026-09-18 に裏側の実物 v4 で確認済み。
 *   裏側は out.push({type, student_id, student_id2}) を返します）。
 * ★a/b・student_a/student_b も読めるようにしてありますが、これは版がずれたときの
 *   保険です。【来るのは student_id / student_id2 の1つだけ】。
 */
function pairOf(o: Record<string, unknown>): { a: string; b: string } | null {
  const a = asText(o.student_id) || asText(o.a) || asText(o.student_a);
  const b = asText(o.student_id2) || asText(o.b) || asText(o.student_b);
  if (!a || !b || a === b) return null;
  return { a, b };
}

type RawBuckets = {
  fixed: FixedRule[];
  forbidden: ForbiddenRule[];
  apart: ApartRule[];
  near: NearRule[];
  rightward: string[];
  /** 読めなかった行の数（★黙って捨てないために数える） */
  unreadable: number;
};

function toBuckets(raw: unknown): RawBuckets {
  const out: RawBuckets = {
    fixed: [], forbidden: [], apart: [], near: [], rightward: [], unreadable: 0,
  };
  if (!raw) return out;

  // ── 契約 v4：1本の配列に type つきで入っている ──────────────────
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (!r || typeof r !== 'object') {
        out.unreadable++;
        continue;
      }
      const o = r as Record<string, unknown>;
      const type = asText(o.type).toLowerCase();
      const id = asText(o.student_id);
      const row = asPos(o.row);
      const col = asPos(o.col);

      if (type === 'fixed') {
        if (id && row !== null && col !== null) out.fixed.push({ student_id: id, row, col });
        else out.unreadable++;
      } else if (type === 'banned') {
        if (id && row !== null && col !== null) out.forbidden.push({ student_id: id, row, col });
        else out.unreadable++;
      } else if (type === 'apart') {
        const p = pairOf(o);
        if (p) out.apart.push(p);
        else out.unreadable++;
      } else if (type === 'near') {
        const p = pairOf(o);
        if (p) out.near.push(p);
        else out.unreadable++;
      } else if (type === 'rightside') {
        if (id) out.rightward.push(id);
        else out.unreadable++;
      } else {
        // ★知らない種別。勝手にどれかへ寄せない（数えて画面に出す）
        out.unreadable++;
      }
    }
    return out;
  }

  if (typeof raw !== 'object') return out;

  // ── 古い形：種別ごとのオブジェクト ──────────────────────────────
  const src = raw as Record<string, unknown>;
  if (Array.isArray(src.fixed)) {
    for (const r of src.fixed) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const id = asText(o.student_id);
      const row = asPos(o.row);
      const col = asPos(o.col);
      if (id && row !== null && col !== null) out.fixed.push({ student_id: id, row, col });
    }
  }
  for (const k of ['forbidden', 'banned'] as const) {
    if (!Array.isArray(src[k])) continue;
    for (const r of src[k] as unknown[]) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const id = asText(o.student_id);
      const row = asPos(o.row);
      const col = asPos(o.col);
      if (id && row !== null && col !== null) out.forbidden.push({ student_id: id, row, col });
    }
  }
  if (Array.isArray(src.apart)) {
    for (const r of src.apart) {
      if (!r || typeof r !== 'object') continue;
      const p = pairOf(r as Record<string, unknown>);
      if (p) out.apart.push(p);
    }
  }
  if (Array.isArray(src.near)) {
    for (const r of src.near) {
      if (!r || typeof r !== 'object') continue;
      const p = pairOf(r as Record<string, unknown>);
      if (p) out.near.push(p);
    }
  }
  for (const k of ['rightward', 'rightside'] as const) {
    if (!Array.isArray(src[k])) continue;
    for (const r of src[k] as unknown[]) {
      const id =
        typeof r === 'string'
          ? r.trim()
          : r && typeof r === 'object'
            ? asText((r as Record<string, unknown>).student_id)
            : '';
      if (id) out.rightward.push(id);
    }
  }
  return out;
}

function fromBuckets(b: RawBuckets): SeatConstraints {
  const fixed: FixedRule[] = [];
  const seenFixed = new Set<string>();
  for (const f of b.fixed) {
    if (seenFixed.has(f.student_id)) continue;   // 1人に固定席は1つ（先に書いた方を採る）
    seenFixed.add(f.student_id);
    fixed.push(f);
  }

  const forbidden: ForbiddenRule[] = [];
  const seenForbidden = new Set<string>();
  for (const f of b.forbidden) {
    const k = f.student_id + '/' + f.row + '/' + f.col;
    if (seenForbidden.has(k)) continue;
    seenForbidden.add(k);
    forbidden.push(f);
  }

  const pairKey = (r: { a: string; b: string }) => (r.a < r.b ? r.a + '/' + r.b : r.b + '/' + r.a);

  const apart: ApartRule[] = [];
  const seenApart = new Set<string>();
  for (const r of b.apart) {
    const k = pairKey(r);
    if (seenApart.has(k)) continue;              // 向きを問わず1本
    seenApart.add(k);
    apart.push(r);
  }

  const near: NearRule[] = [];
  const seenNear = new Set<string>();
  for (const r of b.near) {
    const k = pairKey(r);
    if (seenNear.has(k)) continue;
    // ★同じ2人に「離す」と「近づけたい」が両方あったら、離すを採る（絶対が優先）
    if (seenApart.has(k)) continue;
    seenNear.add(k);
    near.push(r);
  }

  const rightward: string[] = [];
  const seenRight = new Set<string>();
  for (const id of b.rightward) {
    if (seenRight.has(id)) continue;
    seenRight.add(id);
    rightward.push(id);
  }

  return { fixed, forbidden, apart, near, rightward };
}

/**
 * 読み取れなかった決まりごとの知らせ。
 * ★0件のときは空。★黙って捨てないために、画面に出すのが前提です。
 */
export function constraintIssues(raw: unknown): string[] {
  const b = toBuckets(raw);
  if (b.unreadable <= 0) return [];
  return [
    '決まりごとを ' + b.unreadable + ' 件、読み取れませんでした（知らない種別か、項目が足りません）。' +
      'その分は効いていません。',
  ];
}

/** 決まりごとの件数（★0件が「指定なし」なのか「読めていない」のかを見分けるため） */
export function countConstraints(c: SeatConstraints): number {
  return (
    (c.fixed?.length ?? 0) +
    (c.forbidden?.length ?? 0) +
    (c.apart?.length ?? 0) +
    (c.near?.length ?? 0) +
    (c.rightward?.length ?? 0)
  );
}

/** 隣接8方向（前後・左右・斜め）。同じ席は「隣」ではない */
export function isAdjacent(a: SeatPos, b: SeatPos): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  if (dr === 0 && dc === 0) return false;
  return dr <= 1 && dc <= 1;
}

export function posLabel(p: SeatPos): string {
  return p.row + '列目' + p.col + '番';
}

/** 名前が分からない番号を画面に出さないための言い換え（★学籍番号は出さない） */
function nameOf(names: Record<string, string>, id: string): string {
  return names[id] || '（名簿に無い人）';
}

// ============================================================================
// いまの並びが決まりごとに違反していないか
// ============================================================================

export type Violation = {
  kind: 'fixed' | 'forbidden' | 'apart';
  /** 赤くするマス */
  cells: SeatPos[];
  /** 画面にそのまま出す文（★誰のことか名前で言い切る） */
  message: string;
};

/**
 * 手で並べ直した結果を検査する。
 * @param placed 学籍番号 → いまの席
 * @param attendees その曜日に登校する人だけを見る（来ない人の席は関係ない）
 */
export function findViolations(input: {
  placed: { student_id: string; row: number; col: number }[];
  constraints: SeatConstraints;
  attendees: string[];
  names: Record<string, string>;
}): Violation[] {
  const { constraints, names } = input;
  const here = new Set(input.attendees);
  const at = new Map<string, SeatPos>();
  for (const p of input.placed) {
    if (!here.has(p.student_id)) continue;
    at.set(p.student_id, { row: p.row, col: p.col });
  }

  const out: Violation[] = [];

  for (const rule of constraints.fixed ?? []) {
    if (!here.has(rule.student_id)) continue;
    const now = at.get(rule.student_id);
    if (!now) continue;                       // まだ席が無い人は「席が決まっていない人」で出す
    if (now.row === rule.row && now.col === rule.col) continue;
    out.push({
      kind: 'fixed',
      cells: [now, { row: rule.row, col: rule.col }],
      message:
        nameOf(names, rule.student_id) +
        ' は ' + posLabel(rule) + ' の固定席です（いまは ' + posLabel(now) + '）。',
    });
  }

  for (const rule of constraints.forbidden ?? []) {
    if (!here.has(rule.student_id)) continue;
    const now = at.get(rule.student_id);
    if (!now) continue;
    if (now.row !== rule.row || now.col !== rule.col) continue;
    out.push({
      kind: 'forbidden',
      cells: [now],
      message: nameOf(names, rule.student_id) + ' は ' + posLabel(now) + ' に座れない指定です。',
    });
  }

  for (const rule of constraints.apart ?? []) {
    if (!here.has(rule.a) || !here.has(rule.b)) continue;
    const pa = at.get(rule.a);
    const pb = at.get(rule.b);
    if (!pa || !pb) continue;
    if (!isAdjacent(pa, pb)) continue;
    out.push({
      kind: 'apart',
      cells: [pa, pb],
      message:
        nameOf(names, rule.a) + ' と ' + nameOf(names, rule.b) +
        ' は離す指定です（いまは ' + posLabel(pa) + ' と ' + posLabel(pb) + 'で隣り合っています）。',
    });
  }

  return out;
}

/**
 * 【希望】がどれだけ叶っているか。
 * ★これは違反ではありません（赤くしない）。叶わなかったことを黙って捨てないために出します。
 */
export type SoftReport = {
  /** 近づけたい組のうち、叶ったもの／叶わなかったもの */
  nearMet: number;
  nearTotal: number;
  nearUnmetMessages: string[];
  /** 右寄せの対象者のうち、教室の右半分にいる人数 */
  rightMet: number;
  rightTotal: number;
};

export function checkSoftWishes(input: {
  placed: { student_id: string; row: number; col: number }[];
  constraints: SeatConstraints;
  attendees: string[];
  names: Record<string, string>;
  cols: number;
}): SoftReport {
  const { constraints, names, cols } = input;
  const here = new Set(input.attendees);
  const at = new Map<string, SeatPos>();
  for (const p of input.placed) {
    if (here.has(p.student_id)) at.set(p.student_id, { row: p.row, col: p.col });
  }

  let nearMet = 0;
  let nearTotal = 0;
  const nearUnmetMessages: string[] = [];
  for (const r of constraints.near ?? []) {
    if (!here.has(r.a) || !here.has(r.b)) continue;   // どちらか来ない日は数えない
    const pa = at.get(r.a);
    const pb = at.get(r.b);
    if (!pa || !pb) continue;
    nearTotal++;
    if (isAdjacent(pa, pb)) {
      nearMet++;
      continue;
    }
    nearUnmetMessages.push(
      nameOf(names, r.a) + ' と ' + nameOf(names, r.b) + ' を近づけられませんでした。',
    );
  }

  // 右寄せ＝列の番号が大きいほう。真ん中より右にいれば叶ったと数える
  const half = (cols + 1) / 2;
  let rightMet = 0;
  let rightTotal = 0;
  for (const id of constraints.rightward ?? []) {
    if (!here.has(id)) continue;
    const p = at.get(id);
    if (!p) continue;
    rightTotal++;
    if (p.col > half) rightMet++;
  }

  return { nearMet, nearTotal, nearUnmetMessages, rightMet, rightTotal };
}

// ============================================================================
// 自動で並べる
// ============================================================================

export type AssignOk = {
  ok: true;
  seats: { student_id: string; row: number; col: number }[];
  /** 探した手数（試験と、重さの見張り用） */
  steps: number;
  /** 使った種。★同じ種なら同じ案が出る（「さっきの案に戻したい」に応えるため） */
  seed: number;
  /** 前の配置から席が変わった人数（★「似た案」に気づけるように出す） */
  moved: number;
  /** 【希望】がどれだけ叶ったか。★叶わなかったぶんを黙って捨てない */
  soft: SoftReport;
};

export type AssignNg = {
  ok: false;
  /**
   * contradiction … 決まりごと同士が矛盾している（探す前に分かる）
   * noSolution    … 矛盾は無いが、置き方が存在しない
   * timeout       … 打ち切った（★「解が無い」と言い切らない）
   */
  kind: 'contradiction' | 'noSolution' | 'timeout';
  /** ★どれが衝突しているかを人の名前で並べる。空にしないこと */
  reasons: string[];
};

export type AssignResult = AssignOk | AssignNg;

/** 種から決まる乱数（mulberry32）。★同じ種なら必ず同じ並びになる */
function makeRandom(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 種から決まる並べ替え（元の配列は変えない） */
function shuffled<T>(list: T[], rnd: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * その曜日の登校者を教室に並べる。
 *
 * ★★同じ案を出し続けないこと（2026-09-18 社長決裁）。
 *   もとの座席表に「水曜日①②」があったのは、同じ配置だとつまらないからでした。
 *   ＝押すたびに違う案が出ることが仕様です。決まりきった貪欲法にしないこと。
 * ★種（seed）で決まるので、同じ種を渡せば同じ案に戻せます。
 * ★avoid（いま使っている配置）と【なるべく違う】案を優先します。
 *   ただし決まりごと（固定席・禁止席・引き離し）が常に優先で、
 *   固定席の人は動きません（動かないのが正しいので、不満になりません）。
 */
export function autoAssign(input: {
  attendees: string[];
  constraints: SeatConstraints;
  rows: number;
  cols: number;
  names: Record<string, string>;
  /** いま使っている配置。★なるべくここから変える */
  avoid?: { student_id: string; row: number; col: number }[];
  /** 種。同じ種なら同じ案 */
  seed?: number;
  stepLimit?: number;
}): AssignResult {
  const { attendees, constraints, rows, cols, names } = input;
  const stepLimit = input.stepLimit ?? ASSIGN_STEP_LIMIT;
  const seed = Number.isFinite(input.seed) ? Number(input.seed) : 1;
  // ★乱数は「案を1つ作る」たびに種から作り直す（attempt の中）。ここでは持たない
  const here = new Set(attendees);

  const cells: SeatPos[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) cells.push({ row: r, col: c });
  }

  // ── 探す前に分かる矛盾を名指しで出す ────────────────────────────
  const contradictions = findContradictions({ attendees, constraints, rows, cols, names });
  if (contradictions.length > 0) {
    return { ok: false, kind: 'contradiction', reasons: contradictions };
  }

  const key = (p: SeatPos) => p.row + '/' + p.col;

  const fixedOf = new Map<string, SeatPos>();
  for (const f of constraints.fixed ?? []) {
    if (here.has(f.student_id)) fixedOf.set(f.student_id, { row: f.row, col: f.col });
  }
  const forbiddenOf = new Map<string, Set<string>>();
  for (const f of constraints.forbidden ?? []) {
    if (!here.has(f.student_id)) continue;
    const set = forbiddenOf.get(f.student_id) ?? new Set<string>();
    set.add(key({ row: f.row, col: f.col }));
    forbiddenOf.set(f.student_id, set);
  }
  // ★引き離しは2者間だけでなく「3人が互いに離れる」形もある。
  //   相手の一覧として持ち、置くたびに【置いた相手全員】と見比べる。
  const apartOf = new Map<string, string[]>();
  for (const r of constraints.apart ?? []) {
    if (!here.has(r.a) || !here.has(r.b)) continue;
    apartOf.set(r.a, [...(apartOf.get(r.a) ?? []), r.b]);
    apartOf.set(r.b, [...(apartOf.get(r.b) ?? []), r.a]);
  }
  // 【希望】近づけたい。相手の一覧として持つ（ハブ＝1人が3組、の形がある）
  const nearOf = new Map<string, string[]>();
  for (const r of constraints.near ?? []) {
    if (!here.has(r.a) || !here.has(r.b)) continue;
    nearOf.set(r.a, [...(nearOf.get(r.a) ?? []), r.b]);
    nearOf.set(r.b, [...(nearOf.get(r.b) ?? []), r.a]);
  }
  // 【弱い希望】右寄せ
  const rightSet = new Set((constraints.rightward ?? []).filter((id) => here.has(id)));

  const avoidOf = new Map<string, SeatPos>();
  for (const c of input.avoid ?? []) {
    if (here.has(c.student_id)) avoidOf.set(c.student_id, { row: c.row, col: c.col });
  }

  let steps = 0;
  let stuckIndex = -1;
  let stuckOrder: string[] = [];
  let hitLimit = false;

  /**
   * 1回ぶんの探索。★【絶対】の決まりごとだけを守る。
   * 希望（近づけたい・右寄せ）はここでは見ない（見ると解が消えるため）。
   */
  const attempt = (attemptSeed: number): { student_id: string; row: number; col: number }[] | null => {
    const rnd = makeRandom(attemptSeed);

    const taken = new Map<string, string>();
    const placedAt = new Map<string, SeatPos>();
    const half = (cols + 1) / 2;

    /**
     * その生徒が置ける席（固定席があればそれだけ）。★候補の【並び】で希望を効かせる。
     *   並べる順番:
     *     1. 近づけたい相手が既に座っている席のとなり（強い希望）
     *     2. 右寄せの人なら、右半分を先に（弱い希望）
     *     3. いま座っている席は最後（なるべく別の席にする）
     *   ★どれも「先に試す」だけで、置けなければ後ろの候補に進みます。
     *     ＝希望のせいで解が消えることはありません。
     */
    const optionsFor = (id: string): SeatPos[] => {
      const fx = fixedOf.get(id);
      if (fx) return [fx];
      const ng = forbiddenOf.get(id);
      const free = ng ? cells.filter((p) => !ng.has(key(p))) : cells.slice();
      let list = shuffled(free, rnd);

      // ★弱い希望から順に並べ替える。あとから掛けたものほど強く効く
      //   （filter は順番を保つので、前の並びは各かたまりの中に残ります）。

      // 3番目に弱い：いま座っている席は【いちばん後ろ】に回す（目先を変える）
      const now = avoidOf.get(id);
      if (now) {
        const same = (p: SeatPos) => p.row === now.row && p.col === now.col;
        if (list.some(same)) list = [...list.filter((p) => !same(p)), ...list.filter(same)];
      }

      // 2番目：右寄せの人は右半分を先に（半分の中の順番は種のまま＝目先は変わる）
      if (rightSet.has(id)) {
        list = [...list.filter((p) => p.col > half), ...list.filter((p) => p.col <= half)];
      }

      // ★いちばん強い希望：近づけたい相手が既に座っていれば、そのとなりを先に試す
      //   （最後に掛けるので、右寄せを押しのけます＝希望の強さの順どおり）
      const partners = nearOf.get(id) ?? [];
      const placedPartners = partners
        .map((q) => placedAt.get(q))
        .filter((q): q is SeatPos => q !== undefined);
      if (placedPartners.length > 0) {
        const isNextTo = (p: SeatPos) => placedPartners.some((q) => isAdjacent(p, q));
        list = [...list.filter(isNextTo), ...list.filter((p) => !isNextTo(p))];
      }

      return list;
    };

    // 置く順番。★近づけたい組は【まとめて続けて置く】。
    //   離れて置くと、相手が座る前に決めてしまい、隣が空いていても寄せられない。
    const jitter = new Map<string, number>();
    for (const id of attendees) jitter.set(id, rnd());
    const ranked = [...attendees].sort((x, y) => {
      const fx = (fixedOf.has(x) ? 0 : 1) - (fixedOf.has(y) ? 0 : 1);
      if (fx !== 0) return fx;
      const ax = (apartOf.get(y)?.length ?? 0) - (apartOf.get(x)?.length ?? 0);
      if (ax !== 0) return ax;
      const nx = (nearOf.get(y)?.length ?? 0) - (nearOf.get(x)?.length ?? 0);
      if (nx !== 0) return nx;
      const fb = (forbiddenOf.get(y)?.size ?? 0) - (forbiddenOf.get(x)?.size ?? 0);
      if (fb !== 0) return fb;
      return (jitter.get(x) ?? 0) - (jitter.get(y) ?? 0);
    });

    // 近づけたい相手を、その人のすぐ後ろに寄せた並びにする
    const order: string[] = [];
    const queued = new Set<string>();
    for (const id of ranked) {
      if (queued.has(id)) continue;
      order.push(id);
      queued.add(id);
      for (const q of nearOf.get(id) ?? []) {
        if (queued.has(q)) continue;
        order.push(q);
        queued.add(q);
      }
    }

    const canPlace = (id: string, p: SeatPos): boolean => {
      if (taken.has(key(p))) return false;
      for (const other of apartOf.get(id) ?? []) {
        const q = placedAt.get(other);
        if (q && isAdjacent(p, q)) return false;
      }
      return true;
    };

    const walk = (i: number): boolean => {
      if (i >= order.length) return true;
      if (steps > stepLimit) { hitLimit = true; return false; }
      if (i > stuckIndex) { stuckIndex = i; stuckOrder = order; }
      const id = order[i];
      for (const p of optionsFor(id)) {
        steps++;
        if (steps > stepLimit) { hitLimit = true; return false; }
        if (!canPlace(id, p)) continue;
        taken.set(key(p), id);
        placedAt.set(id, p);
        if (walk(i + 1)) return true;
        taken.delete(key(p));
        placedAt.delete(id);
      }
      return false;
    };

    if (!walk(0)) return null;
    return attendees
      .map((id) => {
        const p = placedAt.get(id);
        return p ? { student_id: id, row: p.row, col: p.col } : null;
      })
      .filter((x): x is { student_id: string; row: number; col: number } => x !== null);
  };

  // ── 何通りか作って、【希望】がいちばん叶っているものを選ぶ ────────
  // ★希望を探索の中に混ぜない。混ぜると「希望のせいで解が出ない」が起きる。
  //   絶対を満たす案を何通りか作ってから、その中で希望の点数を比べる。
  let best: { student_id: string; row: number; col: number }[] | null = null;
  let bestScore = -1;
  let bestSoft: SoftReport | null = null;

  for (let k = 0; k < ASSIGN_CANDIDATES; k++) {
    const seats = attempt(seed * 1013904223 + k * 2654435761);
    if (!seats) break;                       // 絶対を満たす案が無い＝何度やっても無い
    const soft = checkSoftWishes({ placed: seats, constraints, attendees, names, cols });
    // 近づけたい（強い希望）を最優先、その次に右寄せ（弱い希望）
    const score = soft.nearMet * 10000 + soft.rightMet * 100 - soft.rightTotal;
    if (score > bestScore) {
      bestScore = score;
      best = seats;
      bestSoft = soft;
    }
    if (soft.nearMet === soft.nearTotal && soft.rightMet === soft.rightTotal) break;
  }

  if (best && bestSoft) {
    let moved = 0;
    for (const s of best) {
      const before = avoidOf.get(s.student_id);
      if (!before || before.row !== s.row || before.col !== s.col) moved++;
    }
    return { ok: true, seats: best, steps, seed, moved, soft: bestSoft };
  }

  if (hitLimit) {
    return {
      ok: false,
      kind: 'timeout',
      reasons: [
        '決まりごとが多く、時間内に並べ方を見つけられませんでした（' +
          steps + ' 通りまで試しました）。' +
          '★「置き方が無い」と決まったわけではありません。引き離しの指定を減らすと見つかることがあります。',
      ],
    };
  }

  // 矛盾の形は無いのに置けない。どこで詰まったかを名指しする
  const stuck = stuckOrder[stuckIndex >= 0 ? stuckIndex : 0] ?? attendees[0];
  const reasons = [
    nameOf(names, stuck) + ' を置ける席が、ほかの人の指定とぶつかって残りませんでした。',
  ];
  const partners = apartOf.get(stuck) ?? [];
  if (partners.length > 0) {
    reasons.push(
      nameOf(names, stuck) + ' の引き離し指定：' +
        partners.map((q) => nameOf(names, q)).join('・'),
    );
  }
  const ng = forbiddenOf.get(stuck);
  if (ng && ng.size > 0) {
    reasons.push(nameOf(names, stuck) + ' の禁止席：' + ng.size + ' 席');
  }
  reasons.push('この人の指定か、まわりの人の固定席を見直してください。');
  return { ok: false, kind: 'noSolution', reasons };
}

export function findContradictions(input: {
  attendees: string[];
  constraints: SeatConstraints;
  rows: number;
  cols: number;
  names: Record<string, string>;
}): string[] {
  const { attendees, constraints, rows, cols, names } = input;
  const here = new Set(attendees);
  const out: string[] = [];

  // 席が足りない
  if (attendees.length > rows * cols) {
    out.push(
      'この曜日に登校する人が ' + attendees.length + ' 人で、席の数（' +
        rows * cols + ' 席）を超えています。',
    );
  }

  const inRoom = (p: SeatPos) => p.row >= 1 && p.row <= rows && p.col >= 1 && p.col <= cols;

  // 固定席が教室の外
  for (const f of constraints.fixed ?? []) {
    if (!here.has(f.student_id)) continue;
    if (inRoom(f)) continue;
    out.push(
      nameOf(names, f.student_id) + ' の固定席（' + posLabel(f) + '）が教室の外です（教室は ' +
        rows + '行×' + cols + '列）。',
    );
  }

  // 同じ席に2人が固定されている
  const byCell = new Map<string, string[]>();
  for (const f of constraints.fixed ?? []) {
    if (!here.has(f.student_id)) continue;
    const k = f.row + '/' + f.col;
    byCell.set(k, [...(byCell.get(k) ?? []), f.student_id]);
  }
  for (const [k, ids] of byCell) {
    if (ids.length < 2) continue;
    const [row, col] = k.split('/').map(Number);
    out.push(
      ids.map((i) => nameOf(names, i)).join(' と ') +
        ' が同じ席（' + posLabel({ row, col }) + '）に固定されています。',
    );
  }

  // 固定席が、その人の禁止席になっている
  for (const f of constraints.fixed ?? []) {
    if (!here.has(f.student_id)) continue;
    const clash = constraints.forbidden.some(
      (g) => g.student_id === f.student_id && g.row === f.row && g.col === f.col,
    );
    if (!clash) continue;
    out.push(
      nameOf(names, f.student_id) + ' は ' + posLabel(f) +
        ' に固定されているのに、同じ席が禁止席になっています。',
    );
  }

  // 引き離したい2人が、どちらも固定席で隣り合っている
  const fixedOf = new Map<string, SeatPos>();
  for (const f of constraints.fixed ?? []) {
    if (here.has(f.student_id)) fixedOf.set(f.student_id, { row: f.row, col: f.col });
  }
  for (const r of constraints.apart ?? []) {
    if (!here.has(r.a) || !here.has(r.b)) continue;
    const pa = fixedOf.get(r.a);
    const pb = fixedOf.get(r.b);
    if (!pa || !pb || !isAdjacent(pa, pb)) continue;
    out.push(
      nameOf(names, r.a) + ' と ' + nameOf(names, r.b) +
        ' は離す指定ですが、固定席（' + posLabel(pa) + ' と ' + posLabel(pb) +
        '）が隣り合っています。',
    );
  }

  // 禁止席で、置ける席が1つも残らない人
  for (const id of attendees) {
    if (fixedOf.has(id)) continue;
    const ng = constraints.forbidden.filter((f) => f.student_id === id && inRoom(f)).length;
    if (ng < rows * cols) continue;
    out.push(nameOf(names, id) + ' は教室の全部の席が禁止席になっていて、置ける席がありません。');
  }

  return out;
}
