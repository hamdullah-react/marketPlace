"use client";

/**
 * "Delete my account".
 *
 * Deliberately slow to use. The dialog lists what will actually go — counted,
 * not described in the abstract — and the button stays disabled until the
 * account's own email address has been typed. Someone who genuinely wants this
 * will spend the ten seconds; someone who clicked the wrong thing will not get
 * past the first field.
 *
 * Kept out of the account page's flow, at the bottom, behind its own red
 * border. A destructive control that sits next to "Saved cars" gets clicked by
 * accident eventually.
 */

import { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { deleteMyAccount } from "../_actions/delete-account";

export default function DangerZone({ locale = "ar", email = "", counts = {}, showrooms = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const remove = useActionResult(deleteMyAccount, { ok: false, error: null }, {
    autoClearMs: 0,
  });

  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email.length > 0;

  const MESSAGES = {
    CONFIRM_MISMATCH: t(
      "البريد الإلكتروني غير مطابق.",
      "That does not match your email address."
    ),
    HAS_ORDERS: t(
      `لا يمكن حذف الحساب: يوجد ${remove.result?.params?.count ?? ""} طلب مرتبط به. سجلات البيع لا تُحذف — تواصل معنا.`,
      `This account cannot be deleted: ${remove.result?.params?.count ?? ""} order(s) are attached to it. Sales records are not deleted — please contact us.`
    ),
    DELETE_FAILED: t("تعذّر حذف الحساب.", "Could not delete the account."),
    NOT_SIGNED_IN: t("انتهت جلستك.", "Your session ended."),
  };

  const error = remove.result?.error ? MESSAGES[remove.result.error] ?? MESSAGES.DELETE_FAILED : null;

  /**
   * What goes, with numbers.
   *
   * Counts rather than a generic "all your data": someone with three saved cars
   * and someone with a showroom of forty listings are making very different
   * decisions, and only one of them can be talked out of it by a sentence.
   */
  const losing = [
    counts.saved ? t(`${counts.saved} سيارة محفوظة`, `${counts.saved} saved car${counts.saved === 1 ? "" : "s"}`) : null,
    counts.requests ? t(`${counts.requests} طلب سعر`, `${counts.requests} request${counts.requests === 1 ? "" : "s"}`) : null,
    counts.bookings ? t(`${counts.bookings} حجز`, `${counts.bookings} test drive booking${counts.bookings === 1 ? "" : "s"}`) : null,
    ...showrooms.map((s) => t(`معرض «${s.name}» وكل إعلاناته`, `your showroom “${s.name}” and every listing in it`)),
  ].filter(Boolean);

  return (
    <div className="mt-10 rounded-2xl border border-red-200 p-6 dark:border-red-900/60">
      <h2 className="flex items-center gap-2 font-semibold text-red-600">
        <AlertTriangle className="h-4 w-4" />
        {t("حذف الحساب", "Delete account")}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        {t(
          "يحذف حسابك وكل ما يخصه نهائياً. لا يمكن التراجع عن هذا.",
          "Permanently deletes your account and everything belonging to it. This cannot be undone."
        )}
      </p>

      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="mt-4 gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
      >
        <Trash2 className="h-4 w-4" />
        {t("حذف حسابي", "Delete my account")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {t("حذف حسابك نهائياً؟", "Permanently delete your account?")}
            </DialogTitle>
            <DialogDescription>
              {t("لا يمكن التراجع عن هذا الإجراء.", "There is no undo for this.")}
            </DialogDescription>
          </DialogHeader>

          {losing.length ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
              <p className="font-medium text-red-700 dark:text-red-300">
                {t("سيتم حذف:", "This will delete:")}
              </p>
              <ul className="mt-1.5 space-y-1 text-red-700 dark:text-red-300">
                {losing.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden="true">·</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                "لا توجد بيانات مرتبطة بحسابك بعد.",
                "There is nothing attached to your account yet."
              )}
            </p>
          )}

          <form action={remove.formAction} className="flex flex-col gap-3">
            <input type="hidden" name="locale" value={locale} />

            <div className="grid gap-2">
              <Label htmlFor="confirm">
                {t("اكتب بريدك الإلكتروني للتأكيد:", "Type your email address to confirm:")}
              </Label>
              <p className="text-xs font-medium text-muted-foreground" dir="ltr">
                {email}
              </p>
              <Input
                id="confirm"
                name="confirm"
                dir="ltr"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={email}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                type="submit"
                // Disabled until the typed address matches. The server checks
                // the same thing — this only saves a round trip.
                disabled={!matches || remove.pending}
                className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
              >
                {remove.pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("احذف حسابي نهائياً", "Delete my account")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
