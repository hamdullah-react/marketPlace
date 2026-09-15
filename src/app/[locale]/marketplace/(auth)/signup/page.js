import { setRequestLocale } from 'next-intl/server';
import AuthForm from '../_components/AuthForm';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/**
 * searchParams is read at the top of this component, so the shell cannot be
 * prerendered without blocking. route-segment-config/instant.md, "Disabling
 * instant". (login/page.js takes the other route — a Suspense boundary.)
 */
export const instant = false;

/** Managed on Pages SEO. noindex by default — an auth page has nothing to rank for. */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('signup', locale);
}

export default async function SignupPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;

  return <AuthForm mode="signup" locale={locale} next={sp?.next ?? ''} />;
}
