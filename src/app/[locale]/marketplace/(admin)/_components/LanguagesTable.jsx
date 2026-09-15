"use client";

/**
 * Admin → Settings → Languages. Which languages the public site offers, and
 * which one a visitor lands on. A 3-dot menu per row: make default, switch on
 * or off. The default language cannot be switched off, and one always stays on.
 */

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Star, Power, PowerOff, Loader2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { setDefaultLanguage, setLanguageEnabled } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

export default function LanguagesTable({ locale = "ar", languages = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const enabledCount = languages.filter((l) => l.enabled).length;

  return (
    <div className="raised-card rounded-xl p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
        <Languages className="h-4 w-4 text-brand-gold" />
        {t("اللغات", "Languages")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "اللغات المتاحة للزوار في الموقع العام. زر تبديل اللغة يختفي عندما تكون لغة واحدة مفعّلة، والروابط بلغة موقوفة تُحوَّل إلى اللغة الافتراضية.",
          "The languages visitors can use on the public site. The language switch disappears when only one is on, and links in a switched-off language redirect to the default one."
        )}
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("اللغة", "Language")}</TableHead>
              <TableHead className="text-start">{t("الرمز", "Code")}</TableHead>
              <TableHead className="text-start">{t("الاتجاه", "Direction")}</TableHead>
              <TableHead className="text-start">{t("الحالة", "Status")}</TableHead>
              <TableHead className="w-16 text-end">{t("إجراءات", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {languages.map((lang) => (
              <TableRow key={lang.code}>
                <TableCell>
                  <p className="flex items-center gap-2 font-medium">
                    {lang.nativeLabel}
                    {lang.isDefault ? (
                      <span className="flex items-center gap-1 rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-bold text-[#6b5200] dark:text-brand-gold">
                        <Star className="h-3 w-3" />
                        {t("افتراضية", "Default")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{lang.label}</p>
                </TableCell>
                <TableCell className="font-mono text-xs uppercase">{lang.code}</TableCell>
                <TableCell className="text-xs">
                  {lang.dir === "rtl" ? t("من اليمين لليسار", "Right to left") : t("من اليسار لليمين", "Left to right")}
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      lang.enabled
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {lang.enabled ? t("مفعّلة", "On") : t("موقوفة", "Off")}
                  </span>
                </TableCell>
                <TableCell className="text-end">
                  <LanguageRowActions
                    locale={locale}
                    language={lang}
                    canDisable={!lang.isDefault && enabledCount > 1}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LanguageRowActions({ locale, language, canDisable }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const makeDefault = useActionResult(setDefaultLanguage, INITIAL, { onSuccess: () => router.refresh() });
  const toggle = useActionResult(setLanguageEnabled, INITIAL, { onSuccess: () => router.refresh() });

  const busy = makeDefault.pending || toggle.pending;
  const failed = makeDefault.result?.error ? makeDefault.result : toggle.result?.error ? toggle.result : null;

  const send = (hook, fields) => {
    hook.dismiss();
    const body = new FormData();
    body.set("code", language.code);
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    startTransition(() => hook.formAction(body));
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {failed ? <span className="me-2 text-xs text-red-600">{errorText(failed.error, locale)}</span> : null}
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" /> : null}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label={t("إجراءات", "Actions")} disabled={busy}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"} className="w-52">
          <DropdownMenuItem className="gap-2" disabled={language.isDefault} onSelect={() => send(makeDefault, {})}>
            <Star className="h-4 w-4" />
            {t("اجعلها الافتراضية", "Make default")}
          </DropdownMenuItem>
          {language.enabled ? (
            <DropdownMenuItem
              className="gap-2 text-red-600 focus:text-red-600"
              disabled={!canDisable}
              onSelect={() => send(toggle, { enabled: "false" })}
            >
              <PowerOff className="h-4 w-4" />
              {t("إيقاف اللغة", "Switch off")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="gap-2" onSelect={() => send(toggle, { enabled: "true" })}>
              <Power className="h-4 w-4" />
              {t("تفعيل اللغة", "Switch on")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
