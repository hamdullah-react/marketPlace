"use client";

/**
 * The dialog that opens BY ITSELF and will not let notifications stay off.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The only way to switch push on used to be a small grey line at the bottom of
 * the bell dropdown. Nobody opened the dropdown to look for it, so nobody
 * subscribed, so every notification this platform sends went nowhere on a
 * closed laptop or a locked phone — the whole web-push section existed and was
 * effectively off.
 *
 * ── The state this was ORIGINALLY built to skip, and should not have ────────
 *
 * The first version of this dialog opened only when permission was still
 * undecided, on the reasoning that a blocked browser cannot be prompted and a
 * dialog that cannot achieve anything is noise. Half of that is true and the
 * conclusion was wrong.
 *
 * A showroom whose browser says BLOCKED is the one that most needs telling,
 * because it is the one silently missing every enquiry — and it was being told
 * in eleven grey pixels at the foot of a dropdown nobody opens. Blocked is also
 * FIXABLE: not by this site, but by four taps in the browser's own settings,
 * which nobody performs because nobody knows they are the four taps.
 *
 * So the dialog opens for blocked too, and shows those taps for the browser
 * actually in use.
 *
 * ── What CANNOT be done, stated plainly ────────────────────────────────────
 *
 * Once a browser is set to blocked, `Notification.requestPermission()` resolves
 * "denied" instantly and shows NOTHING. There is no flag, no re-prompt and no
 * trick, in any browser, by design — a site that could re-ask its way past a
 * refusal would make the refusal meaningless. Anything that claims to force it
 * is either asking on a browser that was never blocked, or wrong.
 *
 * What closes the gap instead is the pair of things around it: instructions
 * precise enough to follow, and a watcher (see usePushRegistration) that
 * notices the moment they take effect and subscribes the device without
 * anybody having to come back and press anything.
 *
 * ── Asked once per SESSION, not once per device ────────────────────────────
 *
 * The first version wrote a flag to localStorage and never asked again. For a
 * newsletter that is courtesy; for a showroom whose leads arrive here it is the
 * app helping somebody switch off the thing their business runs on, once, by
 * accident, for ever.
 *
 * So dismissal lasts a session. Close the tab and come back tomorrow and it
 * asks again, and it goes on asking until notifications actually work — at
 * which point it never appears again, because `shouldAsk` is false. The way to
 * stop being asked is to fix it, which is the honest arrangement.
 */

import { useEffect, useState } from "react";
import { BellRing, ExternalLink, Loader2, Lock, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePushRegistration } from "./usePushRegistration";
import PushTrouble from "./PushTrouble";

/* sessionStorage, not localStorage: "not now" means not now, not never. */
const ASKED_KEY = "sauda.push.prompted";

/* Long enough that it does not land on top of a page still painting, short
   enough to be part of arriving rather than an interruption later. */
const DELAY_MS = 2500;

/** Storage throws in a private window and when site data is blocked. */
const wasAsked = () => {
  try {
    return sessionStorage.getItem(ASKED_KEY) === "1";
  } catch {
    /* Cannot read the flag, so cannot know. Treated as ALREADY ASKED for this
       page: better silent once than the same dialog on every navigation. */
    return true;
  }
};

const rememberAsked = () => {
  try {
    sessionStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Nothing to do. The dialog stays closed for this page either way.
  }
};

/**
 * The taps that actually unblock it, for the browser in the person's hands.
 *
 * Generic wording is why nobody does this. "Change it in your browser settings"
 * is true and unfollowable; "tap the padlock, then Notifications, then Allow"
 * is four seconds. Wrong-but-close beats correct-but-vague here, so an
 * unrecognised browser gets the desktop padlock route rather than a shrug.
 */
function unblockSteps(t) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const android = /Android/.test(ua);
  const apple = /iP(hone|ad|od)/.test(ua);

  if (android) {
    return [
      t("افتح قائمة المتصفح (⋮) أعلى اليمين", "Open the browser menu (⋮), top right"),
      t("الإعدادات ← إعدادات المواقع ← الإشعارات", "Settings → Site settings → Notifications"),
      t("ابحث عن هذا الموقع واختر «السماح»", "Find this site in the list and choose Allow"),
      t("ارجع إلى هذه الصفحة — ستُفعَّل تلقائياً", "Come back to this page — it turns on by itself"),
    ];
  }

  if (apple) {
    return [
      t("الإعدادات ← Safari ← الإشعارات", "Settings → Safari → Notifications"),
      t("ابحث عن هذا الموقع واسمح له", "Find this site and allow it"),
      t(
        "على الآيفون تصل الإشعارات فقط إذا أضفت الموقع إلى الشاشة الرئيسية أولاً",
        "On iPhone, notifications only arrive if the site is added to the Home Screen first"
      ),
    ];
  }

  return [
    t("اضغط رمز القفل بجوار عنوان الموقع", "Click the padlock beside the site address"),
    t("اختر «الإشعارات»", "Find Notifications"),
    t("غيّرها من «حظر» إلى «سماح»", "Change it from Block to Allow"),
    t("ارجع إلى هذه الصفحة — ستُفعَّل تلقائياً", "Come back to this page — it turns on by itself"),
  ];
}

