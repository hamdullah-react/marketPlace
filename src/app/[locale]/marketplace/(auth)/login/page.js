import { setRequestLocale } from 'next-intl/server';
import AuthForm from '../_components/AuthForm';

export const metadata = {
  title: 'Login',
  // An auth page has nothing to rank for, and a sign-in form in the index is a
  // phishing lookalike waiting to be cited.
  robots: { index: false, follow: false },
};

export default async function LoginPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Where the visitor was heading when they were asked to sign in. Validated in
  // the action, not here — the check belongs next to the redirect.
  const sp = await searchParams;

  return <AuthForm mode="signin" locale={locale} next={sp?.next ?? ''} />;
}
