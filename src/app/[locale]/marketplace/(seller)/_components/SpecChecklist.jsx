"use client";

/**
 * The Specifications tab — a checklist, not a form.
 *
 * ── What this replaced, and why ───────────────────────────────────────────
 *
 * SpecEditor rendered whatever the showroom's CATALOG happened to contain: a
 * rail of categories and a grid of cards, one per specification, each with a
 * dropdown that said "Add options in Catalog" whenever the catalog did not
 * contain an answer list. Which was often, because a specification was a
 * catalog entity a showroom had to invent — see schema.sql §35 on the four
 * copies of the same scraped 79 rows, and the `seats` / `seatss` / `seatsss` /
 * `setas` in the original database.
 *
 * The list is now the application's (lib/spec-template.js, 298 entries across
 * 14 sections) and the seller's job is a tick. 193 of those entries are a tick
 * and nothing else; the other 105 reveal one control when ticked, because
 * "1.6 L" cannot be expressed by a checkbox and a template that left out engine
 * capacity would not be a car specification template.
 *
 * ── Three kinds of row, and the seller can see which ──────────────────────
 *
 * Every row is one of:
 *
 *   from the template, not yet in this showroom's catalog → `tpl:<slug>`.
 *       Ticking it creates the definition at SAVE time, so a showroom that
 *       never mentions a wading depth never gets a row for one.
 *   from the template, and this showroom already has the definition → the
 *       definition's own id. The tick writes against the row every existing
 *       answer already points at, which is what makes this safe to ship over a
 *       live database: nothing is migrated and nothing is duplicated.
 *   the showroom's own, which the template does not name → shown in its
 *       section, marked, and clearable once no car answers it.
 *
 * ── Two controls that are NOT about this car ──────────────────────────────
 *
 * The icon and "show on card" belong to the DEFINITION — they are the same on
 * every car in the showroom — and they save immediately through their own
 * action rather than with the form. That is a real difference from everything
 * else on this page and the row says so, because a seller who expects their
 * ticks to be discarded on Cancel would otherwise be surprised to find the card
 * flag kept.
 *
 * ── NOT ONE <form> IN THIS FILE, and that is load-bearing ─────────────────
 *
 * This whole component renders INSIDE the listing form — the Specifications
 * tab is a panel within `<form action={formAction}>`. A <form> here is
 * therefore a NESTED form, which HTML does not allow: the browser silently
 * un-nests it, every `type="submit"` inside it belongs to the LISTING form,
 * and pressing one saves the car instead of setting a flag.
 *
 * It surfaced as React's "A React form was unexpectedly submitted", which
 * names the symptom and not the cause. So every write here dispatches its
 * action directly with a FormData built in the handler — useActionState's
 * dispatch takes one — and every button is `type="button"`.
 *
 * The one exception is the Add dialog, and it is not an exception to the rule:
 * it also builds its own FormData, because a <form> inside a Radix portal is
 * outside this form in the DOM and inside it in the React tree, which is
 * exactly the kind of "works until it doesn't" the rule exists to avoid.
 *
 * ── Every dispatch goes inside startTransition ────────────────────────────
 *
 * The other half of not having a form. React wires `action` on a <form> into
 * a transition for you; calling useActionState's dispatch straight out of an
 * onClick does not, and React says so — "An async function with useActionState
 * was called outside of a transition… isPending will not update correctly".
 * The visible cost is the spinner: `pending` would never flip, so a slow save
 * would look like a dead button and get clicked again.
 */

import { useMemo, useState, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, Star, Plus, Trash2, Loader2, CreditCard, Info, Check, Pencil,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { localized } from "@/marketplace/lib/listing";
import { errorText } from "@/marketplace/lib/errors";
import { SPEC_CATEGORIES } from "@/marketplace/lib/spec-template";
import SpecGlyph from "@/marketplace/ui/SpecGlyph";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import BilingualField from "./BilingualField";
import IconPicker from "./IconPicker";
import {
  addSpecification, removeSpecification, updateSpecification,
  addSpecSection, editSpecSection, removeSpecSection,
} from "../_actions/specs";

const isTpl = (id) => String(id ?? "").startsWith("tpl:");

/**
 * How many specifications a card shows.
 *
 * Mirrors CARD_LIMIT in db/queries/spec-catalog.js, which is the one that is
 * ENFORCED — this copy only shapes what the panel offers, because the module
 * holding it is `server-only` and importing it here would pull the whole
 * 298-entry template into this bundle. The same reason KIND_BY_DISPLAY below
 * is a copy rather than an import.
 *
 * The two agreeing is not load-bearing: if this one were wrong the panel would
 * offer a fifth and the action would refuse it with SPEC_CARD_FULL, which the
 * strip above the list already shows.
 */
const CARD_LIMIT = 4;

/** Ticked means "there is a value", whatever the value's shape. */
const isSet = (v) =>
  v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);

/**
 * What a bare tick stores.
 *
 * NOT the string "yes". save-listing writes `display_value` from whatever is
 * here, and a sheet reading "yes" under "Sunroof" is worse than no sheet —
 * buildSpecSheet already renders a yes/no specification as its LABEL rather
 * than as a tick, for the reason schema.sql gives about yesno not being a
 * boolean upstream. A bilingual pair is the label, in both languages, so the
 * car page reads correctly for an Arabic and an English visitor from one save.
 */
const TICK = { ar: "نعم", en: "Yes" };

