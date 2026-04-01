"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TIERS = [
  {
    value: "referral",
    label: "Referral Biasa",
    commission: "10%",
    type: "Komisi sekali bayar pertama",
    note: "Langsung aktif",
    icon: "🎯",
    color: "amber",
  },
  {
    value: "reseller",
    label: "Reseller Aktif",
    commission: "20%",
    type: "Komisi berulang setiap bulan",
    note: "Butuh verifikasi admin 1x24 jam",
    icon: "🚀",
    color: "violet",
  },
];

const BANKS = [
  "BCA", "BNI", "BRI", "Mandiri", "BSI", "CIMB Niaga",
  "OVO", "GoPay", "DANA", "ShopeePay", "SeaBank",
];

export default function AffiliateRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    tier: "referral",
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ referral_code: string | null; status: string; message: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { setError("Anda harus menyetujui syarat & ketentuan."); return; }
    if (!form.name || !form.phone) { setError("Nama dan nomor WA wajib diisi."); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/affiliate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess(data);
    } catch (err: any) {
      setError(err.message || "Pendaftaran gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 mx-auto bg-amber-500/10 border border-amber-500/30 rounded-3xl flex items-center justify-center text-5xl shadow-[0_0_60px_rgba(245,158,11,0.2)]">
            {success.status === "active" ? "🎉" : "⏳"}
          </div>
          <h1 className="text-3xl font-bold text-white">
            {success.status === "active" ? "Selamat Bergabung!" : "Pendaftaran Diterima!"}
          </h1>
          <p className="text-neutral-400">{success.message}</p>

          {success.referral_code && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 space-y-3">
              <p className="text-neutral-400 text-sm">Kode Referral Kamu</p>
              <p className="text-3xl font-black text-amber-400 font-mono tracking-widest">{success.referral_code}</p>
              <button
                onClick={() => navigator.clipboard.writeText(`https://cukurship.id/register?ref=${success.referral_code}`)}
                className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-sm font-medium rounded-xl transition-all"
              >
                📋 Salin Link Referral
              </button>
            </div>
          )}

          <Link href="/affiliate/login" className="block py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all">
            Masuk ke Dashboard →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 py-12 px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/affiliate" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm mb-6">
            ← Kembali
          </Link>
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-2 text-amber-400 text-sm font-medium mb-4">
            💼 Program Afiliasi CukurShip
          </div>
          <h1 className="text-4xl font-black text-white">Daftar Jadi Affiliator</h1>
          <p className="text-neutral-400 mt-3 max-w-md mx-auto">
            Dapatkan komisi dengan memperkenalkan CukurShip kepada pemilik barbershop di Indonesia.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          {/* ─── Pilih Tier ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tier: t.value }))}
                className={`relative p-5 rounded-2xl border-2 text-left transition-all duration-200 ${
                  form.tier === t.value
                    ? t.value === "referral"
                      ? "bg-amber-500/10 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
                      : "bg-violet-500/10 border-violet-500 shadow-[0_0_30px_rgba(139,92,246,0.15)]"
                    : "bg-neutral-900/60 border-neutral-800 hover:border-neutral-600"
                }`}
              >
                {form.tier === t.value && (
                  <div className="absolute top-3 right-3 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-black text-xs font-bold">✓</div>
                )}
                <span className="text-3xl">{t.icon}</span>
                <h3 className="text-white font-bold mt-2">{t.label}</h3>
                <p className={`text-2xl font-black mt-1 ${t.value === "referral" ? "text-amber-400" : "text-violet-400"}`}>
                  {t.commission}
                </p>
                <p className="text-neutral-400 text-xs mt-1">{t.type}</p>
                <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full border ${
                  t.value === "referral"
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                }`}>{t.note}</span>
              </button>
            ))}
          </div>

          {/* ─── Data Diri ─── */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-bold text-lg">Data Diri</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nama Lengkap <span className="text-amber-400">*</span></label>
                <input
                  name="name" value={form.name} onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-all text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nomor WhatsApp <span className="text-amber-400">*</span></label>
                <input
                  name="phone" value={form.phone} onChange={handleChange} type="tel"
                  placeholder="08xxxxxxxxxx"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Email <span className="text-neutral-600">(opsional)</span></label>
              <input
                name="email" value={form.email} onChange={handleChange} type="email"
                placeholder="john@example.com"
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-all text-sm"
              />
            </div>
          </div>

          {/* ─── Data Rekening ─── */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-bold text-lg">Rekening Pencairan <span className="text-neutral-500 text-sm font-normal">(opsional, bisa diisi nanti)</span></h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Bank / E-Wallet</label>
              <select
                name="bank_name" value={form.bank_name} onChange={handleChange}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-all text-sm"
              >
                <option value="">-- Pilih Bank/E-Wallet --</option>
                {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nomor Rekening / Akun</label>
                <input
                  name="bank_account_number" value={form.bank_account_number} onChange={handleChange}
                  placeholder="0895xxxxxxxx"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-all text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Nama Pemilik Rekening</label>
                <input
                  name="bank_account_name" value={form.bank_account_name} onChange={handleChange}
                  placeholder="Sesuai rekening/e-wallet"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* ─── Syarat & Ketentuan ─── */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div
              onClick={() => setAgreed((v) => !v)}
              className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                agreed ? "bg-amber-500 border-amber-500" : "border-neutral-600 group-hover:border-amber-500/50"
              }`}
            >
              {agreed && <span className="text-black text-xs font-bold">✓</span>}
            </div>
            <span className="text-neutral-400 text-sm">
              Saya menyetujui{" "}
              <span className="text-amber-400 underline underline-offset-2 cursor-pointer">Syarat & Ketentuan</span>{" "}
              Program Afiliasi CukurShip, termasuk kebijakan komisi dan pencairan.
            </span>
          </label>

          {/* ─── Submit ─── */}
          <button
            type="submit"
            disabled={loading || !agreed}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all duration-200 shadow-[0_0_30px_rgba(245,158,11,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Mendaftar...</>
            ) : (
              "Daftar Sekarang →"
            )}
          </button>

          <p className="text-center text-sm text-neutral-600">
            Sudah punya akun?{" "}
            <Link href="/affiliate/login" className="text-amber-400 hover:text-amber-300 transition-colors">
              Masuk ke Dashboard
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
