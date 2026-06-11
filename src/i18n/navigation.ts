import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation wrappers (Step 23). Use THESE instead of `next/link`
 * and `next/navigation` in components that link around the app, so the active
 * locale (the `/hi` prefix) is preserved automatically when navigating.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
