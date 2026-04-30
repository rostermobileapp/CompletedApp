import * as React from "react"

import { cn } from "@/lib/utils"
import { useKeyboardAwareInput } from "@/hooks/use-keyboard"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, onFocus, ...props }, ref) => {
  const { handleFocus: keyboardFocus } = useKeyboardAwareInput();
  
  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    keyboardFocus(e);
    onFocus?.(e);
  };
  
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[hsl(var(--hairline))] bg-background px-3 py-2 text-base shadow-[var(--elev-inset)] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      onFocus={handleFocus}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
