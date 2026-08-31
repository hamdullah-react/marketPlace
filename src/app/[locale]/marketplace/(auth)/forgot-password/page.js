import { setRequestLocale } from 'next-intl/server';
import ForgotPasswordForm from '../_components/ForgotPasswordForm';

export const metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ForgotPasswordForm locale={locale} />;
}
