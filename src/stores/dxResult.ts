/* ============================================================================
   教務システム（younetDX）連携の結果 ── 台帳 A4-86（2026-09-11）
   ============================================================================
   ★なぜ別ファイルか
     useMasterStore.ts は複数人（複数の担当）が同時に触る。ここに置けば
     連携の型と正規化は1か所で読めるし、書き換えの衝突も減る。

   ★何を直したのか
     裏側（GAS）は noPassword / dxLoginFailed / notEnrolled / noDxUrl /
     badDxUrl / code=◯ と【理由】を返しているのに、画面側が true/false に
     潰していた。そのため生徒には「反映は確認できませんでした」しか出せず、
     次に何をすればよいかが誰にも分からなかった。
   ============================================================================ */

export type DxFailReason =
  /** QRの行き先が空（QRの窓口から取れていない） */
  | 'noDxUrl'
  /** QRの行き先が you-net-dx.jp ではない（裏側が止めた） */
  | 'badDxUrl'
  /** 名簿の dx_email が、その人の学校Googleアカウントと違う */
  | 'notEnrolled'
  /** 名簿の dx_password が空（先生の設定待ち） */
  | 'noPassword'
  /** younetDX にログインできなかった */
  | 'dxLoginFailed'
  /** ログインが切れている */
  | 'signin'
  /** 権限で断られた */
  | 'forbidden'
  /** つながらない */
  | 'network'
  /** 裏側が理由を付けずに失敗を返した（code だけのことがある） */
  | 'unknown';

export type DxCheckInResult =
  | { ok: true }
  | { ok: false; reason: DxFailReason; code?: number };

/** 裏側が名前で返してくる理由。ここに無いものは 'unknown' に寄せる */
const KNOWN_DX_REASONS: string[] = [
  'noDxUrl', 'badDxUrl', 'notEnrolled', 'noPassword', 'dxLoginFailed',
];

/** 知らない理由を勝手に別の理由へ寄せないこと（誤った案内を出すことになる） */
export function normalizeDxReason(reason: unknown): DxFailReason {
  const s = typeof reason === 'string' ? reason : '';
  return KNOWN_DX_REASONS.indexOf(s) !== -1 ? (s as DxFailReason) : 'unknown';
}

/** 裏側の応答（{ok, reason, code}）を画面が使える形にする */
export function toDxResult(data: { ok?: boolean; reason?: unknown; code?: unknown } | undefined): DxCheckInResult {
  if (data?.ok === true) return { ok: true };
  const code = typeof data?.code === 'number' ? data.code : undefined;
  return { ok: false, reason: normalizeDxReason(data?.reason), code };
}
