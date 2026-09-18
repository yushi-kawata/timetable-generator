// ============================================================================
// 行き先そのものについての断り書き（台帳 A4-120）
// ============================================================================
// ★URL で画面を分けたので、「その URL は開けません」を出す場面が生まれました。
//   ★真っ白にしない／エラーだけ出して放り出さない。
//   必ず【行ける場所】を1つ添えます（生徒用の画面）。

type Props = {
  /** 生徒用の画面へ戻る */
  onGoStudent: () => void;
};

/**
 * 職員専用の画面に、生徒（または職員と判定できないアカウント）が来たとき。
 * ★責める言い方にしない。URL を踏んだだけの人が大半です。
 */
export function StaffOnlyNotice({ onGoStudent }: Props) {
  return (
    <div className="card !mb-0 max-w-sm w-full mx-auto text-center shadow-lg shadow-stone-200/50">
      <div className="text-3xl mb-3" aria-hidden="true">🔒</div>
      <h1 className="text-base font-bold text-[var(--ink)] mb-2">
        この画面は先生用です
      </h1>
      <p className="text-sm text-[var(--ink3)] leading-relaxed mb-6">
        いま入っているアカウントでは開けません。
        生徒のみなさんは、下のボタンから時間割の画面へお戻りください。
      </p>
      <button
        onClick={onGoStudent}
        className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-[var(--accent-hover)]"
      >
        生徒用の画面へ戻る
      </button>
    </div>
  );
}

/**
 * 知らない行き先（打ち間違い・古いリンク）。
 * ★黙って生徒用へ飛ばさない。飛ばすと、リンクが間違っていることに誰も気づけません。
 */
export function NotFoundNotice({ onGoStudent }: Props) {
  return (
    <div className="card !mb-0 max-w-sm w-full mx-auto text-center shadow-lg shadow-stone-200/50">
      <div className="text-3xl mb-3" aria-hidden="true">🧭</div>
      <h1 className="text-base font-bold text-[var(--ink)] mb-2">
        そのページはありません
      </h1>
      <p className="text-sm text-[var(--ink3)] leading-relaxed mb-6">
        URL が違っているかもしれません。
        下のボタンから時間割の画面へお進みください。
      </p>
      <button
        onClick={onGoStudent}
        className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-[var(--accent-hover)]"
      >
        生徒用の画面へ戻る
      </button>
    </div>
  );
}
