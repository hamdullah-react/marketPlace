"use client";

/**
 * Writing an article.
 *
 * ── Every bilingual field obeys ONE setting ─────────────────────────────────
 *
 * Admin → Settings → Language decides how the admin WRITES:
 *
 *   'ar'    one Arabic box per field. Nothing else.
 *   'en'    one English box per field. Nothing else.
 *   'both'  one box plus a popup holding the pair.
 *
 * That is `mode`, and it is threaded through a CONTEXT rather than passed to
 * twenty fields by hand — which is how the first version of this form ended up
 * showing an Arabic box and an English box side by side to an admin who had
 * chosen English. A field that reads the mode from context cannot be the one
 * somebody forgot to pass it to.
 *
 * Whatever the mode, BOTH languages are always submitted (BilingualField keeps
 * hidden inputs for the pair), so switching the authoring language later never
 * discards a translation that was already written.
 *
 * ── The two editors are MOUNTED at all times ────────────────────────────────
 *
 * Hidden, never unmounted. A hidden input only submits if it is in the
 * document, so tearing the other language out of the tree when a tab is
 * switched would post an empty body for it — and "I wrote the Arabic, saved,
 * and the English vanished" is the bug that costs somebody an afternoon.
 *
 * ── The slug is a field, with a default, not a derived value ────────────────
 *
 * Derived from the title when left blank, and left alone once an article is
 * live: changing the slug of a published article changes its URL, breaks every
 * link to it and loses whatever search ranking it had. So it is shown,
 * editable, and warned about rather than silently regenerated on every save.
 */

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlignLeft, ArrowLeft, ArrowRight, Braces, Check, ExternalLink, Eye, EyeOff,
  Globe2, Heading, Image as ImageIcon, Link2, Loader2, Search, Share2, Tags,
  Trash2, TriangleAlert, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { keywordList } from "@/marketplace/lib/seo";
import { CHANGEFREQ, DESCRIPTION_MAX, TITLE_MAX } from "@/marketplace/lib/sitePages";
import RichText from "@/app/[locale]/marketplace/(browse)/vendors/[slug]/_components/RichText";
import SharedBilingualField from "../../(seller)/_components/BilingualField";
import SiteImageField, { uploadSiteImage } from "./SiteImageField";
import TagsInput from "@/app/[locale]/marketplace/(seller)/_components/TagsInput";
import { saveBlogPost, deleteBlogPost } from "../admin/_actions/blog";

const INITIAL = { ok: false, error: null };

/* Pictures inside an article go to the site's own bucket, under blog/ — the
   platform has no showroom library to pick from. */
const uploadPicture = (file) => uploadSiteImage(file, "blog");

const bi = (v) => ({
  ar: typeof v?.ar === "string" ? v.ar : "",
  en: typeof v?.en === "string" ? v.en : "",
});

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
  article: { ar: "مقال (article)", en: "Article" },
  website: { ar: "موقع (website)", en: "Website" },
  profile: { ar: "ملف (profile)", en: "Profile" },
};

const CARD_SIZE = {
  summary_large_image: { ar: "صورة كبيرة", en: "Large image" },
  summary: { ar: "صورة صغيرة", en: "Small image" },
};

/** The admin's authoring language, read by every bilingual field below. */
const FieldMode = createContext({ mode: "both", locale: "ar" });

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

