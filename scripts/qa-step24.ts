/**
 * Step 24 QA — PWA. File-based checks (manifest, icons, SW, components, layout meta) + a best-effort
 * HTTP check of the /offline route. No DB, no cleanup needed.
 * Run: npx tsx scripts/qa-step24.ts
 */
import { existsSync, readFileSync, statSync } from "node:fs";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const nonEmpty = (p: string) => existsSync(p) && statSync(p).size > 0;

async function main() {
  console.log("\n=== manifest ===");
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(read("public/manifest.json"));
  } catch {
    /* leave empty → assertions fail */
  }
  for (const f of ["name", "short_name", "start_url", "display", "background_color", "theme_color", "icons"]) {
    ok(`manifest has "${f}"`, f in manifest);
  }
  ok("theme_color = #4d7cfe", manifest.theme_color === "#4d7cfe");
  ok("background_color = #0a0b0d", manifest.background_color === "#0a0b0d");
  ok("display = standalone", manifest.display === "standalone");
  const icons = (manifest.icons as { sizes?: string }[] | undefined) ?? [];
  ok("icons include 192x192", icons.some((i) => i.sizes === "192x192"));
  ok("icons include 512x512", icons.some((i) => i.sizes === "512x512"));

  console.log("\n=== icon + screenshot files ===");
  ok("icon-192x192.png present + non-empty", nonEmpty("public/icons/icon-192x192.png"));
  ok("icon-512x512.png present + non-empty", nonEmpty("public/icons/icon-512x512.png"));
  ok("apple-touch-icon.png present + non-empty", nonEmpty("public/icons/apple-touch-icon.png"));
  ok("icon-96x96.png present + non-empty", nonEmpty("public/icons/icon-96x96.png"));
  ok("home screenshot present", nonEmpty("public/screenshots/home-mobile.png"));

  console.log("\n=== service worker ===");
  const sw = read("public/sw.js");
  ok("sw.js exists", sw.length > 0);
  ok("sw.js has install listener", sw.includes('addEventListener("install"'));
  ok("sw.js has activate listener", sw.includes('addEventListener("activate"'));
  ok("sw.js has fetch listener", sw.includes('addEventListener("fetch"'));
  ok("sw.js loads Workbox", sw.includes("workbox"));
  ok("sw.js calls skipWaiting + clients.claim", sw.includes("skipWaiting") && sw.includes("clients.claim"));

  console.log("\n=== components + layout ===");
  const swReg = read("src/components/pwa/sw-register.tsx");
  ok("sw-register registers /sw.js", swReg.includes("navigator.serviceWorker") && swReg.includes("/sw.js"));
  ok("sw-register is production-only", swReg.includes('NODE_ENV !== "production"'));
  const banner = read("src/components/pwa/install-banner.tsx");
  ok("install-banner listens for beforeinstallprompt", banner.includes("beforeinstallprompt"));
  ok("install-banner uses pwa-install-dismissed", banner.includes("pwa-install-dismissed"));
  ok("install-banner handles iOS + standalone", banner.includes("standalone") && /iphone|ipad/i.test(banner));
  const layout = read("src/app/layout.tsx");
  ok("layout wires the manifest", layout.includes('manifest: "/manifest.json"'));
  ok("layout has appleWebApp meta", layout.includes("appleWebApp"));
  ok("layout references apple-touch-icon", layout.includes("apple-touch-icon.png"));
  ok("layout renders SwRegister + InstallBanner", layout.includes("<SwRegister") && layout.includes("<InstallBanner"));

  console.log("\n=== next.config SW headers ===");
  const cfg = read("next.config.ts");
  ok("sw.js served with Service-Worker-Allowed", cfg.includes("Service-Worker-Allowed"));
  ok("sw.js served no-cache", cfg.includes("/sw.js") && cfg.includes("no-cache"));

  console.log("\n=== offline page ===");
  ok("offline page exists", existsSync("src/app/offline/page.tsx"));
  ok("offline page has no DB/auth import", !read("src/app/offline/page.tsx").match(/from "@\/lib\/db"|requireUser|auth\(\)/));
  // Best-effort HTTP render (server optional).
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("http://localhost:3000/offline", { signal: ctrl.signal });
    clearTimeout(timer);
    const body = (await res.text()).toLowerCase();
    ok("/offline returns 200 with brand copy", res.status === 200 && body.includes("offline") && body.includes("getx"));
  } catch {
    console.log("  • skipped live /offline check: dev server not running on :3000");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Step 24 QA — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
