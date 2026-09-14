/**
 * Marketplace env. Fails loudly at first use rather than silently at checkout.
 * Every marketplace variable is MARKETPLACE_-prefixed so it can never be
 * confused with the main site's Supabase/Odoo credentials.
 */
export function marketplaceEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.MARKETPLACE_SUPABASE_URL;
  const serviceRoleKey = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;

  const missing = [];
  if (!url) missing.push('MARKETPLACE_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length) {
    throw new Error(
      `Marketplace is missing required env vars: ${missing.join(', ')}. ` +
        'See docs/MARKETPLACE-STRUCTURE.md §6.'
    );
  }

  // `missing` being empty is the proof both are strings; the compiler cannot
  // follow that through an array, so it is asserted here rather than by
  // loosening the return type and pushing `string | undefined` into every
  // caller.
  return { url: url as string, serviceRoleKey: serviceRoleKey as string };
}

/**
 * The two values the BROWSER needs to sign in.
 *
 * Public on purpose, and inlined by the bundler — which is why they must be
 * read as literal `process.env.NEXT_PUBLIC_*` expressions rather than looked up
 * dynamically. A computed key is not replaced at build time and arrives as
 * undefined in the browser.
 *
 * The anon key being public is the point of doing auth in the database: it
 * grants only what RLS allows. The service-role key in marketplaceEnv() is the
 * opposite and must never be imported from client code.
 */
export function marketplacePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_ANON_KEY;

  const missing = [];
  if (!url) missing.push('NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL');
  if (!anonKey) missing.push('NEXT_PUBLIC_MARKETPLACE_SUPABASE_ANON_KEY');

  if (missing.length) {
    throw new Error(
      `Marketplace auth is missing required env vars: ${missing.join(', ')}. ` +
        'They are the same project as MARKETPLACE_SUPABASE_URL, with the ANON key.'
    );
  }

  return { url: url as string, anonKey: anonKey as string };
}

/**
 * How many digits an emailed code has.
 *
 * NOT a constant, and not 6. Supabase makes this a per-project setting
 * (Authentication → Sign In / Providers → Email → "Email OTP Length") and this
 * project issues EIGHT. A six-slot box against an eight-digit code is a form
 * that can never be completed correctly — the person types six, the field is
 * "full", and every attempt fails with "wrong code" while the code was right.
 *
 * So the app is told the number rather than assuming it. Read as a literal
 * NEXT_PUBLIC_ expression because the sign-in box is a client component and a
 * computed key is not inlined by the bundler.
 *
 * Falls back to 6 — Supabase's own default — and clamps to the range the
 * dashboard allows, so a typo in the env file cannot render a 400-slot form.
 */
export function otpLength(): number {
  const n = Number(process.env.NEXT_PUBLIC_MARKETPLACE_OTP_LENGTH);
  return Number.isInteger(n) && n >= 6 && n <= 10 ? n : 6;
}
