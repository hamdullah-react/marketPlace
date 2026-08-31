"use client";

/**
 * One editable card on the storefront.
 *
 * A pencil that opens a dialog holding just that card's fields, saves through
 * saveStorefrontSection, and closes. Every section on the page uses this one
 * component with a different field list, rather than eight bespoke dialogs —
 * they are the same interaction, and eight copies is eight places for the
 * pending state or the error handling to drift.
 *
 * ── Fields are DATA ─────────────────────────────────────────────────────────
 *
 * The page describes what a section holds ({ name, label, type }) and this
 * renders it. That keeps the storefront readable as a page rather than as a
 * form builder, and it means a new field is one line where it belongs.
 *
 * ── It does not manage the value ────────────────────────────────────────────
 *
 * Inputs are uncontrolled, seeded by `defaultValue`, and the dialog is
 * remounted on each open (`key`), so reopening shows what is STORED rather
 * than what was typed and abandoned last time. Cancelling has to mean
 * cancelling.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ImagePicker from "@/app/[locale]/marketplace/(seller)/_components/ImagePicker";
import TagsInput from "@/app/[locale]/marketplace/(seller)/_components/TagsInput";
import SocialLinksEditor from "@/app/[locale]/marketplace/(seller)/_components/SocialLinksEditor";
import BilingualField from "@/app/[locale]/marketplace/(seller)/_components/BilingualField";

/**
 * The editor is loaded when a seller opens a dialog that needs it.
 *
 * A plain import would put TipTap — the editor, ProseMirror, and every
 * extension — into this route's bundle, and this route is a PUBLIC storefront
 * whose visitors can never edit anything. They would download a hundred
 * kilobytes of editor to read a page. Measured before deciding: the tiptap
 * chunks were being referenced in an anonymous visitor's HTML.
 *
 * ssr:false because it is a text editor: there is nothing useful to render on
 * the server, and TipTap warns about exactly this.
 */
const RichText = dynamic(() => import("./RichText"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border">
      <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
    </div>
  ),
});
import { useActionResult } from "@/app/[locale]/marketplace/(seller)/_components/useActionResult";
import { saveStorefrontSection } from "../_actions/storefront";

/* The refusals a seller can act on. Anything else is reported as itself rather
   than translated into a shrug. */
const MESSAGES = {
  ar: {
    NOT_YOUR_STORE: "هذا المعرض ليس لك.",
    NAME_REQUIRED: "اكتب اسم المعرض بلغة واحدة على الأقل.",
    EMAIL_INVALID: "بريد إلكتروني غير صحيح.",
    PHONE_INVALID: "رقم جوال سعودي غير صحيح.",
    CR_INVALID: "السجل التجاري ١٠ أرقام.",
    VAT_INVALID: "الرقم الضريبي ١٥ رقماً.",
    COLUMN_MISSING: "قاعدة البيانات تحتاج تحديث — شغّل schema.sql.",
    BAD_DOCUMENT: "تعذّر حفظ المحتوى. أعد المحاولة.",
    SAVE_FAILED: "تعذّر الحفظ.",
  },
  en: {
    NOT_YOUR_STORE: "This showroom is not yours.",
    NAME_REQUIRED: "Give the showroom a name in at least one language.",
    EMAIL_INVALID: "That email address is not valid.",
    PHONE_INVALID: "That is not a valid Saudi mobile number.",
    CR_INVALID: "A CR number is 10 digits.",
    VAT_INVALID: "A VAT number is 15 digits.",
    COLUMN_MISSING: "The database needs schema.sql (§27, §28) running.",
    BAD_DOCUMENT: "That content could not be saved. Try again.",
    SAVE_FAILED: "Could not save.",
  },
};

/** The stored chip lists, keyed by field name — the state a tag box needs. */
const seedTags = (fields) =>
  Object.fromEntries(
    fields
      .filter((f) => f.type === "keywords")
      .map((f) => [f.name, Array.isArray(f.defaultValue) ? f.defaultValue : []])
  );

