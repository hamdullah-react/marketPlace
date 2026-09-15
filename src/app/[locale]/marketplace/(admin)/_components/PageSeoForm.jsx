"use client";

/**
 * One page's search and share settings — Admin → Website content → Pages SEO.
 *
 * Laid out like the SEO tab of the listing form: the RESULT first (a Google
 * result and a share card, drawn from what is being typed), then each field
 * with a line on what it is for. Every field is optional — a blank one uses the
 * page's built-in text, shown as its placeholder.
 */

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import SharedBilingualField from "../../(seller)/_components/BilingualField";
import { useRouter } from "next/navigation";
import {
  Loader2, Save, CheckCircle2, AlertCircle, Sparkles, Heading, AlignLeft, Tags, Share2,
  Globe2, Link2, Braces, EyeOff, ExternalLink, AtSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import TagsInput from "../../(seller)/_components/TagsInput";
import SiteImageField from "./SiteImageField";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { savePageSeo } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";
import { keywordList } from "@/marketplace/lib/seo";
import { CHANGEFREQ, TITLE_MAX, DESCRIPTION_MAX } from "@/marketplace/lib/sitePages";

const INITIAL = { ok: false, error: null };
const bi = (v) => ({ ar: typeof v?.ar === "string" ? v.ar : "", en: typeof v?.en === "string" ? v.en : "" });
const PRIORITIES = ["1.0", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1", "0.0"];

const FREQ = {
  always: { ar: "دائماً", en: "Always" },
  hourly: { ar: "كل ساعة", en: "Hourly" },
  daily: { ar: "يومياً", en: "Daily" },
  weekly: { ar: "أسبوعياً", en: "Weekly" },
  monthly: { ar: "شهرياً", en: "Monthly" },
  yearly: { ar: "سنوياً", en: "Yearly" },
  never: { ar: "أبداً", en: "Never" },
};

const OG_TYPE = {
  website: { ar: "موقع (website)", en: "Website" },
  article: { ar: "مقال (article)", en: "Article" },
  profile: { ar: "ملف (profile)", en: "Profile" },
};

const CARD = {
  summary_large_image: { ar: "صورة كبيرة", en: "Large image" },
  summary: { ar: "صورة صغيرة", en: "Small image" },
};

/** null when the text is empty or valid JSON, otherwise a reason. */
function jsonProblem(text) {
  if (!text.trim()) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? null : "shape";
  } catch {
    return "syntax";
  }
}

/** The admin's authoring language (Settings → Language), read by every bilingual field below. */
const FieldMode = createContext({ mode: "both", locale: "ar" });

export default function PageSeoForm({ locale = "ar", page, row = null, siteName, siteUrl, defaultOgImage = "", mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const save = useActionResult(savePageSeo, INITIAL, { onSuccess: () => router.refresh() });

  const [lang, setLang] = useState(locale);
  const [title, setTitle] = useState(bi(row?.meta_title));
  const [description, setDescription] = useState(bi(row?.meta_description));
  const [keywords, setKeywords] = useState({
    ar: keywordList(row?.meta_keywords?.ar),
    en: keywordList(row?.meta_keywords?.en),
  });
  const [ogTitle, setOgTitle] = useState(bi(row?.og_title));
  const [ogDescription, setOgDescription] = useState(bi(row?.og_description));
  const [ogImage, setOgImage] = useState(row?.og_image_url ?? "");
  const [ogType, setOgType] = useState(row?.og_type ?? "website");
  const [twitterCard, setTwitterCard] = useState(row?.twitter_card ?? "summary_large_image");
  const [index, setIndex] = useState(row ? row.seo_index !== false : page.index);
  const [follow, setFollow] = useState(row ? row.seo_follow !== false : page.index);
  const [changefreq, setChangefreq] = useState(row?.seo_changefreq ?? page.changefreq);
  const [priority, setPriority] = useState(Number(row?.seo_priority ?? page.priority).toFixed(1));
  const [json, setJson] = useState(row?.structured_data ? JSON.stringify(row.structured_data, null, 2) : "");

  // What the preview shows: typed value → built-in default.
  const url = row?.canonical_url || `${siteUrl}/${lang}/marketplace${page.path}`;
  const effTitle = title[lang] || page.title[lang];
  const googleTitle = page.key === "home" ? effTitle : `${effTitle} | ${siteName[lang]}`;
  const effDescription = description[lang] || page.description[lang];
  const shareTitle = ogTitle[lang] || effTitle;
  const shareDescription = ogDescription[lang] || effDescription;
  const shareImage = ogImage || defaultOgImage;
  const host = siteUrl.replace(/^https?:\/\//, "");
  const problem = jsonProblem(json);

  const insertTemplate = () =>
    setJson(
      JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": page.key === "about" ? "AboutPage" : "WebPage",
          name: effTitle,
          description: effDescription,
          url,
          inLanguage: lang,
        },
        null,
        2
      )
    );

  const shownLangs = mode === "both" ? ["ar", "en"] : [mode === "en" ? "en" : "ar"];

  return (
    <FieldMode.Provider value={{ mode, locale }}>
    <form action={save.formAction} className="grid gap-4 pb-20">
      <input type="hidden" name="pageKey" value={page.key} />
      <input type="hidden" name="seoIndex" value={index ? "true" : "false"} />
      <input type="hidden" name="seoFollow" value={follow ? "true" : "false"} />

      {/* ── The result ───────────────────────────────────────────────────── */}
      <Section
        icon={Sparkles}
        title={t("المعاينة", "Preview")}
        hint={t(
          "كل حقل تتركه فارغاً يستخدم النص الافتراضي للصفحة. المعاينة تتحدث مع كل حرف.",
          "Every field you leave blank uses the page's default text. The preview updates as you type."
        )}
        tone
        aside={<LangToggle lang={lang} onChange={setLang} />}
      >
        {!index ? (
          <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <EyeOff className="h-3.5 w-3.5 shrink-0" />
            {t(
              "هذه الصفحة مخفية عن محركات البحث (noindex). فعّل «إظهار في نتائج البحث» أدناه عند الإطلاق.",
              "This page is hidden from search engines (noindex). Turn on “Show in search results” below at launch."
            )}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Google, drawn the way Google draws it. */}
          <div className="space-y-1.5 rounded-lg border border-brand-primary/20 bg-white p-4 dark:bg-[#161616]" dir={lang === "ar" ? "rtl" : "ltr"}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t("في جوجل", "On Google")}</p>
            <p className="text-xs text-gray-700 dark:text-gray-300">{siteName[lang]}</p>
            <p className="truncate text-xs text-[#006621] dark:text-[#5f9c5f]" dir="ltr">{url}</p>
            <p className={`text-base leading-snug text-[#1a0dab] dark:text-[#8ab4f8] ${googleTitle.length > TITLE_MAX + 20 ? "line-clamp-1" : ""}`}>
              {googleTitle}
            </p>
            <p className="line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{effDescription}</p>
          </div>

          {/* The card WhatsApp, X and Facebook show. */}
          <div className="overflow-hidden rounded-lg border bg-white dark:bg-[#161616]" dir={lang === "ar" ? "rtl" : "ltr"}>
            <div className="relative aspect-[1200/630] w-full bg-muted">
              {shareImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={shareImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  {t("لا توجد صورة مشاركة", "No share image")}
                </span>
              )}
            </div>
            <div className="space-y-0.5 p-3">
              <p className="text-[11px] uppercase text-gray-400" dir="ltr">{host}</p>
              <p className="line-clamp-1 text-sm font-semibold">{shareTitle}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{shareDescription}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Meta title ───────────────────────────────────────────────────── */}
      <Section
        icon={Heading}
        title={t("عنوان الصفحة (Meta Title)", "Meta title")}
        hint={t("السطر الأزرق في نتائج البحث. الأفضل ألا يتجاوز 60 حرفاً.", "The blue line in search results. Best kept under 60 characters.")}
      >
        <BilingualField
          id="metaTitle" t={t} max={TITLE_MAX}
          label={t("العنوان", "Title")}
          value={title} onChange={setTitle} placeholder={page.title}
        />
      </Section>

      {/* ── Meta description ─────────────────────────────────────────────── */}
      <Section
        icon={AlignLeft}
        title={t("وصف الصفحة (Meta Description)", "Meta description")}
        hint={t("السطران الرماديان تحت العنوان. حتى 155 حرفاً.", "The two grey lines under the title. Up to 155 characters.")}
      >
        <BilingualField
          id="metaDescription" t={t} max={DESCRIPTION_MAX} textarea rows={3}
          label={t("الوصف", "Description")}
          value={description} onChange={setDescription} placeholder={page.description}
        />
      </Section>

      {/* ── Keywords ─────────────────────────────────────────────────────── */}
      <Section
        icon={Tags}
        title={t("الكلمات المفتاحية (Meta Keywords)", "Meta keywords")}
        hint={t(
          "اكتب عبارة واضغط Enter. استخدم العبارات التي يبحث بها الناس فعلاً.",
          "Type a phrase and press Enter. Use the phrases people actually search for."
        )}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Only the language(s) the admin writes in; the other list is
              still submitted below so it is never lost. */}
          {["ar", "en"].filter((l) => !shownLangs.includes(l)).map((l) => (
            <input
              key={`hidden-${l}`}
              type="hidden"
              name={l === "ar" ? "metaKeywordsAr" : "metaKeywordsEn"}
              value={JSON.stringify(keywords[l])}
            />
          ))}
          {shownLangs.map((l) => (
            <div key={l} className="grid gap-1.5">
              <Label className="text-xs">{l === "ar" ? t("بالعربية", "Arabic") : t("بالإنجليزية", "English")}</Label>
              <TagsInput
                name={l === "ar" ? "metaKeywordsAr" : "metaKeywordsEn"}
                value={keywords[l]}
                onChange={(next) => setKeywords({ ...keywords, [l]: next })}
                suggestions={[page.title[l], siteName[l]].filter(Boolean)}
                dir={l === "ar" ? "rtl" : "ltr"}
                t={t}
                placeholder={l === "ar" ? "سيارات للبيع، سيارات الرياض…" : "cars for sale, cars in Riyadh…"}
              />
            </div>
          ))}
        </div>
        <div className="border-t pt-4">
          <p className="mb-3 text-xs text-muted-foreground">
            {t("الكلمة الرئيسية: العبارة الواحدة التي تريد أن تظهر بها هذه الصفحة.", "Focus keyword: the one phrase you want this page to be found by.")}
          </p>
          <BilingualField id="focusKeyword" t={t} label={t("الكلمة الرئيسية", "Focus keyword")} defaultValue={bi(row?.focus_keyword)} />
        </div>
      </Section>

      {/* ── Open Graph ───────────────────────────────────────────────────── */}
      <Section
        icon={Share2}
        title={t("وسائل التواصل (Open Graph)", "Social media (Open Graph)")}
        hint={t(
          "بطاقة المعاينة عند مشاركة الرابط في واتساب أو فيسبوك أو X. فارغة = عنوان ووصف الصفحة أعلاه.",
          "The preview card when the link is shared on WhatsApp, Facebook or X. Blank = the title and description above."
        )}
      >
        <BilingualField
          id="ogTitle" t={t} max={TITLE_MAX + 30}
          label={t("عنوان Open Graph", "Open Graph title")}
          value={ogTitle} onChange={setOgTitle} placeholder={{ ar: title.ar || page.title.ar, en: title.en || page.title.en }}
        />
        <BilingualField
          id="ogDescription" t={t} textarea rows={2} max={200}
          label={t("وصف Open Graph", "Open Graph description")}
          value={ogDescription} onChange={setOgDescription}
          placeholder={{ ar: description.ar || page.description.ar, en: description.en || page.description.en }}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <SiteImageField
            locale={locale} name="ogImageUrl" value={row?.og_image_url ?? ""} onChange={setOgImage}
            folder="seo" shape="wide" cover
            label={t("صورة Open Graph", "Open Graph image")}
            hint={t("١٢٠٠×٦٣٠. فارغة = صورة المشاركة الافتراضية من الإعدادات.", "1200×630. Blank = the default share image from Settings.")}
          />
          <div className="grid content-start gap-1.5">
            <Label className="text-xs">{t("نوع المحتوى (og:type)", "Content type (og:type)")}</Label>
            <Select name="ogType" value={ogType} onValueChange={setOgType} dir={isAr ? "rtl" : "ltr"}>
              <SelectTrigger className="raised h-10 w-full border-0">
                <SelectValue>{t(OG_TYPE[ogType].ar, OG_TYPE[ogType].en)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="raised-card border-0">
                {Object.keys(OG_TYPE).map((k) => (
                  <SelectItem key={k} value={k} className="raised-hover">{t(OG_TYPE[k].ar, OG_TYPE[k].en)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      {/* ── X / Twitter ──────────────────────────────────────────────────── */}
      <Section
        icon={AtSign}
        title={t("بطاقة X (تويتر)", "X (Twitter) card")}
        hint={t("فارغة = قيم Open Graph أعلاه.", "Blank = the Open Graph values above.")}
      >
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label className="text-xs">{t("نوع البطاقة", "Card type")}</Label>
          <Select name="twitterCard" value={twitterCard} onValueChange={setTwitterCard} dir={isAr ? "rtl" : "ltr"}>
            <SelectTrigger className="raised h-10 w-full border-0">
              <SelectValue>{t(CARD[twitterCard].ar, CARD[twitterCard].en)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="raised-card border-0">
              {Object.keys(CARD).map((k) => (
                <SelectItem key={k} value={k} className="raised-hover">{t(CARD[k].ar, CARD[k].en)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <BilingualField id="twitterTitle" t={t} label={t("عنوان X", "X title")} defaultValue={bi(row?.twitter_title)} />
        <BilingualField
          id="twitterDescription" t={t} textarea rows={2}
          label={t("وصف X", "X description")} defaultValue={bi(row?.twitter_description)}
        />
        <SiteImageField
          locale={locale} name="twitterImageUrl" value={row?.twitter_image_url ?? ""}
          folder="seo" shape="wide" cover
          label={t("صورة X", "X image")}
          hint={t("فارغة = صورة Open Graph.", "Blank = the Open Graph image.")}
        />
      </Section>

      {/* ── Indexing and sitemap ─────────────────────────────────────────── */}
      <Section
        icon={Globe2}
        title={t("الفهرسة وخريطة الموقع", "Indexing and sitemap")}
        hint={t(
          "الصفحات المخفية لا تُضاف إلى sitemap.xml. التكرار والأولوية يخبران محركات البحث بأي الصفحات تعاود زيارتها أولاً.",
          "Hidden pages are left out of sitemap.xml. Frequency and priority tell search engines which pages to revisit first."
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchRow
            checked={index} onChange={setIndex}
            label={t("إظهار في نتائج البحث", "Show in search results")}
            hint={t("index / noindex", "index / noindex")}
          />
          <SwitchRow
            checked={follow} onChange={setFollow}
            label={t("تتبّع الروابط في الصفحة", "Follow links on the page")}
            hint={t("follow / nofollow", "follow / nofollow")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("معدّل التحديث", "How often it changes")}</Label>
            <Select name="seoChangefreq" value={changefreq} onValueChange={setChangefreq} dir={isAr ? "rtl" : "ltr"}>
              <SelectTrigger className="raised h-10 w-full border-0">
                <SelectValue>{t(FREQ[changefreq].ar, FREQ[changefreq].en)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="raised-card border-0">
                {CHANGEFREQ.map((k) => (
                  <SelectItem key={k} value={k} className="raised-hover">{t(FREQ[k].ar, FREQ[k].en)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("الأولوية في خريطة الموقع", "Sitemap priority")}</Label>
            <Select name="seoPriority" value={priority} onValueChange={setPriority} dir={isAr ? "rtl" : "ltr"}>
              <SelectTrigger className="raised h-10 w-full border-0">
                <SelectValue>{priority}</SelectValue>
              </SelectTrigger>
              <SelectContent className="raised-card max-h-72 border-0">
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="raised-hover tabular-nums">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      {/* ── Canonical ────────────────────────────────────────────────────── */}
      <Section
        icon={Link2}
        title={t("الرابط الأساسي (Canonical)", "Canonical URL")}
        hint={t(
          "اتركه فارغاً ليشير إلى الصفحة نفسها بكل لغة — الصحيح في كل الحالات تقريباً.",
          "Leave blank to point at the page itself in each language — right in almost every case."
        )}
      >
        <Input
          name="canonicalUrl" type="url" dir="ltr" className="font-mono text-xs"
          defaultValue={row?.canonical_url ?? ""}
          placeholder={`${siteUrl}/${locale}/marketplace${page.path}`}
        />
      </Section>

      {/* ── Structured data ──────────────────────────────────────────────── */}
      <Section
        icon={Braces}
        title={t("البيانات المنظمة (JSON-LD)", "Structured data (JSON-LD)")}
        hint={t(
          "اختياري. فارغ = بيانات تلقائية (Organization وWebSite للرئيسية، WebPage ومسار التنقل لغيرها).",
          "Optional. Blank = automatic data (Organization and WebSite on Home, WebPage with a breadcrumb elsewhere)."
        )}
        aside={
          <Button type="button" size="sm" variant="outline" onClick={insertTemplate}>
            {t("إدراج قالب", "Insert template")}
          </Button>
        }
      >
        <Textarea
          name="structuredData" dir="ltr" rows={10} spellCheck={false}
          value={json} onChange={(e) => setJson(e.target.value)}
          className={`font-mono text-xs ${problem ? "border-red-400 focus-visible:ring-red-300" : ""}`}
          placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage"\n}'}
        />
        {json.trim() ? (
          <p className={`text-xs ${problem ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
            {problem ? t("JSON غير صحيح", "Not valid JSON") : t("JSON صحيح", "Valid JSON")}
          </p>
        ) : null}
      </Section>

      {/* ── Save bar ─────────────────────────────────────────────────────── */}
      <div className="raised-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href={`/${locale}/marketplace/admin/content/seo`}>{t("كل الصفحات", "All pages")}</Link>
          </Button>
          <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5">
            <a href={`/${locale}/marketplace${page.path}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("عرض الصفحة", "View page")}
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {save.result?.ok ? (
            <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("تم الحفظ", "Saved")}
            </span>
          ) : save.result?.error ? (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {errorText(save.result.error, locale, save.result.params)}
            </span>
          ) : null}
          <Button
            type="submit"
            disabled={save.pending || Boolean(problem)}
            className="raised-solid gap-2 bg-brand-primary text-white hover:bg-brand-dark"
          >
            {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("حفظ SEO", "Save SEO")}
          </Button>
        </div>
      </div>
    </form>
    </FieldMode.Provider>
  );
}

/* ── Module scope ─────────────────────────────────────────────────────────── */

function Section({ icon: Icon, title, hint, aside = null, tone = false, children }) {
  return (
    <section className={`raised-card grid gap-4 rounded-xl p-4 sm:p-5 ${tone ? "ring-1 ring-brand-primary/15" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
            <Icon className="h-4 w-4 text-brand-gold" />
            {title}
          </h2>
          {hint ? <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LangToggle({ lang, onChange }) {
  return (
    <div className="raised flex rounded-lg p-1">
      {["ar", "en"].map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={lang === l}
          className={`rounded-md px-3 py-1 text-xs font-bold ${lang === l ? "bg-brand-primary text-white" : "text-muted-foreground"}`}
        >
          {l === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );
}

function SwitchRow({ checked, onChange, label, hint }) {
  return (
    <label className="raised flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm">
      <span>
        {label}
        <span className="block font-mono text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/**
 * A bilingual field that follows the admin's authoring language — the same
 * BilingualField a showroom's settings use: one box, plus a "Both" popup when
 * the language is set to both. `value` + `onChange` let the preview follow
 * what is typed; `max` adds a character counter for the language(s) shown.
 */
function BilingualField({ id, label, max, textarea = false, rows = 3, value, onChange, defaultValue, placeholder = {} }) {
  const { mode, locale } = useContext(FieldMode);
  const start = value ?? defaultValue ?? {};
  const shown = mode === "both" ? ["ar", "en"] : [mode === "en" ? "en" : "ar"];

  const counter = max && value
    ? shown.map((l) => `${mode === "both" ? `${l.toUpperCase()} ` : ""}${value[l].length}/${max}`).join(" · ")
    : null;
  const over = Boolean(max && value && shown.some((l) => value[l].length > max));

  return (
    <div>
      <SharedBilingualField
        id={id}
        label={label}
        ar={start.ar ?? ""}
        en={start.en ?? ""}
        mode={mode}
        locale={locale}
        textarea={textarea}
        rows={rows}
        phAr={placeholder.ar ?? ""}
        phEn={placeholder.en ?? ""}
        onChange={onChange}
      />
      {counter ? (
        <p className={`mt-1 text-[11px] tabular-nums ${over ? "text-red-600" : "text-muted-foreground"}`}>{counter}</p>
      ) : null}
    </div>
  );
}
