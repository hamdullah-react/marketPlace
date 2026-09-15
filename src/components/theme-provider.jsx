'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Class-based theming, because tailwind.config.mjs says `darkMode: ["class"]`.
 *
 * Every `dark:` utility in the copied tree resolves against a `.dark` class on
 * <html>, so the provider has to write that attribute — `attribute="class"` is
 * not a preference here, it is what makes the dark styles exist at all.
 *
 * ui/sonner and ui/theme-toggle call useTheme(), so this must wrap the tree
 * even though nothing in the marketplace renders a theme toggle yet.
 *
 * LanguageSwitcher used to be on that list and no longer is: it picked its
 * colours by reading `theme` in JS, which meant it could not be styled until
 * the client mounted. It uses `dark:` variants now, which is the same decision
 * made in the stylesheet where it costs nothing.
 *
 * scriptProps: next-themes renders an inline <script> that sets the class
 * before paint. The server HTML needs it; a client render does not, and React
 * 19 logs "Encountered a script tag while rendering React component" when one
 * renders there. It does render there whenever the [locale] root layout
 * re-renders, which is every language switch. On the client the script gets a
 * non-executable type, which React does not warn about. next-themes already
 * sets suppressHydrationWarning on it, so the type difference is silent.
 */
const scriptProps = typeof window === 'undefined' ? undefined : { type: 'application/json' };

export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
