"use client";

/**
 * "Also tell me when the app is closed."
 *
 * ── Permission is asked ONCE, and only when it can be used ──────────────────
 *
 * A browser gives a site essentially one good chance to ask. Say yes and the
 * site then fails to finish, and every later press shows NO PROMPT AT ALL —
 * requestPermission() resolves instantly with "granted" and nothing visible
 * happens. From the outside that is indistinguishable from a broken button,
 * and it is what an earlier version of this file did: it asked first and only
 * then discovered the VAPID key was missing, which is exactly the state a
 * deployment has when the keys were never added to it.
 *
 * So everything that can be checked without spending the prompt is checked
 * first: a secure context, the APIs, and the public key. The prompt is the last
 * step before subscribing, not the first.
 *
 * ── The three ways this is unavailable are three different sentences ────────
 *
 *   insecure    opened over http:// on a phone or another machine. Service
 *               workers and push exist only in a secure context, so the APIs
 *               are simply absent — and "your browser does not support
 *               notifications" would be a lie that sends somebody to change
 *               browsers. localhost is exempt; a LAN address like
 *               http://192.168.1.5:3000 is not, and that is the usual way this
 *               is met.
 *   ios-home    Safari has no PushManager in a tab. iOS 16.4+ delivers push
 *               only to a site added to the Home Screen.
 *   unsupported genuinely old, or a private window with the APIs stripped.
 *
 * ── It reports what actually happened ───────────────────────────────────────
 *
 * The old version announced "Turned on for this device" the moment it had
 * dispatched the action, without waiting to see whether the server stored
 * anything. A device that never registered was told it had. Now the sentence
 * comes from the action's own result.
 */

import { startTransition, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, BellOff, Check, Loader2, Send, Share, TriangleAlert } from "lucide-react";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { subscribeToPush, unsubscribeFromPush, sendTestPush } from "../_actions/notifications";

const INITIAL = { ok: false, error: null };

/** base64url → Uint8Array, which is the only shape applicationServerKey takes. */
function toKey(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isApple = () =>
  typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);

/**
 * What this browser can do, as one word.
 *
 * Read through useSyncExternalStore rather than an effect: `Notification
 * .permission` is state that lives outside React, and copying it into useState
 * from an effect is the pattern react-hooks/set-state-in-effect exists to stop.
 * The server snapshot is "unknown", so the first paint says nothing it might
 * have to take back.
 */
function readState() {
  if (typeof window === "undefined") return "unknown";
  // The one check that must come first: on an insecure origin the APIs below
  // are absent, and reporting "unsupported" would blame the browser.
  if (!window.isSecureContext) return "insecure";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return isApple() ? "ios-home" : "unsupported";
  }
  if (!("PushManager" in window)) return isApple() ? "ios-home" : "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

/* No event to listen to: permission changes while the page is open are rare
   and any press re-renders, which re-reads the snapshot. */
const subscribeNoop = () => () => {};

