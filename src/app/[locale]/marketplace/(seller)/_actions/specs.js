'use server';

/**
 * The Specifications tab's own writes — adding a specification, clearing one,
 * and the two flags a showroom can set on it.
 *
 * Ticking a specification on a car is NOT here. That rides along with the
 * listing, in save-listing.js, because a tick is an answer about one car and
 * must be saved or discarded with the rest of the form — a tick that persisted
 * on its own would survive a save the seller abandoned.
 *
 * What IS here is everything that changes the showroom's LIST rather than one
 * car: creating a specification the 298-entry template does not name, clearing
 * one nothing uses, choosing its icon, and flagging whether it shows on the
 * card. All four outlive the form, which is why they are actions of their own
 * and why each one reports what it did.
 *
 * ── Guarded by `listings`, not by a capability of its own ──────────────────
 *
 * A salesperson who may list a car has to be able to say the car has a
 * sunroof, and adding "Wading depth" to the showroom's list is the same kind of
 * act as adding a colour — it shapes the catalog, and §34's capability map puts
 * the catalog under `listings` for exactly that reason. `show_on_card` is the
 * one that reaches further than one car, and it is still a presentation choice
 * about the showroom's own stock rather than money or access.
 */

import { revalidatePath } from 'next/cache';
import { vendorForAction } from '@/marketplace/auth/session';
import {
  createCustomSpec,
  deleteSpecDefinition,
  updateSpecDefinition,
  materializeTemplateSpec,
  createSpecSection,
  updateSpecSection,
  deleteSpecSection,
  isTemplateId,
  slugOfTemplateId,
} from '@/marketplace/db/queries/spec-catalog';
import { SPEC_CATEGORY_BY_KEY, DISPLAY_TYPE_OF_KIND } from '@/marketplace/lib/spec-template';
import { getSpecSections } from '@/marketplace/db/queries/spec-catalog';
import { isSpecIcon } from '@/marketplace/lib/spec-icons';

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, data = {}) => ({ ok: false, error, token: stamp(), ...data });

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const flag = (fd, k) => str(fd, k) === 'true';

/**
 * The answers, for a list type.
 *
 * Parsed and re-validated rather than trusted: this arrives as a JSON string
 * in a form field, which is a string from a browser like any other. Capped at
 * 60 — a dropdown longer than that is a text field somebody has not admitted
 * to yet, and an uncapped list is a row anybody can make arbitrarily large.
 *
 * Shared by adding and editing, so the two cannot drift: an answer list that
 * was legal to create and illegal to re-save would be a specification its
 * owner could not edit.
 */
const parseChoices = (fd) => {
  let raw;
  try {
    raw = JSON.parse(str(fd, 'choices') || '[]');
  } catch {
    return [];
  }

  return (Array.isArray(raw) ? raw : [])
    .map((c) => ({
      ar: String(c?.ar ?? '').trim().slice(0, 120),
      en: String(c?.en ?? '').trim().slice(0, 120),
    }))
    .filter((c) => c.ar || c.en)
    .map((c) => ({ ar: c.ar || c.en, en: c.en || c.ar }))
    .slice(0, 60);
};

/**
 * Both pages that render a checklist.
 *
 * The tab is part of the listing form, so the paths to refresh are the form's,
 * not a tab's of its own. `/new` as well as `/[id]`: a seller who adds a
 * specification while creating a car has to see it in the list they are
 * standing in.
 */
const revalidateSpecs = () => {
  revalidatePath('/[locale]/marketplace/seller/listings/new', 'page');
  revalidatePath('/[locale]/marketplace/seller/listings/[id]', 'page');
};

/* ── Adding one the template does not name ────────────────────────────────── */

