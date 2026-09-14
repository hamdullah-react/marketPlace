"use client";

/**
 * Car listing form — tabbed, used by both /seller/listings/new and
 * /seller/listings/[id]. Passing `existing` switches it to edit mode.
 *
 * Every tab stays MOUNTED and is hidden with CSS rather than unmounted.
 * Unmounting a tab would drop its inputs out of the DOM, and a native form
 * action only submits what is actually in the DOM — so switching tabs would
 * silently wipe half the listing.
 *
 * Bilingual throughout: every text a buyer sees has an Arabic and an English
 * field, side by side, so nothing is filled in only one language by accident.
 */

import {
  useState, useEffect, useMemo, useRef, useActionState, createContext, useContext,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Check, AlertCircle, Plus, Trash2, Images, X,
  Car, Camera, Gauge, FileText, ChevronRight, ChevronLeft, ListChecks, Search, Sparkles,
} from "lucide-react";
import { saveListing } from "../_actions/save-listing";
import { useOnChange } from "@/hooks/use-on-change";
import { listingSeo, keywordList } from "@/marketplace/lib/seo";
import MediaGallery from "./MediaGallery";
import ImagePicker from "./ImagePicker";
import KeywordChips from "./TagsInput";
import CatalogCombo from "./CatalogCombo";
import { fetchModels, fetchTrims } from "../_apicalls/catalogApi";
import { localized } from "@/marketplace/lib/listing";
import { listingStem } from "@/marketplace/lib/slug";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";
import { errorText } from "@/marketplace/lib/errors";
import SpecEditor from "./SpecEditor";
import BilingualField from "./BilingualField";
import BilingualSelect from "./BilingualSelect";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ColorPicker from "./ColorPicker";

const INITIAL = { ok: false, errors: {}, values: null, error: null };

/**
 * Where a save puts the listing.
 *
 * `publish` on the server is still a single boolean — draft or not — so these
 * three collapse to that on submit. Review and Publish differ only in what
 * staff does next, which is why they share a flag but not a label: telling a
 * seller "submitted for review" when the listing went live, or vice versa, is
 * the kind of small lie that erodes trust in the whole dashboard.
 */
const INTENTS = [
  {
    id: "draft", icon: FileText,
    ar: "مسودة", en: "Draft",
    hintAr: "يُحفظ لك وحدك. لا يراه المشترون.",
    hintEn: "Saved for you only. Buyers cannot see it.",
    ctaAr: "حفظ كمسودة", ctaEn: "Save draft",
  },
  {
    id: "review", icon: ListChecks,
    ar: "للمراجعة", en: "For review",
    hintAr: "يُرسل للفريق للموافقة قبل النشر.",
    hintEn: "Sent to the team to approve before it goes live.",
    ctaAr: "إرسال للمراجعة", ctaEn: "Submit for review",
  },
  {
    id: "publish", icon: Check,
    ar: "نشر", en: "Publish",
    hintAr: "ينشر مباشرة ويظهر للمشترين الآن.",
    hintEn: "Goes live immediately and is visible to buyers.",
    ctaAr: "نشر الإعلان", ctaEn: "Publish listing",
  },
];


// Which tab owns which validation key, so an error on a hidden tab still shows
// up as a badge instead of failing silently.
/**
 * Keyword list as removable chips.
 *
 * A textarea of comma-separated words looks like one field and behaves like
 * none: no way to see where a keyword ends, no way to remove the third one
 * without selecting text, and two languages that separate with different
 * characters (Arabic uses ، not ,). A chip is a thing you can point at and
 * delete.
 *
 * Module scope, not nested in ListingForm — a component declared inside another
 * is a new type on every render, so React remounts it and the input loses focus
 * mid-word.
 *
 * The value posts as JSON in a hidden input: a native form action only submits
 * real inputs, and an array is not a form value.
 */
/* Lifted into its own file so the storefront SEO panel uses the same one.
   The keyboard rules below are the component; two copies of them drift. */

/**
 * New or used. Not a catalog list any more — see the Condition tab.
 *
 * Shaped like a catalog row (`slug` + bilingual `name`) so OptionTiles, the
 * SEO generator and listings.attributes all keep reading it exactly as they
 * did when it came from car_attributes.
 */
const CONDITIONS = [
  { slug: "new", name: { ar: "جديد", en: "New" } },
  { slug: "used", name: { ar: "مستعمل", en: "Used" } },
];

/** Shown in the preview's URL line. Matches the action's own fallback. */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_BASE_URL || "https://www.alromaihcars.com";

const TABS = [
  { id: "car", icon: Car, ar: "السيارة", en: "The car", fields: ["brandId", "modelId", "yearId", "city", "vendorId"] },
  { id: "photos", icon: Camera, ar: "الصور والألوان", en: "Photos & colours", fields: ["media"] },
  // The option kinds are NOT listed here: which ones exist is a catalog
  // decision, so they are appended at render time from optionKinds. Naming
  // them statically is what left `bodyType` in this list after the field was
  // renamed, and would drop a seller-created kind out of the error summary.
  { id: "condition", icon: Gauge, ar: "الحالة والسعر", en: "Condition & price", fields: ["condition", "mileage", "price", "compareAt"] },
  { id: "specs", icon: ListChecks, ar: "المواصفات", en: "Specifications", fields: [] },
  { id: "details", icon: FileText, ar: "التفاصيل", en: "Details", fields: [] },
  // Last on purpose: everything on it is optional and generated when blank,
  // so a seller who never opens this tab still gets a complete <head>.
  { id: "seo", icon: Search, ar: "SEO", en: "SEO", fields: ["canonicalUrl"] },
];

/**
 * A dropdown whose options come from car_attributes. Empty option lists render
 * a hint instead of an empty select, so a missing catalog kind is obvious and
 * fixable rather than a silently unusable control.
 *
 * Module scope, not nested in ListingForm — a component declared inside another
 * is a new type every render, so React remounts it and the field loses focus
 * mid-typing.
 */
