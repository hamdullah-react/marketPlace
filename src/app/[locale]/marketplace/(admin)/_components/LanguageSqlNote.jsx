/**
 * Shown on the content editors while the authoring-language column does not
 * exist yet. Without it the admin's "Both" choice cannot be saved or read, so
 * every bilingual field falls back to one box and no Both button appears.
 */
export default function LanguageSqlNote({ locale = 'ar' }) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);
  return (
    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      {t(
        'زر «اللغتان» يظهر بعد اختيار «الاثنتان معاً» في الإعدادات ← اللغة. لتفعيل ذلك شغّل آخر قسم «Authoring language, translation fallback and social links» في schema.sql داخل Supabase ← SQL Editor، ثم احفظ اللغة وحدّث الصفحة.',
        'The “Both” button appears once Settings → Language is set to “Both side by side”. To enable that, run the last block “Authoring language, translation fallback and social links” of schema.sql in Supabase → SQL Editor, save the language, then refresh.'
      )}
    </p>
  );
}
