import '../globals.css';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Almarai, Noto_Sans_Arabic } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * THE root layout — and it sits under [locale] on purpose.
 *
 * next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:
 * "The root layout can be under a dynamic segment, for example when
 * implementing internationalization with app/[lang]/layout.js", and omitting
 * app/layout.js makes the layouts below it root layouts.
 *
 * That placement is the whole reason this file can do something the parent
 * repo's root layout cannot. There, <html> is above [locale] and so cannot see
 * it — src/app/layout.js hardcodes `lang="ar" dir="rtl"` with the comment
 * "Default to Arabic (RTL)", which means every ENGLISH page on the site ships
 * as Arabic RTL to a screen reader and to Google. Here the locale is a param,
 * so lang and dir are simply correct in both languages.
 */

/**
 * Two fonts, not five.
 *
 * The parent's root layout loads Almarai, IBM Plex Sans Arabic, DM Sans,
 * Lalezar and Noto Sans Arabic, and the marketplace inherited all of them for
 * the two it actually uses: the tailwind `sans` family resolves to
 * --font-almarai, and exactly two components ask for `font-noto`. The other
 * three were pure download weight on every marketplace page.
 */
const almarai = Almarai({
  subsets: ['arabic'],
  weight: ['300', '400', '700', '800'],
  display: 'swap',
  variable: '--font-almarai',
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-noto-sans-arabic',
  preload: false,
});

/**
 * Both locales, prerendered. Without this every page under [locale] would opt
 * into dynamic rendering the moment setRequestLocale ran.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params;

  // A URL like /de/marketplace must 404 rather than render an Arabic page
  // under a German lang attribute.
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const isAr = locale === 'ar';

  return (
    <html lang={locale} dir={isAr ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body
        className={`${almarai.variable} ${notoSansArabic.variable} font-almarai`}
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
