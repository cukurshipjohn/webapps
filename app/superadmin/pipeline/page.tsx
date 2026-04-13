"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface TenantPipelineItem {
  id: string;
  shop_name: string;   // Nama toko (bukan 'name' — lihat skema tenants di DB)
  slug: string;
  plan: string;        // Nama paket (bukan 'plan_id' — lihat skema tenants di DB)
  plan_expires_at: string | null;
  timezone: string;
  stage: 'expiring_soon' | 'at_risk' | 'churned' | 'healthy';
  days_until_expiry: number | null;
  bookings_last_14_days: number;
  pending_followups: number;
  last_followup_at: string | null;
  users: {
    name: string;
    phone_number: string; // Kolom di tabel users bernama phone_number, bukan phone
  } | null;
  superadmin_followups: Array<{
    id: string;
    case_type: string;
    outcome: string;
    created_at: string;
    done_at: string | null;
  }>;
}

interface PipelineSummary {
  total: number;
  expiring_soon: number;
  at_risk: number;
  churned: number;
  healthy: number;
}

const APP_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id").replace(/^https?:\/\//, "");

// ==========================================
// KUMPULAN COMPONENTS (EmptyState, Skeleton)
// ==========================================

function EmptyState({ icon, title, description }: { icon: string, title: string, description: string }) {
    return (
        <div className="text-center py-16 bg-[#071120] border border-cyan-900/30 rounded-2xl">
            <p className="text-4xl mb-4">{icon}</p>
            <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
            <p className="text-neutral-500 text-sm">{description}</p>
        </div>
    );
}

