// 描画実測のときだけ使う vite 設定（本番のビルドには関係しません）
// ★このリポジトリは他の担当と同じ作業ツリーを共有しているため、
//   実測の最中に別の人がファイルを書き換えると HMR がページを丸ごと再読み込みし、
//   画面の状態（登校の記録など）が消えて、実測が「出ていない」と誤報します。
//   実測中だけ監視と HMR を止めるための設定です。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'C:/Users/s-kaw/timetable-generator',
  plugins: [react(), tailwindcss()],
  base: '/timetable-generator/',
  server: {
    port: 5175,
    strictPort: true,
    hmr: false,
    watch: { ignored: ['**/*'] },
  },
});
