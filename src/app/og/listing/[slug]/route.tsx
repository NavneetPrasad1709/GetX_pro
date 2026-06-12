import { ImageResponse } from "next/og";
import { getListingBySlug } from "@/server/services/marketplace";
import { minorToMajorString } from "@/lib/money";
import { siteConfig } from "@/config/site";

/**
 * Dynamic 1200×630 OG image for a listing (Prompt 17) — renders a branded share
 * card for Discord/WhatsApp/Twitter previews. Validates the slug against the DB;
 * unknown slugs get a generic branded fallback (HTTP 200) so the route never
 * leaks listing existence. No remote image fetch (robust — a broken R2 URL can
 * never crash the render). Cached a day at the edge.
 */

export const runtime = "nodejs";
export const revalidate = 86400;

const SIZE = { width: 1200, height: 630 };
const BG = "#0a0b0d";
const BLUE = "#4d7cfe";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BG,
        backgroundImage:
          "radial-gradient(circle at 85% 15%, rgba(77,124,254,0.18), transparent 55%)",
        padding: 64,
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#9aa" }}>
      <span style={{ fontWeight: 800, color: "#fff" }}>GETX</span>
      <span>· {siteConfig.domain}</span>
    </div>
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug).catch(() => null);

  const headers = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };

  if (!listing) {
    return new ImageResponse(
      (
        <Frame>
          <div style={{ fontSize: 56, fontWeight: 800 }}>GETX</div>
          <div style={{ fontSize: 40, color: "#9aa" }}>
            The fast, trust-first gaming marketplace
          </div>
          <Footer />
        </Frame>
      ),
      { ...SIZE, headers },
    );
  }

  const price = `$${minorToMajorString(listing.priceMinor, listing.currency)}`;
  const rating =
    listing.seller.ratingCount > 0
      ? `${listing.seller.ratingAvg.toFixed(1)}★ (${listing.seller.ratingCount})`
      : "New seller";

  return new ImageResponse(
    (
      <Frame>
        <div
          style={{
            alignSelf: "flex-start",
            background: BLUE,
            color: "#fff",
            fontSize: 26,
            fontWeight: 700,
            padding: "8px 20px",
            borderRadius: 999,
          }}
        >
          {listing.game.name} · {listing.category.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 800,
              lineHeight: 1.1,
              display: "flex",
              // clamp to ~2 lines
              maxHeight: 150,
              overflow: "hidden",
            }}
          >
            {listing.title}
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, color: BLUE }}>{price}</div>
          <div style={{ fontSize: 30, color: "#cfd3da" }}>
            {listing.seller.displayName} · {rating} · 🛡 escrow-protected
          </div>
        </div>

        <Footer />
      </Frame>
    ),
    { ...SIZE, headers },
  );
}
