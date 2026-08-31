/**
 * Shown when a seller page loads before its tables exist. Server component —
 * it exists so a missing table produces a message instead of a 500, which is
 * the difference between "not ready yet" and "broken".
 *
 * It used to print the migration checklist: which SQL files to apply, which
 * CLI scripts to run, and the raw driver error. A seller is not a developer
 * and cannot act on any of that — it reads as the product being broken, and it
 * leaks the internal file layout to anyone who reaches the page. The cause now
 * goes to the server log, where someone who can fix it will see it.
 */
export default function SetupNotice({ locale = 'ar', error = null }) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  if (error) console.error('[seller] setup incomplete:', error);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p className="font-semibold text-amber-800 dark:text-amber-300">
        {t('هذا القسم غير جاهز بعد', 'This section isn’t ready yet')}
      </p>
      <p className="mt-2 text-amber-700 dark:text-amber-400">
        {t(
          'نعمل على تجهيزه. حاول تحديث الصفحة بعد قليل، وإن استمرت المشكلة تواصل مع الدعم.',
          'We’re still getting it set up. Try refreshing in a moment — if it keeps happening, contact support.'
        )}
      </p>
    </div>
  );
}
