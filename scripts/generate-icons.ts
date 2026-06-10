/**
 * Generate PWA icons + install-dialog screenshots from public/getx-mark.webp (Step 24).
 * Run once: npx tsx scripts/generate-icons.ts  → commit the output under public/icons + public/screenshots.
 */
// sharp ships its types at lib/index.d.ts but its package.json "exports" map
// doesn't surface them for the .mjs entry under moduleResolution:"bundler",
// so TS can't resolve them. The runtime import is fine (tsx/node resolve it).
// @ts-expect-error -- sharp types not resolvable via its exports map
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "public/getx-mark.webp";
const BG = { r: 10, g: 11, b: 13, alpha: 1 }; // #0a0b0d brand dark
const BLUE = "#4d7cfe";

/** Square icon: brand mark centred on the dark canvas with a maskable safe-zone padding. */
async function makeIcon(size: number, out: string, padRatio = 0.16) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(out);
}

/** 390×844 branded placeholder screenshot (logo + caption) for the Android install dialog. */
async function makeScreenshot(out: string, caption: string) {
  const W = 390;
  const H = 844;
  const logo = await sharp(SRC)
    .resize(140, 140, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const text = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="58%" text-anchor="middle" fill="#e9edf5" font-family="sans-serif" font-size="26" font-weight="700">GETX</text>
      <text x="50%" y="63%" text-anchor="middle" fill="#9aa4b2" font-family="sans-serif" font-size="15">${caption}</text>
      <rect x="95" y="${H - 120}" width="200" height="44" rx="8" fill="${BLUE}"/>
      <text x="50%" y="${H - 92}" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="15" font-weight="700">Browse listings</text>
    </svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([
      { input: logo, top: 250, left: Math.round((W - 140) / 2) },
      { input: text, top: 0, left: 0 },
    ])
    .png()
    .toFile(out);
}

async function main() {
  await mkdir("public/icons", { recursive: true });
  await mkdir("public/screenshots", { recursive: true });

  await makeIcon(96, "public/icons/icon-96x96.png");
  await makeIcon(192, "public/icons/icon-192x192.png");
  await makeIcon(512, "public/icons/icon-512x512.png");
  await makeIcon(180, "public/icons/apple-touch-icon.png", 0.1); // Apple uses the full square

  await makeScreenshot("public/screenshots/home-mobile.png", "Fast, AI-powered gaming marketplace");
  await makeScreenshot("public/screenshots/listing-mobile.png", "Escrow-protected listings");

  console.log("✅ PWA icons + screenshots generated under public/icons + public/screenshots");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
