// ============================================================================
// いまどの画面にいるか（URL のハッシュを見る）── 台帳 A4-120
// ============================================================================
// ★行き先の判定そのものは src/lib/route.ts が正本です（ここには書かない）。
//   このファイルは【ブラウザの URL を React に伝える】ためだけにあります。
//
// ★react-router を入れていない理由は lib/route.ts の頭の注記が正本です。
//
// ★戻るボタン・進むボタンは、ブラウザが元から持っている履歴で動きます。
//   （hashchange は、戻る／進むでも発火します）
import { useSyncExternalStore } from 'react';
import { parseRoute, ROUTE_HASH } from '../lib/route';
import type { RouteName } from '../lib/route';

function subscribe(onChange: () => void): () => void {
  // hashchange だけで足りますが、popstate も拾っておきます（二重に呼ばれても
  // useSyncExternalStore が同じ値なら描き直しません）。
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

function getSnapshot(): string {
  return window.location.hash;
}

/** いまのハッシュと、そこから決まる行き先（知らない行き先は null） */
export function useRoute(): { hash: string; route: RouteName | null } {
  const hash = useSyncExternalStore(subscribe, getSnapshot);
  return { hash, route: parseRoute(hash) };
}

/**
 * その画面へ移る（★履歴に1つ積む＝戻るボタンで前の画面に戻れる）。
 */
export function goTo(route: RouteName): void {
  window.location.hash = ROUTE_HASH[route];
}

/**
 * いまの履歴を【差し替えて】その画面へ移る（戻るボタンの行き先を増やさない）。
 * ★入っている人が変わったときに使います。前の人が見ていた画面を、
 *   戻るボタンで開けるようにしないため。
 */
export function replaceWith(route: RouteName): void {
  const { pathname, search } = window.location;
  window.location.replace(pathname + search + ROUTE_HASH[route]);
}
