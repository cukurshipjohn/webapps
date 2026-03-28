"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import PostFeed from "@/components/PostFeed";

// Plan data mirrored from lib/billing-plans.ts (untuk client component tanpa import langsung)
const PLANS = [
    {
        key: "starter", name: "Starter", price: 99000, price_annual: 990000, max_barbers: 2, max_bookings: 50,
        features: [
            "Maks. 2 kapster",
            "Maks. 50 booking/bulan",
            "Home Service maks. 5x/bulan",
            "Notifikasi WhatsApp",
            "Panel Admin lengkap",
            "URL barbershop sendiri",
        ],
        popular: false,
    },
    {
        key: "pro", name: "Pro", price: 199000, price_annual: 1890000, max_barbers: 5, max_bookings: 9999,
        features: [
            "Maks. 5 kapster",
            "Booking tidak terbatas",
            "Home Service tidak terbatas",
            "Blast Notifikasi WA ke pelanggan",
            "Notifikasi WhatsApp",
            "Panel Admin lengkap",
            "URL barbershop sendiri",
            "Laporan bulanan",
        ],
        popular: true,
    },
    {
        key: "business", name: "Business", price: 349000, price_annual: 3140000, max_barbers: 9999, max_bookings: 9999,
        features: [
            "Kapster tidak terbatas",
            "Booking tidak terbatas",
            "Home Service tidak terbatas",
            "Blast Notifikasi WA ke pelanggan",
            "WA Priority Support",
            "Panel Admin lengkap",
            "URL barbershop sendiri",
            "Laporan bulanan & tahunan",
            "Support prioritas",
        ],
        popular: false,
    },
];


const FEATURES = [
    { icon: "📱", title: "Booking Online 24/7", desc: "Pelanggan bisa booking kapan saja lewat link khusus barbershop Anda, tanpa perlu install aplikasi." },
    { icon: "💈", title: "Manajemen Kapster", desc: "Atur jadwal, layanan, dan foto setiap kapster dengan mudah dari panel admin." },
    { icon: "📅", title: "Kelola Jadwal Real-time", desc: "Monitor semua booking hari ini, minggu ini, dan bulan ini dalam satu dashboard." },
    { icon: "💬", title: "Notifikasi WhatsApp", desc: "Pelanggan dan kapster otomatis dapat notifikasi booking via WhatsApp tanpa biaya tambahan." },
    { icon: "🔗", title: "URL Subdomain Sendiri", desc: "Setiap barbershop mendapat URL unik seperti johncukur.cukurship.id — terlihat profesional." },
    { icon: "📊", title: "Laporan & Statistik", desc: "Pantau revenue, booking per kapster, dan performa toko dari satu tempat." },
];

