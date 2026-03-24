"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PostFeed from "@/components/PostFeed";

interface ShopInfo {
  shop_name: string;
  shop_tagline: string;
  logo_url: string | null;
  hero_image_url: string | null;
  color_primary: string;
  whatsapp_owner: string | null;
  operating_open: string;
  operating_close: string;
  is_home_service_enabled: boolean;
  slug: string | null;
}

export default function StorePage() {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/store/info")
      .then(r => r.json())
      .then(data => {
        if (data.shop_name) setShop(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const primaryColor = shop?.color_primary || "#F59E0B";

  return (
    <main
      className="min-h-screen text-white"
      style={{ background: "linear-gradient(135deg, #0A0A0A 0%, #111 100%)" }}
    >
      {/* ── HERO SECTION ─────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${primaryColor}40 0%, transparent 70%)` }}
        />

        {/* Hero image (if set) */}
        {shop?.hero_image_url && (
          <div className="absolute inset-0 z-0">
            <img
              src={shop.hero_image_url}
              alt="Hero"
              className="w-full h-full object-cover opacity-15"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[#0A0A0A]" />
          </div>
        )}

        <div className="relative z-10 max-w-2xl mx-auto px-5 pt-16 pb-10 text-center space-y-5">
          {/* Logo */}
          {shop?.logo_url ? (
            <div className="w-24 h-24 mx-auto rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
              <img src={shop.logo_url} alt="Logo" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              className="w-24 h-24 mx-auto rounded-2xl flex items-center justify-center text-4xl shadow-2xl border border-white/10"
              style={{ background: `${primaryColor}20` }}
            >
              ✂️
            </div>
          )}

          {/* Shop name */}
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
              {shop?.shop_name || "Barbershop"}
            </h1>
            <p className="text-neutral-400 mt-2 text-base leading-relaxed">
              {shop?.shop_tagline || "Tampil Kece, Harga Terjangkau"}
            </p>
          </div>

          {/* Operating hours badge */}
          {shop?.operating_open && shop?.operating_close && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm text-neutral-300 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Buka {shop.operating_open} – {shop.operating_close} WIB
            </div>
          )}

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/book"
              className="px-8 py-4 rounded-2xl font-bold text-base text-black shadow-lg active:scale-95 transition-all"
              style={{ background: primaryColor }}
            >
              ✂️ Booking Sekarang
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 rounded-2xl font-bold text-base border border-white/15 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all active:scale-95"
            >
              👤 Masuk / Daftar
            </Link>
          </div>

          {/* WA Contact */}
          {shop?.whatsapp_owner && (
            <a
              href={`https://wa.me/${shop.whatsapp_owner.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
              </svg>
              Hubungi via WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* ── SERVICES HIGHLIGHTS ────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-5 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm flex items-center gap-3">
            <span className="text-2xl">✂️</span>
            <div>
              <p className="font-bold text-sm">Barbershop</p>
              <p className="text-xs text-neutral-500">Potong di tempat</p>
            </div>
          </div>
          {shop?.is_home_service_enabled && (
            <div className="p-4 rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm flex items-center gap-3">
              <span className="text-2xl">🏠</span>
              <div>
                <p className="font-bold text-sm">Home Service</p>
                <p className="text-xs text-neutral-500">Panggil ke rumah</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── POST / PROMO / EVENT FEED ─────────────────────── */}
      <section className="max-w-2xl mx-auto px-5 pb-24 space-y-6">
        <div className="border-t border-white/8 pt-8">
          <PostFeed showTitle={true} />
        </div>
      </section>

      {/* ── STICKY BOTTOM BAR ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/book"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-extrabold text-base text-black shadow-2xl active:scale-98 transition-all"
            style={{ background: primaryColor, boxShadow: `0 0 30px ${primaryColor}50` }}
          >
            ✂️ Booking Sekarang — Gratis!
          </Link>
        </div>
      </div>
    </main>
  );
}
