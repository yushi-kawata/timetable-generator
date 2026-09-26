/* ============================================================================
   名簿を保存してよいか

   ★名簿の「保存」は常に【上書き】（裏側が名簿を作り直す）。
     画面が古い名簿を持ったまま保存すると、古い内容で上書きされる。
     だから、いちばん新しい読み込みが成功していないときは保存を止める。

   ★止めるときは、押せない灰色のボタンを置かない。理由を文字で出し、
     読み込み直すボタンを出す（押せる操作だけを置く）。
   ============================================================================ */

/**
 * 名簿の読み込みの状態。
 *  idle    … まだ読み込んでいない
 *  loading … 読み込み中
 *  ok      … いちばん新しい読み込みが成功した
 *  failed  … いちばん新しい読み込みが失敗した（表示は古いかもしれない）
 */
export type StudentsSync = 'idle' | 'loading' | 'ok' | 'failed';

export type StudentSaveGate =
  | { canSave: true }
  | { canSave: false; message: string; canReload: boolean };

const NOTE_UNSAVED = '読み込み直すと、まだ保存していない変更は消えます。';

export function studentSaveGate(sync: StudentsSync): StudentSaveGate {
  if (sync === 'ok') return { canSave: true };
  if (sync === 'loading') {
    return {
      canSave: false,
      message: '名簿を読み込んでいます。読み込みが終わると保存できます。',
      canReload: false,
    };
  }
  if (sync === 'failed') {
    return {
      canSave: false,
      message:
        '名簿を読み込み直せませんでした。いま表示している名簿は古いかもしれないため、保存を止めています' +
        '（保存すると、表示している内容で名簿が上書きされます）。「名簿を読み込み直す」を押してください。' +
        NOTE_UNSAVED,
      canReload: true,
    };
  }
  return {
    canSave: false,
    message: '名簿をまだ読み込んでいないため、保存できません。「名簿を読み込み直す」を押してください。',
    canReload: true,
  };
}
