import { setRequestLocale } from 'next-intl/server';
import ForgotPasswordForm from '../_components/ForgotPasswordForm';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/** Managed on Pages SEO. noindex by default. */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('forgot-password', locale);
}

export default async function ForgotPasswordPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ForgotPasswordForm locale={locale} />;
}
