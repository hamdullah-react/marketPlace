import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (<div
    className={cn(
      /*
        A GREEN-tinted pulse, not bg-muted's grey.
    
        Every skeleton stands in for something that resolves into a raised
        green surface, and a grey block that becomes a green one reads as the
        page changing its mind. Tinting the primitive fixes it everywhere at
        once — the alternative is remembering to pass a colour at each of the
        sixty-odd call sites.
      */
      "animate-pulse rounded-md bg-brand-primary/10 dark:bg-white/10",
      className
    )}
    {...props} />);
}

export { Skeleton }
