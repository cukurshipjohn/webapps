"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParams = searchParams?.get("redirect");
  
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    // Ambil data user dari local storage yang diset saat verify OTP
    const userStr = localStorage.getItem("user");
    if (!userStr || !localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    const user = JSON.parse(userStr);
    if (user.name) {
      // Jika ternyata sudah punya nama, langsung ke dashboard/redirect
      router.push(redirectParams || "/dashboard");
    } else {
      setPhoneNumber(user.phoneNumber);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const token = localStorage.getItem("token");

    try {
      const res = await fetch("/api/profile/complete", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name, address }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Update data user di local storage dengan data baru yang memiliki name
      localStorage.setItem("user", JSON.stringify(data.user));
      
      // Redirect ke halaman yang diinginkan atau dashboard
      router.push(redirectParams || "/dashboard");
    } catch (err: any) {
      setError(err.message || "Gagal memperbarui profil. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative bg-neutral-950">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-600/10 rounded-full blur-[100px] z-0" />

      <div className="glass relative z-10 w-full max-w-md p-8 rounded-2xl shadow-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Lengkapi Profil</h1>
          <p className="text-neutral-400 text-sm">
            Selamat datang! Silakan lengkapi data diri Anda sebelum melanjutkan.
          </p>
          <div className="mt-2 text-xs text-amber-500 font-mono">
            Nomor: {phoneNumber}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-neutral-300">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masukkan nama Anda"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all focus:bg-neutral-900"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium text-neutral-300">
              Alamat (Opsional)
            </label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Alamat lengkap untuk Home Service"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[100px] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Menyimpan..." : "Simpan Profil & Lanjutkan"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 flex items-center justify-center text-amber-500">Loading...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
