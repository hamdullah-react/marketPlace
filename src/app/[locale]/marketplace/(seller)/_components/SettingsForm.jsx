"use client";

/**
 * Store settings — tabbed, bilingual, with the destructive actions quarantined.
 *
 * Bilingual strategy, applied consistently:
 *   • Every buyer-visible text has an ar and an en field side by side.
 *   • `default_locale` records which one the seller authors in.
 *   • `locale_fallback` decides what a viewer sees when their language is
 *     missing — fall back to the other, or show nothing. Fallback on is the
 *     sane default; an empty store name helps nobody.
 *
 * Each tab is its own <form> with its own action, so saving Contact cannot
 * clobber Profile with stale values from a tab the seller never opened.
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Store, MapPin, Briefcase, Languages, Database, AlertTriangle,
  Loader2, Check, Download, Trash2, Plus, Upload, RotateCcw,
} from "lucide-react";
import {
  saveStoreProfile, saveContact, saveBusiness, saveLocalization,
  createBackup, deleteBackup, deleteAllData, restoreBackup, reactivateStore,
} from "../_actions/settings";
import ImagePicker from "./ImagePicker";
import SocialLinksEditor from "./SocialLinksEditor";
import { PLATFORM_KEYS as SOCIAL_PLATFORM_KEYS } from "@/marketplace/lib/social";
import BilingualField from "./BilingualField";
import { useActionResult } from "./useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import DangerZone from "../../(account)/_components/DangerZone";

const INITIAL = { ok: false, error: null, errors: {} };

/**
 * A settings dropdown.
 *
 * Radix Select renders a button, not a <select>, so the value only reaches the
 * server action through the hidden input. Module scope so it is not a new
 * component type on every render.
 */
function SettingSelect({ id, name, defaultValue, options, className }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id} className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}


/**
 * Declared at MODULE scope on purpose.
 *
 * A component defined inside another component is a new type on every render,
 * so React unmounts and remounts it — and any state it holds (BilingualField
 * keeps the two language values in useState) resets. That is what made the
 * settings inputs lose text while typing.
 */
function PairImpl({ id, labelText, ar, en, textarea, rows = 3, phAr = "", phEn = "", required, error, mode, locale }) {
  return (
    <BilingualField
      id={id} label={labelText} ar={ar} en={en}
      mode={mode} locale={locale}
      textarea={textarea} rows={rows} phAr={phAr} phEn={phEn}
      required={required} error={error}
    />
  );
}

function ToggleImpl({ name, defaultChecked, labelText, note }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-[#46194F]" />
      <span className="flex-1">
        <span className="block text-sm font-medium">{labelText}</span>
        {note ? <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </label>
  );
}

function SaveBarImpl({ state, pending, locale }) {
  //  may be null once the result auto-clears.
  const t = (ar, en) => (locale === "ar" ? ar : en);
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <span className="text-xs">
        {state?.ok ? (
          <span className="flex items-center gap-1.5 text-green-600">
            <Check className="h-3.5 w-3.5" /> {t("تم الحفظ", "Saved")}
          </span>
        ) : state?.error ? (
          <span className="text-red-600">{errorText(state.error, locale)}</span>
        ) : null}
      </span>
      <button type="submit" disabled={pending}
        className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363] disabled:opacity-60">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("حفظ", "Save")}
      </button>
    </div>
  );
}

function ErrImpl({ state, name, locale }) {
  return state?.errors?.[name] ? <p className="mt-1 text-xs text-red-600">{errorText(state.errors[name], locale)}</p> : null;
}


const TABS = [
  { id: "profile", icon: Store, ar: "المتجر", en: "Store" },
  { id: "contact", icon: MapPin, ar: "التواصل والعنوان", en: "Contact & address" },
  { id: "business", icon: Briefcase, ar: "الأعمال والسياسات", en: "Business & policies" },
  { id: "localization", icon: Languages, ar: "اللغة والتفضيلات", en: "Language & preferences" },
  { id: "data", icon: Database, ar: "البيانات", en: "Data" },
];

