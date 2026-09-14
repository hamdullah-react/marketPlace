import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Is the viewport phone-sized?
 *
 * ── Why useSyncExternalStore and not useState + useEffect ───────────────────
 *
 * `matchMedia` IS an external store: it holds a value React does not own and it
 * emits a change event. The previous shape — state seeded as `undefined`, an
 * effect that subscribes and then immediately sets the real answer — read the
 * store twice for no reason and reported `false` for one paint on every mount,
 * because `!!undefined` is false. On a layout that swaps a sidebar for a drawer
 * that is a visible flash of the desktop UI on a phone.
 *
 * useSyncExternalStore is the API for exactly this: subscribe, read, and let
 * React tear-check it. There is no first-paint lie because the snapshot is read
 * during render rather than after it.
 *
 * getServerSnapshot returns false — the server has no viewport, and desktop is
 * the layout that degrades more gracefully when the client corrects it.
 */

const subscribe = (onChange) => {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

const getSnapshot = () => window.matchMedia(QUERY).matches
const getServerSnapshot = () => false

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
