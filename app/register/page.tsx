"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = 1 | 2 | 3;

interface FormData {
  shop_name: string;
  slug: string;
  owner_name: string;
  owner_phone: string;
  otp_code: string;
}

interface SlugStatus {
  checking: boolean;
  available: boolean | null;
  message: string;
}

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id").replace(/^https?:\/\//, "");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>({
    shop_name: "",
    slug: "",
    owner_name: "",
    owner_phone: "",
    otp_code: "",
  });

  const [slugStatus, setSlugStatus] = useState<SlugStatus>({
    checking: false,
    available: null,
    message: "",
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [affiliateName, setAffiliateName] = useState<string | null>(null);

  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Track Affiliate ───────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const ref = searchParams.get("ref");
    const utm_source = searchParams.get("utm_source");

    const trackAffiliate = async (code: string) => {
      try {
        sessionStorage.setItem("referral_code", code);
        if (utm_source) sessionStorage.setItem("referral_utm_source", utm_source);

        const res = await fetch("/api/affiliate/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referral_code: code,
            landing_page: window.location.href,
            utm_source: utm_source,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.affiliate_name) {
            setAffiliateName(data.affiliate_name);
            if (data.click_id) {
              sessionStorage.setItem("affiliate_click_id", data.click_id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to track affiliate", err);
      }
    };

    if (ref) {
      trackAffiliate(ref);
    } else {
      const storedRef = sessionStorage.getItem("referral_code");
      if (storedRef && !affiliateName) {
        trackAffiliate(storedRef);
      }
    }
  }, []);

  // ─── Auto-generate slug from shop name ─────────────────────────────────────
  useEffect(() => {
    if (form.shop_name && !form.slug) {
      setForm((f) => ({ ...f, slug: slugify(form.shop_name) }));
    }
  }, [form.shop_name]);

  // ─── Real-time slug availability check ────────────────────────────────────
  useEffect(() => {
    if (!form.slug) {
      setSlugStatus({ checking: false, available: null, message: "" });
      return;
    }

    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(form.slug) || form.slug.length < 3) {
      setSlugStatus({ checking: false, available: false, message: "Gunakan huruf kecil, angka, atau tanda hubung (min 3 karakter)." });
      return;
    }

    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    setSlugStatus({ checking: true, available: null, message: "" });

    slugDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-slug?slug=${form.slug}`);
        const data = await res.json();
        setSlugStatus({ checking: false, available: data.available, message: data.message });
      } catch {
        setSlugStatus({ checking: false, available: null, message: "" });
      }
    }, 500);
  }, [form.slug]);

  // ─── Step 2: Kirim OTP ─────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!form.owner_phone) { setError("Nomor WhatsApp wajib diisi."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: form.owner_phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setOtpSent(true);
    } catch (e: any) {
      setError(e.message || "Gagal mengirim OTP.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Verifikasi OTP ─────────────────────────────────────────────────
  const handleVerifyOTP = async () => {
    if (!form.otp_code || form.otp_code.length < 6) { setError("Masukkan kode OTP 6 digit."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: form.owner_phone, otpCode: form.otp_code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setOtpVerified(true);
      setError("");
    } catch (e: any) {
      setError(e.message || "OTP tidak valid.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Step navigation ────────────────────────────────────────────────────────
  const handleNextStep = () => {
    setError("");
    if (step === 1) {
      if (!form.shop_name) { setError("Nama toko wajib diisi."); return; }
      if (!form.slug) { setError("URL toko wajib diisi."); return; }
      if (!slugStatus.available) { setError("Pilih URL toko yang tersedia."); return; }
      setStep(2);
    } else if (step === 2) {
      if (!form.owner_name) { setError("Nama pemilik wajib diisi."); return; }
      if (!otpVerified) { setError("Verifikasi nomor WhatsApp terlebih dahulu."); return; }
      setStep(3);
    }
  };

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/register-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: form.shop_name,
          slug: form.slug,
          owner_phone: form.owner_phone,
          owner_name: form.owner_name,
          referral_code: sessionStorage.getItem("referral_code") || undefined,
          affiliate_click_id: sessionStorage.getItem("affiliate_click_id") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Simpan token dan user
      localStorage.setItem("user", JSON.stringify({
        role: "owner",
        name: form.owner_name,
        tenant_id: data.tenant_id,
      }));
      localStorage.setItem("token", data.token);

      sessionStorage.removeItem("referral_code");
      sessionStorage.removeItem("referral_utm_source");
      sessionStorage.removeItem("affiliate_click_id");

      setSuccess(true);

      // Redirect ke admin panel (in production: slug.cukurship.id/admin/login, in dev: /admin/login)
      const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.startsWith("192.168.") || window.location.hostname.startsWith("10.");
      if (isDev) {
        setTimeout(() => router.push(`/admin/login?tenant=${form.slug}`), 1500);
      } else {
        setTimeout(() => {
          window.location.href = `https://${form.slug}.${ROOT_DOMAIN}/admin/login`;
        }, 1500);
      }
    } catch (e: any) {
      setError(e.message || "Gagal mendaftarkan toko.");
    } finally {
      setLoading(false);
    }
  };

  // ─── UI HELPERS ─────────────────────────────────────────────────────────────
  const SlugIndicator = () => {
    if (!form.slug) return null;
    if (slugStatus.checking) return <span className="text-neutral-400 text-xs">⏳ Mengecek ketersediaan...</span>;
    if (slugStatus.available === true) return <span className="text-green-400 text-xs">✓ {slugStatus.message}</span>;
    if (slugStatus.available === false) return <span className="text-red-400 text-xs">✗ {slugStatus.message}</span>;
    return null;
  };

  const steps = [
    { num: 1, label: "Info Toko" },
    { num: 2, label: "Info Pemilik" },
    { num: 3, label: "Konfirmasi" },
  ];

  if (success) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/30 rounded-3xl mx-auto flex items-center justify-center text-5xl shadow-[0_0_60px_rgba(245,158,11,0.2)]">
            🎉
          </div>
          <h2 className="text-3xl font-bold text-white">Toko Berhasil Didaftarkan!</h2>
          <p className="text-neutral-400">Mengalihkan ke Panel Admin Anda...</p>
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm mb-6">
            ← Kembali ke Beranda
          </Link>
          <h1 className="text-3xl font-bold text-white">Daftarkan Barbershop Anda</h1>
          <p className="text-neutral-400 mt-2 text-sm">14 hari gratis, tanpa kartu kredit</p>
        </div>

        {affiliateName && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-3 rounded-xl text-center mb-8 animate-in fade-in slide-in-from-top-4 duration-500 font-medium">
            🎉 Kamu diundang oleh <span className="font-bold">{affiliateName}</span>! Daftar sekarang.
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className={`flex flex-col items-center gap-1`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2 ${
                  step === s.num
                    ? "bg-amber-500 border-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                    : step > s.num
                    ? "bg-amber-500/20 border-amber-500/60 text-amber-400"
                    : "bg-neutral-900 border-neutral-700 text-neutral-500"
                }`}>
                  {step > s.num ? "✓" : s.num}
                </div>
                <span className={`text-xs hidden sm:block transition-colors ${step >= s.num ? "text-amber-400" : "text-neutral-600"}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-[2px] w-16 sm:w-24 mx-1 transition-all duration-500 ${step > s.num ? "bg-amber-500/60" : "bg-neutral-800"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-neutral-900/60 border border-neutral-800 backdrop-blur-xl rounded-3xl p-8 shadow-2xl">

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mb-6 text-center">
              {error}
            </div>
          )}

          {/* ─── STEP 1: Info Toko ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Info Toko</h2>
                <p className="text-neutral-500 text-sm">Masukkan nama dan URL unik barbershop Anda.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nama Toko <span className="text-amber-400">*</span></label>
                <input
                  type="text"
                  value={form.shop_name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm((f) => ({ ...f, shop_name: val, slug: slugify(val) }));
                  }}
                  placeholder="Contoh: Barber Bros Solo"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">URL Toko <span className="text-amber-400">*</span></label>
                <div className="flex items-center gap-0 border border-neutral-700 rounded-xl overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/50 transition-all bg-neutral-800/50">
                  <span className="px-3 py-3 text-neutral-500 text-sm select-none bg-neutral-800/80 border-r border-neutral-700 flex-shrink-0">
                    https://
                  </span>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                    placeholder="nama-toko-kamu"
                    className="flex-1 bg-transparent px-3 py-3 text-white placeholder:text-neutral-600 focus:outline-none text-sm"
                  />
                  <span className="px-3 py-3 text-neutral-500 text-sm select-none bg-neutral-800/80 border-l border-neutral-700 flex-shrink-0">
                    .{ROOT_DOMAIN}
                  </span>
                </div>

                <div className="flex items-center justify-between px-1">
                  <SlugIndicator />
                  {form.slug && (
                    <span className="text-neutral-600 text-xs font-mono">{form.slug}.{ROOT_DOMAIN}</span>
                  )}
                </div>

                {/* Live URL preview */}
                {form.slug && slugStatus.available === true && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-center">
                    <p className="text-xs text-neutral-500 mb-1">URL Toko Anda akan jadi:</p>
                    <p className="text-amber-400 font-mono font-bold text-sm">
                      https://{form.slug}.{ROOT_DOMAIN}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleNextStep}
                disabled={!slugStatus.available || slugStatus.checking}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(245,158,11,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Lanjut ke Info Pemilik →
              </button>
            </div>
          )}

          {/* ─── STEP 2: Info Pemilik ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Info Pemilik</h2>
                <p className="text-neutral-500 text-sm">Verifikasi identitas Anda lewat WhatsApp.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nama Pemilik <span className="text-amber-400">*</span></label>
                <input
                  type="text"
                  value={form.owner_name}
                  onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))}
                  placeholder="Nama lengkap Anda"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nomor WhatsApp <span className="text-amber-400">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={form.owner_phone}
                    onChange={(e) => setForm((f) => ({ ...f, owner_phone: e.target.value }))}
                    placeholder="08xxxxxxxxxx"
                    disabled={otpSent}
                    className="flex-1 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all disabled:opacity-50"
                  />
                  {!otpVerified && (
                    <button
                      onClick={handleSendOTP}
                      disabled={loading || otpSent}
                      className="px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-medium rounded-xl transition-all disabled:opacity-40 whitespace-nowrap"
                    >
                      {loading ? "..." : otpSent ? "Terkirim" : "Kirim OTP"}
                    </button>
                  )}
                </div>
              </div>

              {otpSent && !otpVerified && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <label className="text-sm font-medium text-neutral-300">Kode OTP WhatsApp</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={form.otp_code}
                      onChange={(e) => setForm((f) => ({ ...f, otp_code: e.target.value.replace(/\D/g, "") }))}
                      placeholder="••••••"
                      className="flex-1 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5rem] placeholder:text-neutral-700 focus:outline-none focus:border-amber-500 transition-all font-mono"
                    />
                    <button
                      onClick={handleVerifyOTP}
                      disabled={loading || form.otp_code.length < 6}
                      className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-40"
                    >
                      {loading ? "..." : "Verifikasi"}
                    </button>
                  </div>
                  <button
                    onClick={() => { setOtpSent(false); setForm(f => ({ ...f, otp_code: "" })); setError(""); }}
                    className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                  >
                    Ganti nomor
                  </button>
                </div>
              )}

              {otpVerified && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl text-sm text-center animate-in fade-in duration-300">
                  ✓ Nomor WhatsApp terverifikasi
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(1); setError(""); }}
                  className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium rounded-xl transition-all"
                >
                  ← Kembali
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={!otpVerified || !form.owner_name}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Lanjut →
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Konfirmasi ────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Konfirmasi Pendaftaran</h2>
                <p className="text-neutral-500 text-sm">Periksa data Anda sebelum mendaftar.</p>
              </div>

              {/* Summary Card */}
              <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-700 pb-3">
                  <span className="text-neutral-400 text-sm">Nama Toko</span>
                  <span className="text-white font-semibold">{form.shop_name}</span>
                </div>
                <div className="flex items-center justify-between border-b border-neutral-700 pb-3">
                  <span className="text-neutral-400 text-sm">URL Toko</span>
                  <span className="text-amber-400 font-mono text-sm">{form.slug}.{ROOT_DOMAIN}</span>
                </div>
                <div className="flex items-center justify-between border-b border-neutral-700 pb-3">
                  <span className="text-neutral-400 text-sm">Nama Pemilik</span>
                  <span className="text-white font-semibold">{form.owner_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 text-sm">WhatsApp</span>
                  <span className="text-white">{form.owner_phone}</span>
                </div>
              </div>

              {/* Benefits checklist */}
              <div className="space-y-2">
                {[
                  { icon: "⏳", text: "14 hari free trial — tanpa kartu kredit" },
                  { icon: "📱", text: "Notifikasi WhatsApp otomatis ke kapster & owner" },
                  { icon: "🛡️", text: "Panel Admin lengkap: booking, kapster, layanan, laporan" },
                  { icon: "🌐", text: `URL toko eksklusif: ${form.slug}.${ROOT_DOMAIN}` },
                  { icon: "✂️", text: "Mulai terima booking hari ini!" },
                ].map((b, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                    <span className="text-lg flex-shrink-0">{b.icon}</span>
                    <span className="text-sm text-neutral-300">{b.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(2); setError(""); }}
                  className="px-5 py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium rounded-xl transition-all"
                >
                  ← Kembali
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all duration-200 shadow-[0_0_30px_rgba(245,158,11,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Mendaftarkan...
                    </>
                  ) : (
                    "Daftarkan Toko Saya Sekarang 🚀"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-600 mt-6">
          Sudah punya akun?{" "}
          <Link href="/admin/login" className="text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2">
            Masuk ke Panel Admin
          </Link>
        </p>
      </div>
    </main>
  );
}
