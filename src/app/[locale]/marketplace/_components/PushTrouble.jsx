"use client";

/**
 * What to do when turning notifications on did not work.
 *
 * ── Why this is a component and not two more copies of a red box ────────────
 *
 * The dialog and the toggle both fail in the same ways, and the useful part of
 * a failure is never the sentence — it is the two buttons under it. Keeping
 * them here means a device that cannot register offers the same way out
 * wherever somebody happens to be standing when it happens.
 *
 * ── The reset is the one that actually fixes "push service error" ───────────
 *
 * It is offered only for the failures a reset cures, because a button that
 * appears for every error teaches people to press it for every error, and it
 * does genuinely destroy the registration it is pointed at.
 *
 * ── The diagnostics are for the person who can read them ────────────────────
 *
 * Not for the one holding the phone. Three rounds of "it still does not work"
 * have been spent guessing at things the browser would have stated on request:
 * whether the site is installed, whether a worker exists, whether a
 * subscription already exists and which push service it belongs to. One button,
 * one paste, and the guessing stops.
 */

import { useState } from "react";
import { ClipboardCheck, ClipboardCopy, RotateCcw } from "lucide-react";

export default function PushTrouble({ push, locale = "ar", compact = false }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const [copied, setCopied] = useState(false);

  if (!push.failure) return null;

  const copy = async () => {
    const text = await push.diagnostics();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* Clipboard refused — it needs a secure context and, in some browsers, a
         permission. Falling back to a prompt() is ugly and it WORKS, which on a
         phone that cannot copy is the whole point. */
      window.prompt(t("انسخ هذا وأرسله:", "Copy this and send it:"), text);
    }
  };

  const size = compact ? "text-[11px]" : "text-xs";

  return (
    <div className="rounded-lg bg-red-50 p-2.5 dark:bg-red-950/40">
      <p className={`text-red-700 dark:text-red-300 ${size}`}>{push.failure}</p>

      {push.detail ? (
        <p className="mt-1 font-mono text-[10px] text-red-700/70 dark:text-red-300/70" dir="ltr">
          {push.detail}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {push.resettable ? (
          <button
            type="button"
            disabled={push.busy}
            onClick={push.reset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            <RotateCcw className="h-3 w-3 shrink-0" />
            {t("أعد ضبط هذا الجهاز ثم حاول", "Reset this device, then retry")}
          </button>
        ) : null}

        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
        >
          {copied ? (
            <ClipboardCheck className="h-3 w-3 shrink-0" />
          ) : (
            <ClipboardCopy className="h-3 w-3 shrink-0" />
          )}
          {copied ? t("نُسخت", "Copied") : t("انسخ التفاصيل التقنية", "Copy technical details")}
        </button>
      </div>

      {/* ── What is NOT said here ──────────────────────
          This panel used to end with "install the site to your home screen for
          notifications that behave like a phone app". True, and removed.

          It is four steps through a menu, on a screen where somebody is already
          stuck on a failure, and it is not the fix for the error above it — an
          installed app whose device will not register with the push service
          fails in exactly the same way. Offering it here turns one problem into
          two, and the second one is longer.

          Reset, then retry. That is the whole remedy this panel owes. */}
    </div>
  );
}
