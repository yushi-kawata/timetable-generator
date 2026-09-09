// ============================================================================
// 職員か生徒か（メールの形で決める）／台帳 A4-41
// ============================================================================
// ★これは【表示の出し分け】のためだけの判定です。権限の境目ではありません。
//   権限の境目は裏側（GAS の classifyRole_ / accessDenyReason_）が持っています。
//   ここを書き換えて画面の出し分けを破っても、名簿も申告も出てきません
//   （窓口が forbidden を返します）。
//
// ★裏側と同じ判定にしてあります。片方だけ変えないこと。
//   ゆるくすると「画面は出すのに叩くと全部拒否される」、
//   きつくすると「裏は通すのに画面が出ない」という切り分け不能な状態になります。
//   正本 = gas-script.本番_A4-41_番人入り_20260908.js の classifyRole_()
//
// ★★最大の落とし穴: 生徒も職員も「s」で始まります。
//   「s で始まったら生徒」と書くと【職員が全員生徒扱い】になります。
//   分かれ目は「1文字目の次が数字か、ハイフンか」です。
import { isAllowedDomain } from '../firebase';

/** 生徒 = アルファベット1文字 ＋ 数字8桁（例: s26100012） */
const STUDENT_LOCAL_RE = /^[a-z][0-9]{8}$/;
/** 職員 = ハイフンを含む（例: s-kawata / sa-sakai）。ハイフンの前後に1文字以上を求める */
const STAFF_LOCAL_RE = /^[a-z0-9._]+-[a-z0-9._-]+$/;

/** 'staff' / 'student' / null（＝どちらでもない＝使わせない） */
export type Role = 'staff' | 'student' | null;

/**
 * メールから役割を決める。
 * ★小文字化し、前後の空白を落としてから見る（裏側の normEmail_ と同じ）。
 * ★想定外の形は職員側に倒さない。
 *   職員が誤って弾かれたらすぐ直せるが、生徒が職員になると誰も気づけない。
 */
export function classifyRole(email: string): Role {
  const e = String(email || '').trim().toLowerCase();
  if (!isAllowedDomain(e)) return null;   // @無し・@が2つ・別ドメインをここで落とす
  const local = e.slice(0, e.indexOf('@'));
  if (STUDENT_LOCAL_RE.test(local)) return 'student';   // ★生徒を先に見る
  if (STAFF_LOCAL_RE.test(local)) return 'staff';
  return null;                                          // 第3の分類＝使わせない
}
