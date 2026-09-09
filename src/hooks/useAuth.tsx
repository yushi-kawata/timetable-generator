// ============================================================================
// ログイン（Firebase Authentication / Google）／台帳 A4-41
// ============================================================================
// 手本 = yushi-student-portal/src/hooks/useAuth.jsx
//
// 通すのは @yushi-kokusai.jp のアカウントで、かつメール確認済みのものだけ。
// ★これは裏側（GAS の verifyIdToken_）と同じ判定を、画面側でもやっている。
//   サーバーの fail close に頼らず手前で止めるため（申し送りの指示）。
//   ★片方だけ変えないこと。ゆるくすると「画面は通すのに裏で全部拒否される」、
//     きつくすると「裏は通すのに画面に入れない」という切り分け不能な状態になる。
//
// ★このファイルが出すのは AuthProvider だけ。useAuth は auth-context.ts にある。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, ALLOWED_DOMAIN, isAllowedDomain } from '../firebase';
import { AuthContext, type AuthValue } from './auth-context';

/** 通してよいアカウントか。ダメなら画面に出す文言を返す */
function rejectReason(u: User): string {
  const email = (u.email || '').toLowerCase();
  if (!isAllowedDomain(email)) {
    return `学校のアカウント（@${ALLOWED_DOMAIN}）でログインしてください`;
  }
  // ★裏側は emailVerified !== true を拒否する。ここで止めないと
  //   「ログインできたのに何をしても拒否される」状態になり、原因が分からなくなる。
  if (u.emailVerified !== true) {
    return 'メールアドレスの確認が済んでいないアカウントです（担当の先生にお伝えください）';
  }
  return '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      const reason = rejectReason(firebaseUser);
      if (reason) {
        // 通せないアカウントは、そのままにせずサインアウトさせる
        void signOut(auth);
        setUser(null);
        setError(reason);
      } else {
        setUser(firebaseUser);
        setError('');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async () => {
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const reason = rejectReason(result.user);
      if (reason) {
        await signOut(auth);
        setError(reason);
      }
    } catch (err: unknown) {
      // ★エラーの中身を捨てない。捨てると「ログインできません」だけが残り、
      //   準備1（承認済みドメイン）の入れ忘れなのか、ポップアップを閉じただけなのか
      //   誰にも切り分けられなくなる。Firebase のコードは秘密情報ではない。
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('ログインの画面が閉じられました。もう一度お試しください');
      } else if (code === 'auth/popup-blocked') {
        setError('ブラウザがログイン画面をブロックしました。ポップアップを許可してください');
      } else if (code === 'auth/unauthorized-domain') {
        setError('このアドレスからはログインできません（担当の先生にお伝えください）');
      } else if (code === 'auth/network-request-failed') {
        setError('ネットワークにつながりません。通信の状態を確かめてください');
      } else {
        setError(`ログインに失敗しました（${code || '原因不明'}）`);
      }
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, error, login, logout }),
    [user, loading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
