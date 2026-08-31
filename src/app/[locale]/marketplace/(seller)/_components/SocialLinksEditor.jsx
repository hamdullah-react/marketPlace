"use client";

/**
 * The showroom's links, as a list it owns.
 *
 * Eight fixed boxes became a list you add to, delete from and reorder. Used by
 * BOTH the Settings tab and the storefront's own dialog — the same component,
 * so the two screens cannot offer different platforms or validate differently.
 *
 * ── What it posts ───────────────────────────────────────────────────────────
 *
 * One hidden input holding the whole list as JSON, because a native form action
 * submits inputs and a list is not a form value. The server puts it through
 * parseSocialLinks() regardless — the editor is a convenience for the seller,
 * never the thing standing between a post and the database.
 */

import { useState } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Link as LinkIcon, Globe, MessageCircle,
  Send, Phone, Mail, MapPin, Store, Star, Image as ImageIcon, Video, FileText, Ghost,
} from "lucide-react";
import NextImage from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SOCIAL_PLATFORMS, CUSTOM_ICONS, DEFAULT_CUSTOM_ICON, MAX_SOCIAL_LINKS, platform,
} from "@/marketplace/lib/social";

/** The closed icon set, drawn. Keys match CUSTOM_ICONS exactly. */
const ICONS = {
  link: LinkIcon,
  globe: Globe,
  "message-circle": MessageCircle,
  send: Send,
  phone: Phone,
  mail: Mail,
  "map-pin": MapPin,
  store: Store,
  star: Star,
  image: ImageIcon,
  video: Video,
  "file-text": FileText,
  ghost: Ghost,
};

export function SocialIcon({ entry, className = "h-4 w-4" }) {
  const p = platform(entry?.key);

  if (p?.icon) {
    return (
      <NextImage
        src={p.icon}
        alt=""
        width={16}
        height={16}
        className={`${className} object-contain dark:invert`}
      />
    );
  }

  const Icon = ICONS[p?.lucide ?? entry?.icon] ?? ICONS[DEFAULT_CUSTOM_ICON];
  return <Icon className={className} />;
}

