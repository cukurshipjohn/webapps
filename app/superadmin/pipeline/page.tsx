"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface TenantPipeline {
    id: string;
    shop_name: string;
    slug: string;
    plan: string;
    plan_expires_at: string | null;
    days_until_expiry: number;
    owner_phone: string | null;
    pipeline_stage: "healthy" | "expiring_soon" | "expired" | "churned" | "dormant" | "unknown";
    last_activity_at: string | null;
    last_booking_at: string | null;
    has_churn_survey: boolean;
    last_followup_at: string | null;
}

export interface PipelineSummary {
    healthy: number;
    expiring_soon: number;
    expired: number;
    churned: number;
    dormant: number;
}

// ── Komponen UI Kosmetik ──────────────────────────────────────────────────
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

const STAGE_CONFIG = {
    healthy:       { label: "Healthy",       icon: "🟢", color: "bg-green-500/20 text-green-400 border-green-500/20",   bgCard: "bg-green-950/20 border-green-900/40" },
    expiring_soon: { label: "Expiring Soon", icon: "🟡", color: "bg-amber-500/20 text-amber-400 border-amber-500/20", bgCard: "bg-amber-950/20 border-amber-900/40" },
    expired:       { label: "Expired",       icon: "🔴", color: "bg-red-500/20 text-red-400 border-red-500/20",       bgCard: "bg-red-950/20 border-red-900/40" },
    churned:       { label: "Churned",       icon: "⚫", color: "bg-neutral-700 text-neutral-300 border-neutral-600", bgCard: "bg-neutral-900/50 border-neutral-800" },
    dormant:       { label: "Dormant",       icon: "😴", color: "bg-slate-500/20 text-slate-400 border-slate-500/20", bgCard: "bg-slate-900/30 border-slate-800/60" },
    unknown:       { label: "Unknown",       icon: "❓", color: "bg-neutral-800 text-neutral-400 border-neutral-700", bgCard: "bg-neutral-900/50 border-neutral-800" },
};

function PlanBadge({ plan }: { plan: string }) {
    if (plan === "trial") return <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/20 font-medium">Trial</span>;
    if (plan === "starter" || plan === "starter_annual") return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/20 font-medium capitalize">Starter</span>;
    if (plan === "pro" || plan === "pro_annual") return <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 font-medium capitalize">Pro</span>;
    if (plan === "business" || plan === "business_annual") return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/20 font-medium capitalize">Business</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 font-medium capitalize">{plan}</span>;
}

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id";

