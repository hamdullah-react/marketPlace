"use client";

/**
 * Give a showroom more time, switch it off, or switch it back on.
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
import { CalendarPlus, Loader2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { localized } from "@/marketplace/lib/listing";
import { extendAccess, blockVendor, unblockVendor } from "../admin/_actions/access";

const INITIAL = { ok: false, error: null };

export default function VendorAccessActions({
  locale = "ar",
  vendorId,
  vendorName = "",
  blocked = false,
  plans = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [extendOpen, setExtendOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const done = () => {
    setExtendOpen(false);
    setBlockOpen(false);
    setNote("");
    setReason("");
    router.refresh();
  };

  const extend = useActionResult(extendAccess, INITIAL, { onSuccess: done });
  const block = useActionResult(blockVendor, INITIAL, { autoClearMs: 0, onSuccess: done });
  const unblock = useActionResult(unblockVendor, INITIAL, { autoClearMs: 0, onSuccess: done });

  const busy = extend.pending || block.pending || unblock.pending;

  const send = (runner, fields) => {
    const fd = new FormData();
    fd.set("vendorId", vendorId ?? "");
    for (const [k, v] of Object.entries(fields)) fd.set(k, String(v ?? ""));
    runner.dismiss();
    startTransition(() => runner.formAction(fd));
  };

  const error = [extend, block, unblock]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const field =
    "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]";

  /* The lengths this platform sells, then the ones everybody reaches for. A
     plan and a preset of the same length would be the same button twice. */
  const planDays = plans.map((p) => Number(p.days)).filter((d) => Number.isFinite(d));
  const presets = [7, 30, 90, 365].filter((d) => !planDays.includes(d));

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
