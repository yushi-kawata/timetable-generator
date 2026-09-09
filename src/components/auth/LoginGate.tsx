// ============================================================================
// ログイン画面（未ログインのときに、これだけを出す）／台帳 A4-41
// ============================================================================
// ★2026-09-09 の決裁で、生徒の younetDX メール＋パスワード入力は廃止。
//   生徒も先生も、入口はこの Google ログイン1つだけ。
import { useAuth } from '../../hooks/auth-context';
import { ALLOWED_DOMAIN } from '../../firebase';

export default function LoginGate() {
  const { login, error } = useAuth();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-start pt-8 px-1">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-2xl font-bold mb-4 shadow-lg shadow-blue-200">
            Y
          </div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">通学生ポータル</h1>
          <p className="text-sm text-[var(--ink3)] mt-1">勇志国際高等学校 福岡学習センター</p>
        </div>

        <div className="card !mb-0 shadow-lg shadow-stone-200/50">
          <div className="text-center">
            <div className="text-sm font-bold text-[var(--ink)] mb-1">学校のアカウントでログイン</div>
            <p className="text-xs text-[var(--ink3)] mb-6 leading-relaxed">
              学校から配られている Google アカウント
              <br />
              （<span className="font-mono break-all">@{ALLOWED_DOMAIN}</span>）でログインしてください
            </p>

            <button
              onClick={login}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 transition-all shadow-md shadow-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              Google でログイン
            </button>

            {error && (
              <div
                role="alert"
                className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg text-left leading-relaxed"
              >
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
          <div className="text-xs font-bold text-blue-700 mb-2">ご利用手順</div>
          <ol className="space-y-1.5 text-xs text-blue-600 list-none">
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[18px]">1.</span>
              <span>学校の Google アカウントでログイン</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[18px]">2.</span>
              <span>「登校しました」ボタンを押す</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[18px]">3.</span>
              <span>younetDX の出席も自動で登録されます</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[18px]">4.</span>
              <span>時間割を確認してください</span>
            </li>
          </ol>
        </div>

        <p className="text-[11px] text-[var(--ink3)] text-center mt-5 leading-relaxed">
          ログインできないときは、担当の先生にお伝えください
        </p>
      </div>
    </div>
  );
}
