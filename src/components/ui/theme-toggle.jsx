"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/hooks/use-hydrated"

export function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme()
  // The resolved theme is a browser fact, so the server cannot render it and
  // the first client render must not either — see hooks/use-hydrated.
  const mounted = useHydrated()

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300",
          "bg-gray-100 text-gray-400",
          className
        )}
        disabled
      >
        <Sun className="h-5 w-5" />
      </button>
    )
  }

  const getCurrentIcon = () => {
    switch (theme) {
      case "dark":
        return <Moon className="h-5 w-5" />
      default:
        return <Sun className="h-5 w-5" />
    }
  }

  const getButtonStyle = () => {
    switch (theme) {
      case "dark":
        return "bg-slate-800 text-yellow-400 hover:bg-slate-700 border border-slate-600"
      default:
        return "bg-white text-brand-primary hover:bg-gray-100 border border-gray-200"
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 shadow-xs",
            getButtonStyle(),
            className
          )}
          aria-label="Toggle theme"
        >
          {getCurrentIcon()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-700"
      >
        {/* Light Theme */}
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={cn(
            "flex items-center gap-3 cursor-pointer transition-colors",
            theme === "light" && "bg-purple-50 text-brand-primary font-medium"
          )}
        >
          <Sun className="h-4 w-4 text-yellow-500" />
          <span>Light</span>
          <span className="text-xs text-gray-400 mr-auto">فاتح</span>
        </DropdownMenuItem>

        {/* Dark Theme */}
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={cn(
            "flex items-center gap-3 cursor-pointer transition-colors",
            theme === "dark" && "bg-slate-100 text-slate-800 font-medium"
          )}
        >
          <Moon className="h-4 w-4 text-slate-600" />
          <span>Dark</span>
          <span className="text-xs text-gray-400 mr-auto">داكن</span>
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeToggle
