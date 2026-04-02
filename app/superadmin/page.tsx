"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function formatRupiah(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id";

function StatCard({ label, value, icon, sub, color = "cyan" }: {
    label: string; value: string | number; icon: string; sub?: string; color?: string;
}) {
    const borders: Record<string, string> = {
        cyan:   "border-cyan-500/20 shadow-cyan-500/5",
        green:  "border-green-500/20 shadow-green-500/5",
        amber:  "border-amber-500/20 shadow-amber-500/5",
        red:    "border-red-500/20 shadow-red-500/5",
        purple: "border-purple-500/20 shadow-purple-500/5",
    };
    const texts: Record<string, string> = {
        cyan:   "text-cyan-400",
        green:  "text-green-400",
        amber:  "text-amber-400",
        red:    "text-red-400",
        purple: "text-purple-400",
    };
    return (
        <div className={`bg-neutral-900/60 border rounded-2xl p-5 backdrop-blur-sm shadow-lg ${borders[color]}`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{label}</p>
                    <p className={`text-3xl font-extrabold mt-1 ${texts[color]}`}>{value}</p>
                    {sub && <p className="text-xs text-neutral-600 mt-1">{sub}</p>}
                </div>
                <span className="text-2xl opacity-60">{icon}</span>
            </div>
        </div>
    );
}

function PlanBadge({ plan, isActive, expiresAt }: { plan: string; isActive: boolean; expiresAt: string | null }) {
    if (!isActive) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">🔴 Nonaktif</span>;
    const isExpired = expiresAt && new Date(expiresAt) < new Date();
    if (isExpired) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">🔴 Expired</span>;
    if (plan === "trial") return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">🟡 Trial</span>;
    if (plan?.endsWith("_annual")) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold capitalize">✨ {plan.replace("_annual", "")} Tahunan</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold capitalize">🟢 {plan}</span>;
}

export default function SuperadminOverview() {
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [reminderLoading, setReminderLoading] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        const token = localStorage.getItem("superadmin_token");
        if (!token) { router.push("/superadmin/login"); return; }
        try {
            const res = await fetch("/api/superadmin/overview", { headers: { Authorization: `Bearer ${token}` } });
            if (res.status === 401 || res.status === 403) { router.push("/superadmin/login"); return; }
            setData(await res.json());
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { loadData(); }, [loadData]);

    // Kirim reminder WA via dedicated endpoint
    const sendReminder = async (tenant: any) => {
        const token = localStorage.getItem("superadmin_token");
        if (!token) return;
        setReminderLoading(tenant.id);
        try {
            const res = await fetch(`/api/superadmin/send-reminder`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ tenant_id: tenant.id }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.message);
            alert(`✅ Reminder terkirim ke ${tenant.shop_name}`);
        } catch (e: any) {
            alert(e.message || "Gagal mengirim reminder.");
        } finally {
            setReminderLoading(null);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
    );

    const { stats, newestTenants = [], expiringTenants = [], expiring_annual_14days = [], weeklyStats = [] } = data || {};

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
                <p className="text-neutral-500 text-sm mt-1">Dashboard pengelolaan seluruh barbershop di CukurShip.</p>
            </div>

            {/* ─── Stat Cards Row 1: Existing ─────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Toko"    value={stats?.totalTenants ?? 0}        icon="🏪" color="cyan" />
                <StatCard label="Toko Trial"    value={stats?.trialTenants ?? 0}        icon="⏳" color="amber" sub="14 hari gratis" />
                <StatCard label="Toko Berbayar" value={stats?.paidTenants ?? 0}         icon="✅" color="green" />
                <StatCard label="MRR Bulan Ini" value={formatRupiah(stats?.mrr ?? 0)}   icon="💰" color="cyan" sub="Dari transaksi paid" />
            </div>

            {/* ─── Stat Cards Row 2: Annual / Subdomain (BARU) ─────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Pelanggan Tahunan"  value={stats?.annual_subscribers ?? 0}              icon="✨" color="amber" sub="Plan _annual aktif" />
                <StatCard label="Pelanggan Bulanan"  value={stats?.monthly_subscribers ?? 0}             icon="📅" color="cyan" sub="Non-trial, non-annual" />
                <StatCard label="Estimasi ARR"       value={formatRupiah(stats?.arr_estimate ?? 0)}      icon="📈" color="purple" sub="Annual Revenue Run Rate" />
                <StatCard label="Custom Subdomain"   value={stats?.custom_subdomain_count ?? 0}          icon="🎯" color="green" sub="Toko dengan custom URL" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Segera Expired (7 hari — semua plan) */}
                <div className="lg:col-span-2 bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                        <h2 className="font-bold text-white flex items-center gap-2">
                            <span className="text-amber-400">⚠️</span> Segera Expired (7 hari)
                        </h2>
                        <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                            {expiringTenants.length} toko
                        </span>
                    </div>
                    {expiringTenants.length === 0 ? (
                        <div className="text-center py-10 text-neutral-600">
                            <p className="text-3xl mb-2">🎉</p>
                            <p className="text-sm">Tidak ada toko yang akan expired dalam 7 hari.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-800/60">
                                    <th className="px-6 py-3 text-left text-neutral-500 font-medium">Toko</th>
                                    <th className="px-6 py-3 text-left text-neutral-500 font-medium">Plan</th>
                                    <th className="px-6 py-3 text-left text-neutral-500 font-medium">Expired</th>
                                    <th className="px-6 py-3 text-left text-neutral-500 font-medium">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expiringTenants.map((t: any) => (
                                    <tr key={t.id} className="border-b border-neutral-800/30 hover:bg-neutral-800/20 transition-colors">
                                        <td className="px-6 py-3">
                                            <p className="text-white font-medium">{t.shop_name}</p>
                                            <a
                                                href={`https://${t.effective_slug || t.slug}.${APP_DOMAIN}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-neutral-500 text-xs font-mono hover:text-amber-400 transition-colors"
                                            >
                                                {(t.effective_slug || t.slug)}.{APP_DOMAIN} ↗
                                            </a>
                                        </td>
                                        <td className="px-6 py-3">
                                            <PlanBadge plan={t.plan} isActive={t.is_active} expiresAt={t.plan_expires_at} />
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`text-xs font-bold ${(t.days_remaining ?? 99) <= 3 ? "text-red-400" : "text-amber-400"}`}>
                                                {t.days_remaining} hari lagi
                                            </span>
                                            <p className="text-neutral-600 text-xs">{new Date(t.plan_expires_at).toLocaleDateString("id-ID")}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <button
                                                onClick={() => sendReminder(t)}
                                                disabled={reminderLoading === t.id}
                                                className="text-xs px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                            >
                                                {reminderLoading === t.id ? "Mengirim..." : "💬 Reminder WA"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Weekly stats */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-neutral-800">
                        <h2 className="font-bold text-white">Toko Baru per Minggu</h2>
                    </div>
                    <div className="p-4 space-y-3">
                        {weeklyStats.map((w: any, i: number) => (
                            <div key={i} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-neutral-500">{w.week}</span>
                                    <span className="text-cyan-400 font-bold">{w.count} toko</span>
                                </div>
                                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-cyan-500 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, w.count * 20)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── BARU: Tahunan Segera Berakhir (14 hari) ─────────────────────── */}
            {expiring_annual_14days.length > 0 && (
                <div className="bg-neutral-900/60 border border-amber-500/30 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-amber-500/20 flex items-center justify-between bg-amber-950/20">
                        <h2 className="font-bold text-amber-300 flex items-center gap-2">
                            ⚠️ Paket Tahunan Segera Berakhir (14 hari)
                        </h2>
                        <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                            {expiring_annual_14days.length} toko
                        </span>
                    </div>
                    <div className="divide-y divide-neutral-800/60">
                        {expiring_annual_14days.map((t: any) => (
                            <div key={t.id} className="flex items-center justify-between px-6 py-4 hover:bg-neutral-800/20 transition-colors gap-4 flex-wrap">
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold">{t.shop_name}</p>
                                    <a
                                        href={`https://${t.effective_slug || t.slug}.${APP_DOMAIN}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-400/70 text-xs font-mono hover:text-amber-400 transition-colors"
                                    >
                                        {(t.effective_slug || t.slug)}.{APP_DOMAIN} ↗
                                    </a>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <PlanBadge plan={t.plan} isActive={t.is_active} expiresAt={t.plan_expires_at} />
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className={`text-sm font-bold ${(t.days_remaining ?? 99) <= 7 ? "text-red-400" : "text-amber-400"}`}>
                                        {t.days_remaining} hari lagi
                                    </p>
                                    <p className="text-xs text-neutral-500">{new Date(t.plan_expires_at).toLocaleDateString("id-ID")}</p>
                                </div>
                                <button
                                    onClick={() => sendReminder(t)}
                                    disabled={reminderLoading === t.id}
                                    className="text-xs px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50 flex-shrink-0"
                                >
                                    {reminderLoading === t.id ? "Mengirim..." : "💬 Kirim Reminder WA"}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Toko Terbaru */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="font-bold text-white">🆕 5 Toko Terbaru</h2>
                    <Link href="/superadmin/tenants" className="text-xs text-cyan-400 hover:underline">Lihat semua →</Link>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-neutral-800/60">
                            <th className="px-6 py-3 text-left text-neutral-500 font-medium">Nama Toko</th>
                            <th className="px-6 py-3 text-left text-neutral-500 font-medium">URL</th>
                            <th className="px-6 py-3 text-left text-neutral-500 font-medium">Plan</th>
                            <th className="px-6 py-3 text-left text-neutral-500 font-medium">Daftar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {newestTenants.map((t: any) => (
                            <tr key={t.id} className="border-b border-neutral-800/30 hover:bg-neutral-800/20 transition-colors">
                                <td className="px-6 py-3 text-white font-medium">{t.shop_name}</td>
                                <td className="px-6 py-3 text-xs">
                                    <a
                                        href={`https://${t.effective_slug || t.slug}.${APP_DOMAIN}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-cyan-400/70 hover:text-cyan-400 transition-colors"
                                    >
                                        {(t.effective_slug || t.slug)}.{APP_DOMAIN} ↗
                                    </a>
                                </td>
                                <td className="px-6 py-3">
                                    <PlanBadge plan={t.plan} isActive={t.is_active} expiresAt={t.plan_expires_at} />
                                </td>
                                <td className="px-6 py-3 text-neutral-500 text-xs">
                                    {new Date(t.created_at).toLocaleDateString("id-ID")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
