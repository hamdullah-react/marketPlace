'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Class-based theming, because tailwind.config.mjs says `darkMode: ["class"]`.
 *
 * Every `dark:` utility in the copied tree resolves against a `.dark` class on
 * <html>, so the provider has to write that attribute — `attribute="class"` is
 * not a preference here, it is what makes the dark styles exist at all.
 *
 * LanguageSwitcher calls useTheme(), so this must wrap the tree even though
 * nothing in the marketplace renders a theme toggle yet.
 */
export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
