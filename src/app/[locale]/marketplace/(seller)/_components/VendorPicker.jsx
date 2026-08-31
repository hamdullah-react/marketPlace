"use client";

/**
 * Switching between showrooms, for someone who belongs to more than one.
 *
 * This began as a stand-in for a session — a dropdown of every vendor on the
 * platform, wrapped in an amber "TEMP, replaced by sign-in later" banner. Auth
 * has landed, so the banner is gone and the list is no longer everyone's: the
 * page hands it the caller's own showrooms, from getVendorOptions().
 *
 * It stays useful because a person can genuinely own two — a dealership and a
 * parts business, or a branch each. The dashboard renders it only when there
 * are at least two, so nobody sees a control with one option in it.
 *
 * Still drives ?vendor= rather than local state, because the choice has to
 * survive a reload and be readable by the server components on the page. The
 * pages match that value against the caller's own list and fall back to their
 * first showroom, so a hand-typed id degrades to their own data.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Store } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function VendorPicker({ vendors, current, locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const change = (id) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vendor", id);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <Store className="h-4 w-4 text-muted-foreground" />
      <label className="text-sm text-muted-foreground" htmlFor="vendor-picker">
        {t("تعمل باسم", "Acting as")}
      </label>
      {/* No hidden input — this one drives the URL, not a form submit. */}
      <Select value={current || undefined} onValueChange={change}>
        <SelectTrigger id="vendor-picker" className="h-9 w-auto min-w-[180px]">
          <SelectValue placeholder={t("اختر المعرض", "Select a showroom")} />
        </SelectTrigger>
        <SelectContent>
          {vendors.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {(isAr ? v.name_ar : v.name_en) || v.name_en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
