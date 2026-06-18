import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Post-login redirect guard: only same-origin relative paths are allowed —
 * never an open redirect (e.g. ?callbackUrl=https://evil.com).
 *
 * A naive `!startsWith("//")` check is NOT enough: browsers/WHATWG URL parsers
 * normalize "\" to "/", so "/\evil.com" is equivalent to "//evil.com" and would
 * hard-navigate cross-origin after login (CWE-601). We resolve the candidate
 * against a throwaway origin and accept it ONLY if the origin is unchanged —
 * which rejects "\", control chars, encoded variants and protocol-relative URLs
 * while preserving the path + query + hash of a genuine internal link.
 */
export function safeCallbackUrl(url: string | undefined | null): string {
  if (!url || !url.startsWith("/")) return "/dashboard"
  try {
    const u = new URL(url, "http://internal.invalid")
    if (u.origin !== "http://internal.invalid") return "/dashboard"
    return u.pathname + u.search + u.hash
  } catch {
    return "/dashboard"
  }
}
