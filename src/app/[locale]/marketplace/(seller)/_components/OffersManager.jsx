"use client";

/**
 * Offers: the list, and the form that makes one.
 *
 * ── Why the form is on the same screen ──────────────────────────────────────
 *
 * An offer is six fields. Putting it behind its own route means a seller who
 * mistypes a percentage loads a page, goes back, loads another — for a form
 * they will fill in again next month. It opens in place instead, above the
 * list, and closes when it saves.
 *
 * ── What the seller is protected from ───────────────────────────────────────
 *
 * The live price is computed as they type. A discount is an abstraction; "your
 * car will sell for 76,500" is not, and it is the only way somebody catches
 * that they typed 90 instead of 9 BEFORE it is on the marketplace.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Tag, Plus, Loader2, Trash2, Pause, Play, AlertCircle, Calendar, X,
} from "lucide-react";
import { useActionResult } from "./useActionResult";
import { saveOffer, setOfferActive, deleteOffer } from "../_actions/offers";
import { offerStatus, discountedPrice } from "@/marketplace/lib/offer";
import { localized, formatPrice } from "@/marketplace/lib/listing";
import CatalogCombo from "./CatalogCombo";
import DateTimePicker from "./DateTimePicker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MESSAGES = {
  NOT_A_SELLER: { ar: "لا تملك صلاحية.", en: "You are not signed in as a seller." },
  CHECK_FIELDS: { ar: "راجع الحقول المميزة بالأحمر.", en: "Check the fields marked in red." },
  SAVE_FAILED: { ar: "تعذّر الحفظ. حاول مرة أخرى.", en: "Could not save. Try again." },
  NOT_FOUND: { ar: "هذا العرض لم يعد موجوداً.", en: "That offer no longer exists." },
  CAR_NOT_FOUND: { ar: "هذه السيارة ليست في معرضك.", en: "That car is not in your showroom." },
  OVERLAPS: {
    ar: "يوجد عرض آخر على نفس السيارة في نفس الفترة. أنهِ الأول أو غيّر التواريخ.",
    en: "Another offer already covers this car for part of that period. End it, or change the dates.",
  },
  REQUIRED: { ar: "هذا الحقل مطلوب.", en: "Required." },
  MUST_BE_POSITIVE: { ar: "أدخل رقماً أكبر من صفر.", en: "Enter a number above zero." },
  PERCENT_TOO_BIG: { ar: "النسبة يجب أن تكون أقل من 100%.", en: "The percentage must be under 100%." },
  NO_SAVING: { ar: "هذا الخصم لا يقلّل السعر.", en: "That discount does not lower the price." },
  END_BEFORE_START: { ar: "تاريخ الانتهاء قبل البداية.", en: "The end is before the start." },
  ALREADY_PAST: { ar: "تاريخ الانتهاء في الماضي.", en: "That end date has already passed." },
};

const STATUS = {
  running: {
    ar: "يعمل الآن", en: "Running",
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  scheduled: {
    ar: "مجدول", en: "Scheduled",
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  paused: {
    ar: "متوقف", en: "Paused",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  ended: {
    ar: "منتهي", en: "Ended",
    cls: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
  },
};

export default function OffersManager({
  locale = "ar",
  offers = [],
  listings = [],
  // The names an offer can carry, from the Catalog (schema.sql §25.1).
  offerNames = [],
  /**
   * Which languages this showroom writes in — vendors.settings.default_locale,
   * 'ar' | 'en' | 'both'. Passed straight to CatalogCombo, which is what every
   * other seller form does with it, so an Arabic-only store is not asked for
   * English and a bilingual one gets the "both languages" dialog.
   */
  fieldMode = "ar",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const msg = (code) => (code ? MESSAGES[code]?.[locale] ?? MESSAGES[code]?.en ?? code : null);

  /* `editing` is the offer being changed, or "new", or null for closed. One
     piece of state rather than three booleans, so the form cannot be open for
     an edit and a create at the same time. */
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  /**
   * The form closes only on a SUCCESSFUL save — leaving it open on failure is
   * what keeps the seller's typing on screen next to the error.
   *
   * Through onSuccess, which the hook fires once per NEW response token. The
   * obvious alternative — `if (save.result?.ok) setEditing(null)` in the body —
   * is a trap: the result stays ok after the form closes, so the next attempt
   * to open it would be closed again on the same render and the button would
   * appear dead.
   */
  const save = useActionResult(saveOffer, { ok: false, error: null }, {
    autoClearMs: 0,
    onSuccess: () => setEditing(null),
  });
  const toggle = useActionResult(setOfferActive, { ok: false, error: null });
  const remove = useActionResult(deleteOffer, { ok: false, error: null });

  const fieldError = (name) => msg(save.result?.errors?.[name]);
  const problem =
    msg(save.result?.ok === false && save.result?.error) ||
    msg(toggle.result?.ok === false && toggle.result?.error) ||
    msg(remove.result?.ok === false && remove.result?.error);

  /* ── The live price preview ──────────────────────────────────────────────
     Mirrors the form as it is typed. Kept in state rather than read off the
     DOM so the number cannot lag a keystroke behind what is on screen. */
  const current = editing && editing !== "new" ? editing : null;
  const [draft, setDraft] = useState({
    listingId: "", discountType: "percent", discountValue: "", offerNameId: "",
    startsAt: "", endsAt: "",
  });

  const openForm = (offer) => {
    setEditing(offer ?? "new");
    setDraft(
      offer
        ? {
            listingId: offer.listings?.id ?? "",
            discountType: offer.discount_type,
            discountValue: String(offer.discount_value),
            offerNameId: offer.offer_name_id ?? "",
            startsAt: forInput(offer.starts_at),
            endsAt: forInput(offer.ends_at),
          }
        : {
            listingId: "", discountType: "percent", discountValue: "",
            offerNameId: "", startsAt: "", endsAt: "",
          }
    );
  };

  const draftCar = listings.find((l) => l.id === draft.listingId) ?? null;
  const draftPrice =
    draftCar && draft.discountValue
      ? discountedPrice(draftCar.price, {
          discount_type: draft.discountType,
          discount_value: Number(draft.discountValue),
        })
      : null;

  const input =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary dark:border-white/10 dark:bg-white/5";
  const labelCls = "text-xs font-medium text-gray-700 dark:text-gray-300";

  /* DateTimePicker speaks "YYYY-MM-DDTHH:mm" in LOCAL time, so an offer being
     edited has to be converted back out of its stored UTC. Slicing the ISO
     string instead would show the seller a UTC clock and shift Riyadh by
     three hours. */
  const forInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const dateLabel = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
          day: "numeric", month: "short", year: "numeric",
        })
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── The one control above the list ───────────────────────────────
          The page owns the h1 and the description, like every other seller
          page. What belongs here is the action. */}
      {editing ? null : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => openForm(null)}
            disabled={!listings.length}
            className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t("عرض جديد", "New offer")}
          </button>
        </div>
      )}

      {problem ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{problem}</span>
        </div>
      ) : null}

      {/* A showroom with no cars cannot have an offer, and saying so beats a
          disabled button with no explanation. */}
      {!listings.length ? (
        <div className="rounded-xl border border-dashed p-8 text-center dark:border-white/10">
          <p className="text-sm text-muted-foreground">
            {t("أضف سيارة أولاً، ثم يمكنك عمل عرض عليها.", "Add a car first, then you can put an offer on it.")}
          </p>
          <Link
            href={`/${locale}/marketplace/seller/listings/new`}
            className="mt-3 inline-block text-sm font-semibold text-brand-primary underline-offset-4 hover:underline"
          >
            {t("إضافة سيارة", "Add a car")}
          </Link>
        </div>
      ) : null}

      {/* ── The form ────────────────────────────────────────────────────── */}
      {editing ? (
        <form
          action={save.formAction}
          className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#161616]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {current ? t("تعديل العرض", "Edit offer") : t("عرض جديد", "New offer")}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10"
              aria-label={t("إغلاق", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {current ? <input type="hidden" name="id" value={current.id} /> : null}

          {/* The car */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} htmlFor="listingId">
              {t("السيارة", "The car")} <span className="text-red-500">*</span>
            </label>
            {/* Searchable, because a showroom with sixty cars cannot find one
                in a dropdown. Same picker the listing form uses for brands, so
                it already knows how to match Arabic and English at once.
                allowCreate stays off: a car is created on the Listings page. */}
            <CatalogCombo
              mode={fieldMode}
              locale={locale}
              name="listingId"
              items={listings}
              value={draft.listingId}
              onChange={(id) => setDraft({ ...draft, listingId: id })}
              placeholder={t("ابحث عن سيارة…", "Search for a car…")}
              labelOf={(l) =>
                `${localized(l.name, locale)} — ${formatPrice(l.price, locale)}` +
                (l.state !== "live" ? ` (${t("غير منشورة", "not published")})` : "")
              }
            />
            {fieldError("listingId") ? (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldError("listingId")}</p>
            ) : null}
          </div>

          {/* The discount */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="discountType">{t("نوع الخصم", "Discount")}</label>
              {/* shadcn Select. The hidden input is what the form posts — a
                  Radix select is not a native control and submits nothing. */}
              <input type="hidden" name="discountType" value={draft.discountType} />
              <Select
                value={draft.discountType}
                onValueChange={(v) => setDraft({ ...draft, discountType: v })}
              >
                <SelectTrigger id="discountType" dir={isAr ? "rtl" : "ltr"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t("نسبة مئوية (%)", "Percentage (%)")}</SelectItem>
                  <SelectItem value="amount">{t("مبلغ ثابت (ريال)", "Fixed amount (SAR)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="discountValue">
                {draft.discountType === "amount" ? t("المبلغ", "Amount") : t("النسبة", "Percentage")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="discountValue"
                name="discountValue"
                inputMode="decimal"
                dir="ltr"
                value={draft.discountValue}
                onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })}
                placeholder={draft.discountType === "amount" ? "5000" : "10"}
                className={`${input} ${fieldError("discountValue") ? "border-red-400 dark:border-red-500" : ""}`}
              />
              {fieldError("discountValue") ? (
                <p className="text-xs text-red-600 dark:text-red-400">{fieldError("discountValue")}</p>
              ) : null}
            </div>
          </div>

          {/* What it will actually sell for. The whole point of the form. */}
          {draftCar ? (
            <div className="rounded-xl bg-gray-50 p-3 text-sm dark:bg-white/5">
              {draftPrice != null ? (
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-muted-foreground">{t("سيُعرض بسعر", "Will show as")}</span>
                  <span className="text-base font-bold text-brand-primary">
                    {formatPrice(draftPrice, locale)}
                  </span>
                  <span className="text-muted-foreground line-through">
                    {formatPrice(draftCar.price, locale)}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {t("توفير", "saving")} {formatPrice(draftCar.price - draftPrice, locale)}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  {t("أدخل خصماً لرؤية السعر.", "Enter a discount to see the price.")}
                </span>
              )}
            </div>
          ) : null}

          {/* ── The name, from the Catalog ──────────────────────────────
              Picked, not typed. Typed names turn one occasion into four
              spellings and nothing can group them afterwards — see schema.sql
              §25.1. The Saudi occasions install from Templates in one click. */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} htmlFor="offerNameId">
              {t("اسم العرض", "Offer name")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(اختياري)", "(optional)")}
              </span>
            </label>

            {offerNames.length ? (
              <CatalogCombo
                mode={fieldMode}
                locale={locale}
                name="offerNameId"
                items={offerNames}
                value={draft.offerNameId}
                onChange={(id) => setDraft({ ...draft, offerNameId: id })}
                placeholder={t("بدون اسم", "No name")}
              />
            ) : (
              <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground dark:border-white/10">
                {t(
                  "لا توجد أسماء عروض في كتالوجك بعد.",
                  "Your catalog has no offer names yet."
                )}{" "}
                <Link
                  href={`/${locale}/marketplace/seller/catalog?tab=templates`}
                  className="font-semibold text-brand-primary underline-offset-4 hover:underline"
                >
                  {t("ثبّت قالب أسماء العروض", "Install the offer names template")}
                </Link>
              </div>
            )}
          </div>

          {/* The window */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="startsAt">
                {t("يبدأ", "Starts")}{" "}
                <span className="font-normal text-muted-foreground">{t("(فوراً إذا تُرك فارغاً)", "(now, if left empty)")}</span>
              </label>
              <DateTimePicker
                name="startsAt"
                locale={locale}
                value={draft.startsAt}
                onChange={(v) => setDraft({ ...draft, startsAt: v })}
                placeholder={t("يبدأ فوراً", "Starts now")}
                defaultTime="00:00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls} htmlFor="endsAt">
                {t("ينتهي", "Ends")}{" "}
                <span className="font-normal text-muted-foreground">{t("(بدون نهاية إذا تُرك فارغاً)", "(open-ended, if left empty)")}</span>
              </label>
              <DateTimePicker
                name="endsAt"
                locale={locale}
                value={draft.endsAt}
                onChange={(v) => setDraft({ ...draft, endsAt: v })}
                placeholder={t("بدون نهاية", "Open-ended")}
                // The end of the chosen day, not its start — "ends Friday"
                // means Friday night, and 00:00 would end it on Thursday.
                defaultTime="23:59"
                invalid={Boolean(fieldError("endsAt"))}
              />
              {fieldError("endsAt") ? (
                <p className="text-xs text-red-600 dark:text-red-400">{fieldError("endsAt")}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={save.pending}
              className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            >
              {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {current ? t("حفظ التغييرات", "Save changes") : t("تشغيل العرض", "Start the offer")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            >
              {t("إلغاء", "Cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {/* ── The list ────────────────────────────────────────────────────── */}
      {offers.length === 0 && listings.length > 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center dark:border-white/10">
          <Tag className="mx-auto mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-muted-foreground">
            {t("لا توجد عروض بعد.", "No offers yet.")}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {offers.map((offer) => {
          const status = offerStatus(offer);
          const car = offer.listings;
          const price = car ? discountedPrice(car.price, offer) : null;
          const busy = busyId === offer.id;

          return (
            <div
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#161616]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[status].cls}`}>
                    {STATUS[status][locale] ?? STATUS[status].en}
                  </span>
                  {offer.label ? (
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {localized(offer.label, locale)}
                    </span>
                  ) : null}
                  <span className="text-sm font-semibold text-brand-primary">
                    {offer.discount_type === "amount"
                      ? `− ${formatPrice(offer.discount_value, locale)}`
                      : `− ${offer.discount_value}%`}
                  </span>
                </div>

                <p className="mt-1 truncate text-sm text-gray-700 dark:text-gray-300">
                  {car ? localized(car.name, locale) : t("سيارة محذوفة", "Deleted car")}
                </p>

                {car && price != null ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="line-through">{formatPrice(car.price, locale)}</span>
                    {" → "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatPrice(price, locale)}
                    </span>
                  </p>
                ) : null}

                {offer.starts_at || offer.ends_at ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {offer.starts_at ? dateLabel(offer.starts_at) : t("من الآن", "from now")}
                    {" — "}
                    {offer.ends_at ? dateLabel(offer.ends_at) : t("بدون نهاية", "open-ended")}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openForm(offer)}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/10"
                >
                  {t("تعديل", "Edit")}
                </button>

                {/* Pause and resume. Hidden on an offer that has already ended,
                    where neither would change anything a buyer can see. */}
                {status !== "ended" ? (
                  <form action={toggle.formAction} onSubmit={() => setBusyId(offer.id)}>
                    <input type="hidden" name="id" value={offer.id} />
                    <input type="hidden" name="active" value={offer.active ? "false" : "true"} />
                    <button
                      type="submit"
                      disabled={busy && toggle.pending}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
                    >
                      {busy && toggle.pending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : offer.active ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {offer.active ? t("إيقاف", "Pause") : t("تشغيل", "Resume")}
                    </button>
                  </form>
                ) : null}

                <form action={remove.formAction} onSubmit={() => setBusyId(offer.id)}>
                  <input type="hidden" name="id" value={offer.id} />
                  <button
                    type="submit"
                    disabled={busy && remove.pending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    {busy && remove.pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    {t("حذف", "Delete")}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
