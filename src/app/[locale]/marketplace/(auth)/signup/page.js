import { setRequestLocale } from 'next-intl/server';
import AuthForm from '../_components/AuthForm';

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
