import type { DayOfWeek } from '../../types/master';

/**
 * 生徒画面の日付まわり。
 * ★文字列の作り方だけを置く場所。受付ルール（何時から何時まで）はここに書かない。
 *   この道具に受付時間の決まりは無い（裏側の checkIn / checkOut に時刻の判定は無い）。
 *   画面の都合で締め切りを作らないこと。
 */

const DOW_BY_INDEX: (DayOfWeek | null)[] = [null, '月', '火', '水', '木', '金', null];
const DOW_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-09-09" */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(): string {
  return ymd(new Date());
}

/** 月〜金なら曜日、土日なら null */
export function todayDow(): DayOfWeek | null {
  return DOW_BY_INDEX[new Date().getDay()];
}

/** "9月9日（水）" */
export function dateLabel(d: Date = new Date()): string {
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW_LABEL[d.getDay()]}）`;
}

/** "09:08" */
export function nowTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** その週の月曜日を "2026-09-07" の形で返す（既存の週の数え方をそのまま使う） */
export function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return ymd(d);
}

/** "9月7日〜9月11日"（週キー＝月曜から金曜まで） */
export function weekRangeLabel(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  const mon = new Date(y, m - 1, d);
  const fri = new Date(y, m - 1, d + 4);
  return `${mon.getMonth() + 1}月${mon.getDate()}日〜${fri.getMonth() + 1}月${fri.getDate()}日`;
}
