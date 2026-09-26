/* ============================================================================
   端末（localStorage）に残す項目の試験
   ============================================================================
   守りたいこと:
     ・書くのは時間割の表（tt）だけ。名簿（students）・申告（records）・
       パスワードは書かない
     ・前の版で保存したデータ（名簿入り）を読んでも壊れない。
       tt は引き継ぎ、名簿は拾わず、読み込んだ時点で端末からも消える
     ・壊れたデータ・形の違うデータを読んでも落ちない

   ★本物の zustand の persist に、作り物の保存場所を与えて動かす。
     決まりの関数だけを試しても、ストアがそれを使っているかは分からないので、
     最後に useMasterStore.ts がこの決まりを使っていることも見る。

   負の対照（★わざと壊して赤くなることを確かめる）:
     PERSIST_POLICY_TS=<壊した写し>  node --test tests/persistPolicy.test.mjs
     MASTER_STORE_TS=<壊した写し>    node --test tests/persistPolicy.test.mjs
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { loadTs } from './_load-ts.mjs';

const POLICY_TS = process.env.PERSIST_POLICY_TS || 'src/stores/persistPolicy.ts';
const STORE_TS = process.env.MASTER_STORE_TS || 'src/stores/useMasterStore.ts';

const P = await loadTs(POLICY_TS);

const TT = { 月: { 'A教室': ['', '国語', '', '', '', ''] } };
const DEFAULT_TT = { 月: {} };

// ★架空の値だけを使う（実在の人名・メールを試験に入れない）
const STUDENTS = [{
  name: '試験 太郎', grade: '2年', classroom: '学年教室',
  dx_email: 'x00000000@example.invalid', dx_password: 'not-a-real-password',
  days: { 月: true, 火: false, 水: false, 木: false, 金: false },
}];
const RECORDS = [{ id: 1, name: '試験 太郎', week: '2026-W39', days: [], sel: {} }];

/** 作り物の保存場所（同期） */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

/** useMasterStore.ts と同じ組み合わせで、小さなストアを作る */
function makeStore(storage) {
  return create()(
    persist(
      (set) => ({
        tt: DEFAULT_TT,
        records: [],
        students: [],
        setAll: (v) => set(v),
      }),
      {
        name: P.PERSIST_NAME,
        version: P.PERSIST_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (s) => P.partializeForDevice(s),
        migrate: (persisted) => P.migratePersisted(persisted),
        merge: (persisted, current) => P.mergePersisted(persisted, current),
      },
    ),
  );
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

const stored = (storage) => JSON.parse(storage.getItem(P.PERSIST_NAME));

test('★書くのは tt だけ（名簿・申告・パスワードを端末に書かない）', async () => {
  const storage = memoryStorage();
  const useStore = makeStore(storage);
  await settle();
  useStore.getState().setAll({ tt: TT, students: STUDENTS, records: RECORDS });

  const raw = storage.getItem(P.PERSIST_NAME);
  assert.deepEqual(Object.keys(JSON.parse(raw).state), ['tt']);
  assert.equal(raw.includes('not-a-real-password'), false, '★パスワードが端末に書かれている');
  assert.equal(raw.includes('example.invalid'), false, '★メールが端末に書かれている');
  assert.equal(raw.includes('試験 太郎'), false, '★氏名が端末に書かれている');
  // 画面の中では名簿は使える（残さないのは端末の保存だけ）
  assert.equal(useStore.getState().students.length, 1);
});

test('★前の版（名簿入り）を読んでも壊れない：tt は引き継ぎ、名簿は拾わない', async () => {
  const old = JSON.stringify({ state: { tt: TT, records: RECORDS, students: STUDENTS }, version: 0 });
  const storage = memoryStorage({ [P.PERSIST_NAME]: old });
  const useStore = makeStore(storage);
  await settle();

  const st = useStore.getState();
  assert.deepEqual(st.tt, TT, '★時間割の表が引き継がれていない');
  assert.deepEqual(st.students, [], '★古い名簿が画面に戻ってきている');
  assert.deepEqual(st.records, [], '★古い申告が画面に戻ってきている');
});

test('★前の版を読んだ時点で、端末に残っていた名簿が消える（書き戻される）', async () => {
  const old = JSON.stringify({ state: { tt: TT, records: RECORDS, students: STUDENTS }, version: 0 });
  const storage = memoryStorage({ [P.PERSIST_NAME]: old });
  makeStore(storage);
  await settle();

  const after = stored(storage);
  assert.equal(after.version, P.PERSIST_VERSION);
  assert.deepEqual(Object.keys(after.state), ['tt']);
  assert.equal(storage.getItem(P.PERSIST_NAME).includes('not-a-real-password'), false);
});

test('★版の番号が今と同じでも、名簿が混ざっていれば拾わない', async () => {
  const odd = JSON.stringify({ state: { tt: TT, students: STUDENTS }, version: P.PERSIST_VERSION });
  const storage = memoryStorage({ [P.PERSIST_NAME]: odd });
  const useStore = makeStore(storage);
  await settle();
  assert.deepEqual(useStore.getState().students, []);
  assert.deepEqual(useStore.getState().tt, TT);
});

test('壊れた・形の違うデータでも落ちず、既定の表で動く', () => {
  for (const bad of [null, undefined, 1, 'x', [], { tt: null }, { tt: [] }, { tt: 'x' }]) {
    assert.deepEqual(P.pickDeviceFields(bad), {}, JSON.stringify(bad));
  }
  const cur = { tt: DEFAULT_TT, students: [{ name: 'a' }] };
  assert.deepEqual(P.mergePersisted({ tt: [] }, cur), cur);
});

test('localStorage のキーは前と同じ（変えると古いキーの名簿が消されずに残る）', () => {
  assert.equal(P.PERSIST_NAME, 'timetable-system-v5');
  assert.ok(P.PERSIST_VERSION >= 1);
});

// ── ストアが本当にこの決まりを使っているか ─────────────────────────────
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const store = stripComments(readFileSync(STORE_TS, 'utf8'));

test('★useMasterStore の persist が、この決まり（書く・版・移し替え・重ね方）を使っている', () => {
  const m = store.match(/\{\s*name:\s*PERSIST_NAME,[\s\S]*?\}\s*\)\s*\)\s*;?\s*$/);
  assert.ok(m, '★persist の設定が見つからない（決まりを使っていない）');
  const opts = m[0];
  assert.ok(/version:\s*PERSIST_VERSION/.test(opts), '★版の番号を渡していない');
  assert.ok(/partialize:[^\n]*partializeForDevice/.test(opts), '★書く項目を絞っていない');
  assert.ok(/migrate:[^\n]*migratePersisted/.test(opts), '★前の版の移し替えが無い');
  assert.ok(/merge:[^\n]*mergePersisted/.test(opts), '★重ね方を絞っていない');
  assert.equal(/students:\s*s\.students/.test(store), false, '★名簿を書く形が残っている');
});
