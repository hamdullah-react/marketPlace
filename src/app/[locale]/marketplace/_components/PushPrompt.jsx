"use client";

/**
 * The dialog that opens BY ITSELF and asks to turn notifications on.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The only way to switch push on used to be a small grey line at the bottom of
 * the bell dropdown. Nobody opened the dropdown to look for it, so nobody
 * subscribed, so every notification this platform sends went nowhere on a
 * closed laptop or a locked phone — the whole web-push section existed and was
 * effectively off. A setting nobody finds is a setting that does not exist.
 *
 * ── This dialog is OURS. The browser's prompt is still a press away ─────────
 *
 * This is the important part, and it is not a detail of styling.
 *
 * `Notification.requestPermission()` is NOT called when the page loads, and
 * must not be:
 *
 *   • Firefox and Safari require user activation and simply REJECT a request
 *     made without it — the prompt never appears and the promise fails.
 *   • Chrome permits it, and punishes it. A site that asks cold gets the
 *     "quieter" UI or an automatic block, and a block is PERMANENT: every later
 *     attempt resolves "denied" instantly with nothing on screen. One cold ask
 *     can cost this site the ability to ever ask that person again.
 *
 * So the sequence is: our dialog opens on its own, explains what the messages
 * are for, and the browser's prompt appears when — and only when — somebody
 * presses Allow. That press is the user activation every browser wants, and it
 * means the native prompt is only ever spent on somebody who has already said
 * yes to the question in words they can read.
 *
 * ── Asked once per device ───────────────────────────────────────────────────
 *
 * Dismissing it writes a flag to this browser and it never opens again. There
 * is no second chance and no nagging: the toggle at the foot of the bell is
 * still there for anybody who changes their mind, and that is the right way
 * back. A dialog that reappears on every visit gets dismissed reflexively,
 * which is how a site teaches people to refuse it.
 *
 * The flag is per BROWSER, not per account, because permission is per browser:
 * the same person on a laptop and a phone has two devices to register and
 * should be asked on both.
 */

import { useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePushRegistration } from "./usePushRegistration";

/* One key for the whole platform rather than one per audience. The question is
   "may this BROWSER show notifications", which a browser answers once for the
   origin — asking again under a different hat would be asking the same person
   the same thing twice. */
const ASKED_KEY = "sauda.push.prompted";

/* Long enough that it does not land on top of a page still painting, short
   enough to be part of arriving rather than an interruption later. A dialog
   that appears at 300ms reads as a pop-up; one that appears while somebody is
   mid-click steals the click. */
const DELAY_MS = 2500;

/** localStorage throws in a private window and when site data is blocked. */
const wasAsked = () => {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    /* Cannot read the flag, so cannot know. Treated as ALREADY ASKED: being
       silent for somebody we cannot remember is better than opening the same
       dialog on every page load of a private window. */
    return true;
  }
};

const rememberAsked = () => {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Nothing to do. The dialog stays closed for this page either way.
  }
};

