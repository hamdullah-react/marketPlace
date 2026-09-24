"use client";

/**
 * The ways a showroom can pay us — a list, managed from a dialog.
 *
 * ── Why a dialog and not a form on the page ─────────────────────────────────
 *
 * Finance is a working screen: the money owed, who owes it, and the payments
 * being recorded. A nine-field bank form sitting open at the bottom of it is
 * nine fields in the way of that work, every visit, to be filled in perhaps
 * twice a year. It belongs behind a button.
 *
 * ── Which fields are required depends on the KIND ───────────────────────────
 *
 * "Cash at the office" has no IBAN and never will. A wallet has a number that
 * is not an account number. So the form asks for what the chosen kind actually
 * needs, and lib/billing.js's validateAccount enforces exactly that — the same
 * function the server action calls, so the form cannot be more permissive than
 * the save.
 *
 * NO country is privileged. The IBAN check is the ISO shape — two letters, two
 * digits, then the rest — so SA, AE, KW, BH, GB and everywhere else pass, and a
 * bank that issues plain account numbers is served by the other field.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, CreditCard, Landmark, Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import {
  ACCOUNT_KINDS, accountKindLabel, validateAccount, formatIban,
} from "@/marketplace/lib/billing";
import {
  savePaymentAccount, deletePaymentAccount, saveBillingTerms,
} from "../admin/_actions/billing";

const INITIAL = { ok: false, error: null };

const KIND_ICON = {
  bank: Landmark,
  wallet: Wallet,
  cash: Banknote,
  card: CreditCard,
  other: Building2,
};

const BLANK = {
  accountId: "",
  kind: "bank",
  label: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  iban: "",
  swift: "",
  country: "",
  notes: "",
};

export default function PaymentAccountsManager({ locale = "ar", details }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const accounts = details?.accounts ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [confirmId, setConfirmId] = useState(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [terms, setTerms] = useState({
    ar: details?.terms?.ar ?? "",
    en: details?.terms?.en ?? "",
  });

  const done = () => {
    setOpen(false);
    setForm(BLANK);
    setConfirmId(null);
    router.refresh();
  };

  const save = useActionResult(savePaymentAccount, INITIAL, { onSuccess: done });
  const remove = useActionResult(deletePaymentAccount, INITIAL, { autoClearMs: 0, onSuccess: done });
  const saveTerms = useActionResult(saveBillingTerms, INITIAL, {
    onSuccess: () => {
      setTermsOpen(false);
      router.refresh();
    },
  });

  const busy = save.pending || remove.pending;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const edit = (account) => {
    setForm({ ...BLANK, ...account, accountId: account.id });
    save.dismiss();
    setOpen(true);
  };

  const add = () => {
    setForm(BLANK);
    save.dismiss();
    setOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v ?? "");
    save.dismiss();
    startTransition(() => save.formAction(fd));
  };

  const drop = (accountId) => {
    const fd = new FormData();
    fd.set("accountId", accountId);
    remove.dismiss();
    startTransition(() => remove.formAction(fd));
  };

  const submitTerms = (event) => {
    event.preventDefault();
    const fd = new FormData();
    fd.set("termsAr", terms.ar);
    fd.set("termsEn", terms.en);
    saveTerms.dismiss();
    startTransition(() => saveTerms.formAction(fd));
  };

  /* The form's own answer, so the button is disabled before the press rather
     than the press returning an error. Same function as the server's. */
  const problem = validateAccount(form);

  const error = save.result?.error
    ? errorText(save.result.error, locale, save.result.params)
    : remove.result?.error
      ? errorText(remove.result.error, locale, remove.result.params)
      : null;

  const field =
    "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]";

  const needsNumber = form.kind === "bank";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("إضافة طريقة دفع", "Add a payment method")}
        </Button>

        <Button type="button" size="sm" variant="outline" onClick={() => setTermsOpen(true)}>
          {t("شروط الدفع", "Payment terms")}
        </Button>

        {accounts.length ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {accounts.length} {t("طريقة", accounts.length === 1 ? "method" : "methods")}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* A showroom told what it owes and not where to send it will ring you
          instead. Said out loud rather than left as an empty list. */}
      {!accounts.length ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t(
            "لا توجد طريقة دفع بعد، فلا يعرف المعرض كيف يدفع.",
            "No payment method yet, so a showroom has no way of knowing how to pay."
          )}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => {
            const Icon = KIND_ICON[account.kind] ?? Building2;

            return (
              <li key={account.id} className="raised-card rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10">
                    <Icon className="h-4 w-4 text-brand-primary" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-primary">{account.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {accountKindLabel(account.kind, locale)}
                      {account.country ? ` · ${account.country}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => edit(account)}
                      aria-label={t("تعديل", "Edit")}
                      className="rounded p-1 text-muted-foreground hover:text-brand-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(account.id)}
                      aria-label={t("حذف", "Remove")}
                      className="rounded p-1 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <dl className="mt-2 space-y-0.5 text-xs">
                  {account.bankName ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t("البنك", "Bank")}</dt>
                      <dd className="truncate">{account.bankName}</dd>
                    </div>
                  ) : null}
                  {account.accountName ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t("اسم الحساب", "Account name")}</dt>
                      <dd className="truncate">{account.accountName}</dd>
                    </div>
                  ) : null}
                  {account.iban ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t("الآيبان", "IBAN")}</dt>
                      <dd className="truncate font-mono" dir="ltr">
                        {formatIban(account.iban)}
                      </dd>
                    </div>
                  ) : null}
                  {account.accountNumber ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t("رقم الحساب", "Account no.")}</dt>
                      <dd className="truncate font-mono" dir="ltr">
                        {account.accountNumber}
                      </dd>
                    </div>
                  ) : null}
                  {account.swift ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">SWIFT</dt>
                      <dd className="truncate font-mono" dir="ltr">
                        {account.swift}
                      </dd>
                    </div>
                  ) : null}
                  {account.notes ? <p className="pt-1 text-muted-foreground">{account.notes}</p> : null}
                </dl>

                {confirmId === account.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 dark:border-white/10">
                    <span className="text-xs text-muted-foreground">
                      {t("إزالة هذه الطريقة؟", "Remove this method?")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => drop(account.id)}
                    >
                      {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {t("نعم", "Yes")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                      {t("تراجع", "Keep it")}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {details?.terms && (details.terms.ar || details.terms.en) ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {isAr ? details.terms.ar || details.terms.en : details.terms.en || details.terms.ar}
        </p>
      ) : null}

      {/* ── Add / edit ──────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : setOpen(false))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.accountId ? t("تعديل طريقة الدفع", "Edit payment method") : t("طريقة دفع جديدة", "New payment method")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "تظهر هذه البيانات لكل معرض في صفحة مستحقاته. أي بنك وأي دولة، أو نقداً.",
                "Shown to every showroom on their billing page. Any bank, any country — or cash."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="text-muted-foreground">{t("النوع", "Type")}</span>
                <select value={form.kind} onChange={set("kind")} disabled={busy} className={field}>
                  {ACCOUNT_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {isAr ? k.ar : k.en}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                <span className="text-muted-foreground">
                  {t("الاسم الظاهر للمعرض", "Name the showroom sees")}
                </span>
                <input
                  value={form.label}
                  onChange={set("label")}
                  disabled={busy}
                  placeholder={t("مثال: الراجحي — الحساب الرئيسي", "e.g. Al Rajhi — main account")}
                  className={field}
                />
              </label>
            </div>

            {form.kind === "cash" ? (
              <p className="rounded-lg bg-brand-primary/5 p-2 text-xs text-muted-foreground">
                {t(
                  "الدفع نقداً لا يحتاج رقم حساب. أضف في الملاحظات مكان الدفع ومواعيده.",
                  "Cash needs no account number. Put where and when to pay in the notes."
                )}
              </p>
            ) : null}

            {form.kind !== "cash" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="text-muted-foreground">
                    {form.kind === "wallet" ? t("المحفظة", "Wallet") : t("البنك", "Bank")}
                  </span>
                  <input value={form.bankName} onChange={set("bankName")} disabled={busy} className={field} />
                </label>

                <label className="text-xs">
                  <span className="text-muted-foreground">{t("اسم صاحب الحساب", "Account holder")}</span>
                  <input value={form.accountName} onChange={set("accountName")} disabled={busy} className={field} />
                </label>
              </div>
            ) : null}

            {needsNumber ? (
              <>
                <label className="block text-xs">
                  <span className="text-muted-foreground">
                    {t("الآيبان (أي دولة)", "IBAN (any country)")}
                  </span>
                  <input
                    value={form.iban}
                    onChange={set("iban")}
                    disabled={busy}
                    dir="ltr"
                    placeholder="SA03 8000 0000 6080 1016 7519"
                    className={`${field} font-mono`}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs">
                    <span className="text-muted-foreground">{t("أو رقم الحساب", "or account number")}</span>
                    <input
                      value={form.accountNumber}
                      onChange={set("accountNumber")}
                      disabled={busy}
                      dir="ltr"
                      className={`${field} font-mono`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">SWIFT / BIC</span>
                    <input
                      value={form.swift}
                      onChange={set("swift")}
                      disabled={busy}
                      dir="ltr"
                      className={`${field} font-mono`}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">{t("الدولة", "Country")}</span>
                    <input
                      value={form.country}
                      onChange={set("country")}
                      disabled={busy}
                      dir="ltr"
                      maxLength={2}
                      placeholder="SA"
                      className={`${field} font-mono uppercase`}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {form.kind === "wallet" || form.kind === "card" || form.kind === "other" ? (
              <label className="block text-xs">
                <span className="text-muted-foreground">
                  {t("الرقم أو المعرّف", "Number or identifier")}
                </span>
                <input
                  value={form.accountNumber}
                  onChange={set("accountNumber")}
                  disabled={busy}
                  dir="ltr"
                  className={`${field} font-mono`}
                />
              </label>
            ) : null}

            <label className="block text-xs">
              <span className="text-muted-foreground">{t("ملاحظات (اختياري)", "Notes (optional)")}</span>
              <textarea value={form.notes} onChange={set("notes")} disabled={busy} rows={2} className={field} />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={busy || Boolean(problem)} className="gap-1.5">
                {save.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {form.accountId ? t("حفظ", "Save") : t("إضافة", "Add")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>

              {/* Says which field is missing before the press, rather than
                  letting the save come back with it. */}
              {problem ? (
                <span className="text-xs text-muted-foreground">{errorText(problem, locale)}</span>
              ) : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Terms ───────────────────────────────────────────────────────── */}
      <Dialog open={termsOpen} onOpenChange={(next) => setTermsOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("شروط الدفع", "Payment terms")}</DialogTitle>
            <DialogDescription>
              {t(
                "سطر يظهر تحت طرق الدفع في صفحة المعرض. بالعربية والإنجليزية.",
                "A line shown under the payment methods on a showroom's page, in both languages."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitTerms} className="space-y-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("بالعربية", "Arabic")}</span>
              <textarea
                value={terms.ar}
                onChange={(e) => setTerms((x) => ({ ...x, ar: e.target.value }))}
                disabled={saveTerms.pending}
                rows={2}
                dir="rtl"
                className={field}
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("بالإنجليزية", "English")}</span>
              <textarea
                value={terms.en}
                onChange={(e) => setTerms((x) => ({ ...x, en: e.target.value }))}
                disabled={saveTerms.pending}
                rows={2}
                dir="ltr"
                className={field}
              />
            </label>

            {saveTerms.result?.error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {errorText(saveTerms.result.error, locale, saveTerms.result.params)}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={saveTerms.pending} className="gap-1.5">
                {saveTerms.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("حفظ", "Save")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTermsOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
