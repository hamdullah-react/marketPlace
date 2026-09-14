'use client';

/**
 * Run something DURING RENDER when a value changes — the supported way to
 * reset local state that hangs off an upstream one.
 *
 * ── The problem it replaces ─────────────────────────────────────────────────
 *
 *     useEffect(() => { setIndex(0); }, [photos]);
 *
 * That shape is all over a dashboard: a table resets its selection when the
 * rows change, a gallery resets the frame when the album changes, a card
 * re-seeds from a prop the server just re-rendered. It works, and it is wrong
 * in a way that is easy to see once and then impossible to unsee — React
 * paints the STALE value first, runs the effect, and paints again. On the
 * gallery that is one frame of the previous colour's photo; on a table it is a
 * selection count that briefly claims rows that are no longer on screen.
 *
 * ── What this does instead ──────────────────────────────────────────────────
 *
 * React's documented "adjusting state when a prop changes": keep the last value
 * seen, compare during render, and call setState immediately if it moved.
 * React throws away the render in progress and re-runs the component with the
 * new state before anything reaches the DOM, so the stale paint never happens.
 * It is also what react-hooks/set-state-in-effect is asking for — that rule
 * exists to push this class of update out of effects and into render.
 *
 * ── Using it ────────────────────────────────────────────────────────────────
 *
 *     useOnChange(view, () => setIndex(0));
 *     useOnChange(rowsKey, () => setSelected(new Set()));
 *
 * `value` is compared with Object.is, so pass a primitive. For a list, pass
 * something that summarises it — a length, a joined list of ids — rather than
 * the array, which is a new reference on every server render and would reset on
 * every one of them.
 *
 * The callback runs during render, so it may ONLY call setState. No fetch, no
 * DOM, no logging to something that counts — a render can be thrown away and
 * re-run, and anything else in here would happen a number of times nobody
 * controls.
 */

import { useState } from 'react';

export function useOnChange(value, onChange) {
  const [seen, setSeen] = useState(value);

  if (!Object.is(seen, value)) {
    setSeen(value);
    onChange(value, seen);
  }
}
