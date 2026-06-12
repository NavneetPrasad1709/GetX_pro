/**
 * Anti-fraud thresholds (Prompt 16). Single source — never hardcode in services.
 * Tuned conservatively: signals flag for ADMIN review, they don't auto-ban
 * (except CRITICAL wash-trade which holds payout + freezes the listing).
 */
export const FRAUD_CONFIG = {
  // Account integrity
  IP_ACCOUNTS_PER_24H: 3, // >N new accounts from same IP in 24h = HIGH
  DEVICE_ACCOUNTS_TOTAL: 2, // >N total accounts on same device = HIGH

  // Transaction velocity
  ORDERS_PER_HOUR_BUYER: 10, // >N orders in 1h = card-testing HIGH
  ORDERS_PER_DAY_BUYER: 25, // >N orders in 24h = suspicious HIGH

  // Dispute abuse
  DISPUTE_WITHIN_MINUTES: 60, // dispute <N min after order = MEDIUM
  DISPUTE_RATE_THRESHOLD: 0.3, // disputes > 30% of completed orders = HIGH
  DISPUTE_COUNT_30D: 3, // >N disputes in 30 days = HIGH

  // Review integrity
  REVIEW_VELOCITY_PER_DAY: 3, // >N reviews from different buyers in 24h = flag
  REVIEW_SAME_IP_THRESHOLD: 2, // >N reviews from same IP for same seller = MEDIUM

  // Wash-trade / collusion
  LOW_SALES_HIGH_VALUE_THRESHOLD_MINOR: 50_000, // $500
  LOW_SALES_THRESHOLD: 5,
  WASH_TRADE_ORDER_VALUE_MAX_MINOR: 500, // $5
  WASH_TRADE_ORDERS_FOR_SIGNAL: 3,

  // Listing price anomaly
  PRICE_BELOW_AVG_FACTOR: 0.8,
  MIN_COMPARABLE_LISTINGS: 3,

  // Chargeback / payout risk
  REFUND_RATE_THRESHOLD: 0.25,
  REFUND_MIN_ORDERS: 5,

  // AI scoring (signals deferred to Prompt 23 / lib/ai.ts)
  AI_LISTING_SCAM_THRESHOLD: 7,
  AI_MESSAGE_SCAM_THRESHOLD: 6,

  // Scam phrases (listing title/description scan)
  SCAM_PHRASES: [
    "whatsapp me", "telegram", "pay outside", "discord dm", "cashapp",
    "gift card", "western union", "zelle", "moneygram", "bypass escrow",
    "direct trade", "off platform", "contact me at", "free account",
    "guaranteed win", "account transfer fee", "venmo", "paypal friends",
    "paypal ff", "gtag", "outside getx", "dm me", "text me", "call me",
    "line app", "wechat", "no escrow", "skip escrow",
  ] as string[],
} as const;
