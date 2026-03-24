"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PostFeed from "@/components/PostFeed";

// ── Font map ──────────────────────────────────────────────
const FONT_MAP: Record<string, string> = {
  modern: "'Inter', 'DM Sans', sans-serif",
  bold:   "'Poppins', 'Sora', sans-serif",
  classic:"'Playfair Display', 'Lora', serif",
  mono:   "'JetBrains Mono', 'Fira Code', monospace",
};

// ── Types ─────────────────────────────────────────────────
interface Barber {
  id: string;
  name: string;
  specialty: string | null;
  photo_url: string | null;
}

interface ShopInfo {
  shop_name: string;
  shop_tagline: string;
  logo_url: string | null;
  hero_image_url: string | null;
  color_primary: string;
  color_primary_hover: string;
  color_secondary: string;
  color_background: string;
  color_surface: string;
  color_accent: string;
  use_gradient: boolean;
  font_choice: string;
  whatsapp_owner: string | null;
  operating_open: string | null;
  operating_close: string | null;
  is_home_service_enabled: boolean;
  slug: string | null;
  barbers: Barber[];
}

// ── Helper: parse "HH:MM" to minutes-since-midnight ───────
function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ── Helper: current WIB (UTC+7) time in minutes ───────────
function nowWIBMinutes(): number {
  const d = new Date();
  const utc = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utc + 7 * 60) % (24 * 60);
}

// ── OpenStatus component ───────────────────────────────────
function OpenStatus({ open, close }: { open: string | null; close: string | null }) {
  const isOpen = useMemo(() => {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (o === null || c === null) return null;
    const now = nowWIBMinutes();
    return now >= o && now < c;
  }, [open, close]);

  if (!open || !close) return null;

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-sm
      ${isOpen
        ? "bg-green-500/10 border-green-500/30 text-green-400"
        : "bg-red-500/10 border-red-500/30 text-red-400"
      }`}>
      <span className={`w-2 h-2 rounded-full ${isOpen ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
      {isOpen ? `Sedang Buka · ${open}–${close} WIB` : `Sedang Tutup · Buka ${open} WIB`}
    </div>
  );
}