export default function PipelinePage() {
    const router = useRouter();
    
    // States
    const [tenants, setTenants] = useState<TenantPipeline[]>([]);
    const [summary, setSummary] = useState<PipelineSummary>({ healthy: 0, expiring_soon: 0, expired: 0, churned: 0, dormant: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<string>("all");
    const [toast, setToast] = useState<{msg: string, isError?: boolean} | null>(null);

    // Modal States
    const [followUpModal, setFollowUpModal] = useState<TenantPipeline | null>(null);
    const [churnModal, setChurnModal] = useState<TenantPipeline | null>(null);
    const [waModal, setWaModal] = useState<TenantPipeline | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Auth
    const getToken = () => window.localStorage.getItem("superadmin_token");

    // Fetch Data
    const loadPipeline = useCallback(async () => {
        const token = getToken();
        if (!token) { router.push("/superadmin/login"); return; }
        
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/superadmin/tenants/pipeline`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) { router.push("/superadmin/login"); return; }
            if (!res.ok) throw new Error("Gagal mengambil data pipeline");
            
            const data = await res.json();
            setTenants(data.tenants || []);
            setSummary(data.summary || { healthy: 0, expiring_soon: 0, expired: 0, churned: 0, dormant: 0 });
        } catch (err: any) {
            setError(err.message || "Terjadi kesalahan sistem");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        loadPipeline();
    }, [loadPipeline]);

    // Handlers
    const showToast = (msg: string, isError = false) => setToast({ msg, isError });

    const filteredTenants = tenants.filter(t => activeTab === "all" || t.pipeline_stage === activeTab);

    // ── Forms Logic ────────────────────────────────────────────────────────
    
    // 1. FollowUp Form
    const [fuCaseType, setFuCaseType] = useState("renewal_reminder");
    const [fuChannel, setFuChannel] = useState("whatsapp");
    const [fuOutcome, setFuOutcome] = useState("pending");
    const [fuMessage, setFuMessage] = useState("");

    const submitFollowUp = async () => {
        if (!followUpModal) return;
        setActionLoading(true);
        try {
            const token = getToken();
            const res = await fetch('/api/superadmin/followups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    tenant_id: followUpModal.id,
                    case_type: fuCaseType,
                    channel: fuChannel,
                    outcome: fuOutcome,
                    message_sent: fuChannel === 'whatsapp' ? fuMessage : undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showToast(data.wa_sent ? `✅ Follow-up dicatat & WA terkirim` : `✅ Follow-up berhasil dicatat`);
            setFollowUpModal(null);
            loadPipeline();
        } catch (e: any) {
            showToast(e.message, true);
        } finally {
            setActionLoading(false);
        }
    };

    // 2. Churn Survey Form
    const [chReason, setChReason] = useState("too_expensive");
    const [chNote, setChNote] = useState("");
    const [chWinBack, setChWinBack] = useState("medium");
    const [chScheduled, setChScheduled] = useState("");

    const submitChurn = async () => {
        if (!churnModal) return;
        setActionLoading(true);
        try {
            const token = getToken();
            const res = await fetch('/api/superadmin/churn-surveys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    tenant_id: churnModal.id,
                    reason: chReason,
                    detail_note: chNote,
                    win_back_potential: chWinBack,
                    follow_up_scheduled_at: chScheduled || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showToast(`✅ Tenant tercatat churn`);
            setChurnModal(null);
            loadPipeline();
        } catch (e: any) {
            showToast(e.message, true);
        } finally {
            setActionLoading(false);
        }
    };

    // 3. Quick WA Form
    const [waMessage, setWaMessage] = useState("");
    const openWaTemplate = (t: TenantPipeline) => {
        setWaModal(t);
        setWaMessage(`Halo ${t.shop_name}! 👋 Langganan CukurShip Anda akan habis dalam ${t.days_until_expiry} hari. Perpanjang sekarang agar barbershop Anda tetap berjalan lancar. Hubungi kami jika butuh bantuan! 🔑`);
    };

    const submitQuickWA = async () => {
        if (!waModal) return;
        setActionLoading(true);
        try {
            const token = getToken();
            const res = await fetch('/api/superadmin/followups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    tenant_id: waModal.id,
                    case_type: 'general',
                    channel: 'whatsapp',
                    outcome: 'pending',
                    message_sent: waMessage
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showToast(data.wa_sent ? `✅ WA berhasil terkirim!` : `⚠️ Log tercatat namun API WA gagal dikirim.`);
            setWaModal(null);
            loadPipeline();
        } catch (e: any) {
            showToast(e.message, true);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Pipeline Tenant & CRM</h1>
                <p className="text-neutral-500 text-sm mt-1">Pantau & cegah churn, maksimalkan retensi barbershop.</p>
            </div>

            {/* ERROR BOUNDARY */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {/* SECTION 1: Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { key: "healthy", val: summary.healthy },
                    { key: "expiring_soon", val: summary.expiring_soon },
                    { key: "dormant", val: summary.dormant },
                    { key: "expired", val: summary.expired },
                    { key: "churned", val: summary.churned }
                ].map(item => {
                    const cfg = STAGE_CONFIG[item.key as keyof typeof STAGE_CONFIG];
                    return (
                        <div key={item.key} onClick={() => setActiveTab(item.key)} className={`p-4 rounded-2xl border cursor-pointer transition-all hover:-translate-y-1 ${activeTab === item.key ? 'ring-2 ring-cyan-500/50 ' + cfg.bgCard : 'bg-neutral-900/40 border-neutral-800'}`}>
                            <div className="text-sm font-medium text-neutral-400 mb-2 flex items-center gap-1.5">
                                <span>{cfg.icon}</span> {cfg.label}
                            </div>
                            <div className="text-3xl font-bold text-white">{loading ? "-" : item.val}</div>
                        </div>
                    );
                })}
            </div>

            {/* SECTION 2: Tabs Filter */}
            <div className="flex border-b border-neutral-800 overflow-x-auto scroller-hide">
                {[{id: "all", label: "All Tenants"}, {id: "expiring_soon", label: "Expiring Soon"}, {id: "dormant", label: "Dormant"}, {id: "expired", label: "Expired"}, {id: "churned", label: "Churned"}].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* SECTION 3: Table */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-x-auto min-h-[400px]">
                {loading ? (
                    <div className="w-full p-10 space-y-4">
                        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-neutral-800/50 rounded-lg animate-pulse" />)}
                    </div>
                ) : filteredTenants.length === 0 ? (
                    <div className="text-center py-20 text-neutral-600">
                        <p className="text-4xl mb-3">🎉</p>
                        <p>Tidak ada tenant di kategori ini.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800">
                                <th className="px-5 py-4 text-left text-neutral-500 font-medium">Toko</th>
                                <th className="px-5 py-4 text-left text-neutral-500 font-medium">Plan</th>
                                <th className="px-5 py-4 text-left text-neutral-500 font-medium">Expires</th>
                                <th className="px-5 py-4 text-left text-neutral-500 font-medium">Aktivitas Terakhir</th>
                                <th className="px-5 py-4 text-left text-neutral-500 font-medium">Stage</th>
                                <th className="px-5 py-4 text-left text-neutral-500 font-medium">PWA Terakhir</th>
                                <th className="px-5 py-4 text-right text-neutral-500 font-medium">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTenants.map(t => {
                                const stageCfg = STAGE_CONFIG[t.pipeline_stage] || STAGE_CONFIG.unknown;
                                const days = t.days_until_expiry;
                                const isExpiring = days <= 14 && t.pipeline_stage !== 'churned';
                                
                                let activityLabel = "Belum ada";
                                let activityAlert = false;
                                if (t.last_activity_at) {
                                    const actDays = Math.floor((new Date().getTime() - new Date(t.last_activity_at).getTime()) / 86400000);
                                    activityLabel = actDays === 0 ? "Hari ini" : `${actDays} hr lalu`;
                                    if (actDays > 14) activityAlert = true;
                                }

                                return (
                                    <tr key={t.id} className="border-b border-neutral-800/40 hover:bg-neutral-800/30 transition-colors">
                                        <td className="px-5 py-4">
                                            <p className="text-white font-semibold">{t.shop_name}</p>
                                            <a href={`https://${t.slug}.${APP_DOMAIN}`} target="_blank" rel="noopener" className="text-xs font-mono text-cyan-600 hover:text-cyan-400">
                                                {t.slug}.{APP_DOMAIN}
                                            </a>
                                        </td>
                                        <td className="px-5 py-4"><PlanBadge plan={t.plan} /></td>
                                        <td className="px-5 py-4 text-xs">
                                            {t.plan_expires_at ? (
                                                <>
                                                    <p className={`font-medium ${t.pipeline_stage === 'expired' ? 'text-red-400' : isExpiring ? 'text-amber-400' : 'text-neutral-400'}`}>
                                                        {new Date(t.plan_expires_at).toLocaleDateString('id-ID')}
                                                    </p>
                                                    {t.pipeline_stage !== 'churned' && (
                                                        <p className="text-neutral-500 mt-0.5">{days} HR lagi</p>
                                                    )}
                                                </>
                                            ) : <span className="text-neutral-600">—</span>}
                                        </td>
                                        <td className="px-5 py-4 text-xs">
                                            <span className={`font-medium ${activityAlert ? 'text-red-400' : 'text-neutral-400'}`}>
                                                {activityLabel}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`text-xs px-2.5 py-1 rounded-full border bg-opacity-10 ${stageCfg.color} font-medium flex inline-flex items-center gap-1.5 whitespace-nowrap`}>
                                                {stageCfg.icon} {stageCfg.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-xs text-neutral-400">
                                            {t.last_followup_at ? new Date(t.last_followup_at).toLocaleDateString('id-ID') : "Belum pernah"}
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5 flex-wrap w-fit ml-auto">
                                                <button onClick={() => openWaTemplate(t)} className="px-2.5 py-1.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 rounded-md transition-all whitespace-nowrap">
                                                    📱 Kirim WA
                                                </button>
                                                <button onClick={() => setFollowUpModal(t)} className="px-2.5 py-1.5 text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 rounded-md transition-all whitespace-nowrap">
                                                    📝 Catat Follow-Up
                                                </button>
                                                {!t.has_churn_survey && t.pipeline_stage !== 'healthy' && (
                                                    <button onClick={() => setChurnModal(t)} className="px-2.5 py-1.5 text-xs bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700 rounded-md transition-all whitespace-nowrap">
                                                        ❌ Catat Churn
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* MODAL 1: Follow Up */}
            {followUpModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setFollowUpModal(null)}>
                    <div className="bg-[#0d1a2d] border border-cyan-500/20 rounded-2xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-1">📝 Catat Follow-Up</h3>
                        <p className="text-sm text-neutral-400 mb-5">Tenant: <span className="text-cyan-400 font-medium">{followUpModal.shop_name}</span></p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Case Type</label>
                                <select value={fuCaseType} onChange={e => setFuCaseType(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500">
                                    <option value="renewal_reminder">Renewal Reminder</option>
                                    <option value="usage_coaching">Usage Coaching (Dormant)</option>
                                    <option value="churn_prevention">Churn Prevention</option>
                                    <option value="reactivation_offer">Reactivation Offer (Expired)</option>
                                    <option value="upgrade_offer">Upgrade Offer</option>
                                    <option value="general">Lainnya (General)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Channel Komunikasi</label>
                                <div className="flex gap-2">
                                    {['whatsapp', 'phone_call', 'internal_note'].map(ch => (
                                        <button key={ch} onClick={() => setFuChannel(ch)} className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition-colors ${fuChannel === ch ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-neutral-900 text-neutral-500 border-neutral-700'}`}>
                                            {ch.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {fuChannel === 'whatsapp' && (
                                <div>
                                    <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Pesan WhatsApp / Log Chat</label>
                                    <textarea value={fuMessage} onChange={e => setFuMessage(e.target.value)} rows={3} placeholder="Tulis pesan yang dikirim/didapat di WhatsApp..." className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"></textarea>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Outcome (Hasil)</label>
                                <select value={fuOutcome} onChange={e => setFuOutcome(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500">
                                    <option value="pending">Pending (Belum Direspon)</option>
                                    <option value="interested">Tertarik Tapi Belum Deal</option>
                                    <option value="renewed">Berhasil Extend/Renew</option>
                                    <option value="upgraded">Berhasil Upgrade Plan</option>
                                    <option value="no_response">Tidak Ada Respon (Kacang)</option>
                                    <option value="churned_confirmed">Konfirmasi Tutup/Churn</option>
                                    <option value="not_applicable">Tidak Relevan</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setFollowUpModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-neutral-400 bg-neutral-800 hover:bg-neutral-700 transition">Batal</button>
                            <button onClick={submitFollowUp} disabled={actionLoading} className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-black bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 transition">
                                {actionLoading ? "Menyimpan..." : (fuChannel === 'whatsapp' ? "Simpan & Kirim WA" : "Simpan Catatan")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: Churn Survey */}
            {churnModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setChurnModal(null)}>
                    <div className="bg-[#1f1616] border border-red-500/20 rounded-2xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-1">❌ Catat Konfirmasi Churn</h3>
                        <p className="text-sm text-neutral-400 mb-5 text-red-200/60">Toko <span className="text-red-400 font-medium">{churnModal.shop_name}</span> akan dinonaktifkan dari sistem setelah ini disimpan.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Alasan Utama Churn</label>
                                <select value={chReason} onChange={e => setChReason(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500">
                                    <option value="too_expensive">Harga terlalu mahal / Tidak afford</option>
                                    <option value="not_using_features">Fitur tidak cocok/terpakai</option>
                                    <option value="switched_competitor">Pindah ke kompetitor lain</option>
                                    <option value="temporary_close">Toko tutup sementara / direnovasi</option>
                                    <option value="technical_issues">Masalah teknis / Sering error</option>
                                    <option value="no_customers">Sepi pelanggan / Bisnis mandek</option>
                                    <option value="other">Alasan lainnya</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Potensi Win-Back (Kemungkinan kembali)</label>
                                <div className="flex gap-2">
                                    {['high', 'medium', 'low', 'unknown'].map(wb => (
                                        <button key={wb} onClick={() => setChWinBack(wb)} className={`flex-1 py-1.5 rounded-md text-xs font-medium border capitalize transition-colors ${chWinBack === wb ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-neutral-900 text-neutral-500 border-neutral-700'}`}>
                                            {wb}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Catatan Tambahan (Opsional)</label>
                                <textarea value={chNote} onChange={e => setChNote(e.target.value)} rows={3} placeholder="Customer bilang aplikasi terlalu ribet untuk barbernya..." className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 resize-none"></textarea>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Jadwalkan Follow-up (Opsional)</label>
                                <input type="date" value={chScheduled} onChange={e => setChScheduled(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setChurnModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-neutral-400 bg-neutral-800 hover:bg-neutral-700 transition">Batal</button>
                            <button onClick={submitChurn} disabled={actionLoading} className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition">
                                {actionLoading ? "Menyimpan..." : "Simpan Churn Survey"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: Kirim WA Cepat */}
            {waModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setWaModal(null)}>
                    <div className="bg-[#0b1b11] border border-green-500/20 rounded-2xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-1">📱 Kirim WhatsApp Cepat</h3>
                        <p className="text-sm text-neutral-400 mb-5">Penerima: <span className="text-green-400 font-medium">{waModal.shop_name}</span> ({waModal.owner_phone || "Nomor tidak terdaftar"})</p>

                        {!waModal.owner_phone ? (
                            <div className="bg-red-500/10 text-red-400 text-sm p-4 rounded-xl mb-4 border border-red-500/20">
                                ❌ Tenant ini belum mencantumkan nomor handphone di profile akun ownernya.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-neutral-400 mb-2 block">Pilih Template Pesan:</label>
                                    <div className="space-y-2">
                                        {[
                                            { label: "Reminder Perpanjangan", text: `Halo ${waModal.shop_name}! 👋 Langganan CukurShip Anda akan habis dalam ${waModal.days_until_expiry} hari. Perpanjang sekarang agar barbershop Anda tetap berjalan lancar. Hubungi kami jika butuh bantuan! 🔑` },
                                            { label: "Tips Aktivasi (Dormant)", text: `Hai ${waModal.shop_name}! 💈 Kami perhatikan fitur booking online Anda belum aktif digunakan bulan ini. Mau kami bantu setup agar makin banyak pelanggan datang? Balas pesan ini ya!` },
                                            { label: "Reaktivasi (Expired)", text: `Halo ${waModal.shop_name}! 🙌 Kami rindu Anda di CukurShip. Ada penawaran spesial reaktivasi diskon 20% untuk bulan ini. Balas pesan ini untuk info lebih lanjut!` }
                                        ].map((tpl, i) => (
                                            <button key={i} onClick={() => setWaMessage(tpl.text)} className="w-full text-left text-xs bg-neutral-900 border border-neutral-800 p-2.5 rounded-lg hover:border-green-500/50 hover:bg-neutral-800 transition text-neutral-300">
                                                <span className="font-semibold text-green-500 block mb-1">{tpl.label}</span>
                                                <span className="line-clamp-1">{tpl.text}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="text-xs font-semibold text-neutral-400 mb-1.5 block">Edit Pesan (Opsional)</label>
                                    <textarea value={waMessage} onChange={e => setWaMessage(e.target.value)} rows={5} className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500 resize-none"></textarea>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setWaModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-neutral-400 bg-neutral-800 hover:bg-neutral-700 transition">Batal</button>
                            <button onClick={submitQuickWA} disabled={actionLoading || !waModal.owner_phone} className="flex-[2] py-2.5 rounded-xl text-sm font-bold text-black bg-green-500 hover:bg-green-400 disabled:opacity-50 transition flex items-center justify-center gap-2">
                                {actionLoading ? "Mengirim..." : <>Terkirim <span>✈️</span></>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
