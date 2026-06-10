/**
 * Basic profanity guard (Step 13). A small blocklist — deliberately NOT a full
 * moderation system (that arrives with admin/AI moderation later). It checks
 * whole tokens (with light leet de-normalization) and matches a token that
 * STARTS WITH a blocked word, so common variants are caught while avoiding the
 * classic "Scunthorpe" substring false-positives.
 */

const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "bastard",
  "dickhead",
  "slut",
  "whore",
  "nigger",
  "faggot",
  "motherfucker",
  "retard",
  "wanker",
  "bollocks",
];

/** Lowercase + map common leet substitutions, strip non-letters. */
function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z]/g, "");
}

/** True if any token starts with a blocked word (catches "fuck", "fucking", …). */
export function containsProfanity(text: string): boolean {
  const tokens = text.split(/\s+/).map(normalizeToken).filter(Boolean);
  return tokens.some((t) => BLOCKED.some((word) => t.startsWith(word)));
}
