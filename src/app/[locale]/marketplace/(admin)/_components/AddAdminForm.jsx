"use client";

import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { addAdminByEmail } from "../admin/_actions/users";
import { errorText } from "@/marketplace/lib/errors";

/** Grants admin to an existing account, by its email. */
export default function AddAdminForm({ locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const add = useActionResult(addAdminByEmail, { ok: false, error: null }, {
    autoClearMs: 6000,
    onSuccess: () => router.refresh(),
  });

  return (
    <div className="raised-card rounded-xl p-4 sm:p-5">
      <h2 className="font-semibold text-brand-primary">{t("إضافة مسؤول", "Add an admin")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "يجب أن يكون لدى الشخص حساب في السوق أولاً. سيحصل على كامل صلاحيات هذه اللوحة.",
          "The person needs a marketplace account first. They get full access to this panel."
        )}
      </p>

      {/* Keyed on the success token, so the field empties after it works. */}
      <form
        key={add.raw?.ok ? add.raw.token : "add-admin"}
        action={add.formAction}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="locale" value={locale} />
        <div className="grid flex-1 gap-2">
          <Label htmlFor="admin-email">{t("البريد الإلكتروني", "Email")}</Label>
          <Input id="admin-email" name="email" type="email" dir="ltr" placeholder="name@example.com" required />
        </div>
        <Button
          type="submit"
          disabled={add.pending}
          className="gap-2 bg-brand-primary text-white hover:bg-brand-dark"
        >
          {add.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {t("اجعله مسؤولاً", "Make admin")}
        </Button>
      </form>

      {add.result?.ok ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span dir="ltr">{add.result.email}</span>
          {t("أصبح مسؤولاً.", "is now an admin.")}
        </p>
      ) : add.result?.error ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {errorText(add.result.error, locale, add.result.params)}
        </p>
      ) : null}
    </div>
  );
}