export async function addSpecification(prevState, formData) {
  const ar = str(formData, 'ar');
  const en = str(formData, 'en');
  const kind = str(formData, 'kind') || 'check';
  const categoryKey = str(formData, 'category');
  const icon = str(formData, 'icon');
  const unitAr = str(formData, 'unitAr');
  const unitEn = str(formData, 'unitEn');
  const wanted = str(formData, 'vendorId') || null;

  if (!ar && !en) return bad('SPEC_NAME_REQUIRED');
  if (!DISPLAY_TYPE_OF_KIND[kind]) return bad('SPEC_KIND_INVALID');
  if (!categoryKey) return bad('SPEC_CATEGORY_INVALID');

  let choices = [];
  if (kind === 'choice' || kind === 'multi') {
    choices = parseChoices(formData);

    /* A list with nothing in it is a dropdown that cannot be answered, which
       is the "Add options in Catalog" dead end the checklist replaced. */
    if (!choices.length) return bad('SPEC_ANSWERS_REQUIRED');
  }
  /* An icon that is not in the set would be stored as null and render as the
     fallback mark, which reads as the save having dropped it. Say so instead. */
  if (icon && !isSpecIcon(icon)) return bad('SPEC_ICON_INVALID');

  const { vendorId, error: denied } = await vendorForAction(wanted, 'listings');
  if (denied) return bad(denied);

  /* The section has to be one THIS showroom has — a shipped one, or one they
     added in §36's table. Checked after the capability, because it needs the
     resolved vendor, and checked at all because the key arrives in a form
     field: without it a crafted post could file a specification under a
     heading that exists nowhere and is therefore invisible and uneditable. */
  if (!SPEC_CATEGORY_BY_KEY.has(categoryKey)) {
    const own = await getSpecSections(vendorId);
    if (!own.some((sec) => sec.key === categoryKey)) return bad('SPEC_CATEGORY_INVALID');
  }

  const { definition, error } = await createCustomSpec({
    vendorId,
    ar,
    en,
    kind,
    categoryKey,
    icon: icon || null,
    unitAr,
    unitEn,
    choices,
  });

  if (error === 'ALREADY_EXISTS') return bad('SPEC_ALREADY_EXISTS');
  if (error === 'NAME_REQUIRED') return bad('SPEC_NAME_REQUIRED');
  if (error) return bad(error);

  revalidateSpecs();

  /* The new row goes back with the result rather than being waited for on a
     refresh: the seller is mid-form, the checklist is client state, and a
     specification that appears only after a reload is one they will add twice.
     The same reason SpecEditor kept its own `added` map for new answers. */
  return ok({ definition });
}

/* ── Clearing one ─────────────────────────────────────────────────────────── */

/**
 * Remove a specification from the showroom's list.
 *
 * Refused while any car answers it, with the count in the message — and
 * refused again by the database if a car answers it in the moment between the
 * two (schema.sql §35 on listing_specs' RESTRICT rule). "Don't disturb the old
 * listings" is enforced in that order: a sentence first, a constraint behind
 * it.
 *
 * An entry the showroom never saved has nothing to remove. That is not an
 * error the seller caused — the control is simply not offered for those — so it
 * comes back as its own code rather than as a failure.
 */
export async function removeSpecification(prevState, formData) {
  const id = str(formData, 'specId');
  const wanted = str(formData, 'vendorId') || null;

  if (!id) return bad('SPEC_NOT_FOUND');
  if (isTemplateId(id)) return bad('SPEC_NOT_SAVED');

  const { vendorId, error: denied } = await vendorForAction(wanted, 'listings');
  if (denied) return bad(denied);

  const { ok: done, usedBy, error } = await deleteSpecDefinition({ vendorId, id });

  if (error === 'IN_USE') return bad('SPEC_IN_USE', { usedBy });
  if (error === 'NOT_FOUND') return bad('SPEC_NOT_FOUND');
  if (error === 'NOT_SAVED') return bad('SPEC_NOT_SAVED');
  if (error) return bad(error);
  if (!done) return bad('SPEC_NOT_FOUND');

  revalidateSpecs();
  return ok({ removedId: id });
}

/* ── The flags and the icon ───────────────────────────────────────────────── */

/**
 * Set `show_on_card`, `is_key` or the icon.
 *
 * The id may be a `tpl:<slug>` placeholder, because the controls are offered on
 * every row rather than only on the ones a car already answers — a control that
 * appeared once somebody ticked something elsewhere would be a control nobody
 * finds. So the first use of one CREATES the definition
 * (materializeTemplateSpec) and then sets the flag on it, which is the same
 * lazy creation a tick does, a moment earlier.
 */
