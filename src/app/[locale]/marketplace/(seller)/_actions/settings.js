'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import {
  updateVendor, collectVendorData, getVendorDataCounts, DEFAULT_SETTINGS,
} from '@/marketplace/db/queries/settings';

/**
 * Store settings, backup, and account deletion.
 *
 * NO AUTH YET — vendorId arrives from the form. Every one of these needs
 * `await requireVendor()` in place of that before this goes near production;
 * `deleteAllData` in particular is currently callable for any vendor id.
 */

import { SHARED_BUCKET, vendorBucket } from '@/marketplace/media/bucket';
import { parseSocialLinks, legacySocialObject } from '@/marketplace/lib/social';

const BUCKET = SHARED_BUCKET;

/**
 * Backups live in their OWN, private bucket.
 *
 * They used to go to marketplace-media, which is public and images-only. That
 * was broken twice over: the bucket rejected application/json with a 415 so no
 * backup ever uploaded, and had it worked, a full vendor export — leads,
 * orders, reviews, all with buyer contact details — would
 * have been readable by anyone holding the public URL.
 */
const BACKUP_BUCKET = 'marketplace-backups';

/** Signed links expire; a backup URL must not be a permanent public handle. */
const BACKUP_URL_TTL_SECONDS = 60 * 60;

/**
 * Every action result carries a fresh token. useActionState holds the last
 * result forever, so without this the client cannot distinguish a new response
 * from the stale one left over from a previous submit — which is why a deleted
 * item's error stayed on screen.
 */
const stamp = () => Date.now() + Math.random();

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const bool = (fd, k) => fd.get(k) === 'on' || fd.get(k) === 'true';
const num = (fd, k) => {
  const v = str(fd, k);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** {ar, en}, with empty strings dropped so a blank field doesn't shadow a fallback. */
const i18n = (ar, en) => {
  const out = {};
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return out;
};

// ── profile ───────────────────────────────────────────────────────────────────

export async function saveStoreProfile(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  const nameAr = str(formData, 'nameAr');
  const nameEn = str(formData, 'nameEn');

  const errors = {};
  // At least one language, or the store has no name in any locale.
  if (!nameAr && !nameEn) errors.nameAr = 'NAME_REQUIRED';

  if (Object.keys(errors).length) return { ok: false, error: null, token: stamp(), errors };

  try {
    await updateVendor(vendorId, {
      name: i18n(nameAr, nameEn),
      bio: i18n(str(formData, 'bioAr'), str(formData, 'bioEn')),
      logo_url: str(formData, 'logoUrl') || null,
      banner_url: str(formData, 'bannerUrl') || null,
    });

    revalidatePath('/[locale]/marketplace/seller/settings', 'page');
    revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
    return { ok: true, error: null, errors: {}, token: stamp(), saved: 'profile' };
  } catch (err) {
    return { ok: false, error: err.message, errors: {}, token: stamp() };
  }
}

// ── contact + address ─────────────────────────────────────────────────────────

export async function saveContact(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  const email = str(formData, 'contactEmail');
  const phone = str(formData, 'contactPhone');

  const errors = {};
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.contactEmail = 'EMAIL_INVALID';
  }
  // Saudi mobile, with or without country code.
  if (phone && !/^(\+?966|0)?5\d{8}$/.test(phone.replace(/[\s-]/g, ''))) {
    errors.contactPhone = 'PHONE_INVALID';
  }
  if (Object.keys(errors).length) return { ok: false, error: null, token: stamp(), errors };

  /* Parsed on the server whatever the editor sent: it is a convenience for
     the seller, never the thing standing between a post and the database. */
  const socialLinks = parseSocialLinks(formData.get('socialLinks'));

  const lat = num(formData, 'lat');
  const lng = num(formData, 'lng');

  try {
    await updateVendor(vendorId, {
      contact_email: email || null,
      contact_phone: phone || null,
      city: str(formData, 'city') || null,
      address: {
        district: i18n(str(formData, 'districtAr'), str(formData, 'districtEn')),
        street: i18n(str(formData, 'streetAr'), str(formData, 'streetEn')),
        building: str(formData, 'building') || null,
        postal_code: str(formData, 'postalCode') || null,
        // Only store a pin when both halves are present; a lone latitude is
        // worse than none because a map will happily render it at sea.
        lat: lat != null && lng != null ? lat : null,
        lng: lat != null && lng != null ? lng : null,
        map_url: str(formData, 'mapUrl') || null,
      },
      /**
       * The showroom's own list of links (§29), and the legacy eight-key
       * object rebuilt from it so anything still reading `social` keeps
       * working. Written as a SET either way: a row the seller deleted has
       * to actually disappear rather than leave last week’s handle behind.
       */
      social_links: socialLinks,
      social: legacySocialObject(socialLinks),
    });

    revalidatePath('/[locale]/marketplace/seller/settings', 'page');
    /* The storefront prints every one of these — the address, the socials
       and the two show/hide toggles — and it is now editable from that side
       too, so the page a seller is about to look at must not be the version
       from before they pressed Save. */
    revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
    return { ok: true, error: null, errors: {}, token: stamp(), saved: 'contact' };
  } catch (err) {
    return { ok: false, error: err.message, errors: {}, token: stamp() };
  }
}