function formatRupiah(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function LandingPage() {
    const [scrolled, setScrolled] = useState(false);
    const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans overflow-x-hidden">
            {/* ── NAVBAR ────────────────────────────────────────────── */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-neutral-950/95 border-b border-neutral-800/80 backdrop-blur-md" : "bg-transparent"}`}>
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">✂️</span>
                        <span className="text-lg font-extrabold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">CukurShip</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-sm text-neutral-400">
                        <a href="#features" className="hover:text-white transition-colors">Fitur</a>
                        <a href="#pricing" className="hover:text-white transition-colors">Harga</a>
                        <Link href="/admin/login" className="hover:text-white transition-colors">Login</Link>
                        <Link href="/register"
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                            Daftar Gratis
                        </Link>
                    </nav>
                    <Link href="/register" className="md:hidden px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm">
                        Daftar
                    </Link>
                </div>
            </header>

            {/* ── HERO ──────────────────────────────────────────────── */}
            <section className="pt-32 pb-24 px-6 relative overflow-hidden">
                {/* Background glows */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/6 rounded-full blur-[140px]" />
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                    {/* Grid */}
                    <div className="absolute inset-0 opacity-[0.025]"
                        style={{ backgroundImage: 'linear-gradient(rgba(245,158,11,1) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
                </div>

                <div className="relative max-w-4xl mx-auto text-center space-y-8">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-400 font-medium">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        Platform SaaS Booking Barbershop #1 Indonesia
                    </div>

                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
                        Platform Booking
                        <br />
                        <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 bg-clip-text text-transparent">
                            Barbershop Profesional
                        </span>
                    </h1>

                    <p className="text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
                        Siapkan sistem booking online untuk barbershop Anda dalam <strong className="text-white">5 menit</strong> — tanpa coding,
                        tanpa repot. URL sendiri, notifikasi WhatsApp otomatis, dan panel admin lengkap.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/register"
                            className="group w-full sm:w-auto px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-2xl text-lg transition-all shadow-[0_0_40px_rgba(245,158,11,0.25)] hover:shadow-[0_0_60px_rgba(245,158,11,0.4)] hover:-translate-y-0.5">
                            Daftarkan Barbershop Kamu — Gratis 14 Hari →
                        </Link>
                    </div>

                    <p className="text-xs text-neutral-600">
                        Tidak perlu kartu kredit • Gratis 14 hari • Setup 5 menit
                    </p>
                </div>

                {/* Mockup card */}
                <div className="relative mt-16 max-w-3xl mx-auto">
                    <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
                        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-neutral-800">
                            <div className="w-3 h-3 rounded-full bg-red-500/60" />
                            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                            <div className="w-3 h-3 rounded-full bg-green-500/60" />
                            <span className="ml-2 text-xs font-mono text-neutral-500">johncukur.cukurship.id</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"].map((time, i) => (
                                <div key={time}
                                    className={`rounded-xl p-3 text-center text-sm font-medium transition-all
                                        ${i === 1 ? "bg-amber-500 text-black" : i === 3 ? "bg-neutral-800/80 text-neutral-600 line-through" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}>
                                    {time}
                                    {i === 1 && <div className="text-[10px] mt-0.5 font-normal">✓ Dipesan</div>}
                                    {i === 3 && <div className="text-[10px] mt-0.5">Penuh</div>}
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex items-center gap-3 text-sm text-neutral-400">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            Live — 3 booking masuk hari ini
                        </div>
                    </div>
                </div>
            </section>

            {/* ── PROMO & POSTS (only shown if tenant has posts) ─── */}
            <section className="pb-4 px-6">
                <div className="max-w-2xl mx-auto">
                  <PostFeed maxItems={3} showTitle={true} />
                </div>
            </section>

            {/* ── FEATURES ──────────────────────────────────────────── */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <p className="text-amber-400 text-sm font-bold uppercase tracking-widest mb-3">Fitur Unggulan</p>
                        <h2 className="text-4xl font-extrabold text-white">Semua yang Dibutuhkan Barbershop Modern</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {FEATURES.map((f, i) => (
                            <div key={i}
                                className="group bg-neutral-900/60 border border-neutral-800 hover:border-amber-500/30 rounded-2xl p-6 space-y-3 transition-all duration-300 hover:bg-neutral-900">
                                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                                    {f.icon}
                                </div>
                                <h3 className="font-bold text-white">{f.title}</h3>
                                <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── PRICING ───────────────────────────────────────────── */}
            <section id="pricing" className="py-24 px-6 relative">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-amber-500/4 rounded-full blur-[100px]" />
                </div>
                <div className="relative max-w-5xl mx-auto">
                    <div className="text-center mb-10">
                        <p className="text-amber-400 text-sm font-bold uppercase tracking-widest mb-3">Harga Transparan</p>
                        <h2 className="text-4xl font-extrabold text-white">Pilih Paket yang Sesuai</h2>
                        <p className="text-neutral-400 mt-3 mb-8">Mulai gratis 14 hari, tidak perlu kartu kredit.</p>

                        {/* Toggle Bulanan / Tahunan */}
                        <div className="inline-flex items-center gap-2 p-1 bg-neutral-900 border border-neutral-800 rounded-full mx-auto">
                            <button
                                onClick={() => setBillingCycle("monthly")}
                                className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                                    billingCycle === "monthly" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                Bulanan
                            </button>
                            <button
                                onClick={() => setBillingCycle("annual")}
                                className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                                    billingCycle === "annual" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                Tahunan
                                <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase tracking-wider ${
                                    billingCycle === "annual" ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-400"
                                }`}>Hemat s.d 25%</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {PLANS.map((plan) => {
                            const isAnnual = billingCycle === "annual";
                            const displayPrice = isAnnual ? Math.round(plan.price_annual / 12) : plan.price;
                            const savedAmount = isAnnual ? (plan.price * 12) - plan.price_annual : 0;

                            return (
                            <div key={plan.key}
                                className={`relative rounded-2xl p-6 flex flex-col gap-5 border-2 transition-all
                                    ${plan.popular
                                        ? "bg-gradient-to-b from-amber-950/30 to-neutral-900 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.1)]"
                                        : "bg-neutral-900/60 border-neutral-800"
                                    }`}>
                                {plan.popular && (
                                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-0.5 bg-amber-500 text-black text-xs font-extrabold rounded-full">
                                        PALING POPULER
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                                    
                                    <div className="mt-2 min-h-16 flex flex-col justify-end">
                                        {isAnnual && (
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-neutral-500 line-through">
                                                    {formatRupiah(plan.price)}
                                                </span>
                                                <span className="text-[10px] font-bold px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                                                    Hemat {formatRupiah(savedAmount)}/th
                                                </span>
                                            </div>
                                        )}
                                        <p className="text-3xl font-extrabold text-white flex items-end">
                                            {formatRupiah(displayPrice)}
                                            <span className="text-sm font-normal text-neutral-400 pb-1 ml-1">/bln</span>
                                        </p>
                                    </div>
                                    
                                    {isAnnual && (
                                        <p className="text-xs text-neutral-500 mt-2 font-medium">
                                            Ditagih {formatRupiah(plan.price_annual)} per tahun
                                        </p>
                                    )}
                                </div>
                                <ul className="space-y-2.5 flex-1 mt-2">
                                    {plan.features.map((f, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                                            <span className="text-amber-500 flex-shrink-0 mt-0.5">✓</span>
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register"
                                    className={`w-full py-3 rounded-xl font-bold text-sm text-center transition-all
                                        ${plan.popular
                                            ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                                            : "bg-neutral-800 hover:bg-neutral-700 text-white"
                                        }`}>
                                    Mulai Gratis 14 Hari
                                </Link>
                            </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── CTA FINAL ─────────────────────────────────────────── */}
            <section className="py-24 px-6">
                <div className="max-w-3xl mx-auto text-center space-y-8">
                    <div className="bg-gradient-to-b from-amber-950/30 to-neutral-900/60 border border-amber-500/20 rounded-3xl p-12 space-y-6">
                        <div className="text-5xl">✂️</div>
                        <h2 className="text-4xl font-extrabold text-white">
                            Siap Bawa Barbershop Anda ke Level Berikutnya?
                        </h2>
                        <p className="text-neutral-400 text-lg">
                            Lebih dari 100+ barbershop sudah menggunakan CukurShip. Bergabunglah sekarang dan dapatkan akses penuh gratis selama 14 hari.
                        </p>
                        <Link href="/register"
                            className="inline-flex items-center gap-2 px-10 py-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-2xl text-lg transition-all shadow-[0_0_40px_rgba(245,158,11,0.3)] hover:-translate-y-0.5">
                            Daftarkan Barbershop Kamu — Gratis 14 Hari →
                        </Link>
                        <p className="text-xs text-neutral-600">Setup 5 menit • Tidak perlu kartu kredit • Cancel kapan saja</p>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ────────────────────────────────────────────── */}
            <footer className="border-t border-neutral-800/50 py-12 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">✂️</span>
                            <div>
                                <p className="font-extrabold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">CukurShip</p>
                                <p className="text-xs text-neutral-600">Platform Booking Barbershop #1</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-neutral-500">
                            <a href="https://wa.me/6287836993805" target="_blank" rel="noopener"
                                className="hover:text-green-400 transition-colors flex items-center gap-1.5">
                                💬 Lapor Bug / Support
                            </a>
                            <Link href="/register" className="hover:text-amber-400 transition-colors">Daftar</Link>
                            <Link href="/admin/login" className="hover:text-white transition-colors">Login Admin</Link>
                        </div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-neutral-800/40 text-center text-xs text-neutral-700">
                        © {new Date().getFullYear()} CukurShip. All rights reserved. — Platform SaaS Booking Barbershop Indonesia.
                    </div>
                </div>
            </footer>
        </div>
    );
}
