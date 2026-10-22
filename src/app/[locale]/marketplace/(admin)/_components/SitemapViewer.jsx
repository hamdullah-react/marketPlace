"use client";

/**
 * What is actually in /sitemap.xml, in a shape somebody can read.
 *
 * ── The questions this screen exists to answer ──────────────────────────────
 *
 * The admin already had a link to sitemap.xml, which opens 93 KB of raw XML in
 * a browser tab. That answers none of the things anybody opens a sitemap to
 * find out:
 *
 *   how many URLs are in it, and of what
 *   is THIS car in it
 *   what has been left out, and on whose instruction
 *   when did the contents last change
 *
 * So the groups lead, the search is over every URL, and the exclusions are a
 * section of their own rather than an absence somebody has to notice.
 *
 * ── Everything here comes from the server's report ──────────────────────────
 *
 * No fetching and no second opinion: the page passes in exactly what built the
 * XML (see marketplace/seo/sitemapData.js). This component only decides how to
 * show it, which is why it can be a client component without being able to
 * drift from the file it describes.
 */

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle, Check, ChevronDown, Copy, Download, ExternalLink,
  Image as ImageIcon, Loader2, RefreshCw, Search,
} from "lucide-react";
import { regenerateSitemap } from "../admin/_actions/sitemap";
import { setPageIndexed } from "../admin/_actions/site";

const REASONS = {
  seo_index_off: { ar: "الفهرسة مُطفأة لهذه الصفحة", en: "Indexing switched off for this page" },
  default_hidden: { ar: "مخفية افتراضياً", en: "Hidden by default" },
};