export default function SpecChecklist({
  locale = "ar",
  groups: initialGroups = [],
  values = {},
  onChange,
  vendorId = null,
  /** §35 not run: the icon controls cannot store anything, so they are hidden. */
  iconsMissing = false,
  /**
   * The store's authoring language — 'ar', 'en' or 'both'.
   *
   * The same setting every other bilingual field on this form reads
   * (vendors.settings.default_locale). Passed down to the Add dialog so a
   * showroom that writes in one language is not asked for two here and only
   * here.
   */
  fieldMode = "both",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  /**
   * The checklist's own copy of the list.
   *
   * `groups` comes from the server and is not refetched while the form is open,
   * so a specification the seller just added, cleared, or gave an icon to would
   * otherwise not change until a reload — and a seller who adds something and
   * does not see it adds it again. That is the duplicate-row failure §35
   * describes, reproduced in the client.
   */
  const [groups, setGroups] = useState(initialGroups);

  /**
   * Re-seeded when the server sends a different list, DURING render.
   *
   * Not in an effect. An effect that calls setState runs after the paint, so
   * the seller would see one frame of the old list — and on a tab they had
   * just added a specification to, that frame is the specification
   * disappearing and coming back. Comparing the prop against the last one
   * rendered is React's own documented answer to "adjust state when a prop
   * changes", and it re-renders before anything reaches the screen.
   */
  const [seenFromServer, setSeenFromServer] = useState(initialGroups);
  if (seenFromServer !== initialGroups) {
    setSeenFromServer(initialGroups);
    setGroups(initialGroups);
  }

  const [query, setQuery] = useState("");
  const [commonOnly, setCommonOnly] = useState(true);
  const [active, setActive] = useState(initialGroups[0]?.key ?? null);
  const [adding, setAdding] = useState(false);
  /** The specification being edited, or null. One dialog serves both. */
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  /** The section being renamed, or "new" while one is being added. */
  const [editingSection, setEditingSection] = useState(null);

  const set = (id, value) => onChange?.({ ...values, [id]: value });
  const clear = (id) => {
    const next = { ...values };
    delete next[id];
    onChange?.(next);
  };

  /**
   * Rows that are ticked but hold no value YET.
   *
   * ── The bug this exists to fix ────────────────────────────────────────
   *
   * Ticked-ness used to be read off the value alone — `isSet(values[id])` —
   * and ticking a row that needs a value wrote the empty string into it. But
   * `isSet("")` is FALSE, so the row read as un-ticked the instant it was
   * ticked: the checkbox sprang back off and the number box, dropdown or text
   * field never appeared at all. Every one of the 105 template entries that is
   * not a plain yes/no was unanswerable, and so was every custom one whose
   * type was anything but "Yes / no".
   *
   * It could not be fixed by choosing a better empty value, because the two
   * states are genuinely different and one value cannot hold both: "this car
   * has a sunroof" is a complete answer, while "this car's mileage is …" is a
   * tick plus a box still to fill. An empty string also could not be stored —
   * save-listing drops empty values, which is right, so the tick had nothing
   * to persist.
   *
   * So the tick lives here and the value lives in `values`. A row is ticked
   * when it has a value OR it is in this set, and only a real value is ever
   * saved — which means a row left ticked and blank saves nothing, exactly as
   * it should.
   */
  const [open, setOpen] = useState(() => new Set());

  const openRow = (id) => setOpen((s) => (s.has(id) ? s : new Set(s).add(id)));
  const closeRow = (id) =>
    setOpen((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  const toggle = (item) => {
    if (isSet(values[item.id]) || open.has(item.id)) {
      closeRow(item.id);
      return clear(item.id);
    }
    /* The tick alone is a complete answer for 193 of the 298 — "the car has a
       sunroof". The rest get the tick AND an empty box to fill. */
    if (item.kind === "check") return set(item.id, TICK);
    return openRow(item.id);
  };

  /**
   * A value arriving from a row's own control.
   *
   * Emptying the box keeps the row TICKED and the box on screen. The old
   * behaviour wrote "" back, which un-ticked the row and took the control away
   * mid-edit — so deleting a digit to retype it made the field vanish.
   */
  const onRowValue = (item, v) => {
    if (isSet(v)) {
      closeRow(item.id);
      return set(item.id, v);
    }
    openRow(item.id);
    return clear(item.id);
  };

  /* ── The three definition-level actions ──────────────────────────────────
     Separate results, like TeamManager's four: an error from clearing one
     specification must not sit on screen while the seller edits another. */
  const refreshRow = useCallback(
    (fn) => setGroups((gs) => gs.map((g) => ({ ...g, items: g.items.map(fn) }))),
    [],
  );

  const add = useActionResult(addSpecification, { ok: false, error: null }, {
    onSuccess: (res) => {
      const def = res?.definition;
      if (!def) return;
      setAdding(false);
      const gs0 = groups;
      /* Appended to its own section rather than refetched, and matched by
         NAME because that is what the row carries — §36 gave sections a table
         but the name is still denormalised onto the specification, which is
         what the car page reads. Searched over the SHOWROOM's rail, so a
         specification filed under a section they added lands in it. */
      const name = def.category_name?.en || def.category_name?.ar;
      const cat = gs0.find((g) => g.nameEn === name || g.nameAr === name || g.name === name);
      setGroups((gs) =>
        gs.map((g) =>
          g.key === cat?.key
            ? {
                ...g,
                items: [...g.items, {
                  id: def.id,
                  slug: def.slug,
                  name: localized(def.attribute_name, locale),
                  nameAr: def.attribute_name?.ar ?? "",
                  nameEn: def.attribute_name?.en ?? "",
                  kind: KIND_BY_DISPLAY[def.display_type] ?? "text",
                  unit: def.unit_code ? localized(def.unit_code, locale) : null,
                  icon: def.icon ?? null,
                  showOnCard: false,
                  isKey: false,
                  /* The answers the action just created, NOT an empty list.
                     Discarding them here is why a dropdown added from the
                     dialog showed "No answers defined" until the page was
                     reloaded — the row was in the list, its answers were in
                     the database, and the only copy that mattered to the
                     screen had thrown them away. createCustomSpec returns
                     them on the definition for exactly this. */
                  choices: (def.options ?? []).map((o) => ({ id: o.id, name: o.name })),
                  fromTemplate: false,
                  saved: true,
                  custom: true,
                  usedBy: 0,
                  justAdded: true,
                }],
              }
            : g,
        ),
      );
      if (cat?.key) setActive(cat.key);
    },
  });

  const drop = useActionResult(removeSpecification, { ok: false, error: null }, {
    onAny: () => setBusyId(null),
    onSuccess: (res) => {
      const gone = res?.removedId;
      if (!gone) return;
      setGroups((gs) => gs.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== gone) })));
      /* Its answer goes with it. Leaving the tick would send save-listing an
         attribute_id that no longer exists, and the insert would fail the whole
         save over a row the seller had just deleted on purpose. */
      if (values[gone] !== undefined) clear(gone);
    },
  });

  /* ── The rail's headings ────────────────────────────────────────────────
     Their own results, like every other write on this tab: an error from
     renaming a section must not sit on screen while the seller ticks a box. */
  const addSection = useActionResult(addSpecSection, { ok: false, error: null }, {
    onSuccess: () => { setEditingSection(null); router.refresh(); },
  });
  const renameSection = useActionResult(editSpecSection, { ok: false, error: null }, {
    onSuccess: () => { setEditingSection(null); router.refresh(); },
  });
  const dropSection = useActionResult(removeSpecSection, { ok: false, error: null }, {
    onSuccess: () => { setEditingSection(null); router.refresh(); },
  });

  const edit = useActionResult(updateSpecification, { ok: false, error: null }, {
    /* The dialog closes only on a SUCCESS, so a refusal — a name taken, the
       card already full — stays on screen with what was typed still in it.
       The refresh is what brings the new name, type and answer list back down
       onto the row: an edit changes more than a flag, and the action returns
       only the id. */
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
    onAny: (res) => {
      setBusyId(null);
      /* A `tpl:` row that has just been created gets its real id, here and in
         the values map — otherwise the next flag on the same row would try to
         create it a second time. */
      const { id, was } = res ?? {};
      if (!id || !was || id === was) return;
      refreshRow((i) => (i.id === was ? { ...i, id, saved: true } : i));
      if (values[was] !== undefined) {
        const next = { ...values };
        next[id] = next[was];
        delete next[was];
        onChange?.(next);
      }
      /* The ticked-but-still-empty set is keyed by id as well, so a row that
         was a `tpl:` placeholder a moment ago would otherwise lose its tick
         and its open box the moment the definition was created for it. */
      setOpen((s) => {
        if (!s.has(was)) return s;
        const nextOpen = new Set(s);
        nextOpen.delete(was);
        nextOpen.add(id);
        return nextOpen;
      });
    },
  });

  /* ── Filtering ──────────────────────────────────────────────────────────── */

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => {
          /* An ANSWERED specification is never filtered away. A seller who
             ticked something and then switched on "common only" would see it
             vanish and conclude the tick was lost — and the hidden row would
             still be saved, which is the worst of both.

             Neither is one the showroom MADE. createCustomSpec stores
             `is_key: false` — it is not one of the template's 82 common
             entries, because it is not the template's at all — so "Common
             only", which is ON by default, hid every specification a seller
             added the moment the page was refreshed. It survived until then
             only because `justAdded` was set in client state, which is why it
             looked like the save had worked and then been undone: the row was
             in the database the whole time, and this filter was taking it off
             the screen. Somebody who types out a specification of their own
             has said plainly that it matters to them. */
          const answered = isSet(values[i.id]);
          if (commonOnly && !i.isKey && !i.custom && !answered && !i.justAdded) return false;
          if (!q) return true;
          return `${i.nameAr} ${i.nameEn} ${i.slug}`.toLowerCase().includes(q);
        }),
      }))
      /**
       * An empty section STAYS on the rail when the showroom made it.
       *
       * A section is created before anything is filed under it — that is the
       * whole point of §36 giving one a row of its own — so dropping empty
       * groups here made a newly added section vanish the moment the dialog
       * closed, which reads exactly like a failed save. mergeTemplate already
       * keeps it for this reason; this filter was undoing that.
       *
       * Only while NOT searching. An empty section is not a search result, and
       * a rail that kept it during a search would be answering a question
       * nobody asked.
       */
      .filter((g) => g.items.length || (g.custom && !q));
  }, [groups, query, commonOnly, values]);

  /* A section can empty out under a filter — fall back rather than render a
     blank panel under a tab that no longer exists. */
  const shown = searching
    ? visible
    : visible.filter((g) => g.key === active).length
      ? visible.filter((g) => g.key === active)
      : visible.slice(0, 1);

  const answeredIn = (g) => g.items.filter((i) => isSet(values[i.id])).length;
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const answered = groups.reduce((n, g) => n + answeredIn(g), 0);
  const pct = total ? Math.round((answered / total) * 100) : 0;

  const field =
    "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs outline-hidden transition-colors focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]";

  if (!groups.length) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400 dark:border-gray-600">
        {t("قائمة المواصفات غير متاحة الآن.", "The specification list is unavailable right now.")}
      </p>
    );
  }

  return (
    <div>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-300 px-2.5 dark:border-gray-600">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث في كل المواصفات…", "Search every specification…")}
            className="w-full bg-transparent text-sm outline-hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t("مسح", "Clear")}>
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          ) : null}
        </div>

        {/* Default ON. 298 entries open as 82 common ones, which is a tab
            somebody finishes; opening on all of them is a tab they abandon.
            Everything is one click away and the count says how many. */}
        <button
          type="button"
          onClick={() => setCommonOnly((v) => !v)}
          aria-pressed={commonOnly}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
            commonOnly
              ? "border-brand-primary bg-brand-primary text-white"
              : "border-gray-300 hover:border-brand-primary dark:border-gray-600"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${commonOnly ? "fill-current" : ""}`} />
          {commonOnly ? t("الشائعة فقط", "Common only") : t("كل المواصفات", "All specifications")}
        </button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          className="h-9 shrink-0 gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("مواصفة جديدة", "New specification")}
        </Button>
      </div>

      {/* ── What the car cards show ──────────────────────────────────────────
          At the TOP, above the 298 rows, because it is the one choice here
          that is about the whole showroom rather than this car — and because
          the four it holds were previously invisible: the flag lived on a
          button on each row, so "which four are on the card" could only be
          answered by hovering 298 of them. */}
      <CardPicker
        groups={groups}
        locale={locale}
        t={t}
        limit={CARD_LIMIT}
        vendorId={vendorId}
        busyId={busyId}
        action={edit.formAction}
        onBusy={setBusyId}
      />

      <div className="mb-4 flex items-center gap-3">
        <Progress value={pct} className="h-1.5 flex-1 [&>div]:bg-brand-primary" />
        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {answered}/{total} {t("محددة", "ticked")}
        </span>
      </div>

      {/* Errors from the three definition actions. One strip, because only one
          of them can be mid-flight on a row at a time. */}
      {[drop.result, edit.result, add.result,
        addSection.result, renameSection.result, dropSection.result]
        .filter((r) => r && !r.ok && r.error)
        .slice(0, 1)
        .map((r) => (
          <p
            key="err"
            className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {errorText(r.error, locale)}
            {r.usedBy ? ` — ${t(`${r.usedBy} سيارة`, `${r.usedBy} car(s)`)}` : ""}
          </p>
        ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* ── Section rail ───────────────────────────────────────────────── */}
        <nav
          className={`flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible ${
            searching ? "pointer-events-none opacity-40" : ""
          }`}
          aria-label={t("الأقسام", "Sections")}
        >
          {visible.map((g) => {
            const done = answeredIn(g);
            const on = !searching && g.key === shown[0]?.key;

            return (
              /* The row is a button AND carries a button, which cannot nest —
                 so the heading is the button and the pencil is a sibling
                 absolutely placed over its end. A <button> inside a <button>
                 is invalid HTML and the browser un-nests it, which is the same
                 class of bug as the nested forms this file already carries a
                 note about. */
              <div key={g.key} className="group/sec relative flex shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActive(g.key)}
                  aria-current={on ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 pe-9 text-start text-xs transition-colors ${
                    on
                      ? "border-brand-primary bg-brand-primary text-white"
                      : "border-gray-200 hover:border-brand-primary dark:border-gray-700"
                  }`}
                >
                  {/* No `brightness-0 invert` any more. These icons inherit
                      currentColor, so the white text on the selected tab IS the
                      icon's colour — see ui/SpecGlyph.jsx. */}
                  <SpecGlyph icon={g.icon} className="h-4 w-4" />
                  <span className="flex-1 whitespace-nowrap font-medium lg:whitespace-normal">
                    {g.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 text-[10px] tabular-nums ${
                      on ? "bg-white/20" : done ? "bg-brand-primary/10 text-brand-primary" : "text-gray-400"
                    }`}
                  >
                    {done ? `${done}/${g.items.length}` : g.items.length}
                  </span>
                </button>

                {/* Shown on the SECTION THE SELLER IS ON, and on hover for the
                    rest — the same rule the row controls follow, and for the
                    same reason: hover does not exist on a phone, so a pencil
                    that only appears on hover is a control a touch user cannot
                    reach at all. It is also the only way to rename or delete a
                    section, which is not something to hide behind a pointer.
                    A pencil on all fifteen at once would make the rail look
                    like a settings list rather than a place to navigate, which
                    is why the inactive ones still wait for the pointer. */}
                <button
                  type="button"
                  onClick={() => setEditingSection(g.key)}
                  aria-label={t(`عدّل قسم ${g.name}`, `Edit the ${g.name} section`)}
                  title={t("عدّل القسم", "Edit section")}
                  className={`absolute end-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-opacity focus:opacity-100 group-hover/sec:opacity-100 ${
                    on
                      ? "text-white/80 opacity-100 hover:bg-white/15"
                      : "text-gray-400 opacity-0 hover:bg-gray-100 dark:hover:bg-white/10"
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Add one. At the END of the rail rather than beside the search, so
              it reads as "and another section" instead of a second kind of
              Add next to the one that adds a specification. */}
          <button
            type="button"
            onClick={() => setEditingSection("new")}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-start text-xs text-gray-500 transition-colors hover:border-brand-primary hover:text-brand-primary lg:shrink dark:border-gray-600"
          >
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap font-medium">{t("قسم جديد", "New section")}</span>
          </button>
        </nav>

        {/* ── The checklist ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          {shown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400 dark:border-gray-600">
              {commonOnly
                ? t(
                    "لا نتائج بين الشائعة — اعرض كل المواصفات.",
                    "Nothing matches among the common ones — show all specifications.",
                  )
                : t("لا نتائج", "Nothing matches")}
            </p>
          ) : null}

          {shown.map((group) => (
            <div key={group.key}>
              {searching ? (
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-primary">
                  <SpecGlyph icon={group.icon} className="h-4 w-4" />
                  {group.name}
                </h3>
              ) : null}

              {/* A section the showroom just created, with nothing in it yet.
                  It stays on the rail (see the filter above) so it has to say
                  something here other than rendering an empty bordered box —
                  and the thing to say is how to fill it. */}
              {group.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-600">
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {t(
                      "لا توجد مواصفات في هذا القسم بعد.",
                      "Nothing in this section yet.",
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAdding(true)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("أضف مواصفة إليه", "Add a specification to it")}
                  </Button>
                </div>
              ) : null}

              {/* Two columns from lg. The names are short and the list is
                  long — one column left half the screen empty and doubled the
                  scrolling on the tab somebody has to get through 299 times. */}
              <div className={`grid overflow-hidden rounded-lg border border-gray-200 lg:grid-cols-2 dark:border-gray-700 ${group.items.length ? "" : "hidden"}`}>
                {group.items.map((item) => (
                  <SpecRow
                    key={item.id}
                    item={item}
                    value={values[item.id]}
                    locale={locale}
                    t={t}
                    field={field}
                    vendorId={vendorId}
                    iconsMissing={iconsMissing}
                    busy={busyId === item.id}
                    open={open.has(item.id)}
                    onToggle={() => toggle(item)}
                    onValue={(v) => onRowValue(item, v)}
                    onDropAction={drop.formAction}
                    onEditAction={edit.formAction}
                    /* The group's key travels with the item: the merged item
                       carries its section's NAME but not its key, and the
                       dialog's heading Select is keyed. */
                    onEdit={() => setEditing({ ...item, sectionKey: group.key })}
                    onBusy={() => setBusyId(item.id)}
                  />
                ))}
              </div>

              {/* ── Add one to THIS section ──────────────────────────────
                  Under every section, not only the empty ones. The toolbar's
                  "New specification" button is at the top of the tab and the
                  seller is at the bottom of a list of forty rows by the time
                  they know the one they want is missing — so the button is
                  where that happens, and it opens on the section they are
                  looking at (see `defaultSection`).

                  Hidden while searching: results span every section, so
                  "add to this section" has no section to mean. */}
              {/* `> 0`, not a bare length: `0 && …` is `0`, and React
                  renders that as the character "0" under the list. */}
              {group.items.length > 0 && !searching ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-[11px] font-medium text-gray-500 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-gray-600 dark:text-gray-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t(
                    `أضف مواصفة إلى «${group.name}»`,
                    `Add a specification to "${group.name}"`,
                  )}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <SectionDialog
        /* "new" is a key no section can have — §36 slugifies, and `new` would
           be a legitimate slug, so the sentinel is compared before the list is
           searched rather than being looked up in it. */
        sectionKey={editingSection}
        groups={groups}
        locale={locale}
        t={t}
        vendorId={vendorId}
        iconsMissing={iconsMissing}
        fieldMode={fieldMode}
        onClose={() => setEditingSection(null)}
        addAction={addSection.formAction}
        editAction={renameSection.formAction}
        dropAction={dropSection.formAction}
        pending={addSection.pending || renameSection.pending || dropSection.pending}
      />

      {/* One dialog for adding AND editing — it is the same five questions
          either way (name, type, answers, unit, heading), and two dialogs
          would be two places to keep the answer-row editor. Which one it is
          depends on `editing`. */}
      <SpecDialog
        open={adding || Boolean(editing)}
        editing={editing}
        onOpenChange={(next) => {
          if (next) return;
          setAdding(false);
          setEditing(null);
        }}
        locale={locale}
        t={t}
        vendorId={vendorId}
        iconsMissing={iconsMissing}
        fieldMode={fieldMode}
        /* The rail, minus the catch-all: "Your own specifications" is where
           unmatched legacy rows land, not somewhere to file a new one. */
        sections={groups.filter((g) => g.key !== "own")}
        /* The section the seller is LOOKING AT. Adding from inside "test" and
           being handed "Interior" is the dialog ignoring where the click came
           from — and the Add button inside an empty section exists precisely
           to fill THAT section. */
        defaultSection={active}
        action={editing ? edit.formAction : add.formAction}
        pending={editing ? edit.pending : add.pending}
        error={
          editing
            ? edit.result && !edit.result.ok
              ? edit.result.error
              : null
            : add.result && !add.result.ok
              ? add.result.error
              : null
        }
      />
    </div>
  );
}

