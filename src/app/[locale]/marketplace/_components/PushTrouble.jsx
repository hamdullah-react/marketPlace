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

      {/* ── The gap between this and WhatsApp, named ─────────────────
          Android gives an INSTALLED app a notification channel, an entry in the
          app list and background wake-ups that survive the browser being swiped
          away. The identical site in a tab gets none of that, and is the first
          thing the system stops when it wants memory.

          Said here rather than in a help page because this is the moment
          somebody is actually trying to make notifications work. Android only:
          iPhone has its own sentence, and it is already shown instead of this
          whole panel. */}
      {!push.installed && typeof navigator !== "undefined" && /Android/.test(navigator.userAgent) ? (
        <p className="mt-2 border-t border-red-200 pt-2 text-[11px] text-red-700/80 dark:border-red-900 dark:text-red-300/80">
          {t(
            "الموقع يعمل الآن داخل تبويب متصفح. للحصول على إشعارات مثل تطبيقات الجوال: القائمة (⋮) ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»، ثم افتحه من الأيقونة وفعّل الإشعارات من هناك.",
            "This is running in a browser tab. For notifications that behave like a phone app: menu (⋮) → “Install app” or “Add to Home screen”, then open it from the icon and turn notifications on there."
          )}
        </p>
      ) : null}
    </div>
  );
}
