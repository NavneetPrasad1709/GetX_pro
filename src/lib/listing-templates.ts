import type { ListingType } from "@/lib/validators/listing";

/**
 * Category-specific scaffolding for the listing form (Prompt 14) — reduces
 * blank-form paralysis for first-time sellers. Game-agnostic for now; expands
 * per-game in Step 30. Lives in lib/ (not config/) because it's UI copy logic.
 */

export type ListingTemplate = {
  titlePlaceholder: string;
  descriptionTemplate: string;
  priceHint: string;
  photoTips: string[];
};

export const LISTING_TEMPLATES: Record<ListingType, ListingTemplate> = {
  ACCOUNT: {
    titlePlaceholder:
      "Level 40 Pokémon GO Account · 200+ Shinies · Full Access",
    descriptionTemplate: [
      "## What you get",
      "- Level: [level]",
      "- Shiny count: [count]",
      "- Legendary count: [count]",
      "- Region: [region]",
      "",
      "## Handover",
      "[How you will transfer the account — Google vs Trainer Club, timeline]",
      "",
      "## Proof",
      "[Screenshot list / video proof you can share]",
      "",
      "## FAQ",
      "**Is the account safe?** [Your answer]",
    ].join("\n"),
    priceHint:
      "Level 40 accounts typically sell for $1,500–$8,000 depending on shiny/legendary count.",
    photoTips: [
      "Screenshot the trainer profile (level + team clearly visible)",
      "Screenshot your collection with the shiny counter",
      "Screenshot your legendary box",
    ],
  },
  ITEM: {
    titlePlaceholder: "Shiny Mewtwo · Perfect IVs · Asia Server",
    descriptionTemplate: [
      "## Item details",
      "- Name: [item name]",
      "- IVs / stats: [stats]",
      "- Server: [server]",
      "",
      "## Delivery",
      "[How you deliver — direct trade, account share, timeline]",
      "",
      "## Proof",
      "[Screenshots or video]",
    ].join("\n"),
    priceHint:
      "Prices vary widely — check similar listings on the marketplace for reference.",
    photoTips: [
      "Screenshot the item stats page clearly",
      "Include a screenshot proving you currently own it",
    ],
  },
  CURRENCY: {
    titlePlaceholder: "500 PokéCoins Top-Up · Instant · India",
    descriptionTemplate: [
      "## What you get",
      "- Amount: [amount] [currency unit]",
      "- Delivery time: [e.g. within 1 hour]",
      "- Region: [region]",
      "",
      "## How to order",
      "[Step-by-step: what the buyer should share with you]",
      "",
      "## Guarantee",
      "[Your refund/redo policy]",
    ].join("\n"),
    priceHint:
      "Currency top-ups compete on price + speed. Fast delivery commands a premium.",
    photoTips: [
      "Screenshot your delivery history or proof of stock",
      "Show a previous top-up confirmation (blur customer details)",
    ],
  },
  BOOSTING: {
    titlePlaceholder: "Pokémon GO Level 1→40 Boost · 30 Days · Safe",
    descriptionTemplate: [
      "## Service details",
      "- From: [current rank/level]",
      "- To: [target rank/level]",
      "- Estimated time: [days]",
      "- Method: [account share / self-play / carry]",
      "",
      "## Safety",
      "[VPN usage, play patterns, guarantee against ban]",
      "",
      "## What you need",
      "[Account credentials / contact info required from buyer]",
    ].join("\n"),
    priceHint:
      "Boosting sells on safety guarantees and completion time. Price reflects your track record.",
    photoTips: [
      "Screenshot a completed boost from a previous client (blur their name)",
      "Show your own high-level account as proof of skill",
    ],
  },
};
