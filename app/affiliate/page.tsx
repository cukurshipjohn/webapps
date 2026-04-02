"use client";

import { useState } from "react";
import Link from "next/link";
import Script from "next/script";

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function AffiliateMarketingPage() {
  const [estimatedShops, setEstimatedShops] = useState(10);
  const [selectedPlanPrice, setSelectedPlanPrice] = useState(149000); // Pro plan default

  const monthlyCommission = Math.floor(estimatedShops * selectedPlanPrice * 0.2); // 20% recurring
  const yearlyCommission = monthlyCommission * 12;

  const faqs = [
    {
      q: "Kapan komisi bisa dicairkan?",
      a: "Komisi akan masuk dalam status 'Pending' dan otomatis menjadi 'Tersedia' untuk dicairkan 7 hari setelah pembayaran dari tenant berhasil divalidasi."
    },
    {
      q: "Berapa minimum pencairan komisi?",
      a: "Minimum pencairan saldo komisi adalah Rp 50.000 ke rekening bank atau e-wallet kamu."
    },
    {
      q: "Bagaimana jika tenant membatalkan (cancel) layanannya?",
      a: "Jika tenant melakukan refund/cancel dalam masa garansi (< 7 hari), komisi untuk transaksi tersebut akan dibatalkan."
    },
    {
      q: "Berapa lama link referral saya valid?",
      a: "Link akan selalu valid selamanya selama akun affiliator kamu aktif dan tidak melanggar ketentuan layanan kami."
    }
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans overflow-x-hidden">
      {/* ── META PIXEL ────────────────────────────────────────── */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '787956207131909');
            fbq('track', 'PageView');
        `}
      </Script>

      {/* ── NAVBAR ────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-neutral-950/80 border-b border-neutral-800/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">✂️</span>
            <span className="text-lg font-extrabold text-white">CukurShip</span>
            <span className="px-2 py-0.5 ml-2 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-amber-500/20">
              Affiliate
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/affiliate/login" className="text-neutral-400 hover:text-white transition-colors font-medium">
              Login Dashboard
            </Link>
            <Link href="/affiliate/register" className="hidden sm:inline-block px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              Daftar Jadi Affiliator
            </Link>
          </nav>
        </div>
      </header>

      {/* ── SECTION 1: HERO ────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 relative overflow-hidden text-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-500/10 rounded-full blur-[120px]" />
        </div>
        
        <div className="relative max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-400 font-bold mb-4">
            💸 Buka Keran Penghasilan Pasif
          </div>
          
          <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight">
            Hasilkan Komisi Tiap Bulan dengan Merekomendasikan <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">CukurShip</span>
          </h1>
          
          <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Program affiliate pertama untuk platform booking barbershop terdepan di Indonesia. Bantu teman barbershop-mu go digital, dan dapatkan bayaran atas setiap transaksi mereka!
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/affiliate/register" className="w-full sm:w-auto px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-2xl text-lg transition-all shadow-[0_0_40px_rgba(245,158,11,0.25)] hover:-translate-y-0.5">
              🚀 Daftar Jadi Affiliator →
            </Link>
            <Link href="/affiliate/login" className="w-full sm:w-auto px-8 py-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold rounded-2xl text-lg transition-all">
              Login Dashboard
            </Link>
          </div>
          <p className="text-xs text-neutral-600 mt-4">Pendaftaran gratis 100% • Tanpa modal awal</p>
        </div>
      </section>

      {/* ── SECTION 2: CARA KERJA ──────────────────────────────── */}
      <section className="py-20 px-6 border-t border-neutral-900 bg-neutral-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-white">Cara Kerja Program</h2>
            <p className="text-neutral-500 mt-2">Cukup 3 tahapan mudah untuk mulai menghasilkan uang</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-8 hover:bg-neutral-900/80 transition-all text-center group">
              <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/20 text-4xl rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">📝</div>
              <h3 className="text-xl font-bold text-white mb-3">1. Daftar</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Buat akun gratismu hanya dalam hitungan detik. Dapatkan kode referral unik dan akses ke dashboard pelacakan.
              </p>
            </div>
            
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-8 hover:bg-neutral-900/80 transition-all text-center group">
              <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/20 text-4xl rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">🔗</div>
              <h3 className="text-xl font-bold text-white mb-3">2. Bagikan</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Sebarkan link milikmu ke kenalan pemilik barbershop, sosial media, atau grup WA komunitas pencukur rambut.
              </p>
            </div>
            
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-8 hover:bg-neutral-900/80 transition-all text-center group">
              <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/20 text-4xl rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">💰</div>
              <h3 className="text-xl font-bold text-white mb-3">3. Hasilkan</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Saat mereka bayar langganan CukurShip, komisi otomatis masuk ke saldomu. Tarik saldo kapan saja!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: STRUKTUR KOMISI ─────────────────────────── */}
      <section className="py-20 px-6 relative">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-white">Pilihan Program Fleksibel</h2>
            <p className="text-neutral-500 mt-2">Pilih tier yang paling sesuai dengan profil kamu.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Kartu Referral */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-8 hover:border-neutral-700 transition-all">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-white flex items-center gap-2">👥 Program Referral</h3>
                  <p className="text-green-400 text-sm font-bold mt-1">Gratis, Langsung Aktif</p>
                </div>
              </div>
              
              <div className="my-8">
                <p className="text-neutral-400 text-sm uppercase tracking-wide font-bold mb-2">Skema Komisi:</p>
                <p className="text-5xl font-black text-white">10%</p>
                <p className="text-neutral-400 text-sm mt-1">Dari pembayaran langganan <strong>PERTAMA</strong></p>
              </div>
              
              <div className="space-y-3 mb-10 pt-6 border-t border-neutral-800">
                <p className="text-sm text-neutral-300">✓ Tanpa syarat minimum penjualan</p>
                <p className="text-sm text-neutral-300">✓ Approval otomatis instan</p>
                <p className="text-sm text-neutral-300">✓ Cocok untuk merekomendasikan teman</p>
              </div>

              <Link href="/affiliate/register?tier=referral" className="block w-full text-center py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-2xl transition-all border border-neutral-700">
                Daftar Gratis Menjadi Referral
              </Link>
            </div>

            {/* Kartu Reseller */}
            <div className="bg-gradient-to-b from-amber-500/10 to-neutral-900/80 border-2 border-amber-500/50 rounded-3xl p-8 relative shadow-[0_0_50px_rgba(245,158,11,0.05)] transform md:-translate-y-4">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-amber-500 text-black text-xs font-black uppercase tracking-wider rounded-full shadow-lg">
                Paling Menguntungkan 🔥
              </div>
              
              <div className="flex justify-between items-start mb-6 pt-2">
                <div>
                  <h3 className="text-2xl font-black text-white flex items-center gap-2">⭐ Program Reseller</h3>
                  <p className="text-neutral-400 text-sm mt-1 mb-1">Ditinjau oleh tim kami</p>
                </div>
              </div>
              
              <div className="my-8">
                <p className="text-amber-500 text-sm uppercase tracking-wide font-bold mb-2">Skema Komisi:</p>
                <p className="text-5xl font-black text-amber-500 drop-shadow-md">20%</p>
                <p className="text-white font-medium mt-2 py-1 px-3 bg-white/5 border border-white/10 rounded-lg inline-block text-sm">
                  🔄 <span className="text-amber-400 font-bold">RECURRING</span>: Dapat terus tiap bulan!
                </p>
              </div>
              
              <div className="space-y-4 mb-10 pt-6 border-t border-amber-500/20">
                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                  <p className="text-xs text-neutral-400 mb-1">Contoh Skenario:</p>
                  <p className="text-sm text-neutral-300 leading-snug">
                    Jika sukses mengajak <strong>10 Barbershop</strong> berlangganan paket Pro (Rp149.000)...<br/>
                    Dapat gaji pasif: <strong className="text-amber-400">Rp 298.000 / bulan</strong> tanpa perlu kerja lagi!
                  </p>
                </div>
              </div>

              <Link href="/affiliate/register?tier=reseller" className="block w-full text-center py-4 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-2xl transition-all shadow-lg hover:shadow-amber-500/40">
                Daftar Sebagai Reseller Profesional
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: KALKULATOR ──────────────────────────────── */}
      <section className="py-24 px-6 border-y border-neutral-900 bg-[#060c14]">
        <div className="max-w-4xl mx-auto">
          <div className="bg-neutral-900 border border-amber-500/20 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none"/>
            <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-cyan-500/10 blur-[80px] rounded-full pointer-events-none"/>
            
            <h2 className="text-3xl font-extrabold text-white mb-2 relative z-10">Kalkulator Potensi Resolusi 💸</h2>
            <p className="text-neutral-400 mb-10 relative z-10">Hitung sendiri penghasilan pasifmu jika menjadi Reseller (Komisi Recurring 20%)</p>

            <div className="space-y-8 relative z-10 max-w-2xl mx-auto">
              {/* Slider Input */}
              <div className="space-y-4 text-left">
                <div className="flex justify-between items-end">
                  <label className="text-sm font-medium text-neutral-300">Berapa barbershop yang akan mendaftar?</label>
                  <span className="text-2xl font-black text-amber-400">{estimatedShops} Toko</span>
                </div>
                <input 
                  type="range" 
                  min="1" max="100" 
                  value={estimatedShops} 
                  onChange={(e) => setEstimatedShops(Number(e.target.value))}
                  className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* Dropdown Input */}
              <div className="space-y-2 text-left">
                 <label className="text-sm font-medium text-neutral-300">Rata-rata paket berlangganan mereka?</label>
                 <select 
                    value={selectedPlanPrice}
                    onChange={(e) => setSelectedPlanPrice(Number(e.target.value))}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white font-medium rounded-xl p-4 outline-none focus:border-amber-500 transition-colors cursor-pointer"
                 >
                   <option value={79000}>Starter (Rp 79.000 / bulan)</option>
                   <option value={149000}>Pro (Rp 149.000 / bulan)</option>
                   <option value={299000}>Business (Rp 299.000 / bulan)</option>
                 </select>
              </div>

              {/* Outputs */}
              <div className="pt-6 border-t border-neutral-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-black/40 border border-neutral-800 rounded-2xl p-6">
                     <p className="text-neutral-400 text-sm mb-1">Gaji Pasif per Bulan</p>
                     <p className="text-3xl font-black text-white">{formatRupiah(monthlyCommission)}</p>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
                     <p className="text-amber-500 placeholder-opacity-80 text-sm mb-1 font-bold">Total Potensi dalam 1 Tahun</p>
                     <p className="text-3xl font-black text-amber-400">{formatRupiah(yearlyCommission)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: FAQ ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-neutral-950">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-white">Pertanyaan Terpopuler (FAQ)</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 transition-all hover:bg-neutral-800/80">
                <h3 className="text-lg font-bold text-white mb-2">{faq.q}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 6: CTA FINAL ───────────────────────────────── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 text-3xl rounded-full flex items-center justify-center mx-auto blur-[1px]">⚡</div>
          <h2 className="text-4xl font-extrabold text-white">Mulai Hasilkan Komisi Sekarang — 100% Gratis</h2>
          <p className="text-neutral-400 text-lg">Tidak dipungut biaya apapun. Jadi yang pertama menyebarkan revolusi digital barbershop di kotamu!</p>
          <div className="pt-4">
            <Link href="/affiliate/register" className="inline-block px-10 py-5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-full text-xl transition-all shadow-[0_0_40px_rgba(245,158,11,0.3)] hover:scale-105">
              🚀 Daftar Jadi Affiliator Sekarang
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-900 py-10 px-6 bg-[#03060a]">
         <div className="max-w-6xl mx-auto text-center flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-2">
              <span className="text-lg">✂️</span>
              <span className="font-extrabold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">CukurShip</span>
           </div>
           <p className="text-xs text-neutral-600 uppercase tracking-widest font-bold">Partner Affiliate Program</p>
         </div>
      </footer>
    </div>
  );
}
