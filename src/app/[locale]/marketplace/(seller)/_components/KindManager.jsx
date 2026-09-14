"use client";

/**
 * The Kinds tab.
 *
 * A "kind" groups the option lists on car_attributes — fuel, transmission,
 * seats, body_type. It has no table of its own: it exists only as a text value
 * repeated across the rows it groups. Every operation here is therefore a bulk
 * rewrite of those rows, which is why each one reports how many it touched.
 *
 * A kind now has a row of its own in car_attribute_kinds, which is what makes
 * both a NAME and an Add button possible. Before that table it was only a text
 * value repeated across its options: nowhere to put "نوع الهيكل", and nothing
 * to create — an empty kind would have vanished on reload.
 *
 * The two sides can still disagree. A kind can have a row and no options (just
 * added), or options and no row (synced before the table existed). Both appear
 * in this list; the second is offered a "Name it" action rather than hidden.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Loader2, Check, AlertTriangle, ArrowRight, Layers, Plus, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActionResult } from "./useActionResult";
import { saveCatalogKind, deleteCatalogKind } from "../_actions/catalog-crud";
import BilingualField from "./BilingualField";
import ImagePicker from "./ImagePicker";
import { errorText } from "@/marketplace/lib/errors";
import { localized } from "@/marketplace/lib/listing";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";
import { kindSlug } from "@/marketplace/lib/slug";

const INITIAL = { ok: false, error: null };

/**
 * `condition` is the one kind the listing form still knows by name.
 *
 * It has a rule attached — picking "used" makes mileage required — so it keeps
 * its own tile row instead of joining the generated dropdowns. Renaming its
 * slug breaks that rule silently, which is why it alone still warns.
 *
 * Every OTHER kind is now generated from this table: give it options and it
 * appears in the form on the next load. There used to be a hardcoded list here
 * (fuel, transmission, seats, body_type) because the form read those four by
 * name and ignored everything else.
 */
const WIRED_BY_NAME = ["condition"];

/**
 * Slots in the card's spec row. Must match MAX_FACTS in
 * marketplace/_components/ListingCard.jsx — the badge below is a promise about
 * what that component will actually render.
 */
const CARD_SPEC_SLOTS = 4;