export default function PushPrompt({ locale = "ar", audience = "vendor", vendorId = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const push = usePushRegistration({ locale, audience, vendorId });
  const [open, setOpen] = useState(false);

  /* ── Whether to open at all ────────────────────────────────────────────
     Every one of these is a reason NOT to, and they are all checked before
     the timer starts rather than inside it:

       blocked     insecure origin, an iPhone in a tab, an old browser, or
                   already denied. There is nothing a dialog can achieve.
       granted +   already done on this device. This is why `settled` matters:
       registered  the answer arrives one tick after the first paint, and
                   opening before it is known would ask an already-registered
                   device on every single page load.
       !hasKey     no VAPID key on this server. Asking would be asking for
                   something that cannot then be delivered.

     `granted` WITHOUT `registered` is deliberately still asked. That is the
     half-finished state — permission given, nothing stored — and it is the one
     where the device silently receives nothing, so it is the most worth
     fixing. No native prompt appears for it; Allow goes straight to
     subscribing. */
  const shouldAsk =
    push.settled && push.hasKey && !push.blocked && !(push.granted && push.registered);

  useEffect(() => {
    if (!shouldAsk || wasAsked()) return undefined;

    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldAsk]);

  /* Registered. The dialog has done its job and closes itself — after a beat,
     so the confirmation underneath the button is actually read rather than
     flashing past. */
  useEffect(() => {
    if (!push.justEnabled) return undefined;

    rememberAsked();
    const timer = setTimeout(() => setOpen(false), 1800);
    return () => clearTimeout(timer);
  }, [push.justEnabled]);

  const dismiss = () => {
    rememberAsked();
    setOpen(false);
  };

  /* ── What the messages actually ARE, per audience ──────────────────────
     "Enable notifications?" is the sentence every site uses and it answers
     nothing. What makes somebody say yes is knowing what will arrive, and the
     three audiences here receive genuinely different things: a showroom gets
     enquiries about its cars, staff get requests waiting on a decision, a
     buyer gets an answer to something they asked. */
  const reason = {
    vendor: t(
      "يصلك تنبيه فور وصول استفسار على سيارة، أو رسالة من الإدارة، أو قرب انتهاء اشتراكك — حتى لو كان المتصفح مغلقاً والجوال مقفلاً.",
      "You get an alert the moment an enquiry lands on one of your cars, a message arrives from the platform, or your subscription is close to ending — even with the browser closed and the phone locked."
    ),
    admin: t(
      "يصلك تنبيه فور وصول طلب تجديد أو ترويج أو توثيق ينتظر قرارك، ورسائل المعارض — حتى لو كان المتصفح مغلقاً والجوال مقفلاً.",
      "You get an alert the moment a renewal, promotion or verification request is waiting on you, and when a showroom writes — even with the browser closed and the phone locked."
    ),
    buyer: t(
      "يصلك تنبيه فور رد المعرض على استفسارك أو تغيّر سعر سيارة تتابعها — حتى لو كان المتصفح مغلقاً والجوال مقفلاً.",
      "You get an alert the moment a showroom answers your enquiry, or the price changes on a car you are following — even with the browser closed and the phone locked."
    ),
  }[audience] ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, the overlay and the corner X all land here. Any of the three
        // is an answer, and the answer is remembered.
        if (!next) dismiss();
        else setOpen(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 sm:mx-0">
            <BellRing className="h-6 w-6 text-brand-primary" />
          </div>

          <DialogTitle className="pt-2">
            {t("نُبلغك فوراً؟", "Shall we let you know straight away?")}
          </DialogTitle>

          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>

        {/* The failure lives above the buttons, not below, because on a phone
            the buttons are the last thing on screen and anything under them is
            off it. */}
        {push.failure ? (
          <div className="rounded-lg bg-red-50 p-2.5 dark:bg-red-950/40">
            <p className="text-xs text-red-700 dark:text-red-300">{push.failure}</p>
            {push.detail ? (
              <p className="mt-1 font-mono text-[10px] text-red-700/70 dark:text-red-300/70" dir="ltr">
                {push.detail}
              </p>
            ) : null}
          </div>
        ) : push.note ? (
          <p className="text-xs text-muted-foreground">{push.note}</p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={dismiss} disabled={push.busy}>
            <X className="h-4 w-4" />
            {t("ليس الآن", "Not now")}
          </Button>

          <Button type="button" onClick={push.enable} disabled={push.busy}>
            {push.busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            {t("اسمح بالإشعارات", "Allow notifications")}
          </Button>
        </div>

        {/* Said before the press rather than discovered after it: the browser's
            own prompt is the NEXT thing that happens, and somebody who does not
            expect a second dialog reads it as the site having failed. */}
        <p className="text-[11px] text-muted-foreground">
          {t(
            "سيسألك المتصفح تأكيداً بعد الضغط. يمكنك إيقافها في أي وقت من جرس الإشعارات.",
            "Your browser will ask you to confirm after you press. You can turn them off at any time from the notification bell."
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
