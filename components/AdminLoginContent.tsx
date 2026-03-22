"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Step = "phone" | "otp";

export default function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParams = searchParams?.get("redirect");
  
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, isAdminLogin: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setSuccessMsg("Kode Admin OTP telah dikirim.");
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Gagal mengirim OTP Admin.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, otpCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Pastikan yang login BUKAN customer biasa
      if (data.user.role === 'customer') {
          throw new Error("Akses Ditolak: Halaman ini khusus untuk Staff/Admin.");
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("token", data.token);
      router.push(redirectParams || "/admin");
      
    } catch (err: any) {
      setError(err.message || "Kode OTP tidak valid.");
      // Jika errornya dari role denial (Akses Ditolak), kembalikan ke input awal biar bisa ganti nomor
      if(err.message && err.message.includes('Akses Ditolak')){
          setStep("phone");
          setOtpCode("");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 bg-neutral-950 z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px] z-0" />

      <div className="glass relative z-10 w-full max-w-md p-8 rounded-3xl shadow-2xl border border-red-500/20 space-y-8 backdrop-blur-3xl bg-neutral-950/50">
        
        {/* Header Khusus Admin */}
        <div className="text-center space-y-2">
           <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-2xl mx-auto flex items-center justify-center text-red-500 text-2xl shadow-[0_0_30px_rgba(239,68,68,0.15)] mb-4">
              🛡️
           </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Portal Admin</h2>
          <p className="text-neutral-500 text-sm font-mono uppercase tracking-wider">Akses Terbatas Staff</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${step === "phone" ? "bg-red-500" : "bg-red-500"}`} />
          <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${step === "otp" ? "bg-red-500" : "bg-neutral-800"}`} />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm text-center font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg text-sm text-center">
            ✅ {successMsg}
          </div>
        )}

        {/* Step 1: Phone Form */}
        {step === "phone" && (
          <form onSubmit={handleRequestOTP} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-bold text-neutral-300">
                Nomor Handphone Terdaftar
              </label>
              <input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Contoh: 0812..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4 text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Mengontak Server...
                </>
              ) : (
                "Kirim Kode Verifikasi"
              )}
            </button>
          </form>
        )}

        {/* Step 2: OTP Form */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="otp" className="text-sm font-bold text-neutral-300 text-center block">
                Kode Autentikasi Admin
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4 text-red-500 text-center text-4xl tracking-[1rem] placeholder:text-neutral-800 focus:outline-none focus:border-red-500 transition-all font-mono font-bold"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full py-4 bg-white hover:bg-neutral-200 text-neutral-950 font-extrabold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Menyinkronkan..." : "Masuk ke Dashboard"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("phone"); setOtpCode(""); setError(""); setSuccessMsg(""); }}
              className="w-full py-2 text-sm text-neutral-500 hover:text-red-400 transition-colors font-medium"
            >
              Batal / Ganti Nomor
            </button>
          </form>
        )}
        
        <div className="pt-6 border-t border-neutral-800/50 mt-6 text-center">
            <Link href="/login" className="text-xs text-neutral-500 hover:text-white transition-colors underline underline-offset-4">
                Bukan Admin? Kembali ke Portal Pelanggan
            </Link>
        </div>
      </div>
    </main>
  );
}
