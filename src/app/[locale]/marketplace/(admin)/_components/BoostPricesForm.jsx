"use client";

/**
 * Boost plans — created, priced, switched off and deleted by an admin.
 *
 * Nothing is fixed: any number of plans, any length (1–365 days), any price.
 * A request keeps the price it was sent at, so editing or deleting a plan here
 * never changes an existing request.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Save, Plus, Trash2, AlertCircle, CheckCircle2, BadgeDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { saveBoostPlan, deleteBoostPlan } from "../admin/_actions/boosts";
import { errorText } from "@/marketplace/lib/errors";

export default function BoostPricesForm({ locale = "ar", plans = [], ready = true }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /* The cheapest per DAY, which is what the seller's cards badge. Derived
     here too rather than passed around, so the two pages cannot disagree. */
  const bestValueId = plans.length
    ? plans.reduce((best, p) => {
        if (!(p.days > 0)) return best;
        const rate = p.price / p.days;
        return best == null || rate < best.rate ? { id: p.id, rate } : best;
      }, null)?.id ?? null
    : null;

  return (
    <div className="raised-card rounded-xl p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
        <BadgeDollarSign className="h-4 w-4 text-brand-gold" />
        {t("الخطط", "Plans")}
        {ready && plans.length ? (
          <span className="text-xs font-normal text-muted-foreground">
            {t(
              `${plans.filter((p) => p.active).length} من ${plans.length} متاحة للبائعين`,
              `${plans.filter((p) => p.active).length} of ${plans.length} offered to sellers`
            )}
          </span>
        ) : null}
      </h2>

      {!ready ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t(
            "لإدارة الخطط شغّل قسم BOOST PLANS AND PRICES في آخر schema.sql داخل Supabase ← SQL Editor، ثم حدّث الصفحة.",
            "To manage plans, run the BOOST PLANS AND PRICES section at the end of schema.sql in Supabase → SQL Editor, then refresh."
          )}
        </p>
      ) : (
        /* Laid out as the PRICING TABLE a seller sees, not as a settings
           list. The admin is setting what the seller will compare, and a
           stack of horizontal rows shows nothing about how three plans read
           against each other — which is the entire decision being made here.

           The per-day rate and the best-value mark are computed exactly as
           they are on the seller's side (BoostRequestForm), so this page is a
           preview of that one rather than a second opinion about it. */
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plans.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-4">
              {t(
                "لا توجد خطط بعد — لن يتمكن البائعون من طلب التمييز حتى تضيف خطة.",
                "No plans yet — sellers cannot request a boost until you add one."
              )}
            </p>
          ) : (
            plans.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                locale={locale}
                best={bestValueId != null && plan.id === bestValueId && plans.length > 1}
              />
            ))
          )}

          <PlanRow locale={locale} />
        </div>
      )}
    </div>
  );
}

/**
 * One plan — or, with no `plan`, the "add a plan" row.
 *
 * Module scope, so each row keeps its own form state across the refresh a save
 * triggers.
 */
/* The same formatter the seller's cards use: a plain number in the reader's
   own digits. No currency is fixed in code anywhere in the boost feature. */
const moneyIn = (locale) => (n) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en", { maximumFractionDigits: 2 })
    .format(Number(n ?? 0));

function PlanRow({ plan = null, locale, best = false }) {
  const money = moneyIn(locale);
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();
  const isNew = !plan;

  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useActionResult(saveBoostPlan, { ok: false, error: null }, {
    autoClearMs: 3000,
    onSuccess: () => router.refresh(),
  });
  const remove = useActionResult(deleteBoostPlan, { ok: false, error: null }, {
    onSuccess: () => router.refresh(),
  });

  const failed = save.result?.error ? save.result : remove.result?.error ? remove.result : null;

  return (
    <div
      className={`relative flex flex-col rounded-xl p-4 ${
        isNew ? "border border-dashed border-brand-primary/30" : "raised-card"
      } ${plan && !plan.active ? "opacity-60" : ""}`}
    >
      {/* Cheapest per day — the same mark the seller sees on this plan. */}
      {best ? (
        <span className="absolute -top-2 end-3 rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-bold text-[#2a2100] shadow-sm">
          {t("الأفضل قيمة", "Best value")}
        </span>
      ) : null}

      {/* The plan as a seller will read it, above the boxes that set it: the
          length, the price at price size, and what a day costs. A switched-off
          plan says so here rather than only in a checkbox further down — it is
          the thing that decides whether this card exists for a seller at all. */}
      {plan ? (
        <div className="mb-3 border-b pb-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <BadgeDollarSign className="h-3.5 w-3.5 text-brand-gold" />
            {t(`${plan.days} يوم`, `${plan.days} days`)}
            {!plan.active ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {t("موقوفة", "Off")}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-brand-primary">
            {money(plan.price)}
          </span>
          {plan.days > 0 ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {t(`${money(plan.price / plan.days)} / يوم`, `${money(plan.price / plan.days)} per day`)}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 flex items-center gap-1.5 border-b pb-3 text-xs font-semibold text-brand-primary">
          <Plus className="h-3.5 w-3.5" />
          {t("خطة جديدة", "New plan")}
        </p>
      )}
      {/* A new row is keyed on its success token, so the inputs clear once added. */}
      <form
        key={isNew && save.raw?.ok ? save.raw.token : "plan"}
        action={save.formAction}
        className="flex flex-1 flex-col gap-3"
      >
        {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}

        <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{t("الأيام", "Days")}</span>
          <Input
            name="days"
            type="number"
            min="1"
            max="365"
            step="1"
            inputMode="numeric"
            required
            defaultValue={plan?.days ?? ""}
            placeholder={isNew ? t("مثلاً ١٠", "e.g. 10") : undefined}
            className="h-9 w-full tabular-nums"
          />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{t("السعر", "Price")}</span>
          <Input
            name="price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            defaultValue={plan?.price ?? ""}
            placeholder={isNew ? t("مثلاً ١٥٠", "e.g. 150") : undefined}
            className="h-9 w-full tabular-nums"
          />
        </label>

        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="active"
            defaultChecked={plan ? plan.active : true}
            className="h-4 w-4 accent-[var(--brand-primary)]"
          />
          {t("متاحة للبائعين", "Offered to sellers")}
        </label>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={save.pending}
            className="raised-solid flex-1 gap-1.5 bg-brand-primary text-white hover:bg-brand-dark"
          >
            {save.pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isNew ? (
              <Plus className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isNew ? t("إضافة خطة", "Add plan") : t("حفظ", "Save")}
          </Button>

          {plan ? (
            confirmDelete ? (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={remove.pending}>
                  {t("رجوع", "Back")}
                </Button>
                {/* type="submit": a browser only honours formAction on a SUBMIT
                    button. As type="button" the click did nothing and the plan
                    was never deleted. formNoValidate so a half-edited, empty
                    Days or Price box cannot block the delete. */}
                <Button
                  type="submit"
                  formNoValidate
                  size="sm"
                  variant="destructive"
                  disabled={remove.pending}
                  formAction={remove.formAction}
                  className="gap-1.5"
                >
                  {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {t("تأكيد الحذف", "Confirm delete")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { remove.dismiss(); setConfirmDelete(true); }}
                aria-label={t("حذف الخطة", "Delete plan")}
                className="gap-1.5 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )
          ) : null}
        </div>
      </form>

      {save.result?.ok && !isNew ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("تم الحفظ", "Saved")}
        </p>
      ) : null}
      {failed ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {errorText(failed.error, locale, failed.params)}
        </p>
      ) : null}
    </div>
  );
}
