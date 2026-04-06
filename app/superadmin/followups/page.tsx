"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

interface FollowUpItem {
    id: string;
    case_type: string;
    channel: string;
    note: string | null;
    outcome: string;
    scheduled_at: string | null;
    done_at: string | null;
    created_at: string;
    updated_at: string;
    tenants?: { id: string; name: string; slug: string };
    users?: { name: string }; // Admin yang merekam
}

function MiniKPI({ label, value, color = 'default' }: { label: string, value: string | number, color?: 'default' | 'success' | 'error' | 'primary' }) {
    const colorClasses = {
        default: "text-white",
        success: "text-green-500",
        error: "text-red-500",
        primary: "text-cyan-400"
    };

    const bgHighlight = {
        default: "bg-neutral-800 border-neutral-700",
        success: "bg-green-500/10 border-green-500/30",
        error: "bg-red-500/10 border-red-500/30",
        primary: "bg-cyan-500/10 border-cyan-500/30"
    };

    return (
        <div className={`p-4 rounded-xl border ${bgHighlight[color]}`}>
            <p className="text-xs text-neutral-400 font-medium tracking-wide mb-1 opacity-80">{label}</p>
            <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
        </div>
    );
}

export default function SuperadminFollowUps() {
    const router = useRouter();
    const [followups, setFollowups] = useState<FollowUpItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const PER_PAGE = 20;

    // Filter states
    const [filterCase, setFilterCase] = useState("");
    const [filterOutcome, setFilterOutcome] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const getToken = useCallback(() => localStorage.getItem("superadmin_token"), []);

    const fetchHistory = useCallback(async () => {
        const token = getToken();
        if(!token) { router.push("/superadmin/login"); return; }
        setLoading(true);
        try {
            const params = new URLSearchParams();
            // Fetch relatively large dataset for KPI processing and pagination
            params.set("limit", "500");
            if(filterCase) params.set("case_type", filterCase);
            if(filterOutcome) params.set("outcome", filterOutcome);
            if(dateFrom) params.set("start_date", dateFrom);
            if(dateTo) params.set("end_date", dateTo);

            const res = await fetch(`/api/superadmin/followups?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const data = await res.json();
            setFollowups(data.data || []);
            setPage(1); // reset pagination when fetching
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [getToken, router, filterCase, filterOutcome, dateFrom, dateTo]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const resetFilters = () => {
        setFilterCase("");
        setFilterOutcome("");
        setDateFrom("");
        setDateTo("");
    }

    // Process Stats
    const stats = useMemo(() => {
        const total = followups.length;
        const renewed = followups.filter(f => f.outcome === 'renewed' || f.outcome === 'upgraded').length;
        const churned = followups.filter(f => f.outcome === 'churned_confirmed').length;
        const conversionRate = total > 0 ? ((renewed / total) * 100).toFixed(1) : 0;
        return { total, renewed, churned, conversionRate };
    }, [followups]);

    // Pagination slice
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * PER_PAGE;
        return followups.slice(start, start + PER_PAGE);
    }, [followups, page]);

    const totalPages = Math.ceil(followups.length / PER_PAGE);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Riwayat Follow-Up</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Histori interaksi komunikasi, pencatatan hasil, dan pelacakan komitmen tenant.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="bg-[#071120] p-4 rounded-2xl border border-cyan-900/30 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mb-2 block">Tipe Validasi</label>
                    <select value={filterCase} onChange={(e) => setFilterCase(e.target.value)} 
                        className="w-full bg-[#0a1526] border border-cyan-900/40 text-white text-sm rounded-lg px-3 py-2 focus:border-cyan-500 focus:outline-none">
                        <option value="">Semua Tipe</option>
                        <option value="renewal">Renewal (Perpanjangan)</option>
                        <option value="usage_check">Cek Aktivitas Pasif</option>
                        <option value="churn">Konfirmasi Churn</option>
                        <option value="upgrade_offer">Penawaran Upgrade</option>
                        <option value="onboarding">Onboarding Awal</option>
                        <option value="custom">Catatan Custom</option>
                    </select>
                </div>
                
                <div className="flex-1 min-w-[200px]">
                    <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mb-2 block">Capaian (Outcome)</label>
                    <select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)} 
                        className="w-full bg-[#0a1526] border border-cyan-900/40 text-white text-sm rounded-lg px-3 py-2 focus:border-cyan-500 focus:outline-none">
                        <option value="">Semua Capaian</option>
                        <option value="pending">Pending</option>
                        <option value="renewed">Berhasil Perpanjang</option>
                        <option value="upgraded">Berhasil Upgrade</option>
                        <option value="interested">Tertarik (Interested)</option>
                        <option value="churned_confirmed">Churn Terkonfirmasi</option>
                        <option value="no_response">Tak Ada Respons</option>
                        <option value="resolved">Terselesaikan (Lainnya)</option>
                    </select>
                </div>

                <div>
                    <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mb-2 block">Mulai Tanggal</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="w-full bg-[#0a1526] border border-cyan-900/40 text-white text-sm rounded-lg px-3 py-2 focus:border-cyan-500 focus:outline-shadow" />
                </div>
                
                <div>
                    <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mb-2 block">Akhir Tanggal</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="w-full bg-[#0a1526] border border-cyan-900/40 text-white text-sm rounded-lg px-3 py-2 focus:border-cyan-500 focus:outline-shadow" />
                </div>

                <div className="flex pb-0.5 mt-2 lg:mt-0">
                    <button onClick={resetFilters}
                        className="px-4 py-2 border border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-lg text-sm transition-all font-medium whitespace-nowrap">
                        ↺ Reset
                    </button>
                    <button onClick={fetchHistory} title="Refresh API Data"
                        className="ml-2 px-3 py-2 bg-cyan-600/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition-all flex items-center justify-center">
                        🔄
                    </button>
                </div>
            </div>

            {/* Statistik Ringkas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MiniKPI label="TOTAL FOLLOW-UP" value={stats.total} />
                <MiniKPI label="BERHASIL PERPANJANG" value={stats.renewed} color="success" />
                <MiniKPI label="CHURN TERKONFIRMASI" value={stats.churned} color="error" />
                <MiniKPI label="CONVERSION RATE" value={`${stats.conversionRate}%`} color="primary" />
            </div>

            {/* Layout Table */}
            <div className="bg-[#071120] border border-cyan-900/30 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto min-h-[400px]">
                    {loading ? (
                       <div className="flex items-center justify-center py-20 text-cyan-500">
                           <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                       </div>
                    ) : followups.length === 0 ? (
                        <div className="text-center py-24 text-neutral-500">
                           <span className="text-4xl block mb-4">📭</span>
                           <p>Belum ada riwayat temuan log / aktivitas.</p>
                       </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#0a1526] text-neutral-400">
                                <tr className="border-b border-cyan-900/40">
                                    <th className="px-5 py-3 font-medium">Tenant</th>
                                    <th className="px-5 py-3 font-medium">Tipe Pelaporan</th>
                                    <th className="px-5 py-3 font-medium">Channel</th>
                                    <th className="px-5 py-3 font-medium max-w-[200px]">Catatan Eksekutor</th>
                                    <th className="px-5 py-3 font-medium">Outcome Hasil</th>
                                    <th className="px-5 py-3 font-medium text-right">Penjadwalan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedItems.map((item) => {
                                    const cDate = new Date(item.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
                                    const dDate = item.done_at ? new Date(item.done_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "—";
                                    
                                    const outcomeStyles: any = {
                                        pending: "bg-neutral-800 text-neutral-400 border-neutral-700",
                                        renewed: "bg-green-500/10 text-green-400 border-green-500/30",
                                        upgraded: "bg-green-500/10 text-green-400 border-green-500/30",
                                        interested: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                                        churned_confirmed: "bg-rose-500/10 text-rose-500 border-rose-500/30",
                                        no_response: "bg-amber-500/10 text-amber-500 border-amber-500/30",
                                        resolved: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
                                    };
                                    
                                    const truncateText = (str: string, len: number) => {
                                        if(!str) return <em className="text-neutral-600">Tidak ada</em>;
                                        return str.length > len ? str.substring(0, len) + "..." : str;
                                    }

                                    return (
                                        <tr key={item.id} className="border-b border-cyan-900/20 hover:bg-white/5 transition-colors group">
                                            <td className="px-5 py-4">
                                                <p className="text-white font-bold mb-0.5">{item.tenants?.name || 'Tenant Dihapus'}</p>
                                                {item.tenants?.slug && (
                                                    <span className="text-[10px] text-cyan-400/50 bg-cyan-900/20 px-2 py-0.5 rounded-full font-mono">
                                                        {item.tenants?.slug}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#0a1526] border border-cyan-900/50 rounded-lg">
                                                    <span className="text-xs uppercase font-bold text-cyan-400/80">{item.case_type.replace('_', ' ')}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-xs font-mono text-neutral-400">
                                                {item.channel}
                                            </td>
                                            <td className="px-5 py-4 max-w-[200px]" title={item.note || ''}>
                                                <p className="text-xs text-neutral-300 truncate">
                                                    {truncateText(item.note || '', 80)}
                                                </p>
                                                <p className="text-[10px] text-neutral-500 mt-1">oleh {item.users?.name || 'Admin'}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`text-[10px] px-2.5 py-1 font-bold uppercase rounded-lg border ${outcomeStyles[item.outcome] || outcomeStyles.pending}`}>
                                                    {item.outcome}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <p className="text-xs text-neutral-300">Buat: {cDate}</p>
                                                <p className="text-[11px] text-neutral-500 mt-0.5">Selesai: {dDate}</p>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination (Client-side over loaded items) */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-4 border-t border-cyan-900/30 bg-[#0a1526]">
                        <p className="text-xs text-neutral-500">
                            Menampilkan data {(page-1)*PER_PAGE + 1} s.d. {Math.min(page*PER_PAGE, followups.length)} dari {followups.length}
                        </p>
                        <div className="flex gap-2">
                            <button 
                                disabled={page === 1} onClick={() => setPage(p => p - 1)}
                                className="px-3 py-1 text-xs border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent">
                                Mundur
                            </button>
                            <span className="px-3 py-1 text-xs flex items-center font-bold text-cyan-400 bg-cyan-900/20 rounded">
                                {page}
                            </span>
                            <button 
                                disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                                className="px-3 py-1 text-xs border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent">
                                Maju
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