// ── Main Store Page ────────────────────────────────────────
export default function StorePage() {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/store/info")
      .then(r => r.json())
      .then(data => { if (data.shop_name) setShop(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
        <div className="space-y-3 text-center">
          <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 text-sm">Memuat halaman toko…</p>
        </div>
      </div>
    );
  }

  // ── Theme tokens from DB ──────────────────────────────────
  const bg       = shop?.color_background  || "#0A0A0A";
  const surface  = shop?.color_surface     || "#171717";
  const primary  = shop?.color_primary     || "#F59E0B";
  const primHov  = shop?.color_primary_hover || "#D97706";
  const secondary= shop?.color_secondary   || "#D97706";
  const accent   = shop?.color_accent      || "#FFFFFF";
  const useGrad  = shop?.use_gradient      ?? false;
  const fontFam  = FONT_MAP[shop?.font_choice || "modern"] || FONT_MAP.modern;

  const heroBg = useGrad
    ? `linear-gradient(135deg, ${bg} 0%, ${surface} 60%, ${bg} 100%)`
    : bg;

  return (
    <>
      {/* ── Global font inject ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Poppins:wght@400;600;700;800&family=Playfair+Display:wght@400;700&family=JetBrains+Mono:wght@400;700&display=swap');
        body { font-family: ${fontFam}; background: ${bg}; }
      `}</style>

      <main className="min-h-screen pb-32 text-white" style={{ background: heroBg, color: accent }}>

        {/* ── TOP NAV BAR ──────────────────────────────────── */}
        <nav className="sticky top-0 z-40 flex items-center justify-between px-5 py-3 border-b backdrop-blur-xl"
          style={{ background: `${bg}e0`, borderColor: `${surface}80` }}>
          <div className="flex items-center gap-2.5">
            {shop?.logo_url ? (
              <img src={shop.logo_url} alt="logo" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                style={{ background: `${primary}20`, color: primary }}>✂️</div>
            )}
            <span className="font-bold text-sm truncate max-w-[160px]" style={{ color: accent }}>
              {shop?.shop_name || "Barbershop"}
            </span>
          </div>
          <Link href="/login"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
            style={{ borderColor: `${primary}50`, color: primary, background: `${primary}10` }}>
            Masuk / Daftar
          </Link>
        </nav>

        {/* ── HERO SECTION ──────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Glow blob */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 50% 0%, ${primary}25 0%, transparent 65%)` }} />

          {/* Hero image */}
          {shop?.hero_image_url && (
            <div className="absolute inset-0 z-0">
              <img src={shop.hero_image_url} alt="Hero"
                className="w-full h-full object-cover opacity-15" />
              <div className="absolute inset-0"
                style={{ background: `linear-gradient(to bottom, ${bg}60, ${bg}cc, ${bg})` }} />
            </div>
          )}

          <div className="relative z-10 max-w-lg mx-auto px-5 pt-12 pb-8 text-center space-y-5">
            {/* Logo big */}
            <div className="relative inline-flex">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt="Logo"
                  className="w-24 h-24 rounded-3xl object-cover border-2 shadow-2xl"
                  style={{ borderColor: `${primary}40` }} />
              ) : (
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl border shadow-2xl"
                  style={{ background: `${primary}18`, borderColor: `${primary}30` }}>
                  ✂️
                </div>
              )}
              {/* WA status dot */}
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: bg }}>
                <span className="text-[9px]">✓</span>
              </span>
            </div>

            {/* Name & tagline */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight"
                style={{ color: accent }}>
                {shop?.shop_name || "Barbershop"}
              </h1>
              <p className="mt-2 text-sm sm:text-base leading-relaxed" style={{ color: `${accent}90` }}>
                {shop?.shop_tagline || "Tampil Kece, Harga Terjangkau"}
              </p>
            </div>

            {/* Open/close badge */}
            <OpenStatus open={shop?.operating_open ?? null} close={shop?.operating_close ?? null} />

            {/* WA contact */}
            {shop?.whatsapp_owner && (
              <a href={`https://wa.me/${shop.whatsapp_owner.replace(/\D/g, "")}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: "#4ade80" }}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                </svg>
                Hubungi via WhatsApp
              </a>
            )}
          </div>
        </section>

        {/* ── SERVICE CARDS (clickable → /book) ─────────────── */}
        <section className="max-w-lg mx-auto px-5 pb-6">
          <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: `${accent}50` }}>
            Layanan Kami
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/book?type=barbershop"
              className="group p-4 rounded-2xl border flex items-center gap-3 transition-all active:scale-95"
              style={{ background: surface, borderColor: `${primary}25` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: `${primary}15` }}>✂️</div>
              <div>
                <p className="font-bold text-sm" style={{ color: accent }}>Barbershop</p>
                <p className="text-xs mt-0.5" style={{ color: `${accent}60` }}>Potong di tempat →</p>
              </div>
            </Link>

            {shop?.is_home_service_enabled && (
              <Link href="/book?type=home"
                className="group p-4 rounded-2xl border flex items-center gap-3 transition-all active:scale-95"
                style={{ background: surface, borderColor: `${secondary}25` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${secondary}15` }}>🏠</div>
                <div>
                  <p className="font-bold text-sm" style={{ color: accent }}>Home Service</p>
                  <p className="text-xs mt-0.5" style={{ color: `${accent}60` }}>Panggil ke rumah →</p>
                </div>
              </Link>
            )}
          </div>
        </section>

        {/* ── BARBER TEAM ───────────────────────────────────── */}
        {shop?.barbers && shop.barbers.length > 0 && (
          <section className="max-w-lg mx-auto px-5 pb-6">
            <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: `${accent}50` }}>
              Tim Barber
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {shop.barbers.map(barber => (
                <Link key={barber.id} href="/book"
                  className="flex-shrink-0 w-24 text-center space-y-2 group active:scale-95 transition-all">
                  <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden border-2"
                    style={{ borderColor: `${primary}30`, background: surface }}>
                    {barber.photo_url
                      ? <img src={barber.photo_url} alt={barber.name}
                          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl"
                          style={{ background: `${primary}10` }}>👤</div>
                    }
                  </div>
                  <p className="text-xs font-semibold leading-tight truncate" style={{ color: accent }}>
                    {barber.name}
                  </p>
                  {barber.specialty && (
                    <p className="text-[10px] leading-tight truncate" style={{ color: `${accent}50` }}>
                      {barber.specialty}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── POST / PROMO / EVENT FEED ─────────────────────── */}
        <section className="max-w-lg mx-auto px-5 pb-6">
          <div className="border-t pt-6" style={{ borderColor: `${surface}80` }}>
            <PostFeed showTitle={true} />
          </div>
        </section>

      </main>

      {/* ── STICKY BOTTOM BAR ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-5 pb-5 pt-8"
        style={{ background: `linear-gradient(to top, ${bg} 60%, transparent)` }}>
        <div className="max-w-lg mx-auto">
          <Link href="/book"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-extrabold text-base transition-all active:scale-98"
            style={{
              background: useGrad
                ? `linear-gradient(135deg, ${primary}, ${primHov})`
                : primary,
              color: "#000",
              boxShadow: `0 0 30px ${primary}50`,
            }}>
            ✂️ Booking Sekarang — Gratis!
          </Link>
        </div>
      </div>
    </>
  );
}
