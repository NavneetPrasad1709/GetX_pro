/**
 * Trust-score presentation helpers (Prompt 04) — the SINGLE source of truth for
 * how a trust score maps to colour/label across listing cards, the seller trust
 * panel and the seller profile page. Previously this logic was copy-pasted in
 * three files; consolidating it here means a threshold change propagates
 * everywhere (essential once the Step 17 trust service updates scores live).
 *
 * Pure module — no DB, no side effects. Safe to import in client OR server code.
 */

/** Tailwind text-colour class for a trust score tier. */
export function trustTone(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 70) return "text-warning";
  return "text-muted-foreground";
}

/** Human-readable tier label for a trust score. */
export function trustLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  return "Building";
}

/**
 * Format an average first-reply time (in minutes) as a compact label.
 * - `< 1`    → "< 1 min"
 * - `< 60`   → "~N min"
 * - `>= 1440`→ "> 24 h"
 * - else     → "~Hh Mm" (drops the "Mm" when minutes are 0)
 */
export function formatReplyTime(mins: number): string {
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `~${Math.round(mins)} min`;
  if (mins >= 1440) return "> 24 h";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}
