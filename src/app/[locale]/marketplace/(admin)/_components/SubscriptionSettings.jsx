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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronDown, ChevronUp, ExternalLink, Loader2, Pencil, Plus, Settings2,
  Sparkles, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { localized, formatPrice } from "@/marketplace/lib/listing";
import BilingualField from "../../(seller)/_components/BilingualField";
import { saveTrialDays, saveVendorPlan, deleteVendorPlan } from "../admin/_actions/access";

const INITIAL = { ok: false, error: null };

/* Mirrors readFeatures() in the action: twelve is a card nobody reads past. */
const MAX_FEATURES = 12;

const BLANK = {
  planId: "",
  nameAr: "",
  nameEn: "",
  days: 30,
  price: 0,
  active: "true",
  sort: 0,
  // The public copy. Empty is fine — a card falls back to its name and price.
  descriptionAr: "",
  descriptionEn: "",
  popular: false,
  features: [],
};

/**
 * @param mode  the AUTHORING language, from Admin → Settings → Language
 *              (site_settings.default_locale): 'ar' and 'en' show one box per
 *              bilingual field, 'both' shows one box plus a two-language popup.
 *              Every other bilingual form in this dashboard takes the same
 *              prop and behaves the same way — an admin who has chosen to work
 *              in English should not be shown an Arabic box on every field.
 *              Both values are always SAVED, whichever boxes are on screen, so
 *              switching the setting later never discards a translation.
 */
