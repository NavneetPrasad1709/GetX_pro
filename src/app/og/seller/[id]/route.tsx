import { ImageResponse } from "next/og";
import { getSellerPublicProfile } from "@/server/services/reviews";
import { siteConfig } from "@/config/site";

/**
 * Dynamic 1200×630 OG image for a seller profile (Prompt 17). Validates the id
 * against the DB; unknown ids get a generic branded fallback (HTTP 200). No
 * remote avatar fetch (robust) — uses the initial in a branded badge. Cached a day.
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
          "radial-gradient(circle at 15% 20%, rgba(77,124,254,0.18), transparent 55%)",
        padding: 64,
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const seller = await getSellerPublicProfile(id).catch(() => null);
  const headers = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };

  if (!seller) {
    return new ImageResponse(
      (
        <Frame>
          <div style={{ fontSize: 56, fontWeight: 800 }}>GETX</div>
          <div style={{ fontSize: 40, color: "#9aa" }}>
            Verified sellers · escrow-protected
          </div>
          <div style={{ fontSize: 26, color: "#9aa", fontWeight: 800 }}>
            {siteConfig.domain}
          </div>
        </Frame>
      ),
      { ...SIZE, headers },
    );
  }

  const initial = seller.displayName.charAt(0).toUpperCase();
  const rating =
    seller.ratingCount > 0
      ? `${seller.ratingAvg.toFixed(1)}★ · ${seller.ratingCount} reviews`
      : "New seller";

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 999,
              background: BLUE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 60,
              fontWeight: 800,
            }}
          >
            {initial}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 56, fontWeight: 800 }}>
              {seller.displayName}
              {seller.kycVerified ? " ✓" : ""}
            </div>
            <div style={{ fontSize: 32, color: "#cfd3da" }}>{rating}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 30, color: "#cfd3da" }}>
          <span>🛡 Trust {seller.trustScore}/100</span>
          <span>📦 {seller.totalSales.toLocaleString("en-IN")} sales</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#9aa" }}>
          <span style={{ fontWeight: 800, color: "#fff" }}>GETX</span>
          <span>· {siteConfig.domain}</span>
        </div>
      </Frame>
    ),
    { ...SIZE, headers },
  );
}
