"use client";

/**
 * The banner across the top of /blog.
 *
 * ── Collapsed by default, and that is the point ─────────────────────────────
 *
 * It sits above the article list on a page whose job is the articles. Somebody
 * arriving to write a post should see the list, not a form they are not using;
 * somebody arriving to change the banner opens one summary. A banner is edited
 * about twice a year.
 *
 * ── It obeys the same language setting as everything else ───────────────────
 *
 * `mode` comes from Admin → Settings → Language and every text field here is a
 * BilingualField reading it — one Arabic box, one English box, or one box and a
 * popup. An admin working in English is never shown an Arabic box.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import BilingualField from "../../(seller)/_components/BilingualField";
import SiteImageField from "./SiteImageField";
import { saveBlogBanner } from "../admin/_actions/blog";

const INITIAL = { ok: false, error: null };

const bi = (v) => ({
  ar: typeof v?.ar === "string" ? v.ar : "",
  en: typeof v?.en === "string" ? v.en : "",
});

export default function BlogBannerForm({ locale = "ar", row = null, mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const save = useActionResult(saveBlogBanner, INITIAL, { onSuccess: () => router.refresh() });

  const [active, setActive] = useState(row ? row.active !== false : true);
  const [open, setOpen] = useState(false);

  const error = save.result?.error
    ? errorText(save.result.error, locale, save.result.params)
    : null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="raised-card rounded-xl p-4 sm:p-5"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <ImageIcon className="h-4 w-4 text-brand-gold" />
        <span className="font-semibold text-brand-primary">
          {t("بانر المدونة", "Blog banner")}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            active
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          {active ? t("ظاهر", "Showing") : t("مخفي", "Hidden")}
        </span>
        <span className="ms-auto text-xs text-muted-foreground">
          {t("يظهر أعلى صفحة المدونة", "Sits at the top of the blog page")}
        </span>
      </summary>

      {/* Mounted only once opened: the image field and the popups are a fair
          amount of work to build for a section nobody has asked to see. */}
      {open ? (
        <form action={save.formAction} className="mt-4 grid gap-4 border-t pt-4 dark:border-white/10">
          <input type="hidden" name="active" value={active ? "true" : "false"} />

          <label className="flex items-start gap-3">
            <Switch checked={active} onCheckedChange={setActive} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {t("إظهار البانر", "Show the banner")}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t(
                  "إيقافه يُرجع صفحة المدونة إلى عنوانها الافتراضي بدون صورة.",
                  "Off returns the blog page to its own built-in heading, with no picture."
                )}
              </span>
            </span>
          </label>

          <BilingualField
            id="heading"
            label={t("العنوان", "Heading")}
            ar={bi(row?.heading).ar}
            en={bi(row?.heading).en}
            mode={mode}
            locale={locale}
            phAr="نصائح وأدلة لشراء السيارات"
            phEn="Guides and advice on buying cars"
          />

          <BilingualField
            id="subheading"
            label={t("السطر التحته", "Subheading")}
            ar={bi(row?.subheading).ar}
            en={bi(row?.subheading).en}
            mode={mode}
            locale={locale}
            textarea
            rows={2}
          />

          <SiteImageField
            locale={locale}
            name="imageUrl"
            value={row?.image_url ?? ""}
            folder="blog"
            shape="wide"
            cover
            label={t("الصورة", "Picture")}
            hint={t(
              "تمتدّ بعرض الصفحة خلف العنوان. الأفضل ١٦٠٠ بكسل عرضاً وصورة لا تزدحم في وسطها.",
              "Runs the width of the page behind the heading. 1600px wide works best, and something that is not busy in the middle."
            )}
          />

          <BilingualField
            id="alt"
            label={t("وصف الصورة", "Picture description")}
            ar={bi(row?.alt).ar}
            en={bi(row?.alt).en}
            mode={mode}
            locale={locale}
            phAr="سيارات معروضة في معرض"
            phEn="Cars on a showroom forecourt"
          />
          <p className="-mt-2 text-xs text-muted-foreground">
            {t(
              "يُقرأ لمن يستخدم قارئ شاشة. اتركه فارغاً إذا كانت الصورة زخرفية فقط.",
              "Read out by a screen reader. Leave it empty when the picture is purely decorative."
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <BilingualField
              id="ctaLabel"
              label={t("نصّ الزر", "Button text")}
              ar={bi(row?.cta_label).ar}
              en={bi(row?.cta_label).en}
              mode={mode}
              locale={locale}
              phAr="تصفّح السيارات"
              phEn="Browse cars"
            />

            <div>
              <Label htmlFor="ctaHref">{t("رابط الزر", "Button link")}</Label>
              <Input
                id="ctaHref"
                name="ctaHref"
                dir="ltr"
                defaultValue={row?.cta_href ?? ""}
                placeholder="/cars"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "مسار داخل الموقع مثل /cars، أو رابط كامل. الزر لا يظهر إلا إذا كان له نصّ ورابط معاً.",
                  "A path on this site such as /cars, or a full URL. The button only appears when it has both a text and a link."
                )}
              </p>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={save.pending} className="gap-1.5">
              {save.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("حفظ البانر", "Save banner")}
            </Button>

            {save.result?.ok ? (
              <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                {t("تم الحفظ", "Saved")}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </details>
  );
}
