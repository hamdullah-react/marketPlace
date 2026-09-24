"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

/**
 * The tooltip, in a PORTAL and with an arrow.
 *
 * ── Why the portal ──────────────────────────────────────────────────────────
 *
 * Radix renders content where you put it unless told otherwise, and where this
 * is put is inside a card — which is `overflow-hidden` so its photo is clipped
 * by the rounded corner. The tooltip was clipped by the same rule: the text ran
 * under the edge of the card and the part outside it simply was not drawn.
 *
 * A portal moves the content to the end of <body>, so nothing above it can clip
 * it. Radix keeps it positioned against the trigger regardless.
 *
 * ── The arrow ───────────────────────────────────────────────────────────────
 *
 * A floating box with no tail has to be guessed at; the arrow says which mark
 * it belongs to, which matters here because the triggers are four icons in a
 * row a few pixels apart. It is filled with the same token as the bubble, so it
 * follows the theme with everything else.
 *
 * collisionPadding keeps it off the very edge of the viewport — without it a
 * tooltip on the last card in a row is flush against the window.
 *
 * No `overflow-hidden` on the bubble: the arrow is a child positioned OUTSIDE
 * its box, so hiding the overflow hides the arrow.
 */
const TooltipContent = React.forwardRef(
  ({ className, sideOffset = 6, arrow = true, children, ...props }, ref) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 max-w-[min(18rem,calc(100vw-2rem))] rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)",
          className
        )}
        {...props}>
        {children}
        {arrow ? (
          <TooltipPrimitive.Arrow
            width={11}
            height={5}
            className="fill-popover drop-shadow-[0_1px_0_var(--color-border)]"
          />
        ) : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