/* display_type → kind, for a row this component has just created and so has no
   merged template entry for. The same map lib/spec-template.js exports; copied
   as a constant rather than imported because importing the server-shaped module
   for one object would pull the whole 298-entry template into this bundle. */
const KIND_BY_DISPLAY = {
  yesno: "check",
  numeric: "number",
  select: "choice",
  multi: "multi",
  text: "text",
  date: "date",
  longtext: "longtext",
};

/* ── The four that show on the card ───────────────────────────────────────── */

/**
 * Which specifications the showroom's car cards print, chosen in one place.
 *
 * ── Why this panel exists ─────────────────────────────────────────────────
 *
 * The flag has always been a small button on each of 298 rows, which made the
 * question a seller actually has — "which ones are on my cards?" — answerable
 * only by hovering every row in every section. Worse, getCardSpecs takes four
 * and picks them by a sort order nobody can see, so a showroom with eleven
 * flagged had seven that did nothing while looking exactly as switched-on as
 * the four that showed.
 *
 * So the choice is collected here, capped at four, and the cap is enforced on
 * the server (see CARD_LIMIT) because two tabs would otherwise agree on five.
 *
 * ── Over the limit is a real state, and it is not an error ────────────────
 *
 * A database that predates the cap can hold more than four — this one holds
 * eleven. The panel shows all of them with a line saying which four the card
 * will print, rather than refusing to render or silently hiding the rest:
 * taking one off has to be possible from the screen that reports the problem.
 */
