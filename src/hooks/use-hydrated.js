'use client';

/**
 * Whether this component has hydrated on the client yet.
 *
 * ── What it is for ──────────────────────────────────────────────────────────
 *
 * A control whose appearance depends on something only the browser knows — the
 * resolved theme, a localStorage value, `window.matchMedia` — cannot render
 * that on the server, so the first client render has to match the server's
 * output exactly and only then switch. Rendering the browser answer straight
 * away is a hydration mismatch, and React discards the server HTML when it
 * finds one.
 *
 * ── Why not useState + useEffect ────────────────────────────────────────────
 *
 * `const [m, setM] = useState(false); useEffect(() => setM(true), [])` is the
 * familiar spelling and it works, but it is a state update scheduled from an
 * effect purely to record a fact React already knows — one extra commit and one
 * extra render on every component that does it, and the thing the lint rule
 * react-hooks/set-state-in-effect is pointing at.
 *
 * useSyncExternalStore says the same thing directly: the server snapshot is
 * false, the client snapshot is true, and there is nothing to subscribe to
 * because the answer never changes again. React switches it as part of
 * hydration rather than in a render of its own.
 *
 * Matches the store pattern already used in _components/compareStore.js and
 * cars/_components/resultsCount.js.
 */

import { useSyncExternalStore } from 'react';

/** Nothing ever changes, so the subscribe callback is never invoked. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
