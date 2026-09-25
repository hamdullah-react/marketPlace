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

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, BellOff, Check, Loader2, Send, Share, TriangleAlert } from "lucide-react";
import { errorText } from "@/marketplace/lib/errors";
import { subscribeToPush, unsubscribeFromPush, sendTestPush } from "../_actions/notifications";

/** base64url → Uint8Array, which is the only shape applicationServerKey takes. */
function toKey(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * ── No step may hang for ever ───────────────────────────────────────────────
 *
 * Turning notifications on is four awaits against the browser and one against
 * the server, and two of them can simply never settle. `serviceWorker.ready`
 * waits for a worker to become active and never rejects if it does not, and
 * `pushManager.subscribe()` can sit indefinitely on a device whose push service
 * is unreachable.
 *
 * A promise that never settles is the worst failure this control can have,
 * because the spinner keeps turning and the person keeps waiting — which is
 * exactly what an Android phone was doing: "Finish turning it on for this
 * device", spinning, for ever, with nothing to read.
 *
 * So every step is raced against a clock and names itself when it loses. A
 * named timeout is a diagnosis; a spinner is not.
 */
function withTimeout(promise, ms, step) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT:${step}`)), ms);
    }),
  ]);
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
  const [failure, setFailure] = useState("");
  // The raw browser error, shown small under the advice.
  const [detail, setDetail] = useState("");
  // How many devices the last test reached, once one has been sent.
  const [tested, setTested] = useState(null);
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

  /**
   * ── The server actions are AWAITED, not dispatched into a transition ──────
   *
   * This control lives inside the notification dropdown, and on a phone the
   * permission prompt is a modal sheet: it takes focus, and the menu underneath
   * can close — unmounting this component in the middle of the flow.
   *
   * With the work tied to the component (useActionResult + startTransition),
   * whatever had not been dispatched by then was simply lost. The permission was
   * granted, the subscription was created in the browser, and the row never
   * reached the server — which is exactly the state a phone ends up in: allowed,
   * and never receiving anything.
   *
   * A server action is just an async function. Awaiting it makes the request
   * independent of whether this component is still on screen; the state updates
   * afterwards are best-effort and only affect what is displayed.
   */
  const report = (result) => {
    if (result?.ok) {
      setFailure("");
      return true;
    }
    setFailure(result?.error ? errorText(result.error, locale, result.params) : t("تعذّر الإكمال.", "Could not finish."));
    return false;
  };

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const enable = async () => {
    setNote("");
    setFailure("");
    setDetail("");

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
      const reg = await withTimeout(
        navigator.serviceWorker.register("/sw.js", { scope: "/" }),
        15000,
        "register"
      );

      /* `ready` waits for an ACTIVE worker. If it does not come, the
         registration we already hold is still worth trying — subscribing may
         well succeed on it — so a timeout here falls through rather than
         failing the whole thing. This is the step that hung. */
      const active = await withTimeout(navigator.serviceWorker.ready, 12000, "ready").catch(
        () => reg
      );

      const existing = await withTimeout(active.pushManager.getSubscription(), 8000, "read").catch(
        () => null
      );

      const ask = (registration) =>
        withTimeout(
          registration.pushManager.subscribe({
            // Chrome refuses any other value: a push must always be visible.
            userVisibleOnly: true,
            applicationServerKey: toKey(key),
          }),
          20000,
          "subscribe"
        );

      let sub = existing;

      if (!sub) {
        try {
          sub = await ask(active);
        } catch (first) {
          /* ── "Registration failed - push service error" ──────────────────
             Chrome's own words, and they describe the device rather than this
             site: the phone already holds a push registration for this origin
             that the push service will not honour. It happens after a failed
             attempt, after the keys change, and after a service worker is
             replaced — all three of which have happened here.

             The cure is to stop asking the browser to reuse it. Everything is
             torn down — the subscription, then the worker — and asked for once,
             fresh. This is worth a try before reporting a failure, because the
             alternative for the person holding the phone is "clear this site's
             data in Chrome settings", which nobody finds.

             Exactly ONE retry. A loop here would hammer the push service with
             the same request on a device where it genuinely cannot work. */
          try {
            const stale = await active.pushManager.getSubscription().catch(() => null);
            if (stale) await stale.unsubscribe().catch(() => {});
            await active.unregister?.().catch(() => {});
          } catch {
            // Nothing to tear down. The retry below is still worth making.
          }

          const rebuilt = await withTimeout(
            navigator.serviceWorker.register("/sw.js", { scope: "/" }),
            15000,
            "register"
          );
          const ready = await withTimeout(navigator.serviceWorker.ready, 12000, "ready").catch(
            () => rebuilt
          );

          // If it fails again it is the device, not a stale registration, and
          // the message below says which.
          sub = await ask(ready);
        }
      }

      const fd = new FormData();
      fd.set("audience", audience);
      if (vendorId) fd.set("vendorId", vendorId);
      fd.set("subscription", JSON.stringify(sub.toJSON()));
      fd.set("userAgent", navigator.userAgent);

      const saved = await withTimeout(subscribeToPush(null, fd), 20000, "save");
      if (report(saved)) {
        setRegistered(true);
        done(t("تم التفعيل على هذا الجهاز.", "Turned on for this device."));
      } else {
        setBusy(false);
      }
    } catch (err) {
      const message = String(err?.message ?? err);

      /* Each step fails for its own reason, and the reason is what tells
         somebody what to try. "Could not turn it on" on its own sends them
         back to press the same button again. */
      const timedOut = message.startsWith("TIMEOUT:") ? message.slice(8) : null;

      const reason = {
        register: t(
          "لم يتمكن المتصفح من تسجيل عامل الخدمة. أغلق التبويب وافتحه من جديد ثم حاول مرة أخرى.",
          "The browser could not register the service worker. Close the tab, open it again and retry."
        ),
        ready: t(
          "عامل الخدمة لم يبدأ. أغلق كل تبويبات الموقع ثم افتحه من جديد.",
          "The service worker never started. Close every tab for this site, then open it again."
        ),
        read: t("تعذّر قراءة اشتراك هذا الجهاز.", "Could not read this device's subscription."),
        subscribe: t(
          "لم تستجب خدمة الإشعارات. على أندرويد تحتاج خدمات Google Play، وقد يمنعها توفير البيانات أو شبكة مقيّدة.",
          "The push service did not answer. On Android this needs Google Play services, and a data saver or a restricted network can block it."
        ),
        save: t(
          "لم يصل التسجيل إلى الخادم. تحقق من الاتصال وحاول مرة أخرى.",
          "The registration did not reach the server. Check the connection and try again."
        ),
      }[timedOut];

      /* Chrome says "Registration failed - push service error" when the DEVICE
         cannot register with Google's push service. By the time it reaches here
         the stale-registration cure above has already been tried, so what is
         left is the device itself — and the three answers below are the ones
         that actually fix it, in the order they are worth trying. */
      const pushService =
        /push service error|AbortError|Registration failed/i.test(message) &&
        t(
          "لم يقبل جهازك التسجيل لدى خدمة الإشعارات. جرّب بالترتيب: ١) تأكد أن «خدمات Google Play» مفعّلة وغير مقيّدة، ٢) أوقف موفّر البيانات ووضع توفير البطارية لمتصفح Chrome، ٣) جرّب شبكة أخرى — بعض شبكات الجوال تحجب FCM.",
          "Your device would not register with the push service. In order: 1) check Google Play services is enabled and not restricted, 2) turn off Data Saver and battery optimisation for Chrome, 3) try another network — some mobile networks block FCM."
        );

      setFailure(
        reason ?? pushService ?? t("تعذّر التفعيل: ", "Could not turn it on: ") + message
      );
      /* The browser's own words, kept beside the advice rather than replaced by
         it. The advice is for the person holding the phone; this line is what
         they can send to somebody who can read it. */
      setDetail(reason || pushService ? message : "");
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote("");
    setFailure("");
    setDetail("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();

      if (sub) {
        const fd = new FormData();
        fd.set("audience", audience);
        fd.set("endpoint", sub.endpoint);
        const dropped = await unsubscribeFromPush(null, fd);
        await sub.unsubscribe();

        if (report(dropped)) {
          setRegistered(false);
          setTested(null);
          done(t("تم الإيقاف على هذا الجهاز.", "Turned off for this device."));
        } else {
          setBusy(false);
        }
      } else {
        done(t("لا يوجد اشتراك على هذا الجهاز.", "This device was not registered."));
      }
    } catch (err) {
      done(t("تعذّر الإيقاف: ", "Could not turn it off: ") + (err?.message ?? String(err)));
    }
  };

  const runTest = async () => {
    setNote("");
    setFailure("");
    setDetail("");
    setBusy(true);

    const fd = new FormData();
    fd.set("audience", audience);
    if (vendorId) fd.set("vendorId", vendorId);

    const sent = await sendTestPush(null, fd);
    if (report(sent)) setTested(sent.sent ?? 0);
    setBusy(false);
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
        disabled={busy}
        onClick={granted && registered ? disable : enable}
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
          onClick={runTest}
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
