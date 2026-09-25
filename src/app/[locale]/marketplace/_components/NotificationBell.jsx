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

import { startTransition, useState } from "react";
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

const INITIAL = { ok: false, error: null };

export default function NotificationBell({
  locale = "ar",
  audience = "vendor",
  vendorId = null,
  items = [],
  unread = 0,
  currency = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

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
          className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-brand-primary dark:hover:bg-white/10"
        >
          <Bell className="h-4 w-4" />

          {/* Nothing at zero. A permanent "0" is a badge that has stopped
              meaning anything, and the eye learns to skip it. */}
          {count ? (
            <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white tabular-nums">
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
