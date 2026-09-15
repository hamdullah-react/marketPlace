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
        <div className="mt-4 grid gap-2">
          {plans.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              {t(
                "لا توجد خطط بعد — لن يتمكن البائعون من طلب التمييز حتى تضيف خطة.",
                "No plans yet — sellers cannot request a boost until you add one."
              )}
            </p>
          ) : (
            plans.map((plan) => <PlanRow key={plan.id} plan={plan} locale={locale} />)
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
function PlanRow({ plan = null, locale }) {
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
    <div className={`rounded-lg p-3 ${isNew ? "border border-dashed border-brand-primary/30" : "raised"}`}>
      {/* A new row is keyed on its success token, so the inputs clear once added. */}
      <form
        key={isNew && save.raw?.ok ? save.raw.token : "plan"}
        action={save.formAction}
        className="flex flex-wrap items-end gap-3"
      >
        {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}

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
            className="h-9 w-24 tabular-nums"
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
            className="h-9 w-32 tabular-nums"
          />
        </label>

        <label className="flex h-9 items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="active"
            defaultChecked={plan ? plan.active : true}
            className="h-4 w-4 accent-[var(--brand-primary)]"
          />
          {t("متاحة للبائعين", "Offered to sellers")}
        </label>

        <div className="ms-auto flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={save.pending}
            className="raised-solid gap-1.5 bg-brand-primary text-white hover:bg-brand-dark"
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
                <Button type="button" size="sm" variant="destructive" disabled={remove.pending} formAction={remove.formAction} className="gap-1.5">
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