// ── business + policies ───────────────────────────────────────────────────────

export async function saveBusiness(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  const cr = str(formData, 'crNumber');
  const vat = str(formData, 'vatNumber');

  const errors = {};
  if (cr && !/^\d{10}$/.test(cr)) errors.crNumber = 'CR_INVALID';
  if (vat && !/^\d{15}$/.test(vat)) errors.vatNumber = 'VAT_INVALID';
  if (Object.keys(errors).length) return { ok: false, error: null, token: stamp(), errors };

  try {
    await updateVendor(vendorId, {
      cr_number: cr || null,
      vat_number: vat || null,
      policies: {
        returns_days: num(formData, 'returnsDays') ?? 0,
        warranty: str(formData, 'warranty') || null,
        shipping: i18n(str(formData, 'shippingAr'), str(formData, 'shippingEn')),
        returns: i18n(str(formData, 'returnsAr'), str(formData, 'returnsEn')),
        terms: i18n(str(formData, 'termsAr'), str(formData, 'termsEn')),
      },
      working_hours: {
        weekdays: str(formData, 'hoursWeekdays') || null,
        weekend: str(formData, 'hoursWeekend') || null,
        closed: str(formData, 'hoursClosed') || null,
      },
    });

    revalidatePath('/[locale]/marketplace/seller/settings', 'page');
    // Policies, opening hours and the registration numbers are all cards on
    // the storefront.
    revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
    return { ok: true, error: null, errors: {}, token: stamp(), saved: 'business' };
  } catch (err) {
    return { ok: false, error: err.message, errors: {}, token: stamp() };
  }
}

// ── localization + preferences ────────────────────────────────────────────────

export async function saveLocalization(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  const locale = str(formData, 'defaultLocale');
  if (!['ar', 'en', 'both'].includes(locale)) {
    return { ok: false, error: null, errors: { defaultLocale: 'LOCALE_INVALID' }, token: stamp() };
  }

  try {
    const db = getMarketplaceDb();
    const { data: current } = await db.from('vendors').select('settings').eq('id', vendorId).maybeSingle();

    await updateVendor(vendorId, {
      // Merge, never replace — a form posts only the fields it renders, and a
      // blind overwrite would silently drop every preference not on this tab.
      settings: {
        ...DEFAULT_SETTINGS,
        ...(current?.settings ?? {}),
        default_locale: locale,
        locale_fallback: bool(formData, 'localeFallback'),
        currency: str(formData, 'currency') || 'SAR',
        timezone: str(formData, 'timezone') || 'Asia/Riyadh',
        auto_expire_days: num(formData, 'autoExpireDays') ?? 90,
        show_phone: bool(formData, 'showPhone'),
        show_whatsapp: bool(formData, 'showWhatsapp'),
        notify: {
          leads: bool(formData, 'notifyLeads'),
          orders: bool(formData, 'notifyOrders'),
          reviews: bool(formData, 'notifyReviews'),
          payouts: bool(formData, 'notifyPayouts'),
        },
      },
    });

    revalidatePath('/[locale]/marketplace/seller/settings', 'page');
    return { ok: true, error: null, errors: {}, token: stamp(), saved: 'localization' };
  } catch (err) {
    return { ok: false, error: err.message, errors: {}, token: stamp() };
  }
}

// ── backup ────────────────────────────────────────────────────────────────────

/**
 * Exports the vendor's data to a JSON file in their own storage folder and
 * indexes it in vendor_backups.
 *
 * Stored under vendors/<id>/backups/ — the same ownership prefix as their
 * media, so one storage policy covers both once auth lands.
 */