function PipelineTableSkeleton() {
    return (
        <div className="bg-[#071120] border border-cyan-900/30 rounded-2xl overflow-hidden p-6">
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4 animate-pulse">
                        <div className="h-10 bg-cyan-900/40 rounded w-1/4"></div>
                        <div className="h-10 bg-cyan-900/30 rounded w-1/4"></div>
                        <div className="h-10 bg-cyan-900/20 rounded w-1/2"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==========================================
// HALAMAN UTAMA: Pipeline
// ==========================================

export default function SuperadminPipeline() {
    const router = useRouter();
    const [tenants, setTenants] = useState<TenantPipelineItem[]>([]);
    const [summary, setSummary] = useState<PipelineSummary | null>(null);
    const [activeStage, setActiveStage] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [selectedTenant, setSelected] = useState<TenantPipelineItem | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [waModalOpen, setWAModalOpen] = useState(false);

    const getToken = useCallback(() => localStorage.getItem("superadmin_token"), []);

    const fetchPipeline = useCallback(async (stage: string) => {
        const token = getToken();
        if (!token) {
            router.push("/superadmin/login");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const url = stage === 'all'
                ? '/api/superadmin/pipeline'
                : `/api/superadmin/pipeline?stage=${stage}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            setTenants(json.data ?? []);
            if (json.summary) setSummary(json.summary);
        } catch (err: any) {
            setError(err.message || 'Gagal memuat data. Coba lagi.');
        } finally {
            setLoading(false);
        }
    }, [router, getToken]);

    useEffect(() => {
        fetchPipeline(activeStage);
    }, [activeStage, fetchPipeline]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Pipeline Tenant</h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Pantau dan follow-up tenant berdasarkan lifecycle langganan
                    </p>
                </div>
                <button
                    onClick={() => fetchPipeline(activeStage)}
                    className="text-sm text-neutral-500 hover:text-cyan-400 transition-colors"
                >
                    🔄 Refresh
                </button>
            </div>

            {/* Stage Cards */}
            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <button
                        onClick={() => setActiveStage(activeStage === 'expiring_soon' ? 'all' : 'expiring_soon')}
                        className={`p-4 rounded-xl border text-left transition-all backdrop-blur-sm
                            ${activeStage === 'expiring_soon'
                                ? 'border-amber-500/40 bg-amber-500/10'
                                : 'border-neutral-800 bg-[#071120] hover:bg-white/5'
                            }`}
                    >
                        <div className="text-2xl mb-1">⏰</div>
                        <div className="text-2xl font-bold text-white">{summary.expiring_soon}</div>
                        <div className="text-xs text-neutral-400 mt-1 font-medium">Habis ≤ 30 Hari</div>
                    </button>

                    <button
                        onClick={() => setActiveStage(activeStage === 'at_risk' ? 'all' : 'at_risk')}
                        className={`p-4 rounded-xl border text-left transition-all backdrop-blur-sm
                            ${activeStage === 'at_risk'
                                ? 'border-red-500/40 bg-red-500/10'
                                : 'border-neutral-800 bg-[#071120] hover:bg-white/5'
                            }`}
                    >
                        <div className="text-2xl mb-1">📉</div>
                        <div className="text-2xl font-bold text-white">{summary.at_risk}</div>
                        <div className="text-xs text-neutral-400 mt-1 font-medium">Tidak Aktif 14 Hari</div>
                    </button>

                    <button
                        onClick={() => setActiveStage(activeStage === 'churned' ? 'all' : 'churned')}
                        className={`p-4 rounded-xl border text-left transition-all backdrop-blur-sm
                            ${activeStage === 'churned'
                                ? 'border-rose-500/40 bg-rose-500/10'
                                : 'border-neutral-800 bg-[#071120] hover:bg-white/5'
                            }`}
                    >
                        <div className="text-2xl mb-1">💔</div>
                        <div className="text-2xl font-bold text-white">{summary.churned}</div>
                        <div className="text-xs text-neutral-400 mt-1 font-medium">Expired & Churned</div>
                    </button>

                    <button
                        onClick={() => setActiveStage(activeStage === 'healthy' ? 'all' : 'healthy')}
                        className={`p-4 rounded-xl border text-left transition-all backdrop-blur-sm
                            ${activeStage === 'healthy'
                                ? 'border-green-500/40 bg-green-500/10'
                                : 'border-neutral-800 bg-[#071120] hover:bg-white/5'
                            }`}
                    >
                        <div className="text-2xl mb-1">✅</div>
                        <div className="text-2xl font-bold text-white">{summary.healthy}</div>
                        <div className="text-xs text-neutral-400 mt-1 font-medium">Aktif & Sehat</div>
                    </button>
                </div>
            )}

            {/* Table / Loading / Error */}
            {loading && <PipelineTableSkeleton />}
            
            {error && !loading && (
                <div className="text-center py-16 bg-[#071120] border border-cyan-900/30 rounded-2xl">
                    <p className="text-neutral-500 mb-4">{error}</p>
                    <button 
                        onClick={() => fetchPipeline(activeStage)}
                        className="text-sm text-cyan-400 underline"
                    >
                        Coba Lagi
                    </button>
                </div>
            )}

            {!loading && !error && tenants.length === 0 && (
                <EmptyState
                    icon="🎉"
                    title="Tidak ada tenant di tahap ini"
                    description="Semua tenant lain sudah masuk kategori/tahap yang berbeda!"
                />
            )}

            {!loading && !error && tenants.length > 0 && (
                <PipelineTable
                    tenants={tenants}
                    onFollowUp={(t) => { setSelected(t); setDrawerOpen(true); }}
                    onSendWA={(t) => { setSelected(t); setWAModalOpen(true); }}
                />
            )}

            {/* Drawers and Modals */}
            <FollowUpDrawer
                tenant={selectedTenant}
                open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setSelected(null); }}
                onSuccess={() => fetchPipeline(activeStage)}
                getToken={getToken}
            />

            <SendWAModal
                tenant={selectedTenant}
                open={waModalOpen}
                onClose={() => { setWAModalOpen(false); setSelected(null); }}
                onSuccess={() => fetchPipeline(activeStage)}
                getToken={getToken}
            />
        </div>
    );
}

// ==========================================
// PIPELINE TABLE COMPONENT
// ==========================================

function PipelineTable({
    tenants, onFollowUp, onSendWA
}: {
    tenants: TenantPipelineItem[], 
    onFollowUp: (t: TenantPipelineItem) => void, 
    onSendWA: (t: TenantPipelineItem) => void
}) {
    return (
        <div className="bg-[#071120] border border-cyan-900/30 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-cyan-900/30">
                        <th className="px-5 py-3 text-left text-neutral-500 font-medium">Tenant</th>
                        <th className="px-5 py-3 text-left text-neutral-500 font-medium whitespace-nowrap">Hari Sisa</th>
                        <th className="px-5 py-3 text-left text-neutral-500 font-medium whitespace-nowrap">Aktivitas (14H)</th>
                        <th className="px-5 py-3 text-left text-neutral-500 font-medium">Follow-Up</th>
                        <th className="px-5 py-3 text-left text-neutral-500 font-medium">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {tenants.map(t => {
                        const isExpired = t.days_until_expiry !== null && t.days_until_expiry < 0;
                        const dColor = t.days_until_expiry === null 
                            ? 'text-neutral-500' : isExpired 
                            ? 'text-red-500 font-bold' : t.days_until_expiry <= 7
                            ? 'text-red-400 font-bold' : t.days_until_expiry <= 14
                            ? 'text-amber-400 font-bold' : t.days_until_expiry <= 30
                            ? 'text-amber-400/80 font-medium' : 'text-green-500 font-medium';
                            
                        const bgRow = t.stage === 'churned' ? 'bg-rose-500/5' 
                                    : t.stage === 'expiring_soon' ? 'bg-amber-500/5'
                                    : 'bg-transparent';
                        
                        return (
                            <tr key={t.id} className={`${bgRow} border-b border-cyan-900/10 hover:bg-white/5 transition-colors`}>
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <p className="text-white font-bold">{t.shop_name}</p>
                                        {t.stage === 'at_risk' && <span title="Resiko Churn" className="text-red-400">⚠️</span>}
                                    </div>
                                    <a href={`https://${t.slug}.${APP_DOMAIN}`} target="_blank" className="font-mono text-xs text-cyan-400/70 hover:text-cyan-400">
                                        {t.slug}.{APP_DOMAIN} ↗
                                    </a>
                                </td>
                                
                                <td className={`px-5 py-4 ${dColor}`}>
                                    {isExpired ? (
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-red-500/20 text-[10px] uppercase">Expired</span>
                                    ) : t.days_until_expiry === null ? '—' : `${t.days_until_expiry} hari`}
                                </td>

                                <td className="px-5 py-4">
                                    {t.bookings_last_14_days > 0 ? (
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-mono text-neutral-300">{t.bookings_last_14_days} trx</span>
                                            </div>
                                            <div className="h-1.5 w-24 bg-neutral-800 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-cyan-500" 
                                                    style={{ width: `${Math.min((t.bookings_last_14_days / 20) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                                            <span>⚠️</span> Nol aktivitas
                                        </div>
                                    )}
                                </td>

                                <td className="px-5 py-4">
                                    <div className="flex flex-col gap-1 items-start">
                                        {t.pending_followups > 0 ? (
                                            <span className="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-500/20">
                                                {t.pending_followups} pending
                                            </span>
                                        ) : (
                                            <span className="text-neutral-500 text-xs">—</span>
                                        )}
                                        {t.last_followup_at && (
                                            <span className="text-[10px] text-neutral-400">
                                                Terk.: {new Date(t.last_followup_at).toLocaleDateString('id-ID')}
                                            </span>
                                        )}
                                    </div>
                                </td>

                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => onFollowUp(t)}
                                            className="text-[11px] px-2.5 py-1.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 font-medium transition-colors">
                                            📝 Review
                                        </button>
                                        <button onClick={() => onSendWA(t)}
                                            className="text-[11px] px-2.5 py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-medium transition-colors flex items-center gap-1">
                                            <span>💬</span> WA
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ==========================================
// FOLLOW UP DRAWER
// ==========================================

function FollowUpDrawer({ tenant, open, onClose, onSuccess, getToken }: any) {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Form state
    const [caseType, setCaseType] = useState('renewal');
    const [channel, setChannel] = useState('whatsapp');
    const [note, setNote] = useState('');
    const [churnReason, setChurnReason] = useState('too_expensive');
    const [churnDetail, setChurnDetail] = useState('');

    useEffect(() => {
        if (!open || !tenant) return;
        setHistory([]);
        setCaseType('renewal');
        setChannel('whatsapp');
        setNote('');
        
        // Fetch riwayat
        const fetchHistory = async () => {
            const token = getToken();
            try {
                const res = await fetch(`/api/superadmin/followups?tenant_id=${tenant.id}&limit=10`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if(data.data) setHistory(data.data);
            } catch(e) {}
        }
        fetchHistory();
    }, [open, tenant, getToken]);

    const submitFollowUp = async () => {
        const token = getToken();
        if(!token) return;
        setLoading(true);

        try {
            // 1. Submit follow ups
            const payload = {
                tenant_id: tenant.id,
                case_type: caseType,
                channel: channel,
                note: note || undefined,
            };

            const fRes = await fetch('/api/superadmin/followups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!fRes.ok) throw new Error("Gagal menyimpan followup");

            // 2. Submit churn if case is churn
            if (caseType === 'churn') {
                const cRes = await fetch('/api/superadmin/churn-surveys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        tenant_id: tenant.id,
                        reason: churnReason,
                        detail_note: churnDetail || undefined,
                    })
                });
                if(!cRes.ok) console.error("Gagal simpan churn survey");
            }

            alert("✅ Follow-up berhasil disimpan!");
            onSuccess();
            onClose();
        } catch(e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }

    if (!open || !tenant) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm p-0 overflow-y-auto">
            <div className="bg-[#071120] w-full max-w-lg border-l border-cyan-900/30 flex flex-col min-h-screen">
                {/* Drawer Header */}
                <div className="p-5 border-b border-cyan-900/30 flex justify-between items-center bg-[#060D1A] sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold text-white">{tenant.name}</h2>
                        <p className="text-xs text-neutral-400 mt-1 font-mono">
                            Plan: <span className="text-amber-400">{tenant.plan}</span> • Sisa {tenant.days_until_expiry ?? 0} hari
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-neutral-800 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white">✕</button>
                </div>

                <div className="flex-1 p-5 space-y-8 overflow-y-auto">
                    {/* Riwayat View */}
                    <div>
                        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span>📋</span> Riwayat
                        </h3>
                        <div className="space-y-3">
                            {history.length === 0 ? (
                                <p className="text-xs text-neutral-500 italic">Belum ada riwayat follow-up.</p>
                            ) : history.map(h => (
                                <div key={h.id} className="p-3 bg-white/5 border border-white/5 rounded-xl">
                                    <div className="flex gap-2 items-center mb-1.5 flex-wrap">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{h.case_type}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border
                                            ${h.outcome === 'pending' ? 'bg-neutral-800 text-neutral-400 border-neutral-700' :
                                              h.outcome === 'no_response' ? 'bg-red-500/20 text-red-400 border-red-500/20' :
                                              h.outcome === 'interested' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' :
                                              h.outcome === 'renewed' || h.outcome === 'upgraded' || h.outcome === 'resolved' ? 'bg-green-500/20 text-green-400 border-green-500/20' :
                                              'bg-rose-500/20 text-rose-400 border-rose-500/20'}`}>
                                            {h.outcome}
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-300">{h.note || <span className="italic opacity-50">Tanpa catatan</span>}</p>
                                    <p className="text-[10px] text-neutral-500 mt-2 text-right">{new Date(h.created_at).toLocaleString('id-ID')}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tambah form */}
                    <div className="pt-6 border-t border-cyan-900/30">
                        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span>➕</span> Tindakan Baru
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-neutral-400 font-medium mb-1 block">Tipe Validasi</label>
                                    <select value={caseType} onChange={e => setCaseType(e.target.value)}
                                        className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                                        <option value="renewal">Jatuh Tempo (Renewal)</option>
                                        <option value="usage_check">Cek Aktivitas Pasif</option>
                                        <option value="churn">Konfirmasi Churn</option>
                                        <option value="upgrade_offer">Tawaran Upgrade</option>
                                        <option value="onboarding">Bantuan Onboarding</option>
                                        <option value="custom">Catatan Custom</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-neutral-400 font-medium mb-1 block">Saluran (Channel)</label>
                                    <select value={channel} onChange={e => setChannel(e.target.value)}
                                        className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="phone">Telepon / Call</option>
                                        <option value="email">Email</option>
                                        <option value="internal_note">Internal Note / Offline</option>
                                    </select>
                                </div>
                            </div>

                            {caseType === 'churn' && (
                                <div className="p-3 border border-rose-500/30 bg-rose-500/5 rounded-xl space-y-3">
                                    <p className="text-xs font-bold text-rose-400 tracking-wide uppercase">💔 Survey Alasan Churn</p>
                                    <div>
                                        <label className="text-[11px] text-neutral-400 mb-1 block">Sebab Berhenti:</label>
                                        <select value={churnReason} onChange={e => setChurnReason(e.target.value)}
                                            className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-3 py-2 text-xs focus:border-rose-500">
                                            <option value="too_expensive">Terlalu mahal (Harga)</option>
                                            <option value="not_using">Tidak terpakai / Toko sepi</option>
                                            <option value="switched_competitor">Pindah ke Aplikasi Lain</option>
                                            <option value="temporary_close">Toko tutup sementara</option>
                                            <option value="missing_feature">Fitur kurang lengkapi</option>
                                            <option value="technical_issues">Sering Eror / Issue Teknis</option>
                                            <option value="other">Lainnya...</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-neutral-400 mb-1 block">Catatan Ekstra Churn:</label>
                                        <textarea value={churnDetail} onChange={e => setChurnDetail(e.target.value)} placeholder="Beritahu rincian keluhan kompetitor, dsb..."
                                            className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-3 py-2 text-xs focus:border-rose-500" rows={2}/>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs text-neutral-400 font-medium mb-1 block">Catatan Log</label>
                                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Detail penanganan..."
                                    className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" rows={3}/>
                            </div>

                            <button onClick={submitFollowUp} disabled={loading}
                                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-xl transition-all disabled:opacity-50 mt-4">
                                {loading ? "Menyimpan..." : "Simpan Follow-up"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// KUMPULAN TEMPLATE WA
// ==========================================

const waTemplates: Record<string, { label: string, generate: (n: string) => string }> = {
    'renewal_7': {
        label: "⏰ Pengingat 7 Hari",
        generate: (name) => `Halo Kak Owner ${name},\n\nSemoga bisnis pangkasnya makin ramai! Kami mau mengingatkan bahwa masa langganan CukurShip toko kakak akan berakhir dalam 7 hari.\n\nYuk segera perpanjang agar semua fitur kasir dan online booking tetap berjalan lancar.`
    },
    'renewal_3': {
        label: "🚨 Mendesak 3 Hari",
        generate: (name) => `Halo Kak Owner ${name} 👋,\n\nPemberitahuan penting! Langganan aplikasi kasir CukurShip tersisa kurang dari 3 hari. Segera diurus ya kak supaya laporan keuangan tidak terputus!`
    },
    'usage_check': {
        label: "📉 Cek Aktivitas",
        generate: (name) => `Halo Kak Owner ${name},\n\nKami pantau seminggu terakhir aktivitas di aplikasinya sedang sepi ya kak? Apakah ada kendala dari segi pemakaian aplikasi? Tim support kami siap bantu!`
    },
    'reactivation': {
        label: "💔 Reaktivasi",
        generate: (name) => `Halo Kak Owner ${name}!\n\nSayang banget toko kakak saat ini sedang offline di CukurShip. Kami ada promo spesial kalau Kakak tertarik aktifkan lagi toko kakak! Mau tanya-tanya dulu?`
    }
}

// ==========================================
// SEND WA MODAL
// ==========================================

function SendWAModal({ tenant, open, onClose, onSuccess, getToken }: any) {
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'template' | 'custom'>('template');
    
    const [selectedTemplate, setSelectedTemplate] = useState('renewal_7');
    const [customMsg, setCustomMsg] = useState('');

    if (!open || !tenant) return null;

    const currentMsgPreview = tab === 'template' 
        ? waTemplates[selectedTemplate].generate(tenant.shop_name || '')
        : customMsg;

    const handleSend = async () => {
        if (tab === 'custom' && !customMsg) {
            alert('Pesan tidak boleh kosong');
            return;
        }

        const token = getToken();
        if(!token) return;
        setLoading(true);

        try {
            const res = await fetch(`/api/superadmin/tenants/${tenant.id}/send-wa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    message: tab === 'custom' ? customMsg : undefined,
                    template: tab === 'template' ? selectedTemplate : undefined
                })
            });

            if (!res.ok) throw new Error("Gagal mengirim WA");
            const data = await res.json();
            
            alert(`✅ ${data.message || 'WhatsApp berhasil merapat ke Owner!'}`);
            onSuccess();
            onClose();
        } catch(e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-[#0b1626] border border-cyan-900/60 rounded-2xl p-6 w-full max-w-xl shadow-2xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="text-emerald-400">💬</span> Kirim WhatsApp
                        </h2>
                        <p className="text-sm text-neutral-400 mt-1">
                            Kepada <span className="font-bold text-white">{tenant.users?.name || 'Owner'}</span> 
                            <span className="font-mono bg-neutral-800 px-2 py-0.5 rounded ml-2 text-emerald-400">+{tenant.users?.phone_number || '???'}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 text-neutral-500 hover:text-white">✕</button>
                </div>

                <div className="flex gap-2 mb-4 p-1 bg-neutral-900 rounded-lg">
                    <button onClick={() => setTab('template')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all
                            ${tab === 'template' ? 'bg-cyan-500/20 text-cyan-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
                        Pilih Template Siap Senggol
                    </button>
                    <button onClick={() => setTab('custom')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all
                            ${tab === 'custom' ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
                        Bikin Pesan Kustom
                    </button>
                </div>

                {tab === 'template' && (
                    <div className="space-y-3">
                        <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                            className="w-full bg-[#071120] border border-cyan-900/30 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500">
                            {Object.entries(waTemplates).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                        <div className="bg-[#050a14] border border-neutral-800 p-4 rounded-xl">
                            <p className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest mb-2">Preview Pesan</p>
                            <p className="text-emerald-50/80 text-sm whitespace-pre-wrap">{currentMsgPreview}</p>
                        </div>
                    </div>
                )}

                {tab === 'custom' && (
                    <div className="space-y-2">
                        <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value.substring(0, 500))}
                            placeholder="Tulis pesan mesra khusus ke owner ini..."
                            className="w-full h-32 bg-[#071120] border border-emerald-900/50 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                        <p className="text-right text-xs text-neutral-500 font-mono">
                            {customMsg.length}/500
                        </p>
                    </div>
                )}

                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} disabled={loading}
                        className="px-6 py-2.5 rounded-xl border border-neutral-700 text-neutral-400 hover:bg-neutral-800 transition-all font-medium">
                        Batal
                    </button>
                    <button onClick={handleSend} disabled={loading}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {loading ? 'Mengirim...' : <><span>✈️</span> Kirim WhatsApp Sekarang</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
