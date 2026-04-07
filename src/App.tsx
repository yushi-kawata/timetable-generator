import { useState, useEffect } from 'react';
import StudentPage from './components/student/StudentPage';
import TeacherPage from './components/teacher/TeacherPage';
import AdminPage from './components/admin/AdminPage';
import HealthCheckPage from './components/health/HealthCheckPage';
import { useAppStore } from './stores/useMasterStore';

type Mode = 'student' | 'teacher' | 'admin' | 'health';

export default function App() {
  const fetchAll = useAppStore((s) => s.fetchAll);

  useEffect(() => { fetchAll(); }, []);

  const [mode, setMode] = useState<Mode>('student');
  const [authed, setAuthed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const adminPw = localStorage.getItem('admin_pw') || 'teacher1234';

  const handleAdminClick = () => {
    if (authed) {
      setMode('admin');
    } else {
      setShowPw(true);
      setPwInput('');
      setPwError('');
    }
  };

  const checkPw = () => {
    if (pwInput === adminPw) {
      setAuthed(true);
      setShowPw(false);
      setMode('admin');
    } else {
      setPwError('パスワードが正しくありません');
      setPwInput('');
    }
  };

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <header className="bg-[var(--ink)] text-white px-4 sm:px-8 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold flex items-center gap-2">
            <span>📅</span> 通信制高校 時間割システム
          </h1>
          <span
            className={`text-[11px] font-bold px-3 py-1 rounded-full tracking-wide ${
              mode === 'student'
                ? 'bg-green-400 text-green-900'
                : mode === 'health'
                  ? 'bg-rose-400 text-rose-900'
                  : 'bg-amber-400 text-amber-900'
            }`}
          >
            {mode === 'student' ? '生徒用' : mode === 'health' ? '健康観察' : '教員用'}
          </span>
        </div>
        <div className="flex gap-3 text-sm">
          {mode !== 'student' && mode !== 'health' && (
            <button
              onClick={() => setMode('student')}
              className="text-white/60 hover:text-white"
            >
              ← 生徒用に戻る
            </button>
          )}
          {mode === 'health' && (
            <button
              onClick={() => setMode('student')}
              className="text-white/60 hover:text-white"
            >
              ← 戻る
            </button>
          )}
          {mode === 'student' && (
            <>
              <button
                onClick={() => setMode('health')}
                className="text-white/60 hover:text-white"
              >
                🏥 健康観察
              </button>
              <button
                onClick={handleAdminClick}
                className="text-white/60 hover:text-white"
              >
                教員用ページ →
              </button>
            </>
          )}
          {(mode === 'teacher' || mode === 'admin') && (
            <button
              onClick={() => setMode('health')}
              className="text-white/60 hover:text-white"
            >
              🏥 健康観察
            </button>
          )}
        </div>
      </header>

      {/* パスワードモーダル */}
      {showPw && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowPw(false)}
        >
          <div
            className="bg-[var(--surface)] rounded-2xl p-10 w-full max-w-sm shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">🔐 教員用ページ</h2>
            <p className="text-sm text-[var(--ink3)] mb-6">パスワードを入力してください</p>
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkPw()}
              placeholder="••••••••"
              className="w-full text-center text-base px-4 py-3 border-2 border-[var(--border)] rounded-xl bg-[var(--surface2)] tracking-widest mb-2 focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            {pwError && (
              <p className="text-sm text-red-600 mb-3">❌ {pwError}</p>
            )}
            <button
              onClick={checkPw}
              className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 mt-2"
            >
              ログイン
            </button>
            <button
              onClick={() => setShowPw(false)}
              className="w-full py-2 text-sm text-[var(--ink3)] mt-3 hover:text-[var(--ink)]"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="max-w-[1050px] mx-auto px-4 sm:px-5 py-7 pb-16">
        {mode === 'student' && <StudentPage />}
        {mode === 'teacher' && <TeacherPage />}
        {mode === 'admin' && <AdminPage goTeacher={() => setMode('teacher')} />}
        {mode === 'health' && <HealthCheckPage isTeacher={authed} />}
      </main>
    </div>
  );
}
