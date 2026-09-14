"use client";

/**
 * Delivery addresses — list, add, edit, delete, choose the default.
 *
 * One component rather than a list plus a separate form page. An address book
 * is short, the form is eight fields, and bouncing between two routes to fix a
 * typo in a street name is more navigation than the task deserves.
 *
 * The rows come from the server already sorted (default first). Editing opens
 * the same form the Add button does, with values filled in — one form, one set
 * of validation messages, one place to change a label.
 */

import { useState } from "react";
import {
  MapPin, Plus, Pencil, Trash2, Star, Loader2, AlertCircle, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { saveAddress, deleteAddress, setDefaultAddress } from "../_actions/account";

const MESSAGES = {
  NOT_SIGNED_IN: { ar: "انتهت جلستك. سجّل الدخول مرة أخرى.", en: "Your session ended. Sign in again." },
  VALIDATION: { ar: "أكمل الحقول المطلوبة.", en: "Fill in the required fields." },
  SAVE_FAILED: { ar: "تعذّر الحفظ.", en: "Could not save." },
  DELETE_FAILED: { ar: "تعذّر الحذف.", en: "Could not delete." },
  NOT_FOUND: { ar: "هذا العنوان غير موجود.", en: "That address does not exist." },
};

const FIELD_ERRORS = {
  NAME_REQUIRED: { ar: "أدخل الاسم.", en: "Enter a name." },
  PHONE_REQUIRED: { ar: "أدخل رقم الهاتف.", en: "Enter a phone number." },
  CITY_REQUIRED: { ar: "أدخل المدينة.", en: "Enter the city." },
};

export default function AddressBook({ locale = "ar", addresses = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  // null = closed, {} = adding, {…row} = editing that row.
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const save = useActionResult(saveAddress, { ok: false, error: null, errors: {} }, {
    autoClearMs: 0,
    onSuccess: () => setEditing(null),
  });
  const remove = useActionResult(deleteAddress, { ok: false, error: null }, {
    onSuccess: () => setConfirmDelete(null),
  });
  const promote = useActionResult(setDefaultAddress, { ok: false, error: null });

  const msg = (code) => MESSAGES[code]?.[locale] ?? MESSAGES[code]?.en ?? null;
  const fieldError = (name) => {
    const code = save.result?.errors?.[name];
    return code ? FIELD_ERRORS[code]?.[locale] ?? FIELD_ERRORS[code]?.en ?? code : null;
  };

  const banner =
    (save.result?.error && save.result.error !== "VALIDATION" && msg(save.result.error)) ||
    (remove.result?.error && msg(remove.result.error)) ||
    (promote.result?.error && msg(promote.result.error)) ||
    null;

  const row = "grid gap-2";

  return (
    <>
      {banner ? (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {banner}
        </div>
      ) : null}

      {/* ── The book ─────────────────────────────────────────────────────── */}
      {addresses.length ? (
        <div className="mt-6 space-y-3">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="raised-card rounded-xl p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-brand-primary">
                    {a.label || a.full_name}
                    {a.is_default ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-medium text-brand-primary">
                        <Star className="h-3 w-3 fill-current" />
                        {t("الافتراضي", "Default")}
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{a.full_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400" dir="ltr">
                    {a.phone}
                  </p>

                  {/* Joined rather than one line per field — half of these are
                      optional, and a stack of blank lines is worse than a
                      slightly long sentence. */}
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {[a.building, a.street, a.district, a.city, a.postal_code]
                      .filter(Boolean)
                      .join(isAr ? "، " : ", ")}
                  </p>

                  {a.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1">
                  {!a.is_default ? (
                    <form action={promote.formAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" variant="ghost" size="sm" className="gap-1.5" disabled={promote.pending}>
                        <Star className="h-3.5 w-3.5" />
                        {t("اجعله الافتراضي", "Make default")}
                      </Button>
                    </form>
                  ) : null}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(a)}
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("تعديل", "Edit")}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(a)}
                    className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("حذف", "Delete")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
          <MapPin className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-semibold text-brand-primary">
            {t("لا توجد عناوين", "No addresses yet")}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t(
              "أضف عنواناً لتسريع الطلبات وتحديد مكان التسليم.",
              "Add one to speed up orders and say where a car should be delivered."
            )}
          </p>
        </div>
      )}

      <Button type="button" onClick={() => setEditing({})} className="mt-5 gap-2">
        <Plus className="h-4 w-4" />
        {t("إضافة عنوان", "Add an address")}
      </Button>

      {/* ── Add / edit ───────────────────────────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? t("تعديل العنوان", "Edit address") : t("عنوان جديد", "New address")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "الاسم والهاتف والمدينة مطلوبة. الباقي يساعد السائق على الوصول.",
                "Name, phone and city are required. The rest helps a driver find you."
              )}
            </DialogDescription>
          </DialogHeader>

          <form action={save.formAction} className="flex flex-col gap-4">
            {/* Present only when editing — its absence is what tells the action
                to insert rather than update. */}
            {editing?.id ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className={row}>
              <Label htmlFor="label">{t("التسمية", "Label")}</Label>
              <Input
                id="label"
                name="label"
                defaultValue={editing?.label ?? ""}
                placeholder={t("المنزل، العمل…", "Home, Work…")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={row}>
                <Label htmlFor="fullName">{t("الاسم الكامل", "Full name")} *</Label>
                <Input id="fullName" name="fullName" defaultValue={editing?.full_name ?? ""} required />
                {fieldError("fullName") ? (
                  <p className="text-xs text-red-600">{fieldError("fullName")}</p>
                ) : null}
              </div>
              <div className={row}>
                <Label htmlFor="phone">{t("الهاتف", "Phone")} *</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  dir="ltr"
                  defaultValue={editing?.phone ?? ""}
                  placeholder="+966 5X XXX XXXX"
                  required
                />
                {fieldError("phone") ? (
                  <p className="text-xs text-red-600">{fieldError("phone")}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={row}>
                <Label htmlFor="city">{t("المدينة", "City")} *</Label>
                <Input id="city" name="city" defaultValue={editing?.city ?? ""} required />
                {fieldError("city") ? (
                  <p className="text-xs text-red-600">{fieldError("city")}</p>
                ) : null}
              </div>
              <div className={row}>
                <Label htmlFor="district">{t("الحي", "District")}</Label>
                <Input id="district" name="district" defaultValue={editing?.district ?? ""} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className={`${row} sm:col-span-2`}>
                <Label htmlFor="street">{t("الشارع", "Street")}</Label>
                <Input id="street" name="street" defaultValue={editing?.street ?? ""} />
              </div>
              <div className={row}>
                <Label htmlFor="building">{t("المبنى", "Building")}</Label>
                <Input id="building" name="building" defaultValue={editing?.building ?? ""} />
              </div>
            </div>

            <div className={row}>
              <Label htmlFor="postalCode">{t("الرمز البريدي", "Postal code")}</Label>
              <Input id="postalCode" name="postalCode" dir="ltr" defaultValue={editing?.postal_code ?? ""} />
            </div>

            <div className={row}>
              <Label htmlFor="notes">{t("ملاحظات للسائق", "Notes for the driver")}</Label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={editing?.notes ?? ""}
                className="rounded-lg border bg-background p-3 text-sm outline-hidden focus:border-brand-primary"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={Boolean(editing?.is_default)}
                className="h-4 w-4 accent-[var(--brand-primary)]"
              />
              {t("اجعله العنوان الافتراضي", "Make this my default address")}
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" disabled={save.pending} className="gap-1.5">
                {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("حفظ", "Save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete ───────────────────────────────────────────────────────── */}
      <Dialog open={confirmDelete !== null} onOpenChange={(open) => (open ? null : setConfirmDelete(null))}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              {t("حذف هذا العنوان؟", "Delete this address?")}
            </DialogTitle>
            <DialogDescription>
              {confirmDelete?.label || confirmDelete?.full_name}
              {" — "}
              {t("لا يمكن التراجع.", "This cannot be undone.")}
            </DialogDescription>
          </DialogHeader>

          <form action={remove.formAction} className="flex justify-end gap-2">
            <input type="hidden" name="id" value={confirmDelete?.id ?? ""} />
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={remove.pending}
              className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
            >
              {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("حذف", "Delete")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