export async function createBackup(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  try {
    const db = getMarketplaceDb();
    const payload = await collectVendorData(vendorId);

    const counts = Object.fromEntries(
      Object.entries(payload.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    );

    // NOT `stamp` — that is the token helper declared at module scope, and a
    // `const stamp` here shadowed it for the whole block. The success return
    // below then called stamp() on a string, threw "stamp is not a function",
    // and the catch reported failure for a backup that had actually been
    // uploaded and recorded. Every backup "failed" while working.
    const takenAt = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `vendors/${vendorId}/backups/backup-${takenAt}.json`;
    const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');

    const { error: upErr } = await db.storage
      .from(BACKUP_BUCKET).upload(path, body, { contentType: 'application/json', upsert: false });

    if (upErr) return { ok: false, error: 'BACKUP_UPLOAD_FAILED', detail: upErr.message, token: stamp() };

    // No public URL — the bucket is private. `url` stays null and downloads go
    // through a freshly signed link at click time.
    const { error: rowErr } = await db.from('vendor_backups').insert({
      vendor_id: vendorId,
      storage_path: path,
      url: null,
      size_bytes: body.length,
      contents: counts,
      note: str(formData, 'note') || null,
    });

    if (rowErr) {
      // Don't leave an unindexed object behind.
      await db.storage.from(BACKUP_BUCKET).remove([path]);
      return { ok: false, error: 'BACKUP_RECORD_FAILED', detail: rowErr.message, token: stamp() };
    }

    revalidatePath('/[locale]/marketplace/seller/settings', 'page');
    return { ok: true, error: null, token: stamp(), saved: 'backup', counts, size: body.length };
  } catch (err) {
    return { ok: false, error: err.message , token: stamp()};
  }
}

export async function deleteBackup(prevState, formData) {
  const id = str(formData, 'backupId');
  if (!id) return { ok: false, error: 'NOT_FOUND' , token: stamp()};

  // This one had no vendor at all — it deleted a backup by id alone, so any
  // caller could destroy any showroom's export. The row is now read WITH the
  // vendor and the delete is scoped by it, so a wrong id removes nothing.
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  try {
    const db = getMarketplaceDb();
    const { data: row } = await db
      .from('vendor_backups').select('storage_path')
      .eq('id', id).eq('vendor_id', vendorId).maybeSingle();

    if (!row) return { ok: false, error: 'NOT_FOUND', token: stamp() };

    if (row?.storage_path) await db.storage.from(BACKUP_BUCKET).remove([row.storage_path]);
    await db.from('vendor_backups').delete().eq('id', id).eq('vendor_id', vendorId);

    revalidatePath('/[locale]/marketplace/seller/settings', 'page');
    return { ok: true, error: null, token: stamp(), saved: 'backup-deleted' };
  } catch (err) {
    return { ok: false, error: err.message , token: stamp()};
  }
}

// ── restore ───────────────────────────────────────────────────────────────────

/**
 * Insert order matters: a child row is rejected while its parent is missing.
 * Vendors are handled separately (the row is updated, never re-inserted — it
 * is only ever soft-deleted, so it still exists).
 */
const RESTORE_ORDER = [
  'listings',
  'listing_variants',
  'listing_specs',
  'media_assets',
  'vendor_form_tabs',
  'vendor_form_fields',
  'leads',
  'orders',
  'reviews',
];

/**
 * collectVendorData selects children with an inner join —
 * `select('*, listings!inner(vendor_id)')` — so every row carries a nested
 * object for the joined table. That key is not a column, and PostgREST rejects
 * the insert if it is left in place.
 */
function stripJoins(row) {
  const out = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    const isJoin = value !== null && typeof value === 'object' && !Array.isArray(value)
      && RESTORE_ORDER.includes(key);
    if (!isJoin) out[key] = value;
  }
  return out;
}

/**
 * Replays a backup into the database.
 *
 * Rows keep their original ids and go in with upsert, so importing the same
 * backup twice is a no-op rather than a duplicate — and a partial restore can
 * simply be run again.
 *
 * What this CANNOT bring back: image files. "Delete all data" removes the
 * objects from storage permanently, and a backup holds the media_assets rows
 * (their urls and paths) but not the bytes. Restored photos will point at
 * files that no longer exist, so the caller is told how many are affected
 * rather than left to discover it as broken thumbnails.
 */
