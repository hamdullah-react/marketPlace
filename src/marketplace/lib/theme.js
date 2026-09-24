/**
 * The look of the whole marketplace, as data.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Every colour, radius and shadow in the app already resolves through a CSS
 * variable in globals.css — `--brand-primary`, `--app-bg`, `--radius-xl`, and
 * the `--brand-rgb` triplet the raised shadows are tinted with. That was one
 * edit in one file for a developer and no edit at all for an admin.
 *
 * This module is the same set of variables, stored in site_settings.theme and
 * written back into the page as a <style> block (see ThemeStyle.jsx). The
 * stylesheet keeps its values as the DEFAULTS, so a database with no theme row
 * — or one where the SQL has not been run — looks exactly as it does today.
 *
 * ── Five knobs, not fifty ───────────────────────────────────────────────────
 *
 * An admin picks the brand colour, the accent, the two page backgrounds, a
 * corner roundness and a shadow strength. Everything else is DERIVED, because
 * the derived values are relationships rather than choices: `--brand-dark` is
 * the brand colour pressed, `--brand-light` is it at 8% over white, and
 * `--brand-on-dark` is the same hue lifted until it is readable on near-black.
 * Asking somebody to pick five greens that agree is how a theme ends up with a
 * hover state from a different palette.
 *
 * Shared by the server (page render) and the client (the admin's live
 * preview), so it holds no server-only imports.
 */

