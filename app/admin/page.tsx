"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface Booking {
  id: string;
  start_time: string;
  end_time: string;
  service_type: "home" | "barbershop";
  users?: { name: string; phone_number: string };
  barbers?: { name: string };
  services?: { name: string; price: number };
}

interface Barber {
  id: string;
  name: string;
  specialty: string;
  photo_url: string | null;
}

interface DashboardData {
  bookings_today: number;
  bookings_this_week: number;
  revenue_today: number;
  revenue_today_breakdown?: {
    cash: number;
    qris: number;
    transfer: number;
    online: number;
    pos: number;
  };
  revenue_this_month: number;
  active_barbers: number;
  upcoming_bookings: Booking[];
  barbers_list: Barber[];
}

export default function AdminDashboardOverview() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
  };
  
  const formatDateDay = (iso: string) => {
    return new Date(iso).toLocaleDateString("id-ID", { weekday: 'short', day: 'numeric', month: 'short' });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/overview");
        if (res.status === 401 || res.status === 403) {
          router.push("/admin/login");
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Gagal memuat dashboard");
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  return (
    <main className="min-h-screen bg-background text-accent pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-neutral-800/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto relative z-10 px-4 py-8">
        
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-2 mb-1">
             <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Dashboard</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Ikhtisar <span className="text-primary">Bisnis</span> Anda</h1>
          <p className="text-neutral-400 text-sm mt-1">Laporan kinerja barbershop dan info booking terkini hari ini.</p>
        </header>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl mb-6">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : data ? (
          <div className="space-y-8 animate-in slide-in-from-bottom-8 fade-in duration-500">
            
            {/* Stat Cards - 4 Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1 */}
              <div className="glass p-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all"></div>
                <div className="relative z-10">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Booking Hari Ini</p>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold text-white">{data.bookings_today}</span>
                    <span className="text-sm font-medium text-primary mb-1">Pelanggan</span>
                  </div>
                </div>
              </div>
              
              {/* Card 2 */}
              <div className="glass p-6 rounded-3xl border border-neutral-800/50 hover:border-primary/30 transition-all">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Booking Minggu Ini</p>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-bold text-white">{data.bookings_this_week}</span>
                  <span className="text-sm font-medium text-neutral-500 mb-1 bg-neutral-900 border border-neutral-800 px-2 rounded-md">Total</span>
                </div>
              </div>

              {/* Card 3 */}
              <div className="glass p-5 rounded-3xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent flex flex-col justify-between h-full relative group">
                <div>
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1.5">Pendapatan Hari Ini</p>
                  <div className="flex items-end gap-3 mb-2">
                    <span className="text-3xl font-bold text-green-400 tracking-tight">{formatRupiah(data.revenue_today)}</span>
                  </div>
                </div>
                
                {data.revenue_today_breakdown && (
                  <div className="grid grid-cols-2 gap-1.5 mt-auto pt-2 border-t border-neutral-800/50">
                    <div className="text-[10px] text-neutral-400 flex justify-between">
                      <span>Cash:</span> 
                      <span className="text-neutral-200 font-mono">{formatRupiah(data.revenue_today_breakdown.cash)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 flex justify-between">
                      <span>QRIS:</span> 
                      <span className="text-neutral-200 font-mono">{formatRupiah(data.revenue_today_breakdown.qris)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-400 flex justify-between">
                      <span>TF:</span> 
                      <span className="text-neutral-200 font-mono">{formatRupiah(data.revenue_today_breakdown.transfer)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 flex justify-between" title="Trx Kasir vs Online">
                      <span>Kasir:</span>
                      <span>{data.revenue_today_breakdown.pos} / {data.revenue_today_breakdown.pos + data.revenue_today_breakdown.online}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 4 */}
              <div className="glass p-5 rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent flex flex-col justify-between h-full">
                <div>
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-1.5">Pendapatan Bulan Ini</p>
                  <div className="flex items-end gap-3">
                    <span className="text-3xl font-bold text-blue-400 tracking-tight">{formatRupiah(data.revenue_this_month)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-500 mt-auto pt-2">Akumulasi estimasi kotor</p>
              </div>
            </div>

            {/* Main Content Grid: Booking Mendatang (Kiri/Besar) & Kapster Aktif (Kanan/Kecil) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Left Column - Upcoming Bookings */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-primary">⏳</span> Booking Terdekat (Confirmed)
                  </h2>
                  <Link href="/admin/bookings" className="text-sm text-neutral-400 hover:text-primary transition-colors font-medium">Lihat Semua →</Link>
                </div>
                
                <div className="glass rounded-3xl border border-neutral-800/50 p-2 space-y-2">
                  {data.upcoming_bookings.length === 0 ? (
                    <div className="p-10 text-center">
                      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto text-3xl mb-3 border border-neutral-800">💤</div>
                      <p className="text-neutral-400">Tidak ada jadwal booking yang menunggu.</p>
                      <Link href="/book" className="text-sm text-primary hover:underline mt-2 inline-block">Buka pesanan baru buat tes</Link>
                    </div>
                  ) : (
                    data.upcoming_bookings.map((booking) => {
                       const serviceName = booking.services?.name ? booking.services.name.replace('BARBER | ', '').replace('HOME | ', '') : "Layanan-";
                       return (
                         <div key={booking.id} className="p-4 bg-neutral-900/40 hover:bg-neutral-900 transition-colors rounded-2xl flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                           <div className="flex gap-4 items-center min-w-[140px]">
                              <div className="flex flex-col items-center justify-center w-14 h-14 bg-neutral-900 border border-neutral-800 rounded-xl flex-shrink-0">
                                <span className="text-xs font-bold text-primary uppercase">{booking.service_type === 'home' ? 'HOME' : 'IN-SHOP'}</span>
                                <span className="text-xl">
                                  {booking.service_type === 'home' ? '🛵' : '💈'}
                                </span>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-neutral-500">{formatDateDay(booking.start_time)}</p>
                                <p className="text-lg font-bold tracking-tight text-white">{formatTime(booking.start_time)}</p>
                              </div>
                           </div>
                           
                           <div className="flex-1 border-l-2 border-neutral-800/50 pl-4">
                             <p className="font-semibold text-lg">{booking.users?.name || "Pelanggan"}</p>
                             <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-400 mt-1">
                               <span className="flex items-center gap-1">✨ {serviceName}</span>
                               <span className="flex items-center gap-1">✂️ {booking.barbers?.name || "Bebas"}</span>
                             </div>
                           </div>
                         </div>
                       )
                    })
                  )}
                </div>
              </div>

              {/* Right Column - Active Barbers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-primary">💈</span> Kapster Toko Anda
                  </h2>
                  <span className="bg-neutral-900 text-neutral-400 text-xs px-2 py-1 rounded-md border border-neutral-800">Total: {data.active_barbers}</span>
                </div>
                
                <div className="glass rounded-3xl border border-neutral-800/50 p-4 space-y-3">
                  {data.barbers_list.length === 0 ? (
                    <p className="text-sm text-neutral-500 text-center py-4">Belum ada kapster terdaftar.</p>
                  ) : (
                    data.barbers_list.map((barber) => (
                      <div key={barber.id} className="flex items-center gap-3 p-3 bg-neutral-900/40 rounded-2xl border border-transparent hover:border-neutral-800 transition-colors">
                        <div className="w-12 h-12 rounded-xl bg-neutral-800 overflow-hidden relative border border-neutral-700 flex-shrink-0 flex items-center justify-center">
                          {barber.photo_url ? (
                            <Image src={barber.photo_url} alt={barber.name} fill className="object-cover" />
                          ) : (
                            <span className="text-2xl">💇</span>
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-white truncate">{barber.name}</p>
                          <p className="text-[10px] text-primary uppercase tracking-widest font-semibold truncate">{barber.specialty || "ALL ROUNDER"}</p>
                        </div>
                      </div>
                    ))
                  )}
                  
                  <Link href="/admin/barbers" className="block w-full py-3 mt-2 text-center text-sm font-semibold text-neutral-950 bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-lg shadow-primary/10">
                    Kelola Kapster
                  </Link>
                </div>
              </div>

            </div>
            
          </div>
        ) : null}

      </div>
    </main>
  );
}

// Skeleton Loader UI
function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="glass p-6 rounded-3xl border border-neutral-800/50 h-32 flex flex-col justify-between">
            <div className="w-24 h-3 bg-neutral-800 rounded-full" />
            <div className="w-16 h-8 bg-neutral-700 rounded-lg" />
            <div className="w-32 h-2 bg-neutral-800 rounded-full" />
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="w-48 h-6 bg-neutral-800 rounded-lg" />
          <div className="glass rounded-3xl border border-neutral-800/50 p-2 space-y-2">
            {[1, 2, 3].map(i => (
               <div key={i} className="p-4 bg-neutral-900/40 rounded-2xl flex gap-4 h-24 items-center">
                 <div className="w-14 h-14 bg-neutral-800 rounded-xl" />
                 <div className="flex-1 space-y-2">
                   <div className="w-3/4 h-5 bg-neutral-700 rounded-lg" />
                   <div className="w-1/2 h-4 bg-neutral-800 rounded-lg" />
                 </div>
               </div>
            ))}
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="w-40 h-6 bg-neutral-800 rounded-lg" />
          <div className="glass rounded-3xl border border-neutral-800/50 p-4 space-y-3">
             {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex gap-3 p-3 items-center">
                   <div className="w-12 h-12 bg-neutral-800 rounded-xl" />
                   <div className="space-y-2 flex-1">
                     <div className="w-3/4 h-4 bg-neutral-700 rounded-lg" />
                     <div className="w-1/2 h-3 bg-neutral-800 rounded-lg" />
                   </div>
                </div>
             ))}
             <div className="w-full h-10 bg-neutral-800 rounded-xl mt-4" />
          </div>
        </div>
      </div>
    </div>
  )
}