function CatalogSelect({
  id, name, labelText, options, defaultValue, locale, t, className, labelClass, error,
  fieldMode = "ar",
}) {
  // The chosen slug is state so the two lists in the 'both' popup can stay in
  // step — an uncontrolled <select> cannot mirror a sibling.
  const [value, setValue] = useState(defaultValue ?? "");

  if (!options.length) {
    return (
      <div>
        <span className={labelClass}>{labelText}</span>
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 dark:border-gray-600">
          {t("أضفه من الكتالوج", "Add options in Catalog")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <BilingualSelect
        name={name}
        label={labelText}
        // The listing stores the slug, not the row id.
        options={options.map((o) => ({ ...o, value: o.slug }))}
        value={value}
        onChange={setValue}
        mode={fieldMode}
        locale={locale}
        className={className}
        labelClass={labelClass}
      />
      <FieldError message={error} />
    </div>
  );
}

/**
 * Radio-style tiles for a short catalog list. Used for condition, where the
 * choice changes the rest of the form and is worth a click rather than a
 * dropdown. Submits through a hidden input so the native form action still
 * sees a plain value.
 */
function OptionTiles({ name, options, value, onChange, locale }) {
  return (
    <>
      {/* Hidden, not a radio group, because the tiles already carry the
          pressed state. Note browsers skip hidden inputs during constraint
          validation, so `required` here would be a no-op — the save action is
          what actually enforces this field. */}
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.slug;
          return (
            <button
              /* Keyed on the slug, not an id: these tiles render CONDITIONS,
                 a constant in this file with no database row behind it. The
                 slug is what `value` is compared against, so it is the only
                 identity an option here is guaranteed to have. */
              key={o.slug}
              type="button"
              onClick={() => onChange(o.slug)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-gray-300 hover:border-brand-primary dark:border-gray-600"
              }`}
            >
              {o.icon_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={o.icon_url} alt="" className={`h-4 w-4 object-contain ${active ? "brightness-0 invert" : ""}`} />
              ) : null}
              {localized(o.name, locale) || o.slug}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Photo buckets. A car is browsed outside-in — the card, the search result and
 * the social preview all use an exterior shot — so exterior leads, and the save
 * action sorts on this same order when picking the primary image.
 *
 * Both buckets render at ONE thumbnail size (THUMB.grid). The split is about
 * what a photo shows, not how big it is.
 */
const MEDIA_BUCKETS = [
  { id: "exterior", ar: "صور خارجية", en: "Exterior", hintAr: "الواجهة، الجانب، الخلف، العجلات", hintEn: "Front, side, rear, wheels" },
  { id: "interior", ar: "صور داخلية", en: "Interior", hintAr: "المقصورة، المقاعد، الشاشة، العداد", hintEn: "Cabin, seats, screen, cluster" },
];

export default function ListingForm({
  locale, vendors, brands: initialBrands, years: initialYears, colors: initialColors,
  attributeGroups = {}, optionKinds = [], assets = [], specGroups = [], existing = null,
  defaultVendorId = null, fieldMode = 'both',
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  /**
   * Every kind except `condition`, which is rendered separately above as tiles
   * because it is the one option with a rule attached — picking "used" makes
   * mileage required — so it cannot be just another dropdown in the list.
   */
  // Kinds are gone; specifications carry what they used to. Kept as an empty
  // list rather than deleted outright so the tab-field map below, the error
  // summary and readKinds() on the server all keep their shape while any
  // listing saved under the old model still reads back unchanged.
  const formKinds = [];

  /**
   * A kind's own bilingual name, falling back to its slug.
   *
   * Follows the DASHBOARD language rather than the store's authoring language:
   * this is a label being read, not a value being written, and an English
   * dashboard should not print "نوع الهيكل" over a dropdown whose every other
   * label is English.
   */
  const kindLabel = (k) => localized(k.name, locale) || k.kind;

  /**
   * TABS with the dynamic option fields folded in, so an error on a
   * seller-created kind still lights up its tab and appears in the summary.
   * Everything below reads `tabs`, never the static TABS.
   */
  const tabs = TABS.map((tb) =>
    tb.id === "condition"
      ? { ...tb, fields: [...tb.fields, ...formKinds.map((k) => k.kind)] }
      : tb
  );

  const isEdit = !!existing;
  const [state, formAction, pending] = useActionState(saveListing, INITIAL);

  /**
   * A saved EDIT is acknowledged in place, not by a takeover screen.
   *
   * useActionState keeps the last result forever, so the full-page "Listing
   * updated" panel replaced the form and then stayed replaced — the seller
   * could not carry on editing, and coming back to the page found the same
   * dead-end panel instead of their car. That screen belongs to CREATE, where
   * "what now?" is a real question. On an edit the answer is always "keep
   * editing", so this is a banner that fades and leaves the form standing.
   */
  const [saved, setSaved] = useState(false);
  const lastResult = useRef(null);

  useEffect(() => {
    if (!isEdit || !state.ok || !state.listing) return;

    // Fire once per RESULT, not once per render. router.refresh() below hands
    // down a fresh `existing` object, so an effect that watched props would
    // re-run, refresh again, and spin forever. useActionState gives a new
    // state object per submission and the same one in between, which is
    // exactly the "did they press Save again?" signal wanted here.
    if (lastResult.current === state) return;
    lastResult.current = state;

    setSaved(true);
    // Pull the server's copy back down — the action revalidated the listing,
    // and the badge, the table and the public page should agree with it.
    router.refresh();
    const id = setTimeout(() => setSaved(false), 6000);
    return () => clearTimeout(id);
  }, [state, isEdit, router]);

  const [tab, setTab] = useState("car");
  const [vendorId, setVendorId] = useState(existing?.vendor_id || defaultVendorId || "");

  /**
   * Catalog lists are state, not props, because a seller can create an entry
   * from inside a picker and it has to appear in the list immediately rather
   * than after a reload.
   *
   * ── And that is exactly how they went stale ────────────────────────────────
   *
   * useState(initialBrands) seeds ONCE. Every later value of the prop was
   * ignored, so a brand added on the Catalog page never arrived here however
   * hard the server revalidated — the page had fresh props and the form was
   * still rendering the array it captured at mount. The only way out was a hard
   * reload, which is what "I added it and it needs a refresh" was.
   *
   * syncCatalog() below re-seeds from the prop whenever the server hands down a
   * different list, while KEEPING anything created locally that the server has
   * not caught up with yet. Losing a just-created colour to a refresh would be
   * the same bug pointing the other way.
   */
  const [brands, setBrands] = useState(initialBrands);
  const [years, setYears] = useState(initialYears);
  const [colors, setColors] = useState(initialColors);

  useCatalogSync(initialBrands, setBrands);
  useCatalogSync(initialYears, setYears);
  useCatalogSync(initialColors, setColors);

  /**
   * Bumped to force the on-demand lists — models and trims — to load again.
   *
   * They are keyed on brandId / modelId alone, which is right for a cascade and
   * wrong for freshness: adding a model to the brand ALREADY selected changes
   * neither id, so the effect never re-ran and the new model was invisible. It
   * is in the dependency list of both fetches below.
   */
  const [catalogVersion, setCatalogVersion] = useState(0);

  /**
   * A colour created from inside the picker joins the list immediately.
   *
   * ColorPicker offers this hook and both call sites ignored it, so a new
   * colour was selected by id into a list that did not contain it — the picker
   * then rendered nothing at all, because `items.find(c => c.id === value)`
   * came back undefined. Same visible symptom as the catalog staleness above,
   * different cause.
   */
  const addColor = (c) =>
    setColors((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));

  const [brandId, setBrandId] = useState(existing?.brand_id || "");
  const [modelId, setModelId] = useState(existing?.model_id || "");
  const [yearId, setYearId] = useState(existing?.year_id || "");
  const [trimId, setTrimId] = useState(existing?.trim_id || "");
  const [colorId, setColorId] = useState(existing?.color_id || "");
  const [models, setModels] = useState([]);
  const [trims, setTrims] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingTrims, setLoadingTrims] = useState(false);
  const [condition, setCondition] = useState(existing?.attributes?.condition || "used");

  // Mirrored into state purely so the Save button can react as they are typed;
  // the inputs stay the source of truth for what is submitted.
  const [city, setCity] = useState(existing?.city || "");
  const [price, setPrice] = useState(existing?.price ?? "");
  const [mileage, setMileage] = useState(existing?.attributes?.mileage_km ?? "");

  /**
   * Where the listing should end up: a draft, in the review queue, or live.
   *
   * This replaced a single "Submit for review" checkbox, which could only say
   * yes or no and left "save it as a draft for now" looking like the same
   * action as "publish this". Three named choices make the outcome legible
   * before the click rather than after it.
   */
  const [intent, setIntent] = useState(existing?.state === "draft" || !existing ? "review" : "review");

  // One flat list with a `category` per photo, not two arrays — the listing
  // still stores a single ordered media[], so the save shape is unchanged and
  // an older listing with no category simply reads as exterior.
  const [media, setMedia] = useState(
    (existing?.media ?? []).map((m, i) => ({
      id: m.path || m.url || `existing-${i}`,
      url: m.url,
      storage_path: m.path,
      alt: m.alt,
      category: m.category === "interior" ? "interior" : "exterior",
      // `main` is the seller's choice; `primary` is where it landed in the
      // saved array. Older listings have neither, and fall back to index 0.
      main: m.main ?? m.primary ?? i === 0,
    }))
  );
  const [variants, setVariants] = useState(
    (existing?.variants ?? []).map((v) => ({
      colorId: v.colorId ?? v.color_id,
      nameAr: v.name?.ar ?? "",
      nameEn: v.name?.en ?? "",
      media: Array.isArray(v.media) ? v.media : [],
      /* Empty string, not 0, when the colour has no price of its own — the
         input is controlled, and null would make React shout about switching
         between controlled and uncontrolled. "" is also what the action reads
         as "same as the car". */
      price: v.price ?? "",
      compareAt: v.compareAt ?? v.compare_at ?? "",
    }))
  );

  // attributeId → value. Kept as one flat object so the hidden field is a
  // single small JSON blob rather than 80 individual inputs.
  const [specs, setSpecs] = useState(() => {
    const out = {};
    for (const row of existing?.specs ?? []) {
      const v = row.value;

      // Unwrap to what the INPUTS expect: a scalar for a choice, or {ar, en}
      // for free text. Rows are stored as { label: {ar,en} }, which has no
      // `.raw` — so the old `value?.raw ?? value` handed the wrapper object
      // straight to an <input>, and every field on the Specifications tab came
      // up blank on edit even though the value was sitting right there.
      if (v && typeof v === "object") {
        // `raw` FIRST. It holds the durable answer — an option id for a choice
        // spec, a number for a numeric one — and that is what the controls bind
        // to. Reading `label` first handed a dropdown {ar, en} text when it
        // wanted a uuid, so nothing matched and every control came up blank
        // even though the value was there (hence the visible clear buttons).
        if (v.raw !== undefined && v.raw !== null && typeof v.raw !== "object") {
          out[row.attribute_id] = v.raw;
        } else if (v.raw && typeof v.raw === "object") {
          out[row.attribute_id] = v.raw.label ?? v.raw; // nested by an older save
        } else if (v.label && typeof v.label === "object") {
          out[row.attribute_id] = v.label;
        } else {
          out[row.attribute_id] = v; // already {ar, en}
        }
      } else {
        out[row.attribute_id] = v ?? row.display_value ?? "";
      }
    }
    return out;
  });

  const [picker, setPicker] = useState(null);

  // Jump to the first tab carrying an error — otherwise a failed submit looks
  // like nothing happened when the problem is two tabs away.
  //
  // Keyed on the errors OBJECT, which useActionState replaces on every submit,
  // so this fires once per attempt — including a second attempt that fails the
  // same way, where comparing the contents would not. During render, so the
  // form never shows the tab the seller was on before snapping to the one with
  // the error.
  useOnChange(state.errors, (errors) => {
    const keys = Object.keys(errors ?? {});
    if (!keys.length) return;
    const owner = tabs.find((tb) => tb.fields.some((f) => keys.includes(f)));
    if (owner) setTab(owner.id);
  });

  /**
   * Models for the chosen brand.
   *
   * Through fetchModels rather than a bare fetch: this file's own rule is that
   * a component holds no `/api/...` string, and the wrapper already unwraps the
   * envelope — reading `j?.data?.items` by hand here is a second copy of the
   * response shape that goes wrong quietly when the shape changes.
   *
   * AbortController rather than a `cancelled` flag, so a fast brand-switch also
   * stops the request instead of only ignoring its answer.
   */
  /* set-state-in-effect is disabled for the two fetches below rather than
     restructured. They are the shape the rule's own documentation allows —
     subscribe to an external system, write what comes back — and the two
     synchronous calls it objects to are the ones that CANNOT move into the
     callback: clearing the stale list and raising the loading flag have to
     happen with the request, not after it, or the form shows the previous
     brand's models as though they were this brand's while the fetch is in
     flight. That is the wrong answer on screen, which is worse than a render. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!brandId) { setModels([]); setModelId(""); setTrims([]); return; }

    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingModels(true);

    fetchModels(brandId, ac.signal)
      .then((items) => {
        setModels(items);
        // A model that is no longer in the list — deleted on the Catalog page,
        // or belonging to the brand they just moved away from — must not stay
        // selected, or the form submits an id the server will reject.
        setModelId((prev) => (items.some((m) => m.id === prev) ? prev : ""));
      })
      .catch((err) => { if (err?.name !== "AbortError") setModels([]); })
      .finally(() => { if (!ac.signal.aborted) setLoadingModels(false); });

    return () => ac.abort();
  }, [brandId, catalogVersion]);

  useEffect(() => {
    // See the note on the models fetch above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!modelId) { setTrims([]); return; }

    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingTrims(true);

    fetchTrims(modelId, ac.signal)
      .then(setTrims)
      .catch((err) => { if (err?.name !== "AbortError") setTrims([]); })
      .finally(() => { if (!ac.signal.aborted) setLoadingTrims(false); });

    return () => ac.abort();
  }, [modelId, catalogVersion]);

  /**
   * Coming back to a form that was left open.
   *
   * The usual way a seller hits this: the Catalog page in one tab, Add a car in
   * another, add a model, switch back. Nothing has navigated, so no server
   * component re-ran and no fetch re-fired — the form is exactly as stale as
   * when they left it.
   *
   * Only after a real absence. Alt-tabbing for a second while typing is not a
   * reason to re-fetch, and router.refresh() mid-submit is not a thing to do to
   * somebody who has just pressed Publish.
   */
  const leftAt = useRef(0);
  const submitting = useRef(false);

  /**
   * Mirrored into a ref in an effect, not assigned during render.
   *
   * The visibility listener below is registered once and would otherwise close
   * over whatever `pending` was on the render that installed it, which is why
   * this is a ref at all. Writing it during render is the wrong half of the
   * fix: render must be pure, and React may render a component without
   * committing it — under StrictMode or a discarded concurrent attempt this
   * would leave the ref claiming a submit that never happened, and the tab
   * would then refuse to refresh for the rest of the session.
   */
  useEffect(() => {
    submitting.current = pending;
  }, [pending]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        leftAt.current = Date.now();
        return;
      }
      if (submitting.current) return;
      if (!leftAt.current || Date.now() - leftAt.current < 2000) return;

      leftAt.current = 0;
      // The two halves of the catalog: router.refresh() re-runs the server
      // component for brands, years and colours; the bump re-fetches models and
      // trims. Local form state survives both.
      router.refresh();
      setCatalogVersion((n) => n + 1);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  const name = (row) => localized(row.name, locale);

  // The action returns codes, not sentences — this is where they become words,
  // in the viewer's language only. errorText() falls back to the raw string for
  // an unknown code, so a database message still surfaces rather than vanishing.
  const err = (f) => {
    const code = state.errors?.[f];
    return code ? errorText(code, locale) : null;
  };
  const tabErrors = (tb) => tb.fields.filter((f) => err(f)).length;

  /**
   * Every error, flattened and tagged with the tab that owns it, for the
   * summary at the top of the form. Ordered by TABS so the list reads in the
   * same order as the form itself rather than in object-key order.
   */
  const errorList = tabs.flatMap((tb) =>
    tb.fields
      .filter((f) => err(f))
      .map((f) => ({ field: f, tab: tb.id, tabLabel: t(tb.ar, tb.en), message: err(f) }))
  );

  const label = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";
  const field =
    "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-hidden transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-600 dark:bg-[#1a1a1a] dark:disabled:bg-[#141414]";
  const card = "rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1a1a1a]";
  const section = "mb-6 last:mb-0";
  const sectionTitle = "mb-4 text-sm font-bold text-brand-primary";

  /* Errors render through the module-scope <FieldError message={err("x")} />.
     There is deliberately no local <Err> wrapper: a wrapper declared here would
     itself be a new component type on every render, so React would unmount the
     subtree under it — FieldError included — and hoisting would have bought
     nothing. */

  // BilingualPair is a module-scope component (above) that reads these from
  // PairCtx. Memoised only so the provider's value is not a fresh object on
  // every render, which would re-render all seven fields for nothing.
  const pairCtx = useMemo(
    () => ({ existing, fieldMode, locale, isAr }),
    [existing, fieldMode, locale, isAr]
  );

  /* The gallery returns a whole selection, so replacing one bucket means
     keeping every photo NOT in it and appending the new set — the other way
     round silently drops the other bucket. */
  const mediaIn = (bucket) => media.filter((m) => m.category === bucket);
  const replaceBucket = (bucket, next) =>
    setMedia((prev) => [
      ...prev.filter((m) => m.category !== bucket),
      ...next.map((m) => ({ ...m, category: bucket })),
    ]);
  // Scoped to the bucket: the same asset may sit in both, and matching on id
  // alone would pull it from both at once.
  const removePhoto = (bucket, id) =>
    setMedia((prev) => {
      const next = prev.filter((m) => !(m.id === id && m.category === bucket));
      // Deleting the cover would otherwise leave the listing with no main
      // photo at all; hand it to the first remaining shot.
      return next.some((m) => m.main) || !next.length
        ? next
        : next.map((m, i) => ({ ...m, main: i === 0 }));
    });

  /**
   * What still has to be filled in before this listing can go anywhere.
   *
   * Mirrors validate() in save-listing.js. It exists so the Save button can
   * say WHY it is disabled instead of failing on submit and scrolling the
   * seller back up to an error summary — but it is a convenience, not the
   * guard. The action re-checks everything, because a disabled button stops
   * nobody who is not using the button.
   */
  const missing = [
    !vendorId && { field: "vendorId", tab: "car", ar: "البائع", en: "Seller" },
    !brandId && { field: "brandId", tab: "car", ar: "الماركة", en: "Brand" },
    !modelId && { field: "modelId", tab: "car", ar: "الموديل", en: "Model" },
    !yearId && { field: "yearId", tab: "car", ar: "سنة الصنع", en: "Year" },
    !city.trim() && { field: "city", tab: "car", ar: "المدينة", en: "City" },
    !(Number(price) > 0) && { field: "price", tab: "condition", ar: "السعر", en: "Price" },
    condition === "used" && !String(mileage).trim() &&
      { field: "mileage", tab: "condition", ar: "الممشى", en: "Mileage" },
  ].filter(Boolean);

  // Photos are only required to LEAVE draft — a draft with no pictures is a
  // perfectly reasonable work in progress.
  const needsPhotos = intent !== "draft" && media.length === 0;
  const blockers = needsPhotos
    ? [...missing, { field: "media", tab: "photos", ar: "صورة واحدة على الأقل", en: "At least one photo" }]
    : missing;

  /**
   * The slug, built live from the car the seller is picking.
   *
   * The server already does this when the field is left empty, but doing it
   * only there meant the seller could not SEE the URL until after saving. It
   * is generated from the same listingStem() the action uses, so what the form
   * shows is what gets stored.
   *
   * `slugTouched` is the whole trick: once the seller edits the field by hand
   * it stops following the pickers, otherwise choosing a trim would silently
   * overwrite a URL they had deliberately written.
   */
  /**
   * Only the HAND-TYPED slug is state. The followed-along one is computed.
   *
   * This used to be one piece of state kept in step with the pickers by an
   * effect that called setCustomSlug on every brand/model/year change. That is
   * a render, a commit, and then a second render to show the new value — for
   * something that is a pure function of state React already has. Worse, the
   * field showed the stale slug for one paint after every pick.
   *
   * Derived during render instead: `slugTouched` chooses which of the two the
   * field is showing, and the auto value is never stored at all.
   */
  const [typedSlug, setTypedSlug] = useState(
    existing?.slug ? existing.slug.replace(/-[0-9a-f]{8}$/, "") : ""
  );
  const [slugTouched, setSlugTouched] = useState(!!existing?.slug);

  /* Keyword chips, one list per language. keywordList() absorbs the shape this
     column used to have — a comma-joined string — so a listing saved before
     the chip editor existed opens with its keywords already as chips instead
     of one chip containing all of them. */
  const [keywords, setKeywords] = useState(() => ({
    ar: keywordList(existing?.meta_keywords?.ar),
    en: keywordList(existing?.meta_keywords?.en),
  }));

  const nameOf = (list, id) => {
    const row = list.find((r) => r.id === id);
    if (!row) return "";
    // English reads better in a URL; Arabic is kept only when it is all there is.
    return row.name?.en || row.name?.ar || String(row.value ?? "");
  };

  /**
   * What the server will store for any metadata field left blank.
   *
   * Calls the SAME listingSeo() the save action calls — not a lookalike — so
   * the preview cannot promise text that never gets written. Labels come from
   * the catalog lists already loaded for the dropdowns, so this costs no
   * request; it recomputes as the seller edits the car above it.
   */
  const seoPreview = useMemo(() => {
    const labelOf = (list, id) => list.find((x) => x.id === id)?.name ?? null;
    const optionName = (kind, slug) =>
      (kind === "condition" ? CONDITIONS : attributeGroups[kind] ?? [])
        .find((o) => o.slug === slug)?.name ?? null;

    const out = listingSeo({
      brand: labelOf(brands, brandId),
      model: labelOf(models, modelId),
      trim: labelOf(trims, trimId),
      year: years.find((y) => y.id === yearId)?.value ?? "",
      city,
      condition: optionName("condition", condition),
      mileage: Number(mileage) || 0,
      price: Number(price) || 0,
      description: { ar: existing?.description?.ar ?? "", en: existing?.description?.en ?? "" },
      facts: formKinds.map((k) => optionName(k.kind, existing?.attributes?.[k.kind])).filter(Boolean),
    });

    const lang = isAr ? "ar" : "en";
    return {
      title: out.title[lang],
      description: out.description[lang],
      keywords: out.keywords[lang],
      titleAr: out.title.ar, titleEn: out.title.en,
      descriptionAr: out.description.ar, descriptionEn: out.description.en,
      keywordsAr: out.keywords.ar, keywordsEn: out.keywords.en,
      focusAr: out.focus.ar, focusEn: out.focus.en,
    };
  }, [
    brands, brandId, models, modelId, trims, trimId, years, yearId,
    city, condition, mileage, price, attributeGroups, formKinds, existing, isAr,
  ]);

  const autoSlug = listingStem({
    brand: nameOf(brands, brandId),
    model: nameOf(models, modelId),
    year: years.find((y) => y.id === yearId)?.value ?? "",
    trim: nameOf(trims, trimId),
  });

  // What the field shows and what the form posts. `listing` is listingStem()'s
  // "nothing to build from" answer, and an empty box is what tells the seller
  // to keep picking rather than offering them a URL that says nothing.
  const customSlug = slugTouched ? typedSlug : (autoSlug === "listing" ? "" : autoSlug);

  /** Exactly one photo carries `main`, so setting it clears every other. */
  const setMain = (id, bucket) =>
    setMedia((prev) =>
      prev.map((m) => ({ ...m, main: m.id === id && m.category === bucket }))
    );

  // Falls back to "first photo overall" until a choice is made, which is what
  // the save action does too — the badge must not claim a different cover than
  // the one that will actually be stored.
  const isMain = (m) =>
    media.some((x) => x.main) ? !!m.main : media[0]?.id === m.id && media[0]?.category === m.category;

  const addVariant = () =>
    setVariants((v) => [...v, { colorId: "", nameAr: "", nameEn: "", media: [], price: "", compareAt: "" }]);
  const updateVariant = (i, patch) =>
    setVariants((v) => v.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  const removeVariant = (i) => setVariants((v) => v.filter((_, idx) => idx !== i));

  const tabIndex = tabs.findIndex((tb) => tb.id === tab);
  const Next = isAr ? ChevronLeft : ChevronRight;
  const Prev = isAr ? ChevronRight : ChevronLeft;

  // ── Success (create only — see `saved` above) ──────────────────────────────
  if (state.ok && state.listing && !isEdit) {
    return (
      <div className={`${card} text-center`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 dark:bg-green-950">
          <Check className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-brand-primary">
          {state.listing.updated
            ? t("تم تحديث الإعلان", "Listing updated")
            : state.listing.state === "draft"
              ? t("تم حفظ المسودة", "Draft saved")
              : t("تم إرسال الإعلان للمراجعة", "Submitted for review")}
        </h2>
        {state.error ? (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{errorText(state.error, locale)}</p>
        ) : null}
        <code className="mt-4 inline-block rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-600 dark:bg-[#262626] dark:text-gray-300">
          /marketplace/listing/{state.listing.slug}
        </code>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/${locale}/marketplace/listing/${state.listing.slug}`}
            className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363]">
            {t("عرض الإعلان", "View listing")}
          </Link>
          <Link href={`/${locale}/marketplace/seller/listings`}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand-primary dark:border-gray-600">
            {t("إعلاناتي", "My listings")}
          </Link>
          <button onClick={() => router.refresh()}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand-primary dark:border-gray-600">
            {t("إضافة آخر", "Add another")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <PairCtx.Provider value={pairCtx}>
      <form action={formAction}>
        <input type="hidden" name="listingId" value={existing?.id ?? ""} />
        <input type="hidden" name="media" value={JSON.stringify(media)} />
        <input type="hidden" name="variants" value={JSON.stringify(variants)} />
        <input type="hidden" name="specs" value={JSON.stringify(specs)} />

        {saved ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
            <Check className="h-4 w-4 shrink-0" />
            <span className="font-medium">{t("تم حفظ التغييرات", "Changes saved")}</span>
            <Link
              href={`/${locale}/marketplace/listing/${state.listing?.slug ?? existing?.slug}`}
              className="underline underline-offset-2 hover:no-underline"
            >
              {t("عرض الإعلان", "View listing")}
            </Link>
            <button
              type="button"
              onClick={() => setSaved(false)}
              className={`${isAr ? "mr-auto" : "ml-auto"} text-xs opacity-70 hover:opacity-100`}
            >
              {t("إخفاء", "Dismiss")}
            </button>
          </div>
        ) : null}

        {state.error ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorText(state.error, locale)}</span>
          </div>
        ) : null}

        {/* ── Error summary ───────────────────────────────────────────────
            Every problem in one place, at the top, where a failed submit puts
            the eye. Tabs stay MOUNTED but hidden, so a field that failed can
            be two tabs away and completely off screen — a red outline nobody
            can see reads as "the button is broken". Each line names its tab
            and jumps there. */}
        {errorList.length ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {t(
                `${errorList.length} حقل يحتاج إلى تصحيح`,
                `${errorList.length} field${errorList.length === 1 ? "" : "s"} need${errorList.length === 1 ? "s" : ""} attention`
              )}
            </p>
            <ul className="mt-2 space-y-1">
              {errorList.map((e) => (
                <li key={e.field}>
                  <button
                    type="button"
                    onClick={() => setTab(e.tab)}
                    className="text-start text-xs text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                  >
                    <span className="font-medium">{e.tabLabel}</span>
                    <span className="mx-1.5 opacity-60">·</span>
                    {e.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700" role="tablist">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            const count = tabErrors(tb);
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tb.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand-primary text-brand-primary"
                    : "border-transparent text-gray-500 hover:text-brand-primary dark:text-gray-400"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(tb.ar, tb.en)}
                {count ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Every panel stays mounted — `hidden` only. See the note at the top. */}
        <div className={card}>
          {/* ── Tab: the car ─────────────────────────────────────────────── */}
          <div hidden={tab !== "car"} role="tabpanel">
            {/* ── Seller ───────────────────────────────────────────────
                One showroom is the normal case, and a picker with a single
                option is not a choice — it is a control that looks like a
                decision and has none. So the showroom is simply stated, and
                its id travels in a hidden input.

                A picker survives only for staff and for anyone who belongs
                to more than one showroom. `vendors` is already the
                session-scoped list from getVendorOptions(), so the options
                can only ever be the caller's own — and save-listing.js
                re-derives the vendor from the session regardless, which is
                what makes posting somebody else's id do nothing at all. */}
            <div className={section}>
              <h2 className={sectionTitle}>{t("البائع", "Seller")}</h2>

              <input type="hidden" name="vendorId" value={vendorId} />

              {vendors.length > 1 ? (
                <Select value={vendorId || undefined} onValueChange={setVendorId}>
                  <SelectTrigger className="h-11" aria-label={t("اختر المعرض", "Select a showroom")}>
                    <SelectValue placeholder={t("اختر المعرض", "Select a showroom")} />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{name(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-100">
                  {vendors[0] ? name(vendors[0]) : t("معرضك", "Your showroom")}
                </p>
              )}
              <FieldError message={err("vendorId")} />
            </div>

            <div className={section}>
              <h2 className={sectionTitle}>{t("مواصفات السيارة", "Car identity")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "ابحث في الكتالوج. تُدار المدخلات من صفحة الكتالوج.",
                  "Search the catalog. Entries are managed on the Catalog page."
                )}
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={label}>{t("الماركة", "Brand")} *</label>
                  <CatalogCombo
                    mode={fieldMode}
                    locale={locale} kind="brand" name="brandId" items={brands} value={brandId}
                    vendorId={vendorId} required
                    placeholder={t("اختر الماركة", "Select brand")}
                    onChange={setBrandId}
                  />
                  <FieldError message={err("brandId")} />
                </div>

                <div>
                  <label className={label}>{t("الموديل", "Model")} *</label>
                  <CatalogCombo
                    mode={fieldMode}
                    locale={locale} kind="model" name="modelId" items={models} value={modelId}
                    parentId={brandId} vendorId={vendorId} required
                    disabled={!brandId || loadingModels}
                    placeholder={
                      loadingModels ? t("جاري التحميل…", "Loading…")
                        : !brandId ? t("اختر الماركة أولاً", "Pick a brand first")
                        : t("اختر الموديل", "Select model")
                    }
                    onChange={setModelId}
                  />
                  <FieldError message={err("modelId")} />
                </div>

                <div>
                  <label className={label}>{t("سنة الصنع", "Year")} *</label>
                  <CatalogCombo
                    mode={fieldMode}
                    locale={locale} kind="year" name="yearId" items={years} value={yearId}
                    vendorId={vendorId} required
                    placeholder={t("اختر السنة", "Select year")}
                    labelOf={(y) => String(y.value)}
                    onChange={setYearId}
                  />
                  <FieldError message={err("yearId")} />
                </div>

                <div>
                  <label className={label}>{t("الفئة", "Trim")}</label>
                  <CatalogCombo
                    mode={fieldMode}
                    locale={locale} kind="trim" name="trimId" items={trims} value={trimId}
                    parentId={modelId} vendorId={vendorId}
                    disabled={!modelId || loadingTrims}
                    placeholder={
                      loadingTrims ? t("جاري التحميل…", "Loading…")
                        : !modelId ? t("اختر الموديل أولاً", "Pick a model first")
                        : t("بدون تحديد", "Not specified")
                    }
                    labelOf={(tr) => `${localized(tr.name, locale)}${tr.code ? ` (${tr.code})` : ""}`}
                    onChange={setTrimId}
                  />
                </div>

                <div>
                  <label className={label}>{t("اللون الأساسي", "Main colour")}</label>
                  <ColorPicker
                    mode={fieldMode}
                    locale={locale} name="colorId" items={colors} value={colorId}
                    vendorId={vendorId}
                    onChange={setColorId}
                    onCreated={addColor}
                  />
                </div>

                <div>
                  <label className={label} htmlFor="city">{t("المدينة", "City")} *</label>
                  <input id="city" name="city" className={field} required value={city}
                    onChange={(e) => setCity(e.target.value)} placeholder={t("الرياض", "Riyadh")} />
                  <FieldError message={err("city")} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Tab: photos & colours ────────────────────────────────────── */}
          <div hidden={tab !== "photos"} role="tabpanel">
            <div className={section}>
              <h2 className={`${sectionTitle} mb-1`}>{t("صور الإعلان", "Listing photos")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "افصل الصور الخارجية عن الداخلية — أول صورة خارجية هي الرئيسية.",
                  "Keep exterior and interior apart — the first exterior photo becomes the main one."
                )}
              </p>

              <div className="space-y-4">
                {MEDIA_BUCKETS.map((bucket) => {
                  const shots = mediaIn(bucket.id);
                  const isPrimaryBucket = bucket.id === "exterior";

                  return (
                    <div key={bucket.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
                            {t(bucket.ar, bucket.en)}
                            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-normal tabular-nums text-brand-primary">
                              {shots.length}
                            </span>
                          </h3>
                          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {t(bucket.hintAr, bucket.hintEn)}
                          </p>
                        </div>
                        <button type="button" onClick={() => setPicker(bucket.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium transition-colors hover:border-brand-primary dark:border-gray-600">
                          <Images className="h-3.5 w-3.5" />
                          {shots.length ? t("تغيير", "Change") : t("إضافة", "Add")}
                        </button>
                      </div>

                      {shots.length === 0 ? (
                        <button type="button" onClick={() => setPicker(bucket.id)}
                          className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-8 transition-colors hover:border-brand-primary dark:border-gray-600">
                          <Images className="h-6 w-6 text-brand-primary" />
                          <span className="mt-1.5 text-xs font-medium text-brand-primary">
                            {t(`أضف ${bucket.ar}`, `Add ${bucket.en.toLowerCase()} photos`)}
                          </span>
                        </button>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                          {shots.map((m, i) => (
                            <div key={m.id}
                              className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumbUrl(m.url, THUMB.grid)} alt="" className="h-full w-full object-cover" loading="lazy" />
                              {/* The cover photo, chosen not inferred. Exactly
                                  one can hold it — setMain clears the rest. */}
                              {isMain(m) ? (
                                <span className="absolute inset-s-1 top-1 rounded bg-brand-primary px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {t("رئيسية", "MAIN")}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setMain(m.id, bucket.id)}
                                  className="absolute inset-s-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-medium text-brand-primary opacity-0 transition-opacity group-hover:opacity-100 dark:bg-black/70"
                                  title={t("اجعلها الصورة الرئيسية", "Make this the main photo")}
                                >
                                  {t("رئيسية", "Set main")}
                                </button>
                              )}
                              <button type="button" onClick={() => removePhoto(bucket.id, m.id)}
                                className="absolute inset-e-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-black/70"
                                aria-label={t("إزالة", "Remove")}>
                                <X className="h-3 w-3 text-red-600" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <FieldError message={err("media")} />
            </div>

            <div className={section}>
              <div className="mb-1 flex items-center justify-between">
                <h2 className={`${sectionTitle} mb-0`}>{t("الألوان المتوفرة", "Colour variants")}</h2>
                <button type="button" onClick={addVariant}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium transition-colors hover:border-brand-primary dark:border-gray-600">
                  <Plus className="h-3.5 w-3.5" />
                  {t("إضافة لون", "Add colour")}
                </button>
              </div>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "اللون بدون صور خاصة لن يظهر للمشتري. اترك السعر فارغاً إذا كان هذا اللون بنفس سعر السيارة.",
                  "A colour with no photos of its own won't be shown to buyers. Leave the price empty if the colour costs the same as the car.",
                )}
              </p>

              {variants.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400 dark:border-gray-600">
                  {t("لا توجد ألوان مضافة", "No colours added")}
                </p>
              ) : (
                <div className="space-y-3">
                  {variants.map((v, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      {/* The colour name is buyer-facing text, so it follows the
                          same ar / en / both setting as every other field —
                          these were two raw inputs that ignored it entirely and
                          always showed both languages. */}
                      <div className={`grid grid-cols-1 gap-2 ${
                        fieldMode === "both"
                          ? "sm:grid-cols-[1fr_1fr_1fr_8rem_auto_auto]"
                          : "sm:grid-cols-[1fr_1fr_8rem_auto_auto]"
                      }`}>
                        <ColorPicker mode={fieldMode} locale={locale} name={`variantColor-${i}`} items={colors} value={v.colorId} vendorId={vendorId} compact onChange={(id) => updateVariant(i, { colorId: id })} onCreated={addColor} />

                        {(fieldMode === "both" ? ["ar", "en"] : [fieldMode === "en" ? "en" : "ar"]).map((lang) => (
                          <input
                            key={lang}
                            dir={lang === "ar" ? "rtl" : "ltr"}
                            value={lang === "ar" ? v.nameAr : v.nameEn}
                            onChange={(e) => updateVariant(i, lang === "ar" ? { nameAr: e.target.value } : { nameEn: e.target.value })}
                            placeholder={
                              lang === "ar"
                                ? t("اسم اللون (عربي)", "Colour name (Arabic)")
                                : t("اسم اللون (إنجليزي)", "Colour name (English)")
                            }
                            className={`${field} h-9`}
                          />
                        ))}

                        {/* ── This colour's price ──────────────────────────
                            Pearl white costs more than plain white, so the
                            price belongs on the colour and not only on the car.

                            The placeholder is the CAR's price, which is how the
                            box says what leaving it empty means: this colour
                            costs the same. That is deliberately not a
                            defaultValue — pre-filling every row would make eight
                            copies of one number, eight things to keep in step
                            the day the car is repriced, and eight chances to
                            mistype a digit. Empty follows the car for ever.

                            See schema.sql §31. */}
                        <input
                          type="number" min="0" step="any" inputMode="decimal"
                          dir="ltr"
                          value={v.price}
                          onChange={(e) => updateVariant(i, { price: e.target.value })}
                          placeholder={price ? String(price) : t("السعر", "Price")}
                          title={t(
                            "اتركه فارغاً إذا كان سعر هذا اللون كسعر السيارة",
                            "Leave empty if this colour costs the same as the car",
                          )}
                          className={`${field} h-9 tabular-nums`}
                        />

                        <button type="button" onClick={() => setPicker(i)}
                          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs transition-colors hover:border-brand-primary dark:border-gray-600">
                          <Images className="h-3.5 w-3.5" />
                          {v.media.length ? `${v.media.length}` : t("صور", "Photos")}
                        </button>
                        <button type="button" onClick={() => removeVariant(i)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
                          aria-label={t("حذف اللون", "Remove colour")}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* ── The "was" price, only once there is a price ────
                          A colour with its own price cannot borrow the car's
                          compare_at: "was 200,000, now 185,000" printed beside
                          a colour that was never 200,000 is a false claim about
                          a discount, which is the one kind of pricing error
                          worth being careful about.

                          Hidden until it can mean something, so the common row
                          — a colour that costs the same — stays one line. */}
                      {String(v.price).trim() !== "" ? (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-gray-500 dark:text-gray-400">
                            {t("كان", "Was")}
                          </label>
                          <input
                            type="number" min="0" step="any" inputMode="decimal"
                            dir="ltr"
                            value={v.compareAt}
                            onChange={(e) => updateVariant(i, { compareAt: e.target.value })}
                            placeholder={t("اختياري", "Optional")}
                            className={`${field} h-8 w-32 tabular-nums`}
                          />
                          <span className="text-xs text-gray-400">
                            {t(
                              "يظهر مشطوباً فوق سعر هذا اللون.",
                              "Shown struck through above this colour's price.",
                            )}
                          </span>
                        </div>
                      ) : null}

                      {v.media.length ? (
                        <div className="mt-2 flex gap-1.5 overflow-x-auto">
                          {v.media.map((m, mi) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img key={mi} src={thumbUrl(m.url, THUMB.icon)} alt="" className="h-12 w-12 shrink-0 rounded object-cover" loading="lazy" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Tab: condition & price ───────────────────────────────────── */}
          <div hidden={tab !== "condition"} role="tabpanel">
            <div className={section}>
              <h2 className={sectionTitle}>{t("الحالة", "Condition")}</h2>

              {/* The one thing that did NOT move to specifications.
                  It is on every car, it is two values and never more, and it
                  decides whether mileage is required — so it stays a field of
                  the listing rather than a row in a catalog somebody could
                  rename or delete. */}
              <div className="mb-4">
                <span className={label}>{t("الحالة", "Condition")} *</span>
                <OptionTiles
                  name="condition"
                  options={CONDITIONS}
                  value={condition}
                  onChange={setCondition}
                  locale={locale}
                />
                <FieldError message={err("condition")} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={label} htmlFor="mileage">
                    {t("الممشى (كم)", "Mileage (km)")} {condition === "used" ? "*" : ""}
                  </label>
                  {/* step="any": step="1000" made the browser reject 7004 with "the two
                      nearest valid values are 7000 and 8000". A step is a GRID, not a
                      hint — an odometer reading is whatever it says. */}
                  <input id="mileage" name="mileage" type="number" min="0" step="any" className={field}
                    required={condition === "used"}
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    placeholder="68000" />
                  <FieldError message={err("mileage")} />
                </div>
                {/* Transmission, fuel, seats and body type used to be a
                    dropdown each, filled from a second catalog list called
                    "kinds" that sat alongside the specifications the seller
                    was already filling in on the next tab. Two places to
                    define one thing, and two places for them to disagree.
                    They live on the Specifications tab now; a spec flagged
                    "show on card" is what the card shows. */}
              </div>
            </div>

            <div className={section}>
              <h2 className={sectionTitle}>{t("السعر", "Price")}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="price">{t("السعر (ريال، شامل الضريبة)", "Price (SAR, VAT incl.)")} *</label>
                  <input id="price" name="price" type="number" min="1" step="any" className={field} required
                    value={price} onChange={(e) => setPrice(e.target.value)} placeholder="98500" />
                  <FieldError message={err("price")} />
                </div>
                <div>
                  <label className={label} htmlFor="compareAt">{t("السعر قبل الخصم", "Was price")}</label>
                  <input id="compareAt" name="compareAt" type="number" min="0" step="any" className={field} defaultValue={existing?.compare_at ?? ""} placeholder={t("اختياري", "Optional")} />
                  <FieldError message={err("compareAt")} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Tab: specifications ──────────────────────────────────────── */}
          <div hidden={tab !== "specs"} role="tabpanel">
            <div className={section}>
              <h2 className={sectionTitle}>{t("مواصفات السيارة", "Car specifications")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "املأ ما تعرفه فقط — الحقول الفارغة لا تظهر للمشتري.",
                  "Fill in only what you know — anything left empty is hidden from buyers."
                )}
              </p>
              <SpecEditor locale={locale} groups={specGroups} values={specs} onChange={setSpecs} fieldMode={fieldMode} />
            </div>
          </div>

          {/* ── Tab: details ─────────────────────────────────────────────── */}
          <div hidden={tab !== "details"} role="tabpanel">
            <div className={section}>
              <h2 className={sectionTitle}>{t("العنوان", "Title")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t("اتركه فارغاً ليُبنى تلقائياً من الماركة والموديل والسنة.", "Leave empty and it is built from brand, model and year.")}
              </p>
              <BilingualPair id="title" labelAr={t("العنوان", "Title")} labelEn={t("العنوان", "Title")}
                placeholderAr="كامري GLE 2022" placeholderEn="Camry GLE 2022" />
            </div>

            <div className={section}>
              <h2 className={sectionTitle}>{t("الوصف", "Description")}</h2>
              <BilingualPair id="description" textarea rows={6}
                labelAr={t("الوصف", "Description")} labelEn={t("الوصف", "Description")}
                placeholderAr="صيانة دورية بالوكالة، فحص كامل…"
                placeholderEn="Agency serviced, fully inspected…" />
            </div>

            <div className={section}>
              <h2 className={sectionTitle}>{t("الرابط", "URL slug")}</h2>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "اتركه فارغاً ليُبنى من الماركة والموديل والسنة. يُضاف رمز فريد في نهايته دائماً حتى لا يتعارض إعلانك مع إعلان آخر لنفس السيارة.",
                  "Leave empty to build it from brand, model and year. A unique code is always appended, so your listing can never clash with another seller's identical car."
                )}
              </p>
              <label className={label} htmlFor="customSlug">{t("الرابط المخصص", "Custom slug")}</label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-gray-400" dir="ltr">/marketplace/listing/</span>
                <input
                  id="customSlug" name="customSlug" dir="ltr"
                  className={`${field} font-mono text-xs`}
                  value={customSlug}
                  onChange={(e) => { setSlugTouched(true); setTypedSlug(e.target.value); }}
                  placeholder="toyota-camry-2022-gle"
                />
                {slugTouched && autoSlug && autoSlug !== "listing" && customSlug !== autoSlug ? (
                  <button
                    type="button"
                    // Clearing the typed value too, so "follow the pickers"
                    // means exactly that rather than freezing today's autoSlug.
                    onClick={() => { setSlugTouched(false); setTypedSlug(""); }}
                    className="shrink-0 text-xs text-brand-primary hover:underline"
                  >
                    {t("توليد تلقائي", "Auto")}
                  </button>
                ) : null}
                <span className="shrink-0 font-mono text-xs text-gray-400" dir="ltr">-a3f91b7c</span>
              </div>
            </div>
          </div>

          {/* ── Search & social ──────────────────────────────────────────────
              Every field here is optional. Anything left blank is written from
              the car itself on save — and REwritten on every save, so a
              listing renamed from GL to GLX carries a matching title without
              anyone remembering to come back here. Fill one in and it is
              yours; we stop touching that field.

              The preview below is not a mock-up: it calls the same
              listingSeo() the server action calls, so what is shown is what
              gets stored. Two implementations would drift and the seller would
              be previewing text that never existed. */}
          <div hidden={tab !== "seo"} role="tabpanel">
            {/* ── What you get for free ─────────────────────────────────────
                The tab opens on the result, not on a wall of empty inputs.
                A seller who reads this line and closes the tab has done the
                right thing — everything below is already written for them,
                and re-written on every save so it never goes stale. */}
            <div className={`${section} border-brand-primary/20 bg-brand-primary/5`}>
              <h2 className={sectionTitle}>
                <Sparkles className="mb-0.5 me-1.5 inline h-4 w-4" />
                {t("جاهز تلقائياً", "Already done for you")}
              </h2>
              <p className="mb-4 text-xs text-gray-600 dark:text-gray-400">
                {t(
                  "لا يلزمك تعبئة أي شيء هنا. كل حقل تتركه فارغاً يُكتب من بيانات سيارتك عند الحفظ ويُحدَّث مع كل تعديل. اكتب في أي حقل وسيبقى كما كتبته.",
                  "You do not have to fill in anything here. Every field you leave blank is written from your car when you save, and rewritten on every save. Type in one and it stays exactly as you wrote it."
                )}
              </p>

              {/* A Google result, drawn the way Google draws it. Colours and
                  order are the point — a seller recognises this instantly and
                  can judge their own title against it. */}
              <div className="space-y-2 rounded-lg border border-brand-primary/20 bg-white p-4 dark:bg-[#161616]">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {t("هكذا تظهر في جوجل", "How it looks on Google")}
                </p>
                <p className="truncate text-xs text-[#006621] dark:text-[#5f9c5f]" dir="ltr">
                  {SITE_ORIGIN}/{locale}/marketplace/listing/{customSlug || "…"}
                </p>
                <p className="truncate text-base text-[#1a0dab] dark:text-[#8ab4f8]" dir={isAr ? "rtl" : "ltr"}>
                  {seoPreview.title || t("—", "—")}
                </p>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400" dir={isAr ? "rtl" : "ltr"}>
                  {seoPreview.description || t("—", "—")}
                </p>
              </div>
            </div>

            {/* ── Search result ──────────────────────────────────────────── */}
            <div className={section}>
              <h2 className={sectionTitle}>{t("الأساسي (Meta Title)", "Primary SEO — meta title")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t("السطر الأزرق في نتائج البحث. الأفضل ألا يتجاوز 60 حرفاً.", "The blue line in search results. Best kept under 60 characters.")}
              </p>
              <BilingualPair id="metaTitle"
                labelAr={t("عنوان الصفحة (Meta Title)", "Meta title")}
                labelEn={t("عنوان الصفحة (Meta Title)", "Meta title")}
                placeholderAr={seoPreview.titleAr} placeholderEn={seoPreview.titleEn} />
            </div>

            <div className={section}>
              <h2 className={sectionTitle}>{t("وصف الصفحة (Meta Description)", "Meta description")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t("السطران الرماديان تحته. حتى 155 حرفاً.", "The two grey lines underneath. Up to 155 characters.")}
              </p>
              <BilingualPair id="metaDescription" textarea rows={3}
                labelAr={t("وصف الصفحة (Meta Description)", "Meta description")}
                labelEn={t("وصف الصفحة (Meta Description)", "Meta description")}
                placeholderAr={seoPreview.descriptionAr} placeholderEn={seoPreview.descriptionEn} />
            </div>

            {/* ── Keywords ───────────────────────────────────────────────── */}
            <div className={section}>
              <h2 className={sectionTitle}>{t("الكلمات المفتاحية (Meta Keywords)", "Meta keywords")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "اكتب كلمة واضغط Enter. اضغط ✕ لحذف واحدة، أو + لإضافة كلمة مقترحة. اكتب العبارات التي يبحث بها المشتري فعلاً.",
                  "Type a phrase and press Enter. Press ✕ to remove one, or + to accept a suggestion. Use the phrases a buyer would actually search."
                )}
              </p>

              <div className="space-y-4">
                {(fieldMode === "both" ? ["ar", "en"] : [fieldMode === "en" ? "en" : "ar"]).map((lang) => (
                  <div key={lang}>
                    <label className={label}>
                      {lang === "ar" ? t("بالعربية", "Arabic") : t("بالإنجليزية", "English")}
                    </label>
                    <KeywordChips
                      name={lang === "ar" ? "metaKeywordsAr" : "metaKeywordsEn"}
                      value={keywords[lang]}
                      onChange={(next) => setKeywords((k) => ({ ...k, [lang]: next }))}
                      suggestions={lang === "ar" ? seoPreview.keywordsAr : seoPreview.keywordsEn}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                      t={t}
                      placeholder={lang === "ar" ? "سوزوكي فرونكس، سيارات الرياض…" : "Suzuki Fronx, cars in Riyadh…"}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/10">
                <h3 className="mb-1 text-sm font-medium">{t("الكلمة الرئيسية", "Focus keyword")}</h3>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t("العبارة الواحدة التي تريد أن تظهر بها هذه الصفحة.", "The one phrase you want this page to be found by.")}
                </p>
                <BilingualPair id="focusKeyword"
                  labelAr={t("الكلمة الرئيسية", "Focus keyword")} labelEn={t("الكلمة الرئيسية", "Focus keyword")}
                  placeholderAr={seoPreview.focusAr} placeholderEn={seoPreview.focusEn} />
              </div>
            </div>

            {/* ── Share card ─────────────────────────────────────────────── */}
            <div className={section}>
              <h2 className={sectionTitle}>
                {t("وسائل التواصل (Open Graph)", "Social media (Open Graph)")}
              </h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {/* Both names on purpose. "Open Graph" is what the standard is
                    called and what every other SEO tool labels it, so anyone
                    who has used one recognises the section instantly; the
                    sentence underneath is for everyone who has not. */}
                {t(
                  "بطاقة المعاينة التي تظهر عند مشاركة الرابط في واتساب أو تويتر أو فيسبوك. اتركها فارغة لتستخدم عنوان ووصف الصفحة أعلاه وصورة الإعلان الرئيسية.",
                  "The preview card shown when the link is shared on WhatsApp, X or Facebook. Leave blank to reuse the page title, description and main photo above."
                )}
              </p>

              <BilingualPair id="ogTitle"
                labelAr={t("عنوان Open Graph", "Open Graph title")}
                labelEn={t("عنوان Open Graph", "Open Graph title")} />
              <div className="mt-4">
                <BilingualPair id="ogDescription" textarea rows={3}
                  labelAr={t("وصف Open Graph", "Open Graph description")}
                  labelEn={t("وصف Open Graph", "Open Graph description")} />
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-4">
                {/* Its own image, because a 4:3 gallery shot cropped to the
                    1.91:1 a share card uses loses the car. */}
                <ImagePicker
                  locale={locale} name="ogImageUrl" vendorId={vendorId} assets={assets}
                  value={existing?.og_image_url ?? ""} kind="photo" size="wide"
                  label={t("صورة Open Graph", "Open Graph image")}
                  hint={t("عريضة 1200×630. فارغة = الصورة الرئيسية.", "Wide, 1200×630. Blank = the main photo.")}
                />
                <div className="min-w-[180px] flex-1">
                  <label className={label} htmlFor="twitterCard">{t("بطاقة تويتر", "Twitter card")}</label>
                  <select
                    id="twitterCard" name="twitterCard" className={field}
                    defaultValue={existing?.twitter_card ?? "summary_large_image"}
                  >
                    <option value="summary_large_image">{t("صورة كبيرة", "Large image")}</option>
                    <option value="summary">{t("صورة صغيرة", "Small image")}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Indexing ───────────────────────────────────────────────── */}
            <div className={section}>
              <h2 className={sectionTitle}>{t("الفهرسة", "Indexing")}</h2>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "اتركهما مفعّلين. أطفئ الأول فقط إذا كنت لا تريد ظهور هذا الإعلان في نتائج البحث إطلاقاً.",
                  "Leave both on. Only turn the first off if you do not want this listing in search results at all."
                )}
              </p>

              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="seoIndex" defaultChecked={existing?.seo_index !== false}
                  className="mt-0.5 h-4 w-4 accent-[#46194F]" />
                <span>
                  {t("اظهر في نتائج البحث", "Show in search results")}
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {t("مفعّل افتراضياً", "On by default")}
                  </span>
                </span>
              </label>

              <label className="mt-3 flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="seoFollow" defaultChecked={existing?.seo_follow !== false}
                  className="mt-0.5 h-4 w-4 accent-[#46194F]" />
                <span>
                  {t("تتبّع الروابط في الوصف", "Follow links in the description")}
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {t("مفعّل افتراضياً", "On by default")}
                  </span>
                </span>
              </label>

              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 dark:border-white/10">
                <div>
                  <label className={label} htmlFor="seoChangefreq">{t("معدّل التحديث", "How often it changes")}</label>
                  <select id="seoChangefreq" name="seoChangefreq" className={field}
                    defaultValue={existing?.seo_changefreq ?? "weekly"}>
                    <option value="daily">{t("يومياً", "Daily")}</option>
                    <option value="weekly">{t("أسبوعياً", "Weekly")}</option>
                    <option value="monthly">{t("شهرياً", "Monthly")}</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="seoPriority">{t("الأولوية", "Priority")}</label>
                  <select id="seoPriority" name="seoPriority" className={field}
                    defaultValue={String(existing?.seo_priority ?? 0.5)}>
                    <option value="0.8">{t("عالية", "High")}</option>
                    <option value="0.5">{t("عادية", "Normal")}</option>
                    <option value="0.3">{t("منخفضة", "Low")}</option>
                  </select>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t("يُستخدمان في خريطة الموقع لإخبار محركات البحث بأي الصفحات تعاود زيارتها أولاً.", "Both go in the sitemap, telling search engines which pages to revisit first.")}
              </p>
            </div>

            {/* ── Canonical ──────────────────────────────────────────────── */}
            <div className={section}>
              <h2 className={sectionTitle}>{t("الرابط الأساسي", "Canonical URL")}</h2>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "اتركه فارغاً — سيشير إلى صفحة إعلانك نفسها، وهو الصحيح في كل الحالات تقريباً. غيّره فقط إذا كانت نفس السيارة منشورة على رابط آخر يجب اعتباره الأصل.",
                  "Leave it blank — it points at your own listing page, which is right in almost every case. Only change it if the same car is published at another URL that should count as the original."
                )}
              </p>
              <label className={label} htmlFor="canonicalUrl">{t("الرابط الأساسي", "Canonical URL")}</label>
              <input
                id="canonicalUrl" name="canonicalUrl" type="url" dir="ltr"
                className={`${field} font-mono text-xs`}
                defaultValue={existing?.canonical_url ?? ""}
                placeholder={`${SITE_ORIGIN}/ar/marketplace/listing/…`}
              />
            </div>
          </div>
        </div>
        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className={`${card} mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="flex items-center gap-2">
            {tabIndex > 0 ? (
              <button type="button" onClick={() => setTab(tabs[tabIndex - 1].id)}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors hover:border-brand-primary dark:border-gray-600">
                <Prev className="h-4 w-4" />
                {t("السابق", "Back")}
              </button>
            ) : null}
            {tabIndex < tabs.length - 1 ? (
              <button type="button" onClick={() => setTab(tabs[tabIndex + 1].id)}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors hover:border-brand-primary dark:border-gray-600">
                {t("التالي", "Next")}
                <Next className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            {/* Where this listing is going. Three named outcomes beat one
                "Submit for review" checkbox, which could only say yes or no
                and made "keep it as a draft" look like the same act as
                "publish it". The action still reads a single `publish` flag,
                so the server contract is unchanged. */}
            <input type="hidden" name="intent" value={intent} />
            {/* Kept alongside `intent` because validate() still gates the
                photo requirement on it — a draft may have none. */}
            <input type="hidden" name="publish" value={intent === "draft" ? "" : "on"} />

            <div className="flex flex-wrap gap-1.5 rounded-lg border p-1">
              {INTENTS.map((o) => {
                const active = intent === o.id;
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setIntent(o.id)}
                    aria-pressed={active}
                    title={t(o.hintAr, o.hintEn)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-brand-primary text-white"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(o.ar, o.en)}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground sm:text-end">
              {t(
                INTENTS.find((o) => o.id === intent).hintAr,
                INTENTS.find((o) => o.id === intent).hintEn
              )}
            </p>

            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              <button type="submit" disabled={pending || blockers.length > 0}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#5a2363] disabled:cursor-not-allowed disabled:opacity-60">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending
                  ? t("جاري الحفظ…", "Saving…")
                  : t(INTENTS.find((o) => o.id === intent).ctaAr, INTENTS.find((o) => o.id === intent).ctaEn)}
              </button>

              {/* A disabled button with no explanation is a dead end. Name what
                  is missing and let each name jump to the tab that owns it. */}
              {blockers.length ? (
                <p className="text-xs text-amber-600 dark:text-amber-500 sm:text-end">
                  {t("ينقص: ", "Still needed: ")}
                  {blockers.map((b, i) => (
                    <span key={b.field}>
                      {i > 0 ? t("، ", ", ") : ""}
                      <button
                        type="button"
                        onClick={() => setTab(b.tab)}
                        className="underline underline-offset-2 hover:text-brand-primary"
                      >
                        {t(b.ar, b.en)}
                      </button>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </form>

      {/* ── Media picker ───────────────────────────────────────────────────
          Controlled Dialog: `picker` holds WHICH bucket or colour variant is
          being filled, so it doubles as the open flag — open when it is not
          null. onOpenChange clears it, which covers Escape and the overlay
          without a second handler. */}
      <Dialog open={picker !== null} onOpenChange={(o) => { if (!o) setPicker(null); }}>
        {/* The DIALOG does not scroll; its body does — so the title and Done
            stay pinned while the grid moves under them. Done used to sit at
            the very bottom, past a grid of every photo the seller owns: they
            picked their images, then had to scroll the whole library again to
            find the button that closed the dialog. */}
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="flex max-h-[88vh] flex-col sm:max-w-4xl"
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-12">
            <DialogTitle className="text-brand-primary">
              {MEDIA_BUCKETS.find((b) => b.id === picker)
                ? t(
                    MEDIA_BUCKETS.find((b) => b.id === picker).ar,
                    `${MEDIA_BUCKETS.find((b) => b.id === picker).en} photos`
                  )
                : t("صور اللون", "Colour photos")}
            </DialogTitle>

            <DialogClose asChild>
              <Button type="button" size="sm" className="shrink-0 bg-brand-primary hover:bg-[#5a2363]">
                {t("تم", "Done")}
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
          <MediaGallery
            locale={locale}
            vendorId={vendorId}
            initialAssets={assets}
            mode="pick"
            selected={
              MEDIA_BUCKETS.some((b) => b.id === picker)
                ? mediaIn(picker)
                : (variants[picker]?.media ?? [])
            }
            onSelect={(next) =>
              MEDIA_BUCKETS.some((b) => b.id === picker)
                ? replaceBucket(picker, next)
                : updateVariant(picker, { media: next })
            }
          />
          </div>
        </DialogContent>
      </Dialog>
    </PairCtx.Provider>
  );
}

/**
 * Keeps a catalog list in step with the prop it was seeded from.
 *
 * The problem it solves: a list held in useState ignores every later prop, so a
 * revalidated server render reaches the component and changes nothing.
 *
 * The problem it must NOT cause: a seller creates a colour inside the picker,
 * something triggers a refresh a moment later, and the colour they just made
 * disappears because the server list does not have it yet. So the server list
 * wins for anything it knows about, and locally-created rows are appended
 * rather than dropped.
 *
 * Guarded on a signature of the ids, because the prop is a new array on every
 * server render and setting state unconditionally would re-render forever.
 */
function useCatalogSync(incoming, setList) {
  const signature = (incoming ?? []).map((row) => row.id).join(",");

  useEffect(() => {
    setList((prev) => {
      const known = new Set((incoming ?? []).map((row) => row.id));
      const localOnly = (prev ?? []).filter((row) => !known.has(row.id));
      return localOnly.length ? [...incoming, ...localOnly] : incoming;
    });
    // `incoming` is intentionally not a dependency: it is a fresh array every
    // render and the signature is what actually says whether it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, setList]);
}

/**
 * What every <BilingualPair> below needs and none of its call sites pass: the
 * row being edited, the field language, and the dashboard locale.
 *
 * Same reasoning as SettingsForm's FieldCtx. BilingualPair used to be built
 * inside ListingForm — first as a plain arrow, then wrapped in useMemo — and
 * both are a component created during render: the type changes identity, React
 * unmounts the subtree, and BilingualField's useState goes with it, so the
 * seller loses whatever they were typing into the title or the description.
 * useMemo does not save it; a memo cache may be dropped at any time, and the
 * identity still changes whenever `existing` does.
 *
 * With the values in context the component is a module-scope constant and the
 * seven call sites stay exactly as they read.
 */
const PairCtx = createContext({ existing: null, fieldMode: "ar", locale: "ar", isAr: true });

function BilingualPair({ id, labelAr, labelEn, textarea = false, placeholderAr = "", placeholderEn = "", rows = 4 }) {
  const { existing, fieldMode, locale, isAr } = useContext(PairCtx);
  const col = id.replace(/([A-Z])/g, "_$1").toLowerCase();
  // The COLUMN, not the field id. `description` happens to be spelled the
  // same either way, which is why this went unnoticed until metaTitle
  // arrived and looked up `existing.metaTitle` — a key no row has.
  const json = existing?.[id === "title" ? "name" : col] ?? existing?.[id];
  return (
    <BilingualField
      id={id}
      label={isAr ? labelAr : labelEn}
      ar={json?.ar ?? existing?.[col + "_ar"] ?? ""}
      en={json?.en ?? existing?.[col + "_en"] ?? ""}
      mode={fieldMode}
      locale={locale}
      textarea={textarea}
      rows={rows}
      phAr={placeholderAr}
      phEn={placeholderEn}
    />
  );
}

/**
 * One field's error line.
 *
 * MODULE SCOPE. A component declared inside another is a new TYPE on every
 * render, so React remounts rather than updates it — which on a form this size
 * means rebuilding an error node under every field each time a single
 * character is typed.
 */
function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="h-3 w-3" /> {message}
    </p>
  );
}
