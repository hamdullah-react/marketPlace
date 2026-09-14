"use client";

/**
 * The lead-form builder — the list on the left, what the buyer sees on the right.
 *
 * ── The preview is the real form ────────────────────────────────────────────
 *
 * Not a mock-up of it. Both sides render <LeadFields>, so the preview cannot
 * drift from what a buyer gets — which is the failure mode of every builder
 * that paints its own approximation and lets the seller find out from a
 * customer.
 *
 * ── NOTHING here may be wrapped in a <form> ─────────────────────────────────
 *
 * This is the one rule the file has, and breaking it is what made half the
 * builder silently do nothing.
 *
 * Every control is its own server action, so every control is its own <form>.
 * The reorder used to wrap the whole list in one — which meant each row's width
 * buttons, arrows, hide, delete and editor were <form> inside <form>. The HTML
 * parser DISCARDS a nested form start tag, so those inner forms never existed
 * in the DOM: their buttons became submit buttons of the outer reorder form.
 * Clicking "Half" reordered the list. Saving an edit reordered the list. React
 * says so in the console — validateDOMNesting — and the symptom is a control
 * that appears to be ignored.
 *
 * So the reorder form is the sticky bar and nothing else, and the list beside
 * it is plain divs.
 *
 * ── Values ride on the button, not on hidden state ──────────────────────────
 *
 * `<button name="style" value="minimal">` puts that value in the FormData when
 * it is the submitter. The previous version kept the choice in React state and
 * posted it through a hidden input, so a click submitted the PREVIOUS
 * selection — state had not flushed yet. Local state is still kept, but only to
 * move the preview; the server reads the button.
 *
 * ── Drag, and also arrows ───────────────────────────────────────────────────
 *
 * Dragging is what people expect from a form builder, so rows are draggable.
 * Arrows stay because HTML5 drag-and-drop does not fire on touch at all and is
 * awkward from a keyboard — and half these sellers are on a phone.
 */

import { useState, useRef, useEffect } from "react";
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Loader2,
  AlertCircle, GripVertical, X, Check, Sparkles,
} from "lucide-react";
import { ERRORS } from "@/marketplace/lib/errors";
import { useOnChange } from "@/hooks/use-on-change";
import { FIELD_TYPES, TYPES_WITH_OPTIONS } from "@/marketplace/lib/form-fields";
import {
  FORM_STYLES, WIDTHS, ACCENT_PRESETS, NUMERIC_TOKENS, COLOR_FIELDS,
  defaultTheme, accentVars,
} from "@/marketplace/lib/form-styles";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import LeadFields from "../../_components/LeadFields";
import { useActionResult } from "./useActionResult";
import {
  saveFormField, toggleFormField, deleteFormField, moveFormField,
  reorderFormFields, saveFormStyle, saveFormTab, deleteFormTab,
  setFieldWidth, setFieldTab, saveFormTheme, installLeadFormTemplate,
} from "../_actions/form-fields";

const input =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5 dark:text-white";

