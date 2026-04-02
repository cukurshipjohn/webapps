"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface FollowUp {
    id: string;
    tenant_id: string;
    case_type: string;
    channel: string;
    message_sent: string | null;
    outcome: string;
    scheduled_at: string | null;
    done_at: string | null;
    created_at: string;
    owner_phone: string | null;
    tenants: {
        shop_name: string;
        slug: string;
    };
}

const OUTCOME_OPTIONS = [
    { value: 'pending', label: 'Pending (Menunggu Respon)' },
    { value: 'interested', label: 'Tertarik / Sedang Pikir' },
    { value: 'renewed', label: 'Berhasil Extend/Renew' },
    { value: 'upgraded', label: 'Berhasil Upgrade Plan' },
    { value: 'no_response', label: 'Tidak Ada Respon (Kacang)' },
    { value: 'churned_confirmed', label: 'Tutup / Churn Fix' },
    { value: 'not_applicable', label: 'Tidak Relevan' },
];

function Toast({ msg, isError, onClose }: { msg: string, isError?: boolean, onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);
    return (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 transition-all animate-fade-in-up ${isError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
            <span className="text-lg">{isError ? '❌' : '✅'}</span>
            <p className="font-medium text-sm">{msg}</p>
        </div>
    );
}

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id";

export default function FollowupsPage() {
    const router = useRouter();
    
    // States
    const [logs, setLogs] = useState<FollowUp[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [toast, setToast] = useState<{msg: string, isError?: boolean} | null>(null);

    // Filter states
    const [filterCaseType, setFilterCaseType] = useState("");
    const [filterOutcome, setFilterOutcome] = useState("");

    // Auth
    const getToken = () => window.localStorage.getItem("superadmin_token");

    // Fetch
    const loadLogs = useCallback(async () => {
        const token = getToken();
        if (!token) { router.push("/superadmin/login"); return; }
        
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (filterCaseType) params.append("case_type", filterCaseType);
            if (filterOutcome) params.append("outcome", filterOutcome);

            const res = await fetch(`/api/superadmin/followups?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) { router.push("/superadmin/login"); return; }
            if (!res.ok) throw new Error("Gagal mengambil data follow-up");
            
            const data = await res.json();
            setLogs(data.data || []);
        } catch (err: any) {
            setError(err.message || "Terjadi kesalahan sistem");
        } finally {
            setLoading(false);
        }
    }, [router, filterCaseType, filterOutcome]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const showToast = (msg: string, isError = false) => setToast({ msg, isError });

    const updateOutcome = async (id: string, newOutcome: string) => {
        const token = getToken();
        if (!token) return;
        
        try {
            // Kita belum implementasi PATCH di route handler, tapi instruksi architecture.md
            // mengatakan route PATCH akan diimplementasi di `/api/superadmin/followups/[id]`.
            // Kita akan asumsikan kita punya backend untuk update (atau bisa menggunakan method PATCH ke route utama)
            // Untuk sementara kita jalankan PATCH call
            const res = await fetch(`/api/superadmin/followups/${id}`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ outcome: newOutcome })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || "Gagal update status");
            }
            
            showToast("✅ Outcome berhasil diperbarui");
            loadLogs();
        } catch (err: any) {
            showToast(err.message, true);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Riwayat Follow-up</h1>
                <p className="text-neutral-500 text-sm mt-1">Lacak semua aktivitas CRM, konversi renewal, dan catatan komunikasi.</p>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800">
                <div className="flex-1">
                    <label className="text-xs font-semibold text-neutral-400 block mb-1">Filter Kasus</label>
                    <select value={filterCaseType} onChange={e => setFilterCaseType(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50">
                        <option value="">Semua Kasus (Case Type)</option>
                        <option value="renewal_reminder">Renewal Reminder</option>
                        <option value="usage_coaching">Usage Coaching (Dormant)</option>
                        <option value="churn_prevention">Churn Prevention</option>
                        <option value="upgrade_offer">Upgrade Offer</option>
                        <option value="general">Lainnya (General)</option>
                    </select>
                </div>
                <div className="flex-1">
                    <label className="text-xs font-semibold text-neutral-400 block mb-1">Filter Status (Outcome)</label>
                    <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50">
                        <option value="">Semua Status</option>
                        <option value="pending">Pending</option>
                        <option value="interested">Tertarik</option>
                        <option value="renewed">Renewed</option>
                        <option value="churned_confirmed">Churn (Cancel)</option>
                        <option value="no_response">Tak Ada Respon</option>
                    </select>
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-x-auto min-h-[400px]">
                {loading ? (
                    <div className="w-full p-10 space-y-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-neutral-800/50 rounded-lg animate-pulse" />)}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-20 text-neutral-600">
                        <p className="text-4xl mb-3">📭</p>
                        <p>Belum ada riwayat follow-up yang tercatat.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800 text-left">
                                <th className="px-5 py-4 text-neutral-500 font-medium">Waktu</th>
                                <th className="px-5 py-4 text-neutral-500 font-medium">Toko & Kontak</th>
                                <th className="px-5 py-4 text-neutral-500 font-medium">Kasus & Channel</th>
                                <th className="px-5 py-4 text-neutral-500 font-medium">Log Interaksi</th>
                                <th className="px-5 py-4 text-neutral-500 font-medium">Outcome Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => {
                                const isPending = log.outcome === 'pending';
                                return (
                                    <tr key={log.id} className="border-b border-neutral-800/40 hover:bg-neutral-800/30 transition-colors">
                                        {/* Kolom 1: Waktu */}
                                        <td className="px-5 py-4 align-top">
                                            <p className="text-white whitespace-nowrap">{new Date(log.created_at).toLocaleDateString('id-ID')}</p>
                                            <p className="text-xs text-neutral-500 mb-2">{new Date(log.created_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</p>
                                            
                                            {log.scheduled_at && (
                                                <span className="inline-block mt-2 px-2 py-0.5 border border-amber-500/20 bg-amber-500/10 text-amber-500 text-[10px] rounded uppercase font-medium">
                                                    Dijadwalkan: {new Date(log.scheduled_at).toLocaleDateString('id-ID')}
                                                </span>
                                            )}
                                        </td>

                                        {/* Kolom 2: Toko */}
                                        <td className="px-5 py-4 align-top">
                                            <p className="text-white font-semibold">{log.tenants?.shop_name || "Unknown Shop"}</p>
                                            <a href={`https://${log.tenants?.slug}.${APP_DOMAIN}`} target="_blank" rel="noopener text-xs font-mono text-cyan-600 hover:text-cyan-400">
                                                {log.tenants?.slug}
                                            </a>
                                            {log.owner_phone && (
                                                <div className="flex gap-2 items-center mt-2 group">
                                                    <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded">📞 {log.owner_phone}</span>
                                                    <a href={`https://wa.me/${log.owner_phone.replace(/\D/g, '')}?text=Halo`} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 bg-green-500 rounded-full text-white text-[10px]" title="Chat WA Langsung">💬</a>
                                                </div>
                                            )}
                                        </td>

                                        {/* Kolom 3: Type */}
                                        <td className="px-5 py-4 align-top leading-relaxed">
                                            <span className="inline-block mb-1 text-xs px-2 py-0.5 rounded border border-neutral-700 text-neutral-300 font-medium capitalize">
                                                {log.case_type.replace('_', ' ')}
                                            </span>
                                            <div className="text-xs text-neutral-500 flex items-center gap-1.5 mt-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                                                Via <b>{log.channel.replace('_', ' ')}</b>
                                            </div>
                                        </td>

                                        {/* Kolom 4: Note */}
                                        <td className="px-5 py-4 align-top max-w-sm">
                                            <div className="bg-neutral-900/80 p-3 outline outline-1 outline-neutral-800 rounded-lg text-sm text-neutral-300">
                                                {log.message_sent ? (
                                                    <span className="whitespace-pre-wrap leading-tight">{log.message_sent}</span>
                                                ) : <span className="text-neutral-600 italic">Tidak ada catatan pesan dilampirkan.</span>}
                                            </div>
                                        </td>

                                        {/* Kolom 5: Outcome Override */}
                                        <td className="px-5 py-4 align-top">
                                            <div className={`relative rounded-xl border p-1 
                                                ${isPending ? 'border-amber-500/30 bg-amber-500/5' : 
                                                log.outcome.includes('renewed') || log.outcome.includes('upgraded') ? 'border-green-500/30 bg-green-500/5' : 
                                                log.outcome.includes('churned') ? 'border-red-500/30 bg-red-500/5' : 
                                                'border-neutral-700 bg-neutral-900'}
                                            `}>
                                                <select 
                                                    value={log.outcome} 
                                                    onChange={e => updateOutcome(log.id, e.target.value)}
                                                    className={`w-full text-xs bg-transparent focus:outline-none appearance-none font-medium px-2 py-1.5 cursor-pointer 
                                                        ${isPending ? 'text-amber-400' : 
                                                        log.outcome.includes('renewed') || log.outcome.includes('upgraded') ? 'text-green-400' : 
                                                        log.outcome.includes('churned') ? 'text-red-400' : 
                                                        'text-neutral-400'}
                                                    `}
                                                >
                                                    {OUTCOME_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value} className="text-neutral-900 bg-white">
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {/* Arrow down icon manual karena default dihide */}
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">▼</div>
                                            </div>

                                            {log.done_at && (
                                                <p className="text-[10px] text-neutral-500 mt-2 pl-1">
                                                    Updated: {new Date(log.done_at).toLocaleDateString('id-ID')}
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
