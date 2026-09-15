"use client";

/**
 * Admin → Website content → Home carousel.
 *
 * A table of slides with a 3-dot menu per row (edit, move, show/hide, delete),
 * an "Add slide" dialog with a live preview of how the slide looks on the home
 * page, and the autoplay speed.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal, Pencil, ArrowUp, ArrowDown, Eye, EyeOff, Trash2, Plus, Loader2,
  AlertTriangle, Images, Timer, CheckCircle2, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import BilingualField from "../../(seller)/_components/BilingualField";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import {
  saveHeroSlide, deleteHeroSlide, moveHeroSlide, setHeroSlideActive, saveHeroInterval,
} from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";
import SiteImageField from "./SiteImageField";

const INITIAL = { ok: false, error: null };

export default function HeroSlidesManager({ locale = "ar", slides = [], intervalSeconds = 6, mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  // null = closed, "new" = adding, a slide = editing it.
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const visible = slides.filter((s) => s.active).length;
  const other = isAr ? "en" : "ar";

  return (
    <div className="grid gap-4">
      <div className="raised-card flex flex-wrap items-end justify-between gap-4 rounded-xl p-4">
        <div>
          <p className="text-sm font-semibold text-brand-primary">
            {t(`${slides.length} شريحة`, `${slides.length} slides`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(`${visible} ظاهرة في الصفحة الرئيسية`, `${visible} visible on the home page`)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <IntervalForm locale={locale} seconds={intervalSeconds} />
          <Button
            type="button"
            onClick={() => setEditing("new")}
            className="raised-solid h-9 gap-2 bg-brand-primary text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            {t("إضافة شريحة", "Add slide")}
          </Button>
        </div>
      </div>

      {slides.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
          <Images className="mx-auto h-8 w-8 text-brand-primary/60" />
          <p className="mt-3 font-semibold text-brand-primary">{t("لا توجد شرائح بعد", "No slides yet")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "الصفحة الرئيسية تعرض صوراً مؤقتة حتى تضيف أول شريحة.",
              "The home page shows placeholder photos until you add the first slide."
            )}
          </p>
        </div>
      ) : (
        <div className="raised-card overflow-x-auto rounded-xl">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-start">#</TableHead>
                <TableHead className="w-44 text-start">{t("الصورة", "Image")}</TableHead>
                <TableHead className="text-start">{t("العنوان والوصف", "Title and description")}</TableHead>
                <TableHead className="text-start">{t("اللغات", "Languages")}</TableHead>
                <TableHead className="text-start">{t("الحالة", "Status")}</TableHead>
                <TableHead className="w-16 text-end">{t("إجراءات", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slides.map((slide, i) => (
                <TableRow key={slide.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.image} alt="" className="h-16 w-36 rounded-md border object-cover" />
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    <p className="font-medium text-brand-primary">
                      {slide.title[locale] || slide.title[other] || "—"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {slide.description[locale] || slide.description[other]}
                    </p>
                  </TableCell>
                  <TableCell>
                    <LanguageBadges value={slide.title} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        slide.active
                          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {slide.active ? t("ظاهرة", "Visible") : t("مخفية", "Hidden")}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <SlideRowActions
                      locale={locale}
                      slide={slide}
                      first={i === 0}
                      last={i === slides.length - 1}
                      onEdit={() => setEditing(slide)}
                      onDelete={() => setDeleting(slide)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Keyed so each open starts from that slide's saved values. */}
      {editing ? (
        <SlideDialog
          key={editing === "new" ? "new" : editing.id}
          locale={locale}
          mode={mode}
          slide={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        <DeleteSlideDialog key={deleting.id} locale={locale} slide={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </div>
  );
}

/* ── Module scope — never declared inside the table (see RichText's Tool). ── */

function LanguageBadges({ value }) {
  return (
    <div className="flex gap-1">
      {["ar", "en"].map((lang) => (
        <span
          key={lang}
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            value?.[lang] ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-gray-400 line-through dark:bg-gray-800"
          }`}
        >
          {lang}
        </span>
      ))}
    </div>
  );
}

function SlideRowActions({ locale, slide, first, last, onEdit, onDelete }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const move = useActionResult(moveHeroSlide, INITIAL, { onSuccess: () => router.refresh() });
  const visibility = useActionResult(setHeroSlideActive, INITIAL, { onSuccess: () => router.refresh() });

  const busy = move.pending || visibility.pending;
  const failed = move.result?.error ? move.result : visibility.result?.error ? visibility.result : null;

  const send = (hook, fields) => {
    hook.dismiss();
    const body = new FormData();
    body.set("slideId", slide.id);
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    startTransition(() => hook.formAction(body));
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {failed ? <span className="me-2 text-xs text-red-600">{errorText(failed.error, locale, failed.params)}</span> : null}
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" /> : null}

      {/* modal={false}: the menu opens dialogs, and a modal menu closing while
          a dialog opens leaves the page unclickable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label={t("إجراءات", "Actions")} disabled={busy}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"} className="w-48">
          <DropdownMenuItem className="gap-2" onSelect={onEdit}>
            <Pencil className="h-4 w-4" />
            {t("تعديل", "Edit")}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" disabled={first} onSelect={() => send(move, { direction: "up" })}>
            <ArrowUp className="h-4 w-4" />
            {t("تحريك للأعلى", "Move up")}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" disabled={last} onSelect={() => send(move, { direction: "down" })}>
            <ArrowDown className="h-4 w-4" />
            {t("تحريك للأسفل", "Move down")}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={() => send(visibility, { active: String(!slide.active) })}>
            {slide.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {slide.active ? t("إخفاء", "Hide") : t("إظهار", "Show")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600" onSelect={onDelete}>
            <Trash2 className="h-4 w-4" />
            {t("حذف", "Delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function IntervalForm({ locale, seconds }) {
  const t = (ar, en) => (locale === "ar" ? ar : en);
  const router = useRouter();
  const save = useActionResult(saveHeroInterval, INITIAL, { autoClearMs: 2500, onSuccess: () => router.refresh() });

  return (
    <form action={save.formAction} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor="hero-seconds" className="text-xs text-muted-foreground">
          {t("مدة كل شريحة (ثوانٍ)", "Seconds per slide")}
        </Label>
        <Input
          id="hero-seconds"
          name="seconds"
          type="number"
          min="2"
          max="30"
          step="1"
          defaultValue={seconds}
          className="h-9 w-24 tabular-nums"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={save.pending} className="h-9 gap-1.5">
        {save.pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : save.result?.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Timer className="h-3.5 w-3.5" />
        )}
        {t("حفظ", "Save")}
      </Button>
      {save.result?.error ? (
        <span className="basis-full text-xs text-red-600">{errorText(save.result.error, locale)}</span>
      ) : null}
    </form>
  );
}

function SlideDialog({ locale, slide, onClose, mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const save = useActionResult(saveHeroSlide, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  const [image, setImage] = useState(slide?.image ?? "");
  const [title, setTitle] = useState({ ar: slide?.title?.ar ?? "", en: slide?.title?.en ?? "" });
  const [description, setDescription] = useState({
    ar: slide?.description?.ar ?? "",
    en: slide?.description?.en ?? "",
  });
  const [active, setActive] = useState(slide ? slide.active : true);
  // A single-language admin previews the language they write in.
  const [previewLang, setPreviewLang] = useState(mode === "both" ? locale : mode);
  const fieldMode = mode;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        <DialogHeader className="pe-8">
          <DialogTitle className="text-start text-brand-primary">
            {slide ? t("تعديل الشريحة", "Edit slide") : t("شريحة جديدة", "New slide")}
          </DialogTitle>
          <DialogDescription className="text-start">
            {t(
              "تظهر الصورة والنص في أعلى الصفحة الرئيسية. اكتب النص بالعربية والإنجليزية.",
              "The image and text show at the top of the home page. Write the text in Arabic and English."
            )}
          </DialogDescription>
        </DialogHeader>

        <form action={save.formAction} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
          {slide ? <input type="hidden" name="slideId" value={slide.id} /> : null}
          <input type="hidden" name="active" value={active ? "true" : "false"} />

          {/* ── Preview — drawn like the home page hero ─────────────────── */}
          <div className="relative aspect-[16/7] w-full overflow-hidden rounded-xl bg-neutral-900">
            {image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-0 bg-linear-to-b from-black/35 via-black/20 to-black/45" />
            <div
              dir={previewLang === "ar" ? "rtl" : "ltr"}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
            >
              <p className="text-balance text-lg font-extrabold text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] sm:text-2xl">
                {title[previewLang] || (previewLang === "ar" ? "عنوان الشريحة" : "Slide title")}
              </p>
              {description[previewLang] ? (
                <p className="mt-2 max-w-md text-balance text-xs text-white/85 sm:text-sm">{description[previewLang]}</p>
              ) : null}
            </div>
            <div className="absolute end-2 top-2 flex gap-1 rounded-lg bg-black/40 p-0.5">
              {["ar", "en"].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setPreviewLang(lang)}
                  aria-pressed={previewLang === lang}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                    previewLang === lang ? "bg-white text-brand-primary" : "text-white/80"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <SiteImageField
            locale={locale}
            name="imageUrl"
            value={image}
            onChange={setImage}
            folder="hero"
            shape="wide"
            cover
            label={t("الصورة", "Image")}
            hint={t("صورة عريضة، ١٩٢٠×٨٤٠ أو أكبر. JPG أو WebP.", "A wide photo, 1920×840 or larger. JPG or WebP.")}
          />

          {/* Language follows Settings → Language & preferences, like the
              listing and catalog forms: Arabic or English shows one box per
              field; Both shows one box plus the two-language popup. */}
          <div className="grid gap-4">
            <BilingualField
              id="title" label={t("العنوان", "Title")} required
              mode={fieldMode} locale={locale} maxLength={120}
              ar={slide?.title?.ar ?? ""} en={slide?.title?.en ?? ""}
              onChange={setTitle}
            />
            <BilingualField
              id="description" label={t("الوصف", "Description")} textarea rows={2}
              mode={fieldMode} locale={locale} maxLength={300}
              ar={slide?.description?.ar ?? ""} en={slide?.description?.en ?? ""}
              onChange={setDescription}
            />
            <BilingualField
              id="alt" label={t("النص البديل للصورة", "Image alt text")}
              mode={fieldMode} locale={locale} maxLength={160}
              ar={slide?.alt?.ar ?? ""} en={slide?.alt?.en ?? ""}
              hint={t("يصف الصورة لقارئات الشاشة ومحركات البحث.", "Describes the image for screen readers and search engines.")}
            />
          </div>

          <label className="raised flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm">
            <span>
              {t("ظاهرة في الصفحة الرئيسية", "Visible on the home page")}
              <span className="block text-xs text-muted-foreground">
                {t("أطفئها لإخفاء الشريحة دون حذفها.", "Turn off to hide the slide without deleting it.")}
              </span>
            </span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>

          {save.result?.error ? (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {errorText(save.result.error, locale, save.result.params)}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" disabled={save.pending} className="raised-solid gap-2 bg-brand-primary text-white hover:bg-brand-dark">
              {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {slide ? t("حفظ التعديلات", "Save changes") : t("إضافة الشريحة", "Add slide")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSlideDialog({ locale, slide, onClose }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const remove = useActionResult(deleteHeroSlide, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {t("حذف الشريحة", "Delete slide")}
          </DialogTitle>
          <DialogDescription className="text-start">
            {t(
              "ستُزال الشريحة من الصفحة الرئيسية نهائياً. لإخفائها مؤقتاً استخدم «إخفاء» بدلاً من ذلك.",
              "The slide is removed from the home page for good. To hide it for a while, use Hide instead."
            )}
          </DialogDescription>
        </DialogHeader>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.image} alt="" className="aspect-[16/7] w-full rounded-lg border object-cover" />

        {remove.result?.error ? (
          <p className="text-sm text-red-600">{errorText(remove.result.error, locale)}</p>
        ) : null}

        <form action={remove.formAction} className="flex justify-end gap-3">
          <input type="hidden" name="slideId" value={slide.id} />
          <Button type="button" variant="outline" onClick={onClose}>
            {t("إلغاء", "Cancel")}
          </Button>
          <Button type="submit" variant="destructive" disabled={remove.pending} className="gap-2">
            {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t("حذف", "Delete")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
