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
  Palette, Languages, Phone, Search, Loader2, Check, Paintbrush,
  Building2, LineChart, Plus, X,
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
import { formatPrice } from "@/marketplace/lib/listing";
import { CURRENCIES } from "@/marketplace/lib/currency";
import LanguagesTable from "./LanguagesTable";
import PhoneCountriesField from "./PhoneCountriesField";
import ThemeField from "@/marketplace/ui/ThemeField";
import { Textarea } from "@/components/ui/textarea";
import TagsInput from "../../(seller)/_components/TagsInput";
import { TITLE_MAX, DESCRIPTION_MAX, OG_TYPES, TWITTER_CARDS } from "@/marketplace/lib/sitePages";

const INITIAL = { ok: false, error: null };

const TABS = [
  { id: "branding", icon: Palette, ar: "الهوية والشعار", en: "Branding" },
  { id: "appearance", icon: Paintbrush, ar: "الألوان والمظهر", en: "Appearance" },
  { id: "languages", icon: Languages, ar: "اللغة والتفضيلات", en: "Language & preferences" },
  { id: "contact", icon: Phone, ar: "التواصل والروابط", en: "Contact & links" },
  { id: "seo", icon: Search, ar: "إعدادات SEO العامة", en: "SEO defaults" },
  { id: "business", icon: Building2, ar: "بيانات المنشأة", en: "Business details" },
  { id: "analytics", icon: LineChart, ar: "التحليلات والتتبع", en: "Analytics & tracking" },
];

/** ISO weekdays, Monday first — the order schema.org and every rota uses. */
const WEEKDAYS = [
  { n: 1, ar: "الاثنين", en: "Mon" },
  { n: 2, ar: "الثلاثاء", en: "Tue" },
  { n: 3, ar: "الأربعاء", en: "Wed" },
  { n: 4, ar: "الخميس", en: "Thu" },
  { n: 5, ar: "الجمعة", en: "Fri" },
  { n: 6, ar: "السبت", en: "Sat" },
  { n: 7, ar: "الأحد", en: "Sun" },
];

/**
 * The measurement ids, with the shape each vendor issues.
 *
 * `hint` is the shape, because the single most common way to get this wrong is
 * to paste the whole <script> block from the vendor's dashboard. The action
 * refuses anything that does not match — see §32 on why a form that accepted
 * a script would be a hole in our own origin.
 */
