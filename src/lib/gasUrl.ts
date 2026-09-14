// ============================================================================
// 窓口（GAS）URL の決め方 ── 台帳 A4-94（2026-09-14）
// ============================================================================
// ★2026-09-14 の障害
//   生徒全員が「ログインし直してください」になった。シークレットモードで開くと
//   直った＝原因は端末の localStorage に残っていた gas_url。
//   古い窓口を握った端末だけが、誰にも気づかれずに死んでいた。
//
// ★なぜ悪化したか（作りの問題）
//   同じ値を2箇所が別の作法で読んでいた。
//     gasCall  … localStorage.getItem('gas_url') || DEFAULT_GAS_URL  → 既定に落ちる
//     fetchAll … const url = localStorage.getItem('gas_url'); if (!url) return;  → 黙って止まる
//   「読み方が2通りある」こと自体が事故の温床なので、ここ1箇所に集約する。
//
// ★決めたこと
//   1. 生徒の画面は上書きを【読まない】。上書きは管理用の機能で、生徒が持つ理由が無い。
//      ★これが根治。次に窓口URLが変わっても、生徒47人は巻き込まれない。
//   2. 形の壊れた上書きは捨てて既定に落とす（黙って窓口を失わない）。
//   3. 既定が空なら、そうと分かる形で返す（空文字を配って静かに死なせない）。
//
// ★localStorage は「オリジン」単位で共有される。
//   GitHub Pages の yushi-kawata.github.io は【この アカウントの全ページで1つのオリジン】。
//   つまり別のツールが書いた gas_url もここから見える。
//   生徒が上書きを読まない作りにしておくと、この経路の巻き添えも同時に防げる。
// ============================================================================

/** 'staff' 以外（生徒・判定不能）は上書きを読まない */
export type GasUrlRole = 'staff' | 'student' | null;

export type GasUrlResolution = {
  /** 実際に使う URL。空文字なら窓口が無い */
  url: string;
  /** 上書きを採用したか */
  usedOverride: boolean;
  /**
   * 上書きを使わなかった理由。
   *  none       … 上書きが無い／採用した
   *  student    … 職員でないので読まなかった
   *  invalid    … 形が壊れていたので捨てた
   *  noDefault  … 既定そのものが無い（作りの問題）
   */
  discarded: 'none' | 'student' | 'invalid' | 'noDefault';
};

/** 窓口URLの形。デプロイ済みの /exec だけを通す（/dev や別ドメインは通さない） */
const GAS_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export function isValidGasUrl(value: unknown): boolean {
  return typeof value === 'string' && GAS_URL_RE.test(value.trim());
}

/**
 * 使う窓口URLを決める。★ここが唯一の決定箇所。
 * gasCall も fetchAll もこの結果を使うこと（別々に localStorage を読まない）。
 */
export function resolveGasUrl(input: {
  saved: string | null | undefined;
  def: string;
  role: GasUrlRole;
}): GasUrlResolution {
  const { saved, def, role } = input;

  // 既定が無いのは作りの問題。黙って空文字を配らず、そうと分かる形で返す
  if (!def) return { url: '', usedOverride: false, discarded: 'noDefault' };

  // ★生徒（と判定不能）は上書きを読まない。ここが今回の根治
  if (role !== 'staff') {
    return { url: def, usedOverride: false, discarded: saved ? 'student' : 'none' };
  }

  if (saved === null || saved === undefined) {
    return { url: def, usedOverride: false, discarded: 'none' };
  }
  if (!isValidGasUrl(saved)) {
    return { url: def, usedOverride: false, discarded: 'invalid' };
  }
  return { url: saved.trim(), usedOverride: true, discarded: 'none' };
}
