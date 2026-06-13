"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck, BadgeCheck, Zap, RefreshCcw, Bell, Globe, Moon, Sun, Search,
  MessageSquare, ChevronDown, ChevronRight, Store, Crosshair, Swords, Flame,
  Crown, Coins, Gem, TrendingUp, User, Sparkles, Ticket, Lock, Eye,
  Check, Star, CreditCard, Smartphone, Bitcoin, MessageCircle,
  Gamepad2, type LucideIcon,
} from "lucide-react";
import { DiscordIcon, XBrandIcon, TelegramIcon, InstagramIcon } from "@/components/shared/icons";

/* ===========================================================================
   GETX homepage — the approved redesign (docs/full-sample.html), wired.
   Self-contained: own dark chrome (utility bar + header + category nav +
   payment footer) + content with a working light/dark toggle (chrome stays
   dark). Minimal + trustworthy: Popular link-lists, interactive How-it-works,
   trust cards. No photos, no emoji, real Lucide icons, USD, free money-back.
   CSS is scoped under `.gx` so it can't leak to the rest of the app.
   =========================================================================== */

const C = {
  pogo: "#3b74f5", val: "#ff4655", clash: "#f5a623", ff: "#ff6a2b", pubg: "#d4a23a",
};

const QUICK = [
  { name: "Pokémon GO", count: "1,240 listings", icon: Gamepad2, color: C.pogo },
  { name: "Valorant", count: "2,110 listings", icon: Crosshair, color: C.val },
  { name: "Clash of Clans", count: "860 listings", icon: Swords, color: C.clash },
] as const;

const TRUST_STRIP = [
  { icon: ShieldCheck, b: "Escrow protected", s: "On every order" },
  { icon: BadgeCheck, b: "ID-verified", s: "Every seller" },
  { icon: Zap, b: "Instant delivery", s: "Many listings" },
  { icon: RefreshCcw, b: "Free money-back", s: "Always" },
] as const;

type Row = { icon: LucideIcon; color: string; name: string; sub: string; price: string; priceFrom?: boolean };
const POPULAR: { title: string; rows: Row[] }[] = [
  {
    title: "Popular Accounts",
    rows: [
      { icon: Gamepad2, color: C.pogo, name: "Pokémon GO accounts", sub: "1,240 listings", price: "$9", priceFrom: true },
      { icon: Crosshair, color: C.val, name: "Valorant accounts", sub: "2,110 listings", price: "$15", priceFrom: true },
      { icon: Swords, color: C.clash, name: "Clash of Clans accounts", sub: "860 listings", price: "$12", priceFrom: true },
      { icon: Flame, color: C.ff, name: "Free Fire accounts", sub: "1,580 listings", price: "$5", priceFrom: true },
      { icon: Crown, color: C.pubg, name: "PUBG Mobile accounts", sub: "990 listings", price: "$8", priceFrom: true },
    ],
  },
  {
    title: "Popular Top-ups",
    rows: [
      { icon: Coins, color: C.pogo, name: "Pokémon GO PokéCoins", sub: "Instant delivery", price: "$2", priceFrom: true },
      { icon: Coins, color: C.val, name: "Valorant Points", sub: "Instant delivery", price: "$4", priceFrom: true },
      { icon: Gem, color: C.ff, name: "Free Fire Diamonds", sub: "Instant delivery", price: "$1", priceFrom: true },
      { icon: Coins, color: C.pubg, name: "PUBG Mobile UC", sub: "Instant delivery", price: "$1", priceFrom: true },
      { icon: Gem, color: C.clash, name: "Clash of Clans Gems", sub: "Instant delivery", price: "$3", priceFrom: true },
    ],
  },
  {
    title: "Popular Boosting",
    rows: [
      { icon: TrendingUp, color: C.val, name: "Valorant Rank Boost", sub: "Est. 6–48h", price: "$10", priceFrom: true },
      { icon: TrendingUp, color: C.pubg, name: "PUBG Tier Push", sub: "Est. 12–72h", price: "$7", priceFrom: true },
      { icon: TrendingUp, color: C.ff, name: "Free Fire Rank Boost", sub: "Est. 6–36h", price: "$6", priceFrom: true },
      { icon: TrendingUp, color: C.clash, name: "CoC War Boosting", sub: "Est. 24–96h", price: "$9", priceFrom: true },
      { icon: TrendingUp, color: C.pogo, name: "Pokémon GO Raids", sub: "Est. 2–24h", price: "$5", priceFrom: true },
    ],
  },
  {
    title: "Popular Pokémon GO",
    rows: [
      { icon: User, color: C.pogo, name: "Lv.45 · 3 Shiny Legendaries", sub: "PoGoLegends · Gold", price: "$74.99" },
      { icon: Sparkles, color: C.pogo, name: "Shiny Starter Bundle", sub: "Instant", price: "$24.99" },
      { icon: Coins, color: C.pogo, name: "14,500 PokéCoins", sub: "Instant", price: "$19.99" },
      { icon: User, color: C.pogo, name: "Lv.40 Legendary Account", sub: "Verified", price: "$49.99" },
      { icon: Ticket, color: C.pogo, name: "Remote Raid Pass ×10", sub: "Instant", price: "$12.99" },
    ],
  },
  {
    title: "Popular Valorant",
    rows: [
      { icon: User, color: C.val, name: "Immortal 2 · 38 Skins", sub: "SkinVault · Silver", price: "$59.99" },
      { icon: Sparkles, color: C.val, name: "Reaver Skin Bundle", sub: "Instant", price: "$34.99" },
      { icon: Coins, color: C.val, name: "5,350 Valorant Points", sub: "Instant", price: "$44.99" },
      { icon: TrendingUp, color: C.val, name: "Radiant Rank Boost", sub: "Est. 24–72h", price: "$89.99" },
      { icon: User, color: C.val, name: "Radiant Account", sub: "Verified", price: "$199.00" },
    ],
  },
  {
    title: "Popular Free Fire",
    rows: [
      { icon: Gem, color: C.ff, name: "1,060 Diamonds top-up", sub: "TopUpPro · Instant", price: "$9.49" },
      { icon: Ticket, color: C.ff, name: "Elite Pass Season", sub: "Instant", price: "$6.99" },
      { icon: User, color: C.ff, name: "Max-level Account", sub: "Verified", price: "$39.99" },
      { icon: TrendingUp, color: C.ff, name: "Rank Boost to Heroic", sub: "Est. 12–48h", price: "$14.99" },
      { icon: Sparkles, color: C.ff, name: "Bundle + Pet Combo", sub: "Instant", price: "$11.99" },
    ],
  },
];

