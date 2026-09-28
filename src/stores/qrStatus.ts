/* ============================================================================
   教務システム（younetDX）用QRが「今日のものか」── 台帳 A4-98 恒久対処(2)（2026-09-28）
   ============================================================================
   ★何が起きていたか
     QRのURLは todate=<64桁> の【日付ごとのトークン】。スクレイパーが止まると
     QRの窓口は前日のQRを配り続け、画面はそれをそのまま younetDX へ送っていた
     （2026-09-15。qrData.date は画面のどこでも読まれていなかった）。
     前日のトークンで開くと出欠フォームが無く、「教務システムに入れませんでした」になる。
   ★ここで決めていること
     ・日付が今日（日本時間）と一致したQRだけを 'ok' として持つ
     ・日付が違う／無い／読めない → 'stale'（QRは持たない）
     ・取りに行けなかった・窓口が断った・中身が無い → 'error'
       ★以前は catch {} で全部捨てていた＝「届いていない」と「取れなかった」の
         区別が付かなかった（[[seikou-ni-mieru-shippai]] と同じ形）。
     ・送る直前にもう一度日付を見る（開いたまま日をまたいだ画面のため）
   ★限界（画面側だけでは止められないもの）
     QRの窓口は、QRの読み取りに失敗した朝に【URLは前日のまま・日付は今日】で
     保存する作りになっている（younetdx-scraper/gas_qr.js の resolveUrl_）。
     URLの中のトークンに日付は書かれていないので、この場合は画面では見分けられない。
   ★import を持たない（試験で単体読み込みするため）。日付のそろえ方は
     attendanceMatch.ts の toYmd を呼び出し側から渡す（同じ決め方を2か所に書かない）。
   ============================================================================ */

export interface QrData {
  campus: string;
  date: string;
  tokou_qr: string;
  gekou_qr: string;
  tokou_url: string | null;
  gekou_url: string | null;
  updated_at: string;
}

/**
 * QRの状態。
 *  idle  … まだ取りに行っていない
 *  ok    … 今日のQRを持っている
 *  stale … 届いたが今日のものではない（日付が違う／無い／読めない）
 *  error … 取れなかった（通信・JSONでない・窓口が断った・中身が無い）
 */
export type QrStatus = 'idle' | 'ok' | 'stale' | 'error';

export type QrJudgement = {
  status: 'ok' | 'stale' | 'error';
  /** ★'ok' のときだけ入る。古いQRは持たない */
  data: QrData | null;
  /** 届いたQRの日付（YYYY-MM-DD）。読めなければ ''。切り分け用 */
  qrDate: string;
};

/** 日付を "YYYY-MM-DD"（日本時間の暦日）にそろえる関数。読めなければ '' */
export type ToYmd = (value: unknown) => string;

/** 見送りの理由（attendanceFlow の DxSkipReason の一部） */
export type QrSkipReason = 'qrStale' | 'qrError';

export type DxUrlPick =
  | { send: true; url: string }
  | { send: false; why: QrSkipReason };

/** 届いた中身を判定する。★受け取った値は書き換えない */
export function judgeQr(raw: unknown, todayYmd: string, toYmd: ToYmd): QrJudgement {
  if (!raw || typeof raw !== 'object') return { status: 'error', data: null, qrDate: '' };
  const r = raw as Partial<QrData> & { error?: unknown };
  // 窓口が断った返事（{ error: 'unauthorized' } 等）や、QRが1枚も無い返事
  if (r.error || !(r.tokou_qr || r.tokou_url || r.gekou_url)) {
    return { status: 'error', data: null, qrDate: '' };
  }
  const qrDate = toYmd(r.date);
  if (!qrDate || qrDate !== todayYmd) return { status: 'stale', data: null, qrDate };
  return { status: 'ok', data: { ...(r as QrData) }, qrDate };
}

/** 取りに行って判定する。★例外は捨てずに 'error' にする（外へは投げない） */
export async function loadQr(
  fetchJson: () => Promise<unknown>,
  todayYmd: string,
  toYmd: ToYmd,
): Promise<QrJudgement> {
  let raw: unknown;
  try {
    raw = await fetchJson();
  } catch {
    return { status: 'error', data: null, qrDate: '' };
  }
  return judgeQr(raw, todayYmd, toYmd);
}

/**
 * 送る直前に、送ってよいか・どのURLを送るかを決める。
 * ★'ok' でも日付をもう一度見る（昨日開いたままの画面で古いQRを送らない）。
 * ★'ok' でURLだけ空のときは空のまま送る（裏側が noDxUrl を audit に残す＝A4-86）。
 */
export function pickDxUrl(
  st: { status: QrStatus; data: QrData | null },
  op: 'in' | 'out',
  todayYmd: string,
  toYmd: ToYmd,
): DxUrlPick {
  if (st.status === 'stale') return { send: false, why: 'qrStale' };
  if (st.status !== 'ok' || !st.data) return { send: false, why: 'qrError' };
  if (toYmd(st.data.date) !== todayYmd) return { send: false, why: 'qrStale' };
  const url = (op === 'in' ? st.data.tokou_url : st.data.gekou_url) || '';
  return { send: true, url };
}
