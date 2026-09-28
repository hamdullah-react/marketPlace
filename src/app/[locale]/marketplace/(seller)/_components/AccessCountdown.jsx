"use client";

/**
 * How long this showroom's dashboard stays open, in the header beside the bell.
 *
 * ── Why it belongs next to the bell and not only in a banner ────────────────
 *
 * There used to be a banner across the top of every page in the last week,
 * saying "you have four days left". That is the right thing to say and the
 * wrong shape to say it in twice over: a showroom two months out learned
 * nothing at all until the week it ran out, and once the banner did appear it
 * sat over the listings, the leads and the media library for seven days until
 * it stopped being read.
 *
 * This is the replacement, and it is the ONLY persistent warning the dashboard
 * has now — which makes its colour load-bearing rather than decorative: brand
 * green normally, amber inside the last week, red once it has run out. It sits
 * beside the bell because that corner is already where the dashboard keeps what
 * is true right now rather than what is on this page, and it opens
 * /seller/subscription, where the full warning lives with the reason, the
 * renewal control and the bank details.
 *
 * ── It TICKS, and the first paint does not ──────────────────────────────────
 *
 * The seed comes from the server, which is the only value that can be rendered
 * without a hydration mismatch — "now" on the server and "now" in the browser
 * are different instants, and computing the remaining time during render makes
 * React discard the markup it was given. So the server's number is shown first
 * and the clock starts after mount.
 *
 * From then on it is the browser's own clock: a dashboard left open overnight
 * shows the morning's figure rather than last night's, with nothing fetched.
 *
 * ── Renewing updates it without anything being added here ───────────────────
 *
 * An accepted payment broadcasts `access_changed` on the showroom's private
 * topic, and useLiveLeads answers that with a full reload — so the header comes
 * back with the new date the moment an admin records the money. That is also
 * why this takes `until` rather than a precomputed label: the reload re-renders
 * the layout, and the layout re-reads the session.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Below this many days the chip stops being informational and starts warning. */
const WARN_DAYS = 7;

export default function AccessCountdown({
  locale = "ar",
  /* The moment access ends, as stored. Null on a showroom that has never had a
     date — the chip renders nothing rather than inventing one, for the same
     reason accessState() treats a missing date as open (lib/access.js). */
  until = null,
  /* Whether they are in RIGHT NOW, decided by the server. A manual block makes
     this false while the date is still in the future, and the chip must agree
     with the door rather than with the arithmetic. */
  allowed = true,
  /* The server's own count, used for the first paint only. */
  initialDaysLeft = null,
  href = null,
  /* 'sm' is the header chip. 'lg' is the same clock as the subject of a page
     rather than a corner of one — same component, because a second copy is how
     the two come to disagree about what "ending soon" means. */
  size = "sm",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const ends = until ? Date.parse(until) : NaN;
  const hasDate = Number.isFinite(ends);

  /* null until mounted, and that is what keeps the first paint identical to the
     server's. Once it is a number, it is the browser's clock. */
  const [now, setNow] = useState(null);

  useEffect(() => {
    if (!hasDate) return;

    setNow(Date.now());

    /* Every second, because the chip now shows seconds. A re-render a second is
       a handful of text nodes in a header that is already mounted — cheap, and
       the alternative is a clock whose seconds jump in thirties, which reads as
       broken rather than as economical. */
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasDate, until]);

  if (!hasDate) return null;

  const left = now === null ? null : ends - now;

  /* ── What it says ─────────────────────────────────────────────────────────
     A full clock — days, then hours, minutes and seconds — rather than the
     rounded "39d" this used to show. A rounded number answers "roughly when"
     and a clock answers "how long have I got", and the second is the question
     somebody arranging a bank transfer on the last afternoon is actually
     asking. It also makes the thing visibly RUNNING, which a static number
     does not.

     The days part is dropped once there are none, so the last day reads
     00:47:12 rather than 0d 00:47:12 — a leading zero that says "none" where
     the reader is looking for "how many".

     Truncated, not rounded up. accessState() rounds up because it reports whole
     days and must never say 0 while somebody can still get in; here the
     remainder is spelled out beside it, so rounding the days up would make the
     two halves contradict each other — 1d 00:00:01 left would read as "2d". */
  const pad = (n) => String(n).padStart(2, "0");

  const label = (() => {
    if (left === null) {
      // First paint: the server's whole-days figure, which is all it can know
      // without inventing a "now" the browser will disagree with.
      const d = Number(initialDaysLeft);
      if (!allowed) return t("منتهٍ", "Ended");
      if (!Number.isFinite(d)) return t("—", "—");
      return t(`${d} يوم`, `${d}d`);
    }

    if (left <= 0 || !allowed) return t("منتهٍ", "Ended");

    const days = Math.floor(left / DAY);
    const hours = Math.floor((left % DAY) / HOUR);
    const mins = Math.floor((left % HOUR) / MINUTE);
    const secs = Math.floor((left % MINUTE) / 1000);

    const clock = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    if (!days) return clock;
    return t(`${days} يوم ${clock}`, `${days}d ${clock}`);
  })();

  /* The tone is read from the same numbers, so the colour and the text can
     never disagree — an amber chip reading "60d" is worse than no chip. */
  const daysLeft = left === null ? Number(initialDaysLeft) : left / DAY;
  const over = !allowed || (left !== null && left <= 0);
  const soon = !over && Number.isFinite(daysLeft) && daysLeft <= WARN_DAYS;

  const tone = over
    ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
    : soon
      ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-brand-primary/10 text-brand-primary";

  const exact = new Date(ends).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const big = size === "lg";

  const chip = (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold tabular-nums ${
        big ? "gap-2 px-4 py-2 text-xl sm:text-2xl" : "gap-1 px-2 py-1 text-xs"
      } ${tone}`}
      /* LTR whatever the page direction. A clock is a number, and 04:12:33
         reordered by a right-to-left run reads as 33:12:04. */
      dir="ltr"
    >
      <CalendarClock className={`shrink-0 ${big ? "h-5 w-5" : "h-3.5 w-3.5"}`} />
      {label}
    </span>
  );

  /* The title carries the DATE, because the chip carries the duration and the
     two answer different questions — "how long have I got" and "what day does
     it fall on". A seller arranging a transfer needs the second. */
  const title = over
    ? t(`انتهى وصولك في ${exact}`, `Your access ended on ${exact}`)
    : t(`ينتهي وصولك في ${exact}`, `Your access ends on ${exact}`);

  if (!href) {
    return (
      <span title={title} aria-label={title}>
        {chip}
      </span>
    );
  }

  /* Somewhere to GO. A warning that is not also a link makes the reader hunt
     for the page that fixes it, which is the one thing they were told to do. */
  return (
    <Link href={href} title={title} aria-label={title} className="shrink-0">
      {chip}
    </Link>
  );
}
