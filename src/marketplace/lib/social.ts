/**
 * A showroom's links — the registry, the rules, and the validation.
 *
 * ONE definition, read by four things: the Settings editor, the storefront
 * editor, both server actions, and the storefront itself. The eight-key version
 * of this lived in three places at once (a list in settings.js, a list in
 * storefront.js, a list in the page) and a key added to one and not the others
 * was a field a seller filled in and never saw again. That is the failure this
 * file exists to make impossible.
 *
 * Pure data and pure functions: no JSX, no React, no lucide import. Each
 * renderer maps an icon NAME to its own component, so this can be read by a
 * server action and a client component without either dragging the other's
 * dependencies along.
 */

/**
 * The platforms that get a brand mark and a handle rule.
 *
 * `base` is what a bare handle is prefixed with; a platform without one takes
 * the value as a domain. `icon` is a file in /public/images — the same marks
 * the site footer uses — and `lucide` names a fallback for the two that have
 * no SVG on disk.
 */
export const SOCIAL_PLATFORMS = [
  { key: 'whatsapp',  ar: 'واتساب',    en: 'WhatsApp',  icon: '/images/Whatsapp.svg',  hint: '05xxxxxxxx' },
  { key: 'instagram', ar: 'إنستغرام',  en: 'Instagram', icon: '/images/Instagram.svg', base: 'https://instagram.com/', hint: '@handle' },
  { key: 'x',         ar: 'إكس',       en: 'X',         icon: '/images/Twitter.svg',   base: 'https://x.com/',         hint: '@handle' },
  { key: 'snapchat',  ar: 'سناب شات',  en: 'Snapchat',  lucide: 'ghost',               base: 'https://snapchat.com/add/', hint: '@handle' },
  { key: 'tiktok',    ar: 'تيك توك',   en: 'TikTok',    icon: '/images/Tiktok.svg',    base: 'https://tiktok.com/@',   hint: '@handle' },
  { key: 'youtube',   ar: 'يوتيوب',    en: 'YouTube',   icon: '/images/Youtube.svg',   base: 'https://youtube.com/',   hint: '@channel' },
  { key: 'facebook',  ar: 'فيسبوك',    en: 'Facebook',  icon: '/images/Facebook.svg',  base: 'https://facebook.com/',  hint: '@page' },
  { key: 'website',   ar: 'الموقع',    en: 'Website',   lucide: 'globe',               hint: 'example.com' },
];

/** The eight keys, for the legacy `social` object both writers still mirror. */
export const PLATFORM_KEYS = SOCIAL_PLATFORMS.map((p) => p.key);

/**
 * One entry in a showroom's link list.
 *
 * `label` and `icon` are optional because only CUSTOM entries carry them — a
 * known platform gets its name and mark from SOCIAL_PLATFORMS, so storing them
 * again would let the two disagree.
 */
export type SocialLink = {
  key: string;
  url: string;
  label?: string;
  icon?: string;
};

export const platform = (key: string) => SOCIAL_PLATFORMS.find((p) => p.key === key) ?? null;

/**
 * The marks a CUSTOM link may wear — a closed set, deliberately.
 *
 * Not a URL and not a class name. A seller who could point an icon at any
 * address would be putting a request to that address in every visitor's
 * browser, which is a tracking pixel however innocently it was meant; one who
 * could type a class name could break the row for everyone. Twelve marks cover
 * what a showroom actually links to, and every one of them is a lucide icon
 * both renderers already have.
 */
export const CUSTOM_ICONS = [
  'link', 'globe', 'message-circle', 'send', 'phone', 'mail',
  'map-pin', 'store', 'star', 'image', 'video', 'file-text',
];

export const DEFAULT_CUSTOM_ICON = 'link';

/** A showroom with forty links has a page nobody reads, and a mistake. */
export const MAX_SOCIAL_LINKS = 20;

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * What a link points at, or null when it points nowhere.
 *
 * A handle, a bare domain or a whole URL — sellers type all three and all three
 * are reasonable. Normalised HERE, on the way out, rather than refused on the
 * way in: a form that rejects "@alromaihcars" teaches the seller to fight it.
 *
 * WhatsApp is the exception that earns its own branch: wa.me wants digits with
 * a country code, and a Saudi seller types 05… — the same number with 966 in
 * place of the leading zero.
 */
