/* ============================================================================
   名簿の重複のまとめ方

   ★氏名をキーにしない。同姓同名の2人が、読み込んだ時点で1人に
     まとめられ、次の「保存」で本当に名簿から消えてしまうため。

   キーの順（上から先に使う）:
     1. 学籍番号（student_id）… 裏側がこの項目を返したときだけ使う
     2. メールアドレス（dx_email）… 大文字小文字・前後の空白をそろえて比べる
                                    （ログインのアカウント＝1人に1つ）
     3. どちらも無い行 … 【まとめない】（黙って消すより、2行見えるほうがよい）

   ★まとめたときは件数を返す。画面はそれを出す（黙ってまとめない）。
   ★同じキーが2行あれば、あとの行を残す（前からの決まり）。並び順は最初に
     出てきた位置のまま。
   ============================================================================ */

/** 学籍番号の形＝数字8桁 */
const STUDENT_ID_RE = /^\d{8}$/;

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * 1行ぶんのキー。まとめない行は null。
 * ★引数は裏側から届いた行（そのままの形）。
 */
export function studentKey(row: unknown): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as { student_id?: unknown; dx_email?: unknown };
  const id = text(r.student_id);
  if (STUDENT_ID_RE.test(id)) return 'id:' + id;
  const email = text(r.dx_email).toLowerCase();
  if (email) return 'e:' + email;
  return null;
}

/**
 * 重複をまとめる。
 * @returns kept＝残した行（並び順は最初に出てきた位置）／merged＝まとめて減った件数
 */
export function dedupeByStudentKey<T>(
  rows: T[],
  keyOf: (row: T) => string | null,
): { kept: T[]; merged: number } {
  const slots: T[] = [];
  const indexByKey = new Map<string, number>();
  let merged = 0;
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) {
      slots.push(row);
      continue;
    }
    const at = indexByKey.get(key);
    if (at === undefined) {
      indexByKey.set(key, slots.length);
      slots.push(row);
    } else {
      // あとの行を残す（位置は最初のまま）
      slots[at] = row;
      merged++;
    }
  }
  return { kept: slots, merged };
}
