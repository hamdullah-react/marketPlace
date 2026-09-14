/**
 * How a seller's lead form LOOKS.
 *
 * ── Tokens, not fixed presets ───────────────────────────────────────────────
 *
 * Corner radius, padding, gap, font size, border thickness and five colours are
 * all the seller's to set. A preset is now just a STARTING POINT: it fills those
 * tokens and picks the structure — bordered, filled, underlined, carded — and
 * everything after that is theirs.
 *
 * ── How arbitrary values reach the page ─────────────────────────────────────
 *
 * Tailwind scans source text, so a class built at runtime is a class that does
 * not exist in the stylesheet: a rounded utility with a radius the seller chose
 * has never been seen by the compiler and never will be.
 *
 * So every token travels as a CSS custom property, set once on the form's
 * wrapper, and every rule that uses it is an ordinary Tailwind class written
 * out in full here. The classes are literal; only the values move. One `style`
 * prop on one element, and no component anywhere grows a style object.
 *
 * ── What is still not free, and why ─────────────────────────────────────────
 *
 * There is no box for raw CSS. Whatever a seller typed there would be injected
 * into a page that strangers load, so it is an XSS surface with extra steps; and
 * it would be applied to markup this file is still free to change, so it would
 * break on its own. Every value below is a NUMBER inside a range or a SIX-DIGIT
 * HEX, checked on the server before it is stored.
 *
 * Numbers are clamped rather than rejected, because a slider cannot produce an
 * out-of-range value and anything that does is a hand-made post. Colours are
 * rejected outright, because a nearly-valid colour is a string being written
 * into a stylesheet.
 *
 * ── The one thing that cannot be got wrong ──────────────────────────────────
 *
 * Text on the accent. A seller who picks pale yellow and gets white chips has
 * made an unreadable form and finds out when a buyer gives up, so that one is
 * COMPUTED — see readableOn.
 *
 * Pure data, no JSX: the builder's preview and the buyer's real form both read
 * this, so the preview cannot drift from what a buyer gets.
 */

/* ── Colours ─────────────────────────────────────────────────────────────── */

/** Six hex digits with a hash. Anything else is not a colour we will store. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_ACCENT = '#46194f';

/** Quick swatches for the accent. The picker is there for everything else. */
export const ACCENT_PRESETS = [
  { hex: '#46194f', swatch: 'bg-[#46194f]', ar: 'لون المتجر', en: 'Store colour' },
  { hex: '#2563eb', swatch: 'bg-[#2563eb]', ar: 'أزرق', en: 'Blue' },
  { hex: '#059669', swatch: 'bg-[#059669]', ar: 'أخضر', en: 'Green' },
  { hex: '#b45309', swatch: 'bg-[#b45309]', ar: 'كهرماني', en: 'Amber' },
  { hex: '#e11d48', swatch: 'bg-[#e11d48]', ar: 'وردي', en: 'Rose' },
  { hex: '#334155', swatch: 'bg-[#334155]', ar: 'رمادي', en: 'Slate' },
];

/**
 * The colours a seller may set, beyond the accent.
 *
 * All OPTIONAL — null means "use the preset's own light and dark values", which
 * is what every form gets until somebody changes it. Once set, a colour applies
 * in dark mode too: there is one value, and asking a car dealer to pick a second
 * palette for dark mode is a question they should not have to answer. The
 * builder says so beside the controls.
 */
export const COLOR_FIELDS = [
  { key: 'text', ar: 'لون النص', en: 'Answer text', varName: '--lf-text' },
  { key: 'label', ar: 'لون التسمية', en: 'Label', varName: '--lf-label' },
  { key: 'background', ar: 'خلفية الحقل', en: 'Field background', varName: '--lf-bg' },
  { key: 'border', ar: 'لون الحد', en: 'Border', varName: '--lf-border' },
];

/**
 * Black or white, whichever can actually be read on `hex`.
 *
 * Relative luminance per WCAG, with the sRGB gamma step — the naive
 * (r + g + b) / 3 average calls pure green dark and pure blue light, which is
 * backwards for both.
 */