export default function PushPrompt({ locale = "ar", audience = "vendor", vendorId = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const push = usePushRegistration({ locale, audience, vendorId });
  const [open, setOpen] = useState(false);

  const denied = push.state === "denied";
  const iosHome = push.state === "ios-home";

  /* ── Whether to open at all ────────────────────────────────────────────
     Two states are skipped, and only two, because nothing anybody does on this
     screen can change either:

       insecure      opened over http:// on a LAN address. The APIs are absent.
       unsupported   a browser with no push at all.

     Everything else is asked about, including the two that are FIXABLE but not
     by pressing Allow — `denied`, which needs the browser's settings, and
     `ios-home`, which needs the site installed. Those were the states the first
     version hid, and hiding them is why a showroom sat blocked for days.

     `settled` matters: the answer to "is this device registered" arrives one
     tick after the first paint, and opening before it is known would ask an
     already-registered device on every page load. */
  const shouldAsk =
    push.settled &&
    push.hasKey &&
    push.state !== "insecure" &&
    push.state !== "unsupported" &&
    push.state !== "unknown" &&
    /* ── iPhone is deliberately not auto-asked ───────────────
       Safari sends nothing to a site in a tab: it has to be added to the Home
       Screen first, which is a Share sheet, a scroll, a rename and an open —
       and at the end of it the browser prompt has still not been answered. A
       dialog that opens by itself to start a process that long is an
       interruption, not help, and it would open on every session because the
       state it is complaining about takes minutes to change.

       So the iPhone sentence stays where somebody goes LOOKING for it: the
       line at the foot of the bell. Asked for, not pushed. */
    push.state !== "ios-home" &&
    !(push.granted && push.registered);

  useEffect(() => {
    if (!shouldAsk || wasAsked()) return undefined;

    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldAsk]);

  /* It worked — either from the button here, or because they unblocked it in
     the browser's settings and the watcher finished the job while this dialog
     was still on screen. Closes after a beat so the confirmation is read
     rather than flashing past. */
  useEffect(() => {
    if (!(push.granted && push.registered)) return undefined;

    const timer = setTimeout(() => setOpen(false), 1500);
    return () => clearTimeout(timer);
  }, [push.granted, push.registered]);

  const dismiss = () => {
    rememberAsked();
    setOpen(false);
  };

  /* ── What the messages actually ARE, per audience ──────────────────────
     "Enable notifications?" is the sentence every site uses and it answers
     nothing. What makes somebody say yes is knowing what will arrive, and the
     three audiences here receive genuinely different things. */
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

  const steps = denied ? unblockSteps(t) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, the overlay and the corner X all land here. Any of the three
        // is an answer, and the answer lasts as long as this session.
        if (!next) dismiss();
        else setOpen(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full sm:mx-0 ${
              denied ? "bg-amber-100 dark:bg-amber-950/50" : "bg-brand-primary/10"
            }`}
          >
            {denied ? (
              <Lock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            ) : (
              <BellRing className="h-6 w-6 text-brand-primary" />
            )}
          </div>

          <DialogTitle className="pt-2">
            {denied
              ? t("الإشعارات محظورة على هذا المتصفح", "Notifications are blocked in this browser")
              : iosHome
                ? t("خطوة واحدة على الآيفون", "One step on iPhone")
                : t("نُبلغك فوراً؟", "Shall we let you know straight away?")}
          </DialogTitle>

          <DialogDescription>
            {denied
              ? t(
                  "لا يستطيع الموقع إعادة طلب الإذن بعد حظره — هذه قاعدة في المتصفح نفسه. الحل من إعدادات المتصفح، وهو أربع خطوات:",
                  "A site cannot re-ask once it has been blocked — that is a rule in the browser itself, not something this page can override. The way back is in the browser’s own settings, and it is four steps:"
                )
              : reason}
          </DialogDescription>
        </DialogHeader>

        {/* ── The four taps ─────────────────────────────────────────
            Numbered, for the browser actually in use. "Change it in your
            browser settings" is what this replaces, and it is the reason
            nobody ever did. */}
        {steps ? (
          <ol className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-semibold text-brand-primary">
                  {i + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {iosHome ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm">
            {t(
              "شارك (المربع بالسهم) ← «إضافة إلى الشاشة الرئيسية»، ثم افتح الموقع من الأيقونة وفعّل الإشعارات من هناك. هذه هي الطريقة الوحيدة التي تسمح بها آبل للمواقع بإرسال الإشعارات.",
              "Share (the square with the arrow) → Add to Home Screen, then open the site from the icon and turn notifications on there. It is the only way Apple lets a website send notifications at all."
            )}
          </p>
        ) : null}

        {push.failure ? (
          <PushTrouble push={push} locale={locale} />
        ) : push.note ? (
          <p className="text-xs text-muted-foreground">{push.note}</p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={dismiss} disabled={push.busy}>
            <X className="h-4 w-4" />
            {denied || iosHome ? t("لاحقاً", "Later") : t("ليس الآن", "Not now")}
          </Button>

          {/* No Allow button when blocked: pressing it would spend nothing,
              show nothing and return "denied" instantly, which reads as a dead
              button and is how somebody concludes the instructions were wrong.
              The dialog stays open instead, so the steps are still on screen
              while they follow them in another window. */}
          {denied || iosHome ? null : (
            <Button type="button" onClick={push.enable} disabled={push.busy}>
              {push.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              {t("اسمح بالإشعارات", "Allow notifications")}
            </Button>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          {denied ? (
            <>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              {t(
                "اترك هذه النافذة مفتوحة أثناء تغيير الإعداد. بمجرد السماح، تُفعَّل الإشعارات هنا من تلقاء نفسها دون إعادة تحميل.",
                "Leave this window open while you change the setting. The moment you allow it, notifications switch on here by themselves — no reload, nothing else to press."
              )}
            </>
          ) : (
            t(
              "سيسألك المتصفح تأكيداً بعد الضغط. يمكنك إيقافها في أي وقت من جرس الإشعارات.",
              "Your browser will ask you to confirm after you press. You can turn them off at any time from the notification bell."
            )
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
