/* ============================================================================
   この端末（ブラウザの localStorage）に何を残すか

   ★残すのは時間割の表（tt）だけ。
     名簿（氏名・学年・メール・登校曜日、打ち込んだパスワード）と
     生徒ごとの申告（records）は【残さない】。
     職員が使った端末（共用PC・個人PC）に、ブラウザのデータを消すまで
     名簿が平文で残り続けるため。名簿と申告は毎回、裏側から読み直す。

   ★前の版で保存したデータ（名簿入り）を読んだときも壊れないこと。
     ・版の番号を上げてあるので、読み込んだ時点で migrate が走り、
       tt だけを拾ってすぐに書き戻す＝端末に残っていた名簿はそこで消える。
     ・念のため merge でも tt 以外を拾わない（版の番号が壊れていても通さない）。
     ・tt の形がおかしいときは拾わない（既定の表のまま動く）。
   ============================================================================ */

/** localStorage のキー。★変えないこと（変えると古いキーの名簿が消されずに残る） */
export const PERSIST_NAME = 'timetable-system-v5';

/**
 * 保存の形の版。
 *  0（または版なし）… tt ＋ records ＋ students を保存していた
 *  1               … tt だけ
 */
export const PERSIST_VERSION = 1;

/** 端末に残してよい項目 */
export type DevicePersisted<TT> = { tt?: TT };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 保存されていた中身から、残してよい項目だけを拾う（それ以外は捨てる） */
export function pickDeviceFields<TT>(persisted: unknown): DevicePersisted<TT> {
  if (!isPlainObject(persisted)) return {};
  const tt = persisted.tt;
  if (!isPlainObject(tt)) return {};
  return { tt: tt as TT };
}

/** 書くとき：tt だけ */
export function partializeForDevice<TT>(s: { tt: TT }): DevicePersisted<TT> {
  return { tt: s.tt };
}

/** 版が違うデータを読んだとき：tt だけ拾う */
export function migratePersisted<TT>(persisted: unknown): DevicePersisted<TT> {
  return pickDeviceFields<TT>(persisted);
}

/** 読み込んだものを今の状態に重ねるとき：tt 以外は重ねない */
export function mergePersisted<S extends { tt: unknown }>(persisted: unknown, current: S): S {
  return { ...current, ...pickDeviceFields<S['tt']>(persisted) };
}