export async function restoreBackup(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };
  const backupId = str(formData, 'backupId');
  const file = formData.get('file');

  if (!vendorId) return { ok: false, error: 'MISSING_VENDOR', token: stamp() };

  try {
    const db = getMarketplaceDb();
    let payload = null;

    if (backupId) {
      /**
       * Scoped by vendor, like deleteBackup two functions up.
       *
       * The id comes from a form. Without the second filter, passing another
       * showroom's backup id made the server look their row up, download their
       * archive out of the private bucket and parse their listings, leads and
       * customer phone numbers into this process — and only THEN refuse, on the
       * vendor_id inside the file. Refusing after reading is not refusing.
       *
       * A backup that is not yours reads as one that does not exist. Confirming
       * an id belongs to somebody is still an answer about somebody.
       */
      const { data: row } = await db
        .from('vendor_backups')
        .select('storage_path')
        .eq('id', backupId)
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (!row?.storage_path) return { ok: false, error: 'NOT_FOUND', token: stamp() };

      const { data: blob, error: dlErr } = await db.storage
        .from(BACKUP_BUCKET).download(row.storage_path);
      if (dlErr) return { ok: false, error: 'RESTORE_READ_FAILED', detail: dlErr.message, token: stamp() };

      payload = JSON.parse(await blob.text());
    } else if (file && typeof file !== 'string' && file.size > 0) {
      payload = JSON.parse(await file.text());
    } else {
      return { ok: false, error: 'NO_FILE', token: stamp() };
    }

    if (!payload?.tables) {
      return { ok: false, error: 'RESTORE_BAD_FILE', token: stamp() };
    }

    /**
     * A backup taken from a different store would graft one vendor's listings
     * onto another. Refuse rather than silently mix them.
     *
     * The vendor id is REQUIRED, not merely checked when present. collectVendorData
     * writes it into every archive this platform produces, so a file without one
     * did not come from here — and the uploaded-file path means anyone can hand
     * this a JSON object. `payload.vendor_id &&` let exactly that through: strip
     * the field and the check passed.
     */
    if (payload.vendor_id !== vendorId) {
      return { ok: false, error: 'RESTORE_WRONG_VENDOR', token: stamp() };
    }

    // Bring the store back before its rows land — the vendor row is the parent
    // every listing points at, and it may still be flagged deleted.
    const vendorRow = payload.tables.vendors?.[0];
    await db.from('vendors').update({
      ...(vendorRow ? { name: vendorRow.name, bio: vendorRow.bio, settings: vendorRow.settings } : {}),
      deleted_at: null,
      deletion_reason: null,
      state: 'approved',
    }).eq('id', vendorId);

    const restored = {};
    const failed = {};

    for (const table of RESTORE_ORDER) {
      const rows = (payload.tables[table] ?? []).map(stripJoins);
      if (!rows.length) continue;

      const { error } = await db.from(table).upsert(rows, { onConflict: 'id' });
      if (error) failed[table] = error.message;
      else restored[table] = rows.length;
    }

    // The rows are back but their files are not — say so explicitly.
    const mediaCount = (payload.tables.media_assets ?? []).length;

    revalidatePath('/[locale]/marketplace/seller', 'layout');

    return {
      ok: Object.keys(failed).length === 0,
      error: Object.keys(failed).length ? 'RESTORE_PARTIAL' : null,
      detail: Object.keys(failed).length ? JSON.stringify(failed) : null,
      token: stamp(),
      saved: 'restored',
      restored,
      mediaWithoutFiles: mediaCount,
    };
  } catch (err) {
    return { ok: false, error: 'RESTORE_FAILED', detail: err.message, token: stamp() };
  }
}

/** Lifts the suspension without importing anything. */
export async function reactivateStore(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };

  try {
    await getMarketplaceDb().from('vendors').update({
      deleted_at: null,
      deletion_reason: null,
      state: 'approved',
    }).eq('id', vendorId);

    revalidatePath('/[locale]/marketplace/seller', 'layout');
    return { ok: true, error: null, token: stamp(), saved: 'reactivated' };
  } catch (err) {
    return { ok: false, error: 'SAVE_FAILED', detail: err.message, token: stamp() };
  }
}

// ── delete all data ───────────────────────────────────────────────────────────

