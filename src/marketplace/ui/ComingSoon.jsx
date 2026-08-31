/**
 * Placeholder for every marketplace route until that route is built.
 * Server component on purpose — zero client JS on ~75 unbuilt pages.
 *
 * Delete the import from a page.js when you build that page for real.
 */
export default function ComingSoon({ locale = 'ar', titleAr, titleEn, route }) {
  const isAr = locale === 'ar';
  const title = isAr ? titleAr : titleEn;
  const sub = isAr ? titleEn : titleAr;

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-md text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#46194f]/20 bg-[#46194f]/5 px-4 py-1.5 text-xs font-medium text-brand-primary dark:border-[#c9a3d4]/25 dark:bg-[#c9a3d4]/10 dark:text-[#c9a3d4]">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary dark:bg-[#c9a3d4]" />
          {isAr ? 'قريباً' : 'Coming Soon'}
        </span>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">{sub}</p>

        <p className="mt-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {isAr
            ? 'نعمل حالياً على تجهيز هذه الصفحة ضمن سوق الرميح. ترقّبوا الإطلاق قريباً.'
            : 'This page is being built as part of the Alromaih Marketplace. Launching soon.'}
        </p>

        {route ? (
          <code className="mt-8 inline-block rounded-md bg-neutral-100 px-3 py-1.5 text-xs text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            {route}
          </code>
        ) : null}
      </div>
    </main>
  );
}
