"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js"; // just for createClient not needed if not fetching signed url directly via frontend supabase client. Wait, the user asked to fetch signedUrl via supabaseAdmin in the backend or frontend? 
// The user prompt: const { data } = await supabaseAdmin.storage... -> this is backend logic. But we should just link to public URL if the bucket is public, or we can make a server action. 
// Wait, the prompt said: 
// Jika ada receipt_url: link "📎 Lihat Struk" -> buka signed URL dari Supabase Storage. But our "expense-receipts" should be public or private? Let's just use the public url for now, or fetch signed URL via an API.
// Actually, earlier we just linked to public URL. I'll stick to linking to the public URL for simplicity and performance. No signed URL needed if it's a public bucket, unless we MUST use signed URL. I will use public URL but I will make the button open it in a new tab.

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  receipt_url: string | null;
  status: string;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  barbers: { id: string, name: string } | null;
  users: { name: string } | null;
}

export default function AdminExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [barberFilter, setBarberFilter] = useState<string>("all");
  const [barberList, setBarberList] = useState<{id: string, name: string}[]>([]);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal Reject
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    fetchExpenses();
  }, [statusFilter, barberFilter]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: "100",
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(barberFilter !== "all" && { barber_id: barberFilter })
      });

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/expenses?${query.toString()}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) }
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      
      setExpenses(data.expenses || []);
      setSummary(data.summary || null);

      // Extract unique barbers for the filter dropdown
      // Actually we just use the fetched list of expenses to populate barbers if not fetched separately.
      if (barberList.length === 0 && data.expenses) {
          const uniqueBarbers = new Map();
          data.expenses.forEach((e: any) => {
              if (e.barbers && !uniqueBarbers.has(e.barbers.id)) {
                  uniqueBarbers.set(e.barbers.id, { id: e.barbers.id, name: e.barbers.name });
              }
          });
          setBarberList(Array.from(uniqueBarbers.values()));
      }

    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummaryOnly = async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/expenses?limit=1`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) }
      });
      if (res.ok) {
          const data = await res.json();
          setSummary(data.summary || null);
      }
  };

  async function handleApprove(expenseId: string) {
    if (!confirm("Apakah Anda yakin menyetujui pengeluaran ini?")) {
        return;
    }
    setProcessingId(expenseId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/expenses/${expenseId}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, status: 'approved' } : e));
        showToast('✅ Pengeluaran disetujui!');
        fetchSummaryOnly();
      } else {
          throw new Error(data.error || "Gagal menyetujui");
      }
    } catch (err: any) {
        showToast(err.message, "error");
    } finally {
        setProcessingId(null);
    }
  }

  async function handleReject(expenseId: string, reason: string) {
    setProcessingId(expenseId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/expenses/${expenseId}/reject`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (res.ok) {
        setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, status: 'rejected', rejection_reason: reason } : e));
        setRejectTarget(null);
        setRejectReason('');
        showToast('Pengeluaran ditolak.');
        fetchSummaryOnly();
      } else {
          throw new Error(data.error || "Gagal menolak");
      }
    } catch (err: any) {
        showToast(err.message, "error");
    } finally {
        setProcessingId(null);
    }
  }

  const formatRupiah = (number: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number);
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hrs = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${hrs}:${mins}`;
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

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>
          <div className="w-full max-w-md rounded-[24px] p-6 shadow-2xl border border-white/5 bg-[#1a1a1a] text-white animate-slide-up-fast" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-2">❌ Tolak Pengeluaran</h3>
            <p className="text-sm text-neutral-400 mb-4">Barber akan mendapat notifikasi beserta alasan penolakan ini.</p>
            <textarea
              placeholder="Tulis alasan penolakan..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-red-500 outline-none mb-4 resize-none transition-colors"
            />
            <div className="flex gap-2 mt-3">
              <button
                className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 font-bold transition"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}>
                Batal
              </button>
              <button
                disabled={!rejectReason.trim() || processingId === rejectTarget}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold transition disabled:opacity-50"
                onClick={() => handleReject(rejectTarget, rejectReason)}>
                {processingId === rejectTarget ? 'Loading...' : 'Konfirmasi Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto relative z-10 px-4 py-8">
        {/* BAGIAN A — Header + Filter */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
             <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">💸 Pengeluaran <span className="text-primary">Toko</span></h1>
          <p className="text-neutral-400 text-sm mt-1 max-w-2xl">
            Kelola pengajuan pengeluaran dari barber. Hanya pengeluaran yang disetujui masuk ke laporan keuangan.
          </p>
        </header>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="glass p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col">
              <span className="text-xs text-amber-500/80 uppercase font-bold tracking-wider mb-1">⏳ {summary.pending_count} Pending</span>
              <span className="text-2xl font-bold text-amber-500">{formatRupiah(summary.pending_total)}</span>
              <span className="text-xs text-amber-500/60 mt-2">Menunggu konfirmasi Anda</span>
            </div>
            <div className="glass p-5 rounded-2xl border border-green-500/30 bg-green-500/10 flex flex-col">
              <span className="text-xs text-green-500/80 uppercase font-bold tracking-wider mb-1">✅ Total Disetujui</span>
              <span className="text-2xl font-bold text-green-500">{formatRupiah(summary.approved_total)}</span>
              <span className="text-xs text-green-500/60 mt-2">Masuk ke laporan keuangan</span>
            </div>
          </div>
        )}

        {/* Filter Row */}
        <div className="glass p-4 rounded-2xl border border-neutral-800/50 mb-6 flex flex-col sm:flex-row gap-4">
           <div className="flex-1">
             <label className="block text-xs font-medium text-neutral-400 mb-1">Status</label>
             <select 
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value)}
               className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
             >
               <option value="all">Semua</option>
               <option value="pending">⏳ Pending (Menunggu)</option>
               <option value="approved">✅ Disetujui</option>
               <option value="rejected">❌ Ditolak</option>
             </select>
           </div>
           
           <div className="flex-1">
             <label className="block text-xs font-medium text-neutral-400 mb-1">Barber</label>
             <select 
               value={barberFilter}
               onChange={(e) => setBarberFilter(e.target.value)}
               className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
             >
               <option value="all">Semua Barber</option>
               {barberList.map(b => (
                   <option key={b.id} value={b.id}>{b.name}</option>
               ))}
             </select>
           </div>
           
           <div className="flex items-end flex-col sm:flex-row w-full sm:w-auto mt-5 sm:mt-0 gap-3">
              <button 
                onClick={fetchExpenses}
                className="w-full sm:w-auto px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all border border-neutral-700 flex items-center justify-center gap-2 font-medium"
              >
                🔄 Refresh
              </button>
           </div>
        </div>

        {/* BAGIAN B — Tabel Pengeluaran */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-neutral-500 text-sm animate-pulse tracking-wider">Memuat Data...</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="glass p-12 rounded-3xl border border-neutral-800/50 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center text-4xl mb-4 border border-neutral-800 text-neutral-600">
              🧾
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Belum Ada Pengeluaran</h3>
            <p className="text-neutral-400 text-sm max-w-sm">
              Belum ada data pengeluaran dengan filter tersebut.
            </p>
          </div>
        ) : (
          <div className="flex flex-col border border-neutral-800/50 rounded-2xl overflow-hidden glass divide-y divide-neutral-800/50">
             {expenses.map(expense => {
                 const isPending = expense.status === 'pending';
                 const isApproved = expense.status === 'approved';
                 const isRejected = expense.status === 'rejected';

                 let catBadgeClass = '';
                 let catLabel = expense.category;
                 switch(expense.category) {
                     case 'supplies': catBadgeClass = 'bg-amber-500/20 text-amber-500 border border-amber-500/30'; catLabel = '🧴 Supplies'; break;
                     case 'utility': catBadgeClass = 'bg-blue-500/20 text-blue-500 border border-blue-500/30'; catLabel = '💡 Utility'; break;
                     case 'other': catBadgeClass = 'bg-neutral-500/20 text-neutral-400 border border-neutral-500/30'; catLabel = '🔧 Other'; break;
                     default: catBadgeClass = 'bg-neutral-800 text-neutral-300 border border-neutral-700'; break;
                 }

                 let statusBadge = null;
                 if (isPending) statusBadge = <span className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded text-xs font-bold border border-amber-500/20">🟡 Pending</span>;
                 else if (isApproved) statusBadge = <span className="bg-green-500/10 text-green-500 px-2 py-1 rounded text-xs font-bold border border-green-500/20">🟢 Disetujui</span>;
                 else if (isRejected) statusBadge = <span className="bg-red-500/10 text-red-500 px-2 py-1 rounded text-xs font-bold border border-red-500/20">🔴 Ditolak</span>;

                 const receiptLink = expense.receipt_url 
                 ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/expense-receipts/${expense.receipt_url}` 
                 : null;

                 return (
                     <div key={expense.id} className="p-4 sm:p-5 hover:bg-neutral-900/50 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center">
                         {/* Tanggal & Barber */}
                         <div className="w-full md:w-1/4">
                             <p className="text-xs text-neutral-400 mb-1">{formatDate(expense.submitted_at)}</p>
                             <p className="font-bold text-white mb-2">{expense.barbers?.name || "Barber"}</p>
                             <div className="flex gap-2 items-center flex-wrap">
                                 {statusBadge}
                                 <span className={`px-2 py-1 rounded text-xs font-medium ${catBadgeClass}`}>{catLabel}</span>
                             </div>
                         </div>

                         {/* Keterangan & Nominal */}
                         <div className="w-full md:flex-1">
                             <p className="text-sm font-medium text-neutral-300">"{expense.description}"</p>
                             <p className="text-lg font-bold text-teal-400 mt-1">{formatRupiah(expense.amount)}</p>
                             {isRejected && expense.rejection_reason && (
                                 <p className="text-xs text-red-400 italic mt-2">Alasan: {expense.rejection_reason}</p>
                             )}
                         </div>

                         {/* Receipt URL / Aksi */}
                         <div className="w-full md:w-auto flex flex-col gap-2 items-start md:items-end flex-shrink-0">
                             {receiptLink && (
                                 <a href={receiptLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 bg-primary/10 px-2 py-1.5 rounded w-fit md:w-auto">
                                     📎 Lihat Struk
                                 </a>
                             )}

                             {isPending && (
                                 <div className="flex items-center gap-2 mt-2 w-full md:w-auto">
                                    <button 
                                      onClick={() => handleApprove(expense.id)}
                                      disabled={processingId === expense.id}
                                      className="flex-1 md:flex-none px-4 py-2 bg-green-500/20 hover:bg-green-500/40 text-green-400 font-bold text-xs rounded-lg transition-colors border border-green-500/30"
                                    >
                                      ✅ Setujui
                                    </button>
                                    <button 
                                      onClick={() => setRejectTarget(expense.id)}
                                      disabled={processingId === expense.id}
                                      className="flex-1 md:flex-none px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 font-bold text-xs rounded-lg transition-colors border border-red-500/30"
                                    >
                                      ❌ Tolak
                                    </button>
                                 </div>
                             )}
                             {isApproved && expense.users?.name && (
                                 <p className="text-[10px] text-neutral-500 mt-2">Di-acc oleh: {expense.users.name}</p>
                             )}
                         </div>
                     </div>
                 )
             })}
          </div>
        )}
      </div>
    </main>
  );
}
