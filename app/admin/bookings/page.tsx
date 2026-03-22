"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface Booking {
  id: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "completed" | "cancelled";
  service_type: "home" | "barbershop";
  customer_address: string | null;
  tenant_id: string;
  users?: { name: string; phone_number: string };
  barbers?: { name: string };
  services?: { name: string; price: number };
}

export default function AdminBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFilterType, setDateFilterType] = useState<"today" | "this_week" | "this_month" | "custom">("this_week");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fungsi pembantu untuk mendapatkan rentang tanggal
  const getDateRange = (type: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalisasi ke jam 00:00 hari ini
    
    let start = new Date(today);
    let end = new Date(today); // Default ke hari ini
    
    if (type === "this_week") {
      // Ambil hari Senin dalam minggu ini
      const day = today.getDay(); // 0 = Minggu, 1 = Senin, dst
      const diffStart = today.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(today.setDate(diffStart));
      
      // Hari Minggu di akhir minggu ini
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (type === "this_month") {
      // Tanggal 1 bulan ini
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      // Tanggal terakhir bulan ini
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (type === "custom") {
      start = customStartDate ? new Date(customStartDate) : today;
      end = customEndDate ? new Date(customEndDate) : today;
    }
    
    return { 
      startDate: start.toISOString().split('T')[0], 
      endDate: end.toISOString().split('T')[0] 
    };
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    fetchBookings();
  }, [dateFilterType, customStartDate, customEndDate, statusFilter]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(dateFilterType);
      
      const query = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        status: statusFilter
      });

      const res = await fetch(`/api/admin/bookings?${query.toString()}`);
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memuat data");
      setBookings(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "completed" | "cancelled", customerName: string) => {
    const actionName = newStatus === "completed" ? "menyelesaikan" : "membatalkan";
    if (!confirm(`Apakah Anda yakin ingin ${actionName} pesanan dari ${customerName}?`)) {
      return;
    }

    setProcessingId(id);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memperbarui status");
      
      showToast(`Status berhasil diubah menjadi ${newStatus}`, "success");
      fetchBookings();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setProcessingId(null);
    }
  };

  const formatRupiah = (number: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number);
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Confirmed</span>;
      case 'completed': return <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Completed</span>;
      case 'cancelled': return <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Cancelled</span>;
      default: return null;
    }
  };

  return (
    <main className="min-h-screen bg-background text-accent pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl border text-sm shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-top-4 fade-in duration-300
          ${toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
          <span className="text-lg">{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto relative z-10 px-4">
        {/* Header */}
        <header className="py-8">
          <div className="flex items-center gap-2 mb-1">
             <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring <span className="text-primary">Bookings</span></h1>
          <p className="text-neutral-400 text-sm mt-1">Pantau jadwal harian dan kelola pemesanan yang masuk.</p>
        </header>

        {/* Filter Bar */}
        <div className="glass p-4 rounded-2xl border border-neutral-800/50 mb-8 flex flex-col sm:flex-row gap-4">
           <div className="flex-1">
             <label className="block text-xs font-medium text-neutral-400 mb-1">Periode</label>
             <select 
               value={dateFilterType}
               onChange={(e) => setDateFilterType(e.target.value as any)}
               className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
             >
               <option value="today">Hari Ini</option>
               <option value="this_week">Minggu Ini</option>
               <option value="this_month">Bulan Ini</option>
               <option value="custom">Kustom (Pilih Tanggal)</option>
             </select>
             
             {/* Form Kustom Tanggal (Muncul hanya jika memilih 'Custom') */}
             {dateFilterType === "custom" && (
                <div className="flex gap-2 mt-2 animate-in slide-in-from-top-2">
                  <input 
                    type="date" 
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary calendar-picker-dark"
                  />
                  <span className="text-neutral-500 self-center">-</span>
                  <input 
                    type="date" 
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary calendar-picker-dark"
                  />
                </div>
             )}
           </div>
           
           <div className="flex-1">
             <label className="block text-xs font-medium text-neutral-400 mb-1">Status</label>
             <select 
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value)}
               className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
             >
               <option value="all">Semua Status</option>
               <option value="confirmed">Menunggu (Confirmed)</option>
               <option value="completed">Selesai (Completed)</option>
               <option value="cancelled">Dibatalkan (Cancelled)</option>
             </select>
           </div>
           
           <div className="flex items-start mt-5">
              <button 
                onClick={fetchBookings}
                className="w-full sm:w-auto px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all border border-neutral-700 flex items-center justify-center gap-2"
              >
                🔄 Segarkan
              </button>
           </div>
        </div>

        {/* Table / List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-neutral-500 text-sm animate-pulse tracking-wider">Memuat Jadwal...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="glass p-12 rounded-3xl border border-neutral-800/50 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center text-4xl mb-4 border border-neutral-800 text-neutral-600">
              📅
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Tidak ada jadwal</h3>
            <p className="text-neutral-400 text-sm max-w-sm">
              Belum ada pelanggan yang memesan layanan pada tanggal atau filter tersebut.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const customerName = booking.users?.name || "Pelanggan Tanpa Nama";
              const serviceName = booking.services?.name ? booking.services.name.replace('BARBER | ', '').replace('HOME | ', '') : "Layanan Terhapus";
              
              return (
                <div key={booking.id} className={`glass p-5 rounded-2xl border border-neutral-800/50 flex flex-col md:flex-row gap-5 transition-all ${booking.status === 'cancelled' ? 'opacity-60 grayscale' : ''}`}>
                  
                  {/* Waktu & Tipe */}
                  <div className="flex-shrink-0 flex flex-col md:w-32 items-start md:items-center text-left md:text-center md:border-r border-neutral-800/50 pr-4">
                     <span className="text-xs text-neutral-400 font-semibold mb-1">
                       {new Date(booking.start_time).toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' })}
                     </span>
                     <span className="text-primary font-bold text-2xl tracking-tighter">{formatTime(booking.start_time)}</span>
                     <span className="text-xs text-neutral-500 mb-2">s/d {formatTime(booking.end_time)}</span>
                     {booking.service_type === 'home' ? (
                       <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mt-auto">HOME SERVICE</span>
                     ) : (
                       <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mt-auto">BARBERSHOP</span>
                     )}
                  </div>

                  {/* Info Pelanggan & Layanan */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">Pelanggan</p>
                      <p className="font-bold text-lg">{customerName}</p>
                      <p className="text-sm text-neutral-400 font-mono mt-0.5">📞 {booking.users?.phone_number}</p>
                      {booking.service_type === 'home' && (
                        <p className="text-xs text-neutral-400 mt-2 p-2 bg-neutral-900/50 rounded-lg border border-neutral-800/50 inline-block line-clamp-2" title={booking.customer_address || ""}>
                          📍 {booking.customer_address || "Alamat tidak disertakan"}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">Detail Layanan</p>
                      <p className="font-medium text-neutral-200">{serviceName}</p>
                      <p className="text-primary font-mono text-sm mt-0.5">{booking.services?.price ? formatRupiah(booking.services.price) : '-'}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                        <span>💈 Kapster:</span>
                        <span className="font-medium text-neutral-200">{booking.barbers?.name || "-"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Aksi & Status */}
                  <div className="flex-shrink-0 flex flex-col items-start md:items-end justify-between md:pl-4 border-t md:border-t-0 border-neutral-800/50 pt-4 md:pt-0">
                    <div className="mb-4">
                      {getStatusBadge(booking.status)}
                    </div>

                    {booking.status === 'confirmed' && (
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={() => handleUpdateStatus(booking.id, "cancelled", customerName)}
                          disabled={processingId === booking.id}
                          className="flex-1 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-medium transition-colors border border-red-500/20 flex items-center justify-center"
                        >
                          Batal
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(booking.id, "completed", customerName)}
                          disabled={processingId === booking.id}
                          className="flex-1 px-3 py-2 bg-green-500 hover:bg-green-400 text-neutral-950 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-green-500/10 flex items-center justify-center"
                        >
                          {processingId === booking.id ? "..." : "Selesai"}
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
