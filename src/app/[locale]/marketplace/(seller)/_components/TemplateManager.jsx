"use client";

/**
 * Catalog templates — install the real catalog instead of typing it.
 *
 * One card per template: what it contains, how many rows, and whether it is
 * already in. Installing writes the rows; removing takes back exactly the rows
 * that install created and nothing a vendor added themselves.
 *
 * Deliberately plain about the two things a vendor will worry about, because
 * an install that touches shared data and cannot be explained does not get
 * clicked:
 *
 *   · nothing you already have is overwritten
 *   · anything a car is using is left alone when you remove
 *
 * Both are stated on the card, not buried in a tooltip.
 */

import { useState } from "react";
import { useActionResult } from "./useActionResult";
import { installTemplate, removeTemplate } from "../_actions/catalog-templates";
import {
  Download, Trash2, Check, Loader2, AlertCircle, PackageOpen, Info,
} from "lucide-react";

const localized = (value, locale) =>
  (value && typeof value === "object" ? value[locale] || value.en || value.ar : value) || "";

export default function TemplateManager({ locale = "ar", templates = [], vendorId = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  // Which template each form is acting on. One pending row at a time is the
  // honest model — these write shared data, and two installs racing each other
  // is a support ticket nobody can reconstruct.
  const [busy, setBusy] = useState(null);

  const install = useActionResult(installTemplate, { ok: false, error: null }, {
    onAny: () => setBusy(null),
  });
  const remove = useActionResult(removeTemplate, { ok: false, error: null }, {
    onAny: () => setBusy(null),
  });

  const card =
    "rounded-xl border bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#161616]";

  /**
   * `added` and `linked` are different facts and both belong in the sentence.
   *
   * The catalog rows are shared, so the FIRST seller to install brands creates
   * twenty-six and the second links to the same twenty-six. Reporting only
   * `added` would tell that second seller "Installed 0 rows" about an install
   * that worked perfectly and filled their catalog.
   */
  const message = install.result?.ok
    ? t(
        `أُضيف ${install.result.added} صف إلى كتالوجك` +
          (install.result.linked ? `، ورُبط ${install.result.linked} صف موجود مسبقاً` : "") +
          (install.result.updated ? `، وحُدِّث ${install.result.updated} صف من القالب` : "") +
          (install.result.values ? `، وأُضيفت ${install.result.values} قيمة جديدة` : "") +
          (install.result.images ? `، ورفع ${install.result.images} صورة إلى مكتبة الوسائط` : "") +
          ".",
        `Added ${install.result.added} rows to your catalog` +
          (install.result.linked ? `, and linked ${install.result.linked} that already existed` : "") +
          (install.result.updated ? `, refreshed ${install.result.updated} from the template` : "") +
          (install.result.values ? `, added ${install.result.values} new option values` : "") +
          (install.result.images ? `, and uploaded ${install.result.images} images to your media library` : "") +
          "."
      )
    : remove.result?.ok
      ? t(
          `تمت إزالة ${remove.result.removed} صف` +
            (remove.result.files ? ` و${remove.result.files} صورة` : "") +
            (remove.result.keptShared ? `. ${remove.result.keptShared} صف يستخدمه بائع آخر وبقي على المنصة.` : "") +
            (remove.result.inUse ? ` ${remove.result.inUse} صف قيد الاستخدام في إعلاناتك، وتُرك كما هو.` : "."),
          `Removed ${remove.result.removed} rows` +
            (remove.result.files ? ` and ${remove.result.files} images` : "") +
            (remove.result.keptShared ? `. ${remove.result.keptShared} are used by another showroom and stay on the platform.` : "") +
            (remove.result.inUse ? ` ${remove.result.inUse} are in use by your listings and were left alone.` : ".")
        )
      : null;

  const error = install.result?.ok === false && install.result?.error
    ? install.result.error
    : remove.result?.ok === false && remove.result?.error
      ? remove.result.error
      : null;

  const ERRORS = {
    UNKNOWN_TEMPLATE: t("هذا القالب غير موجود.", "That template does not exist."),
    NOTHING_TO_INSTALL: t(
      "لا شيء لتثبيته — ثبّت القالب الذي يعتمد عليه أولاً.",
      "Nothing to install — install the template it depends on first."
    ),
    NOT_INSTALLED: t("هذا القالب غير مثبَّت.", "That template is not installed."),
  };

  if (!templates.length) {
    return (
      <div className={`${card} text-center`}>
        <PackageOpen className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 text-sm font-medium">
          {t("القوالب غير متاحة حالياً", "Templates are unavailable right now")}
        </p>
        {/* A vendor cannot fix this and should not be told to try. The
            templates ship inside the build; an empty list means something is
            wrong on our side, so the only honest instruction is "not you". */}
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "لا شيء مطلوب منك — يمكنك إضافة بيانات الكتالوج يدوياً من التبويبات الأخرى في هذه الأثناء.",
            "Nothing for you to do — you can add catalog data by hand from the other tabs meanwhile."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── What this is ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
        <p className="text-gray-700 dark:text-gray-300">
          {t(
            "كتالوجك يبدأ فارغاً. ثبّت ما تحتاجه فقط — الماركات والموديلات والمواصفات التي تبيعها — ويمكنك إزالة أي قالب لاحقاً. لا يُستبدل أي شيء أضفته بنفسك.",
            "Your catalog starts empty. Install only what you need — the brands, models and specifications you actually sell — and remove any of it later. Nothing you added yourself is overwritten."
          )}
        </p>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {ERRORS[error] ?? error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {templates.map((tpl) => {
          const isInstalled = tpl.installed > 0;
          const pending =
            (install.pending || remove.pending) && busy === tpl.key;

          return (
            <div key={tpl.key} className={card}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold text-brand-primary">
                    {localized(tpl.name, locale)}
                    {isInstalled ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                        {t("مثبَّت", "Installed")}
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {localized(tpl.description, locale)}
                  </p>
                </div>

                <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium tabular-nums text-gray-600 dark:bg-white/5 dark:text-gray-400">
                  {tpl.count} {t("صف", "rows")}
                </span>
              </div>

              {/* A template that links to another is useless before it. Say so
                  rather than letting the install come back with nothing. */}
              {tpl.needs?.length ? (
                <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-500">
                  {t("يتطلب: ", "Needs: ")}
                  {tpl.needs
                    .map((n) => localized(templates.find((x) => x.key === n)?.name, locale) || n)
                    .join(isAr ? "، " : ", ")}
                </p>
              ) : null}

              {isInstalled ? (
                <p className="mt-3 text-[11px] tabular-nums text-muted-foreground">
                  {t(`${tpl.installed} صف من هذا القالب في الكتالوج.`, `${tpl.installed} rows from this template are in your catalog.`)}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={install.formAction} onSubmit={() => setBusy(tpl.key)}>
                  <input type="hidden" name="template" value={tpl.key} />
                  <input type="hidden" name="vendor" value={vendorId ?? ""} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5a2363] disabled:opacity-60"
                  >
                    {pending && install.pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {isInstalled ? t("تحديث", "Install missing") : t("تثبيت", "Install")}
                  </button>
                </form>

                {isInstalled ? (
                  <form action={remove.formAction} onSubmit={() => setBusy(tpl.key)}>
                    <input type="hidden" name="template" value={tpl.key} />
                  <input type="hidden" name="vendor" value={vendorId ?? ""} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-red-950/40"
                    >
                      {pending && remove.pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {t("إزالة", "Remove")}
                    </button>
                  </form>
                ) : null}
              </div>

              {isInstalled ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t(
                    "الإزالة تخرج صفوف هذا القالب من كتالوجك، وتترك أي صف تستخدمه إعلاناتك أو يشاركه بائع آخر.",
                    "Remove takes this template's rows out of your catalog, and leaves anything your listings use or another showroom shares."
                  )}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
