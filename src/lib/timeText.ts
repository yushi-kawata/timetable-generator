// ============================================================================
// 出欠の時刻の表し方 ── 2026-09-16
// ============================================================================
// ★2026-09-16、本番の生徒の画面にこう出た。
//     登校  1899-12-30T00:08:00.000Z
//     下校  1899-12-30T05:57:00.000Z
//   1899-12-30 はスプレッドシートの【時刻シリアルの起点】。
//   「時刻だけ」のセルは 1899-12-30 からの経過時間として持たれるため、
//   日付型として返るとこの形で届く。値は正しい（00:08Z＝日本時間 9:08）。
//   壊れていたのは【表示】だけで、記録の中身ではない。
//
// ★届く形は1種類ではない。どちらも「9:08」と出す。
//     "09:08"                       … 文字列のセル
//     "1899-12-30T00:08:00.000Z"    … 日付型のセル
//   （日付の照合が attendanceMatch.ts で必要だったのと同じ事情：
//     スプレッドシートの値の型を1つに決めつけないこと）
//
// ★日本時間で読むこと。端末の時計に任せない。
//   00:08Z を UTC の端末で読むと 0:08 になり、9時間ずれたまま表示される。
//
// ★読めない値では何も出さない。"Invalid Date" や "NaN:NaN" を画面に出さない。
//   ここが '' を返した行は、画面側で行ごと出さない（時刻欄が空になるだけ）。
//   ★「記録した／していない」の判定はこの関数を通さないこと。通すと、
//     時刻が読めないだけで「未記録」に戻り、押せる「登校する」が復活する
//     ＝二重登録（台帳 A4-99）に逆戻りする。
// ============================================================================

/** 学校の時計は日本時間で読む */
const TZ = 'Asia/Tokyo';

/** "9:08" / "09:08" / "09:08:30" のような、時刻だけの文字列 */
const HHMM_RE = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/;
/** 先頭が年-月-日で、そのあとに時刻が続く形（日付型が文字列になったもの） */
const HAS_TIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** 日本時間の「時」「分」を取り出す。読めなければ '' */
function fromDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  // ★hourCycle: 'h23' を明示する。付けないと真夜中が "24:00" になる環境がある。
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  if (!/^\d{1,2}$/.test(hour) || !/^\d{2}$/.test(minute)) return '';
  return `${Number(hour)}:${minute}`;
}

/**
 * 画面に出す時刻の文字列（"9:08"）にそろえる。読めない値は '' を返す。
 */
export function toTimeText(value: unknown): string {
  if (value instanceof Date) return fromDate(value);
  if (typeof value !== 'string') return '';

  const s = value.trim();
  if (!s) return '';

  // 時刻だけの文字列は、そのまま読む（時差で動かさない）
  const hhmm = HHMM_RE.exec(s);
  if (hhmm) {
    const hour = Number(hhmm[1]);
    if (hour > 23) return '';
    return `${hour}:${hhmm[2]}`;
  }

  // 日付が付いているものは、日本時間に直してから時刻にする
  if (HAS_TIME_RE.test(s)) return fromDate(new Date(s));

  return '';
}
