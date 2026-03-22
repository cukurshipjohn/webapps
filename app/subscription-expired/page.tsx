import Link from "next/link";

export default function SubscriptionExpired() {
    return (
        <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-red-500/4 rounded-full blur-[120px]" />
            </div>

            <div className="relative text-center max-w-md space-y-8">
                <div className="w-20 h-20 mx-auto bg-neutral-900 border border-red-500/20 rounded-2xl flex items-center justify-center text-3xl shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                    ⏰
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-extrabold text-white">Langganan Tidak Aktif</h1>
                    <p className="text-neutral-400 leading-relaxed">
                        Masa berlangganan barbershop ini telah berakhir,
                        sehingga halaman booking untuk sementara tidak dapat diakses.
                    </p>
                </div>

                <div className="bg-neutral-900/80 border border-red-500/20 rounded-2xl p-6 space-y-4">
                    <div className="bg-red-500/10 rounded-xl p-3">
                        <p className="text-red-400 text-sm font-medium">
                            🔒 Halaman ini hanya bisa diakses oleh pelanggan terdaftar saat langganan aktif.
                        </p>
                    </div>

                    <div className="space-y-2 text-left">
                        <p className="text-neutral-400 text-sm font-medium">Untuk pemilik barbershop:</p>
                        <Link href="/admin/billing"
                            className="flex items-center justify-between w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-all">
                            <span>💳 Perpanjang Langganan Sekarang</span>
                            <span>→</span>
                        </Link>
                        <Link href="/admin/login"
                            className="flex items-center justify-between w-full py-3 px-4 border border-neutral-700 hover:border-neutral-600 text-neutral-300 hover:text-white rounded-xl text-sm transition-all">
                            <span>🔑 Login ke Panel Admin</span>
                            <span>→</span>
                        </Link>
                    </div>
                </div>

                <p className="text-xs text-neutral-600">
                    Butuh bantuan? Hubungi support CukurShip via WhatsApp
                </p>

                <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
                    ← Kembali ke {process.env.NEXT_PUBLIC_APP_DOMAIN || "beranda"}
                </Link>
            </div>
        </main>
    );
}
