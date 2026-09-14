// ============================================================================
// 出欠の行の見つけ方 ── 台帳 A4-95（2026-09-14）
// ============================================================================
// ★2026-09-14、younetDX には記録できているのに、画面は
//   「記録結果を確認できません」と出ていた。＝【確認】の側だけが壊れていた。
//
// ★スプレッドシートの日付は文字列とは限らない。
//   セルが日付型だと Apps Script では Date になり、JSON にすると
//   "2026-09-13T15:00:00.000Z"（＝日本時間 9/14 00:00）のような形で届く。
//   これを "2026-09-14" と === で比べると【黙って外れる】。
//   CSV に当てた検査は緑のまま、本番だけ壊れる（2026-09-11 に同じ罠で2件）。
//
// ★ここでやること＝比べる前に「日本時間の暦日」にそろえる。
//   ・時刻が付いていない（2026-09-14 / 2026/9/14）→ そのまま暦日として読む
//   ・時刻が付いている（Z や +09:00）→ 日本時間に直してから暦日にする
//     ★ここを UTC のまま切ると、日本時間の 0時台が前日に化ける。
// ============================================================================

/** 学校の暦は日本時間で数える */
const TZ = 'Asia/Tokyo';

/** 時刻を含まない「年-月-日」だけの形か */
const DATE_ONLY_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
/** 先頭が年-月-日で、そのあとに時刻が続く形か */
const HAS_TIME_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}[T ]/;

const pad2 = (n: string) => (n.length === 1 ? `0${n}` : n);

/**
 * 届いた日付を "YYYY-MM-DD"（日本時間の暦日）にそろえる。読めなければ ''。
 */
export function toYmd(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-CA', { timeZone: TZ });
  }
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s) return '';

  // 時刻が無いものは、そのまま暦日として読む（時差で1日ずらさない）
  const only = DATE_ONLY_RE.exec(s);
  if (only) return `${only[1]}-${pad2(only[2])}-${pad2(only[3])}`;

  // 時刻が付いているものは、日本時間に直してから暦日にする
  if (HAS_TIME_RE.test(s)) {
    const t = new Date(s);
    if (!Number.isNaN(t.getTime())) return t.toLocaleDateString('en-CA', { timeZone: TZ });
  }
  return '';
}

/** 同じ暦日か。★どちらかが読めなければ false（読めないものを一致させない） */
export function sameDay(a: unknown, b: unknown): boolean {
  const x = toYmd(a);
  return x !== '' && x === toYmd(b);
}

type AttendanceLike = { date?: unknown; name?: unknown; checkinTime?: string; checkoutTime?: string };

/**
 * その人の、その日の行を見つける。
 * ★名前は前後の空白を落としてから比べる（スプレッドシートの列は空白が入りやすい）。
 */
export function findAttendance<T extends AttendanceLike>(
  list: T[] | null | undefined,
  date: string,
  name: string,
): T | undefined {
  if (!Array.isArray(list)) return undefined;
  const target = String(name ?? '').trim();
  return list.find(
    (r) => r && sameDay(r.date, date) && String(r.name ?? '').trim() === target,
  );
}