export default function SubscriptionSettings({
  locale = "ar",
  trialDays = 30,
  plans = [],
  currency = null,
  mode = "ar",
}) {
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

  /* Which language boxes the feature rows show. 'both' shows the pair; either
     single mode shows that one, and in 'both' the dashboard's own language goes
     first — the same order BilingualField picks its primary box by. */
  const both = mode === "both";
  const langs = both ? (locale === "ar" ? ["ar", "en"] : ["en", "ar"]) : [mode === "en" ? "en" : "ar"];

  const send = (runner, fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      /* Everything else is a scalar and String() is right for it. `features` is
         a list, and String() on an array gives "[object Object]" — which is how
         a field silently arrives empty and the feature list looks like it was
         never saved. JSON, parsed and rebuilt key by key on the server. */
      if (k === "features") fd.set(k, JSON.stringify(Array.isArray(v) ? v : []));
      else if (typeof v === "boolean") fd.set(k, v ? "true" : "false");
      else fd.set(k, String(v ?? ""));
    }
    runner.dismiss();
    startTransition(() => runner.formAction(fd));
  };

  /* ── The feature rows ──────────────────────────────────────────────────
     Indexed rather than keyed by id: these are a short ordered list edited in
     place and never referenced from anywhere else, so an id would be a second
     thing to keep in step for no reader. */
  const setFeature = (index, lang) => (e) =>
    setForm((f) => ({
      ...f,
      features: f.features.map((row, i) => (i === index ? { ...row, [lang]: e.target.value } : row)),
    }));

  const addFeature = () =>
    setForm((f) =>
      f.features.length >= MAX_FEATURES ? f : { ...f, features: [...f.features, { ar: "", en: "" }] }
    );

  const dropFeature = (index) =>
    setForm((f) => ({ ...f, features: f.features.filter((_, i) => i !== index) }));

  const moveFeature = (index, by) =>
    setForm((f) => {
      const next = [...f.features];
      const to = index + by;
      if (to < 0 || to >= next.length) return f;
      [next[index], next[to]] = [next[to], next[index]];
      return { ...f, features: next };
    });

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

        {/* These plans ARE the public pricing page, so the way to check the
            wording is to go and read it. A new tab, because an admin checking a
            price should not lose the form they are in the middle of. */}
        <Link
          href={`/${locale}/marketplace/pricing`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("صفحة الأسعار", "Pricing page")}
        </Link>
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
                    {p.features?.length
                      ? ` · ${t(`${p.features.length} ميزة`, `${p.features.length} feature${p.features.length === 1 ? "" : "s"}`)}`
                      : ""}
                  </p>

                  {/* Which card the pricing page lifts. Shown here so the
                      highlight is visible from the list rather than only from
                      inside the dialog that sets it. */}
                  {p.popular ? (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary">
                      <Sparkles className="h-3 w-3" />
                      {t("الأكثر اختياراً", "Most popular")}
                    </p>
                  ) : null}
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
                        descriptionAr: p.description?.ar ?? "",
                        descriptionEn: p.description?.en ?? "",
                        popular: p.popular === true,
                        features: Array.isArray(p.features)
                          ? p.features.map((f) => ({ ar: f?.ar ?? "", en: f?.en ?? "" }))
                          : [],
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
            {/* key: BilingualField seeds its own state at mount, so opening
                the dialog for a different plan has to give it a new identity
                or it would show the previous plan's words. */}
            <BilingualField
              key={`name-${form.planId || "new"}`}
              id="planName"
              label={t("اسم الخطة", "Plan name")}
              ar={form.nameAr}
              en={form.nameEn}
              mode={mode}
              locale={locale}
              onChange={({ ar, en }) => setForm((f) => ({ ...f, nameAr: ar, nameEn: en }))}
            />

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

            {/* ── The public copy ──────────────────────────────────────────
                One sentence saying who the plan is for, then the ticks. Both
                are what the pricing page is built out of; both are optional,
                and a plan with neither still renders as a name and a price. */}
            <BilingualField
              key={`desc-${form.planId || "new"}`}
              id="planDescription"
              label={t("وصف قصير", "Short description")}
              ar={form.descriptionAr}
              en={form.descriptionEn}
              mode={mode}
              locale={locale}
              phAr="لمن هذه الخطة؟"
              phEn="Who is it for?"
              hint={t(
                "سطر واحد تحت الاسم في صفحة الأسعار.",
                "One line under the name on the pricing page."
              )}
              onChange={({ ar, en }) =>
                setForm((f) => ({ ...f, descriptionAr: ar, descriptionEn: en }))
              }
            />

            <div className="rounded-xl border p-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-brand-primary">
                  {t("مزايا الخطة", "What the plan includes")}
                </p>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {form.features.length}/{MAX_FEATURES}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ms-auto gap-1.5"
                  disabled={busy || form.features.length >= MAX_FEATURES}
                  onClick={addFeature}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("إضافة سطر", "Add a line")}
                </Button>
              </div>

              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(
                  "سطر واحد لكل ميزة، بالترتيب الذي تظهر به في صفحة الأسعار. لغة واحدة تكفي.",
                  "One line per feature, in the order they appear on the pricing page. One language is enough."
                )}
              </p>

              {form.features.length ? (
                <ul className="mt-3 space-y-2">
                  {form.features.map((row, i) => (
                    /* Index as the key: this list is reordered by swapping the
                       VALUES, never by moving a component, so nothing loses
                       state when two rows trade places. */
                    <li key={i} className="flex items-start gap-2">
                      {/* ── The same rule as the fields above, applied by hand
                          A BilingualField per row would put a label and a popup
                          trigger on every line of a twelve-line list, which is
                          a dialog inside a dialog to write three words. The
                          RULE is what matters, so it is the one thing copied:
                          one box in a single-language mode, two in 'both'.

                          The hidden language's value stays in state and is
                          saved untouched — writing in English must never quietly
                          blank an Arabic feature somebody wrote last month. */}
                      <div className={`grid flex-1 gap-2 ${both ? "sm:grid-cols-2" : ""}`}>
                        {langs.map((lang) => (
                          <input
                            key={lang}
                            value={row[lang]}
                            onChange={setFeature(i, lang)}
                            disabled={busy}
                            dir={lang === "ar" ? "rtl" : "ltr"}
                            placeholder={
                              both
                                ? lang === "ar"
                                  ? t("بالعربية", "Arabic")
                                  : t("بالإنجليزية", "English")
                                : t("ما الذي تشمله الخطة؟", "What does the plan include?")
                            }
                            aria-label={
                              lang === "ar"
                                ? t(`الميزة ${i + 1} بالعربية`, `Feature ${i + 1} in Arabic`)
                                : t(`الميزة ${i + 1} بالإنجليزية`, `Feature ${i + 1} in English`)
                            }
                            className={`${field} mt-0`}
                          />
                        ))}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5 pt-1.5">
                        <button
                          type="button"
                          disabled={busy || i === 0}
                          onClick={() => moveFeature(i, -1)}
                          aria-label={t("أعلى", "Move up")}
                          className="rounded p-1 text-muted-foreground hover:text-brand-primary disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy || i === form.features.length - 1}
                          onClick={() => moveFeature(i, 1)}
                          aria-label={t("أسفل", "Move down")}
                          className="rounded p-1 text-muted-foreground hover:text-brand-primary disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => dropFeature(i)}
                          aria-label={t("حذف السطر", "Remove this line")}
                          className="rounded p-1 text-muted-foreground hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground dark:border-white/10">
                  {t(
                    "لا مزايا بعد. البطاقة ستظهر بالاسم والسعر فقط.",
                    "No features yet. The card will show the name and the price alone."
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.active !== "false"}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked ? "true" : "false" }))}
                  disabled={busy}
                />
                <span className="text-muted-foreground">{t("مفعّلة", "Active")}</span>
              </label>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.popular === true}
                  onChange={(e) => setForm((f) => ({ ...f, popular: e.target.checked }))}
                  disabled={busy}
                />
                <span className="text-muted-foreground">
                  {t("الأكثر اختياراً — تُبرز في صفحة الأسعار", "Most popular — lifted on the pricing page")}
                </span>
              </label>
            </div>

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
