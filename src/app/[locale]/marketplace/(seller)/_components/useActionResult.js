"use client";

/**
 * Moved to @/marketplace/ui/useActionResult.
 *
 * The buyer's account, the admin panel and the seller's own screens all submit
 * server actions now, and the hook that reads their results had no business
 * living inside one route group. Re-exported from here so the dozen imports
 * that already point at this path keep working; new code imports the shared
 * one directly.
 */

export { useActionResult } from "@/marketplace/ui/useActionResult";
