import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import AuthForm from '../_components/AuthForm';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/**
 * Managed on Pages SEO. noindex by default: an auth page has nothing to rank
 * for, and a sign-in form in the index is a phishing lookalike waiting to be
 * cited.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('login', locale);
}

export default async function LoginPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  /**
   * The form is the same for everyone; only `next` differs. So the page is
   * prerendered and just the one prop waits on the URL — awaiting searchParams
   * out here instead made the whole sign-in screen render-on-request, which is
   * what "cookies(), headers(), params, or searchParams accessed outside of
   * <Suspense> prevents the route from being prerendered" is warning about.
   *
   * No fallback: AuthForm renders instantly with next=''. A visitor who lands
   * on a flash of nothing before a login form assumes it failed.
   */
  return (
    <Suspense fallback={<AuthForm mode="signin" locale={locale} next="" />}>
      <SignInForm locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInForm({ locale, searchParams }) {
  // Where the visitor was heading when they were asked to sign in. Validated in
  // the action, not here — the check belongs next to the redirect.
  const sp = await searchParams;

  // `notice` is a KEY looked up in AuthForm, not a message — see NOTICES there.
  return <AuthForm mode="signin" locale={locale} next={sp?.next ?? ''} notice={sp?.notice ?? ''} />;
}
