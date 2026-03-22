import Link from "next/link";

export default function ShopNotFound() {
    return (
        <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/4 rounded-full blur-[120px]" />
            </div>

            <div className="relative text-center max-w-md space-y-8">
                <div className="text-7xl">✂️</div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-extrabold text-white">Barbershop Tidak Ditemukan</h1>
                    <p className="text-neutral-400 leading-relaxed">
                        Barbershop yang Anda cari belum terdaftar di platform kami,
                        atau URL-nya mungkin sudah berubah.
                    </p>
                </div>

                <div className="bg-neutral-900/80 border border-amber-500/20 rounded-2xl p-6 text-left space-y-3">
                    <p className="text-amber-400 font-bold text-sm">💡 Ingin mendirikan barbershop di CukurShip?</p>
                    <p className="text-neutral-400 text-sm">
                        Daftarkan barbershop Anda dan dapatkan halaman booking profesional dalam 5 menit. Gratis 14 hari!
                    </p>
                    <Link href="/register"
                        className="inline-flex w-full items-center justify-center py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                        Dafftar Barbershop Gratis →
                    </Link>
                </div>

                <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
                    ← Kembali ke cukurship.id
                </Link>
            </div>
        </main>
    );
}