const STEPS = [
  { n: "01", icon: Search, t: "Browse drops", b: "Filter live listings by level, team, region or price. Verified sellers only." },
  { n: "02", icon: Coins, t: "Pay your way", b: "Cards, UPI or crypto — your payment routes straight into GETX escrow." },
  { n: "03", icon: Lock, t: "Escrow holds", b: "The seller can't cash out until you confirm. 3-day inspection window." },
  { n: "04", icon: Zap, t: "Get your account", b: "Median 5-min handover via encrypted chat. Login + recovery delivered." },
] as const;

const STEP_MS = 3000;

export function GetxHome() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    try {
      const s = localStorage.getItem("getx-theme");
      if (s === "light" || s === "dark") setTheme(s);
    } catch {}
  }, []);
  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("getx-theme", next); } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    if (paused) return;
    const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduce) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div className="gx" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── utility bar (dark) ── */}
      <div className="gx-util"><div className="gx-wrap">
        <span className="gx-hide"><Bell className="gx-ic g" /> 24/7 Live Support</span>
        <span><Globe className="gx-ic" /> English · USD $</span>
        <button className="gx-tgl" onClick={toggleTheme} aria-label="Toggle light or dark">
          {theme === "dark" ? <><Moon className="gx-ic" /> Dark</> : <><Sun className="gx-ic" /> Light</>}
        </button>
      </div></div>

      {/* ── header (dark) ── */}
      <header className="gx-head"><div className="gx-wrap">
        <Link href="/" className="gx-brand"><Image src="/getx-logo.webp" alt="GETX" width={2089} height={753} className="gx-logo" priority /></Link>
        <div className="gx-search"><Search className="gx-ic" /><input placeholder="Search GETX…" aria-label="Search" /></div>
        <div className="gx-right">
          <Link href="/messages" className="gx-ibtn" aria-label="Messages"><MessageSquare className="gx-ic" /></Link>
          <Link href="/dashboard" className="gx-ibtn" aria-label="Notifications"><span className="gx-dot" /><Bell className="gx-ic" /></Link>
          <Link href="/login" className="gx-btn gx-out gx-sm">Log in</Link>
          <Link href="/become-seller" className="gx-btn gx-blue gx-sm">Sell</Link>
        </div>
      </div></header>

      {/* ── category nav (dark) ── */}
      <nav className="gx-cat"><div className="gx-wrap">
        <Link href="/marketplace?type=account">Accounts <ChevronDown className="gx-ic-sm" /></Link>
        <Link href="/marketplace?type=currency">Top-ups <ChevronDown className="gx-ic-sm" /></Link>
        <Link href="/marketplace?type=item">Items <ChevronDown className="gx-ic-sm" /></Link>
        <Link href="/marketplace?type=boosting">Boosting <ChevronDown className="gx-ic-sm" /></Link>
        <Link href="/guides">Guides</Link>
      </div></nav>

      {/* ── hero + quick + trust strip ── */}
      <div className="gx-hero gx-reveal"><div className="gx-wrap">
        <div className="gx-banner">
          <span className="gx-tag"><ShieldCheck className="gx-ic-sm" /> Escrow on every order · ID-verified sellers</span>
          <h1>Buy &amp; sell game accounts, the safe way.</h1>
          <p>We hold your payment in escrow until you confirm delivery. Free money-back guarantee on every order.</p>
          <div className="gx-row">
            <Link href="/marketplace" className="gx-btn gx-blue gx-lg"><Search className="gx-ic-sm" /> Browse listings</Link>
            <Link href="/become-seller" className="gx-btn gx-out gx-lg gx-on-banner"><Store className="gx-ic-sm" /> Start selling</Link>
          </div>
        </div>
        <div className="gx-quick">
          {QUICK.map((q) => (
            <Link key={q.name} href="/marketplace" className="gx-qcard">
              <span className="gx-qico" style={{ background: q.color }}><q.icon className="gx-ic" /></span>
              <span><b>{q.name}</b><span>{q.count}</span></span>
            </Link>
          ))}
        </div>
        <div className="gx-stats">
          {TRUST_STRIP.map((s) => (
            <div key={s.b} className="gx-stat"><s.icon className="gx-ic-lg" /><div><b>{s.b}</b><span>{s.s}</span></div></div>
          ))}
        </div>
      </div></div>

      {/* ── Popular link-lists ── */}
      <div className="gx-sec"><div className="gx-wrap"><div className="gx-pop">
        {POPULAR.map((card) => (
          <div key={card.title} className="gx-pcard">
            <div className="gx-ph"><h3>{card.title}</h3><Link href="/marketplace">See all <ChevronRight className="gx-ic-sm" /></Link></div>
            {card.rows.map((r) => (
              <Link key={r.name} href="/marketplace" className="gx-prow">
                <span className="gx-gi" style={{ background: r.color }}><r.icon className="gx-ic-sm" /></span>
                <span className="gx-nm">{r.name}<small>{r.sub}</small></span>
                <span className="gx-pr">{r.priceFrom ? <small>from </small> : null}{r.price}</span>
              </Link>
            ))}
          </div>
        ))}
      </div></div></div>

      {/* ── How it works (auto-play 4-step + phone) — locked, unchanged ── */}
      <div className="gx-hiw" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="gx-wrap">
          <div className="gx-hiw-top">
            <div>
              <span className="gx-eyebrow">How it works</span>
              <h2>From pick to play in <em>five minutes</em>.</h2>
              <p>Each step shows the actual screen you&apos;ll see.</p>
            </div>
            <button className="gx-livepill" onClick={() => setPaused((p) => !p)}>
              <span className="gx-blip"><span className="gx-png" /><i /></span>
              {paused ? "Paused" : "Live demo"}
            </button>
          </div>
          <div className="gx-split">
            <div className="gx-steps">
              {STEPS.map((s, i) => {
                const active = i === step;
                const done = i < step;
                return (
                  <button key={s.n} className={`gx-step${active ? " active" : ""}${done ? " done" : ""}`}
                    onClick={() => setStep(i)} onMouseEnter={() => setStep(i)}>
                    <div className="gx-st">
                      <div className="gx-num">{done ? <Check className="gx-ic-sm" /> : s.n}</div>
                      <div>
                        <div className="gx-tt"><s.icon className="gx-ic-sm" /><h3>{s.t}</h3></div>
                        <div className="gx-bd">{s.b}</div>
                      </div>
                    </div>
                    {active ? <span key={step} className="gx-bar run" /> : <span className="gx-bar" />}
                  </button>
                );
              })}
            </div>
            <div className="gx-phonewrap"><div className="gx-phone"><div className="gx-scr">
              <div className="gx-notch"><i /></div>
              <div className="gx-glare" />

              <div className={`gx-pane${step === 0 ? " on" : ""}`}>
                <div className="gx-pbrand"><Image src="/getx-logo.webp" alt="GETX" width={2089} height={753} className="gx-plg" /><span className="gx-av2" /></div>
                <div className="gx-psr"><Search className="gx-ic-sm" /><span>hundo mewtwo · lv 50</span></div>
                {[
                  { g: "Pokémon GO", grad: "linear-gradient(135deg,#3b74f5,#142a5e)", t: "Lv 50 Mystic · Hundo Mewtwo", p: "$189", seller: "PoGoLegends", lv: "GOLD", r: "4.9", instant: true },
                  { g: "Pokémon GO", grad: "linear-gradient(135deg,#f5a623,#6e4a0e)", t: "14,500 PokéCoins · Auto", p: "$62", seller: "TopUpPro", lv: "PLAT", r: "5.0", instant: true },
                  { g: "Valorant", grad: "linear-gradient(135deg,#ff4655,#5e1620)", t: "Lv 47 Valor · 200 shinies", p: "$236", seller: "SkinVault", lv: "GOLD", r: "4.9", instant: false },
                ].map((l) => (
                  <div key={l.t} className="gx-lst">
                    <div className="gx-th" style={{ background: l.grad }}>
                      <span className="gx-gtag">{l.g}</span>
                      {l.instant ? <span className="gx-ibadge"><Zap className="gx-ic-xs" />Instant</span> : null}
                    </div>
                    <div className="gx-lr"><span className="gx-n">{l.t}</span><span className="gx-p">{l.p}</span></div>
                    <div className="gx-sell"><span className="gx-sav" />{l.seller} <BadgeCheck className="gx-ic gx-vchk" /><span className="gx-lvc">{l.lv}</span><span className="gx-rt"><Star className="gx-ic-xs" fill="currentColor" />{l.r}</span></div>
                  </div>
                ))}
              </div>

              <div className={`gx-pane${step === 1 ? " on" : ""}`}>
                <div className="gx-pl">Checkout</div>
                <div className="gx-amt">$189</div>
                <div className="gx-dsc">Lv 50 Mystic · Hundo Mewtwo</div>
                <div className="gx-pm a"><span className="gx-l"><CreditCard className="gx-ic" /> Card · •••• 4242</span><span className="gx-ck"><Check className="gx-ic" /></span></div>
                <div className="gx-pm i"><span className="gx-l"><Smartphone className="gx-ic" /> UPI</span><span className="gx-o" /></div>
                <div className="gx-pm i"><span className="gx-l"><Bitcoin className="gx-ic" /> Crypto · USDT</span><span className="gx-o" /></div>
                <div className="gx-nte"><ShieldCheck className="gx-ic-sm" /> Escrow-protected · free money-back</div>
                <button className="gx-pb b">Pay $189</button>
              </div>

              <div className={`gx-pane gx-ctr${step === 2 ? " on" : ""}`}>
                <div className="gx-pl">Order · GTX-08471</div>
                <div className="gx-orbw b"><span className="gx-gl" /><span className="gx-o"><Lock className="gx-ic" /></span></div>
                <div className="gx-h3p">Funds held safely</div>
                <div className="gx-subp">Seller can&apos;t access until you confirm</div>
                <div className="gx-insp"><div className="gx-r"><span className="gx-l"><Eye className="gx-ic-xs" /> Inspection</span><span className="gx-t">2d 23h</span></div><div className="gx-tr"><i /></div></div>
                <button className="gx-pb g">Confirm delivery</button>
              </div>

              <div className={`gx-pane gx-ctr${step === 3 ? " on" : ""}`}>
                <div className="gx-orbw g" style={{ marginTop: 28 }}><span className="gx-gl" /><span className="gx-o"><Check className="gx-ic" /></span></div>
                <div className="gx-h3p">Delivered.</div>
                <div className="gx-subp">In 4 min 22 sec</div>
                <div className="gx-crd"><div className="gx-lb">Login</div><div className="gx-v">trainer_valor47@getx.live</div><div className="gx-v" style={{ color: "rgba(255,255,255,.7)" }}>PIN ••••••</div></div>
                <div className="gx-nte" style={{ marginTop: 13 }}><Zap className="gx-ic-sm" /> Seller paid · escrow released</div>
              </div>
            </div></div></div>
          </div>
        </div>
      </div>

      {/* ── trust cards ── */}
      <div className="gx-sec"><div className="gx-wrap"><div className="gx-trust">
        <div className="gx-tc gold">
          <div className="gx-ib"><ShieldCheck className="gx-ic" /></div>
          <div><h3>Money-Back Guarantee</h3><p>Receive your order or get a full refund — including fees. Feel safe with full trading protection on every order.</p><Link href="/trust-safety" className="gx-btn gx-gold gx-md">Learn more</Link></div>
        </div>
        <div className="gx-tc green">
          <div className="gx-ib"><MessageCircle className="gx-ic" /></div>
          <div><h3>24/7 Live Support</h3><p>GETX support works around the clock. Stuck on an order? Contact us at any time, day or night.</p><Link href="/help" className="gx-btn gx-gold gx-md">Chat now</Link></div>
        </div>
      </div></div></div>

      {/* ── payment bar (dark) ── */}
      <div className="gx-pays"><div className="gx-wrap">
        <div className="gx-paylogos">
          {["VISA", "Mastercard", "AMEX", "UPI"].map((p) => <span key={p} className="gx-plogo">{p}</span>)}
          {["USDT", "BTC", "ETH"].map((p) => <span key={p} className="gx-plogo dk">{p}</span>)}
          <span className="gx-faint" style={{ fontSize: 12 }}>+ more</span>
        </div>
        <span className="gx-lang"><Globe className="gx-ic" /> English · USD $</span>
      </div></div>

      {/* ── footer (dark) ── */}
      <footer className="gx-footer"><div className="gx-wrap">
        <div className="gx-fgrid">
          <div>
            <Image src="/getx-logo.webp" alt="GETX" width={2089} height={753} className="gx-logo" />
            <p className="gx-blurb">Join us today to level up your gaming. The fast, trust-first marketplace for game accounts, items, top-ups &amp; boosting.</p>
            <div className="gx-socials">
              <Link href="https://discord.gg/getx" className="gx-soc" aria-label="Discord"><DiscordIcon className="gx-ic" /></Link>
              <Link href="https://x.com/getx" className="gx-soc" aria-label="X"><XBrandIcon className="gx-ic" /></Link>
              <Link href="https://t.me/getx" className="gx-soc" aria-label="Telegram"><TelegramIcon className="gx-ic" /></Link>
              <Link href="https://instagram.com/getx" className="gx-soc" aria-label="Instagram"><InstagramIcon className="gx-ic" /></Link>
            </div>
          </div>
          <div><h5>Marketplace</h5><ul>
            <li><Link href="/marketplace?type=account">Accounts</Link></li>
            <li><Link href="/marketplace?type=currency">Top-ups</Link></li>
            <li><Link href="/marketplace?type=item">Items</Link></li>
            <li><Link href="/marketplace?type=boosting">Boosting</Link></li>
            <li><Link href="/games">All games</Link></li>
          </ul></div>
          <div><h5>Trust &amp; safety</h5><ul>
            <li><Link href="/how-it-works">How escrow works</Link></li>
            <li><Link href="/trust-safety">Buyer protection</Link></li>
            <li><Link href="/seller-guide">Seller protection</Link></li>
            <li><Link href="/refund-policy">Refund policy</Link></li>
            <li><Link href="/fees">Fees</Link></li>
          </ul></div>
          <div><h5>Company</h5><ul>
            <li><Link href="/help">Help center</Link></li>
            <li><Link href="/contact">Contact us</Link></li>
            <li><Link href="/become-seller">Become a seller</Link></li>
            <li><Link href="/about">About us</Link></li>
            <li><Link href="/terms">Terms</Link></li>
          </ul></div>
        </div>
        <div className="gx-copy">© 2026 GETX — built for gamers, secured by escrow.</div>
      </div></footer>
    </div>
  );
}

