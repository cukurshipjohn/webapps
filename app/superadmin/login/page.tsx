"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "otp";

export default function SuperadminLogin() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("phone");
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
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
                body: JSON.stringify({ phoneNumber: phone, isAdminLogin: true }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setSuccessMsg("OTP dikirim. Masukkan kode dari WhatsApp.");
            setStep("otp");
        } catch (err: any) {
            setError(err.message || "Gagal mengirim OTP.");
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
                body: JSON.stringify({ phoneNumber: phone, otpCode: otp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            if (data.user.role !== "superadmin") {
                throw new Error("Akses Ditolak: Nomor ini bukan akun Superadmin.");
            }

            localStorage.setItem("superadmin_token", data.token);
            localStorage.setItem("superadmin_user", JSON.stringify(data.user));
            router.push("/superadmin");
        } catch (err: any) {
            setError(err.message || "OTP tidak valid.");
            if (err.message?.includes("Ditolak")) {
                setStep("phone");
                setOtp("");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-[#060d1a] relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px]" />
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-[0.03]"
                    style={{ backgroundImage: 'linear-gradient(#00e5ff 1px, transparent 1px), linear-gradient(90deg, #00e5ff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            <div className="relative z-10 w-full max-w-md p-8 mx-4">
                <div className="bg-neutral-900/80 border border-cyan-500/20 rounded-2xl p-8 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-2xl shadow-[0_0_30px_rgba(6,182,212,0.15)]">
                            🛰️
                        </div>
                        <h1 className="text-2xl font-bold text-white">Super Admin</h1>
                        <p className="text-xs text-cyan-400/60 font-mono uppercase tracking-widest">CukurShip Platform Control</p>
                    </div>

                    {/* Step bar */}
                    <div className="flex gap-2">
                        <div className="h-1 flex-1 rounded-full bg-cyan-500" />
                        <div className={`h-1 flex-1 rounded-full ${step === "otp" ? "bg-cyan-500" : "bg-neutral-800"} transition-all`} />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl text-center">
                            {error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm px-4 py-3 rounded-xl text-center">
                            ✓ {successMsg}
                        </div>
                    )}

                    {step === "phone" && (
                        <form onSubmit={handleRequestOTP} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-neutral-300">Nomor WhatsApp Developer</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    placeholder="08xx-xxxx-xxxx"
                                    required
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white font-mono placeholder:text-neutral-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-xl transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                            >
                                {loading ? "Mengirim..." : "Kirim Kode OTP"}
                            </button>
                        </form>
                    )}

                    {step === "otp" && (
                        <form onSubmit={handleVerifyOTP} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-neutral-300 block text-center">Kode OTP</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={otp}
                                    onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                                    placeholder="••••••"
                                    required
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-4 text-cyan-400 text-center text-4xl tracking-[1rem] placeholder:text-neutral-700 focus:outline-none focus:border-cyan-500 transition-all font-mono font-bold"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || otp.length < 6}
                                className="w-full py-3 bg-white hover:bg-neutral-200 text-neutral-950 font-extrabold rounded-xl transition-all disabled:opacity-40"
                            >
                                {loading ? "Memverifikasi..." : "Masuk Platform"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
                                className="w-full py-2 text-sm text-neutral-500 hover:text-cyan-400 transition-colors"
                            >
                                Ganti Nomor
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </main>
    );
}