/**
 * Clears the vendor's listings, photos and their own catalog entries.
 *
 * The store STAYS OPEN. This used to also set deleted_at and
 * state='suspended', which had a consequence nobody wanted: the vendor
 * disappeared from getVendorOptions(), so the seller was locked out of the
 * dashboard — including the settings page holding the backup they would need
 * to undo it. Clearing your data is not the same as closing your shop, and
 * conflating the two turned a reversible action into a dead end.
 *
 * Orders survive regardless: they are the buyer's receipt and the platform's
 * accounting record, and one side of a completed transaction cannot erase it.
 *
 * Shared catalog rows (the synced brands and models every seller uses) are
 * never touched. Only entries this vendor created themselves and that staff
 * has not yet approved are removed — those belong to them alone, so deleting
 * them cannot break another seller's listing.
 *
 * Requires typing the store slug — a checkbox is too easy to click through.
 */
export async function deleteAllData(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    str(formData, 'vendorId') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: stamp() };
  const confirm = str(formData, 'confirm');
  const expected = str(formData, 'expected');

  if (!vendorId) return { ok: false, error: 'MISSING_VENDOR', token: stamp() };
  if (!expected || confirm !== expected) {
    // A code plus its parameter, not a built sentence — CONFIRM_MISMATCH
    // interpolates {expected} in whichever language the client is showing.
    return { ok: false, error: 'CONFIRM_MISMATCH', params: { expected }, token: stamp() };
  }

  try {
    const db = getMarketplaceDb();
    const before = await getVendorDataCounts(vendorId);

    /**
     * Storage first — once the rows are gone their paths are unknown.
     *
     * Two passes, because a showroom's files can be in two places. Its own
     * bucket is emptied wholesale, which also catches anything uploaded outside
     * media_assets. Objects from before the per-vendor split still live under
     * vendors/<id>/ in the shared bucket and have to be listed and removed one
     * batch at a time.
     */
    const { data: assets } = await db
      .from('media_assets').select('storage_path, vendor_id').eq('vendor_id', vendorId);

    const legacy = (assets ?? [])
      .map((a) => a.storage_path)
      .filter((p) => p && p.startsWith('vendors/'));

    if (legacy.length) {
      // Supabase caps removals per call; chunk rather than lose the tail.
      for (let i = 0; i < legacy.length; i += 100) {
        await db.storage.from(SHARED_BUCKET).remove(legacy.slice(i, i + 100));
      }
    }

    // The bucket itself goes only when the whole showroom is being wiped; the
    // seller keeps their showroom here, so it is emptied and left in place.
    await db.storage.emptyBucket(vendorBucket(vendorId));

    // Child-first, so no foreign key blocks the delete.
    await db.from('listing_variants').delete().in(
      'listing_id',
      ((await db.from('listings').select('id').eq('vendor_id', vendorId)).data ?? []).map((l) => l.id)
    );
    await db.from('media_assets').delete().eq('vendor_id', vendorId);
    await db.from('leads').delete().eq('vendor_id', vendorId);
    await db.from('listings').delete().eq('vendor_id', vendorId);

    // The vendor's own catalog entries. Scoped by created_by_vendor_id AND
    // is_custom AND not-yet-approved: once staff approves an entry it has
    // become shared reference data other sellers may be pointing at, and
    // deleting it then would break their listings, not just this one's.
    const catalogCleared = {};
    for (const table of ['car_trims', 'car_models', 'car_brands', 'car_colors', 'car_attributes']) {
      const { data, error } = await db
        .from(table)
        .delete()
        .eq('created_by_vendor_id', vendorId)
        .eq('is_custom', true)
        .eq('approved', false)
        .select('id');

      // A table without the custom-entry columns simply has nothing of theirs.
      if (!error && data?.length) catalogCleared[table] = data.length;
    }

    // The store is NOT suspended and NOT soft-deleted — see the note above.
    await db.from('audit_log').insert({
      actor: 'vendor',
      actor_id: vendorId,
      action: 'vendor.delete_all_data',
      entity: 'vendor',
      entity_id: vendorId,
      before,
      after: { cleared_at: new Date().toISOString(), catalog: catalogCleared },
    });

    revalidatePath('/[locale]/marketplace/seller', 'layout');
    revalidatePath('/[locale]/marketplace/cars', 'page');

    return {
      ok: true,
      error: null,
      // Without a token the client cannot tell this result from the previous
      // one useActionState is still holding, so the confirmation never showed
      // and the delete looked like it had done nothing.
      token: stamp(),
      saved: 'deleted',
      removed: { ...before, orders_kept: before.orders, catalog: catalogCleared },
    };
  } catch (err) {
    return { ok: false, error: 'DELETE_FAILED', detail: err.message, token: stamp() };
  }
}