export default function FormBuilder({
  locale = "ar",
  vendorId,
  fields = [],
  styleKey = "classic",
  theme: savedTheme = null,
  tabs = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const msg = (code) => (code ? ERRORS[code]?.[locale] ?? ERRORS[code]?.en ?? code : null);
  const text = (obj) => obj?.[locale] || obj?.en || obj?.ar || "";

  const [editing, setEditing] = useState(null);

  // Local copies so the preview moves on click rather than after a round trip.
  // The SERVER reads the submitter button's value, not these — see the header.
  const [style, setStyle] = useState(styleKey);
  const [theme, setTheme] = useState({ ...defaultTheme(styleKey), ...(savedTheme ?? {}) });

  /**
   * The order being dragged, held locally so the list moves under the cursor.
   * Server order wins again the moment the reorder action returns.
   */
  const [order, setOrder] = useState(null);
  const dragFrom = useRef(null);

  const save = useActionResult(saveFormField, { ok: false, error: null, errors: {} }, {
    autoClearMs: 0,
    onSuccess: () => setEditing(null),
  });
  const toggle = useActionResult(toggleFormField);
  const remove = useActionResult(deleteFormField);
  const move = useActionResult(moveFormField);
  const reorder = useActionResult(reorderFormFields, { ok: false, error: null }, {
    onSuccess: () => setOrder(null),
  });
  const styling = useActionResult(saveFormStyle);
  const theming = useActionResult(saveFormTheme);
  const width = useActionResult(setFieldWidth);
  const section = useActionResult(setFieldTab);
  const tabSave = useActionResult(saveFormTab, { ok: false, error: null, errors: {} });
  const tabDelete = useActionResult(deleteFormTab);
  const template = useActionResult(installLeadFormTemplate, { ok: false, error: null }, {
    autoClearMs: 0,
  });

  const list = order
    ? order.map((id) => fields.find((f) => f.id === id)).filter(Boolean)
    : fields;

  const active = list.filter((f) => f.active);

  const typeLabel = (type) => {
    const spec = FIELD_TYPES.find((f) => f.type === type);
    return spec ? t(spec.ar, spec.en) : type;
  };

  /* ── Drag ─────────────────────────────────────────────────────────────
     Native HTML5 drag: no library, and the one thing a library would add
     here — touch support — is already covered by the arrows. */
  const onDragStart = (index) => { dragFrom.current = index; };

  const onDragOver = (index, e) => {
    e.preventDefault();
    const from = dragFrom.current;
    if (from === null || from === index) return;

    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    dragFrom.current = index;
    setOrder(next.map((f) => f.id));
  };

  /**
   * Dropping does NOT save.
   *
   * It used to submit on drop, which meant a seller trying three arrangements
   * wrote three orders to the database and showed each one to buyers on the
   * way. Rearranging is a draft until it is committed.
   *
   * `dirty` is derived rather than stored: an order that matches the server's
   * is not unsaved, however much dragging happened to get back to it.
   */
  const onDrop = () => { dragFrom.current = null; };

  const dirty =
    order !== null && order.join(",") !== fields.map((f) => f.id).join(",");

  return (
    <div className="grid gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
      {/* ══ Left: the questions ═══════════════════════════════════════════ */}
      <div className="flex flex-col gap-5">
        {/* Stated rather than hidden — a seller hunting for "where do I add a
            phone field" needs telling it is already there, or they add a second
            one and get two phone numbers per lead. */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {t("يُسأل في كل طلب", "Asked on every request")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "رقم الجوال · الرسالة — لا يمكن حذفهما، لأنهما ما يجعل الطلب قابلاً للرد.",
              "Mobile · message — not removable, because they are what makes a lead answerable."
            )}
          </p>
        </div>

        {/* ══ Look ════════════════════════════════════════════════════════
            Free where it is safe, fixed where it is not. The accent is a real
            picker, because no palette of six contains a showroom's exact brand
            purple — and the text on top of it is computed, so the one thing a
            free colour could break is the one thing it cannot. Radius and
            spacing stay closed sets: a pixel value there has no right answer a
            seller could reason about, and free padding is how a form starts
            scrolling sideways on a phone. */}
        <section className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t("شكل النموذج", "Form look")}
          </p>

          {/* ── Preset ──────────────────────────────────────────────────── */}
          <form action={styling.formAction}>
            <input type="hidden" name="vendorId" value={vendorId} />
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("التخطيط", "Layout")}
            </p>
            <div className="flex flex-wrap gap-2">
              {FORM_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="submit"
                  name="style"
                  value={s.key}
                  onClick={() => {
                    setStyle(s.key);
                    // Matches what saveFormStyle does on the server: re-seed
                    // the numbers, keep the colours. A preview that
                    // disagreed with the save would be worse than none.
                    setTheme((prev) => ({
                      ...defaultTheme(s.key),
                      accent: prev.accent,
                      ...Object.fromEntries(COLOR_FIELDS.map((c) => [c.key, prev[c.key]])),
                    }));
                  }}
                  className={`rounded-xl border px-3 py-2 text-start transition-colors ${
                    style === s.key
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-gray-200 hover:border-brand-primary/50 dark:border-white/10"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {style === s.key ? <Check className="h-3 w-3 text-brand-primary" /> : null}
                    {t(s.ar, s.en)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {t(s.hint.ar, s.hint.en)}
                  </span>
                </button>
              ))}
            </div>
          </form>

          {/* ── Everything else ─────────────────────────────────────────
              One form, one Save. Radius, padding, gap, text size, border
              thickness and four colours all travel together, because they are
              one decision — "make my form look like this" — and eleven separate
              saves would be eleven round trips and eleven chances to lose half
              of it.

              The preview follows the sliders live; the button is what writes.
              A save per drag would be a hundred writes for one adjustment. */}
          <form action={theming.formAction} className="flex flex-col gap-4">
            <input type="hidden" name="vendorId" value={vendorId} />

            {/* ── Accent ─────────────────────────────────────────────────
                Six swatches for the common answers and a picker for anything
                else: "our brand is this exact purple" is a reasonable thing for
                a showroom to want, and no palette of six will ever contain it.

                The text on top is COMPUTED from the colour rather than chosen,
                so the one thing a free picker could break — an unreadable chip
                — is the one thing it cannot. */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("اللون الأساسي", "Accent colour")}
              </p>
              {/* accentVars is the SAME mechanism the buyer's form uses, so the
                  chosen colour reaches these swatches through a CSS variable and
                  ordinary Tailwind classes — not a second, ad-hoc style object
                  that would drift from it. */}
              <div className="flex flex-wrap items-center gap-2" style={accentVars(theme.accent)}>
                {ACCENT_PRESETS.map((a) => (
                  <button
                    key={a.hex}
                    type="button"
                    onClick={() => setTheme((prev) => ({ ...prev, accent: a.hex }))}
                    title={t(a.ar, a.en)}
                    aria-label={t(a.ar, a.en)}
                    aria-pressed={theme.accent === a.hex}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition-transform hover:scale-110 ${a.swatch} ${
                      theme.accent === a.hex ? "ring-2 ring-offset-2 dark:ring-offset-gray-900" : ""
                    }`}
                  >
                    {theme.accent === a.hex ? <Check className="h-4 w-4" /> : null}
                  </button>
                ))}

                {/* The native colour input, wrapped. A bare one renders as a
                    grey box in every browser, which reads as broken next to six
                    round swatches — so the label is the affordance and the
                    input itself is screen-reader-only. */}
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-gray-300 py-1 pe-3 ps-1 text-xs text-muted-foreground transition-colors hover:border-brand-primary dark:border-white/20"
                  title={t("لون مخصص", "Custom colour")}
                >
                  <span className="h-6 w-6 rounded-full border border-black/10 bg-[var(--lead-accent)]" />
                  <input
                    type="color"
                    name="accent"
                    value={theme.accent}
                    onChange={(e) => setTheme((prev) => ({ ...prev, accent: e.target.value }))}
                    className="sr-only"
                  />
                  {theme.accent.toUpperCase()}
                </label>
              </div>
            </div>

            {/* ── Sizes ──────────────────────────────────────────────────
                Sliders, not number boxes. Every one of these is judged by
                looking at the result, and a seller who has to type 14 and press
                save to find out is a seller who tries it twice and stops. */}
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {NUMERIC_TOKENS.map((n) => (
                <label key={n.key} className="block">
                  <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                    {t(n.ar, n.en)}
                    <span className="tabular-nums">{theme[n.key]}px</span>
                  </span>
                  <input
                    type="range"
                    name={n.key}
                    min={n.min}
                    max={n.max}
                    value={theme[n.key]}
                    onChange={(e) =>
                      setTheme((prev) => ({ ...prev, [n.key]: Number(e.target.value) }))
                    }
                    className="w-full accent-brand-primary"
                  />
                </label>
              ))}
            </div>

            {/* ── Colours ────────────────────────────────────────────────
                Optional, and unset means "use the preset's own light and dark
                values" — which is why each has a clear button beside it and not
                only a picker. A colour control with no way back is a one-way
                door. */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t("ألوان الحقول", "Field colours")}
              </p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                {t(
                  "اختياري. اللون الذي تختاره يُطبَّق في الوضع الداكن أيضاً.",
                  "Optional. A colour you set applies in dark mode too."
                )}
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                {COLOR_FIELDS.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-1.5 text-xs dark:border-white/10">
                      {/* Unset shows a hatch rather than a colour, because a
                          white square and "white" are indistinguishable. */}
                      <span
                        className={`h-6 w-6 shrink-0 rounded-md border border-black/10 ${
                          theme[c.key]
                            ? "bg-[var(--swatch)]"
                            : "bg-[repeating-linear-gradient(45deg,#e5e7eb_0_4px,transparent_4px_8px)]"
                        }`}
                        style={theme[c.key] ? { "--swatch": theme[c.key] } : undefined}
                      />
                      <input
                        type="color"
                        name={c.key}
                        value={theme[c.key] ?? "#000000"}
                        onChange={(e) =>
                          setTheme((prev) => ({ ...prev, [c.key]: e.target.value }))
                        }
                        className="sr-only"
                      />
                      <span className="truncate">{t(c.ar, c.en)}</span>
                    </label>

                    {theme[c.key] ? (
                      <button
                        type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, [c.key]: null }))}
                        aria-label={t("أعد الافتراضي", "Reset to default")}
                        title={t("أعد الافتراضي", "Reset to default")}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      // An unset colour must still POST, as an empty string, or
                      // clearing one would look saved and be back next load.
                      <input type="hidden" name={c.key} value="" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={theming.pending}
                className="raised-solid flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {theming.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {theming.result?.ok ? <Check className="h-4 w-4" /> : null}
                {theming.result?.ok
                  ? t("حُفظ وظهر للمشترين", "Saved & live for buyers")
                  : t("احفظ الشكل", "Save the look")}
              </button>

              <button
                type="button"
                onClick={() => setTheme(defaultTheme(style))}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs dark:border-white/10"
              >
                {t("أعد الضبط", "Reset")}
              </button>
            </div>
          </form>

          {[styling, theming].map((r, i) =>
            r.result?.error ? (
              <p key={i} className="text-xs text-red-600">{msg(r.result.error)}</p>
            ) : null
          )}
        </section>

        {/* ══ Sections ════════════════════════════════════════════════════
            Optional. A form of four questions needs none, and a seller who
            never opens this gets a flat form, which is the right default.
            Twelve questions in one column is what tabs are for. */}
        <section>
          <p className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t("أقسام النموذج", "Form sections")}
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t("اختياري", "optional")}
            </span>
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t(
              "أنشئ قسماً، ثم اختره من القائمة بجانب كل سؤال.",
              "Create a section, then pick it from the dropdown beside each question."
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <span
                key={tab.id}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 py-1 pe-1 ps-3 text-sm dark:border-white/10"
              >
                {text(tab.label) || "—"}
                <span className="rounded-full bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-500 dark:bg-white/10">
                  {fields.filter((f) => f.tab_id === tab.id).length}
                </span>
                <IconForm
                  action={tabDelete.formAction}
                  vendorId={vendorId}
                  id={tab.id}
                  label={t("حذف القسم", "Delete section")}
                  confirm={t(
                    "حذف القسم؟ تبقى أسئلته في النموذج بدون قسم.",
                    "Delete this section? Its questions stay on the form, outside any section."
                  )}
                  danger
                >
                  <X className="h-3.5 w-3.5" />
                </IconForm>
              </span>
            ))}

            <form action={tabSave.formAction} className="flex items-center gap-1">
              <input type="hidden" name="vendorId" value={vendorId} />
              <input
                name="labelEn"
                placeholder={t("قسم جديد", "New section")}
                className="w-36 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5"
              />
              <button
                type="submit"
                disabled={tabSave.pending}
                className="rounded-lg border border-dashed border-gray-300 p-1.5 text-brand-primary hover:border-brand-primary disabled:opacity-50 dark:border-white/15"
                aria-label={t("أضف قسماً", "Add section")}
              >
                {tabSave.pending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />}
              </button>
            </form>
          </div>

          {tabSave.result?.error ? (
            <p className="mt-2 text-xs text-red-600">{msg(tabSave.result.error)}</p>
          ) : null}
        </section>

        {/* ══ The questions ═══════════════════════════════════════════════ */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t("الأسئلة", "Questions")}
          </p>

          {list.length === 0 && editing !== "new" ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-white/15">
              <Sparkles className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                {t("لم تضف أي حقل بعد", "No fields yet")}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {t(
                  "ابدأ بنموذج جاهز ثم عدّله كما تشاء — أو أضف أسئلتك من الصفر.",
                  "Start from a ready-made form and change whatever you like — or build your own from scratch."
                )}
              </p>

              {/* The offer belongs HERE, in the empty state, because this is
                  where a seller is deciding whether to bother. Buried in a
                  menu it would be found by the people who least need it. */}
              <TemplateButton
                action={template}
                vendorId={vendorId}
                pending={template.pending}
                t={t}
                primary
              />
            </div>
          ) : null}

          {/* The reorder form is THIS BAR ONLY — see the header. Sticky,
              because the field being dragged is often at the bottom of a long
              list and a button above the fold would be off screen exactly when
              it is needed. */}
          {dirty ? (
            <form
              action={reorder.formAction}
              className="sticky top-2 z-10 flex items-center gap-3 rounded-xl border border-brand-primary/40 bg-brand-primary/10 px-3 py-2 backdrop-blur"
            >
              <input type="hidden" name="vendorId" value={vendorId} />
              <input type="hidden" name="order" value={list.map((f) => f.id).join(",")} />
              <span className="text-xs font-medium text-brand-primary">
                {t("لم يُحفظ الترتيب الجديد", "New order not saved yet")}
              </span>
              <button
                type="submit"
                disabled={reorder.pending}
                className="raised-solid ms-auto flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {reorder.pending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                {t("احفظ وأظهره للمشتري", "Save & show to buyers")}
              </button>
              <button
                type="button"
                onClick={() => setOrder(null)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-transparent"
              >
                {t("تراجع", "Undo")}
              </button>
            </form>
          ) : null}

          <div className="flex flex-col gap-2">
            {list.map((field, index) =>
              editing === field.id ? (
                <Editor
                  key={field.id}
                  field={field} vendorId={vendorId} action={save}
                  onCancel={() => setEditing(null)} t={t} msg={msg}
                />
              ) : (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => onDragOver(index, e)}
                  onDragEnd={onDrop}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 transition-opacity ${
                    field.active
                      ? "border-gray-200 bg-white dark:border-white/10 dark:bg-transparent"
                      : "border-dashed border-gray-300 opacity-60 dark:border-white/15"
                  }`}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing"
                    aria-hidden
                  />

                  <div className="min-w-[8rem] flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {text(field.label) || field.field_key}
                      {field.required ? <span className="text-red-500"> *</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typeLabel(field.type)}
                      {TYPES_WITH_OPTIONS.has(field.type)
                        ? ` · ${(field.options ?? []).length} ${t("خيار", "choices")}`
                        : ""}
                      {!field.active ? ` · ${t("مخفي", "hidden")}` : ""}
                    </p>
                  </div>

                  {/* ── Section ─────────────────────────────────────────
                      On the row rather than buried in the editor: moving six
                      questions into a section should be six clicks, not six
                      open-edit-save cycles. Only shown once a section exists —
                      a picker whose one option is "none" asks a question with
                      a single answer. */}
                  {tabs.length ? (
                    <SectionSelect
                      action={section.formAction}
                      vendorId={vendorId}
                      fieldId={field.id}
                      value={field.tab_id ?? ""}
                      tabs={tabs}
                      text={text}
                      t={t}
                    />
                  ) : null}

                  {/* ── Width ───────────────────────────────────────────
                      Three segments rather than a select: it is a choice of
                      three and the current one should be visible without
                      opening anything. One form, three submit buttons — the
                      value rides on whichever was pressed. */}
                  <form
                    action={width.formAction}
                    className="flex shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-white/10"
                  >
                    <input type="hidden" name="vendorId" value={vendorId} />
                    <input type="hidden" name="id" value={field.id} />
                    {WIDTHS.map((w) => (
                      <button
                        key={w.key}
                        type="submit"
                        name="width"
                        value={w.key}
                        title={t(w.ar, w.en)}
                        aria-pressed={(field.width ?? "full") === w.key}
                        className={`px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          (field.width ?? "full") === w.key
                            ? "bg-brand-primary text-white"
                            : "text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
                        }`}
                      >
                        {t(w.ar, w.en)}
                      </button>
                    ))}
                  </form>

                  <div className="flex shrink-0 flex-col">
                    <IconForm action={move.formAction} vendorId={vendorId} id={field.id}
                      extra={{ direction: "up" }} disabled={index === 0} label={t("لأعلى", "Move up")}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconForm>
                    <IconForm action={move.formAction} vendorId={vendorId} id={field.id}
                      extra={{ direction: "down" }} disabled={index === list.length - 1}
                      label={t("لأسفل", "Move down")}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconForm>
                  </div>

                  <IconForm action={toggle.formAction} vendorId={vendorId} id={field.id}
                    label={field.active ? t("إخفاء", "Hide") : t("إظهار", "Show")}>
                    {field.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </IconForm>

                  <button
                    type="button"
                    onClick={() => setEditing(field.id)}
                    aria-label={t("تعديل", "Edit")}
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-primary dark:hover:bg-white/10"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <IconForm
                    action={remove.formAction} vendorId={vendorId} id={field.id}
                    label={t("حذف", "Delete")}
                    confirm={t("حذف هذا الحقل نهائياً؟", "Delete this field for good?")}
                    danger
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconForm>
                </div>
              )
            )}
          </div>

          {editing === "new" ? (
            <Editor
              field={null} vendorId={vendorId} action={save}
              onCancel={() => setEditing(null)} t={t} msg={msg}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-brand-primary transition-colors hover:border-brand-primary hover:bg-brand-primary/5 dark:border-white/15"
              >
                <Plus className="h-4 w-4" />
                {t("أضف حقلاً", "Add a field")}
              </button>

              {/* Still offered once there are questions, because it is additive:
                  a key that already exists is skipped, so pressing it cannot
                  overwrite or duplicate what a seller has built. */}
              {list.length ? (
                <TemplateButton
                  action={template}
                  vendorId={vendorId}
                  pending={template.pending}
                  t={t}
                />
              ) : null}
            </div>
          )}

          {template.result?.ok ? (
            <p className="text-xs text-green-700 dark:text-green-400">
              {template.result.added
                ? t(
                    `أُضيف ${template.result.added} سؤالاً. عدّل أو احذف ما لا يناسبك.`,
                    `Added ${template.result.added} questions. Edit or delete anything that does not suit you.`
                  )
                : t(
                    "كل أسئلة النموذج الجاهز موجودة لديك بالفعل.",
                    "You already have every question from the starter form."
                  )}
            </p>
          ) : null}

          {template.result?.error ? (
            <p className="text-sm text-red-600">{msg(template.result.error)}</p>
          ) : null}

          {[toggle, remove, move, reorder, width, section].map((r, i) =>
            r.result?.error ? (
              <p key={i} className="text-sm text-red-600">{msg(r.result.error)}</p>
            ) : null
          )}
        </section>
      </div>

      {/* ══ Right: what the buyer sees ════════════════════════════════════ */}
      <div className="@4xl/main:sticky @4xl/main:top-4 @4xl/main:self-start">
        <p className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">
          {t("ما يراه المشتري", "What the buyer sees")}
        </p>

        {/* Deliberately the width of the real dialog — see LeadPanel, which
            widens to the same measure once a showroom asks anything. A preview
            in a wide column makes two half-width fields look roomy and then a
            buyer meets them somewhere narrower. */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900">
          <p className="mb-1 text-base font-bold text-gray-900 dark:text-white">
            {t("اطلب عرض سعر", "Request a quote")}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("الجوال والرسالة تُسألان دائماً.", "Mobile and message are always asked.")}
          </p>

          {active.length ? (
            /* The buyer's own component. A preview drawn from a second copy of
               this markup is a preview that drifts. */
            <LeadFields
              fields={active}
              tabs={tabs}
              locale={locale}
              styleKey={style}
              theme={theme}
              preview
            />
          ) : (
            <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-muted-foreground dark:border-white/15">
              {t(
                "أضف حقلاً ليظهر هنا فوراً.",
                "Add a field and it appears here immediately."
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

/** A one-button form. Server actions need one; five of these would be noise. */
function IconForm({ action, vendorId, id, extra = {}, disabled, label, confirm: ask, danger, children }) {
  return (
    <form
      action={action}
      onSubmit={ask ? (e) => { if (!confirm(ask)) e.preventDefault(); } : undefined}
    >
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="id" value={id} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`rounded-lg p-1.5 transition-colors disabled:opacity-30 ${
          danger
            ? "text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            : "text-gray-500 hover:bg-gray-100 hover:text-brand-primary dark:hover:bg-white/10"
        }`}
      >
        {children}
      </button>
    </form>
  );
}

/**
 * Add or edit one field.
 *
 * The type is local state because the form CHANGES with it — choices only exist
 * for a dropdown, chips or radio — and a round trip to discover that is a round
 * trip for nothing.
 *
 * Width and section are NOT edited here. They have their own one-column actions
 * on the row, which is both fewer clicks and safer: this form rewrites the whole
 * row from what it contains, so they travel as hidden inputs to keep their
 * current values rather than being blanked by an edit of the question.
 */
function Editor({ field, vendorId, action, onCancel, t, msg }) {
  const [type, setType] = useState(field?.type ?? "text");
  const err = (key) => msg(action.result?.errors?.[key]);

  const optionValues = (field?.options ?? []).map((o) => o.value);

  return (
    <form action={action.formAction} className="rounded-xl border border-brand-primary/40 bg-brand-primary/5 p-4">
      <input type="hidden" name="vendorId" value={vendorId} />
      {field ? <input type="hidden" name="id" value={field.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="width" value={field?.width ?? "full"} />
      <input type="hidden" name="tabId" value={field?.tab_id ?? ""} />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-primary">
          {field ? t("تعديل الحقل", "Edit field") : t("حقل جديد", "New field")}
        </p>
        <button type="button" onClick={onCancel} aria-label={t("إلغاء", "Cancel")}
          className="rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium">{t("السؤال (عربي)", "Question (Arabic)")}</label>
          <input name="labelAr" dir="rtl" defaultValue={field?.label?.ar ?? ""} className={input}
            placeholder="ما ميزانيتك؟" />
          {err("labelAr") ? <p className="mt-1 text-xs text-red-600">{err("labelAr")}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">{t("السؤال (إنجليزي)", "Question (English)")}</label>
          <input name="labelEn" dir="ltr" defaultValue={field?.label?.en ?? ""} className={input}
            placeholder="What is your budget?" />
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {t("لغة واحدة تكفي.", "One language is enough.")}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium">{t("نوع الإجابة", "Answer type")}</label>
          {/* The hidden input above (name="type") is what submits — Radix
              renders a button, not a form control. */}
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className={input}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((f) => (
                <SelectItem key={f.type} value={f.type}>{t(f.ar, f.en)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("type") ? <p className="mt-1 text-xs text-red-600">{err("type")}</p> : null}
        </div>

        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="required" defaultChecked={field?.required ?? false}
              className="h-4 w-4 rounded" />
            {t("إجباري", "Required")}
          </label>
        </div>
      </div>

      {TYPES_WITH_OPTIONS.has(type) ? (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium">{t("الخيارات", "Choices")}</label>
          <OptionTags initial={optionValues} t={t} />
          {err("options") ? <p className="mt-1 text-xs text-red-600">{err("options")}</p> : null}
        </div>
      ) : null}

      {/* Out in the open, not behind a disclosure triangle.

          These lived inside a <details> and almost nobody opened it, so almost
          every field went out with an empty box and no hint. A placeholder is
          the cheapest thing a seller can do to raise the quality of an answer:
          "e.g. 85000" gets a number, a blank box gets "not sure". */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium">{t("نص داخل الحقل", "Placeholder")}</label>
          <input name="placeholderAr" dir="rtl" defaultValue={field?.placeholder?.ar ?? ""} className={input}
            placeholder={t("مثال: ٨٥٠٠٠ (عربي)", "e.g. 85000 (Arabic)")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium sm:invisible">
            {t("نص داخل الحقل", "Placeholder")}
          </label>
          <input name="placeholderEn" dir="ltr" defaultValue={field?.placeholder?.en ?? ""} className={input}
            placeholder={t("مثال: 85000 (إنجليزي)", "e.g. 85000 (English)")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">{t("نص مساعد", "Helper text")}</label>
          <input name="helpAr" dir="rtl" defaultValue={field?.help?.ar ?? ""} className={input}
            placeholder={t("يظهر تحت الحقل (عربي)", "Shown under the field (Arabic)")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium sm:invisible">
            {t("نص مساعد", "Helper text")}
          </label>
          <input name="helpEn" dir="ltr" defaultValue={field?.help?.en ?? ""} className={input}
            placeholder={t("يظهر تحت الحقل (إنجليزي)", "Shown under the field (English)")} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "اترك النص فارغاً ونضع مثالاً مناسباً لنوع الإجابة.",
          "Leave the placeholder blank and we put in an example that suits the answer type."
        )}
      </p>

      {action.result?.error && action.result.error !== "VALIDATION" ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {msg(action.result.error)}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={action.pending}
          className="raised-solid flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {action.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("حفظ", "Save")}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm dark:border-white/10">
          {t("إلغاء", "Cancel")}
        </button>
      </div>
    </form>
  );
}

/**
 * The choices for a dropdown or a multi-select, as tags.
 *
 * ── Why not the textarea it replaced ────────────────────────────────────────
 *
 * It was one option per line, which is the fastest thing to TYPE and the worst
 * thing to read back. A seller checking an eight-option list had to count lines
 * in a scrolling box, an accidental blank line looked like a missing option, and
 * removing the third one meant selecting exactly the right line and no more.
 *
 * As tags, the list is the list: each choice is a discrete thing with a cross on
 * it, and how many there are is something you can see rather than count.
 *
 * ── The server contract does not change ─────────────────────────────────────
 *
 * saveFormField still receives `options` as newline-separated text, because
 * that is what parseOptions expects and there is no reason for the wire format
 * to care what the control looks like. The hidden input below is the join.
 */
function OptionTags({ initial = [], t }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    const value = raw.trim();
    if (!value) return;
    // Silently ignored rather than refused: a duplicate is almost always a
    // seller re-typing something they already added, and an error for it is a
    // telling-off for a mistake with no consequence.
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setDraft("");
  };

  const onKeyDown = (e) => {
    // Enter and comma both commit — comma because a list of options is a thing
    // people type with commas whatever the box tells them.
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      return;
    }
    // Backspace on an empty box eats the last tag, which is what every tag
    // input does and what fingers expect.
    if (e.key === "Backspace" && !draft && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 p-2 focus-within:border-brand-primary dark:border-white/10 dark:bg-white/5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          // Committing on blur too, so a choice typed and then clicked away
          // from is not silently thrown out at save time.
          onBlur={() => add(draft)}
          placeholder={t("اكتب خياراً ثم Enter", "Type a choice, press Enter")}
          className="min-w-[10rem] flex-1 bg-transparent px-2 py-1.5 text-sm outline-none dark:text-white"
        />

        {tags.map((value) => (
          <span
            key={value}
            className="flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pe-3 ps-1.5 text-sm text-gray-800 dark:bg-white/10 dark:text-gray-100"
          >
            <button
              type="button"
              onClick={() => setTags((prev) => prev.filter((v) => v !== value))}
              aria-label={t(`احذف ${value}`, `Remove ${value}`)}
              className="rounded-full p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {value}
          </span>
        ))}
      </div>

      {/* What actually submits. Newline-separated, because parseOptions on the
          server splits on newlines and the wire format has no reason to know
          this is a tag control. */}
      <input type="hidden" name="options" value={tags.join("\n")} />

      <p className="mt-1 text-xs text-muted-foreground">
        {tags.length < 2
          ? t("أضف خيارين على الأقل.", "Add at least two choices.")
          : t(`${tags.length} خيارات`, `${tags.length} choices`)}
      </p>
    </div>
  );
}

/**
 * "Start from a ready-made form".
 *
 * Confirmed only when it would ADD to an existing form — installing into an
 * empty one has nothing to lose, and a confirm dialog there is a speed bump in
 * front of the thing the page is asking them to do.
 */
function TemplateButton({ action, vendorId, pending, t, primary = false }) {
  return (
    <form
      action={action.formAction}
      className={primary ? "mt-4" : ""}
      onSubmit={
        primary
          ? undefined
          : (e) => {
              const ok = confirm(
                t(
                  "سيُضاف نموذج جاهز إلى أسئلتك الحالية. لن يُحذف أو يُعدّل أي سؤال لديك.",
                  "A ready-made set of questions will be added to what you already have. Nothing of yours is changed or removed."
                )
              );
              if (!ok) e.preventDefault();
            }
      }
    >
      <input type="hidden" name="vendorId" value={vendorId} />
      <button
        type="submit"
        disabled={pending}
        className={
          primary
            ? "raised-solid inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            : "inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-50 dark:border-white/10"
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {t("استخدم نموذجاً جاهزاً", "Use a ready-made form")}
      </button>
    </form>
  );
}

/**
 * Which section a question sits in, changed from the row itself.
 *
 * ── Why it submits itself ───────────────────────────────────────────────────
 *
 * A picker with its own Save button beside it is a button nobody presses, and
 * moving six questions into a section should be six clicks rather than six
 * open-edit-save cycles.
 *
 * ── Why the submit is in an effect ──────────────────────────────────────────
 *
 * The native select did this in onChange, straight off the event. Radix renders
 * a BUTTON, so there is no form control carrying the value — the hidden input
 * below is what submits, and it only holds the new value after React has
 * re-rendered. Submitting inside onValueChange would post the PREVIOUS section
 * every time, which is the kind of off-by-one that looks like the server
 * ignoring you.
 *
 * The mount guard matters as much: without it, rendering the list would submit
 * every row's current section back to the server on page load.
 *
 * Module scope, like everything else here — a component declared inside another
 * is a new type on every render, so React remounts it and its state resets.
 */
function SectionSelect({ action, vendorId, fieldId, value, tabs, text, t }) {
  const [tabId, setTabId] = useState(value ?? "");
  const form = useRef(null);

  /**
   * Submit only what a PERSON chose.
   *
   * Keyed on intent rather than on the value changing, because the value also
   * changes when the server's answer arrives — and a save that FAILED would
   * push the old section back down, flip the state again, and submit again,
   * for ever. A flag set at the click is the only thing that distinguishes
   * "somebody picked this" from "the state moved".
   */
  const chosen = useRef(false);

  const choose = (next) => {
    chosen.current = true;
    setTabId(next);
  };

  useEffect(() => {
    if (!chosen.current) return;
    chosen.current = false;
    form.current?.requestSubmit();
  }, [tabId]);

  // The server's value wins on every re-render, so a rejected move does not
  // leave the picker showing a section the field is not actually in. Applied
  // during render — an effect would show the rejected section for a frame
  // first, which is the exact impression this is meant to prevent.
  useOnChange(value, (next) => setTabId(next ?? ""));

  return (
    <form ref={form} action={action}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="id" value={fieldId} />
      <input type="hidden" name="tabId" value={tabId} />

      {/* NONE is a real, selectable value — Radix forbids an empty string as an
          item value, so "no section" travels as a sentinel and is turned back
          into "" for the form. */}
      <Select value={tabId || "__none"} onValueChange={(v) => choose(v === "__none" ? "" : v)}>
        <SelectTrigger
          aria-label={t("القسم", "Section")}
          className="h-auto max-w-[9rem] rounded-lg border-gray-200 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/5"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{t("بدون قسم", "No section")}</SelectItem>
          {tabs.map((tab) => (
            <SelectItem key={tab.id} value={tab.id}>{text(tab.label) || "—"}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}
