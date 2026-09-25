"use client";

/**
 * "Also tell me when the app is closed."
 *
 * ── Permission is asked on a PRESS, never on load ───────────────────────────
 *
 * A site that calls Notification.requestPermission() as soon as it opens is the
 * reason browsers now let people block the prompt permanently — and a blocked
 * permission cannot be asked for again from the page. It has to be cleared in
 * browser settings, which nobody finds. So the prompt only ever follows a
 * deliberate press on this control.
 *
 * ── The three states are genuinely different ────────────────────────────────
 *
 *   default   never asked. Offer it.
 *   granted   subscribed, or able to be. Offer to turn it off.
 *   denied    they said no, or the browser decided for them. NOTHING here can
 *             change that, so it says so and points at the address bar rather
 *             than showing a button that cannot work.
 *
 * ── iPhone ──────────────────────────────────────────────────────────────────
 *
 * Safari only has a PushManager when the site is running from the home screen.
 * In a tab there is no API at all, so the honest thing is to say "add it to
 * your home screen first" rather than to offer a switch that silently fails.
 */

import { startTransition, useState } from "react";
import { BellRing, BellOff, Loader2, Share } from "lucide-react";
import { useActionResult } from "../(seller)/_components/useActionResult";
import { subscribeToPush, unsubscribeFromPush } from "../_actions/notifications";

const INITIAL = { ok: false, error: null };

/** base64url → Uint8Array, which is the only shape applicationServerKey takes. */
function toKey(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushToggle({ locale = "ar", audience = "vendor", vendorId = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // null until the first press
  const [note, setNote] = useState("");

  const on = useActionResult(subscribeToPush, INITIAL, { autoClearMs: 0 });
  const off = useActionResult(unsubscribeFromPush, INITIAL, { autoClearMs: 0 });

  /* Read lazily rather than in an effect: nothing here needs to be known until
     somebody presses, and reading Notification.permission during render is a
     hydration mismatch waiting to happen. */
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const enable = async () => {
    setNote("");

    if (!supported) {
      setNote(
        t(
          "هذا المتصفح لا يدعم الإشعارات. على الآيفون: أضف الموقع إلى الشاشة الرئيسية أولاً، ثم افتحه من هناك.",
          "This browser cannot do notifications. On iPhone: add the site to your Home Screen first, then open it from there."
        )
      );
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission);

      if (permission !== "granted") {
        setNote(
          permission === "denied"
            ? t(
                "الإشعارات محظورة لهذا الموقع. غيّرها من إعدادات المتصفح (رمز القفل بجوار العنوان).",
                "Notifications are blocked for this site. Change it in your browser settings — the padlock beside the address."
              )
            : t("لم يتم التفعيل.", "Not turned on.")
        );
        return;
      }

      /* Registered here rather than on every page load: a service worker is
         only needed by somebody who has actually asked for notifications. */
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setNote(t("مفاتيح الإشعارات غير مضبوطة.", "Notification keys are not configured."));
        return;
      }

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Chrome refuses any other value: a push must always be visible.
          userVisibleOnly: true,
          applicationServerKey: toKey(key),
        }));

      const fd = new FormData();
      fd.set("audience", audience);
      if (vendorId) fd.set("vendorId", vendorId);
      fd.set("subscription", JSON.stringify(sub.toJSON()));
      fd.set("userAgent", navigator.userAgent);

      startTransition(() => on.formAction(fd));
      setNote(t("تم التفعيل على هذا الجهاز.", "Turned on for this device."));
    } catch (err) {
      setNote(
        t("تعذّر التفعيل: ", "Could not turn it on: ") + (err?.message ?? String(err))
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();

      if (sub) {
        const fd = new FormData();
        fd.set("audience", audience);
        fd.set("endpoint", sub.endpoint);
        startTransition(() => off.formAction(fd));
        await sub.unsubscribe();
      }

      setState("default");
      setNote(t("تم الإيقاف على هذا الجهاز.", "Turned off for this device."));
    } catch (err) {
      setNote(t("تعذّر الإيقاف: ", "Could not turn it off: ") + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  };

  const enabled = state === "granted";

  return (
    <div className="border-t px-3 py-2 dark:border-white/10">
      <button
        type="button"
        disabled={busy}
        onClick={enabled ? disable : enable}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-start text-xs font-medium text-brand-primary hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : enabled ? (
          <BellOff className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <BellRing className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="min-w-0">
          {enabled
            ? t("إيقاف إشعارات هذا الجهاز", "Turn off notifications on this device")
            : t("نبّهني حتى والتطبيق مغلق", "Notify me even when the app is closed")}
        </span>
      </button>

      {note ? <p className="mt-1 px-1 text-[11px] text-muted-foreground">{note}</p> : null}

      {/* Said once, up front, because it is the single most common reason this
          appears not to work — and it is not something the page can fix. */}
      {!enabled && !note ? (
        <p className="mt-1 flex items-start gap-1 px-1 text-[11px] text-muted-foreground">
          <Share className="mt-0.5 h-3 w-3 shrink-0" />
          {t(
            "على الآيفون: أضف الموقع إلى الشاشة الرئيسية أولاً.",
            "On iPhone: add the site to your Home Screen first."
          )}
        </p>
      ) : null}
    </div>
  );
}
