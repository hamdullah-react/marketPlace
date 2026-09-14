import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import {
  Store, BadgeCheck, MapPin, Star, Car, Phone, Mail, CalendarDays,
  Clock, Globe, Ghost, Navigation, ShieldCheck, Building2, Tag,
  Search, Share2, Info, LayoutGrid, Percent, EyeOff,
} from 'lucide-react';
import { getVendorBySlug, getVendorStats } from '@/marketplace/db/queries/vendors';
import { getLiveListingCards } from '@/marketplace/db/queries/listings';
import { getVendorOffers } from '@/marketplace/db/queries/seller';
import { getCardSpecs } from '@/marketplace/db/queries/specs';
import { normalizeListing, localized, formatPrice } from '@/marketplace/lib/listing';
import { shapeOffer } from '@/marketplace/lib/offer';
import ListingCard from '../../../_components/ListingCard';
import { CarGridSkeleton } from '../../../_components/Skeletons';
import { getSavedIds } from '@/marketplace/db/queries/account';
import { getUser, getViewer } from '@/marketplace/auth/session';
import { getVendorMedia } from '@/marketplace/db/queries/media';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import PhotoEditButton from './_components/PhotoEditButton';
import EditSection from './_components/EditSection';
import { socialLinksOf, PLATFORM_KEYS } from '@/marketplace/lib/social';
import { SocialIcon } from '@/app/[locale]/marketplace/(seller)/_components/SocialLinksEditor';
import RichTextRender, { hasRichText } from './_components/RichTextRender';

/**
 * This route's params are not known at build time, so under cacheComponents
 * the shell cannot be prerendered without blocking. Same reason, same fix as
 * listing/[slug]: route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

/**
 * One showroom's storefront.
 *
 * ── Tabs, and why they are LINKS ────────────────────────────────────────────
 *
 * The page is a channel: an identity that never moves, and panels underneath it
 * — cars, offers, about, location. Radix's Tabs would make that a client-side
 * toggle, which costs the two things this page most needs: every panel's data
 * would have to be fetched and shipped whether or not it is looked at, and a
 * tab would have no URL, so "here are our offers" could not be sent to anybody.
 * A tab is a place. So each one is a `?tab=` link, rendered on the server, and
 * only the open panel is queried.
 *
 * ── The seller edits it HERE ────────────────────────────────────────────────
 *
 * Every card carries a pencil for a member of this showroom. It writes the same
 * columns as Settings and revalidates both pages, so the two screens can never
 * be showing different answers. Nothing about editing is visible to a visitor —
 * see `canEdit`, which is false with no session and costs an anonymous visitor
 * no query at all.
 */

/* Owner-only, so it is not in the public tab list. */
const SEO_TAB = 'seo';

/** The store preferences, defaulted — read before `prefs` is in scope. */
const prefsOf = (vendor) => vendor?.settings ?? {};

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const vendor = await getVendorBySlug(slug).catch(() => null);

  if (!vendor) return { title: 'Showroom' };

  /**
   * The showroom’s own words, in the language being read.
   *
   * ── The fallback is the SELLER’S decision ────────────────────────────
   *
   * Settings offers "fall back to the other language" and stores it as
   * settings.locale_fallback. Nothing read it: localized() always falls back,
   * so a showroom that deliberately turned it off — because their English
   * copy is not ready, or because they sell only to Arabic speakers — still
   * had their Arabic shown to English visitors. A switch that changes nothing
   * is worse than no switch: the seller believes they have decided.
   *
   * With it off, a missing translation is simply absent, and every card on
   * this page already knows how to skip a blank.
   *
   * The NAME is the one exception, and it is deliberate: an h1 with nothing in
   * it is a broken page rather than a translation choice, and the URL the
   * visitor followed says a showroom is here.
   */
  const fallback = prefsOf(vendor).locale_fallback !== false;
  const say = (value) => (fallback ? localized(value, locale) : (value?.[locale] ?? ''));

  const name = localized(vendor.name, locale);
  const bio = say(vendor.bio);

  /**
   * The seller's own words first, then the generated fallback.
   *
   * schema.sql §27. Blank means "work it out", which is what this did before
   * the panel existed — so a showroom that never opens it is no worse off, and
   * one that does gets the search result it wrote.
   */
  const metaTitle = say(vendor.meta_title);
  const metaDescription = say(vendor.meta_description);

  const fallbackDescription =
    bio ||
    (locale === 'ar'
      ? `سيارات ${name}${vendor.city ? ` في ${vendor.city}` : ''} على سوق الرميح.`
      : `Cars from ${name}${vendor.city ? ` in ${vendor.city}` : ''} on Alromaih Marketplace.`);

  const title = metaTitle || name;
  const description = metaDescription || fallbackDescription;
  const image = vendor.og_image_url || vendor.banner_url || vendor.logo_url;

  /**
   * Each layer falls back to the one above it, never to nothing.
   *
   * A share card with no title because the seller filled in only the search
   * title is worse than one that reuses it — every blank here means "use what
   * you already know", which is what makes the whole panel optional.
   */
  const ogTitle = say(vendor.og_title) || title;
  const ogDescription = say(vendor.og_description) || description;
  const twitterImage = vendor.twitter_image_url || image;

  /* A keyword list is not prose: an Arabic phrase in an English page’s
     keywords does no harm and helps a bilingual search. It still obeys the
     switch, because a showroom that said "do not show my other language"
     meant it. */
  const keywords = fallback
    ? (vendor.meta_keywords?.[locale] ?? vendor.meta_keywords?.ar ?? vendor.meta_keywords?.en)
    : vendor.meta_keywords?.[locale];
  const focus = say(vendor.focus_keyword);

  return {
    title,
    description,

    /* The focus phrase leads: it is the one thing this page is meant to win,
       and a keyword list that does not contain it says the seller has not
       decided. Deduplicated, because they usually type it in both places. */
    keywords: focus || keywords?.length
      ? [...new Set([focus, ...(keywords ?? [])].filter(Boolean))]
      : undefined,

    alternates: vendor.canonical_url ? { canonical: vendor.canonical_url } : undefined,

    /**
     * Two independent instructions. The columns default to true and are
     * undefined entirely on a database without §27, so only an explicit false
     * changes anything — a showroom that has never opened the panel is indexed
     * exactly as it was.
     */
    robots:
      vendor.seo_index === false || vendor.seo_follow === false
        ? { index: vendor.seo_index !== false, follow: vendor.seo_follow !== false }
        : undefined,

    openGraph: {
      type: vendor.og_type || 'profile',
      title: ogTitle,
      description: ogDescription,
      images: image ? [image] : undefined,
    },

    twitter: {
      card: vendor.twitter_card || 'summary_large_image',
      title: say(vendor.twitter_title) || ogTitle,
      description: say(vendor.twitter_description) || ogDescription,
      images: twitterImage ? [twitterImage] : undefined,
    },
  };
}

