"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TimeOff {
  id: string;
  tenant_id: string;
  barber_id: string | null;
  start_date: string;
  end_date: string;
  description: string;
  created_at: string;
  barbers?: { name: string } | null;
}

interface Barber {
  id: string;
  name: string;
}

export default function TimeOffPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [timeOffList, setTimeOffList] = useState<TimeOff[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  
  // States for matching dates
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedBarber, setSelectedBarber] = useState<string | "ALL">("ALL");
  const [description, setDescription] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    try {
      // Fetch Time Offs
      const res = await fetch("/api/admin/time-off");
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memuat jadwal libur");
      setTimeOffList(data);

      // Fetch Barbers for dropdown
      const barberRes = await fetch("/api/admin/barbers");
      const barberData = await barberRes.json();
      if (barberRes.ok) {
           setBarbers(barberData);
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
        showToast("Mohon lengkapi tanggal mulai dan selesai.", "error");
        return;
    }
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            start_date: startDate,
            end_date: endDate,
            barber_id: selectedBarber === "ALL" ? null : selectedBarber,
            description
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      showToast("Jadwal libur berhasil ditambahkan!", "success");
      
      // Reset form & Refresh data
      setStartDate("");
      setEndDate("");
      setSelectedBarber("ALL");
      setDescription("");
      fetchData();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Apakah Anda yakin ingin menghapus jadwal libur ini?")) return;
      
      try {
          const res = await fetch(`/api/admin/time-off?id=${id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message);
          
          showToast("Jadwal libur dihapus.", "success");
          fetchData();
      } catch (err: any) {
          showToast(err.message, "error");
      }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-accent)] pb-24 relative">
       {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl border text-sm shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-top-4 fade-in duration-300
          ${toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
          <span className="text-lg">{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8 relative z-10">
        <header className="mb-8 border-b border-neutral-800/60 pb-6">
          <Link href="/admin/settings" className="text-[var(--color-primary)] hover:underline text-sm font-medium mb-4 inline-block">
            ← Kembali ke Pengaturan Toko
          </Link>
          <div className="flex items-center gap-2 mb-1">
             <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Manajemen <span className="text-[var(--color-primary)]">Libur & Cuti</span></h1>
          <p className="text-neutral-400 text-sm mt-1">Blokir tanggal tertentu agar pelanggan tidak bisa melakukan booking.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            
            {/* FORM TAMBAH LIBUR/CUTI */}
            <div className="md:col-span-4 space-y-6">
                <div className="glass p-6 rounded-3xl border border-neutral-800/50">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                        <span>🏖️</span> Tambah Jadwal Libur
                    </h2>
                    
                    <form onSubmit={handleAddSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-neutral-400 uppercase">Pilih Kapster / Toko</label>
                            <select 
                                value={selectedBarber} 
                                onChange={(e) => setSelectedBarber(e.target.value)}
                                className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] appearance-none"
                            >
                                <option value="ALL">🏢 Seluruh Toko Tutup</option>
                                {barbers.map(b => (
                                    <option key={b.id} value={b.id}>🧑 {b.name} (Cuti)</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-neutral-400 uppercase">Tgl Mulai</label>
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)}
                                    min={new Date().toISOString().split("T")[0]}
                                    className="w-full bg-black/40 border border-neutral-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] color-scheme-dark" 
                                    required 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-neutral-400 uppercase">Tgl Selesai</label>
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={(e) => setEndDate(e.target.value)}
                                    min={startDate || new Date().toISOString().split("T")[0]}
                                    className="w-full bg-black/40 border border-neutral-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] color-scheme-dark" 
                                    required 
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-neutral-400 uppercase">Keterangan (Opsional)</label>
                            <input 
                                type="text" 
                                placeholder="Misal: Libur Idul Fitri"
                                value={description} 
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)]" 
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={submitting}
                            className="w-full py-3.5 btn-primary text-background font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 mt-2"
                        >
                            {submitting ? "Menambahkan..." : "Tambah Jadwal"}
                        </button>
                    </form>
                </div>
            </div>

            {/* DAFTAR LIBUR/CUTI */}
            <div className="md:col-span-8">
                <div className="glass p-6 md:p-8 rounded-3xl border border-[var(--color-primary)]/10">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                        Daftar Hari Libur & Cuti
                    </h2>

                    {timeOffList.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl bg-black/20 text-neutral-500">
                            <span className="text-4xl block mb-2">🌴</span>
                            <p>Belum ada jadwal libur atau cuti yang terdaftar.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {timeOffList.map((item) => {
                                const isShopHoliday = item.barber_id === null;
                                return (
                                    <div key={item.id} className="p-4 bg-neutral-900/40 border border-neutral-800 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all hover:border-neutral-600">
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${isShopHoliday ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                                {isShopHoliday ? '🏢' : '🧑'}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white flex items-center gap-2">
                                                    {isShopHoliday ? 'Libur Toko Menyeluruh' : `Cuti: ${item.barbers?.name || 'Kapster'}`}
                                                    {isShopHoliday && <span className="text-[9px] bg-red-500/20 text-red-500 uppercase px-2 py-0.5 rounded tracking-wider">Toko Tutup</span>}
                                                </h3>
                                                <div className="text-xs text-neutral-400 mt-1 flex flex-col sm:flex-row gap-1 sm:gap-3">
                                                    <span className="font-mono bg-black/40 px-2 py-1 rounded">
                                                        {new Date(item.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} 
                                                        {" - "} 
                                                        {new Date(item.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                    {item.description && <span className="pt-1 italic">"{item.description}"</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(item.id)}
                                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-xs font-bold transition-colors shrink-0"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

        </div>
      </div>
    </main>
  );
}
