import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { getSiteSettings } from '@/marketplace/db/queries/site';

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
 *
 * The logo and name come from Admin → Settings (a cached read).
 */
export default async function AuthLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const site = await getSiteSettings();
  const name = isAr ? site.name.ar : site.name.en;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="marketplace-root flex min-h-svh w-full flex-col items-center justify-center gap-6 bg-white p-6 text-neutral-900 md:p-10 dark:bg-[#0f0f0f] dark:text-neutral-100"
    >
      {/* The way back out. Someone who opened sign-in by accident should not
          have to use the browser's back button to leave. */}
      <Link
        href={`/${locale}/marketplace`}
        className="flex flex-col items-center gap-2 text-lg font-bold text-brand-primary hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={site.logoUrl} alt="" className="h-12 w-auto max-w-[200px] object-contain" />
        <span>{name}</span>
      </Link>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
