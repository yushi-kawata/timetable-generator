// ============================================================================
// GAS の応答が不安定なときの、やり直しの決まり ── 台帳 A4-101
// ============================================================================
// ★何が起きていたか（2026-09-18 実測）
//   画面が断続的に「通信に失敗しました」になる。コンソールに
//   script.googleusercontent.com への 404 が6件＝画面が読み込み時に叩く窓口の数。
//   これは GAS の応答の2段目（echo脚）が落ちている状態で、
//   ・窓口そのものは生きている（同時刻に叩くと 200 と正しい JSON が返る）
//   ・端末の gas_url 上書きは無い（A4-94 とは別）
//   ＝【こちらは正しく叩いているのに、たまたま返事が返ってこない】種類の失敗。
//   やり直せば通るので、やり直す。
//
// ★★やり直してよいものと、いけないものを必ず分けること。
//   ・やり直す … つながらない／404・5xx／返事が JSON として読めない
//   ・やり直さない … unauthorized / forbidden
//        ＝【拒否は正しい返事】。何度叩いても同じで、記録（audit）を汚すだけ。
//   ・やり直さない … 書き込み（saveSeating・saveStudents・checkIn など）
//        ★★成功したかもしれない要求を送り直すと【二重に書く】恐れがある。
//          書き込みのやり直しが要るなら、二重に書かない仕組み（受付番号など）と
//          セットで設計すること。ここでは入れない。
//
// ★この判断は「読み取りの窓口の名前を並べた表」で決めます。
//   ★表に無いものは【やり直さない】側に倒れます。新しい窓口を足す人が
//     うっかり書き込みを再送してしまうより、やり直さないほうが安全なためです。

/** 2回目・3回目までの待ち時間。★ここを増やすと画面が固まって見える */
export const GAS_RETRY_DELAYS_MS = [300, 800];

/** 最大で何回叩くか（初回 ＋ やり直し） */
export const GAS_MAX_ATTEMPTS = GAS_RETRY_DELAYS_MS.length + 1;

/**
 * やり直してよい【読み取り】の窓口。
 * ★ここに足す前に、その窓口が本当に書かないことを確かめること。
 */
export const RETRYABLE_READ_ACTIONS = [
  'getTT',
  'getMe',
  'getStudents',
  'getAttendance',
  'getPeriod2',
  'getRecs',
  'getSeating',
];

/** その窓口はやり直してよいか。★知らない名前は false（安全側） */
export function isRetryableAction(action: string): boolean {
  return RETRYABLE_READ_ACTIONS.indexOf(String(action || '')) !== -1;
}

/**
 * 1回叩いた結果の種類。
 *  networkError … fetch が投げた（つながらない・切れた）
 *  httpError    … HTTP が 200 以外（★404 がこの案件の本体）
 *  badJson      … 返事が JSON として読めない（空の返事もここ）
 *  rejected     … 窓口が拒否した（unauthorized / forbidden）★正しい返事
 *  ok           … 通った
 */
export type GasOutcome = 'networkError' | 'httpError' | 'badJson' | 'rejected' | 'ok';

/**
 * もう一度叩くか。
 * @param attempt 何回目を終えたか（1 なら初回が終わったところ）
 */
export function shouldRetry(input: {
  action: string;
  outcome: GasOutcome;
  attempt: number;
}): boolean {
  const { action, outcome, attempt } = input;
  if (outcome === 'ok') return false;
  // ★拒否は正しい返事。やり直しても同じで、記録を汚すだけ
  if (outcome === 'rejected') return false;
  // ★書き込みは送り直さない（二重に書く恐れ）
  if (!isRetryableAction(action)) return false;
  return attempt < GAS_MAX_ATTEMPTS;
}

/** 次の待ち時間（ミリ秒）。もう待たないなら 0 */
export function retryDelayMs(attempt: number): number {
  const i = attempt - 1;
  if (i < 0 || i >= GAS_RETRY_DELAYS_MS.length) return 0;
  return GAS_RETRY_DELAYS_MS[i];
}

/**
 * どの窓口に繋ぎに行ったかを、末尾だけで示す。
 * ★全部は出しません（長いうえ、画面に出す意味がない）。
 *   切り分けに要るのは「いつもと同じ窓口か」が分かることだけです。
 */
export function urlTail(url: string, n = 20): string {
  const s = String(url || '');
  if (!s) return '(窓口の設定なし)';
  if (s.length <= n) return s;
  return '…' + s.slice(s.length - n);
}

/**
 * 失敗したときに画面へ出す1行。
 * ★台帳 A4-101 の切り分けに20分かかった。画面に出ていれば1分で済む情報を出す:
 *   HTTPの番号／何回試したか／どの窓口か（末尾）。
 * ★専門用語は避ける（先生が読む文なので）。
 */
export function gasFailureDetail(input: {
  status?: number | null;
  attempts: number;
  url: string;
}): string {
  const parts: string[] = [];
  if (input.status) parts.push('応答 ' + input.status);
  parts.push(input.attempts + ' 回試しました');
  parts.push('窓口 ' + urlTail(input.url));
  return parts.join('／');
}

/** 不安定なときの言い方（★「壊れた」と言わない。実際つなぎ直せば通る） */
export const MSG_GAS_FLAKY = 'Googleの応答が不安定です。もう一度お試しください';
