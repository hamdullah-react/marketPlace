import 'server-only';

/**
 * The marketplace's Supabase client acting as the PROJECT, not as a user.
 *
 * Separate from getMarketplaceDb() — that one is for table reads and writes.
 * This one exists for auth.admin, which is a different privilege again: it can
 * create users, mint confirmation tokens and delete accounts.
 *
 * ── Why the app mints its own codes ─────────────────────────────────────────
 *
 * Supabase's built-in email service sends two emails per hour for the whole
 * project and only reliably reaches addresses on the project team. That is not
 * a marketplace; that is a demo. The alternative — pointing Supabase at our
 * SMTP — works, but hands the templates to a dashboard, in a product that has
 * to send the same message in Arabic and English.
 *
 * admin.generateLink() is the way out. It returns the SAME six-to-eight digit
 * code Supabase would have emailed, and sends nothing. Measured against this
 * project: twelve calls in a row, no throttling, no mail. So Supabase stays the
 * authority on what a valid code is, when it expires and whether it has been
 * used — none of that is reimplemented here — and we take over delivery only.
 *
 * The rate limit that came free with Supabase's mailer does NOT come free with
 * ours, which is what otp_send_allowed() in schema.sql §19 is for.
 */

import { createClient } from '@supabase/supabase-js';
import { marketplaceEnv } from '@/marketplace/lib/env';

let _admin = null;

export function getMarketplaceAuthAdmin() {
  if (_admin) return _admin;

  const { url, serviceRoleKey } = marketplaceEnv();

  _admin = createClient(url, serviceRoleKey, {
    // No session to persist and nothing to refresh: this client is never a
    // person, and leaving either on makes it try to write cookies it has no
    // business writing.
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-client-info': 'alromaih-marketplace-auth' } },
  });

  return _admin;
}
