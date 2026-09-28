"use client";

/**
 * Give a showroom more time, take some back, switch it off, or switch it on.
 *
 * ── Why "take time back" is not just Extend with a minus ────────────────
 *
 * It shows the admin the date they are about to create BEFORE they press, and
 * says so in red when that date has already passed — because the difference
 * between "correct a typo" and "close their dashboard this second" is one digit,
 * and the press is the only place it can be caught. Extend never needs this: too
 * much time is an embarrassment, too little is a locked-out showroom.
 *
 * ── Extend is one press ─────────────────────────────────────────────────────
 *
 * The common case by far is "they paid for a month" — so the months are buttons
 * and the custom box is the exception, rather than an empty field the admin has
 * to fill in while somebody waits on the phone. The plans an admin created come
 * first, because those are the lengths this platform actually sells.
 *
 * ── Blocking asks for a reason, and will not proceed without one ────────────
 *
 * The sentence is shown to the showroom on the screen they land on. It is not
 * paperwork: "your dashboard is closed" with nothing after it is how a seller
 * stops being a seller. The server enforces the same rule.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarMinus, CalendarPlus, Loader2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { localized } from "@/marketplace/lib/listing";
import { extendAccess, reduceAccess, blockVendor, unblockVendor } from "../admin/_actions/access";

const INITIAL = { ok: false, error: null };

export default function VendorAccessActions({
  locale = "ar",
  vendorId,
  vendorName = "",
  blocked = false,
  plans = [],
  /* The date being reduced, so the dialog can show what the press will produce.
     Null on a row that has never had one — there is then nothing to subtract
     from, and the button says so rather than failing on the server. */
  accessUntil = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [extendOpen, setExtendOpen] = useState(false);
  const [reduceOpen, setReduceOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [days, setDays] = useState(30);
  /* Its own number, deliberately not shared with Extend: an admin who picked 365
     to give a year and then opened this dialog must not find 365 waiting in it. */
  const [cutDays, setCutDays] = useState(30);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [cutReason, setCutReason] = useState("");

  const done = () => {
    setExtendOpen(false);
    setReduceOpen(false);
    setBlockOpen(false);
    setNote("");
    setReason("");
    setCutReason("");
    router.refresh();
  };

  const extend = useActionResult(extendAccess, INITIAL, { onSuccess: done });
  /* autoClearMs 0 — the same choice as block and unblock. An error on something
     that takes access away should stay on screen until it is read, not fade
     while the admin is looking at the date. */
  const reduce = useActionResult(reduceAccess, INITIAL, { autoClearMs: 0, onSuccess: done });
  const block = useActionResult(blockVendor, INITIAL, { autoClearMs: 0, onSuccess: done });
  const unblock = useActionResult(unblockVendor, INITIAL, { autoClearMs: 0, onSuccess: done });

  const busy = extend.pending || reduce.pending || block.pending || unblock.pending;

  const send = (runner, fields) => {
    const fd = new FormData();
    fd.set("vendorId", vendorId ?? "");
    for (const [k, v] of Object.entries(fields)) fd.set(k, String(v ?? ""));
    runner.dismiss();
    startTransition(() => runner.formAction(fd));
  };

  const error = [extend, reduce, block, unblock]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const field =
    "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]";

  /* The lengths this platform sells, then the ones everybody reaches for. A
     plan and a preset of the same length would be the same button twice. */
  const planDays = plans.map((p) => Number(p.days)).filter((d) => Number.isFinite(d));
  const presets = [7, 30, 90, 365].filter((d) => !planDays.includes(d));

  /* ── What "take back N days" will actually produce ────────────────────
     Subtracted from the STORED date, never from today — the same rule as
     reducedTo() on the server, so the date previewed here is the date written
     there. Anything else and the dialog is a guess about its own button. */
  const DAY = 86400000;
  const endsAt = accessUntil ? Date.parse(accessUntil) : NaN;
  const hasDate = Number.isFinite(endsAt);
  const cutTo = hasDate ? endsAt - Math.max(0, Number(cutDays) || 0) * DAY : NaN;
  const expiresThem = hasDate && cutTo <= Date.now();

  const showDate = (ms) =>
    Number.isFinite(ms)
      ? new Date(ms).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  return (
    <>
      {error ? (
        <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy} className="gap-1.5" onClick={() => setExtendOpen(true)}>
          <CalendarPlus className="h-3.5 w-3.5" />
          {t("تمديد", "Give more time")}
        </Button>

        {/* Offered only when there is a date to take from. Without one the
            server would refuse, so the button does not pretend otherwise. */}
        {hasDate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="gap-1.5"
            onClick={() => setReduceOpen(true)}
          >
            <CalendarMinus className="h-3.5 w-3.5" />
            {t("تقليص المدة", "Take time back")}
          </Button>
        ) : null}

        {blocked ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="gap-1.5"
            onClick={() => send(unblock, {})}
          >
            {unblock.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            {t("رفع الإيقاف", "Unblock")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            className="gap-1.5 text-red-600 hover:text-red-700"
            onClick={() => setBlockOpen(true)}
          >
            <Lock className="h-3.5 w-3.5" />
            {t("إيقاف", "Block")}
          </Button>
        )}
      </div>

      {/* ── Give more time ──────────────────────────────────────────────── */}
      <Dialog open={extendOpen} onOpenChange={(next) => setExtendOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("تمديد الاشتراك", "Give more time")}</DialogTitle>
            <DialogDescription>
              {vendorName}
              {" — "}
              {t(
                "تُضاف المدة إلى ما تبقّى، وتبدأ من اليوم إذا كان الاشتراك منتهياً. يرفع الإيقاف أيضاً.",
                "Added to whatever is left, or starting today if it has already run out. This also lifts a block."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setDays(Number(plan.days))}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    days === Number(plan.days)
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                      : "border-gray-200 hover:border-brand-primary dark:border-white/10"
                  }`}
                >
                  {localized(plan.name, locale) || t(`${plan.days} يوم`, `${plan.days} days`)}
                  <span className="ms-1 text-muted-foreground tabular-nums">({plan.days})</span>
                </button>
              ))}

              {presets.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs tabular-nums transition-colors ${
                    days === d
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                      : "border-gray-200 hover:border-brand-primary dark:border-white/10"
                  }`}
                >
                  {t(`${d} يوم`, `${d} days`)}
                </button>
              ))}
            </div>

            <label className="block text-xs">
              <span className="text-muted-foreground">{t("أو عدد أيام محدد", "or a number of days")}</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                disabled={busy}
                className={`${field} tabular-nums`}
              />
            </label>

            <label className="block text-xs">
              <span className="text-muted-foreground">{t("ملاحظة (اختياري)", "Note (optional)")}</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                placeholder={t("مثال: دفع تحويل بنكي", "e.g. paid by bank transfer")}
                className={field}
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || !days || days < 1}
                className="gap-1.5"
                onClick={() => send(extend, { days, note })}
              >
                {extend.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                {t(`تمديد ${days} يوم`, `Add ${days} days`)}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setExtendOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Take time back ──────────────────────────────────── */}
      <Dialog open={reduceOpen} onOpenChange={(next) => setReduceOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("تقليص مدة الاشتراك", "Take time back")}</DialogTitle>
            <DialogDescription>
              {vendorName}
              {" — "}
              {t(
                "تُخصم الأيام من تاريخ الانتهاء الحالي. لا يُوقف المعرض ولا يرفع إيقافاً قائماً — التاريخ وحده.",
                "Taken off the current end date. It does not switch them off and does not lift a block — the date alone."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setCutDays(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs tabular-nums transition-colors ${
                    cutDays === d
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                      : "border-gray-200 hover:border-brand-primary dark:border-white/10"
                  }`}
                >
                  {t(`${d} يوم`, `${d} days`)}
                </button>
              ))}
            </div>

            <label className="block text-xs">
              <span className="text-muted-foreground">{t("أو عدد أيام محدد", "or a number of days")}</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={cutDays}
                onChange={(e) => setCutDays(Number(e.target.value))}
                disabled={busy}
                className={`${field} tabular-nums`}
              />
            </label>

            {/* ── The date this press will create ─────────────────────
                Both dates, side by side. An admin correcting 365 to 30 is
                subtracting 335, and nobody should have to do that sum in their
                head against somebody's livelihood. */}
            <div className="rounded-lg bg-gray-50 p-3 text-xs dark:bg-white/5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("تنتهي المدة الآن", "Currently ends")}</span>
                <span className="tabular-nums">{showDate(endsAt)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t("ستنتهي", "Will end")}</span>
                <span
                  className={`font-semibold tabular-nums ${
                    expiresThem ? "text-red-600 dark:text-red-400" : "text-brand-primary"
                  }`}
                >
                  {showDate(cutTo)}
                </span>
              </div>
            </div>

            {/* Said plainly, in red, because it is the one outcome an admin does
                not expect from a button called "take time back". */}
            {expiresThem ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t(
                  "هذا ينهي وصول المعرض إلى اللوحة فوراً — حتى لو كانت لديه تبويبة مفتوحة. تبقى صفحته وسياراته ظاهرة للمشترين.",
                  "This ends their dashboard access immediately, even in a tab that is already open. Their storefront and cars stay visible to buyers."
                )}
              </p>
            ) : null}

            <label className="block text-xs">
              <span className="text-muted-foreground">
                {t("السبب — يظهر لصاحب المعرض", "Reason — the showroom is shown this")}
              </span>
              <input
                value={cutReason}
                onChange={(e) => setCutReason(e.target.value.slice(0, 300))}
                disabled={busy}
                placeholder={t("مثال: تصحيح خطأ في الإدخال", "e.g. correcting a mistyped extension")}
                className={field}
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                /* Destructive ONLY when it actually ends their access. A
                   correction from a year to a month is not a red button. */
                variant={expiresThem ? "destructive" : "default"}
                disabled={busy || !cutDays || cutDays < 1 || !cutReason.trim()}
                className="gap-1.5"
                onClick={() => send(reduce, { days: cutDays, reason: cutReason })}
              >
                {reduce.pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarMinus className="h-3.5 w-3.5" />
                )}
                {t(`خصم ${cutDays} يوم`, `Take back ${cutDays} days`)}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setReduceOpen(false)}>
                {t("تراجع", "Cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Block ───────────────────────────────────────────────────────── */}
      <Dialog open={blockOpen} onOpenChange={(next) => setBlockOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("إيقاف لوحة المعرض", "Switch this dashboard off")}</DialogTitle>
            <DialogDescription>
              {vendorName}
              {" — "}
              {t(
                "يفقد المعرض لوحة التحكم فوراً، حتى لو كانت هناك تبويبة مفتوحة. تبقى صفحته وسياراته ظاهرة للمشترين.",
                "They lose the dashboard at once, even in a tab that is already open. Their storefront and cars stay visible to buyers."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">
                {t("السبب — يظهر لصاحب المعرض", "Reason — the showroom is shown this")}
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 300))}
                disabled={busy}
                autoFocus
                className={field}
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy || !reason.trim()}
                className="gap-1.5"
                onClick={() => send(block, { reason })}
              >
                {block.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                {t("إيقاف الآن", "Block now")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setBlockOpen(false)}>
                {t("تراجع", "Cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
