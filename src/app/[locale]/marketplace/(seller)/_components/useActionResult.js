"use client";

/**
 * useActionState with a result that expires.
 *
 * useActionState holds the LAST result forever. That is fine for a form you
 * submit once, and wrong for a table: delete a row, get an error, fix it,
 * delete a different row — the first error is still on screen, because nothing
 * ever cleared it. Same for a success tick after switching tabs.
 *
 * This wraps the hook and adds three things:
 *
 *   result   the action result, or null once dismissed / superseded
 *   dismiss  clear it by hand (a ✕, opening a modal, changing tab)
 *   onDone   fires once per NEW result — the `token` each action stamps is what
 *            makes "a new response arrived" distinguishable from "the same
 *            stale object is still in state"
 *
 * Success results also auto-clear, so a green tick does not sit there implying
 * the next thing you did also worked.
 */

import { useActionState, useEffect, useRef, useState } from "react";

export function useActionResult(action, initial = { ok: false, error: null }, options = {}) {
  const { autoClearMs = 4000, onSuccess, onAny } = options;

  const [state, formAction, pending] = useActionState(action, initial);
  const [dismissed, setDismissed] = useState(false);
  const lastToken = useRef(null);

  // A new token means a genuinely new response — un-dismiss and notify.
  useEffect(() => {
    const token = state?.token;
    if (token == null || token === lastToken.current) return;

    lastToken.current = token;
    setDismissed(false);
    onAny?.(state);
    if (state.ok) onSuccess?.(state);
  }, [state, onAny, onSuccess]);

  // Successes fade; errors stay until dealt with.
  useEffect(() => {
    if (!state?.ok || dismissed || !autoClearMs) return;
    const id = setTimeout(() => setDismissed(true), autoClearMs);
    return () => clearTimeout(id);
  }, [state, dismissed, autoClearMs]);

  return {
    result: dismissed ? null : state,
    raw: state,
    formAction,
    pending,
    dismiss: () => setDismissed(true),
  };
}