export default function EditSection({
  locale = "ar",
  vendorId,
  section,
  title,
  description,
  fields = [],
  /* Media for the picker fields. Only passed where one is used. */
  assets = [],
  /* A bare pencil by default; `label` turns it into a normal button, which is
     what an empty section needs — there is nothing there to hang a pencil on. */
  label = null,
  className = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const say = (code) => MESSAGES[isAr ? "ar" : "en"][code] ?? code;

  const [open, setOpen] = useState(false);

  /**
   * Chip lists, by field name.
   *
   * The only controlled fields here — every other input is uncontrolled and
   * seeded from `defaultValue`, but a tag box has no DOM value to read: it is a
   * list, kept in React and posted as JSON by a hidden input.
   *
   * Reset when the dialog opens, for the same reason the form is remounted:
   * cancelling has to mean cancelling, and a chip added and abandoned last time
   * must not come back.
   */
  const [tags, setTags] = useState({});

  /* A dialog holding an editor, four grouped sections, or a row of five
     controls needs the room. One holding three text boxes does not. */
  const wide = fields.some(
    (f) => f.type === "richtext" || f.type === "heading" || f.type === "sociallinks"
  );
  const { result, formAction, pending } = useActionResult(saveStorefrontSection);

  /* Close on a save that worked. The page re-renders from the server behind
     the dialog — revalidatePath in the action — so what is underneath is
     already the new version by the time it is visible. */
  useEffect(() => {
    if (result?.ok) setOpen(false);
  }, [result]);

  const fieldError = (name) => result?.errors?.[name];

  /**
   * One field, whatever kind it is.
   *
   * Lifted out of the JSX so the list can be walked in GROUPS below — a
   * bilingual pair has to share a row, and that decision cannot be made from
   * inside a map over single fields.
   */
  const renderField = (f) => {
              const err = fieldError(f.name);

              /* A rule across the fields rather than a field. The SEO dialog
                 asks about four different things and a flat column of
                 sixteen boxes is a dialog nobody finishes reading. */
              if (f.type === "heading") {
                return (
                  <div key={f.name} className="pt-2 first:pt-0">
                    <Separator className="mb-3" />
                    <p className="text-sm font-semibold text-brand-primary">{f.label}</p>
                    {f.hint ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{f.hint}</p>
                    ) : null}
                  </div>
                );
              }

              if (f.type === "richtext") {
                /* `langs` is one entry per language the showroom writes in.
                   Two full editors stacked is a page of Arabic sitting on a
                   page of English — you scroll it rather than write in it —
                   so two become tabs and one stays a plain editor.

                   forceMount, with the hiding done in CSS: both editors have
                   to keep their hidden input in the form, or switching tabs
                   would throw away what was typed in the other language.
                   Radix unmounts an inactive panel otherwise. */
                const langs = f.langs ?? [
                  { lang: "one", name: f.name, value: f.defaultValue ?? null, dir: f.dir },
                ];

                const editorFor = (l, label) => (
                  <RichText
                    locale={locale}
                    name={l.name}
                    vendorId={vendorId}
                    assets={assets}
                    label={label}
                    hint={f.hint}
                    value={l.value ?? null}
                    dir={l.dir}
                  />
                );

                if (langs.length < 2) {
                  return (
                    <div key={f.name}>{editorFor(langs[0], f.label)}</div>
                  );
                }

                return (
                  <Tabs key={f.name} defaultValue={langs[0].lang} className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      {f.label ? (
                        <span className="text-sm font-medium">{f.label}</span>
                      ) : <span />}
                      <TabsList className="h-8">
                        {langs.map((l) => (
                          <TabsTrigger key={l.lang} value={l.lang} className="h-7 px-3 text-xs">
                            {l.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>

                    {langs.map((l) => (
                      <TabsContent
                        key={l.lang}
                        value={l.lang}
                        forceMount
                        className="mt-0 data-[state=inactive]:hidden"
                      >
                        {editorFor(l, null)}
                      </TabsContent>
                    ))}
                  </Tabs>
                );
              }

              if (f.type === "sociallinks") {
                return (
                  <SocialLinksEditor
                    key={f.name}
                    locale={locale}
                    name={f.name}
                    value={f.defaultValue ?? []}
                    label={f.label}
                    hint={f.hint}
                  />
                );
              }

              if (f.type === "keywords") {
                return (
                  <div key={f.name} className="space-y-1.5">
                    <Label className="text-sm">{f.label}</Label>
                    {/* The same chip box the listing form uses — one
                        implementation, in TagsInput. */}
                    <TagsInput
                      name={f.name}
                      value={tags[f.name] ?? f.defaultValue ?? []}
                      onChange={(next) => setTags((prev) => ({ ...prev, [f.name]: next }))}
                      dir={f.dir}
                      t={t}
                      placeholder={f.placeholder}
                    />
                    {f.hint ? (
                      <p className="text-xs text-muted-foreground">{f.hint}</p>
                    ) : null}
                  </div>
                );
              }

              if (f.type === "select") {
                return (
                  <div key={f.name} className="space-y-1.5">
                    <Label htmlFor={f.name} className="text-sm">{f.label}</Label>
                    {/* Radix writes a hidden native select beside itself when
                        it is given a name, which is what a native form action
                        submits — the visible control is a button. */}
                    <Select name={f.name} defaultValue={String(f.defaultValue ?? "")}>
                      <SelectTrigger id={f.name}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={isAr ? "rtl" : "ltr"}>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {f.hint ? (
                      <p className="text-xs text-muted-foreground">{f.hint}</p>
                    ) : null}
                  </div>
                );
              }

              if (f.type === "switch") {
                return (
                  <div
                    key={f.name}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <Label htmlFor={f.name} className="text-sm">{f.label}</Label>
                      {f.hint ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{f.hint}</p>
                      ) : null}
                    </div>
                    {/* A shadcn Switch is a button, not an input, so it posts
                        nothing on its own — `name` makes it write a hidden
                        input beside itself, which is what a native form
                        action submits. */}
                    <Switch id={f.name} name={f.name} defaultChecked={Boolean(f.defaultValue)} />
                  </div>
                );
              }

              /**
               * One thing, said in two languages.
               *
               * The same control the listing form, the catalog and Settings
               * use — one box in the language the seller works in, and a
               * "Both" popup when they work in both. It posts `${name}Ar`
               * and `${name}En` whatever the mode, so a translation that is
               * not on screen is resubmitted rather than blanked.
               */
              if (f.type === "bilingual") {
                return (
                  <BilingualField
                    key={f.name}
                    id={f.name}
                    label={f.label}
                    ar={f.ar ?? ""}
                    en={f.en ?? ""}
                    mode={f.mode ?? "ar"}
                    locale={locale}
                    textarea={Boolean(f.textarea)}
                    rows={f.rows ?? 3}
                    phAr={f.phAr}
                    phEn={f.phEn}
                    maxLength={f.maxLength}
                    hint={f.hint}
                    /* The action reports against the LANGUAGE key it read —
                       NAME_REQUIRED arrives as `nameAr` — so the box has to
                       answer for both halves of the pair as well as itself. */
                    error={
                      [f.name, `${f.name}Ar`, `${f.name}En`]
                        .map(fieldError)
                        .filter(Boolean)
                        .map(say)[0]
                    }
                  />
                );
              }

              if (f.type === "image") {
                return (
                  <div key={f.name}>
                    <ImagePicker
                      locale={locale}
                      name={f.name}
                      vendorId={vendorId}
                      assets={assets}
                      value={f.defaultValue ?? ""}
                      label={f.label}
                      hint={f.hint}
                      size="wide"
                    />
                  </div>
                );
              }

              return (
                <div key={f.name} className="space-y-1.5">
                  <Label htmlFor={f.name} className="text-sm">{f.label}</Label>

                  {f.type === "textarea" ? (
                    <Textarea
                      id={f.name}
                      name={f.name}
                      rows={f.rows ?? 3}
                      dir={f.dir}
                      defaultValue={f.defaultValue ?? ""}
                      placeholder={f.placeholder}
                      maxLength={f.maxLength}
                      className={err ? "border-red-500" : ""}
                    />
                  ) : (
                    <Input
                      id={f.name}
                      name={f.name}
                      type={f.type === "number" ? "number" : "text"}
                      inputMode={f.type === "number" ? "numeric" : undefined}
                      min={f.type === "number" ? 0 : undefined}
                      dir={f.dir}
                      defaultValue={f.defaultValue ?? ""}
                      placeholder={f.placeholder}
                      maxLength={f.maxLength}
                      className={err ? "border-red-500" : ""}
                    />
                  )}

                  {err ? (
                    <p className="flex items-center gap-1.5 text-xs text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {say(err)}
                    </p>
                  ) : f.hint ? (
                    <p className="text-xs text-muted-foreground">{f.hint}</p>
                  ) : null}
                </div>
              );
  };

  return (
    <>
      {label ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { setTags(seedTags(fields)); setOpen(true); }}
          className={className}
        >
          <Pencil className="h-3.5 w-3.5" />
          {label}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => { setTags(seedTags(fields)); setOpen(true); }}
          title={t("تعديل", "Edit")}
          aria-label={`${t("تعديل", "Edit")} — ${title}`}
          className={`h-7 w-7 text-muted-foreground hover:text-brand-primary ${className}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className={`flex max-h-[88vh] flex-col ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        >
          <DialogHeader className="pr-12 text-start">
            <DialogTitle className="text-start text-brand-primary">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-start">{description}</DialogDescription>
            ) : null}
          </DialogHeader>

          {/* Remounted per open, so an abandoned edit does not come back. */}
          <form key={open ? "open" : "shut"} action={formAction} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="vendorId" value={vendorId} />
            <input type="hidden" name="section" value={section} />

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
              {fields.map(renderField)}
            </div>

            {/* A refusal that belongs to the whole form rather than one field. */}
            {result && !result.ok && result.error ? (
              <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {say(result.error)}
              </p>
            ) : null}

            <DialogFooter className="mt-2 gap-2 sm:justify-start">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t("حفظ", "Save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
