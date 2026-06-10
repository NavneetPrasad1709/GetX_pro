import { z } from "zod";
import { parsePriceToMinor } from "@/lib/money";
import { MAX_LISTING_IMAGES } from "@/lib/validators/upload";

/**
 * Listing input schemas (Step 06) — ONE schema, used by BOTH the client form
 * (react-hook-form resolver) and the server action (always re-validated).
 *
 * Money: the form takes a major-unit STRING ("499.99"); `priceField` converts
 * it to integer minor units via string math (lib/money.ts) — floats never
 * touch a price. MVP listings are INR-only (multi-currency = payments work,
 * Step 09+); the column already stores currency for later.
 */

export const LISTING_TYPES = [
  "ACCOUNT",
  "ITEM",
  "CURRENCY",
  "BOOSTING",
] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

/** Max listing price: ₹10,00,000 (in paise). Sanity cap against typos. */
export const MAX_PRICE_MINOR = 1_000_000_00;

const priceField = z
  .string()
  .trim()
  .min(1, "Enter a price")
  .transform((raw, ctx) => {
    const minor = parsePriceToMinor(raw, "INR");
    if (minor === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid amount (e.g. 499 or 499.99)",
      });
      return z.NEVER;
    }
    return minor;
  })
  .refine((minor) => minor > 0, "Price must be greater than zero")
  .refine(
    (minor) => minor <= MAX_PRICE_MINOR,
    "Price cannot exceed ₹10,00,000",
  );

// ---------------------------------------------------------------------------
// Dynamic attributes — one strict schema per listing type. `.strict()` keeps
// junk keys out of the JSON column. Every field optional: attributes enrich a
// listing, the title/description carry the core pitch.
// ---------------------------------------------------------------------------

const optionalShortText = (label: string) =>
  z.string().trim().max(50, `${label} is too long`).optional().or(z.literal(""));

export const ATTRIBUTE_SCHEMAS = {
  ACCOUNT: z.strictObject({
    level: z.coerce
      .number()
      .int("Level must be a whole number")
      .min(1, "Level must be at least 1")
      .max(99_999, "Level looks too high")
      .optional()
      .or(z.literal("")),
    rank: optionalShortText("Rank"),
    server: optionalShortText("Server/region"),
  }),
  ITEM: z.strictObject({
    rarity: optionalShortText("Rarity"),
    server: optionalShortText("Server/region"),
  }),
  CURRENCY: z.strictObject({
    amount: z.coerce
      .number()
      .int("Amount must be a whole number")
      .min(1, "Amount must be at least 1")
      .max(1_000_000_000, "Amount looks too high")
      .optional()
      .or(z.literal("")),
    unit: optionalShortText("Unit"),
  }),
  BOOSTING: z.strictObject({
    currentRank: optionalShortText("Current rank"),
    desiredRank: optionalShortText("Desired rank"),
    estimatedDays: z.coerce
      .number()
      .int("Days must be a whole number")
      .min(1, "Must be at least 1 day")
      .max(90, "Keep it within 90 days")
      .optional()
      .or(z.literal("")),
  }),
} as const;

/** Strips empty-string/undefined values so the JSON column stays clean. */
export function cleanAttributes(
  attrs: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === "" || value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

const cuidField = z.string().min(1).max(64);

export const listingFormSchema = z
  .object({
    gameId: cuidField,
    categoryId: cuidField,
    // The authoritative type is DERIVED server-side from Category.kind; the
    // form sends it only so the right attribute fields validate client-side.
    type: z.enum(LISTING_TYPES),
    title: z
      .string()
      .trim()
      .min(10, "Title must be at least 10 characters")
      .max(120, "Title must be at most 120 characters"),
    description: z
      .string()
      .trim()
      .min(30, "Describe the offer in at least 30 characters")
      .max(5000, "Description must be at most 5000 characters"),
    price: priceField,
    // preprocess: an emptied number input submits "" which z.coerce would
    // silently turn into 0 (= sold out!) — empty must be a visible error.
    stock: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce
        .number("Enter stock (use 0 only if sold out)")
        .int("Stock must be a whole number")
        .min(0, "Stock cannot be negative")
        .max(99_999, "Stock looks too high"),
    ),
    deliveryType: z.enum(["MANUAL", "INSTANT"]),
    attributes: z.record(z.string(), z.unknown()).default({}),
    // Image URLs (already uploaded to R2 by the client). Shape-checked here; the
    // listing service re-verifies each is a public URL WE issued (anti-injection).
    images: z
      .array(z.string().trim().min(1).max(2048))
      .max(MAX_LISTING_IMAGES, `You can add up to ${MAX_LISTING_IMAGES} images`)
      .default([]),
    publish: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const schema = ATTRIBUTE_SCHEMAS[data.type];
    const parsed = schema.safeParse(data.attributes);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["attributes", ...issue.path],
        });
      }
    }
  });

export type ListingFormInput = z.input<typeof listingFormSchema>;
export type ListingFormParsed = z.output<typeof listingFormSchema>;

export const listingIdSchema = z.object({ listingId: cuidField });

export const listingStatusActionSchema = z.object({
  listingId: cuidField,
  action: z.enum(["activate", "pause"]),
});

export const updateListingSchema = z.object({
  listingId: cuidField,
  values: listingFormSchema,
});