/* scoped CSS (everything under .gx) */
const CSS = `
.gx{--d-bg:#0a0a0c;--d-surface:#141417;--d-surface-2:#1c1c20;--d-line:rgba(255,255,255,.07);--d-line-2:rgba(255,255,255,.13);--d-ink:#f1f1f3;--d-muted:#9a9aa2;--d-faint:#64646c;
--blue:#4f8cff;--blue-hi:#7aa2ff;--blue-soft:rgba(79,140,255,.14);--green:#19c37d;--green-hi:#23d98c;--green-soft:rgba(25,195,125,.13);--green-bd:rgba(25,195,125,.32);--grad-blue:linear-gradient(135deg,#4f8cff,#34b6ff);--grad-mesh:linear-gradient(110deg,#7aa2ff,#19c37d 52%,#ffd470);
--gold:#f5b83d;--gold-2:#e0a32e;--gold-soft:rgba(255,194,61,.16);--amber:#f5b73d;--rose:#ff5d6c;--teal:#2dd4bf;--teal-soft:rgba(45,212,191,.14);--grad-warm:linear-gradient(135deg,#ffd87a,#e6a82c);
--r:9px;--r-lg:13px;--r-xl:16px;--r-2xl:22px;--r-pill:999px;
--bg:#0a0a0c;--alt:#060607;--card:#141417;--card-2:#1b1b1f;--hover:#232327;--line:rgba(255,255,255,.07);--line-2:rgba(255,255,255,.12);--ink:#f1f1f3;--muted:#9a9aa2;--faint:#64646c;
--sh-card:0 1px 2px rgba(0,0,0,.4);--sh-pop:0 18px 40px -20px rgba(0,0,0,.7);--grid:rgba(255,255,255,.045);
background:var(--bg);color:var(--ink);font-family:var(--font-sans),Manrope,system-ui,sans-serif;line-height:1.55;font-size:14.5px;-webkit-font-smoothing:antialiased}
.gx[data-theme="light"]{--bg:#f6f4ee;--alt:#efebe1;--card:#fff;--card-2:#f7f5ef;--hover:#f1ede3;--line:rgba(28,22,10,.10);--line-2:rgba(28,22,10,.17);--ink:#1a1710;--muted:#5f5a4e;--faint:#938c7c;--sh-card:0 1px 2px rgba(40,30,10,.05),0 12px 28px -16px rgba(40,30,10,.16);--sh-pop:0 26px 52px -24px rgba(40,30,10,.24);--grid:rgba(28,22,10,.05);--blue-soft:rgba(77,124,254,.1);--green-soft:rgba(16,185,129,.1);--gold-soft:rgba(255,170,20,.16)}
.gx *{box-sizing:border-box;margin:0;padding:0}
.gx h1,.gx h2,.gx h3,.gx h4{font-weight:800;letter-spacing:-.022em;line-height:1.12}
.gx a{color:inherit;text-decoration:none}
.gx .gx-wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.gx-ic{width:17px;height:17px;stroke-width:2;vertical-align:middle}.gx-ic-sm{width:14px;height:14px;stroke-width:2}.gx-ic-xs{width:11px;height:11px;stroke-width:2}.gx-ic-lg{width:22px;height:22px;stroke-width:2}
.gx .gx-faint{color:var(--faint)}
.gx-reveal{animation:gxup .6s cubic-bezier(.2,.7,.2,1) both}@keyframes gxup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.gx-reveal{animation:none}}
.gx-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:700;border-radius:var(--r);border:1px solid transparent;cursor:pointer;transition:transform .12s,background .15s,box-shadow .15s,filter .15s;white-space:nowrap;font-size:13.5px}
.gx-btn:active{transform:translateY(1px)}
.gx-lg{height:46px;padding:0 22px;font-size:15px}.gx-md{height:40px;padding:0 17px}.gx-sm{height:34px;padding:0 14px;font-size:13px}
.gx-blue{background:var(--grad-blue);color:#fff;box-shadow:0 14px 36px -12px rgba(79,140,255,.5)}.gx-blue:hover{filter:brightness(1.07);transform:translateY(-1px)}
.gx-gold{background:var(--grad-warm);color:#3a230a;box-shadow:0 14px 32px -12px rgba(230,168,44,.45)}.gx-gold:hover{filter:brightness(1.05);transform:translateY(-1px)}
.gx-out{background:transparent;color:var(--ink);border-color:var(--line-2)}.gx-out:hover{background:var(--card-2)}
.gx-on-banner{color:#fff;border-color:rgba(255,255,255,.2)}
.gx-util{background:#07090c;border-bottom:1px solid var(--d-line);color:var(--d-muted)}
.gx-util .gx-wrap{display:flex;align-items:center;justify-content:flex-end;gap:18px;height:34px;font-size:12px}
.gx-util span,.gx-util button{display:inline-flex;align-items:center;gap:6px;color:var(--d-muted)}.gx-util .gx-ic{width:13px;height:13px}.gx-util .gx-ic.g{color:var(--green)}
.gx-tgl{background:transparent;border:1px solid var(--d-line-2);border-radius:var(--r-pill);height:24px;padding:0 9px;cursor:pointer;font-size:11.5px;font-weight:600}.gx-tgl:hover{background:var(--d-surface);color:var(--d-ink)}
@media(max-width:680px){.gx-hide{display:none}}
.gx-head{background:var(--d-bg);border-bottom:1px solid var(--d-line);position:sticky;top:0;z-index:50}
.gx-head .gx-wrap{display:flex;align-items:center;gap:18px;height:62px}
.gx-brand{display:flex;align-items:center}.gx-logo{height:28px;width:auto;display:block}
.gx-search{flex:1;max-width:560px;display:flex;align-items:center;gap:9px;background:var(--d-surface);border:1px solid var(--d-line);border-radius:var(--r);height:40px;padding:0 13px}
.gx-search:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-soft)}
.gx-search input{flex:1;background:transparent;border:0;outline:none;color:var(--d-ink);font-size:14px;font-family:inherit}.gx-search input::placeholder{color:var(--d-faint)}.gx-search .gx-ic{color:var(--d-muted)}
.gx-right{display:flex;align-items:center;gap:9px;margin-left:auto}
.gx-ibtn{width:38px;height:38px;display:grid;place-items:center;border-radius:var(--r);color:var(--d-muted);position:relative;cursor:pointer}.gx-ibtn:hover{background:var(--d-surface-2);color:var(--d-ink)}
.gx-dot{position:absolute;top:8px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--green);border:2px solid var(--d-bg)}
@media(max-width:760px){.gx-search{display:none}}
.gx-cat{background:var(--d-bg);border-bottom:1px solid var(--d-line)}
.gx-cat .gx-wrap{display:flex;align-items:center;gap:3px;height:46px;overflow-x:auto}
.gx-cat a{font-size:13.5px;font-weight:600;color:var(--d-muted);padding:7px 12px;border-radius:var(--r);display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.gx-cat a:hover{color:var(--d-ink);background:var(--d-surface)}.gx-cat a .gx-ic-sm{color:var(--d-faint)}
.gx-hero{padding:24px 0 0}
.gx-banner{position:relative;border-radius:var(--r-xl);overflow:hidden;border:1px solid var(--line-2);padding:48px 46px;background:radial-gradient(120% 160% at 86% 8%,rgba(77,124,254,.34),transparent 54%),radial-gradient(90% 130% at 8% 110%,rgba(25,195,125,.2),transparent 60%),linear-gradient(120deg,#141a2c,#0e1016);box-shadow:var(--sh-pop)}
.gx-banner::before{content:"";position:absolute;inset:0;background-size:42px 42px;opacity:.7;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);-webkit-mask-image:radial-gradient(70% 100% at 80% 0,#000,transparent 75%);mask-image:radial-gradient(70% 100% at 80% 0,#000,transparent 75%)}
.gx-banner>*{position:relative}
.gx-banner .gx-tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--green-hi);background:var(--green-soft);border:1px solid var(--green-bd);padding:5px 11px;border-radius:var(--r-pill)}
.gx-banner h1{font-size:clamp(28px,4.6vw,46px);max-width:18ch;margin:15px 0 0;color:#fff}
.gx-banner p{color:#c4cbda;font-size:clamp(14px,1.7vw,17px);max-width:46ch;margin:12px 0 0}
.gx-banner .gx-row{display:flex;gap:11px;margin-top:24px;flex-wrap:wrap}
.gx-quick{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}@media(max-width:760px){.gx-quick{grid-template-columns:1fr}}
.gx-qcard{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:13px 15px;transition:transform .15s,border-color .15s,box-shadow .15s;box-shadow:var(--sh-card)}
.gx-qcard:hover{border-color:var(--line-2);transform:translateY(-3px);box-shadow:var(--sh-pop)}
.gx-qico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:none;box-shadow:0 6px 14px -6px rgba(0,0,0,.5)}
.gx-qcard b{font-size:14px;font-weight:700}.gx-qcard span span{font-size:12px;color:var(--faint);display:block}
.gx-stats{margin-top:34px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}@media(max-width:760px){.gx-stats{grid-template-columns:repeat(2,1fr)}}
.gx-stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:18px;display:flex;align-items:center;gap:12px;box-shadow:var(--sh-card);transition:transform .15s,border-color .15s,box-shadow .15s}.gx-stat:hover{transform:translateY(-2px);border-color:var(--line-2);box-shadow:var(--sh-pop)}
.gx-stat .gx-ic-lg{color:var(--blue)}.gx-stat b{display:block;font-weight:800;font-size:15px;line-height:1.1}.gx-stat span{font-size:12px;color:var(--muted)}
.gx-sec{padding:56px 0}
.gx-pop{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:900px){.gx-pop{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.gx-pop{grid-template-columns:1fr}}
.gx-pcard{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:6px;box-shadow:var(--sh-card);transition:border-color .15s,box-shadow .2s}.gx-pcard:hover{border-color:var(--line-2);box-shadow:var(--sh-pop)}
.gx-ph{display:flex;align-items:center;justify-content:space-between;padding:13px 12px 10px}.gx-ph h3{font-size:14.5px;font-weight:800}.gx-ph a{font-size:12px;color:var(--blue-hi);font-weight:600;display:inline-flex;align-items:center;gap:3px}
.gx-prow{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:var(--r);transition:background .12s}.gx-prow:hover{background:var(--hover)}.gx-prow:hover .gx-gi{transform:scale(1.06)}
.gx-gi{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:#fff;flex:none;transition:transform .15s;box-shadow:0 4px 10px -4px rgba(0,0,0,.5)}
.gx-nm{flex:1;font-size:13.5px;font-weight:600;min-width:0}.gx-nm small{display:block;color:var(--faint);font-weight:500;font-size:11.5px}
.gx-pr{font-size:12.5px;font-weight:800;color:var(--green-hi);white-space:nowrap}.gx-pr small{color:var(--faint);font-weight:500}
.gx-hiw{background:var(--alt);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.gx-hiw .gx-wrap{padding:64px 20px}
.gx-hiw-top{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:34px}
.gx-hiw-top h2{font-size:clamp(26px,4vw,40px);max-width:15ch;line-height:1}.gx-hiw-top h2 em{font-style:italic;font-weight:300;color:var(--blue)}
.gx-hiw-top p{color:var(--muted);font-size:14px;max-width:32ch;margin-top:10px}
.gx-eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}
.gx-livepill{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-pill);padding:7px 13px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);cursor:pointer}
.gx-blip{position:relative;width:7px;height:7px}.gx-blip i{position:absolute;inset:0;border-radius:50%;background:var(--green)}.gx-png{position:absolute;inset:0;border-radius:50%;background:var(--green);opacity:.6;animation:gxping 1.6s cubic-bezier(0,0,.2,1) infinite}
@keyframes gxping{75%,100%{transform:scale(2.4);opacity:0}}
.gx-split{display:grid;grid-template-columns:1fr 320px;gap:48px;align-items:center}@media(max-width:900px){.gx-split{grid-template-columns:1fr;gap:32px}.gx-phonewrap{order:-1}}
.gx-steps{display:flex;flex-direction:column;gap:11px}
.gx-step{position:relative;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:var(--r-xl);padding:16px 18px;cursor:pointer;overflow:hidden;transition:border-color .25s,box-shadow .25s}
.gx-step:hover{border-color:var(--line-2)}.gx-step.active{box-shadow:0 16px 38px -16px rgba(77,124,254,.4),0 0 0 1.5px rgba(77,124,254,.55)}
.gx-st{display:flex;align-items:center;gap:14px}
.gx-num{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:14px;flex:none;background:var(--blue-soft);color:var(--blue);transition:.3s}
.gx-step.active .gx-num{background:var(--blue);color:#fff;box-shadow:0 6px 18px -5px rgba(77,124,254,.7)}.gx-step.done .gx-num{background:var(--green);color:#04140d}
.gx-tt{display:flex;align-items:center;gap:8px;margin-bottom:3px}.gx-tt .gx-ic-sm{color:var(--faint)}.gx-step.active .gx-tt .gx-ic-sm{color:var(--blue)}.gx-tt h3{font-size:15.5px;font-weight:700;color:var(--muted)}.gx-step.active .gx-tt h3{color:var(--ink)}
.gx-bd{font-size:12.5px;color:var(--muted);line-height:1.5}
.gx-bar{position:absolute;left:0;bottom:0;height:2.5px;width:0;background:linear-gradient(90deg,var(--blue),var(--blue-hi))}.gx-bar.run{width:100%;transition:width 3s linear}
.gx-phonewrap{display:flex;justify-content:center}
.gx-phone{position:relative;width:290px;height:580px;border-radius:44px;background:#0a0d14;padding:9px;box-shadow:inset 0 0 0 2px #2a2f3a,inset 0 0 0 7px #05070c,0 50px 90px -30px rgba(0,0,0,.85)}
.gx-scr{position:absolute;inset:9px;border-radius:36px;overflow:hidden;background:linear-gradient(180deg,#0b1020,#070a12)}
.gx-notch{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:94px;height:25px;background:#000;border-radius:14px;z-index:60;display:flex;align-items:center;justify-content:flex-end;padding-right:11px}.gx-notch i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);animation:gxpulse 1.8s infinite}@keyframes gxpulse{50%{opacity:.4}}
.gx-glare{position:absolute;inset:0;z-index:40;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.07),transparent 42%)}
.gx-pane{position:absolute;inset:0;padding:44px 15px 16px;opacity:0;transform:translateY(10px);transition:opacity .45s,transform .45s;pointer-events:none;display:flex;flex-direction:column}.gx-pane.on{opacity:1;transform:none}
.gx-pl{font-size:8.5px;text-transform:uppercase;letter-spacing:.2em;color:rgba(255,255,255,.55);font-weight:700;margin-bottom:7px}
.gx-pbrand{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.gx-plg{height:15px;width:auto;display:block}.gx-av2{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#4d7cfe,#19c37d)}
.gx-psr{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:var(--r-pill);padding:8px 12px;margin-bottom:9px}.gx-psr .gx-ic-sm{color:rgba(255,255,255,.8)}.gx-psr span{font-size:10px;color:rgba(255,255,255,.7)}
.gx-lst{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:8px;margin-bottom:7px}.gx-th{position:relative;aspect-ratio:16/9;border-radius:7px;margin-bottom:6px}.gx-lr{display:flex;align-items:center;justify-content:space-between}.gx-n{font-size:9.5px;font-weight:700;color:rgba(255,255,255,.92)}.gx-p{font-size:10px;font-weight:800;color:var(--blue-hi)}
.gx-gtag{position:absolute;bottom:6px;left:6px;font-size:8px;font-weight:700;color:#fff;background:rgba(0,0,0,.5);padding:2px 6px;border-radius:5px}
.gx-ibadge{position:absolute;top:6px;right:6px;font-size:8px;font-weight:700;color:#7fd4ff;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:5px;display:inline-flex;align-items:center;gap:3px}
.gx-sell{display:flex;align-items:center;gap:5px;font-size:8.5px;color:rgba(255,255,255,.72);margin-top:5px;font-weight:600}.gx-sav{width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#4d7cfe,#19c37d);flex:none}.gx-vchk{color:#23d98c;width:11px;height:11px}.gx-lvc{font-size:7.5px;font-weight:800;color:#ffce4d;background:rgba(255,206,77,.14);padding:1px 5px;border-radius:4px}.gx-rt{margin-left:auto;color:var(--amber);display:inline-flex;align-items:center;gap:2px}
.gx-amt{font-size:25px;font-weight:800;color:#fff}.gx-dsc{font-size:9px;color:rgba(255,255,255,.7);margin-bottom:13px}
.gx-pm{display:flex;align-items:center;justify-content:space-between;border-radius:10px;padding:9px 11px;margin-bottom:6px;font-size:10px;font-weight:600}.gx-pm.a{background:var(--blue-soft);border:1px solid rgba(77,124,254,.5);color:#fff}.gx-pm.i{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.82)}.gx-pm .gx-l{display:flex;align-items:center;gap:7px}.gx-pm .gx-l .gx-ic{width:13px;height:13px}.gx-ck{width:15px;height:15px;border-radius:50%;background:var(--blue);display:grid;place-items:center}.gx-ck .gx-ic{color:#fff;width:9px;height:9px}.gx-o{width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(255,255,255,.25)}
.gx-nte{display:inline-flex;align-items:center;gap:6px;background:var(--green-soft);border:1px solid var(--green-bd);border-radius:9px;padding:6px 10px;font-size:9px;font-weight:700;color:var(--green-hi);margin-top:auto}
.gx-pb{margin-top:7px;width:100%;border:0;border-radius:var(--r-pill);padding:10px;font-family:inherit;font-weight:800;font-size:11px;cursor:pointer}.gx-pb.b{background:linear-gradient(180deg,var(--blue-hi),var(--blue));color:#fff}.gx-pb.g{background:var(--green);color:#04140d}
.gx-ctr{align-items:center;text-align:center}
.gx-orbw{position:relative;margin:16px auto 6px;width:68px;height:68px}.gx-orbw .gx-gl{position:absolute;inset:-12px;border-radius:50%;filter:blur(18px);opacity:.6}.gx-orbw .gx-o{position:relative;width:68px;height:68px;border-radius:50%;display:grid;place-items:center}.gx-orbw.b .gx-gl{background:var(--blue)}.gx-orbw.b .gx-o{background:linear-gradient(135deg,var(--blue-hi),var(--blue))}.gx-orbw.g .gx-gl{background:var(--green)}.gx-orbw.g .gx-o{background:var(--green)}.gx-orbw .gx-o .gx-ic{color:#fff;width:28px;height:28px}.gx-orbw.g .gx-o .gx-ic{color:#04140d}
.gx-h3p{font-size:14.5px;font-weight:800;color:#fff}.gx-subp{font-size:9px;color:rgba(255,255,255,.7);margin-top:3px}
.gx-insp{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:10px;margin-top:14px;text-align:left}.gx-insp .gx-r{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;font-size:9px}.gx-insp .gx-l{display:flex;align-items:center;gap:5px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.08em;font-weight:700}.gx-insp .gx-t{color:var(--blue-hi);font-weight:800}.gx-tr{height:4px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}.gx-tr i{display:block;height:100%;width:14%;background:linear-gradient(90deg,var(--blue),var(--blue-hi))}
.gx-crd{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:10px;margin-top:14px;text-align:left}.gx-lb{font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6);margin-bottom:4px;font-weight:700}.gx-v{font-size:9.5px;color:rgba(255,255,255,.92)}
.gx-trust{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:680px){.gx-trust{grid-template-columns:1fr}}
.gx-tc{border-radius:var(--r-2xl);padding:30px 32px;display:flex;gap:24px;align-items:center;transition:transform .18s;box-shadow:var(--sh-pop)}.gx-tc:hover{transform:translateY(-3px)}
.gx-tc.gold{background:linear-gradient(135deg,#f8edcb,#f2dca0)}.gx-tc.green{background:linear-gradient(135deg,#d8f0b2,#bfe690)}
.gx-tc .gx-ib{width:80px;height:80px;border-radius:20px;display:grid;place-items:center;flex:none}
.gx-tc.gold .gx-ib{background:linear-gradient(135deg,#ecbd4d,#c89e31);color:#3a2a08;box-shadow:0 14px 26px -10px rgba(170,120,20,.65),inset 0 2px 4px rgba(255,255,255,.55)}
.gx-tc.green .gx-ib{background:linear-gradient(135deg,#83c44d,#5fa531);color:#143006;box-shadow:0 14px 26px -10px rgba(70,130,25,.6),inset 0 2px 4px rgba(255,255,255,.5)}
.gx-tc .gx-ib .gx-ic{width:38px;height:38px;stroke-width:2.2}
.gx-tc h3{font-size:22px;font-weight:800;color:#1a1305}.gx-tc.green h3{color:#0f2a04}
.gx-tc p{font-size:14px;margin:7px 0 16px;max-width:32ch;line-height:1.5}.gx-tc.gold p{color:#5c4a1e}.gx-tc.green p{color:#2c4715}
.gx-pays{border-top:1px solid var(--d-line);background:#07090c;color:var(--d-muted)}
.gx-pays .gx-wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;flex-wrap:wrap}
.gx-paylogos{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.gx-plogo{height:26px;min-width:42px;padding:0 9px;border-radius:5px;background:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;color:#15171b;letter-spacing:-.02em}.gx-plogo.dk{background:var(--d-surface-2);color:var(--d-ink)}
.gx-lang{font-size:12.5px;color:var(--d-muted);display:inline-flex;align-items:center;gap:6px}
.gx-footer{position:relative;overflow:hidden;background:linear-gradient(180deg,#0a0a0c,#050506);padding:56px 0 0;border-top:1px solid var(--d-line);color:var(--d-muted)}
.gx-footer::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--blue),var(--green) 50%,var(--gold));opacity:.85}
.gx-footer::after{content:"GETX";position:absolute;left:50%;bottom:-2.6rem;transform:translateX(-50%);z-index:0;font-weight:800;font-size:clamp(110px,22vw,290px);letter-spacing:-.05em;line-height:1;color:rgba(255,255,255,.022);pointer-events:none;white-space:nowrap}
.gx-footer .gx-wrap{position:relative;z-index:1}
.gx-fgrid{display:grid;grid-template-columns:1.8fr 1fr 1fr 1fr;gap:32px}@media(max-width:760px){.gx-fgrid{grid-template-columns:1fr 1fr}}
.gx-footer .gx-logo{height:28px;width:auto;margin-bottom:11px}
.gx-footer h5{font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--d-faint);margin-bottom:13px}
.gx-footer ul{list-style:none;display:flex;flex-direction:column;gap:10px}.gx-footer ul a{color:var(--d-muted);font-size:13px;display:inline-block;transition:color .15s,transform .15s}.gx-footer ul a:hover{color:var(--d-ink);transform:translateX(3px)}
.gx-blurb{color:var(--d-muted);font-size:13px;margin-top:11px;max-width:30ch}
.gx-socials{display:flex;gap:9px;margin-top:18px}.gx-soc{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;border:1px solid var(--d-line);color:var(--d-muted);background:rgba(255,255,255,.02);transition:.18s}.gx-soc:hover{color:#fff;border-color:transparent;background:var(--grad-blue);transform:translateY(-3px);box-shadow:0 10px 22px -8px rgba(79,140,255,.6)}
.gx-copy{border-top:1px solid var(--d-line);margin-top:40px;padding:20px 0;font-size:12px;color:var(--d-faint);text-align:center;position:relative;z-index:1}
`;
