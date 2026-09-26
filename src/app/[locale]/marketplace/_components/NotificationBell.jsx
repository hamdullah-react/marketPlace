"use client";

/**
 * The bell: what happened while this dashboard was closed.
 *
 * ── Why a record and not just the live wire ─────────────────────────────────
 *
 * The dashboard already updates itself when something happens — a server action
 * broadcasts and the open page moves (schema.sql §21.7). That only helps
 * somebody who is looking. This is the other half: a showroom that was away
 * overnight opens the dashboard and can see the four things it missed.
 *
 * ── The count is a STATE, not a session tally ───────────────────────────────
 *
 * It comes from the database, so it survives a refresh, a new browser and a
 * night with the laptop shut — the same argument §21.3 makes about unread
 * leads. A badge that resets when the tab does is a badge nobody can act on.
 *
 * ── Opening it clears it ────────────────────────────────────────────────────
 *
 * Read state is shared across the showroom, so one person opening the panel
 * clears it for the desk. That is what a shared queue wants: the badge means
 * "nobody here has looked", and somebody just did. The list stays — clearing
 * the COUNT is not deleting the history.
 */

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionResult } from "../(seller)/_components/useActionResult";
import { notificationText, timeAgo } from "@/marketplace/lib/notifications";
import { markAllNotificationsRead } from "../_actions/notifications";
import PushToggle from "./PushToggle";
import { ting, unlockAudio } from "../(seller)/_components/useLiveLeads";

const INITIAL = { ok: false, error: null };

export default function NotificationBell({
  locale = "ar",
  audience = "vendor",
  /**
   * Where this bell is standing.
   *
   *   "bar"     the dashboard header — a 32px control in a 48px strip, beside
   *             a sidebar trigger and a language switcher of the same weight.
   *   "header"  the public site header, where the search, the saved-cars heart
   *             and the language switcher are all 40px RAISED CIRCLES. A bell
   *             that kept the dashboard's flat 32px square there was visibly
   *             the odd one out — smaller, unlifted, and a different shape in a
   *             row of four otherwise identical buttons.
   *
   * A prop rather than a class passed in from outside, because the icon has to
   * resize with it and a caller handing over a className cannot reach that.
   */
  variant = "bar",
  vendorId = null,
  items = [],
  unread = 0,
  currency = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  /* ── A push that lands while this page is open should be HEARD ──────────
     The service worker shows the notification and then posts to every open
     client (public/sw.js), because a worker cannot make a sound itself. This
     is the other end of that message: the horn, and a refresh so the list
     behind the bell holds the thing that just arrived.

     It is deliberately separate from the realtime channel that already plays
     the horn for a new lead. A push and a broadcast are two different
     deliveries of the same news, and only one of them was audible — which is
     why the sound appeared not to work at all when a test push was sent. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;

    const onMessage = (event) => {
      if (event.data?.type !== "push") return;
      ting();
      router.refresh();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  /* Browsers refuse to build an AudioContext until the page has been touched,
     so the horn is silent on a dashboard nobody has clicked. The shells arm
     this too; doing it here as well costs one listener and means the bell can
     make a noise on a page where the live hooks are not mounted. */
  useEffect(() => {
    const opts = { once: true, passive: true };
    window.addEventListener("pointerdown", unlockAudio, opts);
    window.addEventListener("keydown", unlockAudio, opts);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const [open, setOpen] = useState(false);

  /* The server's count is the truth; this only lets the badge disappear the
     instant somebody opens the panel, rather than after the round trip.

     It remembers WHICH notification was the newest when they looked, rather
     than a bare "cleared" flag reset by an effect. A flag needs an effect to
     stand down when new things arrive — a cascading render React now warns
     about — and comparing against the newest row needs nothing: one more
     notification changes the value, so the badge comes back by itself. */
  const newest = items[0]?.created_at ?? null;
  const [seen, setSeen] = useState(null);
  const count = seen && seen === newest ? 0 : unread;

  const clear = useActionResult(markAllNotificationsRead, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => router.refresh(),
  });

  const markRead = () => {
    if (!unread) return;
    setSeen(newest);

    const fd = new FormData();
    fd.set("audience", audience);
    if (vendorId) fd.set("vendorId", vendorId);
    startTransition(() => clear.formAction(fd));
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) markRead();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            count
              ? t(`${count} إشعار غير مقروء`, `${count} unread notifications`)
              : t("الإشعارات", "Notifications")
          }
          className={
            variant === "header"
              ? /* Matches the search button and the saved-cars heart exactly —
                   same size, same raise, same radius, and the same step down on
                   a phone. */
                "raised relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10"
              : "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-brand-primary dark:hover:bg-white/10"
          }
        >
          <Bell
            className={
              variant === "header"
                ? "h-[18px] w-[18px] text-brand-primary sm:h-5 sm:w-5"
                : "h-4 w-4"
            }
          />

          {/* Nothing at zero. A permanent "0" is a badge that has stopped
              meaning anything, and the eye learns to skip it. */}
          {count ? (
            /* The same geometry as the saved-cars badge beside it — h-4,
               min-w-4, leading-none — so the two sit at identical height and
               offset instead of being a pixel apart.

               The COLOUR stays red where that one is brand green, and that is
               the one difference worth keeping: a saved count is a tally, an
               unread count is something asking to be dealt with, and a row of
               identical green pills would flatten the distinction. */
            <span className="raised-solid absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={isAr ? "start" : "end"}
        dir={isAr ? "rtl" : "ltr"}
        /* Width is capped to the viewport so the panel cannot hang off the side
           of a phone, and the list scrolls rather than growing past the screen. */
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2 dark:border-white/10">
          <p className="text-sm font-semibold text-brand-primary">
            {t("الإشعارات", "Notifications")}
          </p>
          {unread ? (
            <span className="ms-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCheck className="h-3 w-3" />
              {t("تم وضع علامة مقروء", "Marked as read")}
            </span>
          ) : null}
        </div>

        {items.length ? (
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.map((n) => {
              const { title, body } = notificationText(n.kind, n.data, { locale, currency });
              const fresh = !n.read_at;

              const row = (
                <div className={`px-3 py-2.5 ${fresh ? "bg-brand-primary/5" : ""}`}>
                  <p className="flex items-center gap-2 text-sm font-medium text-brand-primary">
                    {fresh ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                    ) : null}
                    <span className="min-w-0 truncate">{title}</span>
                  </p>
                  {body ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{body}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {timeAgo(n.created_at, locale)}
                  </p>
                </div>
              );

              return (
                <li key={n.id} className="border-b last:border-0 dark:border-white/10">
                  {/* Only a link when the row has somewhere to go. A pointer
                      cursor over something inert is a promise the app cannot
                      keep. */}
                  {n.href ? (
                    <Link
                      href={`/${locale}${n.href}`}
                      onClick={() => setOpen(false)}
                      className="block hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t("لا توجد إشعارات بعد", "Nothing yet")}
          </p>
        )}

        {/* The switch lives with the list rather than in Settings: this is
            where somebody is when they think "I want to know about these". */}
        <PushToggle locale={locale} audience={audience} vendorId={vendorId} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