export async function updateSpecification(prevState, formData) {
  const rawId = str(formData, 'specId');
  const wanted = str(formData, 'vendorId') || null;

  if (!rawId) return bad('SPEC_NOT_FOUND');

  const { vendorId, error: denied } = await vendorForAction(wanted, 'listings');
  if (denied) return bad(denied);

  const patch = {};
  if (formData.has('showOnCard')) patch.showOnCard = flag(formData, 'showOnCard');
  if (formData.has('isKey')) patch.isKey = flag(formData, 'isKey');
  if (formData.has('icon')) {
    const icon = str(formData, 'icon');
    if (icon && !isSpecIcon(icon)) return bad('SPEC_ICON_INVALID');
    patch.icon = icon || null;
  }

  /* The name, the type, the unit and the heading — everything the New
     specification dialog asks for, so the same dialog can edit one. Each is
     taken only when the form SENT it: the row's own card and icon buttons post
     a single field, and a patch that silently included the rest would blank a
     name the seller never opened. */
  if (formData.has('ar') || formData.has('en')) {
    patch.ar = str(formData, 'ar');
    patch.en = str(formData, 'en');
    if (!patch.ar && !patch.en) return bad('SPEC_NAME_REQUIRED');
  }

  if (formData.has('kind')) {
    const kind = str(formData, 'kind');
    if (!DISPLAY_TYPE_OF_KIND[kind]) return bad('SPEC_KIND_INVALID');
    patch.kind = kind;

    /* The answers travel with the type, because the two cannot disagree: a
       dropdown with no answers is the dead end the checklist replaced, and a
       number that still carried a list would offer one nothing reads. */
    if (kind === 'choice' || kind === 'multi') {
      const choices = parseChoices(formData);
      if (!choices.length) return bad('SPEC_ANSWERS_REQUIRED');
      patch.choices = choices;
    } else {
      patch.unitAr = kind === 'number' ? str(formData, 'unitAr') : '';
      patch.unitEn = kind === 'number' ? str(formData, 'unitEn') : '';
    }
  } else if (formData.has('choices')) {
    /* Editing only the answer list, leaving the type alone. */
    const choices = parseChoices(formData);
    if (!choices.length) return bad('SPEC_ANSWERS_REQUIRED');
    patch.choices = choices;
  }

  if (formData.has('category')) {
    const categoryKey = str(formData, 'category');
    if (!categoryKey) return bad('SPEC_CATEGORY_INVALID');
    patch.category = categoryKey;
  }

  if (!Object.keys(patch).length) return ok({ id: rawId });

  /* The same check adding one makes, for the same reason: the key arrives in a
     form field, and a specification filed under a heading that exists nowhere
     is invisible and uneditable. */
  if (patch.category && !SPEC_CATEGORY_BY_KEY.has(patch.category)) {
    const own = await getSpecSections(vendorId);
    if (!own.some((sec) => sec.key === patch.category)) return bad('SPEC_CATEGORY_INVALID');
  }

  let id = rawId;
  if (isTemplateId(rawId)) {
    const { id: made, error } = await materializeTemplateSpec(vendorId, slugOfTemplateId(rawId));
    if (error || !made) return bad(error || 'SPEC_NOT_FOUND');
    id = made;
  }

  const { ok: done, error, used, limit } = await updateSpecDefinition({ vendorId, id, patch });

  /**
   * The card is full.
   *
   * Reported with the numbers rather than as a bare refusal, because "you
   * already have four" is actionable where "could not save" is not — the
   * seller's next move is to take one off, and the message has to say that.
   *
   * Returned BEFORE the generic handling below so it keeps its own code: the
   * row's card button and the panel both show it, and both need to know the
   * flag did not change.
   */
  if (error === 'CARD_FULL') {
    return bad('SPEC_CARD_FULL', { id, used, limit });
  }

  /* The icon could not be stored because §35 has not been run, but whatever
     else was in the patch was. Reported rather than swallowed: a seller who
     picked an icon and saw nothing change is owed the reason. */
  if (error === 'ICON_UNAVAILABLE') {
    revalidateSpecs();
    return bad('SPEC_ICONS_UNAVAILABLE', { id, applied: true });
  }

  if (error === 'NOT_FOUND') return bad('SPEC_NOT_FOUND');
  if (error === 'NAME_REQUIRED') return bad('SPEC_NAME_REQUIRED');
  if (error === 'KIND_INVALID') return bad('SPEC_KIND_INVALID');
  if (error === 'CATEGORY_INVALID') return bad('SPEC_CATEGORY_INVALID');
  if (error) return bad(error);
  if (!done) return bad('SPEC_NOT_FOUND');

  revalidateSpecs();

  /* The real id goes back, so a row that was a `tpl:` placeholder a moment ago
     stops being one in the client's own state — otherwise the next flag on the
     same row would try to create it again. */
  return ok({ id, was: rawId });
}