export function socialHref(entry: { key?: string; url?: unknown } | null | undefined): string | null {
  const raw = clean(entry?.url);
  if (!raw) return null;

  if (entry?.key === 'whatsapp') {
    // A whole wa.me / chat link pasted in is already an address.
    if (/^https?:\/\//i.test(raw)) return encodeURI(raw);

    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    const intl = digits.startsWith('966') ? digits : digits.replace(/^0/, '966');
    return `https://wa.me/${intl}`;
  }

  if (/^https?:\/\//i.test(raw)) return encodeURI(raw);

  // mailto: and tel: are things a showroom legitimately links to, and neither
  // survives being prefixed with https://.
  if (/^(mailto:|tel:)/i.test(raw)) return encodeURI(raw);

  const handle = raw.replace(/^@/, '');
  const base = platform(String(entry?.key ?? ''))?.base;
  if (!base) return `https://${encodeURI(handle.replace(/^\/+/, ''))}`;

  return base + encodeURIComponent(handle);
}

/**
 * The showroom's links, in order, ready to render.
 *
 * Reads `social_links` and falls back to the legacy `social` object — so a
 * database where §29 has not run, or a showroom that has not saved since,
 * still shows its links rather than nothing.
 *
 * `settings.show_whatsapp` is honoured here rather than at each call site: it
 * is the seller's answer to "may buyers see this number", and a page that
 * prints it regardless makes that switch a lie.
 */
/** Just the parts of a vendor row this reads. */
export type SocialVendor = {
  settings?: { show_whatsapp?: boolean } | null;
  social_links?: unknown;
  social?: Record<string, unknown> | null;
};

export function socialLinksOf(vendor: SocialVendor | null | undefined, locale = 'ar') {
  const prefs = vendor?.settings ?? {};
  const showWhatsapp = prefs.show_whatsapp !== false;

  const stored = (Array.isArray(vendor?.social_links) ? vendor.social_links : null) as
    | SocialLink[]
    | null;

  const list: SocialLink[] = stored?.length
    ? stored
    : PLATFORM_KEYS
        .map((key) => ({ key, url: clean(vendor?.social?.[key]) }))
        .filter((e) => e.url);

  return list
    .map((entry) => {
      const p = platform(entry.key);
      const href = socialHref(entry);
      if (!href) return null;
      if (entry.key === 'whatsapp' && !showWhatsapp) return null;

      return {
        key: entry.key,
        // A custom link is called what the seller called it; a known platform
        // is called what the platform is called, whatever they typed.
        label: p ? (locale === 'ar' ? p.ar : p.en) : clean(entry.label) || (locale === 'ar' ? 'رابط' : 'Link'),
        href,
        icon: p?.icon ?? null,
        lucide:
          p?.lucide ??
          (p ? null : CUSTOM_ICONS.includes(entry.icon ?? '') ? entry.icon : DEFAULT_CUSTOM_ICON),
      };
    })
    .filter(Boolean);
}

/**
 * Validate what an editor posted, on the server.
 *
 * The editor is a convenience; this is the thing between a form and the
 * database. Every field is bounded: an unknown key becomes 'custom', an
 * unknown icon becomes the default, a label is trimmed to something a row can
 * hold, and the list is capped. Entries with no url are dropped rather than
 * stored — a blank row is the seller changing their mind, not data.
 */
export function parseSocialLinks(raw: unknown): SocialLink[] {
  let value: unknown = raw;

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try { value = JSON.parse(text); } catch { return []; }
  }

  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value
    .map((entry: unknown): SocialLink | null => {
      if (!entry || typeof entry !== 'object') return null;

      // Widened once, here: `raw` arrives from a form field or a jsonb column,
      // so nothing about its shape is known until each field is cleaned.
      const row = entry as { key?: unknown; url?: unknown; label?: unknown; icon?: unknown };

      const url = clean(row.url);
      if (!url) return null;

      const known = platform(String(row.key ?? ''));
      const key = known ? known.key : 'custom';

      const out: SocialLink = { key, url: url.slice(0, 300) };

      if (!known) {
        out.label = clean(row.label).slice(0, 40);
        out.icon = CUSTOM_ICONS.includes(row.icon as string)
          ? (row.icon as string)
          : DEFAULT_CUSTOM_ICON;
      }

      /* The same link twice is a mis-click, not two links. Custom entries are
         compared by url alone, so a showroom CAN have two Instagram accounts
         — that is the whole point of a list — while a double-tap on Save
         cannot produce two identical rows. */
      const fingerprint = `${key}:${out.label ?? ''}:${url.toLowerCase()}`;
      if (seen.has(fingerprint)) return null;
      seen.add(fingerprint);

      return out;
    })
    .filter((entry): entry is SocialLink => entry !== null)
    .slice(0, MAX_SOCIAL_LINKS);
}

/**
 * The legacy `social` object, rebuilt from a list.
 *
 * Written beside social_links by both actions so anything still reading the old
 * shape keeps working. Every key is present every time — a key left out would
 * keep last week's handle after the seller deleted the row.
 *
 * The first entry of each platform wins: the object cannot express two.
 */
export function legacySocialObject(links: SocialLink[] | null | undefined) {
  const out: Record<string, string | null> = Object.fromEntries(
    PLATFORM_KEYS.map((k) => [k, null]),
  );

  for (const entry of links ?? []) {
    if (out[entry.key] == null && PLATFORM_KEYS.includes(entry.key)) {
      out[entry.key] = entry.url;
    }
  }

  return out;
}
