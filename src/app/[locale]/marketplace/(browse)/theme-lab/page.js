import { setRequestLocale } from "next-intl/server";
import ListingCard from "../../_components/ListingCard";
import { getHomeFeatured } from "../_apicalls/homeApi";
import PaletteSpecimen from "./_components/PaletteSpecimen";

/**
 * /marketplace/theme-lab — pick the brand colour by looking at it.
 *
 * ── What this page is ───────────────────────────────────────────────────────
 *
 * A decision surface, not a feature. It renders the REAL ListingCard — the same
 * component the cars grid and the home page use, with real listings out of the
 * database — three times over, each inside a different set of brand variables.
 * So what you are comparing is the actual product in three palettes, not an
 * artist's impression of it.
 *
 * It works because the brand is a variable rather than a hex typed into
 * components: globals.css declares text-brand-primary and friends as @utility
 * rules reading var(--brand-primary), so re-declaring that variable on an
 * ancestor recolours everything underneath. See PaletteSpecimen.
 *
 * ── Delete me ───────────────────────────────────────────────────────────────
 *
 * Once a palette is chosen, its values go into globals.css and this route goes
 * away. It is noindex like everything else under /marketplace, and it is linked
 * from nowhere — you reach it by typing it.
 */

export const metadata = {
  title: "Theme lab",
  robots: { index: false, follow: false },
};

/**
 * The session is not read here, but getHomeFeatured is a live database call and
 * the page awaits it above any Suspense boundary of its own.
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

/**
 * The candidates.
 *
 * Six values each, and the last two are the reason this is a "green AND gold"
 * change rather than a swap: --gold is already declared in globals.css and
 * nothing in the app has ever used it. Green takes the role the purple holds;
 * gold becomes the accent that flags a deal.
 *
 * `rgb` and `onDarkRgb` are the same colours as bare triplets, because a
 * tinted shadow needs rgba(r, g, b, .1) and CSS cannot pull channels out of a
 * hex. They are not a second source — they are the same value written twice,
 * and they move together.
 */
const PALETTES = [
  {
    key: "A",
    nameEn: "Saudi green & gold",
    nameAr: "أخضر سعودي وذهبي",
    noteEn:
      "National-palette green with a warm classic gold. Almost the same luminance as the purple it replaces, so every white-on-brand button and badge keeps the contrast it has today.",
    noteAr:
      "أخضر بلون العلم مع ذهبي دافئ. إضاءته قريبة من البنفسجي الحالي، فيبقى تباين النص الأبيض على أزرار العلامة كما هو.",
    primary: "#0B6B3A", hover: "#095A30", onDark: "#4CC08A", tint: "#E8F5EE",
    gold: "#D4AF37", goldLight: "#E8CC6E",
    rgb: "11, 107, 58", onDarkRgb: "76, 192, 138",
  },
  {
    key: "B",
    nameEn: "Emerald & brass",
    nameAr: "زمردي ونحاسي",
    noteEn:
      "Cooler and more jewel-toned, with a muted brass. Reads premium-automotive rather than national. Darker than the purple, so white text sits on more contrast, not less.",
    noteAr:
      "أبرد وأقرب إلى الأحجار الكريمة، مع نحاسي هادئ. طابعه فخم لا وطني. أغمق من البنفسجي، فالتباين يزيد لا ينقص.",
    primary: "#0F5132", hover: "#0B3D26", onDark: "#5FD3A0", tint: "#E7F2EC",
    gold: "#C9A227", goldLight: "#DFC067",
    rgb: "15, 81, 50", onDarkRgb: "95, 211, 160",
  },
  {
    key: "C",
    nameEn: "Racing green & champagne",
    nameAr: "أخضر داكن وشمبانيا",
    noteEn:
      "Nearly black-green with a pale champagne. The most understated of the three — dark enough that it starts reading as a neutral, which is why the gold is the brightest here and does most of the visible work.",
    noteAr:
      "أخضر يكاد يكون أسود مع شمبانيا فاتح. الأهدأ بين الثلاثة — داكن لدرجة يُقرأ معها كلون محايد، ولذلك الذهبي هنا هو الأوضح ويحمل معظم العبء البصري.",
    primary: "#14452F", hover: "#0E3221", onDark: "#6FBF9B", tint: "#EAF1ED",
    gold: "#E0C067", goldLight: "#EDD79A",
    rgb: "20, 69, 47", onDarkRgb: "111, 191, 155",
  },
];

