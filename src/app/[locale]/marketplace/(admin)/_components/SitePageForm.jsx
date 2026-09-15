"use client";

/**
 * A content page's editor (About us): the title, the body as rich text, and
 * whether it is published.
 *
 * Languages follow Settings → Language, the same as a showroom: in Arabic or
 * English mode there is one title box and one editor; in "both" the title has
 * the two-language popup and the editor has an Arabic / English switch. Both
 * editors stay mounted either way, so a translation written earlier is always
 * submitted and never lost.
 *
 * The body is the same TipTap editor showrooms use for their About page, so it
 * stores a JSON document, never HTML — and pictures are uploaded to the site's
 * own storage rather than a showroom's library.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Save, CheckCircle2, AlertCircle, Heading, FileText, ExternalLink, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import RichText from "@/app/[locale]/marketplace/(browse)/vendors/[slug]/_components/RichText";
import BilingualField from "../../(seller)/_components/BilingualField";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { saveSitePage } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";
import { uploadSiteImage } from "./SiteImageField";

const INITIAL = { ok: false, error: null };
const uploadPicture = (file) => uploadSiteImage(file, "pages");

export default function SitePageForm({ locale = "ar", slug, row = null, viewHref, seoHref, mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const save = useActionResult(saveSitePage, INITIAL, { onSuccess: () => router.refresh() });

  const langs = mode === "both" ? ["ar", "en"] : [mode === "en" ? "en" : "ar"];
  const [published, setPublished] = useState(row?.published === true);
  const [tab, setTab] = useState(langs.includes(locale) ? locale : langs[0]);

  return (
    <form action={save.formAction} className="grid gap-4 pb-20">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="published" value={published ? "true" : "false"} />

      <section className="raised-card grid gap-4 rounded-xl p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
          <Heading className="h-4 w-4 text-brand-gold" />
          {t("عنوان الصفحة", "Page title")}
        </h2>
        <BilingualField
          id="title" label={t("العنوان", "Title")}
          mode={mode} locale={locale} maxLength={120}
          ar={row?.title?.ar ?? ""} en={row?.title?.en ?? ""}
          phAr="من نحن" phEn="About us"
        />
      </section>

      <section className="raised-card grid gap-4 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
              <FileText className="h-4 w-4 text-brand-gold" />
              {t("المحتوى", "Content")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {langs.length > 1
                ? t(
                    "عناوين وقوائم وروابط وصور. اكتب كل لغة في تبويبها.",
                    "Headings, lists, links and pictures. Write each language in its own tab."
                  )
                : t(
                    "عناوين وقوائم وروابط وصور. لغة الكتابة تُغيَّر من الإعدادات ← اللغة.",
                    "Headings, lists, links and pictures. The authoring language is changed in Settings → Language."
                  )}
            </p>
          </div>

          {langs.length > 1 ? (
            <div role="tablist" className="raised flex rounded-lg p-1">
              {langs.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={tab === l}
                  onClick={() => setTab(l)}
                  className={`rounded-md px-3 py-1 text-xs font-bold ${tab === l ? "bg-brand-primary text-white" : "text-muted-foreground"}`}
                >
                  {l === "ar" ? "العربية" : "English"}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Both editors stay mounted (hidden, not removed) so both languages are submitted. */}
        <div hidden={tab !== "ar"}>
          <RichText locale={locale} name="bodyAr" dir="rtl" value={row?.body?.ar ?? null} uploadImage={uploadPicture} />
        </div>
        <div hidden={tab !== "en"}>
          <RichText locale={locale} name="bodyEn" dir="ltr" value={row?.body?.en ?? null} uploadImage={uploadPicture} />
        </div>
      </section>

      <div className="raised-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={published} onCheckedChange={setPublished} />
            {published ? t("منشورة", "Published") : t("مسودة", "Draft")}
          </label>
          <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5">
            <a href={viewHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("عرض الصفحة", "View page")}
            </a>
          </Button>
          <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5">
            <Link href={seoHref}>
              <Search className="h-3.5 w-3.5" />
              {t("إعدادات SEO", "SEO settings")}
            </Link>
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
          <Button type="submit" disabled={save.pending} className="raised-solid gap-2 bg-brand-primary text-white hover:bg-brand-dark">
            {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("حفظ الصفحة", "Save page")}
          </Button>
        </div>
      </div>
    </form>
  );
}