export default function SocialLinksEditor({
  locale = "ar",
  name = "socialLinks",
  value = [],
  label,
  hint,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const seed = (list) =>
    (Array.isArray(list) ? list : []).map((e) => ({
      key: e.key ?? "custom",
      url: e.url ?? "",
      label: e.label ?? "",
      icon: e.icon ?? DEFAULT_CUSTOM_ICON,
    }));

  const [links, setLinks] = useState(() => seed(value));

  /**
   * Follow the server when the STORED list changes.
   *
   * useState reads its argument once, so this editor would keep whatever it was
   * mounted with for ever — and the same links are editable from the storefront,
   * which revalidates this page. Without this, a link added over there arrived
   * in the props and the box on this screen went on showing the old list, so
   * saving Settings would have written it straight back and undone the edit.
   *
   * Adjusted during render rather than in an effect, which is the pattern React
   * documents for a state that has to follow a prop: an effect would paint the
   * stale list once first. Compared by value, because the prop is a fresh array
   * on every render and identity would fire this constantly.
   */
  const incoming = JSON.stringify(value ?? []);
  const [lastIncoming, setLastIncoming] = useState(incoming);
  if (incoming !== lastIncoming) {
    setLastIncoming(incoming);
    setLinks(seed(value));
  }

  const set = (i, patch) =>
    setLinks((prev) => prev.map((e, n) => (n === i ? { ...e, ...patch } : e)));

  const remove = (i) => setLinks((prev) => prev.filter((_, n) => n !== i));

  /* Order is the seller's: a showroom whose customers are all on WhatsApp
     wants it first, and the list prints in the order it is stored. */
  const move = (i, by) =>
    setLinks((prev) => {
      const next = [...prev];
      const to = i + by;
      if (to < 0 || to >= next.length) return prev;
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  const add = () =>
    setLinks((prev) =>
      prev.length >= MAX_SOCIAL_LINKS
        ? prev
        : [...prev, { key: "custom", url: "", label: "", icon: DEFAULT_CUSTOM_ICON }]
    );

  return (
    <div className="min-w-0">
      {label ? <span className="mb-1.5 block text-sm font-medium">{label}</span> : null}

      {/* Blank rows are dropped by the server, so a half-finished one costs
          nothing — it simply does not become a link. */}
      <input type="hidden" name={name} value={JSON.stringify(links)} />

      {/* @container: the rows below size themselves against THIS box.
          The same editor is used in a 512px dialog and a full settings
          page, and a window-width breakpoint gets the narrow one wrong
          every time. */}
      <div className="@container space-y-2">
        {links.map((entry, i) => {
          const known = platform(entry.key);

          return (
            /* Wraps until the ROW has room for the lot — @2xl is 672px of
               container, which is what a custom link needs before its URL
               box stops being a couple of characters across. Platform, name
               and icon stay together on the first wrapped line. */
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-lg border p-2 @2xl:flex-nowrap"
            >
              {/* What it is. Choosing a known platform brings its mark and its
                  handle rule; "Other" hands both back to the seller. */}
              <div className="w-40 shrink-0 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("المنصّة", "Platform")}
                </Label>
                <Select
                  value={entry.key}
                  onValueChange={(key) => set(i, { key })}
                >
                  {/* The mark and the name are ONE line. SelectTrigger
                      applies `[&>span]:line-clamp-1`, which is a
                      -webkit-box laid out vertically and outranks a plain
                      `flex` on the span it targets; `:first-child` here
                      carries more specificity than it does, so the row
                      stays a row. */}
                  <SelectTrigger className="h-9 [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-2 [&>span:first-child>span]:truncate">
                    <span className="min-w-0">
                      <SocialIcon entry={entry} className="h-3.5 w-3.5 shrink-0" />
                      {/* Radix drops className on Value, so the ellipsis is
                          applied from the trigger above instead. */}
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent dir={isAr ? "rtl" : "ltr"}>
                    {SOCIAL_PLATFORMS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {isAr ? p.ar : p.en}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">{t("رابط آخر", "Other link")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* A custom link needs a name and a mark; a known one is called
                  what the platform is called and wears its own. */}
              {!known ? (
                <>
                  <div className="w-32 shrink-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("الاسم", "Name")}
                    </Label>
                    <Input
                      className="h-9"
                      value={entry.label}
                      maxLength={40}
                      onChange={(e) => set(i, { label: e.target.value })}
                      placeholder={t("حراج", "Haraj")}
                    />
                  </div>

                  <div className="w-28 shrink-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("الأيقونة", "Icon")}
                    </Label>
                    <Select
                      value={entry.icon ?? DEFAULT_CUSTOM_ICON}
                      onValueChange={(icon) => set(i, { icon })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={isAr ? "rtl" : "ltr"}>
                        {CUSTOM_ICONS.map((iconName) => {
                          const Icon = ICONS[iconName];
                          return (
                            <SelectItem key={iconName} value={iconName}>
                              <span className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5" />
                                {iconName}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}

              <div className="min-w-0 flex-1 basis-56 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("الرابط", "Link")}
                </Label>
                <Input
                  className="h-9"
                  dir="ltr"
                  value={entry.url}
                  onChange={(e) => set(i, { url: e.target.value })}
                  placeholder={known?.hint ?? "https://example.com"}
                />
              </div>

              <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t("أعلى", "Move up")}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === links.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("أسفل", "Move down")}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  onClick={() => remove(i)}
                  aria-label={t("حذف", "Remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {links.length ? null : (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t("لا توجد روابط بعد.", "No links yet.")}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={links.length >= MAX_SOCIAL_LINKS}
        >
          <Plus className="h-4 w-4" />
          {t("أضف رابطاً", "Add a link")}
        </Button>

        {links.length >= MAX_SOCIAL_LINKS ? (
          <span className="text-xs text-muted-foreground">
            {t(`الحد ${MAX_SOCIAL_LINKS} روابط`, `${MAX_SOCIAL_LINKS} links is the limit`)}
          </span>
        ) : null}
      </div>

      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