const TRACKERS = [
  { key: "ga4", label: "Google Analytics 4", hint: "G-XXXXXXX" },
  { key: "gtm", label: "Google Tag Manager", hint: "GTM-XXXXXXX" },
  { key: "meta_pixel", labelAr: "بكسل ميتا (فيسبوك)", label: "Meta (Facebook) pixel", hint: "1234567890123456" },
  { key: "tiktok_pixel", labelAr: "بكسل تيك توك", label: "TikTok pixel", hint: "CXXXXXXXXXXXXXXXXXX" },
  { key: "snapchat_pixel", labelAr: "بكسل سناب شات", label: "Snapchat pixel", hint: "00000000-0000-0000-0000-000000000000" },
  { key: "clarity", label: "Microsoft Clarity", hint: "abcdefghij" },
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
  const appearance = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });
  const business = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });
  const analytics = useActionResult(saveSiteSettings, INITIAL, { onSuccess: () => router.refresh() });

  /* ── §32 state ──────────────────────────────────────────────────────────
     Three fields are lists or objects rather than strings, so they are held
     here and submitted as one JSON input each: the keyword chips, the opening
     hours rows and the contact points. The tracking ids are kept together for
     the same reason — they are one jsonb column, not six. */
  const [siteKeywords, setSiteKeywords] = useState({
    ar: Array.isArray(row?.meta_keywords?.ar) ? row.meta_keywords.ar : [],
    en: Array.isArray(row?.meta_keywords?.en) ? row.meta_keywords.en : [],
  });
  const [hours, setHours] = useState(Array.isArray(row?.opening_hours) ? row.opening_hours : []);
  const [points, setPoints] = useState(Array.isArray(row?.contact_points) ? row.contact_points : []);
  const [trackers, setTrackers] = useState(() =>
    Object.fromEntries(TRACKERS.map(({ key }) => [key, row?.analytics?.[key] ?? ""]))
  );

  /* The §32 columns, like `newColumns` above: until that section of
     schema.sql has run they are not on the row, and saving them would fail on
     a column that does not exist. */
  const seoColumns = Boolean(row) && "meta_title" in row && "analytics" in row;

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
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-linear-to-b from-[var(--surface-header-from)] to-[var(--surface-header-to)] px-4 py-3 dark:from-[var(--surface-dark-from)] dark:to-[var(--surface-dark-to)]">
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
              phAr="سودة" phEn="SAUDA"
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

              {/* ── What the platform bills in ────────────────────────────
                  Here rather than under Finance because it is a presentation
                  setting like the language beside it: it changes how every
                  price on the site READS, not only what showrooms are charged.
                  Free text, because a dropdown of currencies we thought of is
                  the hardcoded 'SAR' problem with more steps — the list below
                  is a shortcut, not a limit.
                  ------------------------------------------------------- */}
              <Field
                id="currency"
                label={t("عملة المنصة", "Platform currency")}
                hint="ISO 4217"
              >
                <Input
                  id="currency"
                  name="currency"
                  dir="ltr"
                  list="currency-suggestions"
                  maxLength={3}
                  placeholder="SAR"
                  className="font-mono uppercase"
                  defaultValue={row?.currency ?? "SAR"}
                />
                <datalist id="currency-suggestions">
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {t(c.ar, c.en)}
                    </option>
                  ))}
                </datalist>

                <p className="text-xs text-muted-foreground">
                  {t(
                    "يُستخدم في الاشتراكات والتمييز وكل المستحقات. تغييره لا يُعيد تسعير سيارات المعارض — فذلك تغيير في المبلغ نفسه وليس في طريقة عرضه.",
                    "Used for subscriptions, promotions and every charge. Changing it does not re-price showrooms’ cars — that would change what they are asking, not how it is displayed."
                  )}
                </p>

                {/* What they are choosing, in their own language, before they
                    save it — a code is not a thing most people can picture. */}
                <p className="text-xs text-muted-foreground">
                  {t("مثال: ", "For example: ")}
                  <span className="font-medium text-brand-primary">
                    {formatPrice(2999, locale, row?.currency ?? "SAR")}
                  </span>
                </p>
              </Field>

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

            {/* ── Which phone numbers the site accepts ───────────────────────
                Signing up, a showroom's contact details, a promotion request
                and a buyer's enquiry are all checked against this. */}
            <Heading
              title={t("أرقام الجوال المقبولة", "Accepted mobile numbers")}
              hint={t(
                "الدول التي تُقبل أرقامها في التسجيل وبيانات المعارض وطلبات الترويج ونماذج التواصل.",
                "The countries whose numbers are accepted at signup, in showroom details, promotion requests and enquiry forms."
              )}
            />
            <PhoneCountriesField
              locale={locale}
              name="phoneCountries"
              value={row?.phone_countries ?? ["SA"]}
            />

            <SaveBar locale={locale} state={contact.result} pending={contact.pending} />
          </form>
        ) : null}

        {/* ── Appearance ───────────────────────────────────────────────────── */}
        {tab === "appearance" ? (
          <form key={`appearance-${stamp}`} action={appearance.formAction} className={card}>
            <Heading
              title={t("الألوان والمظهر", "Colours and appearance")}
              hint={t(
                "لون واحد يسري على الموقع كله — الأزرار والبطاقات والظلال — مع انحناء الزوايا وقوة الظل.",
                "One colour drives the whole site — buttons, cards and shadows — alongside corner roundness and shadow strength."
              )}
            />

            <ThemeField locale={locale} value={row?.theme ?? null} />

            <SaveBar locale={locale} state={appearance.result} pending={appearance.pending} />
          </form>
        ) : null}

        {/* ── SEO defaults ─────────────────────────────────────────────────── */}
        {tab === "seo" ? (
          <form key={`seo-${stamp}`} action={seo.formAction} className={card}>
            {seoColumns ? null : <SqlNote locale={locale} />}

            <Heading
              title={t("نتيجة البحث الافتراضية", "Default search result")}
              hint={t(
                "ما تستخدمه أي صفحة لم تُكتب لها قيمة خاصة في «تحسين محركات البحث». اتركه فارغاً ليُستخدم اسم الموقع ووصفه المختصر كما كان.",
                "What any page with no value of its own on Pages SEO falls back to. Leave blank to keep using the site name and tagline, as before."
              )}
            />

            <BilingualField
              id="seoTitle" label={t("العنوان الافتراضي", "Default title")}
              mode={mode} locale={locale} maxLength={TITLE_MAX}
              ar={row?.meta_title?.ar ?? ""} en={row?.meta_title?.en ?? ""}
              phAr="سيارات جديدة ومستعملة في السعودية" phEn="New & Used Cars in Saudi Arabia"
              hint={t(`الأفضل ألا يتجاوز ${TITLE_MAX} حرفاً.`, `Best kept under ${TITLE_MAX} characters.`)}
            />

            <BilingualField
              id="seoDescription" label={t("الوصف الافتراضي", "Default description")} textarea rows={3}
              mode={mode} locale={locale} maxLength={DESCRIPTION_MAX}
              ar={row?.meta_description?.ar ?? ""} en={row?.meta_description?.en ?? ""}
              hint={t(
                `السطران تحت العنوان في نتيجة البحث. حتى ${DESCRIPTION_MAX} حرفاً. هذا غير «الوصف المختصر» في الهوية — ذاك للتذييل.`,
                `The two lines under the title in a search result, up to ${DESCRIPTION_MAX} characters. Not the same as the Tagline on Branding — that one is for the footer.`
              )}
            />

            <BilingualField
              id="titleTemplate" label={t("قالب العنوان", "Title template")}
              mode={mode} locale={locale} maxLength={100}
              ar={row?.title_template?.ar ?? ""} en={row?.title_template?.en ?? ""}
              phAr="%s | سودة" phEn="%s | SAUDA"
              hint={t(
                "يجب أن يحتوي على %s — وهو موضع عنوان الصفحة نفسها. فارغ = «عنوان الصفحة | اسم الموقع».",
                "Must contain %s — that is where the page’s own title goes. Blank = “Page title | Site name”."
              )}
            />

            <Heading
              title={t("الكلمات المفتاحية الافتراضية", "Default keywords")}
              hint={t(
                "اكتب عبارة ثم اضغط Enter. تُستخدم للصفحات التي لم تُحدَّد لها كلماتها.",
                "Type a phrase and press Enter. Used by pages that have none of their own."
              )}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {["ar", "en"].map((l) => (
                <div key={l} className="grid gap-1.5">
                  <Label className="text-xs">{l === "ar" ? t("بالعربية", "Arabic") : t("بالإنجليزية", "English")}</Label>
                  <TagsInput
                    name={l === "ar" ? "seoKeywordsAr" : "seoKeywordsEn"}
                    value={siteKeywords[l]}
                    onChange={(next) => setSiteKeywords({ ...siteKeywords, [l]: next })}
                    dir={l === "ar" ? "rtl" : "ltr"}
                    t={t}
                    placeholder={l === "ar" ? "سيارات للبيع، معارض سيارات…" : "cars for sale, car showrooms…"}
                  />
                </div>
              ))}
            </div>

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
                  id="twitter-handle" name="twitterHandle" dir="ltr" placeholder="@sauda"
                  defaultValue={row?.twitter_handle ? `@${row.twitter_handle}` : ""}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="site-og-type" label={t("نوع المحتوى (og:type)", "Content type (og:type)")}
                hint={t("website لسوق، article لموقع مقالات.", "website for a marketplace, article for a publication.")}
              >
                <Select name="siteOgType" defaultValue={row?.og_type ?? "website"}>
                  <SelectTrigger id="site-og-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OG_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                id="site-twitter-card" label={t("شكل البطاقة في X", "Card style on X")}
                hint={t("summary_large_image يعرض الصورة كاملة.", "summary_large_image shows the picture full width.")}
              >
                <Select name="siteTwitterCard" defaultValue={row?.twitter_card ?? "summary_large_image"}>
                  <SelectTrigger id="site-twitter-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TWITTER_CARDS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* ── The kill switch ─────────────────────────────────────────── */}
            <Heading
              title={t("الظهور في محركات البحث", "Search engine visibility")}
              hint={t(
                "مفتاح واحد للموقع كله. إيقافه يخفي كل الصفحات مهما كانت إعداداتها — لنسخة التجربة أو قبل الإطلاق.",
                "One switch for the whole site. Off hides every page whatever its own setting says — for a staging copy, or the week before launch."
              )}
            />
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0">
                <Label htmlFor="site-seo-index" className="text-sm">
                  {t("السماح بظهور الموقع في نتائج البحث", "Allow the site to appear in search results")}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "لا يجعل أي صفحة مخفية ظاهرة — كل صفحة تحتفظ بإعدادها الخاص.",
                    "It never makes a hidden page visible — each page keeps its own setting."
                  )}
                </p>
              </div>
              <Switch
                id="site-seo-index" name="siteSeoIndex"
                defaultChecked={row?.seo_index !== false}
              />
            </div>

            <Field
              id="robots-extra" label={t("مسارات إضافية تُمنع من الفهرسة", "Extra disallowed paths")}
              hint={t(
                "مسار في كل سطر، بدون كلمة Disallow. لوحات التحكم والسلة والدفع ممنوعة أصلاً ولا تحتاج كتابتها.",
                "One path per line, without the word Disallow. The dashboards, cart and checkout are blocked already and do not need listing."
              )}
            >
              <Textarea
                id="robots-extra" name="robotsExtra" dir="ltr" rows={4} spellCheck={false}
                className="font-mono text-xs"
                defaultValue={row?.robots_extra ?? ""}
                placeholder={"/ar/marketplace/old-campaign\n/*/marketplace/print"}
              />
            </Field>

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
              <Field id="yandex-verification" label="Yandex Webmaster" hint="yandex-verification">
                <Input id="yandex-verification" name="yandexSiteVerification" dir="ltr" className="font-mono text-xs" defaultValue={row?.yandex_site_verification ?? ""} />
              </Field>
              <Field id="pinterest-verification" label="Pinterest" hint="p:domain_verify">
                <Input id="pinterest-verification" name="pinterestSiteVerification" dir="ltr" className="font-mono text-xs" defaultValue={row?.pinterest_site_verification ?? ""} />
              </Field>
              <Field
                id="facebook-verification" label="Facebook / Meta" hint="facebook-domain-verification"
              >
                <Input id="facebook-verification" name="facebookDomainVerification" dir="ltr" className="font-mono text-xs" defaultValue={row?.facebook_domain_verification ?? ""} />
              </Field>
            </div>

            <SaveBar locale={locale} state={seo.result} pending={seo.pending} />
          </form>
        ) : null}

        {/* ── Business details ─────────────────────────────────────────────
            What turns the Organization block on the home page into a business
            a search engine can place on a map and show in a knowledge panel.
            All optional; a blank field is simply left out of the graph. */}
        {tab === "business" ? (
          <form key={`business-${stamp}`} action={business.formAction} className={card}>
            {seoColumns ? null : <SqlNote locale={locale} />}

            <Heading
              title={t("المنشأة", "The company")}
              hint={t(
                "تظهر في البيانات المنظمة للصفحة الرئيسية — ما تقرأه جوجل لمعرفة من يقف خلف الموقع.",
                "Published in the home page’s structured data — how a search engine learns who is behind the site."
              )}
            />

            <BilingualField
              id="legalName" label={t("الاسم النظامي", "Legal name")}
              mode={mode} locale={locale} maxLength={200}
              ar={row?.legal_name?.ar ?? ""} en={row?.legal_name?.en ?? ""}
              hint={t(
                "اسم الشركة في السجل التجاري، إن كان مختلفاً عن الاسم التجاري.",
                "The company name on the commercial registration, when it differs from the brand."
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="cr-number" label={t("رقم السجل التجاري", "Commercial registration (CR)")}>
                <Input id="cr-number" name="crNumber" dir="ltr" defaultValue={row?.cr_number ?? ""} />
              </Field>
              <Field id="vat-number" label={t("الرقم الضريبي", "VAT number")}>
                <Input id="vat-number" name="vatNumber" dir="ltr" defaultValue={row?.vat_number ?? ""} />
              </Field>
              <Field id="founded-year" label={t("سنة التأسيس", "Founded")}>
                <Input
                  id="founded-year" name="foundedYear" dir="ltr" inputMode="numeric"
                  placeholder="2024" defaultValue={row?.founded_year ?? ""}
                />
              </Field>
              <Field
                id="price-range" label={t("مستوى الأسعار", "Price range")}
                hint={t("رموز جوجل: $ إلى $$$$.", "Google’s own scale: $ to $$$$.")}
              >
                <Input
                  id="price-range" name="priceRange" dir="ltr" placeholder="$$"
                  defaultValue={row?.price_range ?? ""}
                />
              </Field>
            </div>

            <Heading
              title={t("الموقع على الخريطة", "Map location")}
              hint={t(
                "الإحداثيات التي تضع الدبوس. انسخها من جوجل مابس: اضغط على الموقع مطوّلاً وستظهر في الأعلى.",
                "The coordinates that place the pin. Copy them from Google Maps: long-press the spot and they appear at the top."
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="geo-lat" label={t("خط العرض", "Latitude")}>
                <Input id="geo-lat" name="geoLat" dir="ltr" inputMode="decimal" placeholder="24.7136" defaultValue={row?.geo?.lat ?? ""} />
              </Field>
              <Field id="geo-lng" label={t("خط الطول", "Longitude")}>
                <Input id="geo-lng" name="geoLng" dir="ltr" inputMode="decimal" placeholder="46.6753" defaultValue={row?.geo?.lng ?? ""} />
              </Field>
            </div>

            <Heading
              title={t("ساعات العمل", "Opening hours")}
              hint={t(
                "صف واحد لكل مجموعة أيام متشابهة. اتركها فارغة إذا لم تكن ساعات ثابتة.",
                "One row per group of days that share the same hours. Leave empty if the hours are not fixed."
              )}
            />
            <OpeningHoursEditor rows={hours} onChange={setHours} t={t} />
            <input type="hidden" name="openingHours" value={JSON.stringify(hours)} />

            <Heading
              title={t("جهات الاتصال", "Contact points")}
              hint={t(
                "رقم لكل غرض — المبيعات، الدعم — بدل رقم واحد لكل شيء.",
                "A number per job — sales, support — instead of one switchboard line."
              )}
            />
            <ContactPointsEditor rows={points} onChange={setPoints} t={t} />
            <input type="hidden" name="contactPoints" value={JSON.stringify(points)} />

            <SaveBar locale={locale} state={business.result} pending={business.pending} />
          </form>
        ) : null}

        {/* ── Analytics ────────────────────────────────────────────────────
            Ids, never snippets. The app builds each tag from the id, so a
            field here cannot become arbitrary script on our own origin. */}
        {tab === "analytics" ? (
          <form key={`analytics-${stamp}`} action={analytics.formAction} className={card}>
            {seoColumns ? null : <SqlNote locale={locale} />}

            <Heading
              title={t("أدوات القياس", "Measurement tools")}
              hint={t(
                "الصق المعرّف فقط — وليس كود السكربت كاملاً. يُحمَّل الوسم تلقائياً في كل صفحة عامة؛ اترك الحقل فارغاً لإيقافه.",
                "Paste the id only — not the whole script block. The tag is loaded on every public page; leave a field blank to switch it off."
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TRACKERS.map((tr) => (
                <Field
                  key={tr.key}
                  id={`tracker-${tr.key}`}
                  label={isAr && tr.labelAr ? tr.labelAr : tr.label}
                  hint={tr.hint}
                >
                  <Input
                    id={`tracker-${tr.key}`} dir="ltr" className="font-mono text-xs"
                    placeholder={tr.hint}
                    value={trackers[tr.key]}
                    onChange={(e) => setTrackers({ ...trackers, [tr.key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <input type="hidden" name="analytics" value={JSON.stringify(trackers)} />

            <p className="text-xs text-muted-foreground">
              {t(
                "لا تُحمَّل هذه الأدوات في لوحات التحكم أو صفحات الحساب — القياس للزوار، لا لفريق العمل.",
                "These are not loaded on the dashboards or account pages — measurement is for visitors, not for your own team."
              )}
            </p>

            <SaveBar locale={locale} state={analytics.result} pending={analytics.pending} />
          </form>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Opening hours, as rows of (days, from, to).
 *
 * Days are CHIPS rather than a multi-select: the common shapes are "Sunday to
 * Thursday" and "Friday, Saturday", and both are two taps here.
 */
function OpeningHoursEditor({ rows, onChange, t }) {
  const update = (i, patch) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const toggleDay = (i, day) => {
    const days = rows[i]?.days ?? [];
    update(i, { days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = (row.days ?? []).includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDay(i, d.n)}
                  aria-pressed={on}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    on ? "bg-brand-primary text-white" : "raised-hover text-muted-foreground"
                  }`}
                >
                  {t(d.ar, d.en)}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("من", "From")}</Label>
              <Input
                type="time" dir="ltr" className="w-32"
                value={row.opens ?? ""}
                onChange={(e) => update(i, { opens: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("إلى", "To")}</Label>
              <Input
                type="time" dir="ltr" className="w-32"
                value={row.closes ?? ""}
                onChange={(e) => update(i, { closes: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, n) => n !== i))}
              className="raised-hover ms-auto rounded-md p-2 text-muted-foreground"
              aria-label={t("حذف", "Remove")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {rows.length < 7 ? (
        <button
          type="button"
          onClick={() => onChange([...rows, { days: [], opens: "09:00", closes: "21:00" }])}
          className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-primary"
        >
          <Plus className="h-4 w-4" />
          {t("إضافة صف", "Add a row")}
        </button>
      ) : null}
    </div>
  );
}

/** [{ type, phone, email }] — a row per job. */
function ContactPointsEditor({ rows, onChange, t }) {
  const update = (i, patch) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("الغرض", "Job")}</Label>
            <Input
              placeholder={t("المبيعات", "sales")}
              value={row.type ?? ""}
              onChange={(e) => update(i, { type: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("الجوال", "Phone")}</Label>
            <Input
              dir="ltr" placeholder="+966…"
              value={row.phone ?? ""}
              onChange={(e) => update(i, { phone: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("البريد", "Email")}</Label>
            <Input
              dir="ltr" type="email"
              value={row.email ?? ""}
              onChange={(e) => update(i, { email: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, n) => n !== i))}
            className="raised-hover self-end rounded-md p-2 text-muted-foreground"
            aria-label={t("حذف", "Remove")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {rows.length < 6 ? (
        <button
          type="button"
          onClick={() => onChange([...rows, { type: "", phone: "", email: "" }])}
          className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-primary"
        >
          <Plus className="h-4 w-4" />
          {t("إضافة جهة اتصال", "Add a contact point")}
        </button>
      ) : null}
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
