"use client";

/**
 * The two things that are not per-showroom: how long the free month is, and
 * what renewal costs.
 *
 * Both behind buttons, for the same reason the payment accounts are: they are
 * set up once and then read, and a working screen about who owes what should
 * not carry two configuration forms down the middle of it.
 *
 * ── Changing the trial is not retroactive, and the form says so ─────────────
 *
 * The database trigger reads `trial_days` at the moment a showroom is created,
 * so a change affects the next one and moves nobody's existing date. An admin
 * shortening it must not close a dashboard somebody is in the middle of using —
 * and they should be able to see that from the form rather than find out.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { localized, formatPrice } from "@/marketplace/lib/listing";
import { saveTrialDays, saveVendorPlan, deleteVendorPlan } from "../admin/_actions/access";

const INITIAL = { ok: false, error: null };
const BLANK = { planId: "", nameAr: "", nameEn: "", days: 30, price: 0, active: "true", sort: 0 };

export default function SubscriptionSettings({ locale = "ar", trialDays = 30, plans = [], currency = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [trialOpen, setTrialOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [days, setDays] = useState(trialDays);
  const [form, setForm] = useState(BLANK);
  const [confirmId, setConfirmId] = useState(null);

  const done = () => {
    setTrialOpen(false);
    setPlanOpen(false);
    setConfirmId(null);
    router.refresh();
  };

  const trial = useActionResult(saveTrialDays, INITIAL, { onSuccess: done });
  const plan = useActionResult(saveVendorPlan, INITIAL, { onSuccess: done });
  const remove = useActionResult(deleteVendorPlan, INITIAL, { autoClearMs: 0, onSuccess: done });

  const busy = trial.pending || plan.pending || remove.pending;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const send = (runner, fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, String(v ?? ""));
    runner.dismiss();
    startTransition(() => runner.formAction(fd));
  };

  const error = [trial, plan, remove]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const field =
    "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setTrialOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
          {t("الفترة المجانية", "Free period")}
          <span className="tabular-nums text-muted-foreground">
            {t(`${trialDays} يوم`, `${trialDays} days`)}
          </span>
        </Button>

        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setForm(BLANK);
            plan.dismiss();
            setPlanOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("خطة اشتراك", "Add a plan")}
        </Button>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* A platform with no plan cannot tell a locked-out seller what renewal
          costs — the blocked screen falls back to "contact us". Worth saying. */}
      {!plans.length ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t(
            "لا توجد خطة اشتراك بعد، فلا يعرف المعرض الموقوف كم يدفع.",
            "No subscription plan yet, so a locked-out showroom is not told what renewal costs."
          )}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className="raised-card rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-primary">
                    {localized(p.name, locale) || t(`${p.days} يوم`, `${p.days} days`)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {t(`${p.days} يوم`, `${p.days} days`)}
                    {p.active === false ? ` · ${t("غير مفعّلة", "inactive")}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("تعديل", "Edit")}
                    className="rounded p-1 text-muted-foreground hover:text-brand-primary"
                    onClick={() => {
                      setForm({
                        planId: p.id,
                        nameAr: p.name?.ar ?? "",
                        nameEn: p.name?.en ?? "",
                        days: p.days,
                        price: p.price,
                        active: p.active === false ? "false" : "true",
                        sort: p.sort ?? 0,
                      });
                      plan.dismiss();
                      setPlanOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("حذف", "Remove")}
                    className="rounded p-1 text-muted-foreground hover:text-red-600"
                    onClick={() => setConfirmId(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="mt-1 text-lg font-bold tabular-nums text-brand-primary">
                {formatPrice(p.price, locale, currency)}
              </p>

              {confirmId === p.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 dark:border-white/10">
                  <span className="text-xs text-muted-foreground">{t("حذف الخطة؟", "Remove it?")}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => send(remove, { planId: p.id })}
                  >
                    {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t("نعم", "Yes")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                    {t("تراجع", "Keep it")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ── The free period ─────────────────────────────────────────────── */}
      <Dialog open={trialOpen} onOpenChange={(next) => setTrialOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("الفترة المجانية", "The free period")}</DialogTitle>
            <DialogDescription>
              {t(
                "تُطبَّق على المعارض الجديدة فقط — لا تُغيّر تاريخ أي معرض قائم.",
                "Applies to showrooms created from now on. It moves nobody's existing date."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("عدد الأيام", "Days")}</span>
              <input
                type="number"
                min={0}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                disabled={busy}
                className={`${field} tabular-nums`}
              />
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                className="gap-1.5"
                onClick={() => send(trial, { trialDays: days })}
              >
                {trial.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("حفظ", "Save")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setTrialOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
              {trial.result?.ok ? (
                <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" />
                  {t("تم", "Saved")}
                </span>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── A plan ──────────────────────────────────────────────────────── */}
      <Dialog open={planOpen} onOpenChange={(next) => setPlanOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.planId ? t("تعديل الخطة", "Edit plan") : t("خطة اشتراك جديدة", "New subscription plan")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "تظهر للمعرض الموقوف، وتصبح زراً في نافذة التمديد.",
                "Shown to a locked-out showroom, and becomes a button in the Give-more-time dialog."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="text-muted-foreground">{t("الاسم بالعربية", "Name (Arabic)")}</span>
                <input value={form.nameAr} onChange={set("nameAr")} disabled={busy} dir="rtl" className={field} />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">{t("الاسم بالإنجليزية", "Name (English)")}</span>
                <input value={form.nameEn} onChange={set("nameEn")} disabled={busy} dir="ltr" className={field} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs">
                <span className="text-muted-foreground">{t("المدة بالأيام", "Days")}</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={form.days}
                  onChange={set("days")}
                  disabled={busy}
                  className={`${field} tabular-nums`}
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">{t("السعر", "Price")}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={set("price")}
                  disabled={busy}
                  className={`${field} tabular-nums`}
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">{t("الترتيب", "Sort")}</span>
                <input
                  type="number"
                  value={form.sort}
                  onChange={set("sort")}
                  disabled={busy}
                  className={`${field} tabular-nums`}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.active !== "false"}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked ? "true" : "false" }))}
                disabled={busy}
              />
              <span className="text-muted-foreground">{t("مفعّلة", "Active")}</span>
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                className="gap-1.5"
                onClick={() => send(plan, form)}
              >
                {plan.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {form.planId ? t("حفظ", "Save") : t("إضافة", "Add")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPlanOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
