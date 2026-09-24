import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The raised surface, applied to EVERY card in the app.
 *
 * ── Why here and not per page ───────────────────────────────────────────────
 *
 * The marketplace is built on `raised-card` — a lit panel with a tinted,
 * layered shadow (globals.css) — and the hand-written panels all used it while
 * this shared component sat on shadcn's flat `border + shadow-sm`. That put two
 * different card designs on the same screen: the admin dashboard's stat cards
 * looked like a different product from the panels beside them.
 *
 * One change here fixes every one of the nineteen files that import this, and
 * means a card added tomorrow is right without anyone remembering a class name.
 *
 * `rounded-xl`, not lg: it is Tailwind's radius scale, so it follows the corner
 * setting in Admin → Settings → Appearance with everything else.
 *
 * The border is gone rather than kept alongside: `raised-card`'s own inset
 * highlight IS its edge, and a border on top of it reads as a line drawn round
 * a lit object.
 *
 * className still wins — `cn` merges last-in, so a caller can override any of
 * this where a flat card is genuinely wanted.
 */
const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("raised-card rounded-xl text-card-foreground", className)}
    {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-2xl font-semibold leading-none tracking-tight", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
