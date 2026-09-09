// ログインの状態を配るための入れ物。
// ★AuthProvider（コンポーネント）とは別ファイルにしてある。
//   1つのファイルからコンポーネントとそれ以外を両方出すと、
//   開発中の画面の差し替え（Fast Refresh）が効かなくなるため。
import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

export interface AuthValue {
  /** 学校のアカウントで確認できている人。それ以外は必ず null */
  user: User | null;
  /** 最初の確認が終わるまで true（この間は画面を出さない） */
  loading: boolean;
  /** ログインに失敗した理由（画面に出す文言） */
  error: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の中で使ってください');
  return ctx;
}