export function readableOn(hex: string) {
  const value = HEX_COLOR.test(hex ?? '') ? hex : DEFAULT_ACCENT;

  const channel = (i: number) => {
    const c = parseInt(value.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);

  // 0.45 rather than 0.5: white-on-mid is harder to read than black-on-mid, so
  // the switch to black happens slightly early.
  return luminance > 0.45 ? '#111111' : '#ffffff';
}

/* ── Numbers ─────────────────────────────────────────────────────────────── */

/**
 * Every numeric token, with the range its slider allows.
 *
 * The ranges are the design constraint, and they are not opinions about taste —
 * each one is where the control stops working. A radius past ~28px on a 40px
 * input is a lozenge; vertical padding under 4px is a field nobody can tap on a
 * phone; text under 12px is text iOS zooms the whole page for.
 */
export const NUMERIC_TOKENS = [
  { key: 'radius', ar: 'استدارة الحواف', en: 'Corner radius', min: 0, max: 28, def: 12, varName: '--lf-radius' },
  { key: 'padX', ar: 'حشوة جانبية', en: 'Padding — sides', min: 6, max: 28, def: 16, varName: '--lf-pad-x' },
  { key: 'padY', ar: 'حشوة علوية وسفلية', en: 'Padding — top/bottom', min: 4, max: 20, def: 10, varName: '--lf-pad-y' },
  { key: 'gap', ar: 'المسافة بين الحقول', en: 'Space between fields', min: 4, max: 36, def: 16, varName: '--lf-gap' },
  { key: 'fontSize', ar: 'حجم نص الإجابة', en: 'Answer text size', min: 12, max: 20, def: 14, varName: '--lf-font' },
  { key: 'labelSize', ar: 'حجم التسمية', en: 'Label size', min: 10, max: 18, def: 14, varName: '--lf-label-size' },
  { key: 'borderWidth', ar: 'سماكة الحد', en: 'Border thickness', min: 0, max: 3, def: 1, varName: '--lf-border-w' },
  /**
   * How tall a Paragraph answer box is, in ROWS.
   *
   * Rows rather than pixels, because the box has to hold lines of text at
   * whatever size the seller set above — a fixed 90px is three lines at 14px
   * and two at 20px, and the second one is a box that looks broken.
   *
   * It is the only token that is not a length, which is why it has no CSS
   * variable: it reaches the textarea as the `rows` attribute instead.
   */
  { key: 'textareaRows', ar: 'ارتفاع مربع النص', en: 'Paragraph height', min: 2, max: 10, def: 3, varName: null },
];

/* ── Presets ──────────────────────────────────────────────────────────────
   A starting point: the STRUCTURE of a field, plus the numbers it starts on.
   Everything a preset sets, the seller can then move. */

export const FORM_STYLES = [
  {
    key: 'classic',
    ar: 'كلاسيكي',
    en: 'Classic',
    hint: { ar: 'تسمية فوق الحقل، حدود واضحة', en: 'Label above, clear borders' },
    labelTone: 'text-gray-800 dark:text-gray-200',
    shape: 'border-solid',
    defaultBg: 'bg-transparent dark:bg-white/5',
    defaultBorder: 'border-gray-200 dark:border-white/10',
    defaultText: 'text-gray-900 dark:text-white',
    field: '',
    numbers: {},
  },
  {
    key: 'boxed',
    ar: 'مملوء',
    en: 'Filled',
    hint: { ar: 'خلفية رمادية بدون حدود', en: 'Soft grey fill, no border' },
    labelTone: 'text-gray-700 dark:text-gray-300',
    shape: 'border-solid',
    defaultBg: 'bg-gray-100 dark:bg-white/10',
    defaultBorder: 'border-transparent',
    defaultText: 'text-gray-900 dark:text-white',
    field: '',
    numbers: { borderWidth: 0, radius: 10 },
  },
  {
    key: 'minimal',
    ar: 'بسيط',
    en: 'Minimal',
    hint: { ar: 'خط سفلي فقط', en: 'Underline only' },
    labelTone: 'uppercase tracking-wide text-gray-500',
    // The one preset that overrides the radius and side padding it is handed,
    // because an underlined field with rounded corners and side padding is
    // neither underlined nor a field.
    shape: 'border-y-0 border-x-0 border-b-[length:var(--lf-border-w)] border-solid !rounded-none !px-0',
    defaultBg: 'bg-transparent',
    defaultBorder: 'border-gray-300 dark:border-white/20',
    defaultText: 'text-gray-900 dark:text-white',
    field: '',
    numbers: { padY: 8 },
  },
  {
    key: 'card',
    ar: 'بطاقات',
    en: 'Cards',
    hint: { ar: 'كل حقل في بطاقة', en: 'Each field in its own card' },
    labelTone: 'text-gray-800 dark:text-gray-200',
    shape: 'border-solid',
    defaultBg: 'bg-white dark:bg-transparent',
    defaultBorder: 'border-gray-200 dark:border-white/10',
    defaultText: 'text-gray-900 dark:text-white',
    field: 'rounded-2xl border border-gray-200 bg-gray-50/60 p-3 dark:border-white/10 dark:bg-white/5',
    numbers: { gap: 12, radius: 8 },
  },
  {
    key: 'compact',
    ar: 'مضغوط',
    en: 'Compact',
    hint: { ar: 'مساحة أقل، للنماذج الطويلة', en: 'Tighter — for longer forms' },
    labelTone: 'text-gray-600 dark:text-gray-400',
    shape: 'border-solid',
    defaultBg: 'bg-transparent dark:bg-white/5',
    defaultBorder: 'border-gray-200 dark:border-white/10',
    defaultText: 'text-gray-900 dark:text-white',
    field: '',
    numbers: { padX: 12, padY: 6, gap: 10, radius: 8, labelSize: 12 },
  },
];

/**
 * A theme as it is stored (jsonb) and as it is handed back.
 *
 * An index signature rather than a field per token, because the token list is
 * NUMERIC_TOKENS/COLOR_FIELDS — data, not syntax — and the loops below build
 * the object from it. Adding a token should mean editing that list only.
 */
export type FormTheme = { accent: string; [token: string]: string | number | null };

const BY_KEY: Record<string, (typeof FORM_STYLES)[number] | undefined> =
  Object.fromEntries(FORM_STYLES.map((s) => [s.key, s]));

/** The theme a vendor who has changed nothing gets, for one preset. */
export function defaultTheme(styleKey = 'classic'): FormTheme {
  const preset = BY_KEY[styleKey] ?? FORM_STYLES[0]!;
  const numbers: Record<string, number> = Object.fromEntries(
    NUMERIC_TOKENS.map((n) => [
      n.key,
      (preset.numbers as Record<string, number | undefined>)[n.key] ?? n.def,
    ]),
  );

  return {
    accent: DEFAULT_ACCENT,
    ...numbers,
    ...Object.fromEntries(COLOR_FIELDS.map((c) => [c.key, null])),
  };
}

export const DEFAULT_THEME = defaultTheme('classic');

/**
 * Normalises whatever is stored into a theme with usable values.
 *
 * Never trusts the stored object: it is jsonb, so a hand-edited row could hold
 * anything, and an unknown value would render as no rule at all — an invisible
 * field rather than a loud error.
 */
export function normaliseTheme(theme: unknown, styleKey = 'classic'): FormTheme {
  const t: Record<string, unknown> =
    theme && typeof theme === 'object' ? (theme as Record<string, unknown>) : {};
  const base = defaultTheme(styleKey);

  const accent = typeof t.accent === 'string' ? t.accent : '';
  const out: FormTheme = {
    accent: HEX_COLOR.test(accent) ? accent.toLowerCase() : base.accent,
  };

  for (const n of NUMERIC_TOKENS) {
    const raw = Number(t[n.key]);
    out[n.key] = Number.isFinite(raw)
      ? Math.min(n.max, Math.max(n.min, Math.round(raw)))
      : base[n.key] ?? null;
  }

  // Null is a real value here — "use the preset's own light and dark colours" —
  // so a missing key must not turn into a colour.
  for (const c of COLOR_FIELDS) {
    const raw = typeof t[c.key] === 'string' ? (t[c.key] as string) : '';
    out[c.key] = HEX_COLOR.test(raw) ? raw.toLowerCase() : null;
  }

  return out;
}

/**
 * The custom properties one lead form needs, ready for a `style` prop.
 *
 * Applied to ONE wrapper. Every child styles itself with ordinary Tailwind
 * classes that read these.
 */
export function themeVars(theme: unknown, styleKey = 'classic') {
  const t = normaliseTheme(theme, styleKey);

  const vars: Record<string, string> = {
    '--lead-accent': t.accent,
    '--lead-accent-fg': readableOn(t.accent),
    // A 12% wash for hover and soft fills — derived, rather than asking the
    // seller for a second colour they would have to keep in step with the first.
    '--lead-accent-soft': `color-mix(in srgb, ${t.accent} 12%, transparent)`,
  };

  // Skips the row count — it is not a length and has no variable. See the note
  // on textareaRows.
  for (const n of NUMERIC_TOKENS) if (n.varName) vars[n.varName] = `${t[n.key]}px`;
  for (const c of COLOR_FIELDS) {
    const v = t[c.key];
    if (typeof v === 'string' && v) vars[c.varName] = v;
  }

  return vars;
}

/** For the callers that only care about the accent. */
export const accentVars = (hex: string) => themeVars({ accent: hex });

/**
 * The finished class bundle for one form.
 *
 * Never returns undefined — an unknown preset falls back to the first, and an
 * unknown token to its default, so a stale row renders as something plain
 * rather than as nothing.
 */
export function formStyle(key: string, theme?: unknown) {
  // FORM_STYLES is a non-empty literal, so the fallback always exists —
  // noUncheckedIndexedAccess cannot see that, hence the assertion.
  const preset = BY_KEY[key] ?? FORM_STYLES[0]!;
  const t = normaliseTheme(theme, preset.key);

  // Every one of these is a literal class string. The seller's value never
  // appears in one — it is in the variable the class points at.
  const sized =
    'w-full outline-none transition-colors rounded-[var(--lf-radius)] ' +
    'px-[var(--lf-pad-x)] py-[var(--lf-pad-y)] text-[length:var(--lf-font)] ' +
    'border-[length:var(--lf-border-w)]';

  const textClass = t.text ? 'text-[color:var(--lf-text)]' : preset.defaultText;
  const bgClass = t.background ? 'bg-[var(--lf-bg)]' : preset.defaultBg;
  const borderClass = t.border ? 'border-[color:var(--lf-border)]' : preset.defaultBorder;
  const labelClass = t.label ? 'text-[color:var(--lf-label)]' : preset.labelTone;

  return {
    key: preset.key,
    accent: t.accent,
    vars: themeVars(t, preset.key),

    label: `mb-1.5 block font-medium text-[length:var(--lf-label-size)] ${labelClass}`,
    input: `${sized} ${preset.shape} ${bgClass} ${borderClass} ${textClass} focus:border-[color:var(--lead-accent)]`,

    // A chip in its unselected state: the same corner and padding language as
    // an input, one step rounder — a pill reads as "tap me", a pill-shaped text
    // box reads as a search bar.
    chip:
      'inline-flex select-none items-center gap-1.5 border-solid transition-colors ' +
      'text-[length:var(--lf-font)] rounded-[calc(var(--lf-radius)+6px)] ' +
      'px-[var(--lf-pad-x)] py-[var(--lf-pad-y)] border-[length:var(--lf-border-w)] ' +
      `${bgClass} ${borderClass} ${textClass}`,
    chipOn:
      'border-[color:var(--lead-accent)] bg-[var(--lead-accent)] text-[color:var(--lead-accent-fg)]',
    chipHover:
      'hover:border-[color:var(--lead-accent)] hover:bg-[var(--lead-accent-soft)]',

    solid: 'bg-[var(--lead-accent)] text-[color:var(--lead-accent-fg)]',
    accentText: 'text-[color:var(--lead-accent)]',
    accentBorder: 'border-[color:var(--lead-accent)]',

    field: preset.field,
    gap: 'gap-[var(--lf-gap)]',

    // Passed as an attribute rather than a class, because `rows` is what makes
    // a textarea size itself to its own text.
    textareaRows: t.textareaRows,
  };
}

/**
 * How much of the row one field takes.
 *
 * A fraction, not a pixel count: the same form renders on a phone, in a dialog
 * and on a laptop, and 320px inside a 300px column is a horizontal scrollbar.
 *
 * The breakpoint is a CONTAINER query, not a viewport one. The buyer's form
 * lives inside a 448px dialog on a 1400px screen — a viewport media query would
 * put two half-width fields side by side in a column too narrow for either,
 * which is what "half doesn't work" looks like from the outside. A container
 * query asks the right question: how wide is the form, not how wide is the
 * monitor.
 */
export const WIDTHS = [
  { key: 'full', ar: 'كامل', en: 'Full', span: '@sm:col-span-6' },
  { key: 'half', ar: 'نصف', en: 'Half', span: '@sm:col-span-3' },
  { key: 'third', ar: 'ثلث', en: 'Third', span: '@sm:col-span-2' },
];

const WIDTH_BY_KEY: Record<string, (typeof WIDTHS)[number] | undefined> =
  Object.fromEntries(WIDTHS.map((w) => [w.key, w]));

export function widthSpan(key: string) {
  // `full` is a member of WIDTHS, so the fallback is always there.
  return (WIDTH_BY_KEY[key] ?? WIDTH_BY_KEY.full!).span;
}

/**
 * The grid every lead form sits in.
 *
 * Six columns, because six divides by two and by three — so half is three
 * columns and third is two, and a row always adds up. The container marker is
 * what makes the spans above measure the form rather than the window.
 */
export const FORM_GRID = '@container grid grid-cols-1 @sm:grid-cols-6';
