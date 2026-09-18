// ============================================================================
// 教室の座席表 ── 台帳 A4-107 / 画面側の素の処理
// ============================================================================
// ★このファイルは【画面もネットワークも持たない】。取り込んだ値の形をそろえる、
//   曜日でしぼる、席を入れ替える、の3つだけ。試験（tests/seatChart.test.mjs）は
//   ここを直接読む。
// ★runtime の import を持たせないこと（型の import だけ）。
//   試験の読み込み器（tests/_load-ts.mjs）が単体で変換して読むため。
//
// ★★この画面に出してよいのは【氏名】と【座席の位置】だけ。
//   学年・コース・メールアドレス・パスワード・要配慮情報（服薬・手帳・保健調査）は
//   1つも出さない。窓口も返さない約束だが、【窓口が余計な列を返してきても
//   画面に届かない】ように、normalizeSeatChart が受け取る鍵を絞って作り直す。
//   ここを「そのまま通す」書き方に変えないこと。
import type { DayOfWeek } from '../types/master';

/** 曜日の並び。★types/master の DAYS と同じ。ここは import を持てないので書き写している */
export const SEAT_DAYS: DayOfWeek[] = ['月', '火', '水', '木', '金'];

/**
 * ★伏せるまでの時間（操作が無い状態が続いたら氏名を隠す）。
 *   教室に置いた iPad は、来客や他のクラスの生徒からも見えるため。
 *   ★変えるときはこの1か所だけ。画面側に秒数を書かないこと。
 */
export const SEAT_MASK_IDLE_MS = 5 * 60 * 1000;

/**
 * 教室の広さの【控えの値】（縦の行数 × 横の列数）。
 * ★正本は窓口が返す grid（契約 v4 の {"rows":4,"cols":7}）です。ここは窓口が
 *   grid を返さなかったときの控えにすぎません。★画面側で 4×7 を決め打ちしないこと。
 * ★控えを使ったときは gridProvided:false が立つので、そうと分かる形で画面に出します。
 */
export const SEAT_ROWS_FALLBACK = 4;
export const SEAT_COLS_FALLBACK = 7;

/** 画面が持ってよい生徒の情報。これ以上増やさないこと */
export type SeatStudent = {
  /** 並び替えの突き合わせにだけ使う。★画面には出さない */
  student_id: string;
  name: string;
  days: Record<DayOfWeek, boolean>;
};

/**
 * 席の位置。
 * ★基点：row = 1 が【教卓側のいちばん前の列】、col = 1 が【教室に入って左】。
 *   ★裏側（GAS）と同じ向きに揃えること。逆だと前後左右が黙って反転し、
 *     エラーも出ないまま「別の席の表」が出ます。
 */
export type Seat = {
  student_id: string;
  row: number;
  col: number;
};

export type SeatChart = {
  students: SeatStudent[];
  /**
   * ★席は曜日ごとに別（2026-09-18 社長決裁）。
   *   その日に来る人だけを並べるので、月〜金で配置が変わります。
   *   窓口の seats に day が無い行は【全曜日に同じ席】として読みます
   *   （曜日を持たない今の窓口とも、そのままつながるため）。
   */
  seatsByDay: Record<DayOfWeek, Seat[]>;
  /**
   * 教室の広さ。★窓口の grid が正本。
   *   これが無いと、誰も座っていない列がまるごと消えて空席が描けません。
   */
  grid: { rows: number; cols: number };
  /** 窓口が grid を返したか。false＝控えの値で描いている（画面に出す） */
  gridProvided: boolean;
  /** 窓口が作った時刻の文字列。★空なら「いつのものか」が言えないので採らない */
  asof: string;
};

export type NormalizeResult =
  | { ok: true; chart: SeatChart }
  | { ok: false; reason: NormalizeFailure };

/**
 * 取り込めなかった理由。
 *  notObject … 返事が入れ物になっていない
 *  noStudents / noSeats … 配列で来ていない
 *  noAsof … いつのものか分からない（★古い表を新しいと誤認させないため採らない）
 */
export type NormalizeFailure = 'notObject' | 'noStudents' | 'noSeats' | 'noAsof';

