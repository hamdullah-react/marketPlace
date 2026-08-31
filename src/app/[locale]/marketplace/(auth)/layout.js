import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

/**
 * Chrome for the auth pages — the login-01 block's own shell.
 *
 * No header and no footer, on purpose. A sign-in page carrying the full site
 * navigation invites the visitor to wander off mid-task, and the marketplace
 * header renders a "Sign in" link that would sit above the sign-in form.
 *
 * dir and the background are set here for the same reason every other group
 * sets its own: the marketplace segment layout renders children bare so the
 * dashboard's sidebar keeps its flex chain.
 */
export default async function AuthLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="marketplace-root flex min-h-svh w-full flex-col items-center justify-center gap-6 bg-white p-6 text-neutral-900 md:p-10 dark:bg-[#0f0f0f] dark:text-neutral-100"
    >
      {/* The way back out. Someone who opened sign-in by accident should not
          have to use the browser's back button to leave. */}
      <Link
        href={`/${locale}/marketplace`}
        className="text-lg font-bold text-brand-primary hover:opacity-80"
      >
        {isAr ? 'سوق الرميح' : 'Alromaih Marketplace'}
      </Link>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