function CardPicker({ groups, locale, t, limit, vendorId, busyId, action, onBusy }) {
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);

  /* Read off the live client list rather than a prop of its own. The row
     buttons and this panel write the same flag, so a separate server prop
     would disagree with the rows until the next revalidation landed. */
  const chosen = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.filter((i) => i.showOnCard).map((i) => ({ item: i, section: g.name })),
      ),
    [groups],
  );

  const full = chosen.length >= limit;
  const over = chosen.length > limit;

  /**
   * What the Add list offers.
   *
   * With no search it is the template's OWN suggestions (`entry.card` — the
   * twelve it considers card-worthy) plus anything the showroom has already
   * saved, which between them is a short, relevant list. Searching widens it
   * to all 298, because the seller who wants wading depth on their cards is
   * entitled to it and should not have to guess that it is not suggested.
   */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = groups.flatMap((g) =>
      g.items.filter((i) => !i.showOnCard).map((i) => ({ item: i, section: g.name })),
    );

    const matched = q
      ? all.filter(({ item }) =>
          [item.name, item.nameAr, item.nameEn, item.slug].some((s) =>
            String(s ?? "").toLowerCase().includes(q),
          ),
        )
      : all.filter(({ item }) => item.suggested || item.saved);

    return matched.slice(0, 80);
  }, [groups, query]);

  /* No <form>: see the note at the top of this file — one in here is nested
     inside the listing's own form and its submit button saves the car. */
  const flag = (item, next) => {
    onBusy(item.id);
    const payload = new FormData();
    payload.set("vendorId", vendorId ?? "");
    payload.set("specId", item.id);
    payload.set("showOnCard", next ? "true" : "false");
    startTransition(() => action(payload));
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-white/[0.02]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CreditCard className="h-4 w-4 shrink-0 text-brand-primary" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          {t("تظهر على بطاقات السيارات", "Shown on your car cards")}
        </span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
            over
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
              : "bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300"
          }`}
        >
          {chosen.length}/{limit}
        </span>

        <span className="flex-1" />

        {/* ── Add ──────────────────────────────────────────────────────── */}
        <Popover open={picking} onOpenChange={(next) => { setPicking(next); if (!next) setQuery(""); }}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={full}
              title={
                full
                  ? t(
                      `البطاقة تتسع لـ ${limit} مواصفات. أزِل واحدة أولاً.`,
                      `A card holds ${limit}. Take one off first.`,
                    )
                  : undefined
              }
              className="h-7 gap-1 text-[11px]"
            >
              <Plus className="h-3 w-3" />
              {t("أضف", "Add")}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align={locale === "ar" ? "start" : "end"}
            className="w-72 p-0"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-center gap-1.5 border-b border-gray-200 px-2.5 py-2 dark:border-gray-700">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("ابحث…", "Search…")}
                className="w-full bg-transparent text-xs outline-hidden"
              />
            </div>

            <div className="max-h-64 overflow-y-auto p-1">
              {candidates.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-gray-400">
                  {t("لا نتائج", "Nothing matches")}
                </p>
              ) : null}

              {candidates.map(({ item, section }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { flag(item, true); setPicking(false); setQuery(""); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs transition-colors hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <SpecGlyph icon={item.icon} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">{section}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── The chosen ones, in the order the card prints them ─────────── */}
      {chosen.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          {t(
            `لم تختر شيئاً بعد، فبطاقات سياراتك لا تعرض مواصفات. اختر حتى ${limit}.`,
            `Nothing chosen yet, so your car cards show no specifications. Pick up to ${limit}.`,
          )}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map(({ item, section }, i) => (
            <span
              key={item.id}
              title={section}
              className={`group/chip flex items-center gap-1.5 rounded-full border py-1 ps-2.5 pe-1 text-[11px] transition-colors ${
                /* Beyond the limit the card will not print it, and saying so
                   on the chip itself is what makes the count actionable. */
                i < limit
                  ? "border-brand-primary/30 bg-brand-primary/[0.07] text-gray-700 dark:text-gray-200"
                  : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              <SpecGlyph icon={item.icon} className="h-3 w-3 shrink-0" fallback={null} />
              <span className="max-w-[140px] truncate">{item.name}</span>
              <button
                type="button"
                onClick={() => flag(item, false)}
                disabled={busyId === item.id}
                aria-label={t(`أزِل ${item.name}`, `Remove ${item.name}`)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/50"
              >
                {busyId === item.id ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <X className="h-2.5 w-2.5" />
                )}
              </button>
            </span>
          ))}
        </div>
      )}

      {over ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {t(
            `اخترت ${chosen.length}، والبطاقة تطبع أول ${limit} فقط. أزِل المميّزة بالبرتقالي لتختار بنفسك ما يظهر.`,
            `You have ${chosen.length} and a card prints only the first ${limit}. Remove the amber ones to decide for yourself what shows.`,
          )}
        </p>
      ) : null}
    </div>
  );
}

