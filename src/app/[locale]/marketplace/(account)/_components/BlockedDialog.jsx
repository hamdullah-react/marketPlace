"use client";

/**
 * The announcement that sits on top of the wall.
 *
 * ── Why a dialog AS WELL AS a page ──────────────────────────────────────────
 *
 * The page is the enforcement. requireVendor() redirects here before a single
 * seller query runs, so a dashboard is never rendered for somebody who is not
 * allowed in — a dialog could never do that job, because by the time one could
 * be drawn the screen it was covering would already be in the browser.
 *
 * But a redirect is SILENT. A seller who was halfway through answering a lead
 * and suddenly finds themselves on a different screen needs telling, in the one
 * place they cannot look past, what happened and what to do about it. That is
 * this dialog — and it is why it can be closed: everything in it is also on the
 * page underneath, so dismissing it loses nothing and reveals the renewal panel
 * it points at.
 *
 * ── Why it remembers being dismissed ────────────────────────────────────────
 *
 * Not politeness — correctness. LiveAccess reloads this page every thirty
 * seconds while its socket is down, so a dialog that opened on every mount
 * would land on top of a seller who had already read it and was midway through
 * picking a plan, twice a minute. The key carries the state, the date and the
 * reason, so a NEW change still announces itself; only the one they have
 * already been told stays shut.
 *
 * A block that happens while they are watching overrides all of that: see
 * `live`, which is set by the redirect in useLiveLeads and always speaks up.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { Lock, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* Nothing external ever changes this answer mid-render: the page reloads on a
   live change, and a dismissal goes through local state. */
const subscribeNothing = () => () => {};

export default function BlockedDialog({
  locale = "ar",
  state = "expired",
  reason = null,
  until = null,
  live = false,
  phone = null,
  whatsapp = null,
}) {
  const t = (ar, en) => (locale === "ar" ? ar : en);

  /* One key per distinct situation. A different state, date or reason is a
     different thing to say, and so it gets said. */
  const seenKey = `mp:access-notice:${state}:${until ?? ""}:${reason ?? ""}`;

  /* Whether this showroom still needs telling — read from sessionStorage, which
     is an external store, through the one hook that can read one without lying
     to the server renderer.

     The two obvious alternatives are both wrong. Reading storage during render
     is a hydration mismatch, because the server has no storage and would always
     disagree. Reading it in an effect and calling setState is a cascading
     render, and React now says so out loud. getServerSnapshot returns false, so
     the markup always arrives closed and the client alone decides to open it. */
  const announce = useSyncExternalStore(
    subscribeNothing,
    () => {
      if (live) return true;
      try {
        return !sessionStorage.getItem(seenKey);
      } catch {
        /* Private window, or storage refused. Announce it: saying this twice is
           a far smaller failure than never saying it at all. */
        return true;
      }
    },
    () => false
  );

  /* Their own dismissal, which is ordinary local state rather than anything the
     store needs to know about mid-session. */
  const [dismissed, setDismissed] = useState(false);
  const open = announce && !dismissed;

  /* Drop the marker from the address bar once it has done its job. Left in
     place it would survive LiveAccess's reloads and re-open this dialog every
     thirty seconds, which is the exact nagging the key above exists to prevent.
     A genuine write to an external system, and it sets no state. */
  useEffect(() => {
    if (!live) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("blocked")) {
        url.searchParams.delete("blocked");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // Nothing to salvage, and nothing that needs salvaging.
    }
  }, [live]);

  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(seenKey, "1");
    } catch {
      // Then it speaks up again after the next reload. Harmless.
    }
  };

  const toRenew = () => {
    close();

    /* After the exit animation, not before it: Radix keeps the body's scroll
       locked until the overlay has finished leaving, and scrolling a locked
       body does nothing at all. */
    setTimeout(() => {
      document
        .getElementById("renew")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  };

  const blocked = state === "blocked";
  const tel = phone ? String(phone) : null;
  const wa = whatsapp ? String(whatsapp).replace(/[^\d]/g, "") : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50">
            <Lock className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </span>

          <DialogTitle>
            {blocked
              ? t("تم إيقاف لوحة معرضك", "Your showroom dashboard is switched off")
              : t("انتهت فترة معرضك المجانية", "Your free period has ended")}
          </DialogTitle>

          <DialogDescription>
            {blocked
              ? t(
                  "أوقف فريق المنصة الوصول إلى لوحة التحكم. تواصل معنا وسدّد الاشتراك لإعادة فتحها.",
                  "The platform team has switched your dashboard off. Get in touch and settle the subscription to reopen it."
                )
              : t(
                  "لإكمال العمل على لوحة التحكم، جدّد الاشتراك أو تواصل مع فريق المنصة.",
                  "To carry on using your dashboard, renew your subscription or contact the platform team."
                )}
          </DialogDescription>
        </DialogHeader>

        {/* The one thing that is genuinely reassuring, and it is true: nothing
            has been taken away from buyers. */}
        <p className="rounded-xl bg-brand-primary/5 p-3 text-sm text-gray-800 dark:text-gray-200">
          {t(
            "سياراتك وصفحة معرضك ما زالت ظاهرة للمشترين — لوحة التحكم فقط هي المتوقفة.",
            "Your cars and your showroom page are still visible to buyers — it is only the dashboard that is closed."
          )}
        </p>

        {/* The admin's own words, when they switched it off by hand. Without
            this the seller is arguing with a wall that will not say why. */}
        {reason ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {t("السبب: ", "Reason: ")}
            {reason}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" onClick={toRenew} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            {t("تجديد الاشتراك", "Renew subscription")}
          </Button>

          {tel ? (
            <Button asChild variant="outline" className="gap-1.5">
              <a href={`tel:${tel}`}>
                <Phone className="h-4 w-4" />
                {t("اتصل بالإدارة", "Call the team")}
              </a>
            </Button>
          ) : null}

          {wa ? (
            <Button asChild variant="outline" className="gap-1.5">
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                {t("واتساب", "WhatsApp")}
              </a>
            </Button>
          ) : null}

          <Button type="button" variant="ghost" onClick={close}>
            {t("فهمت", "Got it")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