export default async function ThemeLabPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isEnglish = locale === "en";
  const t = (ar, en) => (isEnglish ? en : ar);

  /**
   * ONE read, three renders.
   *
   * Each column used to fetch its own copy behind its own Suspense boundary —
   * three identical database round trips for three renders of the same car,
   * and nothing on the page needs them to arrive independently. Awaited once
   * here instead, which is also why this route sets `instant = false`.
   *
   * Real data rather than a fixture on purpose: a made-up listing has a tidy
   * title, a round price and exactly four specs, and those are the conditions
   * under which any colour scheme looks fine. The database has the awkward ones.
   */
  const { items, cardSpecs } = await getHomeFeatured(locale, 1);
  const listing = items?.[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-8 sm:px-8 lg:px-20 xl:px-28">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
        {t("مختبر الألوان", "Theme lab")}
      </p>
      <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl">
        {t("أخضر وذهبي، بثلاث صيغ", "Green and gold, three ways")}
      </h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {t(
          "بطاقة الإعلان نفسها — المكوّن الحقيقي ببيانات حقيقية — معروضة بثلاث لوحات ألوان. الأخضر يأخذ دور البنفسجي الحالي، والذهبي يصبح لون العروض. اختر واحدة وسأطبّقها على الملفات كلها.",
          "The same listing card — the real component, with real data — in three palettes. Green takes the role the purple holds today; gold becomes the accent for deals. Pick one and I'll apply it across the tree."
        )}
      </p>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-6">
        {PALETTES.map((palette) => (
          <PaletteSpecimen key={palette.key} palette={palette} locale={locale}>
            {listing ? (
              <ListingCard
                listing={listing}
                locale={locale}
                /* Keyed by listing id, not one flat array — the card wants its
                   own row's specs. Same call shape as the home grid. */
                cardSpecs={cardSpecs[listing.id] ?? []}
                priority
              />
            ) : (
              <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                {t(
                  "لا توجد إعلانات منشورة للمعاينة. انشر إعلاناً وستظهر البطاقة هنا.",
                  "No live listings to preview. Publish one and this fills in."
                )}
              </p>
            )}
          </PaletteSpecimen>
        ))}
      </div>

      {/* ── What actually changes ──────────────────────────────────────── */}
      <section className="mt-16 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          {t("أين يذهب كل لون", "Where each value lands")}
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
                <th className="border-b border-neutral-200 px-3 py-2 text-start font-semibold dark:border-neutral-800">
                  {t("المتغيّر", "Token")}
                </th>
                <th className="border-b border-neutral-200 px-3 py-2 text-start font-semibold dark:border-neutral-800">
                  {t("يحلّ محل", "Replaces")}
                </th>
                <th className="border-b border-neutral-200 px-3 py-2 text-start font-semibold dark:border-neutral-800">
                  {t("يستخدمه", "Used by")}
                </th>
              </tr>
            </thead>
            <tbody className="text-neutral-600 dark:text-neutral-400">
              {[
                ["--brand-primary", "#0B6B3A", t("الأزرار والروابط والعناوين وشارة الحالة وظل البطاقة", "Buttons, links, headings, condition badge, focus rings, card shadow tint")],
                ["--brand-dark", "#095A30", t("حالات التمرير", "Hover states")],
                ["--brand-on-dark", "#4CC08A", t("العلامة في الوضع الداكن — كان مكتوباً يدوياً في ٣٣ ملفاً", "The brand in dark mode — was hand-typed across 33 files")],
                ["--brand-light", "#E8F5EE", t("الرقائق المحددة والتعبئات الخفيفة", "Selected chips, subtle fills, the compare toggle's pressed state")],
                ["--brand-rgb", "70, 25, 79", t("الظلال الملوّنة، لأن CSS لا يستخرج القنوات من قيمة hex", "Tinted shadows — CSS cannot pull channels out of a hex")],
                ["--gold", t("— جديد —", "— new —"), t("شارات العروض والخصومات وعلامات التوثيق", "Offer and discount badges, verified marks, anything flagged as a deal")],
              ].map(([token, replaces, used]) => (
                <tr key={token}>
                  <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-2.5 font-mono text-xs font-medium text-neutral-800 dark:border-neutral-900 dark:text-neutral-200">
                    {token}
                  </td>
                  <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-2.5 font-mono text-xs dark:border-neutral-900">
                    {replaces}
                  </td>
                  <td className="border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-900">{used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