export default async function VendorPage({ params, searchParams }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const vendor = await getVendorBySlug(slug).catch(() => null);

  // getVendorBySlug filters on state='approved', so a suspended showroom is a
  // 404 here rather than a page explaining itself to the public. Whose fault
  // the suspension was is between the seller and staff.
  if (!vendor) notFound();

  /* The seller's own switch, honoured — see the long note in generateMetadata
     above. Declared here as well because the two run independently: metadata is
     generated in its own call with its own scope. */
  const fallback = prefsOf(vendor).locale_fallback !== false;
  const say = (value) => (fallback ? localized(value, locale) : (value?.[locale] ?? ''));

  /* The name keeps localized() whatever the switch says: an h1 with nothing in
     it is a broken page, not a translation choice. */
  const name = localized(vendor.name, locale);
  const bio = say(vendor.bio);

  /* The long-form About page (§28), in the language being read. */
  const story = fallback
    ? (vendor.about?.[locale] ?? vendor.about?.ar ?? vendor.about?.en ?? null)
    : (vendor.about?.[locale] ?? null);
  const stats = await getVendorStats(vendor.id).catch(() => ({ liveListings: 0, completedOrders: 0 }));

  /**
   * May the person looking at this page change it?
   *
   * A member of THIS showroom, or staff. Cheap for the visitor it does not
   * concern: with no session cookie getViewer() returns null without asking
   * the database anything.
   *
   * This decides what is DRAWN, which is a matter of not offering what would be
   * refused. The refusal itself lives in the action — a button that is not on
   * the page is not access control.
   */
  const viewer = await getViewer();
  const canEdit = Boolean(viewer && (viewer.isStaff || viewer.vendorIds.includes(vendor.id)));

  /**
   * The media library, read only for the person who can open it — a visitor
   * pays for neither the query nor the component.
   *
   * `.items`, not the result object: getVendorMedia is paged and returns
   * { items, total }. Passing the whole thing in got as far as opening the
   * dialog and then threw "assets.filter is not a function" inside the gallery,
   * which quite reasonably expects an array.
   */
  const assets = canEdit
    ? await getVendorMedia(vendor.id, { limit: 100 })
        .then((r) => r.items ?? [])
        .catch(() => [])
    : [];

  const sp = await searchParams;
  const wantedTab = String(sp?.tab ?? 'home');

  /* ── The tab bar ────────────────────────────────────────────────────────
     Cars is not a tab of its own: the home panel IS the cars, the way a
     channel opens on its videos. Offers only appears when there are offers —
     an empty tab is a promise the showroom did not make.
     ------------------------------------------------------------------- */
  const soc = vendor.social ?? {};
  const prefs = vendor.settings ?? {};
  const addr = vendor.address ?? {};
  const hours = vendor.working_hours ?? {};
  const pol = vendor.policies ?? {};

  // Read once, on every tab: the count decides whether Offers is offered at
  // all, and the panel needs the rows anyway.
  const liveOffers = await getVendorOffers(vendor.id)
    .then((rows) =>
      (rows ?? [])
        .map((o) => ({ offer: o, listing: o.listings, shaped: shapeOffer(o, o.listings?.price) }))
        .filter((r) => r.shaped && r.listing?.state === 'live')
    )
    .catch(() => []);

  const TABS = [
    { key: 'home', label: t('السيارات', 'Cars'), Icon: LayoutGrid },
    liveOffers.length ? { key: 'offers', label: t('العروض', 'Offers'), Icon: Percent } : null,
    { key: 'about', label: t('عن المعرض', 'About'), Icon: Info },
    { key: 'location', label: t('الموقع', 'Location'), Icon: MapPin },
    // Only the showroom sees this one, and only they can reach it: the panel
    // itself is rendered behind the same check.
    canEdit ? { key: SEO_TAB, label: t('الظهور في البحث', 'Search & SEO'), Icon: Search } : null,
  ].filter(Boolean);

  const tab = TABS.some((x) => x.key === wantedTab) ? wantedTab : 'home';
  const tabHref = (key) =>
    `/${locale}/marketplace/vendors/${vendor.slug}${key === 'home' ? '' : `?tab=${key}`}`;

  // `!== false`, not a truthiness test: a showroom saved before these toggles
  // existed has no value stored at all, and Settings defaults both to on.
  const showPhone = prefs.show_phone !== false;
  const showWhatsapp = prefs.show_whatsapp !== false;

  /**
   * The links this showroom decided to show, in the order it decided.
   *
   * Built by src/marketplace/lib/social.js, which is also what the two
   * editors and both actions use — the eight-key version of this lived here,
   * in the Settings action and in the storefront action at the same time, and
   * a key present in one list and missing from another was a field a seller
   * filled in and never saw again.
   *
   * It also answers the show_whatsapp toggle, so the number a seller switched
   * off in Settings cannot appear here.
   */
  const socials = socialLinksOf(vendor, locale);

  const addressLine = [
    say(addr.street),
    say(addr.district),
    addr.building,
    vendor.city,
    addr.postal_code,
  ]
    .filter(Boolean)
    .join(t('، ', ', '));

  // The seller's own map link when they saved one, and a pin from the
  // coordinates when they saved those instead.
  const mapHref =
    addr.map_url ||
    (addr.lat && addr.lng
      ? `https://www.google.com/maps/search/?api=1&query=${addr.lat},${addr.lng}`
      : null);

  const openingHours = [
    hours.weekdays ? [t('الأحد – الخميس', 'Sunday – Thursday'), hours.weekdays] : null,
    hours.weekend ? [t('الجمعة والسبت', 'Friday & Saturday'), hours.weekend] : null,
    hours.closed ? [t('إجازة', 'Closed'), hours.closed] : null,
  ].filter(Boolean);

  const policyNotes = [
    pol.returns_days > 0
      ? [t('الإرجاع', 'Returns'), t(`خلال ${pol.returns_days} يوم`, `Within ${pol.returns_days} days`)]
      : null,
    pol.warranty ? [t('الضمان', 'Warranty'), pol.warranty] : null,
    say(pol.shipping) ? [t('التوصيل', 'Delivery'), say(pol.shipping)] : null,
    say(pol.returns) ? [t('سياسة الإرجاع', 'Returns policy'), say(pol.returns)] : null,
    say(pol.terms) ? [t('الشروط', 'Terms'), say(pol.terms)] : null,
  ].filter(Boolean);

  // A commercial registration and a VAT number are what tell a buyer this is a
  // registered business rather than somebody with a phone. Both are public
  // identifiers — they are printed on every invoice the showroom issues.
  const registration = [
    vendor.cr_number ? [t('السجل التجاري', 'CR number'), vendor.cr_number] : null,
    vendor.vat_number ? [t('الرقم الضريبي', 'VAT number'), vendor.vat_number] : null,
  ].filter(Boolean);

  /* ── The seller writes in ONE language, usually ──────────────────────────
     vendors.settings.default_locale is the preference the whole dashboard
     already obeys — the listing form, the catalog and the offers all render
     one language or both from it (see fieldMode in _apicalls/formData.js).
     These dialogs ignored it and asked for Arabic AND English every time,
     which is two boxes to fill for every one thing a showroom wanted to say.

     The action does the other half: a language that was not on the form is
     left alone rather than written as empty, so showing one language cannot
     delete the other (see i18nFrom in _actions/storefront.js).
     ------------------------------------------------------------------- */
  /* `?? locale`, not `?? 'both'` — the same fallback SettingsForm uses
     (SettingsForm.jsx:162): a showroom with no preference saved yet authors in
     whatever language they are already reading, rather than being handed two
     boxes for everything. Matching it matters more than the default itself,
     because the two screens edit the same columns. */
  const fieldMode = ['ar', 'en', 'both'].includes(prefs.default_locale)
    ? prefs.default_locale
    : locale;
  const LANGS = fieldMode === 'both' ? ['ar', 'en'] : [fieldMode];

  /**
   * One bilingual value, as the rest of the dashboard writes one.
   *
   * A box in the language the seller works in, with a "Both" popup behind it
   * when they work in both — the shared BilingualField, which is what the
   * listing form, the catalog and Settings all use. These dialogs edit the
   * SAME columns Settings edits, so a second pattern for the same data would
   * mean the showroom name is typed one way on one screen and another way on
   * the next.
   *
   * It posts `${base}Ar` and `${base}En` in every mode, seeded from what is
   * stored — so a language that is not on screen is written back unchanged
   * rather than blanked.
   *
   * `values` is the stored {ar, en}; `labelAr` / `labelEn` name each language
   * and are only used where the two really are separate fields — see the
   * keyword branch below.
   */
  const pair = (base, { values, labelAr, labelEn, label, type, placeholder, ...rest }) => {
    /* A chip list is the one thing that cannot fold into a single box: it has
       no DOM value to show behind a popup. So keywords stay one block per
       language, which is exactly what the listing form does with the same
       field (ListingForm.jsx, "Meta keywords"). */
    if (type === 'keywords') {
      return LANGS.map((lang) => ({
        ...rest,
        type,
        name: `${base}${lang === 'ar' ? 'Ar' : 'En'}`,
        label: fieldMode === 'both' ? (lang === 'ar' ? labelAr : labelEn) : (label ?? labelAr ?? labelEn),
        dir: lang === 'ar' ? 'rtl' : 'ltr',
        placeholder,
        defaultValue: values?.[lang] ?? [],
        /* Said once, under the last box, rather than twice. */
        hint: lang === LANGS[LANGS.length - 1] ? rest.hint : undefined,
      }));
    }

    return [
      {
        ...rest,
        name: base,
        type: 'bilingual',
        mode: fieldMode,
        textarea: type === 'textarea',
        label: label ?? labelAr ?? labelEn,
        ar: values?.ar ?? '',
        en: values?.en ?? '',
        /* One placeholder serves both boxes — every caller that sets one is
           showing what the field falls back to, which is the same either way.
           BilingualField supplies "In English" / "بالعربية" otherwise. */
        phAr: placeholder,
        phEn: placeholder,
      },
    ];
  };

  /* ── What each pencil opens ─────────────────────────────────────────────
     Field lists, not forms: EditSection renders them and posts them to
     saveStorefrontSection, which writes the same columns Settings writes.
     Declared here, beside the values they edit, so a field and the thing it
     changes are read together.
     ------------------------------------------------------------------- */
  const editors = canEdit
    ? {
        about: [
          ...pair('name', {
            values: vendor.name,
            label: t('اسم المعرض', 'Showroom name'),
            labelAr: t('الاسم بالعربية', 'Name in Arabic'),
            labelEn: t('الاسم بالإنجليزية', 'Name in English'),
            maxLength: 80,
          }),
          ...pair('bio', {
            values: vendor.bio,
            type: 'textarea',
            rows: 3,
            maxLength: 300,
            label: t('نبذة قصيرة', 'Short description'),
            labelAr: t('نبذة بالعربية', 'Short description, in Arabic'),
            labelEn: t('نبذة بالإنجليزية', 'Short description, in English'),
            hint: t(
              'سطر أو سطران — يظهران أيضاً في نتائج البحث.',
              'A line or two — this doubles as the search-result description.'
            ),
          }),
        ],

        /* The long form. Its own dialog because an editor needs the room, and
           its own section because it writes a different column. */
        story: [
          {
            name: 'about',
            type: 'richtext',
            label: t('المحتوى', 'Content'),
            hint: t(
              'عناوين وقوائم وصور — اكتب صفحة كاملة عن المعرض.',
              'Headings, lists and pictures — write a full page about the showroom.'
            ),
            /* One editor per language, shown one at a time. A page of Arabic
               stacked on a page of English is a dialog you scroll rather than
               write in — and unlike a name or a description, there is nothing
               to compare side by side here. Both stay mounted, so switching
               tabs keeps what was typed in the other one. */
            langs: LANGS.map((lang) => ({
              lang,
              name: lang === 'ar' ? 'aboutAr' : 'aboutEn',
              label: lang === 'ar' ? t('العربية', 'Arabic') : t('الإنجليزية', 'English'),
              dir: lang === 'ar' ? 'rtl' : 'ltr',
              value: vendor.about?.[lang] ?? null,
            })),
          },
        ],

        contact: [
          { name: 'contactPhone', label: t('رقم الجوال', 'Mobile number'), defaultValue: vendor.contact_phone ?? '', dir: 'ltr', placeholder: '05xxxxxxxx' },
          { name: 'contactEmail', label: t('البريد الإلكتروني', 'Email'), defaultValue: vendor.contact_email ?? '', dir: 'ltr' },
          { name: 'showPhone', label: t('إظهار رقم الجوال للمشترين', 'Show the phone number to buyers'), type: 'switch', defaultValue: showPhone },
          { name: 'showWhatsapp', label: t('إظهار واتساب', 'Show WhatsApp'), type: 'switch', defaultValue: showWhatsapp },
        ],

        /* One control, not eight boxes: the seller adds, names, ranks and
           deletes their own links. Seeded from the stored list, falling back
           to the legacy object for a showroom that has not saved since. */
        social: [
          {
            name: 'socialLinks',
            type: 'sociallinks',
            defaultValue: vendor.social_links?.length
              ? vendor.social_links
              : PLATFORM_KEYS.filter((k) => String(soc[k] ?? '').trim()).map((k) => ({ key: k, url: soc[k] })),
          },
        ],

        address: [
          { name: 'city', label: t('المدينة', 'City'), defaultValue: vendor.city ?? '' },
          ...pair('district', {
            values: addr.district,
            label: t('الحي', 'District'),
            labelAr: t('الحي بالعربية', 'District in Arabic'),
            labelEn: t('الحي بالإنجليزية', 'District in English'),
          }),
          ...pair('street', {
            values: addr.street,
            label: t('الشارع', 'Street'),
            labelAr: t('الشارع بالعربية', 'Street in Arabic'),
            labelEn: t('الشارع بالإنجليزية', 'Street in English'),
          }),
          { name: 'building', label: t('رقم المبنى', 'Building'), defaultValue: addr.building ?? '', dir: 'ltr' },
          { name: 'postalCode', label: t('الرمز البريدي', 'Postal code'), defaultValue: addr.postal_code ?? '', dir: 'ltr' },
          {
            name: 'mapUrl',
            label: t('رابط الخريطة', 'Map link'),
            defaultValue: addr.map_url ?? '',
            dir: 'ltr',
            hint: t('الصق رابط الموقع من خرائط جوجل.', 'Paste the place link from Google Maps.'),
          },
        ],

        hours: [
          { name: 'hoursWeekdays', label: t('الأحد – الخميس', 'Sunday – Thursday'), defaultValue: hours.weekdays ?? '', placeholder: '9:00 - 21:00' },
          { name: 'hoursWeekend', label: t('الجمعة والسبت', 'Friday & Saturday'), defaultValue: hours.weekend ?? '', placeholder: '16:00 - 22:00' },
          { name: 'hoursClosed', label: t('إجازة', 'Closed'), defaultValue: hours.closed ?? '' },
        ],

        policies: [
          { name: 'returnsDays', label: t('أيام الإرجاع', 'Returns window, in days'), type: 'number', defaultValue: pol.returns_days ?? 0 },
          { name: 'warranty', label: t('الضمان', 'Warranty'), defaultValue: pol.warranty ?? '' },
          ...pair('shipping', {
            values: pol.shipping,
            type: 'textarea',
            label: t('التوصيل', 'Delivery'),
            labelAr: t('التوصيل بالعربية', 'Delivery, in Arabic'),
            labelEn: t('التوصيل بالإنجليزية', 'Delivery, in English'),
          }),
          ...pair('returns', {
            values: pol.returns,
            type: 'textarea',
            label: t('سياسة الإرجاع', 'Returns policy'),
            labelAr: t('سياسة الإرجاع بالعربية', 'Returns policy, in Arabic'),
            labelEn: t('سياسة الإرجاع بالإنجليزية', 'Returns policy, in English'),
          }),
          ...pair('terms', {
            values: pol.terms,
            type: 'textarea',
            label: t('الشروط', 'Terms'),
            labelAr: t('الشروط بالعربية', 'Terms, in Arabic'),
            labelEn: t('الشروط بالإنجليزية', 'Terms, in English'),
          }),
        ],

        business: [
          { name: 'crNumber', label: t('السجل التجاري', 'CR number'), defaultValue: vendor.cr_number ?? '', dir: 'ltr', hint: t('١٠ أرقام', '10 digits') },
          { name: 'vatNumber', label: t('الرقم الضريبي', 'VAT number'), defaultValue: vendor.vat_number ?? '', dir: 'ltr', hint: t('١٥ رقماً', '15 digits') },
        ],

        /* ── The whole search surface ────────────────────────────────────
           Grouped the way the listing form groups it: the result, the words
           it should be found by, the share card, then the technical
           switches. Sixteen boxes in one flat column is a dialog nobody
           finishes reading.
           --------------------------------------------------------- */
        seo: [
          {
            name: 'headSearch',
            type: 'heading',
            label: t('نتيجة البحث', 'The search result'),
            hint: t('العنوان الأزرق والسطران تحته في جوجل.', 'The blue title and the two grey lines under it in Google.'),
          },
          ...pair('metaTitle', {
            values: vendor.meta_title,
            maxLength: 60,
            placeholder: name,
            label: t('عنوان البحث', 'Search title'),
            labelAr: t('عنوان البحث بالعربية', 'Search title, in Arabic'),
            labelEn: t('عنوان البحث بالإنجليزية', 'Search title, in English'),
            hint: t('حتى ٦٠ حرفاً. فارغ = اسم المعرض.', 'Up to 60 characters. Blank = the showroom name.'),
          }),
          ...pair('metaDescription', {
            values: vendor.meta_description,
            type: 'textarea',
            rows: 3,
            maxLength: 160,
            label: t('وصف البحث', 'Search description'),
            labelAr: t('وصف البحث بالعربية', 'Search description, in Arabic'),
            labelEn: t('وصف البحث بالإنجليزية', 'Search description, in English'),
            hint: t('حتى ١٦٠ حرفاً. فارغ = النبذة.', 'Up to 160 characters. Blank = the short description.'),
          }),

          {
            name: 'headKeywords',
            type: 'heading',
            label: t('الكلمات المفتاحية', 'Keywords'),
            hint: t('العبارات التي يبحث بها المشتري فعلاً.', 'The phrases a buyer would actually type.'),
          },
          ...pair('metaKeywords', {
            /* A tag box, the same one the listing form uses. Stored as a list
               per language (§27), so the field is a list too — a comma-
               separated line asks the seller to do the parsing in their head
               and gives them nothing to point at when one is wrong. */
            values: {
              ar: vendor.meta_keywords?.ar ?? [],
              en: vendor.meta_keywords?.en ?? [],
            },
            type: 'keywords',
            label: t('الكلمات المفتاحية', 'Keywords'),
            labelAr: t('الكلمات بالعربية', 'Keywords in Arabic'),
            labelEn: t('الكلمات بالإنجليزية', 'Keywords in English'),
            placeholder: t('معرض سيارات الرياض', 'car showroom Riyadh'),
            hint: t('اكتب عبارة واضغط Enter.', 'Type a phrase and press Enter.'),
          }),
          ...pair('focusKeyword', {
            values: vendor.focus_keyword,
            label: t('الكلمة الرئيسية', 'Focus keyword'),
            labelAr: t('الكلمة الرئيسية بالعربية', 'Focus keyword, in Arabic'),
            labelEn: t('الكلمة الرئيسية بالإنجليزية', 'Focus keyword, in English'),
            hint: t('العبارة الواحدة التي تريد أن تظهر بها هذه الصفحة.', 'The one phrase you want this page to be found by.'),
          }),

          {
            name: 'headShare',
            type: 'heading',
            label: t('بطاقة المشاركة (Open Graph)', 'Share card (Open Graph)'),
            hint: t(
              'ما يظهر عند مشاركة الرابط في واتساب أو X. فارغ = عنوان ووصف البحث أعلاه.',
              'What appears when the link is shared on WhatsApp or X. Blank = the search title and description above.'
            ),
          },
          ...pair('ogTitle', {
            values: vendor.og_title,
            label: t('عنوان البطاقة', 'Card title'),
            labelAr: t('عنوان البطاقة بالعربية', 'Card title, in Arabic'),
            labelEn: t('عنوان البطاقة بالإنجليزية', 'Card title, in English'),
          }),
          ...pair('ogDescription', {
            values: vendor.og_description,
            type: 'textarea',
            rows: 2,
            label: t('وصف البطاقة', 'Card description'),
            labelAr: t('وصف البطاقة بالعربية', 'Card description, in Arabic'),
            labelEn: t('وصف البطاقة بالإنجليزية', 'Card description, in English'),
          }),
          {
            name: 'ogImageUrl',
            type: 'image',
            defaultValue: vendor.og_image_url ?? '',
            label: t('صورة المشاركة', 'Share image'),
            hint: t('عريضة ١٢٠٠×٦٣٠. فارغة = صورة الغلاف.', 'Wide, 1200×630. Blank = the cover photo.'),
          },
          {
            name: 'twitterCard',
            type: 'select',
            defaultValue: vendor.twitter_card ?? 'summary_large_image',
            label: t('شكل بطاقة X', 'X card shape'),
            options: [
              { value: 'summary_large_image', label: t('صورة كبيرة', 'Large image') },
              { value: 'summary', label: t('صورة صغيرة', 'Small image') },
            ],
          },
          ...pair('twitterTitle', {
            values: vendor.twitter_title,
            label: t('عنوان X', 'X title'),
            labelAr: t('عنوان X بالعربية', 'X title, in Arabic'),
            labelEn: t('عنوان X بالإنجليزية', 'X title, in English'),
            hint: t('فارغ = عنوان البطاقة أعلاه.', 'Blank = the card title above.'),
          }),
          ...pair('twitterDescription', {
            values: vendor.twitter_description,
            type: 'textarea',
            rows: 2,
            label: t('وصف X', 'X description'),
            labelAr: t('وصف X بالعربية', 'X description, in Arabic'),
            labelEn: t('وصف X بالإنجليزية', 'X description, in English'),
          }),
          {
            name: 'twitterImageUrl',
            type: 'image',
            defaultValue: vendor.twitter_image_url ?? '',
            label: t('صورة X', 'X image'),
            hint: t('فارغة = صورة المشاركة أعلاه.', 'Blank = the share image above.'),
          },

          {
            name: 'headIndexing',
            type: 'heading',
            label: t('الفهرسة وخريطة الموقع', 'Indexing & sitemap'),
            hint: t('اتركها كما هي ما لم يكن لديك سبب.', 'Leave these alone unless you have a reason.'),
          },
          {
            name: 'seoIndex',
            type: 'switch',
            defaultValue: vendor.seo_index !== false,
            label: t('السماح لمحركات البحث بإظهار الصفحة', 'Let search engines list this page'),
            hint: t('إيقافه يخفيها من جوجل فقط — تبقى ظاهرة في السوق.', 'Off hides it from Google only — it stays on the marketplace.'),
          },
          {
            name: 'seoFollow',
            type: 'switch',
            defaultValue: vendor.seo_follow !== false,
            label: t('تتبّع الروابط في الصفحة', 'Follow the links on this page'),
            hint: t('يتيح لمحركات البحث الوصول لسياراتك من هنا.', 'Lets search engines reach your cars from here.'),
          },
          {
            name: 'seoChangefreq',
            type: 'select',
            defaultValue: vendor.seo_changefreq ?? 'weekly',
            label: t('معدّل التحديث', 'How often it changes'),
            options: [
              { value: 'daily', label: t('يومياً', 'Daily') },
              { value: 'weekly', label: t('أسبوعياً', 'Weekly') },
              { value: 'monthly', label: t('شهرياً', 'Monthly') },
            ],
          },
          {
            name: 'seoPriority',
            type: 'select',
            defaultValue: String(vendor.seo_priority ?? 0.7),
            label: t('الأولوية', 'Priority'),
            options: [
              { value: '0.8', label: t('عالية', 'High') },
              { value: '0.7', label: t('عادية', 'Normal') },
              { value: '0.5', label: t('متوسطة', 'Medium') },
              { value: '0.3', label: t('منخفضة', 'Low') },
            ],
            hint: t('يخبران محركات البحث أي الصفحات تعاود زيارتها أولاً.', 'Both tell search engines which pages to revisit first.'),
          },
          {
            name: 'canonicalUrl',
            defaultValue: vendor.canonical_url ?? '',
            dir: 'ltr',
            label: t('الرابط الأساسي', 'Canonical URL'),
            hint: t(
              'اتركه فارغاً. غيّره فقط إذا كان لمعرضك موقع آخر يجب اعتباره الأصل.',
              'Leave it blank. Only set it if your showroom has another site that should count as the original.'
            ),
          },
        ],
      }
    : {};

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-14">
      {/* ── Banner ──────────────────────────────────────────────────────── */}
      <div className="relative h-40 overflow-hidden rounded-b-2xl bg-linear-to-br from-brand-primary/15 to-brand-light/40 sm:h-56 dark:from-[#1c1420] dark:to-[#221a26]">
        {vendor.banner_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={vendor.banner_url} alt="" className="h-full w-full object-cover" />
        ) : null}

        {/* `end-3`, not `right-3` — a logical inset flips itself in Arabic,
            which is this page's reading direction half the time. */}
        {canEdit ? (
          <div className="absolute bottom-3 end-3">
            <PhotoEditButton
              locale={locale}
              vendorId={vendor.id}
              field="banner"
              assets={assets}
              label={t('تغيير صورة الغلاف', 'Change cover photo')}
              hasPhoto={Boolean(vendor.banner_url)}
              removeLabel={t('إزالة صورة الغلاف', 'Remove cover photo')}
            />
          </div>
        ) : null}
      </div>

      {/* ── Identity ──────────────────────────────────────────────────────
          `relative` is doing real work here, not decoration.

          The banner above is `relative` (it has to be — the pencil is
          positioned inside it), and CSS paints POSITIONED elements above static
          ones regardless of document order. So the banner was painting over
          this block, and the showroom name — which the negative margin tucks
          right up against the banner edge — was sliced in half by it.
          ------------------------------------------------------------- */}
      <div className="relative px-1 sm:px-4">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md sm:h-28 sm:w-28 dark:border-[#0f0f0f] dark:bg-[#252525]">
            {vendor.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={vendor.logo_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <Store className="h-10 w-10 text-brand-primary" />
            )}

            {/* The same picker as the cover, on the same library tab: Settings
                files both photos under Photos, so opening this one on Logos
                would show an empty library to a seller whose logo is sitting in
                the other tab. */}
            {canEdit ? (
              <PhotoEditButton
                locale={locale}
                vendorId={vendor.id}
                field="logo"
                assets={assets}
                label={t('تغيير شعار المعرض', 'Change showroom logo')}
                hasPhoto={Boolean(vendor.logo_url)}
                removeLabel={t('إزالة الشعار', 'Remove logo')}
                /* Inside the tile, not hanging off it: the tile is
                   overflow-hidden, so a negative offset would be clipped. */
                className="absolute bottom-1 end-1 scale-75"
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-brand-primary sm:text-3xl">
              {name}
              {vendor.verified ? (
                <Badge className="gap-1 border-transparent bg-blue-50 text-blue-600 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {t('موثّق', 'Verified')}
                </Badge>
              ) : null}

              {canEdit ? (
                <EditSection
                  locale={locale}
                  vendorId={vendor.id}
                  section="about"
                  title={t('اسم المعرض والنبذة', 'Name and description')}
                  description={t('يظهران في أعلى الصفحة وفي نتائج البحث.', 'Shown at the top of this page and in search results.')}
                  fields={editors.about}
                />
              ) : null}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              {vendor.city ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {vendor.city}
                </span>
              ) : null}

              <span className="flex items-center gap-1.5 tabular-nums">
                <Car className="h-4 w-4" />
                {stats.liveListings} {t('سيارة معروضة', 'cars listed')}
              </span>

              {liveOffers.length ? (
                <span className="flex items-center gap-1.5 tabular-nums text-brand-primary">
                  <Tag className="h-4 w-4" />
                  {liveOffers.length} {t('عرض ساري', 'live offers')}
                </span>
              ) : null}

              {/* Only when somebody has actually rated them. "0.0 ★" reads as a
                  bad showroom rather than a new one. */}
              {vendor.rating_count > 0 ? (
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {Number(vendor.rating_avg).toFixed(1)}
                  <span className="text-xs">
                    ({vendor.rating_count} {t('تقييم', 'reviews')})
                  </span>
                </span>
              ) : null}

              {vendor.approved_at ? (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {t('على السوق منذ', 'On the marketplace since')}{' '}
                  {new Date(vendor.approved_at).getFullYear()}
                </span>
              ) : null}
            </div>
          </div>

          {/* Contact, when the showroom gave one AND chose to show it. A button
              that opens a blank dialer is worse than no button — and a number
              the seller switched off in Settings must not appear here. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">
            {showPhone && vendor.contact_phone ? (
              <Button asChild>
                <a href={`tel:${vendor.contact_phone}`}>
                  <Phone className="h-4 w-4" />
                  {t('اتصل', 'Call')}
                </a>
              </Button>
            ) : null}
            {vendor.contact_email ? (
              <Button asChild variant="outline">
                <a href={`mailto:${vendor.contact_email}`}>
                  <Mail className="h-4 w-4" />
                  {t('راسلنا', 'Email')}
                </a>
              </Button>
            ) : null}
            {canEdit ? (
              <EditSection
                locale={locale}
                vendorId={vendor.id}
                section="contact"
                title={t('بيانات التواصل', 'Contact details')}
                description={t('ما يظهر للمشتري، وما تختار إخفاءه.', 'What a buyer sees, and what you keep private.')}
                fields={editors.contact}
              />
            ) : null}
          </div>
        </div>

        {/* ── Social, straight from Settings ───────────────────────────
            BELOW the header row, not inside the name column, and that is not a
            cosmetic preference. The row is `sm:items-end`, so everything in
            that column is bottom-aligned against the logo — adding a line to it
            pushes the SHOWROOM NAME upwards, and with the row already pulled up
            by -mt-14 the name lands behind the banner. Which is exactly what
            happened.
            -------------------------------------------------------- */}
        {socials.length || canEdit ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {socials.map((s) => (
              <a
                key={s.key}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                title={s.label}
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 transition-colors hover:border-brand-primary dark:border-white/10"
              >
                <SocialIcon entry={s} className="h-[18px] w-[18px] text-brand-primary" />
              </a>
            ))}

            {canEdit ? (
              <EditSection
                locale={locale}
                vendorId={vendor.id}
                section="social"
                title={t('حسابات التواصل', 'Social accounts')}
                description={t('اترك أي حقل فارغاً لإخفاء أيقونته.', 'Leave a field blank to hide its icon.')}
                fields={editors.social}
                label={socials.length ? null : t('أضف حساباتك', 'Add your accounts')}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────
          Sticky, because the panel below can be long and losing the way back
          to the other tabs after two screens of cars is how a storefront turns
          into one page again. Scrolls sideways on a phone rather than wrapping
          into two rows, which is what a channel does.
          ------------------------------------------------------------- */}
      <div className="sticky top-0 z-20 mt-6 -mx-4 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 px-1 sm:px-4 dark:border-white/10">
          {TABS.map((x) => {
            const on = x.key === tab;

            return (
              <Link
                key={x.key}
                href={tabHref(x.key)}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  on
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <x.Icon className="h-4 w-4" />
                {x.label}
                {x.key === SEO_TAB ? (
                  <Badge variant="secondary" className="ms-1 h-5 px-1.5 text-[10px]">
                    {t('لك وحدك', 'Only you')}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-6 px-1 sm:px-4">
        {/* ── Cars ──────────────────────────────────────────────────────── */}
        {tab === 'home' ? (
          <Suspense fallback={<CarGridSkeleton count={6} />}>
            <Cars vendor={vendor} searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        ) : null}

        {/* ── Offers ────────────────────────────────────────────────────
            Read at the top of the page — the tab only exists when there is
            something in it, so the rows are already here.
            --------------------------------------------------------- */}
        {tab === 'offers' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveOffers.map(({ offer, listing, shaped }) => {
              const carName = localized(listing.name, locale) || listing.slug;
              const label = localized(offer.label, locale);

              return (
                <Card key={offer.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base leading-snug text-brand-primary">
                        <Link
                          href={`/${locale}/marketplace/listing/${listing.slug}`}
                          className="hover:underline"
                        >
                          {carName}
                        </Link>
                      </CardTitle>
                      <Badge className="shrink-0 border-transparent bg-red-600 text-white hover:bg-red-600 tabular-nums">
                        −{shaped.percent}%
                      </Badge>
                    </div>
                    {label ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Tag className="h-3.5 w-3.5" />
                        {label}
                      </p>
                    ) : null}
                  </CardHeader>

                  <CardContent>
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="text-lg font-bold text-brand-primary tabular-nums">
                        {formatPrice(shaped.price, locale)}
                      </span>
                      <span className="text-sm text-muted-foreground line-through tabular-nums">
                        {formatPrice(shaped.was, locale)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-green-700 tabular-nums dark:text-green-400">
                      {t('توفير', 'You save')} {formatPrice(shaped.saving, locale)}
                    </p>

                    {/* The end date is the part that makes an offer an offer.
                        Absent when the seller left it open-ended, which is a
                        real state and not missing data. */}
                    {shaped.endsAt ? (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {t('ينتهي', 'Ends')}{' '}
                        {new Date(shaped.endsAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* ── About ─────────────────────────────────────────────────────── */}
        {tab === 'about' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                  <Store className="h-4 w-4" />
                  {t('عن المعرض', 'About this showroom')}
                </CardTitle>
                {/* ONE pencil, and it edits what this card shows.
                    There were two side by side — the page content and the
                    name/bio pair — which is a choice a seller should not have
                    to make from two identical icons. The name and the short
                    description are edited from the pencil beside the showroom
                    name at the top, where they are actually printed. */}
                {canEdit ? (
                  <EditSection
                    locale={locale}
                    vendorId={vendor.id}
                    section="story"
                    title={t('صفحة المعرض', 'The About page')}
                    description={t(
                      'عناوين وقوائم وصور. الاسم والنبذة القصيرة تُحرَّر من القلم بجانب اسم المعرض في الأعلى.',
                      'Headings, lists and pictures. The name and short description are edited from the pencil beside the showroom name above.'
                    )}
                    fields={editors.story}
                    assets={assets}
                    label={hasRichText(story) ? null : t('اكتب صفحتك', 'Write your page')}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {/* ── The long form, then the short one ──────────────────
                    A showroom that has written a page gets its page; one that
                    has only the Settings paragraph gets that. The paragraph is
                    never shown UNDER the page — it is the same thing said
                    shorter, and printing both reads as a stutter.
                    ------------------------------------------------- */}
                {hasRichText(story) ? (
                  <RichTextRender doc={story} className="max-w-3xl" />
                ) : bio ? (
                  <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {bio}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {canEdit
                      ? t('لم تكتب شيئاً بعد — هذه أول ما يقرأه المشتري.', 'Nothing written yet — this is the first thing a buyer reads.')
                      : t('لم يكتب المعرض نبذة بعد.', 'This showroom has not written one yet.')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Policies. Skipped for a visitor when blank — a "Warranty"
                heading over nothing is worse than no heading — but always
                shown to the seller, because an empty card they can fill in is
                the only way they learn it exists. */}
            {policyNotes.length || canEdit ? (
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                    <ShieldCheck className="h-4 w-4" />
                    {t('الضمان والسياسات', 'Warranty & policies')}
                  </CardTitle>
                  {canEdit ? (
                    <EditSection
                      locale={locale}
                      vendorId={vendor.id}
                      section="policies"
                      title={t('الضمان والسياسات', 'Warranty & policies')}
                      fields={editors.policies}
                    />
                  ) : null}
                </CardHeader>
                <CardContent>
                  {policyNotes.length ? (
                    <dl className="space-y-3 text-sm">
                      {policyNotes.map(([term, value]) => (
                        <div key={term}>
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
                          <dd className="mt-0.5 whitespace-pre-line leading-relaxed text-gray-700 dark:text-gray-300">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('لم تُضف بعد.', 'Not filled in yet.')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {registration.length || canEdit ? (
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                    <Building2 className="h-4 w-4" />
                    {t('بيانات المنشأة', 'Business details')}
                  </CardTitle>
                  {canEdit ? (
                    <EditSection
                      locale={locale}
                      vendorId={vendor.id}
                      section="business"
                      title={t('بيانات المنشأة', 'Business details')}
                      description={t('تظهر للمشتري كإثبات أن المعرض منشأة مسجّلة.', 'Shown to buyers as proof this is a registered business.')}
                      fields={editors.business}
                    />
                  ) : null}
                </CardHeader>
                <CardContent>
                  {registration.length ? (
                    <dl className="space-y-2 text-sm">
                      {registration.map(([term, value]) => (
                        <div key={term} className="flex items-baseline justify-between gap-3">
                          <dt className="text-muted-foreground">{term}</dt>
                          <dd className="text-gray-700 tabular-nums dark:text-gray-300" dir="ltr">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('لم تُضف بعد.', 'Not filled in yet.')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        {/* ── Location ──────────────────────────────────────────────────── */}
        {tab === 'location' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                  <MapPin className="h-4 w-4" />
                  {t('العنوان', 'Address')}
                </CardTitle>
                {canEdit ? (
                  <EditSection
                    locale={locale}
                    vendorId={vendor.id}
                    section="address"
                    title={t('العنوان', 'Address')}
                    description={t('العنوان ورابط الخريطة اللذان يراهما المشتري.', 'The address and map link a buyer is given.')}
                    fields={editors.address}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {addressLine ? (
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{addressLine}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('لم يُضف عنوان بعد.', 'No address yet.')}
                  </p>
                )}

                {mapHref ? (
                  <>
                    <Separator className="my-4" />
                    <Button asChild variant="outline" size="sm">
                      <a href={mapHref} target="_blank" rel="noopener noreferrer">
                        <Navigation className="h-4 w-4" />
                        {t('الاتجاهات', 'Directions')}
                      </a>
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                  <Clock className="h-4 w-4" />
                  {t('أوقات العمل', 'Opening hours')}
                </CardTitle>
                {canEdit ? (
                  <EditSection
                    locale={locale}
                    vendorId={vendor.id}
                    section="hours"
                    title={t('أوقات العمل', 'Opening hours')}
                    fields={editors.hours}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {openingHours.length ? (
                  <dl className="space-y-2 text-sm">
                    {openingHours.map(([term, value]) => (
                      <div key={term} className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">{term}</dt>
                        <dd className="text-gray-700 tabular-nums dark:text-gray-300">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('لم تُضف أوقات العمل بعد.', 'No opening hours yet.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* ── Search & SEO — the showroom's own eyes only ────────────────
            Rendered behind canEdit, not merely hidden by CSS: a visitor's
            HTML never contains it. The tab is not in their tab list either,
            and reaching ?tab=seo by hand falls back to the cars.
            --------------------------------------------------------- */}
        {tab === SEO_TAB && canEdit ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                  <Search className="h-4 w-4" />
                  {t('الظهور في نتائج البحث', 'How this page appears in search')}
                </CardTitle>
                <EditSection
                  locale={locale}
                  vendorId={vendor.id}
                  section="seo"
                  title={t('الظهور في البحث', 'Search & SEO')}
                  description={t('اتركه فارغاً ليُكتب تلقائياً من بيانات المعرض.', 'Leave any field blank and it is written from the showroom itself.')}
                  fields={editors.seo}
                  assets={assets}
                />
              </CardHeader>

              <CardContent>
                {/* A result, drawn the way Google draws one. A seller cannot
                    judge a meta description from a text box — they can judge
                    it instantly from something that looks like the thing. */}
                <div className="rounded-lg border p-4">
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    alromaihcars.com › marketplace › vendors › {vendor.slug}
                  </p>
                  <p className="mt-1 truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">
                    {localized(vendor.meta_title, locale) || name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                    {localized(vendor.meta_description, locale) ||
                      bio ||
                      t(
                        `سيارات ${name}${vendor.city ? ` في ${vendor.city}` : ''} على سوق الرميح.`,
                        `Cars from ${name}${vendor.city ? ` in ${vendor.city}` : ''} on Alromaih Marketplace.`
                      )}
                  </p>
                </div>

                {/* ── The words it should be found by ──────────────────
                    Shown as chips rather than a comma string: a seller reads
                    "how many, and which" off a row of chips in a glance, and
                    off a line of commas not at all.
                    ----------------------------------------------- */}
                {(() => {
                  const focus = localized(vendor.focus_keyword, locale);
                  const list =
                    vendor.meta_keywords?.[locale] ??
                    vendor.meta_keywords?.ar ??
                    vendor.meta_keywords?.en ??
                    [];

                  if (!focus && !list.length) {
                    return (
                      <p className="mt-4 text-xs text-muted-foreground">
                        {t(
                          'لم تُضف كلمات مفتاحية بعد.',
                          'No keywords yet — add the phrases a buyer would type.'
                        )}
                      </p>
                    );
                  }

                  return (
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      {focus ? (
                        <Badge className="gap-1 border-transparent bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/10">
                          <Search className="h-3 w-3" />
                          {focus}
                        </Badge>
                      ) : null}
                      {list.map((k) => (
                        <Badge key={k} variant="secondary" className="font-normal">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  );
                })()}

                {/* ── What is actually being sent ──────────────────────
                    The four technical values, read back from the row rather
                    than from the form that wrote them — this is the panel
                    where "did that save?" gets answered.
                    ----------------------------------------------- */}
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-xs">
                  <dt className="text-muted-foreground">{t('الفهرسة', 'Indexing')}</dt>
                  <dd className="text-end" dir="ltr">
                    {vendor.seo_index === false ? 'noindex' : 'index'},{' '}
                    {vendor.seo_follow === false ? 'nofollow' : 'follow'}
                  </dd>

                  <dt className="text-muted-foreground">{t('خريطة الموقع', 'Sitemap')}</dt>
                  <dd className="text-end tabular-nums" dir="ltr">
                    {vendor.seo_changefreq ?? 'weekly'} · {vendor.seo_priority ?? 0.7}
                  </dd>

                  <dt className="text-muted-foreground">{t('الرابط الأساسي', 'Canonical')}</dt>
                  <dd className="truncate text-end" dir="ltr" title={vendor.canonical_url ?? ''}>
                    {vendor.canonical_url || t('هذه الصفحة', 'this page')}
                  </dd>
                </dl>

                {vendor.seo_index === false ? (
                  <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t(
                      'الصفحة مخفية عن محركات البحث حالياً. ما زالت تظهر داخل السوق.',
                      'This page is hidden from search engines. It is still on the marketplace.'
                    )}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-brand-primary">
                  <Share2 className="h-4 w-4" />
                  {t('صورة المشاركة', 'Share card')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vendor.og_image_url || vendor.banner_url || vendor.logo_url ? (
                  <div className="overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={vendor.og_image_url || vendor.banner_url || vendor.logo_url}
                      alt=""
                      className="aspect-[1.91/1] w-full bg-muted object-cover"
                    />
                    <div className="p-3">
                      {/* The same fallback chain generateMetadata uses: the
                          card's own words, then the search ones, then the
                          showroom. A preview that resolved it differently
                          would be a preview of nothing. */}
                      <p className="truncate text-sm font-medium">
                        {localized(vendor.og_title, locale) ||
                          localized(vendor.meta_title, locale) ||
                          name}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {localized(vendor.og_description, locale) ||
                          localized(vendor.meta_description, locale) ||
                          bio ||
                          ''}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                        alromaihcars.com
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('لا توجد صورة — أضف غلافاً أو صورة مشاركة.', 'No image yet — add a cover or a share image.')}
                  </p>
                )}

                <p className="mt-3 text-xs text-muted-foreground">
                  {t(
                    'هذه الصورة تظهر عند مشاركة رابط المعرض في واتساب وتويتر.',
                    'This is what appears when the showroom link is shared on WhatsApp or X.'
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── The car grid ───────────────────────────────────────────────────────────
   The same ListingCard the browse grid uses, fed by the same query with a
   vendorId filter. A second card design for showroom pages would be two things
   to keep in step for no gain.
   ------------------------------------------------------------------------ */

const PAGE_SIZE = 12;

async function Cars({ vendor, searchParams, locale, t }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);

  let items = [];
  let total = 0;
  try {
    ({ items, total } = await getLiveListingCards({
      vendorId: vendor.id,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        {t('تعذّر تحميل السيارات.', 'Could not load the cars.')}
      </p>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
        <Car className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 text-sm font-medium text-brand-primary">
          {t('لا توجد سيارات معروضة حالياً', 'No cars listed right now')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('عد لاحقاً — يضيف المعرض سياراته تباعاً.', 'Check back — showrooms add cars as they arrive.')}
        </p>
      </div>
    );
  }

  // One read for the whole grid, exactly as the browse page does it.
  const cardSpecs = await getCardSpecs(items.map((r) => r.id), locale).catch(() => new Map());

  // One read for the whole grid; null for a signed-out visitor, which is what
  // tells ListingCard to use localStorage instead of the table.
  const user = await getUser();
  const savedIds = user ? await getSavedIds(user.id) : null;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((row, i) => {
          const listing = normalizeListing(row, locale);
          return (
            <ListingCard
              key={listing.id}
              listing={listing}
              locale={locale}
              priority={i < 3}
              cardSpecs={cardSpecs.get(listing.id) ?? []}
              saved={savedIds ? savedIds.has(listing.id) : null}
            />
          );
        })}
      </div>

      {pageCount > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/marketplace/vendors/${vendor.slug}?page=${page - 1}`}>
                {t('السابق', 'Previous')}
              </Link>
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {t(`صفحة ${page} من ${pageCount}`, `Page ${page} of ${pageCount}`)}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/marketplace/vendors/${vendor.slug}?page=${page + 1}`}>
                {t('التالي', 'Next')}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
