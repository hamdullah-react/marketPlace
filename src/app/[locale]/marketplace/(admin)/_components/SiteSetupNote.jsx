/** Shown on every Website content screen until the SQL section has been run. */
export default function SiteSetupNote({ locale = 'ar' }) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p className="font-semibold text-amber-800 dark:text-amber-300">
        {t('محتوى الموقع غير مفعّل بعد', 'Website content is not set up yet')}
      </p>
      <p className="mt-2 text-amber-700 dark:text-amber-400">
        {t(
          'افتح Supabase ← SQL Editor وشغّل قسم WEBSITE CONTENT في آخر src/marketplace/db/schema.sql، ثم حدّث الصفحة.',
          'Open Supabase → SQL Editor and run the WEBSITE CONTENT section at the end of src/marketplace/db/schema.sql, then refresh this page.'
        )}
      </p>
    </div>
  );
}