/** A date somebody can read, or a dash. Never "Invalid Date". */
function when(value, isAr) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function SitemapViewer({ report, summary, locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(() => summary.groups.find((g) => g.count)?.key ?? null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * The switches, held locally so a toggle lands immediately.
   *
   * The server action re-renders this page, but a switch that waits for a
   * round trip before moving reads as broken — somebody presses it twice and
   * ends up back where they started. Seeded from the report and corrected by
   * the re-render if the write fails.
   */
  const [indexed, setIndexed] = useState(() =>
    Object.fromEntries((report.pageControls ?? []).map((p) => [p.key, p.index]))
  );
  const [saving, setSaving] = useState(null);
  /**
   * A refused toggle has to SAY so.
   *
   * It used to revert the switch and nothing else, which looks exactly like a
   * save that silently did not take — the switch moves, springs back, and the
   * admin is left guessing. The commonest cause is a real one: these actions
   * require the `admin` role, and a `staff` account is refused, so the
   * message names that rather than leaving it to be discovered.
   */
  const [toggleError, setToggleError] = useState(null);
  const [tab, setTab] = useState("urls");

  const togglePage = (key, next) => {
    setIndexed((prev) => ({ ...prev, [key]: next }));
    setSaving(key);
    setToggleError(null);
    startTransition(async () => {
      const res = await setPageIndexed(key, next);
      if (!res?.ok) {
        setIndexed((prev) => ({ ...prev, [key]: !next }));
        setToggleError({ key, code: res?.error ?? "SAVE_FAILED" });
      }
      setSaving(null);
    });
  };

  /* Filtering happens over the URL text, which is what somebody pastes in when
     they are looking for one car. Lowercased once per keystroke rather than
     per row per keystroke. */
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return report.groups;
    const out = {};
    for (const [key, entries] of Object.entries(report.groups)) {
      out[key] = entries.filter((e) => e.url.toLowerCase().includes(needle));
    }
    return out;
  }, [needle, report.groups]);

  const matches = useMemo(
    () => Object.values(filtered).reduce((n, list) => n + list.length, 0),
    [filtered]
  );

  const copyAll = async () => {
    const all = summary.groups.flatMap((g) => (report.groups[g.key] ?? []).map((e) => e.url));
    try {
      await navigator.clipboard.writeText(all.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A refused clipboard is not worth an error dialog; the Download button
      // is beside it and does the same job.
    }
  };

  /* A plain text file of every URL — what a search console's bulk tools and a
     crawler like Screaming Frog both take. Built in the browser from data that
     is already here, so there is no endpoint to secure. */
  const download = () => {
    const all = summary.groups.flatMap((g) => (report.groups[g.key] ?? []).map((e) => e.url));
    const blob = new Blob([all.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sitemap-urls.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const regenerate = () =>
    startTransition(async () => {
      const res = await regenerateSitemap();
      if (res?.ok) {
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }
    });

  /* Defined once and rendered in BOTH returns: an admin whose site-wide
     visibility is off still has to be able to see and set these, and the
     banner above them explains that nothing is published meanwhile. */
  const pagePanel = (
    <>
      {/* ── Which pages go in ────────────────────────────────────────────
          The fixed pages of the site, each with a switch. Cars, showrooms and
          articles are not here on purpose: there can be thousands of them and
          each already carries the same switch on its own form, so a list of
          them would be a second place to set the same thing and a worse one. */}
      {report.pageControls?.length ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h2 className="text-sm font-bold text-brand-primary">
              {t("الصفحات في خريطة الموقع", "Pages in the sitemap")}
            </h2>
            {/* Says what the switch REALLY does. It writes seo_index, which is
                one instruction with two effects, and an admin who thought they
                were only tidying a file would be deindexing a page. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "إطفاء الصفحة يزيلها من sitemap.xml ويضيف إليها noindex — وهما معاً، لأن إدراج صفحة في الخريطة مع منع فهرستها تناقض تُبلّغ عنه أدوات المشرفين كخطأ.",
                "Switching a page off removes it from sitemap.xml and marks it noindex — both together, because listing a page you have told crawlers to ignore is a contradiction search consoles report as an error."
              )}
            </p>
          </div>
          {toggleError ? (
            <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {toggleError.code === "NOT_ADMIN"
                ? t(
                    `لم يُحفظ «${toggleError.key}»: هذا الإجراء يحتاج صلاحية «مدير»، وحسابك موظّف.`,
                    `"${toggleError.key}" was not saved: this needs the admin role, and your account is staff.`
                  )
                : toggleError.code === "NOT_SIGNED_IN"
                  ? t("انتهت الجلسة. سجّل الدخول وحاول مرة أخرى.", "Your session expired. Sign in and try again.")
                  : t(
                      `لم يُحفظ «${toggleError.key}» (${toggleError.code}).`,
                      `"${toggleError.key}" was not saved (${toggleError.code}).`
                    )}
            </p>
          ) : null}
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {report.pageControls.map((pc) => {
                  const on = indexed[pc.key] ?? pc.index;
                  return (
                    <tr key={pc.key} className="border-t border-gray-100 first:border-t-0 dark:border-gray-800/60">
                      <td className="px-4 py-2">
                        <span className="font-medium">{pc.key}</span>
                        {pc.customised ? null : (
                          <span className="ms-2 text-[11px] text-muted-foreground">
                            {t("افتراضي", "default")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{pc.path}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {pc.changefreq} · {Number(pc.priority).toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-end">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={t(`إدراج ${pc.key}`, `Include ${pc.key}`)}
                          disabled={saving === pc.key}
                          onClick={() => togglePage(pc.key, !on)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                            on ? "bg-brand-primary" : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                              on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );

  if (report.disabled) {
    return (
      <div className="space-y-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {t("الموقع مخفي عن محركات البحث", "The site is hidden from search engines")}
        </p>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          {t(
            "خريطة الموقع فارغة لأن «الظهور في محركات البحث» مُطفأ في الإعدادات → SEO. شغّله لتعود كل الروابط.",
            "The sitemap is empty because site-wide visibility is switched off in Settings → SEO defaults. Turn it on and every URL comes back."
          )}
        </p>
      </div>
        {pagePanel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── The headline numbers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("رابط", "URLs"), value: summary.urls },
          { label: t("صورة", "Images"), value: summary.images },
          { label: t("لغة", "Languages"), value: report.languages.length },
          { label: t("مستبعد", "Excluded"), value: summary.excluded },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-2xl font-bold text-brand-primary">{s.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث عن رابط…", "Search a URL…")}
            aria-label={t("ابحث عن رابط", "Search a URL")}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white ps-9 pe-3 text-sm outline-hidden focus:border-brand-primary dark:border-gray-600 dark:bg-[#1a1a1a]"
          />
        </div>

        <button type="button" onClick={copyAll}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-gray-600">
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? t("تم النسخ", "Copied") : t("نسخ الكل", "Copy all")}
        </button>

        <button type="button" onClick={download}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-gray-600">
          <Download className="h-4 w-4" />
          {t("تنزيل", "Download")}
        </button>

        <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-gray-600">
          <ExternalLink className="h-4 w-4" />
          XML
        </a>

        <button type="button" onClick={regenerate} disabled={pending}
          className="raised-solid inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {pending ? t("جاري…", "Working…") : done ? t("تم التحديث", "Regenerated") : t("إعادة التوليد", "Regenerate")}
        </button>
      </div>

      {needle ? (
        <p className="text-xs text-muted-foreground">
          {t(`${matches} نتيجة`, `${matches} matching URL${matches === 1 ? "" : "s"}`)}
        </p>
      ) : null}

      {/* ── Tabs ─────────────────────────────────────────────────────────
          Three sections that are read one at a time: what is IN the sitemap,
          which pages go in, and what was left out. Stacked they made a page
          nobody scrolled to the bottom of — the exclusions, which are the
          most diagnostic part, were the furthest down.

          Plain buttons and a conditional, not a tabs library: there are three
          of them, the state is one string, and the admin bundle does not need
          a dependency for that. */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
        {[
          { id: "urls", ar: "الروابط", en: "URLs", count: summary.urls },
          { id: "pages", ar: "التحكم بالصفحات", en: "Page controls", count: report.pageControls?.length ?? 0 },
          { id: "excluded", ar: "المستبعد", en: "Excluded", count: summary.excluded },
        ].map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            aria-selected={tab === tb.id}
            role="tab"
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === tb.id
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-gray-500 hover:text-brand-primary dark:text-gray-400"
            }`}
          >
            {t(tb.ar, tb.en)}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              tab === tb.id ? "bg-brand-primary/10" : "bg-gray-100 dark:bg-white/10"
            }`}>
              {tb.count.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {tab === "urls" ? (
      /* Every URL that goes into the file, grouped by what it is. */
      <div className="space-y-2">
        {summary.groups.map((g) => {
          const entries = filtered[g.key] ?? [];
          /* A search hides the groups it found nothing in — otherwise the
             answer to "is this car in the sitemap" is six empty accordions. */
          if (needle && !entries.length) return null;
          const isOpen = needle ? true : open === g.key;

          return (
            <div key={g.key} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setOpen(isOpen && !needle ? null : g.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <span className="flex items-center gap-3">
                  <span className="text-sm font-bold text-brand-primary">{t(g.ar, g.en)}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold dark:bg-white/10">
                    {entries.length.toLocaleString()}
                  </span>
                  {g.images ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {g.images}
                    </span>
                  ) : null}
                  {/* Every URL appears once per language, so the raw count on a
                      bilingual site is double the number of actual pages. */}
                  {report.languages.length > 1 && !needle ? (
                    <span className="text-xs text-muted-foreground">
                      {t(`${g.unique} صفحة × ${report.languages.length}`, `${g.unique} pages × ${report.languages.length}`)}
                    </span>
                  ) : null}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen ? (
                <div className="max-h-[420px] overflow-auto border-t border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-xs dark:bg-[#1a1a1a]">
                      <tr>
                        <th className="px-4 py-2 text-start font-semibold">URL</th>
                        <th className="px-3 py-2 text-start font-semibold">{t("التكرار", "Frequency")}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t("الأولوية", "Priority")}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t("آخر تعديل", "Modified")}</th>
                        <th className="px-3 py-2 text-start font-semibold">{t("صور", "Images")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.slice(0, 500).map((e) => (
                        <tr key={e.url} className="border-t border-gray-100 dark:border-gray-800/60">
                          <td className="max-w-[420px] px-4 py-2">
                            <a href={e.url} target="_blank" rel="noopener noreferrer"
                              className="block truncate font-mono text-xs text-brand-primary hover:underline" title={e.url}>
                              {e.url}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{e.changeFrequency ?? "—"}</td>
                          <td className="px-3 py-2 text-xs font-mono">{e.priority?.toFixed?.(1) ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{when(e.lastModified, isAr)}</td>
                          <td className="px-3 py-2 text-xs">{e.images?.length ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* A browser asked to lay out 20,000 rows stops being a
                      browser. The file itself is complete; this is the view. */}
                  {entries.length > 500 ? (
                    <p className="border-t border-gray-100 px-4 py-2 text-xs text-muted-foreground dark:border-gray-800/60">
                      {t(
                        `يُعرض أول ٥٠٠ من ${entries.length.toLocaleString()}. استخدم البحث أو نزّل القائمة كاملة.`,
                        `Showing the first 500 of ${entries.length.toLocaleString()}. Use the search, or download the full list.`
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      ) : null}

      {tab === "pages" ? (
        <>
      {pagePanel}
        </>
      ) : null}

      {tab === "excluded" ? (
        report.excluded.length ? (
        /* What was filtered out, and on whose instruction. */
        <div className="overflow-hidden rounded-xl border border-amber-300 dark:border-amber-900">
          <div className="flex items-center gap-2 bg-amber-50 px-4 py-3 dark:bg-amber-950/40">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
              {t("مستبعد من خريطة الموقع", "Left out of the sitemap")} · {report.excluded.length}
            </span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {report.excluded.map((x, i) => (
                  <tr key={`${x.group}-${x.label}-${i}`} className="border-t border-gray-100 dark:border-gray-800/60">
                    <td className="px-4 py-2 font-mono text-xs">{x.label}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{x.path}</td>
                    <td className="px-3 py-2 text-xs">
                      {REASONS[x.reason] ? t(REASONS[x.reason].ar, REASONS[x.reason].en) : x.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          <p className="rounded-xl border border-gray-200 p-6 text-center text-sm text-muted-foreground dark:border-gray-800">
            {t("لا شيء مستبعد — كل صفحة قابلة للفهرسة موجودة في الخريطة.", "Nothing is excluded — every indexable page is in the sitemap.")}
          </p>
        )
      ) : null}

    </div>
  );
}
