import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /*
          ── Lit from above, like the rest of the chrome ──────────────────────

          `raised-solid` and `raised` are the app's surface utilities (see the
          RAISED SURFACES block in globals.css). Putting them HERE means every
          <Button> in the tree — the compare page, the seller dashboard, the
          dialogs — gets the treatment without a single call site changing.

          Which one each variant wears follows from what the variant MEANS:

            default/destructive  filled, so raised-solid: keep the fill, add a
                                 lit top edge and a shadow in the button's own
                                 colour rather than a generic grey
            outline/secondary    the pale face, which is what `raised` is
            ghost/link           NOTHING. A ghost that is raised is not a ghost,
                                 and a link that presses is a button wearing the
                                 wrong clothes.
        */
        default: "raised-solid bg-primary text-primary-foreground",
        destructive: "raised-solid bg-destructive text-destructive-foreground",
        outline: "raised border border-input",
        secondary: "raised",
        ghost: "transition-colors hover:bg-accent hover:text-accent-foreground",
        link: "transition-colors text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
