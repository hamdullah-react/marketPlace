"use client";

/**
 * The seller's own questions, rendered.
 *
 * ONE component, used twice: by the buyer's request dialog and by the builder's
 * live preview. That is the whole point of it living here rather than inside
 * either one — a preview built from a second copy of this markup is a preview
 * that drifts, and the seller finds out from a buyer.
 *
 * `preview` is the only difference between the two: it disables the inputs and
 * suppresses the name attributes, so a half-built form in the dashboard cannot
 * be submitted and cannot collide with the real one's field names.
 */

import { useState } from "react";
import { Check, X, Plus } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formStyle, widthSpan, FORM_GRID } from "@/marketplace/lib/form-styles";

export default function LeadFields({
  fields = [],
  tabs = [],
  locale = "ar",
  styleKey = "classic",
  // Accent, corners, density. Normalised inside formStyle, so an unknown value
  // renders as the default rather than as no class at all.
  theme = null,
  errors = {},
  preview = false,
}) {
  const s = formStyle(styleKey, theme);
  const text = (obj) => obj?.[locale] || obj?.en || obj?.ar || "";

  /**
   * Only the tabs that actually hold a field.
   *
   * A tab the seller made and never filled is a header over nothing, and a
   * buyer who clicks it finds an empty panel and assumes the form is broken.
   */
  const used = tabs.filter((tab) => fields.some((f) => f.tab_id === tab.id));

  // Anything not in a tab, rendered ABOVE the strip — a field with no tab
  // belongs to the whole form rather than to whichever tab happens to be open.
  const loose = fields.filter(
    (f) => !f.tab_id || !used.some((tab) => tab.id === f.tab_id)
  );

  const [openTab, setOpenTab] = useState(null);
  const activeTab = used.some((tab) => tab.id === openTab) ? openTab : used[0]?.id ?? null;

  if (!fields.length) return null;

  const grid = (list) => (
    <div className={`${FORM_GRID} ${s.gap}`}>
      {list.map((field) => (
        <div key={field.id ?? field.field_key} className={widthSpan(field.width)}>
          <LeadField
            field={field}
            locale={locale}
            style={s}
            error={errors[`field__${field.field_key}`]}
            preview={preview}
          />
        </div>
      ))}
    </div>
  );

  return (
    /**
     * The ONE inline style in the form, and the only one there can be.
     *
     * The accent is a colour the seller picked, so it cannot be a Tailwind
     * class — Tailwind scans source text and `#3f7d2a` was never in it. It
     * travels as a custom property set here; every child below styles itself
     * with ordinary classes that read it, like `bg-[var(--lead-accent)]`.
     */
    <div className="flex flex-col gap-4" style={s.vars}>
      {loose.length ? grid(loose) : null}

      {used.length ? (
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5 border-b border-gray-200 dark:border-white/10">
            {used.map((tab) => {
              const on = activeTab === tab.id;
              // Counted so a buyer can see how much is left rather than
              // discovering a fourth section after finishing the third.
              const n = fields.filter((f) => f.tab_id === tab.id).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOpenTab(tab.id)}
                  aria-selected={on}
                  className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    on
                      ? `${s.accentBorder} ${s.accentText}`
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {text(tab.label) || "—"}
                  <span
                    className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                      on ? `${s.solid} text-white` : "bg-gray-100 text-gray-500 dark:bg-white/10"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Every tab stays MOUNTED — `hidden`, never unmounted. A buyer who
              fills in tab one, opens tab two and comes back must find their
              answers still there, and an unmounted input has already thrown
              them away. It is also what lets one submit carry the whole form
              rather than only the tab that happened to be open. */}
          {used.map((tab) => (
            <div key={tab.id} hidden={activeTab !== tab.id}>
              {grid(fields.filter((f) => f.tab_id === tab.id))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LeadField({ field, locale, style, error, preview }) {
  const text = (obj) => obj?.[locale] || obj?.en || obj?.ar || "";

  // No `name` in preview: two forms on one page must not both claim
  // field__budget, and a preview must never be submittable.
  const name = preview ? undefined : `field__${field.field_key}`;
  const id = `${preview ? "preview" : "lead"}__${field.field_key}`;

  const label = text(field.label) || field.field_key;
  const help = text(field.help);
  const options = field.options ?? [];

  /**
   * A placeholder for every input, whether or not the seller wrote one.
   *
   * A blank box gives no clue what shape the answer should take, and the type
   * already says: a date field can show a date, a phone field a number in the
   * local shape. The seller's own text always wins — this is the floor, not an
   * override.
   */
  const placeholder = text(field.placeholder) || defaultPlaceholder(field.type, locale);

  const common = {
    id,
    name,
    placeholder,
    disabled: preview,
    className: `${style.input} ${error ? "border-red-400 dark:border-red-500/60" : ""}`,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}__error` : undefined,
  };

  /**
   * Inline, not sub-components.
   *
   * `const Help = () => …` inside a render declares a NEW component type on
   * every render, so React unmounts and remounts it each time — and a component
   * named `Error` also shadows the built-in inside this scope. Two lines of JSX
   * repeated twice is the smaller problem.
   */
  const helpEl = help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null;

  const errorEl = error ? (
    <p id={`${id}__error`} className="mt-1 text-xs font-medium text-red-600">
      {error}
    </p>
  ) : null;

  /* ── A single yes/no ─────────────────────────────────────────────────── */
  if (field.type === "checkbox") {
    return (
      <div className={style.field}>
        <Consent
          id={id}
          name={name}
          label={label}
          required={field.required}
          style={style}
          preview={preview}
        />
        {helpEl}
        {errorEl}
      </div>
    );
  }

  return (
    <div className={style.field}>
      <label htmlFor={id} className={style.label}>
        {label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </label>

      {field.type === "textarea" ? (
        /* `rows` from the theme, and resize-y rather than resize-none: the
           seller sets the height they think is right, and a buyer with more to
           say should still be able to drag it taller. */
        <textarea
          {...common}
          rows={style.textareaRows ?? 3}
          className={`${common.className} resize-y`}
        />
      ) : field.type === "select" ? (
        <Dropdown
          id={id}
          name={name}
          options={options}
          text={text}
          placeholder={placeholder}
          disabled={preview}
          className={common.className}
          error={error}
        />
      ) : field.type === "multiselect" || field.type === "radio" ? (
        <Chips
          field={field}
          name={name}
          options={options}
          text={text}
          style={style}
          preview={preview}
          error={error}
        />
      ) : (
        <input
          {...common}
          type={
            field.type === "number" ? "number"
              : field.type === "date" ? "date"
              : field.type === "email" ? "email"
              : field.type === "phone" ? "tel"
              : "text"
          }
          inputMode={
            field.type === "number" ? "numeric" : field.type === "phone" ? "tel" : undefined
          }
          dir={["number", "date", "email", "phone"].includes(field.type) ? "ltr" : undefined}
        />
      )}

      {helpEl}
      {errorEl}
    </div>
  );
}

/**
 * What an empty box should say when the seller has not said.
 *
 * Deliberately an example rather than an instruction: "05XXXXXXXX" tells
 * somebody the shape expected, where "Enter your phone number" only repeats the
 * label that is already directly above it.
 */
function defaultPlaceholder(type, locale) {
  const ar = locale === "ar";
  switch (type) {
    case "number": return ar ? "مثال: 85000" : "e.g. 85000";
    case "phone": return "05XXXXXXXX";
    case "email": return "name@example.com";
    case "date": return ar ? "يوم/شهر/سنة" : "dd/mm/yyyy";
    case "textarea": return ar ? "اكتب هنا…" : "Type here…";
    case "select": return ar ? "اختر…" : "Choose…";
    default: return ar ? "اكتب إجابتك" : "Your answer";
  }
}

/**
 * A drawn checkbox, so it can take the accent colour and the chosen radius.
 *
 * Controlled rather than a `peer-checked:` trick, for the same reason as Chips
 * below: the accent is a CSS variable now, and `peer-checked:bg-[var(--x)]`
 * would need the variant baked into every class in form-styles — which would
 * make the tick state a concern of the style module rather than of the input.
 */
function Consent({ id, name, label, required, style, preview }) {
  const [on, setOn] = useState(false);

  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
      <input
        id={id}
        name={name}
        type="checkbox"
        value="yes"
        checked={on}
        disabled={preview}
        onChange={(e) => setOn(e.target.checked)}
        className="sr-only"
      />
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.35rem] border transition-colors ${
          on ? style.chipOn : "border-gray-300 text-transparent dark:border-white/20"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
    </label>
  );
}

/**
 * The tag control: how a multi-select and a single choice are drawn.
 *
 * The TYPE is "Multi-select"; tags are what it looks like. Keeping those two
 * apart is why the type picker does not say "chips" — a seller choosing a
 * field is choosing a question, not a paint job, and the day this renders as
 * something else the type must not have to be renamed.
 *
 * ── Picked chips carry a cross ──────────────────────────────────────────────
 *
 * A chip that is merely "darker when selected" asks a buyer to compare it with
 * its neighbours to find out what they picked. A cross says both things at
 * once: this one is chosen, and this is how to unchoose it. It is also the only
 * affordance that works when the selected chips are scattered through a long
 * list rather than sitting together.
 *
 * ── Why this is React state and not a CSS `peer-checked:` trick ─────────────
 *
 * It used to be: an `sr-only` checkbox driving the chip through a peer-checked
 * variant, which needs no JavaScript and survives anything. That stopped being
 * possible when the accent became a colour the seller picks — the selected
 * style now reads a CSS variable, and a peer-checked variant of it would push
 * the checked state into form-styles.js, where it does not belong.
 *
 * NOTE: never write a class-like token in these comments, not even as an
 * example. Tailwind scans this file as raw text and generates a rule from any
 * word that looks like a utility — a made-up one with an ellipsis inside the
 * square brackets produced invalid CSS and failed the whole build.
 *
 * The state cost is small and bounded: the dialog does not unmount on a failed
 * submit, so a rejected form keeps every chip the buyer picked. What IS gone is
 * working without JavaScript, and this is a React dialog inside a client
 * component — it never did.
 *
 * The real inputs are hidden and rendered from the selection, so the FormData
 * is exactly what it would have been with visible checkboxes.
 */
function Chips({ field, name, options, text, style, preview, error }) {
  const single = field.type === "radio";
  const [picked, setPicked] = useState([]);

  const toggle = (value) => {
    if (preview) return;
    setPicked((prev) => {
      if (single) return prev[0] === value ? [] : [value];
      return prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
    });
  };

  return (
    <div>
      <div className={`flex flex-wrap gap-2 ${error ? "rounded-xl ring-1 ring-red-400 ring-offset-4 dark:ring-offset-gray-900" : ""}`}>
        {options.map((o) => {
          const on = picked.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              disabled={preview}
              aria-pressed={on}
              className={`${style.chip} ${
                on ? style.chipOn : `${style.chipHover} text-gray-700 dark:text-gray-200`
              } ${preview ? "cursor-default" : "cursor-pointer"}`}
            >
              {text(o.label) || o.value}

              {/* Not a nested <button> — that is invalid HTML and the inner one
                  gets hoisted out. The whole chip is the toggle; the cross is a
                  label on what a second click will do. */}
              {on ? (
                <X className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* What actually submits. One input per picked value for a multi-select,
          exactly as a set of checkboxes would have produced. */}
      {name
        ? picked.map((value) => (
            <input key={value} type="hidden" name={name} value={value} />
          ))
        : null}
    </div>
  );
}

/**
 * The single-choice dropdown.
 *
 * shadcn's Select (Radix underneath), not a native `<select>`. The native one
 * was already fighting the browser — `appearance-none` and a hand-drawn caret,
 * because the system arrow ignores the seller's accent colour and sits on the
 * wrong side in RTL — and it still could not be styled where it matters: the
 * OPTION LIST is drawn by the operating system, so a form themed to a
 * showroom's colours opened a grey Windows menu in the middle of it.
 *
 * ── What actually submits ───────────────────────────────────────────────────
 *
 * A hidden input, written from React state.
 *
 * Radix will render its own hidden native select if given a `name`, and that is
 * deliberately not used here: it exists for browser autofill and behaves subtly
 * differently in and out of a form. One input this file controls is one thing
 * to reason about, and it is the same shape the Chips control below already
 * uses — so both multi and single choice submit the same way.
 *
 * In preview mode there is no `name` at all, so nothing is submitted and the
 * builder's copy cannot collide with the buyer's.
 */
function Dropdown({ id, name, options, text, placeholder, disabled, className, error }) {
  const [value, setValue] = useState("");

  return (
    <>
      <Select value={value || undefined} onValueChange={setValue} disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}__error` : undefined}
          // The theme's own classes go LAST so they win the merge against
          // shadcn's defaults — the seller's radius, padding and colours are
          // the point of the whole style system.
          className={`w-full justify-between ${className}`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {text(o.label) || o.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {name ? <input type="hidden" name={name} value={value} /> : null}
    </>
  );
}
