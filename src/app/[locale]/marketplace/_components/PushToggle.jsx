"use client";

/**
 * "Also tell me when the app is closed." — the line at the foot of the bell.
 *
 * ── Only the buttons are here ───────────────────────────────────────────────
 *
 * The flow this presses — the permission prompt, the service worker, the
 * timeouts, Chrome's stale-registration retry, and the sentence for each way it
 * can fail — lives in usePushRegistration, because PushPrompt asks the same
 * question in a dialog and the two must not drift apart.
 *
 * ── It reports what actually happened ───────────────────────────────────────
 *
 * An older version announced "Turned on for this device" the moment it had
 * dispatched the action, without waiting to see whether the server stored
 * anything. A device that never registered was told it had. The sentence now
 * comes from the action's own result.
 */

import { BellRing, BellOff, Check, Download, Loader2, Send, Share, TriangleAlert } from "lucide-react";
import {
  blockedMessage,
  isAndroid,
  usePushRegistration,
} from "./usePushRegistration";

export default function PushToggle({ locale = "ar", audience = "vendor", vendorId = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const push = usePushRegistration({ locale, audience, vendorId });
  const { state, busy, note, failure, detail, tested, registered, granted } = push;

  /* ── The states that cannot be pressed out of ───────────────────────── */
  if (push.blocked) {
    return (
      <div className="border-t px-3 py-2 dark:border-white/10">
        <p className="flex items-start gap-2 px-1 text-[11px] text-muted-foreground">
          {state === "ios-home" ? (
            <Share className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          {blockedMessage(state, t)}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t px-3 py-2 dark:border-white/10">
      <button
        type="button"
        disabled={busy}
        onClick={granted && registered ? push.disable : push.enable}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-start text-xs font-medium text-brand-primary hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : granted && registered ? (
          <BellOff className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <BellRing className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="min-w-0">
          {granted && registered
            ? t("إيقاف إشعارات هذا الجهاز", "Turn off notifications on this device")
            : granted
              ? /* Permission is already given but this browser is not registered
                   — the usual state after a failed first attempt, and the one
                   that shows no prompt however many times it is pressed. Saying
                   so is what stops it reading as a dead button. */
                t("أكمل التفعيل على هذا الجهاز", "Finish turning it on for this device")
              : t("نبّهني حتى والتطبيق مغلق", "Notify me even when the app is closed")}
        </span>
      </button>

      {/* Proof, on demand. Everything up to the send can be verified from the
          dashboard; whether a notification actually ARRIVES can only be tested
          by sending one, and waiting for a real lead to find out is not a test. */}
      {granted && registered ? (
        <button
          type="button"
          disabled={busy}
          onClick={push.runTest}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-start text-[11px] text-muted-foreground hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          ) : tested !== null ? (
            <Check className="h-3 w-3 shrink-0 text-green-600" />
          ) : (
            <Send className="h-3 w-3 shrink-0" />
          )}
          {tested !== null
            ? t(
                `أُرسلت إلى ${tested} جهاز — أغلق التبويب لتراها`,
                `Sent to ${tested} device${tested === 1 ? "" : "s"} — close the tab to see it`
              )
            : t("أرسل إشعاراً تجريبياً", "Send a test notification")}
        </button>
      ) : null}

      {/* ── The one route to OUR sound on a LOCKED phone ─────────────
          A push arriving on a locked phone is drawn by the operating system,
          not by this site: a service worker has no audio API at all, and the
          Notification API's `sound` property was removed from the spec years
          ago. So the sound is whichever one the phone's notification channel
          is set to — and that is the phone owner's setting, which they can
          point at any file they like.

          This is that file: the same chime the dashboard plays, so the phone
          and the laptop make one sound rather than two unrelated ones.

          Android only. iOS has no per-site notification sound at all. */}
      {granted && registered && isAndroid() ? (
        <a
          href="/sounds/smile.mp3"
          download="sauda-notification.mp3"
          className="mt-1 flex w-full items-start gap-2 rounded-lg px-1 py-1 text-start text-[11px] text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Download className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {t(
              "لسماع هذا الصوت والجوال مقفل: نزّل الملف، ثم اضغط مطولاً على أي إشعار ← الإعدادات ← الصوت، واختره.",
              "For this sound while your phone is locked: download it, then long-press any notification → Settings → Sound, and pick it."
            )}
          </span>
        </a>
      ) : null}

      {/* A failure is boxed rather than being another grey line: this panel is
          read on a phone, at the bottom of a list, and the sentence that says
          why nothing happened has to be the thing the eye lands on. */}
      {failure ? (
        <div className="mt-1.5 rounded-lg bg-red-50 p-2 dark:bg-red-950/40">
          <p className="text-[11px] text-red-700 dark:text-red-300">{failure}</p>
          {detail ? (
            <p className="mt-1 font-mono text-[10px] text-red-700/70 dark:text-red-300/70" dir="ltr">
              {detail}
            </p>
          ) : null}
        </div>
      ) : note ? (
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}
