import Link from 'next/link';
import { LibraryIcon, ArrowRight } from 'lucide-react';

/**
 * Shown above the listing form when the seller's catalog has no brands in it.
 *
 * A new showroom starts with an empty catalog by design, which means the very
 * first thing a new seller does — click "Add a car" — presents them with an
 * empty Brand dropdown. Without this, that reads as a broken form rather than a
 * step they have not done yet.
 *
 * Deliberately ABOVE the form and not instead of it. The form still works: the
 * brand and model pickers can each create their entry inline, so a seller who
 * knows exactly what they are listing can just type it. This is the shortcut
 * for everyone else, not a gate.
 */
export default function EmptyCatalogNotice({ locale = 'ar' }) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 sm:flex-row sm:items-center">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs dark:bg-[#1c1c1c]">
        <LibraryIcon className="h-5 w-5 text-brand-primary" />
      </span>

      <div className="flex-1">
        <p className="font-semibold text-brand-primary">
          {t('كتالوجك فارغ', 'Your catalog is empty')}
        </p>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          {t(
            'ثبّت قالباً لتمتلئ قوائم الماركات والموديلات والألوان — أو أضف ما تحتاجه يدوياً من داخل النموذج.',
            'Install a template to fill the brand, model and colour lists — or add just what you need from inside the form.'
          )}
        </p>
      </div>

      <Link
        href={`/${locale}/marketplace/seller/catalog?entity=templates`}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363]"
      >
        {t('تصفّح القوالب', 'Browse templates')}
        <ArrowRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />
      </Link>
    </div>
  );
}