export default function PushToggle({ locale = "ar", audience = "vendor", vendorId = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const state = useSyncExternalStore(subscribeNoop, readState, () => "unknown");

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // Set once this browser is registered, so the test button can appear.
  const [registered, setRegistered] = useState(false);

  /* ── Was this device already registered, on an earlier visit? ─────────
     Only the browser knows — the server can say the showroom has devices, not
     whether THIS one is among them. The answer is behind two promises, so it
     arrives after the first paint and the button starts on "turn it on"; that
     is the honest default for an unknown, and it corrects itself a tick later.

     setState in a `.then` rather than in the effect body: the rule this file
     has to satisfy is about SYNCHRONOUS state writes during an effect, which
     cascade; resolving an async browser API is what effects are for. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;

    let alive = true;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (alive && sub) setRegistered(true);
      })
      .catch(() => {
        // No worker, or the browser refused to say. "Not registered" is the
        // safe answer: the worst it costs is one extra press.
      });

    return () => {
      alive = false;
    };
  }, []);

  const done = useCallback((message) => {
    setNote(message);
    setBusy(false);
  }, []);

  const on = useActionResult(subscribeToPush, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      setRegistered(true);
      done(t("تم التفعيل على هذا الجهاز.", "Turned on for this device."));
    },
  });

  const off = useActionResult(unsubscribeFromPush, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      setRegistered(false);
      done(t("تم الإيقاف على هذا الجهاز.", "Turned off for this device."));
    },
  });

  const test = useActionResult(sendTestPush, INITIAL, { autoClearMs: 0 });

  /* A refusal from the server is the whole point of showing anything — a
     device that did not register must not be told it did. */
  const actionError = [on, off, test]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const enable = async () => {
    setNote("");
    on.dismiss();

    /* ── Everything that does not cost the prompt, first ──────────────── */
    if (!key) {
      setNote(
        t(
          "مفاتيح الإشعارات غير مضبوطة على هذا الخادم. أضف NEXT_PUBLIC_VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY ثم أعد النشر.",
          "Notification keys are not set on this server. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, then redeploy."
        )
      );
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        done(
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

      // busy stays true until the action answers — onSuccess clears it, and a
      // failure surfaces through actionError.
      startTransition(() => on.formAction(fd));
    } catch (err) {
      done(t("تعذّر التفعيل: ", "Could not turn it on: ") + (err?.message ?? String(err)));
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote("");
    off.dismiss();
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();

      if (sub) {
        const fd = new FormData();
        fd.set("audience", audience);
        fd.set("endpoint", sub.endpoint);
        startTransition(() => off.formAction(fd));
        await sub.unsubscribe();
      } else {
        done(t("لا يوجد اشتراك على هذا الجهاز.", "This device was not registered."));
      }
    } catch (err) {
      done(t("تعذّر الإيقاف: ", "Could not turn it off: ") + (err?.message ?? String(err)));
    }
  };

  const runTest = () => {
    setNote("");
    test.dismiss();
    const fd = new FormData();
    fd.set("audience", audience);
    if (vendorId) fd.set("vendorId", vendorId);
    startTransition(() => test.formAction(fd));
  };

  /* ── The states that cannot be pressed out of ───────────────────────── */

  const blocked = { insecure: true, "ios-home": true, unsupported: true, denied: true }[state];

  if (blocked) {
    const message = {
      insecure: t(
        "الإشعارات تحتاج اتصالاً آمناً (https). افتح الموقع عبر https أو من localhost — عنوان مثل http://192.168.x.x لا يسمح بها.",
        "Notifications need a secure connection (https). Open the site over https, or on localhost — an address like http://192.168.x.x cannot use them."
      ),
      "ios-home": t(
        "على الآيفون: أضف الموقع إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية)، ثم افتحه من هناك وفعّل الإشعارات.",
        "On iPhone: add the site to your Home Screen (Share → Add to Home Screen), open it from there, then turn notifications on."
      ),
      unsupported: t(
        "هذا المتصفح لا يدعم إشعارات الويب.",
        "This browser cannot do web notifications."
      ),
      denied: t(
        "الإشعارات محظورة لهذا الموقع. غيّرها من إعدادات المتصفح — رمز القفل بجوار العنوان.",
        "Notifications are blocked for this site. Change it in your browser settings — the padlock beside the address."
      ),
    }[state];

    return (
      <div className="border-t px-3 py-2 dark:border-white/10">
        <p className="flex items-start gap-2 px-1 text-[11px] text-muted-foreground">
          {state === "ios-home" ? (
            <Share className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          {message}
        </p>
      </div>
    );
  }

  const granted = state === "granted";

  return (
    <div className="border-t px-3 py-2 dark:border-white/10">
      <button
        type="button"
        disabled={busy || on.pending || off.pending}
        onClick={granted && registered ? disable : enable}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-start text-xs font-medium text-brand-primary hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
      >
        {busy || on.pending || off.pending ? (
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
          disabled={test.pending}
          onClick={runTest}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-start text-[11px] text-muted-foreground hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
        >
          {test.pending ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          ) : test.result?.ok ? (
            <Check className="h-3 w-3 shrink-0 text-green-600" />
          ) : (
            <Send className="h-3 w-3 shrink-0" />
          )}
          {test.result?.ok
            ? t(
                `أُرسلت إلى ${test.result.sent} جهاز — أغلق التبويب لتراها`,
                `Sent to ${test.result.sent} device${test.result.sent === 1 ? "" : "s"} — close the tab to see it`
              )
            : t("أرسل إشعاراً تجريبياً", "Send a test notification")}
        </button>
      ) : null}

      {actionError ? (
        <p className="mt-1 px-1 text-[11px] text-red-600 dark:text-red-400">{actionError}</p>
      ) : note ? (
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}