export default function BlogPostForm({ locale = "ar", post = null, mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const Back = isAr ? ArrowRight : ArrowLeft;

  const save = useActionResult(saveBlogPost, INITIAL, {
    onSuccess: (result) => {
      /* A new article has no id until it is saved, and the URL it was written
         at was /new. Moving to its real path means the next save is an update
         rather than a second article. */
      if (result?.slug) router.replace(`/${locale}/marketplace/admin/content/blog/${result.slug}`);
      router.refresh();
    },
  });

  const remove = useActionResult(deleteBlogPost, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => router.replace(`/${locale}/marketplace/admin/content/blog`),
  });

  const langs = mode === "both" ? ["ar", "en"] : [mode === "en" ? "en" : "ar"];
  const [tab, setTab] = useState(langs.includes(locale) ? locale : langs[0]);
  const [published, setPublished] = useState(post?.published === true);
  const [confirming, setConfirming] = useState(false);

  /* Held in state only where something else reads it: the search preview, a
     character counter, or a hidden input a Switch has to stand in for.
     Everything else is an uncontrolled input with a defaultValue, so typing a
     description does not re-render the article editor. */
  const [title, setTitle] = useState(bi(post?.title));
  const [metaTitle, setMetaTitle] = useState(bi(post?.meta_title));
  const [metaDescription, setMetaDescription] = useState(bi(post?.meta_description));
  const [keywords, setKeywords] = useState({
    ar: keywordList(post?.meta_keywords?.ar),
    en: keywordList(post?.meta_keywords?.en),
  });
  const [ogType, setOgType] = useState(post?.og_type ?? "article");
  const [twitterCard, setTwitterCard] = useState(post?.twitter_card ?? "summary_large_image");
  const [index, setIndex] = useState(post ? post.seo_index !== false : true);
  const [follow, setFollow] = useState(post ? post.seo_follow !== false : true);
  const [changefreq, setChangefreq] = useState(post?.seo_changefreq ?? "monthly");
  const [priority, setPriority] = useState(Number(post?.seo_priority ?? 0.6).toFixed(1));
  const [json, setJson] = useState(
    post?.structured_data ? JSON.stringify(post.structured_data, null, 2) : ""
  );

  const error = [save, remove]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const live = Boolean(post?.published);
  const problem = jsonProblem(json);

  /* The preview's language: the one being authored, or the dashboard's own when
     both are in play. */
  const pv = mode === "en" ? "en" : mode === "ar" ? "ar" : isAr ? "ar" : "en";
  const previewTitle = metaTitle[pv] || title[pv] || t("عنوان المقال", "Article title");
  const previewDescription =
    metaDescription[pv] || t("ستُستخدم مقدمة المقال هنا.", "The article’s excerpt is used here.");

  return (
    <FieldMode.Provider value={{ mode, locale }}>
      <form action={save.formAction} className="grid gap-4 pb-24">
        <input type="hidden" name="id" value={post?.id ?? ""} />
        <input type="hidden" name="published" value={published ? "true" : "false"} />

        {/* ── The bar ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/marketplace/admin/content/blog`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-primary"
          >
            <Back className="h-3.5 w-3.5" />
            {t("كل المقالات", "All articles")}
          </Link>

          {post?.slug && live ? (
            <Link
              href={`/${locale}/marketplace/blog/${post.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("عرض المقال", "View article")}
            </Link>
          ) : null}

          <div className="ms-auto flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={published ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setPublished((p) => !p)}
            >
              {published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {published ? t("منشور", "Published") : t("مسودة", "Draft")}
            </Button>

            <Button type="submit" size="sm" disabled={save.pending} className="gap-1.5">
              {save.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("حفظ", "Save")}
            </Button>
          </div>
        </div>

        {/* The switch above only takes effect on save — said out loud, because a
            toggle that looks like it published something and did not is worse
            than no toggle. */}
        {published !== live ? (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {published
              ? t("سيُنشر عند الحفظ.", "It goes live when you save.")
              : t("سيصبح مسودة عند الحفظ.", "It becomes a draft when you save.")}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {save.result?.ok ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
            <Check className="h-4 w-4" />
            {t("تم الحفظ", "Saved")}
          </p>
        ) : null}

        {/* ── Title, link, excerpt ───────────────────────────────────────── */}
        <Section icon={Heading} title={t("العنوان والمقدمة", "Title and excerpt")}>
          <Field
            id="title"
            label={t("العنوان", "Title")}
            value={title}
            onChange={setTitle}
            required
          />

          <div>
            <Label htmlFor="slug">{t("الرابط", "Link")}</Label>
            <Input
              id="slug"
              name="slug"
              dir="ltr"
              defaultValue={post?.slug ?? ""}
              placeholder={t("يُشتق من العنوان", "derived from the title")}
              className="mt-1"
            />
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              {live ? <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> : null}
              {live
                ? t(
                    "هذا المقال منشور. تغيير الرابط يكسر كل رابط قديم يشير إليه.",
                    "This article is live. Changing the link breaks every existing link to it."
                  )
                : t("أحرف إنجليزية وأرقام وشرطات فقط.", "Lowercase letters, numbers and hyphens.")}
            </p>
          </div>

          <Field
            id="excerpt"
            label={t("المقدمة", "Excerpt")}
            defaultValue={bi(post?.excerpt)}
            textarea
            rows={3}
            hint={t(
              "سطر أو سطران يظهران في قائمة المقالات وفي نتائج البحث. اتركه فارغاً وسيُؤخذ من أول المقال.",
              "A line or two, shown in the list and in search results. Leave it empty and the start of the article is used."
            )}
          />
        </Section>

        {/* ── The article itself ─────────────────────────────────────────── */}
        <Section
          icon={AlignLeft}
          title={t("المقال", "The article")}
          hint={t(
            "العناوين والقوائم والصور والروابط — كلّها من شريط الأدوات، الذي يبقى ثابتاً أعلى المحرر أثناء الكتابة.",
            "Headings, lists, pictures and links — all from the toolbar, which stays pinned at the top of the editor as you write."
          )}
          aside={
            langs.length > 1 ? (
              <div className="raised flex rounded-lg p-1">
                {langs.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setTab(code)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      tab === code
                        ? "bg-brand-primary text-white"
                        : "text-muted-foreground hover:text-brand-primary"
                    }`}
                  >
                    {code === "ar" ? t("العربية", "Arabic") : t("الإنجليزية", "English")}
                  </button>
                ))}
              </div>
            ) : null
          }
        >
          {/* Hidden, never unmounted — see the note at the top. */}
          {langs.includes("ar") ? (
            <div hidden={tab !== "ar"}>
              <RichText
                locale={locale}
                name="bodyAr"
                dir="rtl"
                value={post?.body?.ar ?? null}
                uploadImage={uploadPicture}
              />
            </div>
          ) : null}

          {langs.includes("en") ? (
            <div hidden={tab !== "en"}>
              <RichText
                locale={locale}
                name="bodyEn"
                dir="ltr"
                value={post?.body?.en ?? null}
                uploadImage={uploadPicture}
              />
            </div>
          ) : null}

          {langs.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                "كل لغة لها نصّها الخاص، وكلتاهما تُحفظان معاً. مقال بلغة واحدة أمر عادي — تظهر تلك اللغة للجميع.",
                "Each language keeps its own text and both are saved together. An article in one language only is perfectly normal — that version is shown to everyone."
              )}
            </p>
          ) : null}
        </Section>

        {/* ── Pictures, author, tags ─────────────────────────────────────── */}
        <Section
          icon={ImageIcon}
          title={t("الصور والوسوم", "Pictures and tags")}
          hint={t(
            "لكلٍّ منهما مكانه: الغلاف في بطاقة المقال داخل قائمة المدونة وفي «اقرأ أيضاً» وفي بطاقة المشاركة، والبانر بعرض الصفحة أعلى المقال نفسه. إن ملأت واحدة فقط استُخدمت في المكانين؛ وإن ملأت الاثنين فلن يظهر الغلاف داخل صفحة المقال.",
            "Each has its own place: the cover is the article’s card — in the blog list, in “Read next” and on the share card — and the banner runs the full width of the page across the top of the article itself. Fill in one and it is used in both places; fill in both and the cover does not appear inside the article page."
          )}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <SiteImageField
              locale={locale}
              name="coverUrl"
              value={post?.cover_url ?? ""}
              folder="blog"
              shape="wide"
              cover
              label={t("صورة الغلاف", "Cover image")}
              hint={t(
                "بطاقة المقال في قائمة المدونة، وبطاقة المشاركة. ٨٠٠ بكسل عرضاً تكفي.",
                "The article’s card in the blog list, and its share card. 800px wide is enough."
              )}
            />

            <SiteImageField
              locale={locale}
              name="bannerUrl"
              value={post?.banner_url ?? ""}
              folder="blog"
              shape="wide"
              cover
              label={t("بانر المقال", "Article banner")}
              hint={t(
                "يمتدّ بعرض الصفحة أعلى المقال، والعنوان مكتوب فوقه. الأفضل ١٦٠٠ بكسل عرضاً، وصورة لا تزدحم في أسفلها.",
                "Full width across the top of the article, with the title written over it. 1600px wide works best, and something that is not busy along the bottom."
              )}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="author" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {t("الكاتب", "Author")}
              </Label>
              <Input id="author" name="author" defaultValue={post?.author ?? ""} className="mt-1" />
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <Tags className="h-3.5 w-3.5 text-muted-foreground" />
                {t("الوسوم", "Tags")}
              </Label>
              <div className="mt-1">
                <TagsInput name="tags" t={t} dir={isAr ? "rtl" : "ltr"} value={post?.tags ?? []} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "تُستخدم للتصفية و«مقالات ذات صلة».",
                  "Used for filtering and for “related articles”."
                )}
              </p>
            </div>
          </div>
        </Section>

        {/* ── How it looks in a search result ────────────────────────────── */}
        <Section
          icon={Search}
          title={t("نتيجة البحث", "The search result")}
          hint={t(
            "كل ما في هذا القسم اختياري — يُولَّد من المقال نفسه إذا تُرك فارغاً.",
            "Everything in this section is optional — it is generated from the article when left blank."
          )}
        >
          {/* Drawn from what is being typed, so a length limit means something
              before anybody publishes and looks. */}
          <div className="rounded-lg border bg-white p-3 dark:border-white/10 dark:bg-black/20">
            <p className="truncate text-xs text-green-700 dark:text-green-500" dir="ltr">
              {`/${pv}/marketplace/blog/${post?.slug || "…"}`}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[17px] text-blue-700 dark:text-blue-400">
              {previewTitle}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
              {previewDescription}
            </p>
          </div>

          <Field
            id="metaTitle"
            label={t("عنوان البحث", "Search title")}
            value={metaTitle}
            onChange={setMetaTitle}
            max={TITLE_MAX}
            placeholder={{ ar: title.ar, en: title.en }}
            hint={t(
              "اتركه فارغاً ليُستخدم عنوان المقال.",
              "Leave it empty and the article’s own title is used."
            )}
          />

          <Field
            id="metaDescription"
            label={t("وصف البحث", "Search description")}
            value={metaDescription}
            onChange={setMetaDescription}
            max={DESCRIPTION_MAX}
            textarea
            rows={2}
            hint={t("اتركه فارغاً لتُستخدم المقدمة.", "Leave it empty and the excerpt is used.")}
          />

          <KeywordsField keywords={keywords} onChange={setKeywords} t={t} isAr={isAr} />

          <Field
            id="focusKeyword"
            label={t("الكلمة الرئيسية", "Focus keyword")}
            defaultValue={bi(post?.focus_keyword)}
            hint={t(
              "العبارة الواحدة التي كُتب المقال ليظهر بها. للمراجعة فقط — لا تُنشر في الصفحة.",
              "The one phrase this article was written to rank for. For your own review — it is not published on the page."
            )}
          />
        </Section>

        {/* ── How it looks when shared ───────────────────────────────────── */}
        <Section
          icon={Share2}
          title={t("بطاقة المشاركة", "The share card")}
          hint={t(
            "ما يظهر عند إرسال رابط المقال في واتساب أو X. الفراغ يعني استخدام عنوان ووصف البحث.",
            "What shows when the article’s link is sent on WhatsApp or X. Blank means the search title and description are used."
          )}
        >
          <Field
            id="ogTitle"
            label={t("عنوان البطاقة", "Card title")}
            defaultValue={bi(post?.og_title)}
            max={TITLE_MAX}
          />
          <Field
            id="ogDescription"
            label={t("وصف البطاقة", "Card description")}
            defaultValue={bi(post?.og_description)}
            max={DESCRIPTION_MAX}
            textarea
            rows={2}
          />

          <SiteImageField
            locale={locale}
            name="ogImageUrl"
            value={post?.og_image_url ?? ""}
            folder="blog"
            shape="wide"
            cover
            label={t("صورة البطاقة", "Card image")}
            hint={t(
              "يُستخدم البانر ثم الغلاف إذا تُركت فارغة. ١٢٠٠×٦٣٠ هو المقاس.",
              "The banner, then the cover, is used when this is left empty. 1200×630 is the size."
            )}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Choice
              label={t("نوع المحتوى (og:type)", "Content type (og:type)")}
              name="ogType"
              value={ogType}
              onChange={setOgType}
              options={OG_TYPE}
              isAr={isAr}
              hint={t(
                "«مقال» هو ما يجعل البطاقة تُظهر تاريخ النشر واسم الكاتب.",
                "“Article” is what makes the card show a publication date and a byline."
              )}
            />

            <Choice
              label={t("حجم بطاقة X", "X card size")}
              name="twitterCard"
              value={twitterCard}
              onChange={setTwitterCard}
              options={CARD_SIZE}
              isAr={isAr}
            />
          </div>

          <details className="rounded-lg border p-3 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium">
              {t("نصّ مختلف لـ X", "Different wording for X")}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "تقرأ X وسومها الخاصة أولاً. اتركها فارغة وستستخدم بطاقة المشاركة أعلاه.",
                "X reads its own tags first. Leave these empty and it uses the share card above."
              )}
            </p>
            <div className="mt-3 grid gap-4">
              <Field
                id="twitterTitle"
                label={t("العنوان", "Title")}
                defaultValue={bi(post?.twitter_title)}
                max={TITLE_MAX}
              />
              <Field
                id="twitterDescription"
                label={t("الوصف", "Description")}
                defaultValue={bi(post?.twitter_description)}
                max={DESCRIPTION_MAX}
                textarea
                rows={2}
              />
              <SiteImageField
                locale={locale}
                name="twitterImageUrl"
                value={post?.twitter_image_url ?? ""}
                folder="blog"
                shape="wide"
                cover
                label={t("الصورة", "Image")}
              />
            </div>
          </details>
        </Section>

        {/* ── Indexing, the sitemap and JSON-LD ──────────────────────────── */}
        <Section
          icon={Globe2}
          title={t("الفهرسة وخريطة الموقع", "Indexing and the sitemap")}
          hint={t(
            "كيف تتعامل محركات البحث مع هذا المقال. الإعدادات الافتراضية صحيحة لمقال عادي.",
            "How search engines should treat this article. The defaults are right for an ordinary article."
          )}
        >
          <input type="hidden" name="seoIndex" value={index ? "true" : "false"} />
          <input type="hidden" name="seoFollow" value={follow ? "true" : "false"} />

          <Toggle
            checked={index}
            onChange={setIndex}
            label={t("إظهاره في نتائج البحث", "Show it in search results")}
            hint={t(
              "إيقافه يمنع فهرسة المقال ويستبعده من خريطة الموقع، ويظلّ رابطه يعمل لمن تُرسله إليه.",
              "Off keeps the article out of the index and out of the sitemap. Its link still works for anyone you send it to."
            )}
          />

          <Toggle
            checked={follow}
            onChange={setFollow}
            label={t("تتبّع الروابط داخله", "Follow the links inside it")}
            hint={t(
              "«لا تفهرسه، لكن اتبع روابطه» تركيبة صحيحة وشائعة: المقال لا يظهر، والسيارات التي يشير إليها تظهر.",
              "“Do not index it, but do follow its links” is a real and common combination: the article stays out, the cars it points to do not."
            )}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Choice
              label={t("معدّل التحديث", "Change frequency")}
              name="seoChangefreq"
              value={changefreq}
              onChange={setChangefreq}
              options={Object.fromEntries(CHANGEFREQ.map((f) => [f, FREQ[f]]))}
              isAr={isAr}
            />

            <div>
              <Label className="text-sm">{t("الأولوية", "Priority")}</Label>
              <input type="hidden" name="seoPriority" value={priority} />
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "أهمية المقال داخل موقعك، لا مقابل غيره. ٠٫٦ مناسبة لمقال.",
                  "How this ranks among your own pages, not against anyone else’s. 0.6 suits an article."
                )}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="canonicalUrl" className="flex items-center gap-1.5 text-sm">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              {t("الرابط الأصلي (canonical)", "Canonical URL")}
            </Label>
            <Input
              id="canonicalUrl"
              name="canonicalUrl"
              dir="ltr"
              defaultValue={post?.canonical_url ?? ""}
              placeholder="https://…"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "اتركه فارغاً ليشير المقال إلى نفسه. يُستخدم إن كان المقال منشوراً في مكان آخر وتريد اعتماد ذلك الأصل.",
                "Leave it empty and the article points at itself. Use it when the article was first published elsewhere and that original should count."
              )}
            </p>
          </div>

          <div>
            <Label htmlFor="structuredData" className="flex items-center gap-1.5 text-sm">
              <Braces className="h-3.5 w-3.5 text-muted-foreground" />
              {t("بيانات منظمة (JSON-LD)", "Structured data (JSON-LD)")}
            </Label>
            <Textarea
              id="structuredData"
              name="structuredData"
              dir="ltr"
              rows={6}
              spellCheck={false}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='{"@context":"https://schema.org","@type":"FAQPage"}'
              className="mt-1 font-mono text-xs"
            />
            <p className={`mt-1 text-xs ${problem ? "text-red-600" : "text-muted-foreground"}`}>
              {problem === "syntax"
                ? t("هذا ليس JSON صحيحاً.", "That is not valid JSON.")
                : problem === "shape"
                  ? t("يجب أن يكون كائناً.", "It has to be an object.")
                  : t(
                      "اتركه فارغاً وسيُولَّد BlogPosting كامل تلقائياً. اكتب شيئاً هنا ليحلّ محلّه — FAQPage أو HowTo مثلاً.",
                      "Leave it empty and a complete BlogPosting is generated. Write something here to replace it — an FAQPage or a HowTo, for instance."
                    )}
            </p>
          </div>
        </Section>

        {/* ── Removing it ────────────────────────────────────────────────── */}
        {post?.id ? (
          <div className="rounded-2xl border border-red-200 p-4 dark:border-red-900/50">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-red-700 dark:text-red-300">
                  {t("حذف المقال نهائياً؟", "Delete this article for good?")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={remove.pending}
                  className="gap-1.5"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", post.id);
                    remove.dismiss();
                    remove.formAction(fd);
                  }}
                >
                  {remove.pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {t("نعم، احذفه", "Yes, delete it")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  {t("تراجع", "Keep it")}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5 text-red-600 hover:text-red-700"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("حذف المقال", "Delete article")}
              </Button>
            )}
          </div>
        ) : null}
      </form>
    </FieldMode.Provider>
  );
}

/**
 * One bilingual field, in whichever languages the setting asks for.
 *
 * `value`/`onChange` make it controlled, and are used only where something else
 * reads the text — the search preview, a character counter. Everything else
 * passes `defaultValue` and stays uncontrolled, so typing a description does
 * not re-render the article editor above it.
 */
function Field({
  id, label, max, textarea = false, rows = 3, value, onChange, defaultValue,
  placeholder = {}, hint, required = false,
}) {
  const { mode, locale } = useContext(FieldMode);
  const start = value ?? defaultValue ?? {};
  const shown = mode === "both" ? ["ar", "en"] : [mode === "en" ? "en" : "ar"];

  const counter =
    max && value
      ? shown
          .map((l) => `${mode === "both" ? `${l.toUpperCase()} ` : ""}${value[l].length}/${max}`)
          .join(" · ")
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
        required={required}
        onChange={onChange}
      />
      {counter ? (
        <p
          className={`mt-1 text-[11px] tabular-nums ${
            over ? "text-red-600" : "text-muted-foreground"
          }`}
        >
          {counter}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Keywords, per language.
 *
 * Chips rather than a comma-separated box, for the reason the schema gives about
 * free text everywhere else: one phrase per chip is the only version where "did
 * I already add that" has an answer you can see.
 *
 * A hidden input carries the JSON for whichever language is NOT on screen, so an
 * admin working in English never silently wipes the Arabic keywords — the same
 * guarantee BilingualField gives every other field here.
 */
function KeywordsField({ keywords, onChange, t, isAr }) {
  const { mode, locale } = useContext(FieldMode);
  const shown = mode === "both" ? ["ar", "en"] : [mode === "en" ? "en" : "ar"];
  const hidden = ["ar", "en"].filter((l) => !shown.includes(l));

  const label = (l) =>
    l === "ar"
      ? locale === "ar"
        ? "العربية"
        : "Arabic"
      : locale === "ar"
        ? "الإنجليزية"
        : "English";

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{t("الكلمات المفتاحية", "Keywords")}</span>

      {hidden.map((l) => (
        <input
          key={l}
          type="hidden"
          name={l === "ar" ? "metaKeywordsAr" : "metaKeywordsEn"}
          value={JSON.stringify(keywords[l])}
        />
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((l) => (
          <div key={l}>
            {mode === "both" ? (
              <span className="mb-1 block text-xs text-muted-foreground">{label(l)}</span>
            ) : null}
            <TagsInput
              name={l === "ar" ? "metaKeywordsAr" : "metaKeywordsEn"}
              value={keywords[l]}
              onChange={(next) => onChange({ ...keywords, [l]: next })}
              dir={l === "ar" ? "rtl" : "ltr"}
              t={(ar, en) => (isAr ? ar : en)}
            />
          </div>
        ))}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "العبارات التي قد يكتبها القارئ ليجد هذا المقال. لا تعتمد عليها جوجل كثيراً، لكنها مفيدة لمراجعة النصّ.",
          "The phrases a reader might type to find this article. Google leans on them little, but they are useful for checking the copy against."
        )}
      </p>
    </div>
  );
}

function Section({ icon: Icon, title, hint, aside = null, children }) {
  return (
    <section className="raised-card grid gap-4 rounded-xl p-4 sm:p-5">
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

function Choice({ label, name, value, onChange, options, isAr, hint }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {isAr ? text.ar : text.en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}