/** 1以上の整数だけ通す（教室の広さ用） */
function asSize(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 1以上の整数だけ通す（0・負・小数・文字は席として扱わない） */
function asPos(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(asText(v));
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function pickDays(v: unknown): Record<DayOfWeek, boolean> {
  const src = (v ?? {}) as Record<string, unknown>;
  const out = {} as Record<DayOfWeek, boolean>;
  for (const d of SEAT_DAYS) out[d] = src[d] === true;
  return out;
}

/**
 * 窓口の返事を、画面が扱える形に作り直す。
 * ★「検査して通す」ではなく【必要な鍵だけで作り直す】。
 *   窓口がうっかり学年やメールを足しても、ここから先には存在しない。
 */
export function normalizeSeatChart(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'notObject' };
  }
  const src = raw as Record<string, unknown>;
  if (!Array.isArray(src.students)) return { ok: false, reason: 'noStudents' };

  // ★契約 v4：seats は【曜日をキーにした入れ物】。
  //   古い形（1本の配列）でも読めるようにしてある（版の入れ替えがずれた瞬間に
  //   座席だけ黙って空になるのを防ぐため）。どちらでもなければ採らない。
  const seatsIsArray = Array.isArray(src.seats);
  const seatsIsMap = !!src.seats && typeof src.seats === 'object' && !seatsIsArray;
  if (!seatsIsArray && !seatsIsMap) return { ok: false, reason: 'noSeats' };

  const asof = asText(src.asof);
  if (!asof) return { ok: false, reason: 'noAsof' };

  // 教室の広さ。★窓口の grid が正本。無ければ控えの値で描き、そうと分かるようにする
  const rawGrid = (src.grid ?? {}) as Record<string, unknown>;
  const gRows = asSize(rawGrid.rows);
  const gCols = asSize(rawGrid.cols);
  const gridProvided = gRows !== null && gCols !== null;
  const grid = {
    rows: gRows ?? SEAT_ROWS_FALLBACK,
    cols: gCols ?? SEAT_COLS_FALLBACK,
  };

  const students: SeatStudent[] = [];
  const seenId = new Set<string>();
  for (const s of src.students) {
    if (!s || typeof s !== 'object') continue;
    const row = s as Record<string, unknown>;
    const id = asText(row.student_id);
    const name = asText(row.name);
    if (!id || !name) continue;
    if (seenId.has(id)) continue;      // 同じ番号が2行あれば先に来た方を残す
    seenId.add(id);
    students.push({ student_id: id, name, days: pickDays(row.days) });
  }

  // ── 席は曜日ごとに分ける ────────────────────────────────────────
  // ★day が無い行は「全曜日に同じ席」として読む（曜日を持たない窓口との互換）。
  // ★同じ曜日で同じ人が2つの席を持つのは形が壊れているので、先に来た方を残す。
  const seatsByDay = {} as Record<DayOfWeek, Seat[]>;
  const seenPerDay = {} as Record<DayOfWeek, Set<string>>;
  for (const d of SEAT_DAYS) {
    seatsByDay[d] = [];
    seenPerDay[d] = new Set<string>();
  }

  /** 1行ぶんを、指定の曜日たちに入れる */
  const addSeat = (value: unknown, days: DayOfWeek[]) => {
    if (!value || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    const id = asText(row.student_id);
    const r = asPos(row.row);
    const c = asPos(row.col);
    if (!id || r === null || c === null) return;
    for (const d of days) {
      if (seenPerDay[d].has(id)) continue;   // 同じ曜日に同じ人が2つの席を持つのは壊れている
      seenPerDay[d].add(id);
      seatsByDay[d].push({ student_id: id, row: r, col: c });
    }
  };

  if (seatsIsMap) {
    // 契約 v4：{"月":[…],"火":[…],…}
    const map = src.seats as Record<string, unknown>;
    for (const d of SEAT_DAYS) {
      const list = map[d];
      if (!Array.isArray(list)) continue;    // その曜日が無い／配列でない＝その日は席なし
      for (const one of list) addSeat(one, [d]);
    }
  } else {
    // 古い形：1本の配列。day があればその曜日だけ、無ければ全曜日に同じ席
    for (const one of src.seats as unknown[]) {
      if (!one || typeof one !== 'object') continue;
      const rawDay = asText((one as Record<string, unknown>).day);
      const days = SEAT_DAYS.includes(rawDay as DayOfWeek) ? [rawDay as DayOfWeek] : SEAT_DAYS;
      addSeat(one, days);
    }
  }

  return { ok: true, chart: { students, seatsByDay, grid, gridProvided, asof } };
}

export type SeatCell = {
  row: number;
  col: number;
  /** その曜日にここに座る人。いなければ null */
  student: SeatStudent | null;
  /** 同じ席を2人以上が指していた（★黙って片方を消さない） */
  conflict: boolean;
  /**
   * 名簿に居ない学籍番号の席（★裏側は落とさずそのまま返す約束）。
   * 空席と区別して「？」で出す。黙って空席に見せると、席の台帳が壊れていることに
   * 誰も気づけない。
   */
  orphan: boolean;
};

export type SeatGrid = {
  /** 実際に描く行数（教室の実寸。はみ出した席があればそこまで広げる） */
  rows: number;
  cols: number;
  /** 席が教室の外（4行×7列の外）を指していた＝台帳が壊れている */
  outOfRoom: boolean;
  /** cells[row-1][col-1] */
  cells: SeatCell[][];
  /** その曜日に登校する人数 */
  attendingCount: number;
  /** 登校するのに席が決まっていない人（★消さずに表の外へ出す） */
  unseated: SeatStudent[];
  /**
   * 同じ席が重なっている場所。
   * ★誰が表に出ていないかまで持つ。人数だけ知らせると、席に出せなかった人が
   *   画面のどこにも居ない状態になり、消えたことに気づけない。
   */
  conflicts: { row: number; col: number; kept: string; hidden: string }[];
  /** 名簿に無い生徒番号を指している席（位置つき。数だけにしない） */
  orphans: { row: number; col: number }[];
};

/**
 * その曜日の座席表を組み立てる。
 *
 * ★★席をどのマスに置くかを決めているのは【この関数だけ】。
 *   固定席・禁止席・引き離しといった決まりごとを足す日が来ても、
 *   置き場所の判断はここに集める（画面側に散らさない）。
 *
 * ★教室の広さは【窓口が返す grid】で決める（rows/cols を受け取る）。
 *   曜日ごとに表の大きさが変わると同じ席が別の場所に見えるので、
 *   来ない人がいても【マス目は減らさない】。
 *   実寸の外を指す席があれば、そこまで広げて必ず表に出す（黙って落とさない）。
 */
export function buildSeatGrid(
  input: { students: SeatStudent[]; seats: Seat[]; rows?: number; cols?: number },
  day: DayOfWeek,
): SeatGrid {
  const chart = input;
  // ★教室の広さは呼び出し側（＝窓口の grid）から受け取る。ここで決め打たない
  const roomRows = input.rows ?? SEAT_ROWS_FALLBACK;
  const roomCols = input.cols ?? SEAT_COLS_FALLBACK;
  const byId = new Map<string, SeatStudent>();
  for (const s of chart.students) byId.set(s.student_id, s);

  let maxRow = 0;
  let maxCol = 0;
  for (const seat of chart.seats) {
    if (seat.row > maxRow) maxRow = seat.row;
    if (seat.col > maxCol) maxCol = seat.col;
  }
  const outOfRoom = maxRow > roomRows || maxCol > roomCols;
  const rows = Math.max(roomRows, maxRow);
  const cols = Math.max(roomCols, maxCol);

  const cells: SeatCell[][] = [];
  for (let r = 1; r <= rows; r++) {
    const line: SeatCell[] = [];
    for (let c = 1; c <= cols; c++) {
      line.push({ row: r, col: c, student: null, conflict: false, orphan: false });
    }
    cells.push(line);
  }

  // ── 名簿に居ない番号の席。★落とさず「？」の場所として残す ──────────
  const orphans: { row: number; col: number }[] = [];
  for (const seat of chart.seats) {
    if (byId.has(seat.student_id)) continue;
    orphans.push({ row: seat.row, col: seat.col });
    cells[seat.row - 1][seat.col - 1].orphan = true;
  }

  const conflicts: { row: number; col: number; kept: string; hidden: string }[] = [];
  const seated = new Set<string>();
  for (const seat of chart.seats) {
    const student = byId.get(seat.student_id);
    if (!student) continue;
    if (!student.days[day]) continue;          // その曜日は来ない＝席を空ける
    seated.add(student.student_id);
    const cell = cells[seat.row - 1][seat.col - 1];
    if (cell.student) {
      cell.conflict = true;
      // ★先に入れた人を消さない。あとの人は表に出せないので、名前を控えて画面に出す
      conflicts.push({
        row: seat.row,
        col: seat.col,
        kept: cell.student.name,
        hidden: student.name,
      });
      continue;
    }
    cell.student = student;
  }

  const attending = chart.students.filter((s) => s.days[day]);
  const unseated = attending.filter((s) => !seated.has(s.student_id));

  return {
    rows,
    cols,
    outOfRoom,
    cells,
    attendingCount: attending.length,
    unseated,
    conflicts,
    orphans,
  };
}

/**
 * 席を動かす（★元の配列は変えず、新しい配列を返す）。
 *  ・行き先が空いていれば移す
 *  ・行き先に人がいれば入れ替える（押し出して消さない）
 *  ・席をまだ持っていない人にも使える（新しい席として足す）
 */
export function moveSeat(
  seats: Seat[],
  studentId: string,
  to: { row: number; col: number },
): Seat[] {
  const from = seats.find((s) => s.student_id === studentId) ?? null;
  const occupant = seats.find((s) => s.row === to.row && s.col === to.col) ?? null;

  if (occupant && occupant.student_id === studentId) return seats;   // 同じ席＝何もしない

  const next = seats.map((s) => {
    if (s.student_id === studentId) return { ...s, row: to.row, col: to.col };
    if (occupant && s.student_id === occupant.student_id) {
      // 入れ替え相手。動かす人が元の席を持っていなければ、その席は空くだけ
      return from ? { ...s, row: from.row, col: from.col } : s;
    }
    return s;
  });

  if (!from) next.push({ student_id: studentId, row: to.row, col: to.col });
  return next;
}

/**
 * 氏名を行に割る。★席の枠は狭いので、姓と名のあいだで折り返させる。
 *   これをしないと「田中 太」「郎」のように名前の途中で切れて、
 *   数メートル離れた席から読めなくなる。
 *   ・空白で1回だけ割る
 *   ・空白が無ければ1行のまま（勝手に切らない）
 * ★全角の空白（U+3000）は JavaScript の \s に含まれるので、
 *   文字クラスに全角空白を直接書かないこと（見えない文字は事故のもと）。
 */
export function nameLines(name: string): string[] {
  const t = String(name || '').trim();
  const at = t.search(/\s/);
  if (at <= 0) return [t];
  const first = t.slice(0, at);
  const rest = t.slice(at).replace(/^\s+/, '');
  return rest ? [first, rest] : [first];
}

/**
 * 2つの並びが同じかどうか（★順番は問わない）。
 *
 * ★何のためにあるか（台帳 A4-101 / 2026-09-18 の実害）:
 *   保存は届いていたのに、応答（2段目）だけが落ちて画面が
 *   「保存できませんでした」と出した。社長がそれを見て押し直し、
 *   同じ内容が2回書かれた。
 *   ＝【「失敗なのに成功と出る」の逆も同じくらい危ない】（人に押し直させるため）。
 *   そこで、保存が失敗に見えたときは読み直して、この関数で突き合わせる。
 *
 * ★比べるのは 学籍番号・行・列 の【集合】。並び順は見ない
 *   （裏側が並べ替えて返しても「違う」と言わないため）。
 */
export function sameSeating(a: Seat[], b: Seat[]): boolean {
  const key = (seats: Seat[]) =>
    seats
      .map((s) => s.student_id + '/' + s.row + '/' + s.col)
      .sort()
      .join('|');
  if (a.length !== b.length) return false;
  return key(a) === key(b);
}

/** その日の曜日。土日は null（月〜金しか無い） */
export function weekdayOf(d: Date): DayOfWeek | null {
  const i = d.getDay();                 // 0=日
  if (i < 1 || i > 5) return null;
  return SEAT_DAYS[i - 1];
}
