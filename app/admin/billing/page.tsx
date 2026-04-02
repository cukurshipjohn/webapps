"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PLANS, type PlanId } from "@/lib/billing-plans";
import PlanToggle from "@/components/PlanToggle";
import PlanCard from "@/components/PlanCard";

import PromoStatusBanner from "@/components/PromoStatusBanner";

// Midtrans SnapJS dimuat via script tag
declare global {
    interface Window { snap?: any }
}

// Plan IDs yang ditampilkan (base plans — tanpa _annual suffix)
const BASE_PLANS: Array<"starter" | "pro" | "business"> = ["starter", "pro", "business"];

// Format tanggal Indonesian
function formatDate(iso: string | null | undefined): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric", month: "long", year: "numeric",
    });
}

function formatRp(n: number): string {
    return `Rp ${n.toLocaleString("id-ID")}`;
}

// Progress bar: persentase waktu tersisa dari total durasi plan
function calcProgress(expiresAt: string | null, isAnnual: boolean): number {
    if (!expiresAt) return 0;
    const totalDays = isAnnual ? 365 : 30;
    const remaining = Math.max(0, (new Date(expiresAt).getTime() - Date.now()) / 86400000);
    return Math.min(100, Math.round((remaining / totalDays) * 100));
}

interface BillingData {
    plan: string;
    is_active: boolean;
    plan_expires_at: string | null;
    billing_cycle: "monthly" | "annual";
    is_annual: boolean;
    days_remaining: number;
    can_custom_subdomain: boolean;
    subdomain_revisions_remaining: number;
    effective_slug: string;
    custom_slug: string | null;
    savings: { discount_percent: number; saved_amount: number } | null;
    limits: { max_barbers: number; max_bookings_per_month: number; max_home_service_per_month: number };
    usage: { barbers: number; bookings_this_month: number; home_service_this_month: number };
    transactions: Array<{
        id: string;
        plan: string;
        amount: number;
        billing_cycle: string;
        discount_percent: number;
        original_amount: number;
        status: string;
        paid_at: string | null;
        period_start: string | null;
        period_end: string | null;
        created_at: string;
    }>;
}

function BillingPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
    const [billingData, setBillingData] = useState<BillingData | null>(null);
    const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [copied, setCopied] = useState(false);
    const [token, setToken] = useState<string>("");

    // Baca cycle dari query param (misal dari halaman subdomain → ?cycle=annual)
    useEffect(() => {
        const cycle = searchParams?.get("cycle");
        if (cycle === "annual") setBillingCycle("annual");
    }, [searchParams]);

    // Baca token dari localStorage (admin auth pattern)
    useEffect(() => {
        const t = localStorage.getItem("token") || "";
        setToken(t);
        if (!t) { router.push("/admin/login"); return; }
    }, [router]);

    // Muat Midtrans SnapJS
    // PENTING: Hanya variabel NEXT_PUBLIC_ yang bisa dibaca di "use client" component.
    // MIDTRANS_IS_PRODUCTION (tanpa NEXT_PUBLIC_) = undefined di browser → selalu Sandbox.
    // Solusi: gunakan NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION untuk menentukan URL script.
    useEffect(() => {
        if (document.getElementById("midtrans-snap")) return;
        const script = document.createElement("script");
        script.id = "midtrans-snap";
        script.src = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
            ? "https://app.midtrans.com/snap/snap.js"
            : "https://app.sandbox.midtrans.com/snap/snap.js";
        script.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "");
        document.head.appendChild(script);
    }, []);

    const fetchBillingData = useCallback(async (tok: string) => {
        if (!tok) return;
        try {
            const res = await fetch("/api/billing/status", {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (res.ok) setBillingData(await res.json());
        } catch (e) {
            console.error("[Billing] Failed to fetch status:", e);
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchBillingData(token);
    }, [token, fetchBillingData]);

    // Pilih plan: POST subscribe → Midtrans Snap popup
    const handleSelectPlan = async (basePlanId: "starter" | "pro" | "business") => {
        const planId: PlanId = billingCycle === "annual"
            ? (`${basePlanId}_annual` as PlanId)
            : basePlanId;

        setLoadingPlanId(planId);
        try {
            const res = await fetch("/api/billing/subscribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ plan: planId }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Gagal membuat transaksi");

            if (!window.snap) throw new Error("Midtrans Snap belum dimuat");

            window.snap.pay(data.snap_token, {
                onSuccess: () => {
                    // Reload data setelah bayar berhasil
                    fetchBillingData(token);
                },
                onPending: () => { fetchBillingData(token); },
                onError: (err: any) => { console.error("[Snap] Error:", err); },
                onClose: () => { /* User tutup popup */ },
            });
        } catch (err: any) {
            alert(err.message || "Terjadi kesalahan. Coba lagi.");
        } finally {
            setLoadingPlanId(null);
        }
    };

    const handleCopyUrl = () => {
        const url = `https://${billingData?.effective_slug}.${
            process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id"
        }`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (loadingData) {
        return (
            <div className="flex items-center justify-center min-h-64 text-neutral-400">
                <div className="flex flex-col items-center gap-3">
                    <svg className="h-8 w-8 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <p className="text-sm">Memuat informasi billing...</p>
                </div>
            </div>
        );
    }

    const currentPlanId = billingData?.plan || "starter";
    const progress = calcProgress(billingData?.plan_expires_at ?? null, billingData?.is_annual ?? false);
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id";
    const shopUrl = `https://${billingData?.effective_slug}.${appDomain}`;

    // Status badge warna untuk plan saat ini
    const statusTxBadge = (status: string) => {
        if (status === "paid") return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        if (status === "pending") return "bg-neutral-500/20 text-neutral-400 border border-neutral-500/30";
        return "bg-red-500/20 text-red-400 border border-red-500/30";
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-2xl font-bold text-white">💳 Billing &amp; Langganan</h1>
                <p className="text-neutral-400 text-sm mt-1">Kelola paket dan pembayaran toko kamu</p>
            </div>
            
            <PromoStatusBanner />

            {/* ─── Section 1: Status Langganan Aktif ──────────────────────────── */}
            {billingData && (
                <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {PLANS[currentPlanId as PlanId]?.name || currentPlanId}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    {billingData.is_annual ? "Tahunan" : "Bulanan"}
                                </span>
                                {billingData.is_active ? (
                                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        ✓ Aktif
                                    </span>
                                ) : (
                                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30">
                                        ✗ Tidak Aktif
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-neutral-400">Aktif hingga</p>
                            <p className="text-base font-bold text-white">
                                {formatDate(billingData.plan_expires_at)}
                            </p>
                            <p className="text-xs text-neutral-400">
                                {billingData.days_remaining} hari tersisa
                            </p>
                        </div>
                    </div>

                    {/* Progress bar sisa waktu */}
                    <div>
                        <div className="flex justify-between text-xs text-neutral-500 mb-1">
                            <span>Masa aktif</span>
                            <span>{progress}% tersisa</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                    progress > 30
                                        ? "bg-gradient-to-r from-amber-600 to-amber-400"
                                        : "bg-gradient-to-r from-red-600 to-red-400"
                                }`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    {/* Hemat tahunan */}
                    {billingData.savings && (
                        <p className="text-sm text-amber-400 font-medium">
                            🎉 Kamu hemat {formatRp(billingData.savings.saved_amount)} dengan paket tahunan!
                        </p>
                    )}

                    {/* URL toko aktif */}
                    {billingData.effective_slug && (
                        <div className="flex items-center gap-2 bg-neutral-800 rounded-xl px-4 py-2.5">
                            <span className="text-xs text-neutral-400">URL Toko:</span>
                            <span className="text-sm text-amber-300 font-mono flex-1 truncate">
                                {shopUrl}
                            </span>
                            <button
                                onClick={handleCopyUrl}
                                className="text-xs text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                                title="Salin URL"
                            >
                                {copied ? "✓ Disalin" : "📋 Salin"}
                            </button>
                        </div>
                    )}

                    {/* Warning 7 hari terakhir */}
                    {billingData.days_remaining > 0 && billingData.days_remaining < 7 && (
                        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-3">
                            <span className="text-red-400 text-sm">
                                ⚠️ Langganan kamu akan berakhir dalam{" "}
                                <strong>{billingData.days_remaining} hari</strong>.
                                Segera perbarui untuk menjaga toko tetap aktif!
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Section 2: Pilih Paket ──────────────────────────────────────── */}
            <div className="space-y-6">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-white mb-4">Pilih Paket</h2>
                    <PlanToggle value={billingCycle} onChange={setBillingCycle} />
                </div>

                {/* Info box keuntungan tahunan */}
                {billingCycle === "annual" && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-4">
                        <p className="text-sm font-semibold text-amber-400 mb-2">💡 Keuntungan paket tahunan:</p>
                        <ul className="space-y-1">
                            {[
                                "Harga terkunci, bebas hike harga selama 1 tahun",
                                "Custom subdomain untuk URL toko yang profesional",
                                "Bayar sekali, aktif 365 hari",
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-amber-300/80">
                                    <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Grid 3 kartu plan */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {BASE_PLANS.map((base) => {
                        const planId: PlanId = billingCycle === "annual"
                            ? (`${base}_annual` as PlanId)
                            : base;

                        return (
                            <PlanCard
                                key={planId}
                                planId={planId}
                                billingCycle={billingCycle}
                                isCurrentPlan={currentPlanId === planId}
                                onSelect={() => handleSelectPlan(base)}
                                isLoading={loadingPlanId === planId}
                            />
                        );
                    })}
                </div>
            </div>

            {/* ─── Section 3: Riwayat Pembayaran ──────────────────────────────── */}
            {billingData?.transactions && billingData.transactions.length > 0 && (
                <div className="rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden">
                    <div className="px-6 py-4 border-b border-neutral-700">
                        <h2 className="text-base font-bold text-white">📄 Riwayat Pembayaran</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-800 text-left">
                                    <th className="px-4 py-3 text-neutral-400 font-medium">Tanggal</th>
                                    <th className="px-4 py-3 text-neutral-400 font-medium">Plan</th>
                                    <th className="px-4 py-3 text-neutral-400 font-medium">Periode</th>
                                    <th className="px-4 py-3 text-neutral-400 font-medium">Diskon</th>
                                    <th className="px-4 py-3 text-neutral-400 font-medium">Total</th>
                                    <th className="px-4 py-3 text-neutral-400 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {billingData.transactions.map((tx) => {
                                    const planLabel =
                                        PLANS[tx.plan as PlanId]?.name || tx.plan;
                                    const isAnnualTx = tx.billing_cycle === "annual";

                                    return (
                                        <tr
                                            key={tx.id}
                                            className="border-b border-neutral-800/60 hover:bg-neutral-800/40 transition-colors"
                                        >
                                            <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">
                                                {formatDate(tx.paid_at || tx.created_at)}
                                            </td>
                                            <td className="px-4 py-3 text-white font-medium">
                                                {planLabel}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                        isAnnualTx
                                                            ? "bg-amber-500/20 text-amber-400"
                                                            : "bg-neutral-700 text-neutral-300"
                                                    }`}
                                                >
                                                    {isAnnualTx ? "Tahunan" : "Bulanan"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-neutral-300">
                                                {tx.discount_percent > 0 ? (
                                                    <span className="text-amber-400 font-semibold">
                                                        {tx.discount_percent}%
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-500">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-white font-semibold whitespace-nowrap">
                                                {formatRp(tx.amount)}
                                                {tx.original_amount && tx.original_amount !== tx.amount && (
                                                    <span className="block text-xs text-neutral-500 line-through font-normal">
                                                        {formatRp(tx.original_amount)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTxBadge(
                                                        tx.status
                                                    )}`}
                                                >
                                                    {tx.status === "paid"
                                                        ? "✓ Lunas"
                                                        : tx.status === "pending"
                                                        ? "Menunggu"
                                                        : tx.status === "expired"
                                                        ? "Kedaluwarsa"
                                                        : "Gagal"}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// Next.js 16: useSearchParams() MUST be inside <Suspense> during SSR/build.
// Wrap the real component here so the page file never prerender-fails.
export default function BillingPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-64 text-neutral-400">
                <div className="flex flex-col items-center gap-3">
                    <svg className="h-8 w-8 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <p className="text-sm">Memuat informasi billing...</p>
                </div>
            </div>
        }>
            <BillingPageInner />
        </Suspense>
    );
}
