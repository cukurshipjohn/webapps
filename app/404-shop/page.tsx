"use client";

import Link from "next/link";

export default function NotFoundShopPage() {
  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-20 h-20 bg-neutral-900 border border-neutral-800 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(239,68,68,0.1)]">
          🏪
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Toko Tidak Ditemukan</h1>
          <p className="text-neutral-400 text-lg">
            Barbershop yang Anda cari tidak terdaftar dalam sistem kami.
          </p>
        </div>
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-left space-y-2">
          <p className="text-sm font-medium text-neutral-300">Kemungkinan penyebab:</p>
          <ul className="text-sm text-neutral-500 list-disc list-inside space-y-1">
            <li>Alamat URL salah atau typo</li>
            <li>Toko belum terdaftar di platform</li>
            <li>Nama subdomain sudah berubah</li>
          </ul>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-background font-bold rounded-xl transition-all hover:opacity-90"
        >
          ← Kembali ke Halaman Utama
        </Link>
      </div>
    </main>
  );
}