export default function SettingsForm({
  locale = "ar", vendor, backups = [], counts = {}, assets = [], deletedAt = null,
  // Read on the server and passed in — this is a client component and cannot
  // ask who is signed in.
  account = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const [tab, setTab] = useState("profile");

  const s = vendor?.settings ?? {};
  const addr = vendor?.address ?? {};
  const pol = vendor?.policies ?? {};
  /**
   * An edit made SOMEWHERE ELSE has to show up here.
   *
   * The storefront edits the same columns and revalidates this page, so the
   * server re-renders with the new row — but every input below is
   * uncontrolled, and `defaultValue` is read once when the input mounts. React
   * reuses those DOM nodes across a re-render, so the new value arrived and
   * nothing on screen changed: the seller saw their old opening hours until
   * they reloaded by hand.
   *
   * Keying each form on the row's updated_at remounts it exactly when the data
   * actually changed, and never otherwise — which is what makes "no refresh"
   * true rather than a coincidence of navigation.
   */
  const stamp = vendor?.updated_at ?? "";

  const soc = vendor?.social ?? {};

  /* The stored list (§29), or the eight old keys read as one — so a showroom
     that has not saved since the change opens the editor on what it already
     has rather than on an empty box. */
  const links = vendor?.social_links?.length
    ? vendor.social_links
    : SOCIAL_PLATFORM_KEYS
        .filter((k) => String(soc[k] ?? "").trim())
        .map((k) => ({ key: k, url: soc[k] }));
  const hrs = vendor?.working_hours ?? {};

  const label = "mb-1.5 block text-sm font-medium";
  const field =
    "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-hidden transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";
  const area = "w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-brand-primary";
  const card = "rounded-xl border bg-card p-5";
  const sectionTitle = "mb-1 text-sm font-bold text-brand-primary";
  const hint = "mb-4 text-xs text-muted-foreground";

  // Field language follows settings.default_locale. 'ar' or 'en' render a
  // single box; only 'both' offers the two-language popup.
  //
  // The fallback is the dashboard language, not a hardcoded "ar" — a store
  // with no preference saved yet should author in whatever language the seller
  // is already reading, rather than defaulting everyone to Arabic.
  const fieldMode = s.default_locale ?? locale;

  // The implementations live at module scope (below). These wrappers only exist
  // to pre-bind locale, and they are memoised so their identity is STABLE
  // across renders — a fresh arrow each render is a new component type, which
  // makes React unmount and remount the field and wipe whatever was typed.
  const Pair = useMemo(
    () => function Pair(props) {
      return <PairImpl {...props} mode={fieldMode} locale={locale} />;
    },
    [fieldMode, locale]
  );
  const SaveBar = useMemo(
    () => function SaveBar(props) {
      return <SaveBarImpl {...props} locale={locale} />;
    },
    [locale]
  );
  const Toggle = ToggleImpl;
  const Err = useMemo(
    () => function Err(props) {
      return <ErrImpl {...props} locale={locale} />;
    },
    [locale]
  );

  const router = useRouter();

  // Each tab owns its action. Saving Localization changes how every field in
  // this form renders, so it refreshes the route — otherwise the new setting
  // only took effect after a manual reload.
  const p = useActionResult(saveStoreProfile, INITIAL, { onSuccess: () => router.refresh() });
  const c = useActionResult(saveContact, INITIAL, { onSuccess: () => router.refresh() });
  const b = useActionResult(saveBusiness, INITIAL, { onSuccess: () => router.refresh() });
  const l = useActionResult(saveLocalization, INITIAL, { onSuccess: () => router.refresh() });
  const k = useActionResult(createBackup, INITIAL, { onSuccess: () => router.refresh() });
  const d = useActionResult(deleteBackup, INITIAL, { onSuccess: () => router.refresh() });
  const x = useActionResult(deleteAllData, INITIAL, { onSuccess: () => router.refresh() });
  const r = useActionResult(restoreBackup, INITIAL, { onSuccess: () => router.refresh() });
  const a = useActionResult(reactivateStore, INITIAL, { onSuccess: () => router.refresh() });


  const vid = <input type="hidden" name="vendorId" value={vendor?.id ?? ""} />;
  const mb = (n) => (Number(n ?? 0) / 1048576).toFixed(2);

  /* A deleted store keeps every tab. The banner explains the state and offers
     the two ways out — reactivate, or go to Data and import a backup — rather
     than replacing the page with a notice that offers neither. */
  const deletedBanner = deletedAt ? (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("هذا المتجر محذوف وموقوف", "This store is deleted and suspended")}
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {t(
              `حُذفت الإعلانات والصور بتاريخ ${new Date(deletedAt).toLocaleString("ar-SA")}. الطلبات المكتملة محفوظة.`,
              `Listings and photos were deleted on ${new Date(deletedAt).toLocaleString("en-GB")}. Completed orders were kept.`
            )}
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {t(
              "يمكنك إعادة تفعيل المتجر، أو استيراد نسخة احتياطية من تبويب البيانات.",
              "You can reactivate the store, or import a backup from the Data tab."
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setTab("data")}
            className="flex items-center gap-1.5 rounded-lg border border-amber-400 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40">
            <Upload className="h-3.5 w-3.5" />
            {t("استيراد نسخة", "Import a backup")}
          </button>
          <form action={a.formAction}>
            {vid}
            <button type="submit" disabled={a.pending}
              className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#5a2363] disabled:opacity-60">
              {a.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {t("إعادة التفعيل", "Reactivate")}
            </button>
          </form>
        </div>
      </div>

      {a.result?.error ? (
        <p className="mt-2 text-xs text-red-600">{errorText(a.result.error, locale)}</p>
      ) : null}
    </div>
  ) : null;

  return (
    <>
    {deletedBanner}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* ── Tab rail ─────────────────────────────────────────────────────── */}
      <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {TABS.map(({ id, icon: Icon, ar, en }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              tab === id ? "bg-brand-primary text-white" : "text-muted-foreground hover:bg-muted"
            }`}>
            <Icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{t(ar, en)}</span>
          </button>
        ))}
      </nav>

      <div>
        {/* ── Store profile ──────────────────────────────────────────────── */}
        {tab === "profile" ? (
          <form key={stamp} action={p.formAction} className={`${card} space-y-4 sm:space-y-5`}>
            {vid}
            <div>
              <h2 className={sectionTitle}>{t("هوية المتجر", "Store identity")}</h2>
              <p className={hint}>
                {t("الاسم والوصف كما يراهما المشتري.", "The name and description buyers see.")}
              </p>
            </div>

            <Pair id="name" labelText={t("اسم المتجر", "Store name")}
              ar={vendor?.name?.ar} en={vendor?.name?.en}
              phAr="مركز الرميح لقطع الغيار" phEn="Alromaih Parts Center" />
            <Err state={p.result} name="nameAr" />

            <Pair id="bio" textarea rows={4} labelText={t("نبذة عن المتجر", "About the store")}
              ar={vendor?.bio?.ar} en={vendor?.bio?.en} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ImagePicker locale={locale} name="logoUrl" vendorId={vendor?.id} assets={assets}
                value={vendor?.logo_url} size="md"
                label={t("شعار المتجر", "Store logo")}
                hint={t("مربّع، ٥١٢×٥١٢", "Square, 512×512")} />
              <ImagePicker locale={locale} name="bannerUrl" vendorId={vendor?.id} assets={assets}
                value={vendor?.banner_url} size="wide"
                label={t("صورة الغلاف", "Store banner")}
                hint={t("عريضة، ١٦:٩", "Wide, 16:9")} />
            </div>
            <SaveBar state={p.result} pending={p.pending} />
          </form>
        ) : null}

        {/* ── Contact + address ──────────────────────────────────────────── */}
        {tab === "contact" ? (
          <form key={stamp} action={c.formAction} className={`${card} space-y-5`}>
            {vid}
            <div>
              <h2 className={sectionTitle}>{t("التواصل", "Contact")}</h2>
              <p className={hint}>{t("كيف يصل إليك المشتري.", "How buyers reach you.")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="contactPhone">{t("الجوال", "Mobile")}</label>
                {/* The showroom's number if it has one, otherwise the owner's
                    own — a blank field on a form somebody has already given us
                    a number for is a question asked twice. `??` would not do:
                    contact_phone is an empty STRING on a showroom that never
                    set one, not null, and `?? ` only catches null. */}
                <input id="contactPhone" name="contactPhone" dir="ltr"
                  defaultValue={vendor?.contact_phone || account?.phone || ""} placeholder="05xxxxxxxx" className={field} />
                <Err state={c.result} name="contactPhone" />
              </div>
              <div>
                <label className={label} htmlFor="contactEmail">{t("البريد الإلكتروني", "Email")}</label>
                <input id="contactEmail" name="contactEmail" type="email" dir="ltr"
                  defaultValue={vendor?.contact_email ?? ""} className={field} />
                <Err state={c.result} name="contactEmail" />
              </div>
            </div>

            <div>
              <h2 className={sectionTitle}>{t("العنوان", "Address")}</h2>
              <p className={hint}>{t("موقع المعرض.", "Where your showroom is.")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="city">{t("المدينة", "City")}</label>
                {/* Same fallback as the phone above, and `||` for the same
                    reason: an unset city is an empty string, not null. */}
                <input id="city" name="city"
                  defaultValue={vendor?.city || account?.city || ""} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="postalCode">{t("الرمز البريدي", "Postal code")}</label>
                <input id="postalCode" name="postalCode" dir="ltr" defaultValue={addr.postal_code ?? ""} className={field} />
              </div>
            </div>

            <Pair id="district" labelText={t("الحي", "District")} ar={addr.district?.ar} en={addr.district?.en} />
            <Pair id="street" labelText={t("الشارع", "Street")} ar={addr.street?.ar} en={addr.street?.en} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={label} htmlFor="building">{t("رقم المبنى", "Building")}</label>
                <input id="building" name="building" dir="ltr" defaultValue={addr.building ?? ""} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="lat">{t("خط العرض", "Latitude")}</label>
                <input id="lat" name="lat" dir="ltr" defaultValue={addr.lat ?? ""} placeholder="24.7136" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="lng">{t("خط الطول", "Longitude")}</label>
                <input id="lng" name="lng" dir="ltr" defaultValue={addr.lng ?? ""} placeholder="46.6753" className={field} />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("الإحداثيات تُحفظ فقط إذا أدخلت الاثنين معاً.", "Coordinates are saved only if you enter both.")}
            </p>

            <div>
              <label className={label} htmlFor="mapUrl">{t("رابط الخريطة", "Map link")}</label>
              <input id="mapUrl" name="mapUrl" dir="ltr" defaultValue={addr.map_url ?? ""} className={field} />
            </div>

            <div>
              <h2 className={sectionTitle}>{t("روابط أخرى", "Other links")}</h2>
              <p className={hint}>
                {t(
                  "أضف ما تشاء — واتساب، إنستغرام، أو أي رابط آخر باسمه وأيقونته. رتّبها بالسهمين؛ الترتيب هو ما يظهر في صفحتك.",
                  "Add as many as you like — WhatsApp, Instagram, or any other link with its own name and icon. The arrows set the order your page shows them in."
                )}
              </p>
            </div>

            {/* The same editor the storefront dialog uses, so the two screens
                cannot offer different platforms or validate differently. */}
            <SocialLinksEditor locale={locale} value={links} />

            <SaveBar state={c.result} pending={c.pending} />
          </form>
        ) : null}

        {/* ── Business + policies ────────────────────────────────────────── */}
        {tab === "business" ? (
          <form key={stamp} action={b.formAction} className={`${card} space-y-5`}>
            {vid}
            <div>
              <h2 className={sectionTitle}>{t("السجلات", "Registration")}</h2>
              <p className={hint}>{t("تُستخدم للتحقق من المتجر.", "Used to verify your store.")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="crNumber">{t("السجل التجاري", "CR number")}</label>
                <input id="crNumber" name="crNumber" dir="ltr" inputMode="numeric"
                  defaultValue={vendor?.cr_number ?? ""} placeholder="1010xxxxxx" className={field} />
                <Err state={b.result} name="crNumber" />
              </div>
              <div>
                <label className={label} htmlFor="vatNumber">{t("الرقم الضريبي", "VAT number")}</label>
                <input id="vatNumber" name="vatNumber" dir="ltr" inputMode="numeric"
                  defaultValue={vendor?.vat_number ?? ""} placeholder="3xxxxxxxxxxxxx3" className={field} />
                <Err state={b.result} name="vatNumber" />
              </div>
            </div>

            <div>
              <h2 className={sectionTitle}>{t("ساعات العمل", "Working hours")}</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={label} htmlFor="hoursWeekdays">{t("السبت – الخميس", "Sat – Thu")}</label>
                <input id="hoursWeekdays" name="hoursWeekdays" dir="ltr"
                  defaultValue={hrs.weekdays ?? ""} placeholder="09:00 – 21:00" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="hoursWeekend">{t("الجمعة", "Friday")}</label>
                <input id="hoursWeekend" name="hoursWeekend" dir="ltr"
                  defaultValue={hrs.weekend ?? ""} placeholder="16:00 – 22:00" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="hoursClosed">{t("أيام الإغلاق", "Closed")}</label>
                <input id="hoursClosed" name="hoursClosed" defaultValue={hrs.closed ?? ""} className={field} />
              </div>
            </div>

            <div>
              <h2 className={sectionTitle}>{t("السياسات", "Policies")}</h2>
              <p className={hint}>{t("تظهر في صفحة متجرك.", "Shown on your storefront.")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="returnsDays">{t("مدة الإرجاع (أيام)", "Return window (days)")}</label>
                <input id="returnsDays" name="returnsDays" type="number" min="0"
                  defaultValue={pol.returns_days ?? 0} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="warranty">{t("الضمان", "Warranty")}</label>
                <input id="warranty" name="warranty" defaultValue={pol.warranty ?? ""} className={field} />
              </div>
            </div>

            <Pair id="shipping" textarea labelText={t("سياسة الشحن", "Shipping policy")}
              ar={pol.shipping?.ar} en={pol.shipping?.en} />
            <Pair id="returns" textarea labelText={t("سياسة الإرجاع", "Returns policy")}
              ar={pol.returns?.ar} en={pol.returns?.en} />
            <Pair id="terms" textarea labelText={t("الشروط والأحكام", "Terms")}
              ar={pol.terms?.ar} en={pol.terms?.en} />

            <SaveBar state={b.result} pending={b.pending} />
          </form>
        ) : null}

        {/* ── Localization + preferences ─────────────────────────────────── */}
        {tab === "localization" ? (
          <form key={stamp} action={l.formAction} className={`${card} space-y-5`}>
            {vid}
            <div>
              <h2 className={sectionTitle}>{t("اللغة", "Language")}</h2>
              <p className={hint}>
                {t(
                  "متجرك ثنائي اللغة. اختر اللغة التي تكتب بها عادة، وما يحدث عند نقص ترجمة.",
                  "Your store is bilingual. Pick the language you usually write in, and what happens when a translation is missing."
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="defaultLocale">{t("لغة الكتابة", "Authoring language")}</label>
                <SettingSelect
                  id="defaultLocale" name="defaultLocale" className={field}
                  defaultValue={s.default_locale ?? "ar"}
                  options={[
                    { value: "ar", label: t("العربية", "Arabic") },
                    { value: "en", label: t("الإنجليزية", "English") },
                    { value: "both", label: t("الاثنتان معاً", "Both side by side") },
                  ]}
                />
              </div>
              <div>
                <label className={label} htmlFor="currency">{t("العملة", "Currency")}</label>
                <SettingSelect
                  id="currency" name="currency" className={field}
                  defaultValue={s.currency ?? "SAR"}
                  options={[{ value: "SAR", label: t("ريال سعودي", "Saudi Riyal (SAR)") }]}
                />
              </div>
            </div>

            <Toggle name="localeFallback" defaultChecked={s.locale_fallback !== false}
              labelText={t("استخدم اللغة الأخرى عند نقص الترجمة", "Fall back to the other language")}
              note={t(
                "إذا كتبت الاسم بالعربية فقط، سيراه زائر الإنجليزية بالعربية بدل أن يراه فارغاً.",
                "If you only wrote the Arabic name, English visitors see the Arabic one instead of a blank."
              )} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="timezone">{t("المنطقة الزمنية", "Timezone")}</label>
                <SettingSelect
                  id="timezone" name="timezone" className={field}
                  defaultValue={s.timezone ?? "Asia/Riyadh"}
                  options={[{ value: "Asia/Riyadh", label: "Asia/Riyadh (GMT+3)" }]}
                />
              </div>
              <div>
                <label className={label} htmlFor="autoExpireDays">
                  {t("انتهاء الإعلان (أيام)", "Listing expiry (days)")}
                </label>
                <input id="autoExpireDays" name="autoExpireDays" type="number" min="0"
                  defaultValue={s.auto_expire_days ?? 90} className={field} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("٠ يعني بلا انتهاء.", "0 means never expire.")}
                </p>
              </div>
            </div>

            <div>
              <h2 className={sectionTitle}>{t("الظهور", "Visibility")}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Toggle name="showPhone" defaultChecked={s.show_phone !== false}
                labelText={t("إظهار رقم الجوال", "Show mobile number")} />
              <Toggle name="showWhatsapp" defaultChecked={s.show_whatsapp !== false}
                labelText={t("إظهار زر واتساب", "Show WhatsApp button")} />
            </div>

            <div>
              <h2 className={sectionTitle}>{t("التنبيهات", "Notifications")}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Toggle name="notifyLeads" defaultChecked={s.notify?.leads !== false}
                labelText={t("عميل محتمل جديد", "New lead")} />
              <Toggle name="notifyOrders" defaultChecked={s.notify?.orders !== false}
                labelText={t("طلب جديد", "New order")} />
              <Toggle name="notifyReviews" defaultChecked={s.notify?.reviews !== false}
                labelText={t("تقييم جديد", "New review")} />
              <Toggle name="notifyPayouts" defaultChecked={s.notify?.payouts !== false}
                labelText={t("تحويل مستحقات", "Payout sent")} />
            </div>

            <SaveBar state={l.result} pending={l.pending} />
          </form>
        ) : null}

        {/* ── Data: backup + delete ──────────────────────────────────────── */}
        {tab === "data" ? (
          <div className="space-y-5">
            {/* Backup */}
            <div className={card}>
              <h2 className={sectionTitle}>{t("النسخ الاحتياطي", "Backups")}</h2>
              <p className={hint}>
                {t(
                  "نسخة كاملة من بياناتك بصيغة JSON، تُحفظ في مساحتك ويمكنك تنزيلها في أي وقت.",
                  "A full JSON export of your data, saved to your own storage and downloadable any time."
                )}
              </p>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["listings", t("إعلانات", "Listings")],
                  ["media", t("صور", "Media")],
                  ["leads", t("عملاء محتملون", "Leads")],
                  ["orders", t("طلبات", "Orders")],
                  ["reviews", t("تقييمات", "Reviews")],
                ].map(([k, l]) => (
                  <div key={k} className="rounded-lg border p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-brand-primary">{counts[k] ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>

              <form action={k.formAction} className="flex flex-wrap items-end gap-3">
                {vid}
                <div className="min-w-[200px] flex-1">
                  <label className={label} htmlFor="note">{t("ملاحظة (اختياري)", "Note (optional)")}</label>
                  <input id="note" name="note" className={field}
                    placeholder={t("قبل حذف الإعلانات القديمة", "Before clearing old listings")} />
                </div>
                <button type="submit" disabled={k.pending}
                  className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363] disabled:opacity-60">
                  {k.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("إنشاء نسخة", "Create backup")}
                </button>
              </form>

              {k.result.error ? (
                <p className="mt-3 text-xs text-red-600">
                  {errorText(k.result.error, locale, k.result.params)}
                  {/* The raw driver message stays available but subordinate —
                      useful when reporting a failure, noise otherwise. */}
                  {k.result.detail ? (
                    <span className="block font-mono text-[11px] opacity-70">{k.result.detail}</span>
                  ) : null}
                </p>
              ) : null}
              {k.result.ok ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-green-600">
                  <Check className="h-3.5 w-3.5" />
                  {t("تم إنشاء النسخة", "Backup created")} · {mb(k.result.size)} MB
                </p>
              ) : null}

              {backups.length > 0 ? (
                <ul className="mt-4 divide-y border-t">
                  {backups.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {new Date(b.created_at).toLocaleString(isAr ? "ar-SA" : "en-GB")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {mb(b.size_bytes)} MB
                          {b.contents?.listings != null
                            ? ` · ${b.contents.listings} ${t("إعلان", "listings")}`
                            : ""}
                          {b.note ? ` · ${b.note}` : ""}
                        </p>
                      </div>
                      {/* Not b.url — backups sit in a private bucket, so there
                          is no permanent link. The route signs one per click. */}
                      <a href={`/api/marketplace/backups/${b.id}/download`}
                        className="flex items-center gap-1 text-xs text-brand-primary hover:underline">
                        <Download className="h-3 w-3" />
                        {t("تنزيل", "Download")}
                      </a>
                      <form action={r.formAction}>
                        {vid}
                        <input type="hidden" name="backupId" value={b.id} />
                        <button type="submit" disabled={r.pending}
                          className="flex items-center gap-1 text-xs text-brand-primary hover:underline disabled:opacity-60">
                          <Upload className="h-3 w-3" />
                          {t("استيراد", "Import")}
                        </button>
                      </form>
                      <form action={d.formAction}>
                        <input type="hidden" name="backupId" value={b.id} />
                        <button type="submit" disabled={d.pending}
                          className="flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60">
                          <Trash2 className="h-3 w-3" />
                          {t("حذف", "Delete")}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                  {t("لا توجد نسخ بعد.", "No backups yet.")}
                </p>
              )}

              {r.result?.error ? (
                <p className="mt-3 text-xs text-red-600">
                  {errorText(r.result.error, locale)}
                  {r.result.detail ? (
                    <span className="block font-mono text-[11px] opacity-70">{r.result.detail}</span>
                  ) : null}
                </p>
              ) : null}
              {r.result?.ok ? (
                <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Check className="h-3.5 w-3.5" />
                    {t("تم الاستيراد", "Import complete")}
                    {r.result.restored?.listings
                      ? ` · ${r.result.restored.listings} ${t("إعلان", "listings")}`
                      : ""}
                  </p>
                  {/* Deleting wipes the image FILES from storage; a backup only
                      carries the rows that point at them. Saying so here beats
                      letting them find broken thumbnails later. */}
                  {r.result.mediaWithoutFiles ? (
                    <p className="mt-1 text-green-700/80 dark:text-green-400/80">
                      {t(
                        `أُعيد ${r.result.mediaWithoutFiles} سجل صورة، لكن ملفات الصور نفسها حُذفت نهائياً — أعد رفعها.`,
                        `${r.result.mediaWithoutFiles} photo record(s) came back, but the image files themselves were permanently deleted — re-upload them.`
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Import from a file */}
            <div className={card}>
              <h2 className={sectionTitle}>{t("استيراد نسخة احتياطية", "Import a backup")}</h2>
              <p className={hint}>
                {t(
                  "ارفع ملف JSON نزّلته سابقاً. تُدمج السجلات بمعرّفاتها الأصلية، فاستيراد النسخة نفسها مرتين لا يكرّر شيئاً.",
                  "Upload a JSON file you downloaded earlier. Rows are merged on their original ids, so importing the same backup twice changes nothing."
                )}
              </p>

              <form action={r.formAction} className="flex flex-wrap items-end gap-3">
                {vid}
                <div className="min-w-[220px] flex-1">
                  <label className={label} htmlFor="backupFile">
                    {t("ملف النسخة (JSON)", "Backup file (JSON)")}
                  </label>
                  <input
                    id="backupFile"
                    name="file"
                    type="file"
                    accept="application/json,.json"
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm file:me-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs"
                  />
                </div>
                <button type="submit" disabled={r.pending}
                  className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363] disabled:opacity-60">
                  {r.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t("استيراد", "Import")}
                </button>
              </form>
            </div>

            {/* Danger zone */}
            <div className="rounded-xl border border-red-300 bg-red-50/50 p-5 dark:border-red-900 dark:bg-red-950/20">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {t("منطقة الخطر", "Danger zone")}
              </h2>
              <p className="mb-2 text-xs text-red-700/80 dark:text-red-400/80">
                {t(
                  "يحذف إعلاناتك وصورك واستفساراتك، ومدخلات الكتالوج التي أنشأتها بنفسك ولم تُعتمد بعد.",
                  "Removes your listings, photos and enquiries, plus any catalog entries you created yourself that staff has not approved."
                )}
              </p>
              <p className="mb-2 text-xs text-red-700/80 dark:text-red-400/80">
                {t(
                  "متجرك يبقى مفتوحاً ويمكنك الاستمرار في استخدام اللوحة. الطلبات المكتملة تبقى — فهي سجل المشتري والمحاسبة. الكتالوج المشترك لا يُمسّ.",
                  "Your store stays open and the dashboard keeps working. Completed orders are kept — they are the buyer's receipt and the accounting record. The shared catalog is untouched."
                )}
              </p>

              <p className="mb-4 text-xs font-medium text-red-700 dark:text-red-400">
                {t("خُذ نسخة احتياطية أولاً.", "Take a backup first.")}
              </p>

              <form action={x.formAction} className="space-y-3">
                {vid}
                <input type="hidden" name="expected" value={vendor?.slug ?? ""} />
                <div>
                  <label className={label} htmlFor="reason">{t("السبب (اختياري)", "Reason (optional)")}</label>
                  <input id="reason" name="reason" className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="confirm">
                    {t("اكتب", "Type")} <code className="rounded bg-red-100 px-1 dark:bg-red-900/50">{vendor?.slug}</code>{" "}
                    {t("للتأكيد", "to confirm")}
                  </label>
                  <input id="confirm" name="confirm" dir="ltr" autoComplete="off" className={field} />
                </div>

                {x.result.error ? (
                  <p className="text-xs text-red-600">
                    {errorText(x.result.error, locale, x.result.params)}
                  </p>
                ) : null}
                {x.result.ok ? (
                  <p className="text-xs text-green-700">
                    {t("تم الحذف.", "Deleted.")}{" "}
                    {t(
                      `أُبقيت ${x.result.removed?.orders_kept ?? 0} طلبات.`,
                      `${x.result.removed?.orders_kept ?? 0} orders kept.`
                    )}
                  </p>
                ) : null}

                <button type="submit" disabled={x.pending}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60">
                  {x.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t("حذف كل بياناتي", "Delete all my data")}
                </button>
              </form>
            </div>

            {/* ── The ACCOUNT, not the store ──────────────────────────────
                A separate block on purpose. The one above empties a showroom
                that stays open and keeps working; this one removes the person,
                the showroom and the login together. Presenting them as two
                settings of a single control is how somebody deletes the wrong
                thing.
                ------------------------------------------------------------ */}
            {account?.email ? (
              <DangerZone
                locale={locale}
                email={account.email}
                counts={account.counts ?? {}}
                showrooms={account.showrooms ?? []}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
    </>
  );
}
