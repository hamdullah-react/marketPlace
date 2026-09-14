import { setRequestLocale } from 'next-intl/server';
import AuthForm from '../_components/AuthForm';

/**
 * searchParams is read at the top of this component, so the shell cannot be
 * prerendered without blocking. route-segment-config/instant.md, "Disabling
 * instant". (login/page.js takes the other route — a Suspense boundary.)
 */
export const instant = false;

export const metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export default async function SignupPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;

  return <AuthForm mode="signup" locale={locale} next={sp?.next ?? ''} />;
}