/* ── Colour helpers ───────────────────────────────────────────────────────── */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** '#0B6B3A' → {r,g,b}, or null when it is not a hex colour. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;

  let value = m[1];
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');

  const n = parseInt(value, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

/** A valid hex colour in `#rrggbb`, or null. Anything else is not a colour. */
export function normalizeHex(value, fallback = null) {
  const rgb = hexToRgb(value);
  return rgb ? toHex(rgb) : fallback;
}

/** '11, 107, 58' — the channels a tinted shadow needs, since CSS cannot read them out of a hex. */
export function rgbTriplet(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : null;
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;

  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return {
    r: channel(h + 1 / 3) * 255,
    g: channel(h) * 255,
    b: channel(h - 1 / 3) * 255,
  };
}

/** The same hue at a different lightness (and optionally a capped saturation). */
function recolour(hex, { l, s, fallback }) {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;

  const hsl = rgbToHsl(rgb);
  return toHex(
    hslToRgb({
      h: hsl.h,
      s: s == null ? hsl.s : clamp(s(hsl.s), 0, 1),
      l: clamp(l, 0, 1),
    })
  );
}

/**
 * How bright a colour reads, 0..1 (WCAG relative luminance).
 *
 * Needed because "lightness 53%" is not the same brightness for every hue:
 * hsl(149, 60%, 53%) is a bright green, hsl(224, 60%, 53%) is a mid blue that
 * disappears against a near-black page. The dark-mode shade is lifted until
 * this says it is bright enough, so the rule is the same for every brand
 * colour an admin picks.
 */
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * '#0B6B3A' → '149 81% 23%' — HSL CHANNELS, with no hsl() wrapper.
 *
 * The shape shadcn's tokens are written in: tailwind.config resolves them as
 * `hsl(var(--primary))`, so the variable must hold the channels alone. This is
 * a second spelling of the same colour, not a second colour — see themeCss().
 */
function hslChannels(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** `hex` laid over white at `weight` (0 = white, 1 = the colour itself). */
function over(hex, weight, fallback) {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  return toHex({
    r: 255 + (rgb.r - 255) * weight,
    g: 255 + (rgb.g - 255) * weight,
    b: 255 + (rgb.b - 255) * weight,
  });
}

/* ── The settings ─────────────────────────────────────────────────────────── */

/**
 * The values in globals.css, repeated here as the starting point.
 *
 * They are the SAME numbers on purpose: an admin who has never opened
 * Appearance, and a database whose `theme` column does not exist yet, both get
 * the stylesheet's own look rather than a second default that drifts from it.
 */
export const THEME_DEFAULTS = {
  primary: '#0B6B3A',
  gold: '#D4AF37',
  bgLight: '#EAF4EE',
  bgDark: '#0B130E',
  /* A multiplier over Tailwind's radius scale, so every `rounded-*` in the app
     moves together instead of one card at a time. */
  radius: 1,
  /* A multiplier over the alpha of every raised shadow. 0 is flat. */
  shadow: 1,
  /* Per-badge colours. `null` on either half means "work it out from the brand
     or the accent" — see BADGE_SLOTS. */
  badges: {},
};

/**
 * The badges a card can carry, and what each is painted with.
 *
 * FIVE of them, which is the answer to "how many are there": the promoted
 * placement, a named offer, a saving with no name on it, and the two halves of
 * new/used. The rank medals (1, 2, 3) are deliberately not here — gold, silver
 * and bronze are what a medal IS, and recolouring them would stop them reading
 * as places.
 *
 * `bg` paints the pill and `fg` paints both the text and the icon, because the
 * icon is drawn in currentColor — one choice, not two that can disagree.
 *
 * A null means "follow the brand colour": the New badge tracks whatever the
 * theme's primary is, so an admin who changes one colour does not have to come
 * back and change this one to match. Everything else has a literal default,
 * which is exactly what the card already showed.
 */
export const BADGE_SLOTS = [
  {
    key: 'featured',
    ar: 'مميز', en: 'Featured',
    bg: '#06170E', fg: null, // fg null → the accent (gold), as it was
    accentFg: true,
  },
  { key: 'offer', ar: 'عرض', en: 'Offer', bg: null, fg: '#2a2100', accentBg: true },
  { key: 'discount', ar: 'نسبة التوفير', en: 'Saving', bg: null, fg: '#2a2100', accentBg: true },
  { key: 'isNew', ar: 'جديد', en: 'New', bg: null, fg: '#ffffff', brandBg: true },
  { key: 'used', ar: 'مستعمل', en: 'Used', bg: '#ffffff', fg: '#374151' },
];

export const RADIUS_STEPS = [
  { value: 0, ar: 'حواف حادة', en: 'Square' },
  { value: 0.5, ar: 'خفيف', en: 'Slight' },
  { value: 1, ar: 'افتراضي', en: 'Default' },
  { value: 1.5, ar: 'دائري', en: 'Rounded' },
  { value: 2, ar: 'دائري جداً', en: 'Very rounded' },
];

export const SHADOW_STEPS = [
  { value: 0, ar: 'بدون ظل', en: 'Flat' },
  { value: 0.5, ar: 'خفيف', en: 'Soft' },
  { value: 1, ar: 'افتراضي', en: 'Default' },
  { value: 1.5, ar: 'قوي', en: 'Strong' },
];

const nearest = (steps, value, fallback) => {
  /* null, undefined and '' are MISSING, not zero. Number(null) is 0, which is
     a real step on both scales — so a theme saved before a knob existed came
     back with that knob turned to nothing (flat shadows, square corners)
     rather than left at its default. */
  if (value == null || value === '') return fallback;

  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return steps.reduce(
    (best, step) => (Math.abs(step.value - n) < Math.abs(best - n) ? step.value : best),
    fallback
  );
};

/**
 * Whatever is stored → a theme that can be rendered.
 *
 * Never throws and never returns a partial object: this runs inside a cached
 * read on every page, and a malformed value — a colour named "red", a radius
 * of "big", a column that does not exist — has to degrade to the default look
 * rather than take the stylesheet down with it.
 */
export function normalizeTheme(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    primary: normalizeHex(raw.primary, THEME_DEFAULTS.primary),
    gold: normalizeHex(raw.gold, THEME_DEFAULTS.gold),
    bgLight: normalizeHex(raw.bgLight, THEME_DEFAULTS.bgLight),
    bgDark: normalizeHex(raw.bgDark, THEME_DEFAULTS.bgDark),
    radius: nearest(RADIUS_STEPS, raw.radius, THEME_DEFAULTS.radius),
    shadow: nearest(SHADOW_STEPS, raw.shadow, THEME_DEFAULTS.shadow),
    /* Only the slots an admin has actually overridden are stored. A slot left
       alone keeps deriving from the brand and the accent, so changing the brand
       colour still moves the New badge with it. */
    badges: Object.fromEntries(
      BADGE_SLOTS.map((slot) => {
        const sent = raw.badges?.[slot.key];
        const bg = normalizeHex(sent?.bg, null);
        const fg = normalizeHex(sent?.fg, null);
        return [slot.key, bg || fg ? { ...(bg ? { bg } : {}), ...(fg ? { fg } : {}) } : null];
      }).filter(([, v]) => v)
    ),
  };
}

/** True when the theme is the built-in one — nothing needs to be written out. */
export const isDefaultTheme = (theme) =>
  Object.keys(THEME_DEFAULTS).every((k) =>
    k === 'badges'
      ? !Object.keys(theme.badges ?? {}).length
      : theme[k] === THEME_DEFAULTS[k]
  );

/**
 * The family of shades one brand colour implies.
 *
 * Exported so the admin's preview swatches show what a colour will actually
 * become — the pressed state, the tint behind a badge, and the lighter version
 * dark mode has to use.
 */
/**
 * The brand colour as dark mode has to show it.
 *
 * Starts where the hand-written #4CC08A sat (lightness 53%, saturation capped
 * so a vivid hue does not glare) and keeps lifting while the colour is too dim
 * to read on the near-black surfaces. A green lands on the first try; a navy
 * or a maroon would not, and used to come out almost invisible.
 */
function onDarkShade(primary) {
  const cap = (s) => Math.max(0.35, Math.min(s, 0.6));

  for (let l = 0.53; l <= 0.86; l += 0.03) {
    const shade = recolour(primary, { l, s: cap, fallback: '#4CC08A' });
    if (luminance(shade) >= 0.3) return shade;
  }
  return recolour(primary, { l: 0.86, s: cap, fallback: '#4CC08A' });
}

/**
 * What each badge is actually painted with.
 *
 * The admin's choice if they made one; otherwise the slot's default, with the
 * two "follow the theme" cases resolved — the New badge takes the brand colour
 * and the offer/saving badges take the accent. That is why a slot is stored as
 * null rather than as a copy of today's colour: copy it and changing the brand
 * would leave the badge behind.
 */
function badgeColours(theme) {
  const out = {};

  for (const slot of BADGE_SLOTS) {
    const chosen = theme.badges?.[slot.key] ?? null;

    const bg = chosen?.bg
      ?? (slot.brandBg ? theme.primary : slot.accentBg ? theme.gold : slot.bg);
    const fg = chosen?.fg ?? (slot.accentFg ? theme.gold : slot.fg);

    out[slot.key] = { bg: bg ?? '#000000', fg: fg ?? '#ffffff' };
  }

  return out;
}

/** The brand hue as a dark panel: same colour, lightness fixed, saturation tamed. */
const darkSurface = (primary, l, fallback) =>
  recolour(primary, { l, s: (v) => Math.min(v, 0.42), fallback });

export function derive(theme) {
  const t = normalizeTheme(theme);

  return {
    ...t,
    /* Pressed / hover-dark: the same colour with the lights down. */
    dark: recolour(t.primary, {
      l: Math.max(0.08, rgbToHsl(hexToRgb(t.primary)).l - 0.05),
      fallback: '#095A30',
    }),
    /* The pale wash behind badges and empty states. */
    light: over(t.primary, 0.08, '#E8F5EE'),
    /* Dark mode cannot reuse the brand colour: #0B6B3A on near-black is
       unreadable, so the hue is lifted to a fixed readable lightness. */
    onDark: onDarkShade(t.primary),
    /* The near-black dark surfaces sit on — the brand hue rather than a
       neutral, so a dark card reads as part of the theme. */
    ink: recolour(t.primary, { l: 0.06, s: (s) => Math.min(s, 0.6), fallback: '#06170E' }),
    goldLight: over(t.gold, 0.55, '#E8CC6E'),

    /**
     * The lit surfaces — every `raised` panel, button, chip and the header.
     *
     * A wash of the brand colour over white for the light theme, and the same
     * hue taken down to near-black for dark mode. The weights and lightnesses
     * are the ones the hand-written greens already used, so the default theme
     * reproduces globals.css exactly and any other colour gets surfaces that
     * belong to it rather than to the old green.
     *
     * Saturation is capped on the dark ones: a vivid hue at 15% lightness
     * reads as a stain rather than as a dark panel.
     */
    surface: {
      from: over(t.primary, 0.02, '#fcfefd'),
      to: over(t.primary, 0.07, '#eaf6ef'),
      headerFrom: over(t.primary, 0.03, '#f7fcf9'),
      headerTo: over(t.primary, 0.13, '#dcefe4'),
      hoverFrom: '#ffffff',
      hoverTo: over(t.primary, 0.1, '#e0f0e7'),
      cardFrom: over(t.primary, 0.015, '#fbfefc'),
      cardTo: over(t.primary, 0.05, '#edf7f1'),
      darkFrom: darkSurface(t.primary, 0.18, '#1b4029'),
      darkTo: darkSurface(t.primary, 0.13, '#12301f'),
      darkHoverFrom: darkSurface(t.primary, 0.21, '#214d32'),
      darkHoverTo: darkSurface(t.primary, 0.16, '#163925'),
      darkCardFrom: darkSurface(t.primary, 0.16, '#163925'),
      darkCardTo: darkSurface(t.primary, 0.105, '#0e2517'),
    },
    rgb: rgbTriplet(t.primary) ?? '11, 107, 58',
    /* The same colour as HSL channels, for shadcn's `hsl(var(--primary))`. */
    hsl: hslChannels(t.primary) ?? '149 81% 23%',
    /* Every badge's final pair, admin override over derived default. */
    badges: badgeColours(t),
  };
}

/* Tailwind 4's own radius scale, in rem. Every `rounded-*` utility resolves
   through these, so scaling them here moves the whole app at once. */
const RADIUS_SCALE = {
  xs: 0.125,
  sm: 0.25,
  md: 0.375,
  lg: 0.5,
  xl: 0.75,
  '2xl': 1,
  '3xl': 1.5,
  '4xl': 2,
};

/**
 * The theme as CSS, ready to put in a <style> tag.
 *
 * Only what DIFFERS from the stylesheet is emitted, so the default theme adds
 * nothing to the page. The selectors match the ones in globals.css — `:root,
 * .light` for the light values and `.dark` for the dark ones — and land after
 * it in the document, which is what lets them win without !important.
 */
export function themeCss(value) {
  const theme = normalizeTheme(value);
  if (isDefaultTheme(theme)) return '';

  const c = derive(theme);
  const light = [];
  const dark = [];

  if (theme.primary !== THEME_DEFAULTS.primary) {
    light.push(
      `--brand-primary:${c.primary}`,
      `--brand-dark:${c.dark}`,
      `--brand-light:${c.light}`,
      `--brand-on-dark:${c.onDark}`,
      `--brand-ink:${c.ink}`,
      `--brand-rgb:${c.rgb}`,
      /* The shadcn aliases every <Button>, <Badge> and focus ring resolves
         through, kept in step with the brand — they are the reason a themed
         button used to stay the old colour. */
      `--color-primary:${c.primary}`,
      `--color-primary-hover:${c.dark}`,
      `--color-primary-muted:${c.light}`,
      `--color-accent:${c.primary}`,
      `--color-ring:${c.primary}`,
      /**
       * The SAME colour again, as HSL channels.
       *
       * shadcn's own tokens are a separate set from the `--color-*` ones above:
       * tailwind.config reads them as `hsl(var(--primary))`, so a hex in
       * `--primary` renders nothing and a value in `--color-primary` is a
       * different variable entirely. Every plain <Button> — "Pick a car" on
       * the compare page, the dialogs, the pagination — resolves through these,
       * which is why they stayed green on a themed site while the hand-written
       * controls beside them changed.
       */
      `--primary:${hslChannels(c.primary)}`,
      `--ring:${hslChannels(c.primary)}`
    );
    dark.push(
      /* Dark mode reads the lifted shade, as the stylesheet's own dark block
         does — the brand colour itself is unreadable on near-black. */
      `--primary:${hslChannels(c.onDark)}`,
      `--ring:${hslChannels(c.onDark)}`,
      `--primary-foreground:${hslChannels(c.ink)}`
    );
  }

  if (theme.gold !== THEME_DEFAULTS.gold) {
    light.push(`--gold:${c.gold}`, `--gold-light:${c.goldLight}`);
  }

  if (theme.primary !== THEME_DEFAULTS.primary) {
    const s = c.surface;
    light.push(
      `--surface-from:${s.from}`,
      `--surface-to:${s.to}`,
      `--surface-header-from:${s.headerFrom}`,
      `--surface-header-to:${s.headerTo}`,
      `--surface-hover-from:${s.hoverFrom}`,
      `--surface-hover-to:${s.hoverTo}`,
      `--surface-card-from:${s.cardFrom}`,
      `--surface-card-to:${s.cardTo}`,
      `--surface-dark-from:${s.darkFrom}`,
      `--surface-dark-to:${s.darkTo}`,
      `--surface-dark-hover-from:${s.darkHoverFrom}`,
      `--surface-dark-hover-to:${s.darkHoverTo}`,
      `--surface-dark-card-from:${s.darkCardFrom}`,
      `--surface-dark-card-to:${s.darkCardTo}`
    );
  }

  if (theme.bgLight !== THEME_DEFAULTS.bgLight) light.push(`--app-bg:${c.bgLight}`);
  if (theme.bgDark !== THEME_DEFAULTS.bgDark) light.push(`--app-bg-dark:${c.bgDark}`);

  if (theme.radius !== THEME_DEFAULTS.radius) {
    for (const [name, rem] of Object.entries(RADIUS_SCALE)) {
      light.push(`--radius-${name}:${+(rem * theme.radius).toFixed(4)}rem`);
    }
    light.push(`--radius:${+(0.5 * theme.radius).toFixed(4)}rem`);
  }

  if (theme.shadow !== THEME_DEFAULTS.shadow) light.push(`--shadow-strength:${theme.shadow}`);

  /**
   * The badges, always emitted once anything else differs.
   *
   * Two of the five follow the brand or the accent, so a theme that only
   * changed the brand colour still moves them — which is the point: a card's
   * "New" pill should not stay green on a blue site. The stylesheet holds the
   * same values as its defaults, so a default theme still emits nothing at all
   * (themeCss returns early above).
   */
  for (const slot of BADGE_SLOTS) {
    const pair = c.badges[slot.key];
    light.push(`--badge-${slot.key}-bg:${pair.bg}`, `--badge-${slot.key}-fg:${pair.fg}`);
  }

  const blocks = [];
  if (light.length) blocks.push(`:root,.light{${light.join(';')}}`);
  if (dark.length) blocks.push(`.dark{${dark.join(';')}}`);
  return blocks.join('');
}
