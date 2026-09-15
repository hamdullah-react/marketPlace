"use client";

/**
 * Admin → Settings. Laid out like the seller's Store settings: a tab rail on
 * the side, and each tab its own <form> with its own Save — the action only
 * writes the fields a form sends, so saving Contact cannot touch Branding.
 *
 * Languages work exactly as they do for a showroom:
 *
 *   Authoring language  'ar' or 'en' → one box per field; 'both' → one box
 *                       plus a popup with both languages. Every admin screen
 *                       with bilingual text follows it (Settings, Home
 *                       carousel, Pages SEO, About us).
 *   Fallback            a text missing in the visitor's language shows the
 *                       other one instead of a blank.
 *
 * Both languages are always submitted whatever the mode, so switching modes
 * never discards a translation that was already written.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Palette, Languages, Phone, Search, Loader2, Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import BilingualField from "../../(seller)/_components/BilingualField";
import SocialLinksEditor from "../../(seller)/_components/SocialLinksEditor";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { saveSiteSettings } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";
import SiteImageField from "./SiteImageField";
import LanguagesTable from "./LanguagesTable";

const INITIAL = { ok: false, error: null };

const TABS = [
  { id: "branding", icon: Palette, ar: "الهوية والشعار", en: "Branding" },
  { id: "languages", icon: Languages, ar: "اللغة والتفضيلات", en: "Language & preferences" },
  { id: "contact", icon: Phone, ar: "التواصل والروابط", en: "Contact & links" },
  { id: "seo", icon: Search, ar: "إعدادات SEO العامة", en: "SEO defaults" },
];

const MODES = {
  ar: { ar: "العربية", en: "Arabic" },
  en: { ar: "الإنجليزية", en: "English" },
  both: { ar: "الاثنتان معاً", en: "Both side by side" },
};

const card = "raised-card space-y-5 rounded-xl p-5";

export default function SiteSettingsForm({ locale = "ar", row = null, languages = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [tab, setTab] = useState("branding");

  // One action per tab, so each Save shows its own result.
  const branding = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });
  const language = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });
  const contact = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });
  const seo = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });

  // The SAVED authoring language drives the fields — the same as a showroom,
  // where the choice takes effect once Language is saved.
  const mode = ["ar", "en", "both"].includes(row?.default_locale) ? row.default_locale : locale;

  // The language and social-link columns come from the newest SQL block in
  // schema.sql; until it runs they are absent from the row and cannot be saved.
  const newColumns = Boolean(row) && "default_locale" in row && "social_links" in row;

  const [authoring, setAuthoring] = useState(row?.default_locale ?? "ar");
  const [fallback, setFallback] = useState(row?.locale_fallback !== false);

  const [name, setName] = useState({ ar: row?.name?.ar ?? "", en: row?.name?.en ?? "" });
  const [logo, setLogo] = useState(row?.logo_url ?? "");

  /* Remount a form when the row really changed on the server — its inputs are
     uncontrolled, and defaultValue is only read on mount. */
  const stamp = row?.updated_at ?? "";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* ── Tab rail ──────────────────────────────────────────────────────── */}
      <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {TABS.map(({ id, icon: Icon, ar, en }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
              tab === id ? "raised-solid bg-brand-primary text-white" : "raised-hover text-muted-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{t(ar, en)}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0">
        {/* ── Branding ─────────────────────────────────────────────────────── */}
        {tab === "branding" ? (
          <form key={`branding-${stamp}`} action={branding.formAction} className={card}>
            <Heading
              title={t("هوية التطبيق", "App identity")}
              hint={t(
                "الاسم والشعار الظاهران في رأس الموقع وتذييله وعنوان المتصفح ونتائج البحث.",
                "The name and logo shown in the site header and footer, the browser tab and search results."
              )}
            />

            {/* What the header will look like. */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-linear-to-b from-[#F7FCF9] to-[#DCEFE4] px-4 py-3 dark:from-[#1B4029] dark:to-[#12301F]">
              {logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logo} alt="" className="h-10 w-auto max-w-[180px] object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">{t("الشعار الافتراضي", "Default logo")}</span>
              )}
              <span className="font-bold text-brand-primary">{name[locale] || name[isAr ? "en" : "ar"] || "—"}</span>
            </div>

            <BilingualField
              id="name" label={t("اسم التطبيق", "App name")} required
              mode={mode} locale={locale} maxLength={80}
              ar={row?.name?.ar ?? ""} en={row?.name?.en ?? ""}
              phAr="سوق الرميح" phEn="Alromaih Marketplace"
              onChange={setName}
            />
            <BilingualField
              id="tagline" label={t("الوصف المختصر", "Tagline")} textarea rows={3}
              mode={mode} locale={locale} maxLength={200}
              ar={row?.tagline?.ar ?? ""} en={row?.tagline?.en ?? ""}
              hint={t("يظهر في التذييل ووصف الموقع في نتائج البحث.", "Shown in the footer and as the site description in search results.")}
            />

            <Heading
              title={t("الشعار والأيقونة", "Logo and icon")}
              hint={t("تُرفع إلى تخزين الموقع وتظهر فوراً بعد الحفظ.", "Uploaded to the site's storage and shown as soon as you save.")}
            />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <SiteImageField
                locale={locale} name="logoUrl" value={row?.logo_url ?? ""} onChange={setLogo}
                folder="branding" shape="logo"
                label={t("الشعار", "Logo")}
                hint={t("PNG أو SVG بخلفية شفافة.", "PNG or SVG with a transparent background.")}
              />
              <SiteImageField
                locale={locale} name="logoDarkUrl" value={row?.logo_dark_url ?? ""}
                folder="branding" shape="logo"
                label={t("الشعار للوضع الداكن", "Logo for dark mode")}
                hint={t("اختياري. فارغ = الشعار نفسه.", "Optional. Blank = the same logo.")}
              />
              <SiteImageField
                locale={locale} name="faviconUrl" value={row?.favicon_url ?? ""}
                folder="branding" shape="square"
                label={t("أيقونة المتصفح", "Favicon")}
                hint={t("مربعة، ٥١٢×٥١٢ PNG.", "Square, 512×512 PNG.")}
              />
            </div>

            <SaveBar locale={locale} state={branding.result} pending={branding.pending} />
          </form>
        ) : null}

        {/* ── Language & preferences ───────────────────────────────────────── */}
        {tab === "languages" ? (
          <div className="space-y-5">
            <form key={`language-${stamp}`} action={language.formAction} className={card}>
              <input type="hidden" name="defaultLocale" value={authoring} />
              <input type="hidden" name="localeFallback" value={fallback ? "true" : "false"} />

              {!newColumns ? <SqlNote locale={locale} /> : null}

              <Heading
                title={t("اللغة", "Language")}
                hint={t(
                  "محتوى الموقع ثنائي اللغة. اختر اللغة التي تكتب بها عادة، وما يحدث عند نقص ترجمة.",
                  "The site's content is bilingual. Pick the language you usually write in, and what happens when a translation is missing."
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="default-locale" className="text-sm font-medium">{t("لغة الكتابة", "Authoring language")}</Label>
                  <Select value={authoring} onValueChange={setAuthoring} dir={isAr ? "rtl" : "ltr"}>
                    <SelectTrigger id="default-locale" className="raised h-10 w-full border-0">
                      <SelectValue>{t(MODES[authoring]?.ar ?? "", MODES[authoring]?.en ?? "")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="raised-card border-0">
                      {Object.keys(MODES).map((k) => (
                        <SelectItem key={k} value={k} className="raised-hover">{t(MODES[k].ar, MODES[k].en)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {authoring === "both"
                      ? t(
                          "كل حقل يعرض مربعاً واحداً وزر «اللغتان» لكتابة العربية والإنجليزية معاً.",
                          "Every field shows one box and a “Both” button to write Arabic and English together."
                        )
                      : t(
                          "كل حقل يعرض مربعاً واحداً بهذه اللغة. الترجمات المكتوبة سابقاً تبقى محفوظة.",
                          "Every field shows one box in this language. Translations already written are kept."
                        )}
                  </p>
                </div>
              </div>

              <label className="raised flex cursor-pointer items-start justify-between gap-3 rounded-lg p-3">
                <span className="flex-1">
                  <span className="block text-sm font-medium">
                    {t("استخدم اللغة الأخرى عند نقص الترجمة", "Fall back to the other language")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t(
                      "إذا كُتبت شريحة أو صفحة بالعربية فقط، يراها زائر الإنجليزية بالعربية بدل أن يراها فارغة.",
                      "If a slide or a page is only written in Arabic, English visitors see the Arabic text instead of a blank."
                    )}
                  </span>
                </span>
                <Switch checked={fallback} onCheckedChange={setFallback} />
              </label>

              <SaveBar locale={locale} state={language.result} pending={language.pending} />
            </form>

            {/* Which languages the public site offers — a table, as everywhere. */}
            <LanguagesTable locale={locale} languages={languages} />
          </div>
        ) : null}

        {/* ── Contact & links ──────────────────────────────────────────────── */}
        {tab === "contact" ? (
          <form key={`contact-${stamp}`} action={contact.formAction} className={card}>
            <Heading
              title={t("التواصل", "Contact")}
              hint={t(
                "تظهر في تذييل الموقع وفي بيانات المنظمة لمحركات البحث.",
                "Shown in the site footer and in the organisation data search engines read."
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="contact-email" label={t("البريد الإلكتروني", "Email")}>
                <Input id="contact-email" name="contactEmail" type="email" dir="ltr" defaultValue={row?.contact_email ?? ""} />
              </Field>
              <Field id="contact-phone" label={t("الهاتف", "Phone")}>
                <Input id="contact-phone" name="contactPhone" type="tel" dir="ltr" placeholder="05xxxxxxxx" defaultValue={row?.contact_phone ?? ""} />
              </Field>
              <Field id="contact-whatsapp" label={t("واتساب", "WhatsApp")}>
                <Input id="contact-whatsapp" name="whatsapp" type="tel" dir="ltr" placeholder="9665xxxxxxxx" defaultValue={row?.whatsapp ?? ""} />
              </Field>
            </div>

            <Heading title={t("العنوان", "Address")} hint={t("عنوان الشركة كما يظهر للزوار.", "The company address as visitors see it.")} />
            <BilingualField
              id="address" label={t("العنوان", "Address")} textarea rows={2}
              mode={mode} locale={locale} maxLength={300}
              ar={row?.address?.ar ?? ""} en={row?.address?.en ?? ""}
            />

            <Heading
              title={t("روابط التواصل الاجتماعي", "Social links")}
              hint={t(
                "أضف ما تشاء — واتساب، إنستغرام، أو أي رابط آخر باسمه وأيقونته. رتّبها بالسهمين؛ الترتيب هو ما يظهر في تذييل الموقع.",
                "Add as many as you like — WhatsApp, Instagram, or any other link with its own name and icon. The arrows set the order the site footer shows them in."
              )}
            />
            {!newColumns ? <SqlNote locale={locale} /> : null}
            <SocialLinksEditor locale={locale} name="socialLinks" value={row?.social_links ?? []} />

            <SaveBar locale={locale} state={contact.result} pending={contact.pending} />
          </form>
        ) : null}

        {/* ── SEO defaults ─────────────────────────────────────────────────── */}
        {tab === "seo" ? (
          <form key={`seo-${stamp}`} action={seo.formAction} className={card}>
            <Heading
              title={t("المشاركة على وسائل التواصل", "Sharing")}
              hint={t(
                "تُستخدم في كل صفحة لم تُحدَّد لها قيمة خاصة في «تحسين محركات البحث».",
                "Used on every page that has no value of its own on Pages SEO."
              )}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SiteImageField
                locale={locale} name="defaultOgImageUrl" value={row?.default_og_image_url ?? ""}
                folder="seo" shape="wide" cover
                label={t("صورة المشاركة الافتراضية", "Default share image")}
                hint={t("١٢٠٠×٦٣٠. تظهر عند مشاركة رابط في واتساب أو X.", "1200×630. Shown when a link is shared on WhatsApp or X.")}
              />
              <Field id="twitter-handle" label={t("حساب X (تويتر)", "X (Twitter) handle")}>
                <Input
                  id="twitter-handle" name="twitterHandle" dir="ltr" placeholder="@alromaihcars"
                  defaultValue={row?.twitter_handle ? `@${row.twitter_handle}` : ""}
                />
              </Field>
            </div>

            <Heading
              title={t("التحقق من ملكية الموقع", "Site verification")}
              hint={t(
                "الصق القيمة داخل content فقط من الوسم الذي يعطيك إياه Google أو Bing.",
                "Paste only the content value of the tag Google or Bing gives you."
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="google-verification" label="Google Search Console" hint="google-site-verification">
                <Input id="google-verification" name="googleSiteVerification" dir="ltr" className="font-mono text-xs" defaultValue={row?.google_site_verification ?? ""} />
              </Field>
              <Field id="bing-verification" label="Bing Webmaster Tools" hint="msvalidate.01">
                <Input id="bing-verification" name="bingSiteVerification" dir="ltr" className="font-mono text-xs" defaultValue={row?.bing_site_verification ?? ""} />
              </Field>
            </div>

            <SaveBar locale={locale} state={seo.result} pending={seo.pending} />
          </form>
        ) : null}
      </div>
    </div>
  );
}

/* ── Module scope — never declared inside the form. ───────────────────────── */

function SqlNote({ locale }) {
  const t = (ar, en) => (locale === "ar" ? ar : en);
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      {t(
        "لحفظ هذا الإعداد شغّل آخر قسم «Authoring language, translation fallback and social links» في schema.sql داخل Supabase ← SQL Editor، ثم حدّث الصفحة.",
        "To save this, run the last block “Authoring language, translation fallback and social links” of schema.sql in Supabase → SQL Editor, then refresh."
      )}
    </p>
  );
}

function Heading({ title, hint }) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-bold text-brand-primary">{title}</h2>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Field({ id, label, hint, children }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {children}
      {hint ? <p className="font-mono text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SaveBar({ locale, state, pending }) {
  const t = (ar, en) => (locale === "ar" ? ar : en);
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <span className="text-xs">
        {state?.ok ? (
          <span className="flex items-center gap-1.5 text-green-600">
            <Check className="h-3.5 w-3.5" /> {t("تم الحفظ", "Saved")}
          </span>
        ) : state?.error ? (
          <span className="text-red-600">{errorText(state.error, locale, state.params)}</span>
        ) : null}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="raised-solid flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("حفظ", "Save")}
      </button>
    </div>
  );
}
