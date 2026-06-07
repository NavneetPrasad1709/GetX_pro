import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Post-login redirect guard: only same-origin relative paths are allowed —
 * never an open redirect (e.g. ?callbackUrl=https://evil.com).
 */
export function safeCallbackUrl(url: string | undefined | null): string {
  if (url && url.startsWith("/") && !url.startsWith("//")) return url
  return "/dashboard"
}