export default function KindManager({
  locale = "ar", kinds = [], vendorId = null, fieldMode = "ar", assets = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  // null = closed; {} = adding; a row = editing that kind.
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  /**
   * The slug follows the name until someone types one — the same deal the
   * listing form makes, and the same one every other catalog row gets (theirs
   * is derived server-side, since they have no slug field at all).
   *
   * On an EDIT it starts out "touched", which is the important half. A kind's
   * slug is a live key: options are filed under it and the listing form looks
   * it up by name. Letting a name edit drag the slug along would move every
   * option and empty a dropdown, so only a deliberate edit changes it.
   */
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const save = useActionResult(saveCatalogKind, INITIAL, {
    onSuccess: () => { setEditing(null); router.refresh(); },
  });
  const remove = useActionResult(deleteCatalogKind, INITIAL, {
    onSuccess: () => { setConfirmDelete(null); router.refresh(); },
  });

  const openAdd = () => {
    save.dismiss();
    setSlug("");
    setSlugTouched(false);
    setEditing({});
  };

  const openEdit = (k) => {
    save.dismiss();
    setSlug(k.kind);
    setSlugTouched(true);
    setEditing(k);
  };

  const msg = (r) => (r?.error ? errorText(r.error, locale, r.params) : null);

  /**
   * Which flagged kinds actually reach the card.
   *
   * "No room" used to be the normal case rather than the exception: the row was
   * three columns with year and mileage occupying two, so exactly ONE kind
   * could show and everything else flagged was badged as having no room. Year
   * and mileage have since moved to the line under the car name, freeing all
   * four slots for kinds — so the badge now only appears when a fifth kind is
   * genuinely queued behind four others.
   *
   * Flagging that fifth is still worth allowing: it becomes the stand-in the
   * moment one of the four above it is unflagged.
   */
  const onCard = kinds.filter((k) => k.showOnCard);
  const showing = new Set(onCard.slice(0, CARD_SPEC_SLOTS).map((k) => k.kind));
  const queued = onCard.slice(CARD_SPEC_SLOTS);

  const optionsHref = (kind) => {
    const p = new URLSearchParams({ entity: "attributes", kind });
    if (vendorId) p.set("vendor", vendorId);
    return `/${locale}/marketplace/seller/catalog?${p.toString()}`;
  };

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        {t(
          "النوع حقل في نموذج الإعلان، وخياراته هي القيم المتاحة في قائمته المنسدلة.",
          "A kind is a field on the listing form, and its options are the values in that field's dropdown."
        )}
      </p>

      {/* The answer to "how do I add my own field?" — two steps, and the second
          is the one people miss: a kind with no options is not a dropdown, so
          the form skips it and the new field appears to have done nothing. */}
      <ol className="mb-4 space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
        <li className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white">1</span>
          <span>
            {t("اضغط ", "Press ")}
            <strong>{t("إضافة نوع", "Add kind")}</strong>
            {t(" وسمِّ الحقل — مثلاً «نظام الدفع».", " and name the field — “Drive train”, say.")}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white">2</span>
          <span>
            {t("افتح ", "Open ")}
            <strong>{t("الخيارات", "Options")}</strong>
            {t(
              " وأضف القيم تحته — دفع أمامي، دفع رباعي… النوع بلا خيارات لا يظهر في النموذج.",
              " and add its values — FWD, AWD, and so on. A kind with no options never appears on the form."
            )}
          </span>
        </li>
        <li className="ps-7 text-xs text-muted-foreground">
          {t(
            "الحقل يظهر في «الحالة والسعر» عند إضافة الإعلان التالي. لا حاجة لأي شيء آخر.",
            "The field shows up under “Condition & price” the next time you add a car. Nothing else is needed."
          )}
        </li>
      </ol>

      {/* Only when more kinds are flagged than the row can hold. Under that,
          everything flagged is showing and there is nothing to explain. */}
      {queued.length > 0 ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t(
            `صف المواصفات على البطاقة ${CARD_SPEC_SLOTS} خانات، وقد فعّلت ${onCard.length}. الأقل ترتيباً يفوز، و${queued.length} في الانتظار — تظهر فور إلغاء تفعيل واحد من الظاهرة.`,
            `The card's spec row has ${CARD_SPEC_SLOTS} slots and ${onCard.length} kinds are flagged. The lowest Order wins; ${queued.length} ${queued.length === 1 ? 'is' : 'are'} waiting and will step in the moment one of the shown kinds is turned off.`
          )}
        </p>
      ) : null}

      <div className="mb-3">
        <Button
          type="button"
          onClick={openAdd}
          className="gap-2 bg-brand-primary hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" />
          {t("إضافة نوع", "Add kind")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {kinds.length === 0 ? (
            <div className="py-14 text-center">
              <Layers className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 font-semibold text-brand-primary">
                {t("لا توجد أنواع بعد", "No kinds yet")}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {t(
                  "ينشأ النوع تلقائياً عند إضافة أول خيار تحته من تبويب الخيارات.",
                  "A kind appears as soon as you file the first option under it, from the Options tab."
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-start">{t("الأيقونة", "Icon")}</TableHead>
                    <TableHead className="text-start">{t("الاسم", "Name")}</TableHead>
                    <TableHead className="text-start">{t("المعرّف", "Slug")}</TableHead>
                    <TableHead className="text-start">{t("الخيارات", "Options")}</TableHead>
                    <TableHead className="text-start">{t("على البطاقة", "On card")}</TableHead>
                    <TableHead className="text-start">{t("في نموذج الإعلان", "In the listing form")}</TableHead>
                    <TableHead className="text-end">{t("إجراءات", "Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kinds.map((k) => {
                    // Options are the whole requirement — a kind with none is
                    // a dropdown with nothing to pick, so the form skips it.
                    const inForm = k.total > 0;
                    const byName = WIRED_BY_NAME.includes(k.kind);
                    return (
                      <TableRow key={k.kind}>
                        <TableCell>
                          {k.iconUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={thumbUrl(k.iconUrl, THUMB.icon)}
                              alt=""
                              className="h-8 w-8 rounded object-contain"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded border border-dashed" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={optionsHref(k.kind)}
                            className="text-sm font-medium text-brand-primary hover:underline"
                          >
                            {localized(k.name, locale) || k.kind}
                          </Link>
                          {/* A kind carried over from the sync has no row yet,
                              so there is nothing holding its name. */}
                          {!k.hasRow ? (
                            <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-500">
                              {t("بلا اسم — أضف واحداً", "Unnamed — add one")}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground" dir="ltr">{k.kind}</code>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {k.total}
                          {k.active !== k.total ? (
                            <span className="ms-1.5 text-xs">
                              ({k.active} {t("مفعّل", "active")})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {!k.showOnCard ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : showing.has(k.kind) ? (
                            <Badge className="gap-1 bg-brand-primary text-[11px] hover:bg-brand-primary">
                              <CreditCard className="h-3 w-3" />
                              {t("ظاهر", "Showing")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-[11px]">
                              <CreditCard className="h-3 w-3 opacity-50" />
                              {t("بلا مكان", "No room")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!inForm ? (
                            <span className="text-xs text-muted-foreground">
                              {t("أضف خياراً أولاً", "Add an option first")}
                            </span>
                          ) : byName ? (
                            <Badge variant="outline" className="gap-1 text-[11px]">
                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                              {t("مدمج", "Built in")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-[11px]">
                              <Check className="h-3 w-3 text-emerald-600" />
                              {t("نعم", "Yes")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button" variant="ghost" size="sm"
                              onClick={() => openEdit(k)}
                              aria-label={t("تعديل", "Edit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button" variant="ghost" size="sm"
                              onClick={() => { remove.dismiss(); setConfirmDelete(k); }}
                              aria-label={t("حذف", "Delete")}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add / edit ───────────────────────────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <DialogContent
            dir={isAr ? "rtl" : "ltr"}
            className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
          >
            <DialogHeader>
              <DialogTitle className="text-brand-primary">
                {editing.kind ? t("تعديل النوع", "Edit kind") : t("نوع جديد", "New kind")}
              </DialogTitle>
              <DialogDescription>
                {editing.kind
                  ? t(
                      `تغيير المعرّف يحرّك ${editing.total} خياراً إليه.`,
                      `Changing the slug moves its ${editing.total} option(s) across.`
                    )
                  : t(
                      "النوع يجمّع قائمة خيارات — مثل الوقود أو ناقل الحركة.",
                      "A kind groups one list of options — fuel, transmission, and so on."
                    )}
              </DialogDescription>
            </DialogHeader>

            {editing.kind ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                {WIRED_BY_NAME.includes(editing.kind)
                  ? t(
                      `"${editing.kind}" مدمج في النموذج: اختيار "مستعمل" يجعل الممشى إلزامياً. تغيير المعرّف يكسر هذه القاعدة. الاسم آمن — غيّره كما تشاء.`,
                      `“${editing.kind}” is built into the form: picking “used” makes mileage required. Changing the slug breaks that rule. The NAME is safe to change freely.`
                    )
                  : t(
                      "تغيير المعرّف ينقل الخيارات معه، لكن الإعلانات المحفوظة سابقاً تحتفظ بالمفتاح القديم — فيظهر حقلها فارغاً حتى يُعاد حفظها. الاسم آمن — غيّره كما تشاء.",
                      "Changing the slug carries the options across, but listings already saved keep the OLD key — their field reads as empty until each is saved again. The NAME is safe to change freely."
                    )}
              </p>
            ) : null}

            <form action={save.formAction} className="space-y-4">
              {/* Present only on an edit, so the action knows to carry the
                  options across and retire the old row. */}
              {editing.kind ? <input type="hidden" name="original" value={editing.kind} /> : null}

              {/* This is the answer to "what about English/Arabic for kinds" —
                  the name is bilingual like every other catalog label; the slug
                  stays a machine key. */}
              <BilingualField
                id="name"
                label={t("الاسم", "Name")}
                ar={editing.name?.ar ?? ""}
                en={editing.name?.en ?? ""}
                mode={fieldMode}
                locale={locale}
                required
                onChange={({ ar, en }) => {
                  // English first — the slug is a Latin machine key, and
                  // falling straight to Arabic would produce نوع_الهيكل.
                  if (!slugTouched) setSlug(kindSlug(en || ar));
                }}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="slug">
                  {t("المعرّف", "Slug")} *
                </label>
                <input
                  id="slug" name="slug" dir="ltr" required
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                  placeholder="body_type"
                  className="h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-hidden focus:border-brand-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "المفتاح البرمجي — حروف صغيرة بلا مسافات. لا يظهر للمشتري.",
                    "The machine key — lower-case, no spaces. Buyers never see it."
                  )}
                  {!editing.kind && !slugTouched ? (
                    <span className="ms-1 text-brand-primary">
                      {t("يُولَّد من الاسم — عدّله لتثبيته.", "Generated from the name — edit it to fix it.")}
                    </span>
                  ) : null}
                </p>
              </div>

              {/* Artwork sits on the KIND, not on each option: one fuel icon
                  covers petrol, diesel and hybrid alike. That is also why the
                  Options tab no longer asks for one. */}
              <div className="flex flex-wrap gap-6">
                <ImagePicker
                  locale={locale}
                  name="iconUrl"
                  vendorId={vendorId}
                  assets={assets}
                  value={editing.iconUrl ?? ""}
                  label={t("الأيقونة", "Icon")}
                  hint={t("تظهر بجانب القيمة", "Shows beside the value")}
                  kind="icon"
                  size="sm"
                />
                <ImagePicker
                  locale={locale}
                  name="imageUrl"
                  vendorId={vendorId}
                  assets={assets}
                  value={editing.imageUrl ?? ""}
                  label={t("الصورة", "Image")}
                  hint={t("للأقسام والفلاتر", "For sections and filters")}
                  kind="photo"
                  size="wide"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox" name="showOnCard"
                  defaultChecked={!!editing.showOnCard}
                  className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
                />
                <span>
                  {t("يظهر على بطاقة السيارة", "Show on the car card")}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t(
                      `قيمة هذا النوع تُعرض في صف المواصفات على البطاقة — ${CARD_SPEC_SLOTS} خانات بترتيب الحقل أدناه.`,
                      `This kind's value joins the spec row on the card — ${CARD_SPEC_SLOTS} slots, filled in the Order below.`
                    )}
                  </span>
                </span>
              </label>

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sequence">
                  {t("الترتيب", "Order")}
                </label>
                <input
                  id="sequence" name="sequence" type="number"
                  defaultValue={editing.sequence ?? 0}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-hidden focus:border-brand-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("يرتّب الأنواع هنا وعلى البطاقة.", "Orders the kinds here and on the card.")}
                </p>
              </div>

              {msg(save.result) ? (
                <p className="text-xs text-red-600">
                  {msg(save.result)}
                  {save.result?.detail ? (
                    <span className="mt-0.5 block font-mono text-[11px] opacity-70">
                      {save.result.detail}
                    </span>
                  ) : null}
                </p>
              ) : null}

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button type="submit" disabled={save.pending}
                  className="gap-2 bg-brand-primary hover:bg-[var(--brand-dark)]">
                  {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {t("حفظ", "Save")}
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ── Delete ───────────────────────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        {confirmDelete ? (
          <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {t("حذف النوع", "Delete kind")} “{confirmDelete.kind}”
              </DialogTitle>
              <DialogDescription>
                {t(
                  `النوع ليس صفاً — حذفه يحذف خياراته الـ${confirmDelete.total}. إن كان أيٌّ منها مستخدماً في إعلان فسيُرفض الحذف بالكامل.`,
                  `A kind is not a row — deleting it deletes its ${confirmDelete.total} option(s). If any of them is used by a listing the whole delete is refused.`
                )}
              </DialogDescription>
            </DialogHeader>

            {msg(remove.result) ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {msg(remove.result)}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Link
                href={optionsHref(confirmDelete.kind)}
                className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
              >
                {t("عرض خياراته", "See its options")}
                <ArrowRight className={`h-3 w-3 ${isAr ? "rotate-180" : ""}`} />
              </Link>

              <form action={remove.formAction} className="flex gap-3">
                <input type="hidden" name="kind" value={confirmDelete.kind} />
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button type="submit" variant="destructive" disabled={remove.pending} className="gap-2">
                  {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t("حذف", "Delete")}
                </Button>
              </form>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
