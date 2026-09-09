// ============================================================================
// Firebase（プロジェクト = yushi-meta）
// ============================================================================
// 生徒ポータル（yushi-student-portal/src/firebase.js）と同じプロジェクト・
// 同じ設定です。ここに書いてある apiKey は「鍵」ではなく、どのプロジェクトかを
// 示す名札です。公開されても差し支えありません
// （本人の証明は、ログインのときに配られる IDトークンの署名で行っています）。
//
// ★このツールは GitHub Pages（yushi-kawata.github.io）から動きます。
//   Firebase の Authentication →「設定」→「承認済みドメイン」に
//   yushi-kawata.github.io が入っていないと、ログインのボタンを押した瞬間に
//   auth/unauthorized-domain で失敗します（手順書 A4-41 の「準備1」）。
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAH4cC52Drm2P4pWvxbVcgocDfvEh4vfNM',
  authDomain: 'yushi-meta.firebaseapp.com',
  projectId: 'yushi-meta',
  storageBucket: 'yushi-meta.firebasestorage.app',
  messagingSenderId: '760692039539',
  appId: '1:760692039539:web:0767d03759577381c26f06',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/** 通すアカウントのドメイン。★裏側（GAS の ALLOWED_DOMAIN_）と必ず同じ値にすること */
export const ALLOWED_DOMAIN = 'yushi-kokusai.jp';

/**
 * 学校のアカウントかどうか。
 * ★裏側の isAllowedDomain_() と同じ判定にしてある。
 *   「@ が2つ以上」「末尾が完全一致しない」を弾く。
 *   例: a@yushi-kokusai.jp.example.com → 拒否
 *       a@yushi-kokusai.jp.evil@x.com  → 拒否
 * endsWith('@' + ドメイン) だけだと 2つ目の例を通してしまうので、そうはしない。
 */
export function isAllowedDomain(email: string): boolean {
  const e = String(email || '').toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return false;
  if (e.indexOf('@', at + 1) !== -1) return false;
  return e.slice(at + 1) === ALLOWED_DOMAIN;
}
