/* ============================================================================
   窓口URLの決め方の試験 ── 台帳 A4-94（2026-09-14）
   ============================================================================
   2026-09-14 の障害＝端末の localStorage に残っていた gas_url が古く、
   生徒全員が「ログインし直してください」になった。シークレットモードで
   開くと直った（localStorage を引き継がないため）。

   ここで守ること:
     ・生徒の画面は上書きを読まない（上書きは管理用の機能）
     ・形の壊れた上書きは捨てる
     ・どこから読んでも同じ URL になる（読み方が2通りある状態をやめる）
     ・黙って「窓口が無い」状態にしない
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const { isValidGasUrl, resolveGasUrl } = await loadTs('src/lib/gasUrl.ts');

const DEF = 'https://script.google.com/macros/s/AKfycbDEFAULT000000000000/exec';
const OTHER = 'https://script.google.com/macros/s/AKfycbOTHER1111111111111/exec';

test('上書きが無ければ既定を使う', () => {
  const r = resolveGasUrl({ saved: null, def: DEF, role: 'staff' });
  assert.equal(r.url, DEF);
  assert.equal(r.usedOverride, false);
});

// ── 本体1: 生徒は上書きを読まない ──────────────────────────────────
test('★生徒は上書きを読まない（端末に古い窓口が残っていても既定で動く）', () => {
  const r = resolveGasUrl({ saved: OTHER, def: DEF, role: 'student' });
  assert.equal(r.url, DEF, '生徒は常に既定の窓口を使う');
  assert.equal(r.discarded, 'student');
});

test('職員は上書きを使える（開発・切り替えのための機能は残す）', () => {
  const r = resolveGasUrl({ saved: OTHER, def: DEF, role: 'staff' });
  assert.equal(r.url, OTHER);
  assert.equal(r.usedOverride, true);
});

test('役割が分からないアカウントも上書きを読まない', () => {
  const r = resolveGasUrl({ saved: OTHER, def: DEF, role: null });
  assert.equal(r.url, DEF);
});

// ── 本体2: 壊れた上書きは捨てる ────────────────────────────────────
test('★形の壊れた上書きは捨てて既定に落とす（黙って窓口を失わない）', () => {
  for (const bad of ['', '   ', 'not-a-url', 'http://evil.example/exec', 'javascript:alert(1)',
                     'https://script.google.com/macros/s/AKfycb000/', 'https://example.com/exec']) {
    const r = resolveGasUrl({ saved: bad, def: DEF, role: 'staff' });
    assert.equal(r.url, DEF, `「${bad}」は捨てて既定に落とすこと`);
    assert.equal(r.discarded, 'invalid');
  }
});

test('窓口URLの形を見分けられる', () => {
  assert.equal(isValidGasUrl(DEF), true);
  assert.equal(isValidGasUrl('https://script.google.com/macros/s/AKfycbX/exec'), true);
  assert.equal(isValidGasUrl('https://script.google.com/macros/s/AKfycbX/dev'), false);
  assert.equal(isValidGasUrl('https://script.google.com.evil.example/macros/s/AKfycbX/exec'), false);
  assert.equal(isValidGasUrl(null), false);
  assert.equal(isValidGasUrl(123), false);
});

// ── 本体3: 既定が無いという状態を黙って作らない ───────────────────
test('★既定が空なら、そうと分かる形で返す（黙って空文字を配らない）', () => {
  const r = resolveGasUrl({ saved: null, def: '', role: 'staff' });
  assert.equal(r.url, '');
  assert.equal(r.discarded, 'noDefault');
});
