"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

function PlanBadge({ plan, isActive, expiresAt }: { plan: string; isActive: boolean; expiresAt: string | null }) {
    if (!isActive) return <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/20">🔴 Nonaktif</span>;
    const isExpired = expiresAt && new Date(expiresAt) < new Date();
    if (isExpired) return <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/20">🔴 Expired</span>;
    if (plan === "trial") return <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/20">🟡 Trial</span>;
    return <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 font-bold border border-green-500/20 capitalize">🟢 {plan}</span>;
}

const PLAN_OPTIONS = ["", "trial", "starter", "pro", "business"];

export default function SuperadminTenants() {
    const router = useRouter();
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPlan, setFilterPlan] = useState("");
    const [filterActive, setFilterActive] = useState("");
    const [sortBy, setSortBy] = useState("created_at");

    // Modal: Extend Plan
    const [extendModal, setExtendModal] = useState<any>(null);
    const [extendDays, setExtendDays] = useState(30);
    const [extendNewPlan, setExtendNewPlan] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    const getToken = () => localStorage.getItem("superadmin_token");

    const loadTenants = useCallback(async () => {
        const token = getToken();
        if (!token) { router.push("/superadmin/login"); return; }
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterPlan) params.set("plan", filterPlan);
            if (filterActive) params.set("is_active", filterActive);
            params.set("sort", sortBy);

            const res = await fetch(`/api/superadmin/tenants?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) { router.push("/superadmin/login"); return; }
            const data = await res.json();
            setTenants(data.tenants || []);
        } finally { setLoading(false); }
    }, [router, filterPlan, filterActive, sortBy]);

    useEffect(() => { loadTenants(); }, [loadTenants]);

    const handleToggleActive = async (tenant: any) => {
        const token = getToken();
        if (!token) return;
        const confirm = window.confirm(`${tenant.is_active ? "Nonaktifkan" : "Aktifkan"} toko "${tenant.shop_name}"?`);
        if (!confirm) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/superadmin/tenants/${tenant.id}/toggle-active`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            await loadTenants();
        } catch (e: any) {
            alert(e.message || "Gagal mengubah status.");
        } finally { setActionLoading(false); }
    };

    const handleExtendPlan = async () => {
        const token = getToken();
        if (!token || !extendModal) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/superadmin/tenants/${extendModal.id}/extend-plan`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ days: extendDays, ...(extendNewPlan ? { plan: extendNewPlan } : {}) }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            alert(`✅ ${data.message}`);
            setExtendModal(null);
            await loadTenants();
        } catch (e: any) {
            alert(e.message || "Gagal extend plan.");
        } finally { setActionLoading(false); }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Semua Toko</h1>
                    <p className="text-neutral-500 text-sm mt-1">{tenants.length} toko ditemukan</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 bg-neutral-900/60 border border-neutral-800 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-500 font-medium">Plan:</label>
                    <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500">
                        <option value="">Semua</option>
                        {PLAN_OPTIONS.filter(Boolean).map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-500 font-medium">Status:</label>
                    <select value={filterActive} onChange={e => setFilterActive(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500">
                        <option value="">Semua</option>
                        <option value="true">Aktif</option>
                        <option value="false">Nonaktif</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-500 font-medium">Urutkan:</label>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500">
                        <option value="created_at">Terbaru Daftar</option>
                        <option value="plan_expires_at">Segera Expired</option>
                    </select>
                </div>
                <button onClick={() => { setFilterPlan(""); setFilterActive(""); setSortBy("created_at"); }}
                    className="ml-auto text-xs text-neutral-500 hover:text-cyan-400 transition-colors">
                    Reset Filter
                </button>
            </div>

            {/* Table */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-x-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-7 h-7 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                    </div>
                ) : tenants.length === 0 ? (
                    <div className="text-center py-16 text-neutral-600">
                        <p className="text-3xl mb-2">🏪</p>
                        <p>Tidak ada toko yang cocok dengan filter.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800">
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">Nama Toko</th>
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">URL</th>
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">Plan & Status</th>
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">Expired</th>
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">Booking</th>
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">Owner</th>
                                <th className="px-5 py-3 text-left text-neutral-500 font-medium">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map((t: any) => (
                                <tr key={t.id} className="border-b border-neutral-800/40 hover:bg-neutral-800/20 transition-colors">
                                    <td className="px-5 py-4">
                                        <p className="text-white font-semibold">{t.shop_name}</p>
                                        <p className="text-neutral-600 text-xs">{new Date(t.created_at).toLocaleDateString("id-ID")}</p>
                                    </td>
                                    <td className="px-5 py-4 font-mono text-xs text-cyan-400/70">
                                        <a href={`https://${t.slug}.cukurship.id`} target="_blank" rel="noopener"
                                            className="hover:text-cyan-400 transition-colors">
                                            {t.slug}.cukurship.id ↗
                                        </a>
                                    </td>
                                    <td className="px-5 py-4">
                                        <PlanBadge plan={t.plan} isActive={t.is_active} expiresAt={t.plan_expires_at} />
                                    </td>
                                    <td className="px-5 py-4 text-xs">
                                        {t.plan_expires_at ? (
                                            <>
                                                <p className={`font-medium ${new Date(t.plan_expires_at) < new Date() ? "text-red-400" : "text-neutral-300"}`}>
                                                    {new Date(t.plan_expires_at).toLocaleDateString("id-ID")}
                                                </p>
                                                <p className="text-neutral-600">
                                                    {Math.ceil((new Date(t.plan_expires_at).getTime() - Date.now()) / 86400000)} hari
                                                </p>
                                            </>
                                        ) : <span className="text-neutral-600">—</span>}
                                    </td>
                                    <td className="px-5 py-4 text-cyan-400 font-mono font-bold text-center">
                                        {t.total_bookings}
                                    </td>
                                    <td className="px-5 py-4 text-xs">
                                        {t.owner ? (
                                            <>
                                                <p className="text-neutral-300">{t.owner.name || "—"}</p>
                                                <p className="text-neutral-600 font-mono">{t.owner.phone_number}</p>
                                            </>
                                        ) : <span className="text-neutral-700">Tidak ada</span>}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleToggleActive(t)}
                                                disabled={actionLoading}
                                                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-50
                                                    ${t.is_active
                                                        ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                                                        : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                                                    }`}
                                            >
                                                {t.is_active ? "Nonaktifkan" : "Aktifkan"}
                                            </button>
                                            <button
                                                onClick={() => { setExtendModal(t); setExtendDays(30); setExtendNewPlan(""); }}
                                                className="text-xs px-3 py-1.5 rounded-lg border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20 transition-all font-medium"
                                            >
                                                Extend Plan
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Extend Plan Modal */}
            {extendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#0d1a2d] border border-cyan-500/20 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
                        <div>
                            <h3 className="text-lg font-bold text-white">Extend Plan</h3>
                            <p className="text-sm text-neutral-400 mt-1">
                                Toko: <span className="text-cyan-400 font-medium">{extendModal.shop_name}</span>
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-400 font-medium block mb-1.5">Perpanjang (hari)</label>
                                <div className="flex gap-2">
                                    {[7, 14, 30, 90].map(d => (
                                        <button key={d} onClick={() => setExtendDays(d)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all
                                                ${extendDays === d ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" : "bg-neutral-800 text-neutral-400 border-neutral-700"}`}>
                                            {d}h
                                        </button>
                                    ))}
                                </div>
                                <input type="number" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} min={1}
                                    className="mt-2 w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
                            </div>

                            <div>
                                <label className="text-xs text-neutral-400 font-medium block mb-1.5">Upgrade Plan (opsional)</label>
                                <select value={extendNewPlan} onChange={e => setExtendNewPlan(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                                    <option value="">Tetap plan saat ini ({extendModal.plan})</option>
                                    {["starter", "pro", "business"].map(p => (
                                        <option key={p} value={p} className="capitalize">{p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setExtendModal(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm text-neutral-400 border border-neutral-700 hover:bg-neutral-800 transition-all">
                                Batal
                            </button>
                            <button onClick={handleExtendPlan} disabled={actionLoading}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-black transition-all disabled:opacity-50">
                                {actionLoading ? "Memproses..." : `Extend ${extendDays} Hari`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