/* ── The sections themselves ──────────────────────────────────────────────
 *
 * The rail's headings, which §36 gave rows of their own. Three actions, and
 * the first two are deliberately one call apart rather than one call: adding
 * "Armour" and renaming "Engine & transmission" are the same write — an
 * upsert keyed on (vendor, key) — but they are different things to a seller,
 * and an action that did both depending on what it found would report the
 * wrong one in its error.
 *
 * Guarded by `listings` like the specifications themselves: a salesperson who
 * may describe a car may organise the sheet they describe it on.
 */

export async function addSpecSection(prevState, formData) {
  const ar = str(formData, 'ar');
  const en = str(formData, 'en');
  const icon = str(formData, 'icon');
  const wanted = str(formData, 'vendorId') || null;

  if (!ar && !en) return bad('SECTION_NAME_REQUIRED');
  if (icon && !isSpecIcon(icon)) return bad('SPEC_ICON_INVALID');

  const { vendorId, error: denied } = await vendorForAction(wanted, 'listings');
  if (denied) return bad(denied);

  const { section, error } = await createSpecSection({ vendorId, ar, en, icon: icon || null });

  if (error === 'NAME_REQUIRED') return bad('SECTION_NAME_REQUIRED');
  if (error === 'SECTIONS_UNAVAILABLE') return bad('SECTIONS_UNAVAILABLE');
  if (error) return bad(error);

  revalidateSpecs();
  return ok({ section });
}

export async function editSpecSection(prevState, formData) {
  const key = str(formData, 'sectionKey');
  const wanted = str(formData, 'vendorId') || null;

  if (!key) return bad('SECTION_NOT_FOUND');

  const patch = {};
  if (formData.has('ar')) patch.ar = str(formData, 'ar');
  if (formData.has('en')) patch.en = str(formData, 'en');
  if (formData.has('icon')) {
    const icon = str(formData, 'icon');
    if (icon && !isSpecIcon(icon)) return bad('SPEC_ICON_INVALID');
    patch.icon = icon || null;
  }
  if (formData.has('sequence')) {
    const n = Number(str(formData, 'sequence'));
    if (Number.isFinite(n)) patch.sequence = n;
  }
  if (!Object.keys(patch).length) return ok({ key });

  const { vendorId, error: denied } = await vendorForAction(wanted, 'listings');
  if (denied) return bad(denied);

  const { ok: done, section, rewritten, error } = await updateSpecSection({ vendorId, key, patch });

  if (error === 'NAME_REQUIRED') return bad('SECTION_NAME_REQUIRED');
  if (error === 'SECTION_NOT_FOUND') return bad('SECTION_NOT_FOUND');
  if (error === 'SECTIONS_UNAVAILABLE') return bad('SECTIONS_UNAVAILABLE');
  if (error) return bad(error);
  if (!done) return bad('SECTION_NOT_FOUND');

  revalidateSpecs();

  /* `rewritten` is how many specifications now print the new heading. Sent
     back so the tab can say it: renaming a section quietly changing twelve
     car pages is the kind of reach a seller should be told about, not
     discover. */
  return ok({ key, section, rewritten: rewritten ?? 0 });
}

export async function removeSpecSection(prevState, formData) {
  const key = str(formData, 'sectionKey');
  const wanted = str(formData, 'vendorId') || null;

  if (!key) return bad('SECTION_NOT_FOUND');

  const { vendorId, error: denied } = await vendorForAction(wanted, 'listings');
  if (denied) return bad(denied);

  const { ok: done, used, error } = await deleteSpecSection({ vendorId, key });

  if (error === 'SECTION_IN_USE') return bad('SECTION_IN_USE', { used });
  if (error === 'SECTION_NOT_FOUND') return bad('SECTION_NOT_FOUND');
  if (error) return bad(error);
  if (!done) return bad('SECTION_NOT_FOUND');

  revalidateSpecs();
  return ok({ removedKey: key });
}
