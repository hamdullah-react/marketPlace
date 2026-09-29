"use client";

/**
 * Turning web push on for THIS device — the whole flow, minus the buttons.
 *
 * ── Why this is a hook and not two copies ───────────────────────────────────
 *
 * All of this used to live inside PushToggle, which is the small line at the
 * bottom of the notification dropdown. Then a dialog was added that asks the
 * same question up front, and it needs the identical flow: the same secure
 * context check, the same iPhone answer, the same fifteen-second timeouts, the
 * same one retry for Chrome's stale-registration bug, and the same sentences
 * when a step fails.
 *
 * Copying that into a second component would mean the next fix lands in one of
 * them. What the two callers genuinely differ about is how they LOOK and when
 * they appear, so that is all they hold.
 *
 * Everything below was learned the hard way and the reasoning is kept with it.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { errorText } from "@/marketplace/lib/errors";
import { ting, unlockAudio } from "../(seller)/_components/useLiveLeads";
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

export const isApple = () =>
  typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);

/* Android is the only platform with a per-site notification channel whose sound
   the owner can change, which is why this is asked at all. */
export const isAndroid = () =>
  typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);

/**
 * What this browser can do, as one word.
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
 * Otherwise the browser's own permission: "default", "granted" or "denied".
 *
 * Read through useSyncExternalStore rather than an effect: `Notification
 * .permission` is state that lives outside React, and copying it into useState
 * from an effect is the pattern react-hooks/set-state-in-effect exists to stop.
 * The server snapshot is "unknown", so the first paint says nothing it might
 * have to take back.
 */
export function readPushState() {
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

/** The states nothing can be pressed out of, with the reason for each. */
export function blockedMessage(state, t) {
  return {
    insecure: t(
      "الإشعارات تحتاج اتصالاً آمناً (https). افتح الموقع عبر https أو من localhost — عنوان مثل http://192.168.x.x لا يسمح بها.",
      "Notifications need a secure connection (https). Open the site over https, or on localhost — an address like http://192.168.x.x cannot use them."
    ),
    "ios-home": t(
      "على الآيفون: أضف الموقع إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية)، ثم افتحه من هناك وفعّل الإشعارات.",
      "On iPhone: add the site to your Home Screen (Share → Add to Home Screen), open it from there, then turn notifications on."
    ),
    unsupported: t("هذا المتصفح لا يدعم إشعارات الويب.", "This browser cannot do web notifications."),
    denied: t(
      "الإشعارات محظورة لهذا الموقع. غيّرها من إعدادات المتصفح — رمز القفل بجوار العنوان.",
      "Notifications are blocked for this site. Change it in your browser settings — the padlock beside the address."
    ),
  }[state];
}

export const isBlocked = (state) =>
  state === "insecure" || state === "ios-home" || state === "unsupported" || state === "denied";

export function usePushRegistration({ locale = "ar", audience = "vendor", vendorId = null } = {}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const state = useSyncExternalStore(subscribeNoop, readPushState, () => "unknown");

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  // The raw browser error, shown small under the advice.
  const [detail, setDetail] = useState("");
  // How many devices the last test reached, once one has been sent.
  const [tested, setTested] = useState(null);
  // Set once this browser is registered, so the test button can appear.
  const [registered, setRegistered] = useState(false);
  // Flips the moment this device is stored, so a dialog can close itself.
  const [justEnabled, setJustEnabled] = useState(false);

  /* Two facts in one write: whether the question has been ANSWERED, and the
     answer. A dialog that auto-opens must not appear during the tick before
     the answer arrives, or a device that is already registered gets asked
     again on every single page load. */
  const [known, setKnown] = useState({ done: false, sub: false });

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
        if (alive) setKnown({ done: true, sub: Boolean(sub) });
      })
      .catch(() => {
        // No worker, or the browser refused to say. "Not registered" is the
        // safe answer: the worst it costs is one extra press.
        if (alive) setKnown({ done: true, sub: false });
      });

    return () => {
      alive = false;
    };
  }, []);

  const settled = known.done;
  const isRegistered = registered || known.sub;

  const done = useCallback((message) => {
    setNote(message);
    setBusy(false);
  }, []);

  const report = useCallback(
    (result) => {
      if (result?.ok) {
        setFailure("");
        return true;
      }
      setFailure(
        result?.error
          ? errorText(result.error, locale, result.params)
          : t("تعذّر الإكمال.", "Could not finish.")
      );
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  );

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  /**
   * ── The server actions are AWAITED, not dispatched into a transition ──────
   *
   * This control lives inside the notification dropdown, and on a phone the
   * permission prompt is a modal sheet: it takes focus, and the menu underneath
   * can close — unmounting the component in the middle of the flow.
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
   *
   * ── Permission is asked ONCE, and only when it can be used ────────────────
   *
   * A browser gives a site essentially one good chance to ask. Say yes and the
   * site then fails to finish, and every later press shows NO PROMPT AT ALL —
   * requestPermission() resolves instantly with "granted" and nothing visible
   * happens. From the outside that is indistinguishable from a broken button,
   * and it is what an earlier version did: it asked first and only then
   * discovered the VAPID key was missing, which is exactly the state a
   * deployment has when the keys were never added to it.
   *
   * So everything that can be checked without spending the prompt is checked
   * first: a secure context, the APIs, and the public key. The prompt is the
   * last step before subscribing, not the first.
   */
  const enable = useCallback(async () => {
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
        } catch {
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
        setJustEnabled(true);
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

      setFailure(reason ?? pushService ?? t("تعذّر التفعيل: ", "Could not turn it on: ") + message);
      /* The browser's own words, kept beside the advice rather than replaced by
         it. The advice is for the person holding the phone; this line is what
         they can send to somebody who can read it. */
      setDetail(reason || pushService ? message : "");
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, key, locale, vendorId, done, report]);

  const disable = useCallback(async () => {
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
          setKnown({ done: true, sub: false });
          setTested(null);
          done(t("تم الإيقاف على هذا الجهاز.", "Turned off for this device."));
        } else {
          setBusy(false);
        }
      } else {
        setKnown({ done: true, sub: false });
        done(t("لا يوجد اشتراك على هذا الجهاز.", "This device was not registered."));
      }
    } catch (err) {
      done(t("تعذّر الإيقاف: ", "Could not turn it off: ") + (err?.message ?? String(err)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, locale, done, report]);

  const runTest = useCallback(async () => {
    setNote("");
    setFailure("");
    setDetail("");
    setBusy(true);

    /* The chime, here and now. Two reasons it is played locally rather than
       waited for:

       1. This press IS a gesture, which is the only moment a browser will let
          an AudioContext start. Unlocking it here means every later chime —
          from a real lead, or from a push landing on this page — can sound.
       2. It is the only way to HEAR the sound on demand. The test sends a
          push, and a push that arrives on a phone plays the operating system's
          sound, not ours; without this the chime had no trigger anybody could
          reach, which is exactly why it seemed not to work. */
    unlockAudio();
    ting();

    const fd = new FormData();
    fd.set("audience", audience);
    if (vendorId) fd.set("vendorId", vendorId);

    const sent = await sendTestPush(null, fd);
    if (report(sent)) setTested(sent.sent ?? 0);
    setBusy(false);
  }, [audience, vendorId, report]);

  return {
    state,
    blocked: isBlocked(state),
    granted: state === "granted",
    /** Has the browser finished telling us whether THIS device is registered? */
    settled,
    registered: isRegistered,
    justEnabled,
    busy,
    note,
    failure,
    detail,
    tested,
    hasKey: Boolean(key),
    enable,
    disable,
    runTest,
  };
}
