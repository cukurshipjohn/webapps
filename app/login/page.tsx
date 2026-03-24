"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Step = "phone" | "otp";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParams = searchParams?.get("redirect");
  
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Step 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setSuccessMsg("Kode OTP telah dikirim ke WhatsApp Anda.");
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Gagal mengirim OTP. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
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

      localStorage.setItem("user", JSON.stringify(data.user));

      // Validasi redirect param — JANGAN ikuti redirect ke jalur admin dari halaman pelanggan.
      // Ini bisa terjadi jika proxy.ts pernah set ?redirect=/admin sebelumnya.
      const safeRedirect = (redirectParams && !redirectParams.startsWith('/admin') && !redirectParams.startsWith('/superadmin'))
        ? redirectParams
        : null;

      // Login pelanggan SELALU ke /dashboard (atau safeRedirect yang valid).
      // Owner yang ingin ke admin panel WAJIB pakai /admin/login.
      if (data.requireProfileCompletion) {
        const redirectUrl = safeRedirect
          ? `/profile/complete?redirect=${encodeURIComponent(safeRedirect)}`
          : "/profile/complete";
        router.push(redirectUrl);
      } else {
        router.push(safeRedirect || "/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Kode OTP tidak valid atau sudah kadaluarsa.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative bg-background text-accent">
      <div className="absolute inset-0 bg-background z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-[100px] z-0" />

      <div className="glass relative z-10 w-full max-w-md p-8 rounded-2xl shadow-2xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="inline-block mb-4">
            <h2 className="text-2xl font-bold tracking-tight">Login <span className="text-primary">Pelanggan</span></h2>
          </Link>

          {step === "phone" ? (
            <>
              <h1 className="text-3xl font-bold mb-1">Masuk</h1>
              <p className="text-neutral-400 text-sm">Masukkan nomor WhatsApp Anda untuk mendapatkan kode OTP.</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-1">Verifikasi OTP</h1>
              <p className="text-neutral-400 text-sm">
                Kode OTP 6 digit telah dikirim ke <span className="text-primary-hover font-medium">{phoneNumber}</span>
              </p>
            </>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${step === "phone" ? "bg-primary" : "bg-primary"}`} />
          <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${step === "otp" ? "bg-primary" : "bg-neutral-800"}`} />
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {/* Success message */}
        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg text-sm text-center">
            ✅ {successMsg}
          </div>
        )}

        {/* Step 1: Phone Form */}
        {step === "phone" && (
          <form onSubmit={handleRequestOTP} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-medium text-neutral-300">
                Nomor WhatsApp
              </label>
              <input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Contoh: 08123456789 atau +628123456789"
                className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
                required
              />
              <p className="text-xs text-neutral-500">Nomor harus aktif di WhatsApp</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              id="btn-request-otp"
              className="w-full py-4 btn-primary text-background font-bold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Mengirim OTP...
                </>
              ) : (
                <>
                  Kirim Kode OTP via WhatsApp
                  <span>📱</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 2: OTP Form */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="otp" className="text-sm font-medium text-neutral-300">
                Kode OTP
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg px-4 py-4 text-white text-center text-3xl tracking-[1rem] placeholder:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
                required
              />
              <p className="text-xs text-neutral-500 text-center">Kode berlaku selama 5 menit</p>
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              id="btn-verify-otp"
              className="w-full py-4 btn-primary text-background font-bold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Memverifikasi..." : "Verifikasi & Masuk"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("phone"); setOtpCode(""); setError(""); setSuccessMsg(""); }}
              className="w-full py-2 text-sm text-neutral-500 hover:text-primary-hover transition-colors"
            >
              ← Ganti nomor HP
            </button>
          </form>
        )}

        <p className="text-center text-xs text-neutral-600">
          Dengan masuk, Anda menyetujui Syarat & Ketentuan layanan.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-primary">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