/* ── One row ──────────────────────────────────────────────────────────────── */

function SpecRow({
  item, value, locale, t, field, vendorId, iconsMissing, busy, open = false,
  onToggle, onValue, onDropAction, onEditAction, onEdit, onBusy,
}) {
  /* A value OR an explicit tick with the box still empty — see `open` in the
     parent for why those are two states and not one. */
  const ticked = isSet(value) || open;
  const needsValue = ticked && item.kind !== "check";

  /**
   * One definition-level write, without a form.
   *
   * See the note at the top of this file: a <form> in here is nested inside
   * the listing's own form, so its submit button saves the car. The action is
   * dispatched with a FormData built right here instead.
   */
  const dispatch = (action, fields) => {
    onBusy();
    const payload = new FormData();
    payload.set("vendorId", vendorId ?? "");
    payload.set("specId", item.id);
    for (const [k, v] of Object.entries(fields)) payload.set(k, v);
    /* See the note at the top: a dispatch outside a transition leaves
       `pending` stuck at false. */
    startTransition(() => action(payload));
  };

  /* A saved row that no car answers can be cleared. A template entry that was
     never saved has nothing to clear, and one that cars answer must not be —
     so the button is simply absent rather than present and failing. */
  const removable = item.saved && !item.usedBy;

  return (
    <div
      /* `@container`: the control below is sized against THIS ROW, not the
         viewport. The rows sit in a two-column grid inside a 220px-rail
         layout, so a cell is about 470px wide on a 1300px screen — a
         `sm:` breakpoint asks the window how wide it is and gets an answer
         about the wrong box, which is why a 190px dropdown sat beside a name
         that had been squeezed to nothing. */
      className={`group/row @container flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-gray-100 px-2.5 py-2 transition-colors lg:odd:border-e dark:border-gray-800 ${
        ticked ? "bg-brand-primary/[0.04]" : "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
      }`}
    >
      {/* The tick, and the whole name is its label — a 2px checkbox is not a
          target on a phone. */}
      {/* `min-w-[7rem]`: without a floor, `flex-1 min-w-0` shrinks the name
          to zero rather than pushing the value control onto its own line —
          which is exactly what happened, leaving a ticked row showing a
          checkbox, an icon and a dropdown with no label at all. */}
      <label className="flex min-w-[7rem] flex-1 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={ticked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
        />
        <SpecGlyph
          icon={item.icon}
          className={`h-4 w-4 ${ticked ? "text-brand-primary" : "text-gray-400"}`}
        />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300">
          {item.name}
          {item.unit ? <span className="text-gray-400"> ({item.unit})</span> : null}
          {item.custom ? (
            <span className="ms-1.5 rounded-sm bg-gray-100 px-1 text-[9px] text-gray-500 dark:bg-white/10 dark:text-gray-400">
              {t("خاصة بك", "yours")}
            </span>
          ) : null}

          {/* ── What a list actually offers ────────────────────────────────
              A dropdown row used to show nothing but its name, so the
              answers it holds were invisible until the row was ticked AND
              the Select opened — which meant a seller could not tell a list
              they had filled in from one that was empty, could not check
              that an edit had saved, and had no way to see that the answers
              were wrong before a car was described with them.

              Printed only while UN-ticked: once ticked, the control below is
              showing the same answers and repeating them is noise. */}
          {!ticked && (item.kind === "choice" || item.kind === "multi") ? (
            <span className="mt-0.5 block truncate text-[10px] text-gray-400 dark:text-gray-500">
              {item.choices.length === 0
                ? t("لا توجد إجابات بعد", "no answers yet")
                : item.choices
                    .slice(0, 4)
                    .map((c) => localized(c.name, locale))
                    .join(" · ") +
                  (item.choices.length > 4 ? ` +${item.choices.length - 4}` : "")}
            </span>
          ) : null}
        </span>
      </label>

      {/* ── The value, only once ticked ───────────────────────────────────
          On its own line until the ROW is wide enough to hold a name, a
          control and the buttons side by side; `order-last` keeps it below
          them rather than between the name and the buttons when it wraps. */}
      {needsValue ? (
        <div className="order-last w-full @[27rem]:order-none @[27rem]:w-[170px]">
          {item.kind === "choice" ? (
            <Select
              /* The option's id when the catalog has one, so the answer can be
                 filtered on; the English text when the definition does not
                 exist yet, which save-listing swaps for the id the moment it
                 creates it (ensureSpecDefinitions). Without that swap the same
                 answer would be an id on one car and text on another, and the
                 browse facet would list it twice. */
              value={typeof value === "string" ? value : value?.en || ""}
              onValueChange={(v) => {
                const chosen = item.choices.find((c) => (c.id ?? c.name?.en) === v);
                onValue(chosen?.id ?? (chosen ? { ar: chosen.name?.ar, en: chosen.name?.en } : v));
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("اختر…", "Choose…")} />
              </SelectTrigger>
              <SelectContent>
                {item.choices.map((c) => (
                  <SelectItem key={c.id ?? c.name?.en} value={c.id ?? c.name?.en} className="text-xs">
                    {localized(c.name, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : item.kind === "multi" ? (
            /* Several answers at once — "Driving modes", "Safety features".
               Stored as an ARRAY, which save-listing already understands: it
               joins the labels for display_value and keeps the array as the
               durable answer. Each entry is an option id where the catalog has
               one and a bilingual pair where it does not, exactly as a single
               choice is. */
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-1.5 dark:border-gray-700">
              {item.choices.length === 0 ? (
                <p className="px-1 py-0.5 text-[10px] text-gray-400">
                  {t("لا توجد إجابات", "No answers defined")}
                </p>
              ) : null}
              {item.choices.map((c) => {
                const key = c.id ?? c.name?.en;
                const chosen = Array.isArray(value) ? value : [];
                const on = chosen.some((v) => (typeof v === "string" ? v : v?.en) === key);
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-1.5 px-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = on
                          ? chosen.filter((v) => (typeof v === "string" ? v : v?.en) !== key)
                          : [...chosen, c.id ?? { ar: c.name?.ar, en: c.name?.en }];
                        /* An empty list is not an answer — it un-ticks the row
                           rather than saving a car that "has" nothing. */
                        onValue(next.length ? next : "");
                      }}
                      className="h-3.5 w-3.5 accent-[var(--brand-primary)]"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {localized(c.name, locale)}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : item.kind === "number" ? (
            <input
              type="number"
              step="any"
              value={typeof value === "object" ? "" : value ?? ""}
              onChange={(e) => onValue(e.target.value)}
              className={field}
              placeholder={item.unit || "0"}
            />
          ) : item.kind === "date" ? (
            /* The plain ISO string the input produces — stored as typed, so
               it sorts and compares without parsing, and the car page prints
               it through display_value like any other answer. */
            <input
              type="date"
              value={typeof value === "object" ? "" : value ?? ""}
              onChange={(e) => onValue(e.target.value)}
              className={field}
            />
          ) : item.kind === "longtext" ? (
            <textarea
              rows={3}
              value={typeof value === "object" ? localized(value, locale) : value ?? ""}
              onChange={(e) =>
                /* Same rule as the one-line box below: a value already stored
                   as {ar, en} keeps the language this seller is not looking
                   at. */
                onValue(
                  value && typeof value === "object"
                    ? { ...value, [locale]: e.target.value }
                    : e.target.value,
                )
              }
              className={`${field} h-auto py-1.5 leading-relaxed`}
              placeholder={t("اكتب…", "Write…")}
            />
          ) : (
            <input
              type="text"
              value={typeof value === "object" ? localized(value, locale) : value ?? ""}
              onChange={(e) =>
                /* A value already stored as {ar, en} keeps the language this
                   seller is NOT looking at. Writing a bare string here would
                   flatten a translated answer — "جلد أسود" / "Black leather"
                   becomes whichever one happened to be typed last, in both.
                   A fresh answer stays a plain string, so nothing existing has
                   to be migrated and a single-language store is unaffected. */
                onValue(
                  value && typeof value === "object"
                    ? { ...value, [locale]: e.target.value }
                    : e.target.value,
                )
              }
              className={field}
              placeholder={t("القيمة", "Value")}
            />
          )}
        </div>
      ) : null}

      {/* ── Definition-level controls ─────────────────────────────────────
          Hidden until the row is TICKED or hovered.

          The job on this tab is ticking, and three buttons on each of 299
          rows made a list of checkboxes look like a settings screen. None of
          the three is about describing this car: the icon and the card flag
          belong to the showroom's catalog and are set once, and clearing a
          specification is rarer still.

          Ticked OR hovered rather than hovered alone, because hover does not
          exist on a phone — ticking a row is what reveals them there, which is
          also the moment they start to matter. `focus-within` keeps them
          reachable by keyboard, and the empty slot below holds the width so
          names do not shift as the pointer moves down the list. */}
      <div
        className={`flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 ${
          ticked ? "opacity-100" : "opacity-0"
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : null}

        {/* ── Edit: the name, the TYPE, its answers, the unit, the heading ──
            The type was previously set once, at creation, and unchangeable —
            so a seller who picked "Yes / no" and meant a dropdown had to clear
            the specification and add it again, which is refused outright the
            moment a car answers it. */}
        <button
          type="button"
          onClick={onEdit}
          title={t("عدّل هذه المواصفة ونوعها", "Edit this specification and its type")}
          aria-label={t("تعديل", "Edit")}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-400 transition-colors hover:border-brand-primary hover:text-brand-primary"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        {/* Show on card. */}
        <button
          type="button"
          onClick={() => dispatch(onEditAction, { showOnCard: item.showOnCard ? "false" : "true" })}
          title={t(
            /* Said plainly, because it is the one control here that is not
               about this car. */
            item.showOnCard
              ? "يظهر على بطاقات كل سيارات المعرض — اضغط للإلغاء"
              : "أظهِره على بطاقات كل سيارات المعرض",
            item.showOnCard
              ? "Shows on every card in your showroom — click to stop"
              : "Show this on every card in your showroom",
          )}
          aria-label={t("يظهر على البطاقة", "Show on card")}
          aria-pressed={item.showOnCard}
          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
            item.showOnCard
              ? "border-brand-primary bg-brand-primary text-white"
              : "border-dashed border-gray-300 text-gray-400 hover:border-brand-primary hover:text-brand-primary dark:border-gray-600"
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
        </button>

        {/* The icon. Posted through a hidden field the picker writes into,
            submitted on change — a <select>-shaped control that needed a
            separate Save button would be a control nobody uses. */}
        {iconsMissing ? null : (
          <IconPickerForm
            item={item}
            vendorId={vendorId}
            locale={locale}
            action={onEditAction}
            onBusy={onBusy}
          />
        )}

        {removable ? (
          <button
            type="button"
            onClick={() => dispatch(onDropAction, {})}
            title={t("احذف هذه المواصفة من قائمة معرضك", "Remove this specification from your showroom's list")}
            aria-label={t("حذف", "Remove")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-300 transition-colors hover:border-red-200 hover:text-red-600 dark:text-gray-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : item.usedBy ? (
          <span
            title={t(
              `${item.usedBy} سيارة تستخدم هذه المواصفة، فلا يمكن حذفها`,
              `${item.usedBy} car(s) answer this, so it cannot be removed`,
            )}
            className="flex h-7 w-7 items-center justify-center text-[9px] tabular-nums text-gray-400"
          >
            {item.usedBy}
          </span>
        ) : (
          /* A template entry nobody has saved. The gap is deliberate: the row
             keeps the same width as its neighbours, so the column of controls
             does not jump about as the seller ticks things. */
          <span className="h-7 w-7" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/**
 * The icon picker, wired to the update action.
 *
 * ── It DISPATCHES the action rather than submitting a form ────────────────
 *
 * The first version put the chosen token in a hidden input and called
 * form.requestSubmit() once it had. That is a race, and a quiet one: setting
 * the token is a setState, so the hidden input still holds the OLD value until
 * React re-renders — and nothing guarantees that happens before a queued
 * submit reads the DOM. The failure is the worst kind to debug, because it
 * saves the PREVIOUS icon and looks like a stale cache.
 *
 * useActionState's dispatch takes a payload directly, so the FormData is built
 * here from values that are in hand. No hidden inputs, no ref, no form
 * element, nothing to be stale.
 */
function IconPickerForm({ item, vendorId, locale, action, onBusy }) {
  const [icon, setIcon] = useState(item.icon ?? null);

  /* The server is the authority: if the save failed, the row comes back with
     its old icon and the picker follows it rather than showing a choice that
     was not kept. Adjusted during render rather than in an effect, for the
     reason given on seenFromServer above — a rejected icon must not be on
     screen for a frame first. */
  const [seenIcon, setSeenIcon] = useState(item.icon ?? null);
  if (seenIcon !== (item.icon ?? null)) {
    setSeenIcon(item.icon ?? null);
    setIcon(item.icon ?? null);
  }

  return (
    <IconPicker
      value={icon}
      locale={locale}
      label={item.name}
      onChange={(token) => {
        setIcon(token);
        onBusy();

        const payload = new FormData();
        payload.set("vendorId", vendorId ?? "");
        payload.set("specId", item.id);
        payload.set("icon", token ?? "");
        startTransition(() => action(payload));
      }}
    />
  );
}

/* ── The rail's headings ──────────────────────────────────────────────────── */

/**
 * Add a section, rename one, give it a mark, or remove it.
 *
 * ── One dialog for both, because it is one act ────────────────────────────
 *
 * Adding "Armour" and renaming "Engine & transmission" write the same row —
 * §36 keys a section on (vendor, key) and upserts — and a seller doing either
 * is answering the same two questions: what is it called, and what mark does
 * it wear. Two dialogs would be two places to keep the icon picker.
 *
 * What differs is what they are told. Renaming one of the fifteen the
 * application ships ALSO rewrites the heading printed on every car page that
 * has a specification in it, and the dialog says so before they save rather
 * than after — a rename with that reach is not something to discover from a
 * car page.
 *
 * ── Remove means two different things, and it says which ─────────────────
 *
 * For a section they made, it deletes it, and §36 refuses while anything is
 * filed under it. For one the application ships, there is nothing to delete —
 * it forgets their rename and the heading goes back to what it was. Same
 * button, different sentence, because "delete Engine & transmission" would be
 * a promise this cannot keep.
 */
function SectionDialog({
  sectionKey, groups, locale, t, vendorId, iconsMissing, fieldMode,
  onClose, addAction, editAction, dropAction, pending,
}) {
  const creating = sectionKey === "new";
  const section = creating ? null : groups.find((g) => g.key === sectionKey) ?? null;
  const open = Boolean(sectionKey);

  const [name, setName] = useState({ ar: "", en: "" });
  const [icon, setIcon] = useState(null);
  const [confirmDrop, setConfirmDrop] = useState(false);

  /* Seeded from the section being opened, during render rather than in an
     effect — the same rule the rest of this file follows, and here it matters
     more: a frame of the PREVIOUS section's name in the box is a seller about
     to rename the wrong heading. */
  const [seen, setSeen] = useState(null);
  if (seen !== sectionKey) {
    setSeen(sectionKey);
    setName(section ? { ar: section.nameAr ?? "", en: section.nameEn ?? "" } : { ar: "", en: "" });
    setIcon(section?.icon ?? null);
    setConfirmDrop(false);
  }

  const inside = section?.items?.length ?? 0;

  const submit = () => {
    const payload = new FormData();
    payload.set("vendorId", vendorId ?? "");
    payload.set("ar", name.ar);
    payload.set("en", name.en);
    payload.set("icon", icon ?? "");
    if (creating) {
      startTransition(() => addAction(payload));
    } else {
      payload.set("sectionKey", sectionKey);
      startTransition(() => editAction(payload));
    }
  };

  const drop = () => {
    const payload = new FormData();
    payload.set("vendorId", vendorId ?? "");
    payload.set("sectionKey", sectionKey);
    startTransition(() => dropAction(payload));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-md" dir={locale === "ar" ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {creating ? t("قسم جديد", "New section") : t("تعديل القسم", "Edit section")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <BilingualField
            key={`section-${sectionKey}-${fieldMode}`}
            id="sectionName"
            label={t("اسم القسم", "Section name")}
            mode={fieldMode}
            locale={locale}
            ar={section?.nameAr ?? ""}
            en={section?.nameEn ?? ""}
            phAr="الدروع"
            phEn="Armour"
            required
            onChange={setName}
          />

          {iconsMissing ? null : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("الأيقونة", "Icon")}
              </span>
              <IconPicker value={icon} onChange={setIcon} locale={locale} label={section?.name} />
            </div>
          )}

          {/* What a rename reaches. Only when it reaches something. */}
          {!creating && inside > 0 ? (
            <p className="flex items-start gap-1.5 rounded-md bg-gray-50 px-2.5 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {t(
                `سيظهر الاسم الجديد فوق ${inside} مواصفة، وعلى صفحات السيارات التي أجابت عنها.`,
                `The new name will appear above ${inside} specification(s), and on the car pages that answered them.`,
              )}
            </p>
          ) : null}

          {creating ? (
            <p className="flex items-start gap-1.5 rounded-md bg-gray-50 px-2.5 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {t(
                "يُضاف إلى قائمة معرضك في آخر الأقسام، ويمكنك بعدها إضافة مواصفات إليه.",
                "It is added to your showroom's rail at the end, and you can then add specifications to it.",
              )}
            </p>
          ) : null}

          {confirmDrop ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {section?.custom
                ? inside > 0
                  ? t(
                      `سيُحذف هذا القسم، وتنتقل مواصفاته الـ${inside} إلى «مواصفاتك الخاصة». لا يُحذف شيء منها.`,
                      `This section goes, and its ${inside} specification(s) move to "Your own specifications". None of them is deleted.`,
                    )
                  : t("سيُحذف هذا القسم.", "This section will be deleted.")
                : t(
                    "سيعود هذا القسم إلى اسمه وأيقونته الأصليين.",
                    "This section goes back to the name and mark it ships with.",
                  )}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:gap-2">
          {/* Removing is offered only for a section that HAS a row: one the
              showroom made, or one they have renamed. There is nothing to undo
              on a shipped section nobody has touched. */}
          {!creating && section?.saved ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => (confirmDrop ? drop() : setConfirmDrop(true))}
              disabled={pending}
              className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDrop
                ? t("تأكيد", "Confirm")
                : section.custom
                  ? t("حذف القسم", "Delete section")
                  : t("استعادة الأصلي", "Reset to default")}
            </Button>
          ) : (
            <span />
          )}

          <span className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={pending || (!name.ar && !name.en)}
              className="gap-1.5"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {creating ? t("أضف", "Add") : t("احفظ", "Save")}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Adding one the template does not name, and editing any of them ───────── */

/**
 * The seller's own specification — created here, and corrected here.
 *
 * ── One dialog, because it is one set of questions ────────────────────────
 *
 * Adding "Glass roof" and fixing the type of one that already exists ask
 * exactly the same five things: what is it called, what kind of answer does it
 * take, what are the answers, what unit, which heading. `editing` decides
 * which action the answers are posted to.
 *
 * Editing the TYPE is the point of it. It used to be set once, at creation,
 * and a seller who chose "Yes / no" and meant a dropdown had no way back: the
 * only route was to clear the specification and add it again, and clearing is
 * refused outright once a car has answered it. Changing it is safe for those
 * cars — saveSpecs stores each answer's own label, so a sheet keeps printing
 * what it printed before — and what changes is the control the next car gets.
 *
 * ── It follows the store's authoring language ─────────────────────────────
 *
 * The first version showed two boxes, always — Arabic name and English name —
 * which is not how any other field on this form behaves. A showroom that set
 * its authoring language to Arabic is asked for one box everywhere else and
 * was asked for two here, and one that works in both gets the Both popup
 * everywhere else and two plain boxes here.
 *
 * BilingualField is that control, the same one the title, the description and
 * every other translatable field on this page use, driven by the same
 * `fieldMode`. Both languages are still submitted whatever the mode, so
 * switching the setting later never discards a translation.
 *
 * ── No <form>, deliberately ───────────────────────────────────────────────
 *
 * See the note at the top of this file. BilingualField posts through hidden
 * inputs, so the values are read from its onChange instead and the FormData
 * is built here.
 */
function SpecDialog({
  open, onOpenChange, locale, t, vendorId, iconsMissing, fieldMode, sections,
  defaultSection = null, editing = null, action, pending, error,
}) {
  const [kind, setKind] = useState("check");
  const [icon, setIcon] = useState(null);
  const [name, setName] = useState({ ar: "", en: "" });
  const [unit, setUnit] = useState({ ar: "", en: "" });

  /**
   * Which heading a new specification lands under.
   *
   * The SECTION THE SELLER IS LOOKING AT, first. Anything else is the dialog
   * ignoring where the click came from: the Add button inside an empty
   * section exists to fill that section, and handing it "Interior" meant the
   * specification went somewhere the seller then had to hunt for.
   *
   * "interior" survives only as the fallback for a rail position that is not
   * a real section — the catch-all is filtered out of `sections` — and it is
   * looked up rather than hardcoded, because a showroom can rename a heading
   * away and the action would refuse a key that no longer exists.
   */
  const fallbackSection =
    sections.find((c) => c.key === defaultSection)?.key ??
    sections.find((c) => c.key === "interior")?.key ??
    sections[0]?.key ??
    "";

  const [category, setCategory] = useState(fallbackSection);
  const [seenSections, setSeenSections] = useState(fallbackSection);
  if (seenSections !== fallbackSection && !sections.some((c) => c.key === category)) {
    setSeenSections(fallbackSection);
    setCategory(fallbackSection);
  }

  /**
   * Re-seeded each time the dialog OPENS, during render.
   *
   * `fallbackSection` moving with the rail is not enough on its own: the
   * Select is state, so a seller who opened the dialog once, cancelled, moved
   * to another section and opened it again would still be looking at the
   * first one's heading.
   *
   * Skipped while editing — that path seeds the Select from the row itself,
   * below, and this would overwrite it with the rail's position.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open && !editing) setCategory(fallbackSection);
  }

  /** The answers, for a list type. One row is {ar, en}. */
  const [answers, setAnswers] = useState([{ ar: "", en: "" }]);

  /**
   * Seeded from the row being edited, DURING render rather than in an effect.
   *
   * The same rule the rest of this file follows, and the same reason
   * SectionDialog gives: an effect runs after the paint, so the seller would
   * see one frame of the PREVIOUS specification's name and type in the boxes —
   * and on a dialog whose Save button rewrites a definition, that frame is
   * somebody about to edit the wrong row.
   *
   * Keyed on the id, so opening the dialog on a different row re-seeds and
   * re-opening it on the same row does not discard what has been typed.
   */
  const [seenId, setSeenId] = useState(null);
  /** The heading this row arrived under, so an untouched Select posts nothing. */
  const [seededCategory, setSeededCategory] = useState(null);
  const editId = editing?.id ?? null;
  if (seenId !== editId) {
    setSeenId(editId);
    if (editing) {
      setKind(editing.kind ?? "check");
      setIcon(editing.icon ?? null);
      /* A row in the "Your own specifications" catch-all has no rail section
         to seed from — that group is filtered out of `sections` on purpose —
         so it falls back, and `seededCategory` below is what stops the
         fallback from silently MOVING it on save. */
      setCategory(
        sections.some((s) => s.key === editing.sectionKey)
          ? editing.sectionKey
          : fallbackSection,
      );
      setSeededCategory(
        sections.some((s) => s.key === editing.sectionKey) ? editing.sectionKey : null,
      );
      setName({ ar: editing.nameAr ?? "", en: editing.nameEn ?? "" });
      setAnswers(
        editing.choices?.length
          ? editing.choices.map((c) => ({ ar: c.name?.ar ?? "", en: c.name?.en ?? "" }))
          : [{ ar: "", en: "" }],
      );
      /* The unit arrives localised on the merged item — there is only one
         string to seed from, so it fills whichever language is being authored
         and the other is sent as its twin, exactly as a one-language store's
         name is. */
      setUnit({ ar: editing.unit ?? "", en: editing.unit ?? "" });
    }
  }

  const isList = kind === "choice" || kind === "multi";
  const isAr = locale === "ar";

  /* A single-language store types one box per answer; 'both' types two. The
     same rule BilingualField applies to a name, applied to a row — a full
     BilingualField per answer would put a Both popup on every line. */
  const single = fieldMode === "ar" || fieldMode === "en";
  const lone = fieldMode === "en" ? "en" : "ar";

  const field =
    "h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm outline-hidden focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]";
  const small =
    "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs outline-hidden focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]";

  const KINDS = [
    { v: "check", ar: "نعم / لا", en: "Yes / no" },
    { v: "number", ar: "رقم", en: "Number" },
    { v: "text", ar: "نص", en: "Text" },
    { v: "longtext", ar: "نص طويل", en: "Long text" },
    { v: "date", ar: "تاريخ", en: "Date" },
    { v: "choice", ar: "قائمة منسدلة — إجابة واحدة", en: "Dropdown — one answer" },
    { v: "multi", ar: "قائمة — عدة إجابات", en: "List — several answers" },
  ];

  const setAnswer = (i, lang, value) =>
    setAnswers((rows) => rows.map((r, n) => (n === i ? { ...r, [lang]: value } : r)));

  /* Reset on close, so the next "New specification" is not half-filled with
     the last one — including the one that was cancelled. */
  const close = (next) => {
    onOpenChange(next);
    if (next) return;
    setKind("check");
    setCategory(fallbackSection);
    setIcon(null);
    setName({ ar: "", en: "" });
    setUnit({ ar: "", en: "" });
    setAnswers([{ ar: "", en: "" }]);
    /* Forget which row was being edited, or re-opening the SAME one would
       match `seenId`, skip the seeding above, and show these blank defaults
       as though the specification had lost its name and type. */
    setSeenId(null);
    setSeededCategory(null);
  };

  const submit = () => {
    const payload = new FormData();
    payload.set("vendorId", vendorId ?? "");
    payload.set("kind", kind);
    payload.set("icon", icon ?? "");
    payload.set("ar", name.ar);
    payload.set("en", name.en);
    payload.set("unitAr", kind === "number" ? unit.ar : "");
    payload.set("unitEn", kind === "number" ? unit.en : "");

    /* Editing posts the id, which is what sends this to updateSpecification
       instead of addSpecification. The action reads every other field only
       when the form SENT it, so the two paths share one payload builder. */
    if (editing) payload.set("specId", editing.id);

    /**
     * The heading, only when it is this seller's choice.
     *
     * Creating one always names a section. EDITING one sends it only if the
     * Select was actually changed — a row that came from the catch-all group
     * seeds the Select with a fallback, and posting that would quietly move a
     * legacy specification under a heading nobody picked.
     */
    if (!editing || (category && category !== seededCategory)) {
      payload.set("category", category);
    }

    /* Blank rows are dropped rather than refused: a seller who left the last
       line empty meant three answers, not an error. A single-language store
       sends the one value in both, so the sheet reads in either language. */
    const rows = isList
      ? answers
          .map((r) => ({
            ar: (single ? r[lone] : r.ar)?.trim() ?? "",
            en: (single ? r[lone] : r.en)?.trim() ?? "",
          }))
          .filter((r) => r.ar || r.en)
          .map((r) => ({ ar: r.ar || r.en, en: r.en || r.ar }))
      : [];

    payload.set("choices", JSON.stringify(rows));
    startTransition(() => action(payload));
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {editing
              ? t("تعديل المواصفة", "Edit specification")
              : t("مواصفة جديدة", "New specification")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* ── Why `ar`/`en` AND the id in the key ──────────────────────
              BilingualField owns its state and seeds it from these props on
              MOUNT only — `onChange` is a read-out, not a controlled value
              (see the note on its own props). Passing neither is why Edit
              opened with an empty box showing the "Glass roof" placeholder
              instead of the specification's actual name, on a dialog whose
              Save button then rewrites that name.

              The id belongs in the key for the same reason the mode does:
              without it, opening Edit on a second row would keep the first
              row's name in a component that never re-seeds. */}
          <BilingualField
            key={`name-${fieldMode}-${editing?.id ?? "new"}`}
            id="specName"
            label={t("اسم المواصفة", "Specification name")}
            mode={fieldMode}
            locale={locale}
            ar={editing?.nameAr ?? ""}
            en={editing?.nameEn ?? ""}
            phAr="سقف زجاجي"
            phEn="Glass roof"
            required
            onChange={setName}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("القسم", "Section")}
              </span>
              {/* The rail as this showroom has it — renamed headings under
                  the names they chose, and any section they added. Reading
                  SPEC_CATEGORIES here instead would offer the fifteen the
                  application ships and nothing else, so a seller could create
                  a section and then have no way to put anything in it. */}
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((c) => (
                    <SelectItem key={c.key} value={c.key} className="text-sm">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("نوع الإجابة", "Answer type")}
              </span>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.v} value={k.v} className="text-sm">
                      {t(k.ar, k.en)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {/* Only a number has a unit, and offering the boxes for a yes/no
              invites "Sunroof (Yes)". */}
          {kind === "number" ? (
            <BilingualField
              key={`unit-${fieldMode}-${editing?.id ?? "new"}`}
              id="specUnit"
              label={t("الوحدة", "Unit")}
              mode={fieldMode}
              locale={locale}
              /* The merged item carries one localised unit string, so it
                 seeds both sides; saving sends whichever the store authors
                 in, and the other follows it. */
              ar={editing?.unit ?? ""}
              en={editing?.unit ?? ""}
              phAr="ملم"
              phEn="mm"
              onChange={setUnit}
            />
          ) : null}

          {/* ── The answers, for a list ──────────────────────────────────────
              A list type with no answers is a dropdown with nothing in it, so
              the rows appear with the type rather than being a second step
              somebody can skip. Free text on a controlled field is what the
              whole specification template exists to stop: "Automatic",
              "automatic" and "أوتوماتيك" are three values that match nothing. */}
          {isList ? (
            <div className="space-y-1.5 rounded-md border border-gray-200 p-2 dark:border-gray-700">
              <span className="text-[11px] font-medium text-muted-foreground">
                {kind === "multi"
                  ? t("الإجابات — يمكن اختيار أكثر من واحدة", "Answers — several can be chosen")
                  : t("الإجابات — تُختار واحدة", "Answers — one is chosen")}
              </span>

              {answers.map((row, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  {/* Stacked on a narrow dialog, side by side once there is
                      room. Two boxes sharing ~130px each on a 360px phone is
                      a field nobody can read what they typed in. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:gap-1.5">
                  {single ? (
                    <input
                      dir={lone === "ar" ? "rtl" : "ltr"}
                      value={row[lone]}
                      onChange={(e) => setAnswer(i, lone, e.target.value)}
                      className={small}
                      placeholder={lone === "ar" ? "أوتوماتيك" : "Automatic"}
                    />
                  ) : (
                    <>
                      <input
                        dir="rtl"
                        value={row.ar}
                        onChange={(e) => setAnswer(i, "ar", e.target.value)}
                        className={small}
                        placeholder="أوتوماتيك"
                      />
                      <input
                        dir="ltr"
                        value={row.en}
                        onChange={(e) => setAnswer(i, "en", e.target.value)}
                        className={small}
                        placeholder="Automatic"
                      />
                    </>
                  )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnswers((rows) => rows.filter((_, n) => n !== i))}
                    disabled={answers.length === 1}
                    aria-label={t("احذف الإجابة", "Remove answer")}
                    className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-gray-300 transition-colors hover:text-red-600 disabled:opacity-30 dark:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setAnswers((rows) => [...rows, { ar: "", en: "" }])}
                className="flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                {t("إجابة أخرى", "Another answer")}
              </button>
            </div>
          ) : null}

          {iconsMissing ? null : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("الأيقونة", "Icon")}
              </span>
              <IconPicker value={icon} onChange={setIcon} locale={locale} />
            </div>
          )}

          <p className="flex items-start gap-1.5 rounded-md bg-gray-50 px-2.5 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {t(
              "تُضاف إلى قائمة معرضك فقط، ويمكن حذفها ما لم تستخدمها سيارة.",
              "It is added to your showroom's list only, and can be removed unless a car answers it.",
            )}
          </p>

          {error ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {errorText(error, locale)}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              {t("إلغاء", "Cancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={pending || (!name.ar && !name.en)}
            className="gap-1.5"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {editing ? t("احفظ", "Save") : t("أضف", "Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
