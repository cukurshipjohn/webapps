"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AffiliateLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOTP = async () => {
    if (!phone) { setError("Nomor WhatsApp wajib diisi."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, isAffiliateLogin: true, portalType: 'affiliate' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || "Gagal mengirim OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp || otp.length < 6) { setError("Masukkan kode OTP 6 digit."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, otpCode: otp, isAffiliateLogin: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Simpan ke localStorage KHUSUS affiliator
      localStorage.setItem("affiliate_token", data.token);
      localStorage.setItem("affiliate", JSON.stringify(data.affiliate));

      router.push("/affiliate/dashboard");
    } catch (err: any) {
      setError(err.message || "OTP tidak valid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/affiliate/register" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm mb-6">
            ← Belum punya akun? Daftar dulu
          </Link>
          <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
            💼
          </div>
          <h1 className="text-3xl font-black text-white">Portal Affiliator</h1>
          <p className="text-neutral-400 mt-2 text-sm">Login dengan nomor WhatsApp terdaftar</p>
        </div>

        {/* Card */}
        <div className="bg-neutral-900/60 border border-neutral-800 backdrop-blur-xl rounded-3xl p-8 shadow-2xl space-y-6">

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          {/* Phone input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">Nomor WhatsApp</label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                disabled={otpSent}
                className="flex-1 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-all disabled:opacity-50 text-sm"
              />
              {!otpSent && (
                <button
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-medium rounded-xl transition-all disabled:opacity-40 whitespace-nowrap"
                >
                  {loading ? "..." : "Kirim OTP"}
                </button>
              )}
            </div>
          </div>

          {/* OTP input */}
          {otpSent && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-center">
                <p className="text-amber-400 text-sm">✅ OTP telah dikirim ke WhatsApp <span className="font-bold">{phone}</span></p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Kode OTP</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="flex-1 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5rem] placeholder:text-neutral-700 focus:outline-none focus:border-amber-500 transition-all font-mono"
                  />
                  <button
                    onClick={handleVerify}
                    disabled={loading || otp.length < 6}
                    className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-xl transition-all disabled:opacity-40"
                  >
                    {loading ? "..." : "Masuk"}
                  </button>
                </div>
              </div>

              <button
                onClick={() => { setOtpSent(false); setOtp(""); setError(""); }}
                className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                Ganti nomor
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-neutral-600 mt-6">
          Belum terdaftar?{" "}
          <Link href="/affiliate/register" className="text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2">
            Daftar sebagai Affiliator
          </Link>
        </p>
      </div>
    </main>
  );
}
