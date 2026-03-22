"use client";

import Link from "next/link";

export default function SuspendedShopPage() {
  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-20 h-20 bg-yellow-500/10 border border-yellow-500/30 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(234,179,8,0.1)]">
          ⚠️
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Langganan Tidak Aktif</h1>
          <p className="text-neutral-400 text-lg">
            Layanan barbershop ini sementara tidak tersedia karena masa langganan telah berakhir.
          </p>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-6 text-left space-y-2">
          <p className="text-sm font-medium text-yellow-400">Informasi untuk Owner:</p>
          <ul className="text-sm text-neutral-400 list-disc list-inside space-y-1">
            <li>Silakan hubungi admin platform untuk memperpanjang langganan</li>
            <li>Data Anda aman dan tidak akan dihapus</li>
            <li>Setelah pembayaran dikonfirmasi, layanan akan aktif kembali</li>
          </ul>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all"
        >
          ← Kembali ke Halaman Utama
        </Link>
      </div>
    </main>
  );
}
