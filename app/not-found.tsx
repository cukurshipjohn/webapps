import Link from "next/link";

export default function NotFound() {
    return (
        <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/5 rounded-full blur-[100px]" />
            </div>
            <div className="relative text-center max-w-lg space-y-6">
                <div className="text-8xl font-black bg-gradient-to-b from-amber-400 to-amber-600/30 bg-clip-text text-transparent">404</div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Halaman Tidak Ditemukan</h1>
                    <p className="text-neutral-400 mt-2">Maaf, halaman yang Anda cari tidak ada atau telah dipindahkan.</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                    <Link href="/" className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-all">
                        Kembali ke Beranda
                    </Link>
                    <Link href="/register" className="px-5 py-2.5 border border-neutral-700 hover:border-amber-500/40 text-neutral-300 hover:text-white rounded-xl text-sm transition-all">
                        Daftarkan Toko
                    </Link>
                </div>
            </div>
        </main>
    );
}
