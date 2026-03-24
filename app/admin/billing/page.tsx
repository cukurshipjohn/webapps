"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const PLANS = [
    {
        key: "starter",
        name: "Starter",
        price: 99000,
        max_barbers: 2,
        max_bookings: 50,
        features: [
            "Maks. 2 kapster",
            "Maks. 50 booking/bulan",
            "Home Service maks. 5x/bulan",
            "Notifikasi WhatsApp",
            "Panel Admin lengkap",
        ],
        color: "from-neutral-800 to-neutral-900",
        accent: "border-neutral-600",
    },
    {
        key: "pro",
        name: "Pro",
        price: 199000,
        max_barbers: 5,
        max_bookings: 9999,
        features: [
            "Maks. 5 kapster",
            "Booking tidak terbatas",
            "Home Service tidak terbatas",
            "Blast Notifikasi WA ke pelanggan",
            "Notifikasi WhatsApp",
            "Panel Admin lengkap",
            "Laporan bulanan",
        ],
        color: "from-amber-950/40 to-neutral-900",
        accent: "border-amber-500",
        popular: true,
    },
    {
        key: "business",
        name: "Business",
        price: 349000,
        max_barbers: 9999,
        max_bookings: 9999,
        features: [
            "Kapster tidak terbatas",
            "Booking tidak terbatas",
            "Home Service tidak terbatas",
            "Blast Notifikasi WA ke pelanggan",
            "WA Priority Support",
            "Panel Admin lengkap",
            "Laporan bulanan & tahunan",
            "Support prioritas",
        ],
        color: "from-amber-900/30 to-neutral-900",
        accent: "border-amber-400",
    },
];


function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function ProgressBar({ used, max, label }: { used: number; max: number; label: string }) {
    const pct = max >= 9999 ? 0 : Math.min(100, Math.round((used / max) * 100));
    const isUnlimited = max >= 9999;
    const isWarning = pct >= 80 && !isUnlimited;
    const isDanger = pct >= 100 && !isUnlimited;

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
                <span className="text-neutral-400">{label}</span>
                <span className={`font-mono font-medium ${isDanger ? "text-red-400" : isWarning ? "text-amber-400" : "text-neutral-300"}`}>
                    {used} / {isUnlimited ? "∞" : max}
                </span>
            </div>
            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: isUnlimited ? "8%" : `${pct}%` }}
                />
            </div>
        </div>
    );
}

export default function BillingPage() {
    const router = useRouter();
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [payingPlan, setPayingPlan] = useState<string | null>(null);
    const [pollingMsg, setPollingMsg] = useState<string | null>(null);

    const fetchStatus = async (token: string) => {
        const res = await fetch("/api/billing/status", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        return data;
    };

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) { router.push("/admin/login"); return; }
        fetchStatus(token)
            .then(data => { setStatus(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [router]);

    /**
     * Setelah QRIS / payment terbayar, Midtrans mengirimkan webhook ke server kita.
     * Webhook TIDAK langsung tiba — ada delay 2-15 detik.
     * Kita polling status setiap 2 detik sampai plan berubah (max 30 detik).
     */
    const pollForPlanUpdate = async (originalPlan: string) => {
        const token = localStorage.getItem("token");
        if (!token) return;

        setPollingMsg("Menunggu konfirmasi pembayaran...");

        const maxAttempts = 15; // 15 × 2 detik = 30 detik
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const fresh = await fetchStatus(token);
                if (fresh.plan !== originalPlan || (fresh.transactions?.[0]?.status === 'paid')) {
                    setStatus(fresh);
                    setPollingMsg(null);
                    return;
                }
                setPollingMsg(`Menunggu konfirmasi Midtrans... (${i + 1}/${maxAttempts})`);
            } catch {
                // lanjut polling
            }
        }

        // Setelah 30 detik tetap refresh sekali
        const fresh = await fetchStatus(token).catch(() => null);
        if (fresh) setStatus(fresh);
        setPollingMsg(null);
    };

    const handleSubscribe = async (planKey: string) => {
        const token = localStorage.getItem("token");
        if (!token) { router.push("/admin/login"); return; }

        setPayingPlan(planKey);
        try {
            const res = await fetch("/api/billing/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ plan: planKey }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            // Load Midtrans Snap JS jika belum ada
            const clientKey = data.client_key || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
            if (!(window as any).snap) {
                await new Promise<void>((resolve) => {
                    const script = document.createElement("script");
                    script.src = "https://app.sandbox.midtrans.com/snap/snap.js";
                    script.setAttribute("data-client-key", clientKey);
                    script.onload = () => resolve();
                    document.head.appendChild(script);
                });
            }

            // Simpan plan saat ini untuk perbandingan polling
            const currentPlanBeforePayment = status?.plan ?? 'trial';

            // Buka Midtrans Snap popup
            (window as any).snap.pay(data.snap_token, {
                onSuccess: () => {
                    setPayingPlan(null);
                    pollForPlanUpdate(currentPlanBeforePayment);
                },
                onPending: () => {
                    setPayingPlan(null);
                    // Untuk QRIS: status pending = QR sudah ditampilkan, tapi belum dibayar.
                    // Jangan langsung reload — polling setelah user bayar di simulator Midtrans.
                    pollForPlanUpdate(currentPlanBeforePayment);
                },
                onError: (err: any) => { alert("Pembayaran gagal: " + err.message); setPayingPlan(null); },
                onClose: () => { setPayingPlan(null); },
            });
        } catch (e: any) {
            alert(e.message || "Gagal memulai pembayaran.");
        } finally {
            setPayingPlan(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
        );
    }

    // Banner polling (menunggu webhook dari Midtrans)
    const PollingBanner = pollingMsg ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 bg-neutral-900 border border-amber-500/40 rounded-2xl shadow-2xl">
            <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin flex-shrink-0" />
            <span className="text-amber-400 text-sm font-medium">{pollingMsg}</span>
        </div>
    ) : null;

    const currentPlan = status?.plan || "trial";
    const daysRemaining = status?.days_remaining ?? 0;
    const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
    const isExpired = daysRemaining <= 0 && currentPlan !== "trial";

    return (
        <div className="p-6 space-y-8 max-w-6xl mx-auto">
            {PollingBanner}
            <div>
                <h1 className="text-2xl font-bold text-white">Langganan & Billing</h1>
                <p className="text-neutral-400 text-sm mt-1">Kelola paket berlangganan dan pembayaran Anda.</p>
            </div>

            {/* ─── WARNING BANNER ─────────────────────────────────────────── */}
            {(isExpiringSoon || isExpired) && (
                <div className={`border rounded-2xl px-6 py-4 flex items-start gap-4 ${isExpired ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
                    <span className="text-2xl">{isExpired ? "🚨" : "⚠️"}</span>
                    <div>
                        <p className={`font-bold ${isExpired ? "text-red-400" : "text-amber-400"}`}>
                            {isExpired ? "Langganan Telah Berakhir" : `Langganan berakhir dalam ${daysRemaining} hari!`}
                        </p>
                        <p className="text-sm text-neutral-400 mt-0.5">
                            {isExpired ? "Perbarui langganan Anda segera agar toko tetap dapat menerima booking." : "Segera perbarui untuk menghindari gangguan layanan."}
                        </p>
                    </div>
                </div>
            )}

            {/* ─── STATUS AKTIF ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Langganan Aktif</h2>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full">
                            <span className="text-amber-400 text-sm font-bold capitalize">{currentPlan}</span>
                        </div>
                        {status?.plan_expires_at && (
                            <span className="text-neutral-500 text-sm">
                                s/d {new Date(status.plan_expires_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                            </span>
                        )}
                    </div>
                    {typeof daysRemaining === "number" && daysRemaining > 0 && (
                        <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${daysRemaining <= 7 ? "bg-red-500" : "bg-amber-500"}`}
                                style={{ width: `${Math.min(100, (daysRemaining / 30) * 100)}%` }}
                            />
                        </div>
                    )}
                </div>

                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Penggunaan Bulan Ini</h2>
                    <div className="space-y-3">
                        <ProgressBar
                            used={status?.usage?.barbers ?? 0}
                            max={status?.limits?.max_barbers ?? 2}
                            label="Kapster"
                        />
                        <ProgressBar
                            used={status?.usage?.bookings_this_month ?? 0}
                            max={status?.limits?.max_bookings_per_month ?? 50}
                            label="Booking bulan ini"
                        />
                        <ProgressBar
                            used={status?.usage?.home_service_this_month ?? 0}
                            max={status?.limits?.max_home_service_per_month ?? 5}
                            label="Home Service bulan ini"
                        />
                    </div>
                </div>
            </div>

            {/* ─── PLAN CARDS ──────────────────────────────────────────────── */}
            <div>
                <h2 className="text-lg font-bold text-white mb-4">Pilih Paket</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {PLANS.map((plan) => {
                        const isActive = currentPlan === plan.key;
                        return (
                            <div
                                key={plan.key}
                                className={`relative bg-gradient-to-b ${plan.color} border-2 ${isActive ? "border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]" : plan.accent} rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200`}
                            >
                                {plan.popular && !isActive && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 text-black text-xs font-bold rounded-full">
                                        POPULER
                                    </div>
                                )}
                                {isActive && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 text-black text-xs font-bold rounded-full">
                                        ✓ AKTIF
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                                    <p className="text-3xl font-extrabold text-white mt-1">
                                        {formatRupiah(plan.price)}
                                        <span className="text-sm font-normal text-neutral-400">/bulan</span>
                                    </p>
                                </div>

                                <ul className="space-y-2 flex-1">
                                    {plan.features.map((f, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                                            <span className="text-amber-500 mt-0.5 flex-shrink-0">✓</span>
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => !isActive && handleSubscribe(plan.key)}
                                    disabled={isActive || payingPlan !== null}
                                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                                        isActive
                                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-default"
                                            : "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-50"
                                    }`}
                                >
                                    {payingPlan === plan.key
                                        ? "Memproses..."
                                        : isActive
                                        ? "Paket Aktif"
                                        : "Pilih Paket Ini"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ─── RIWAYAT PEMBAYARAN ──────────────────────────────────────── */}
            <div>
                <h2 className="text-lg font-bold text-white mb-4">Riwayat Pembayaran</h2>
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden">
                    {(!status?.transactions || status.transactions.length === 0) ? (
                        <div className="text-center py-12 text-neutral-500">
                            <p className="text-2xl mb-2">💳</p>
                            <p>Belum ada riwayat pembayaran.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-800">
                                    <th className="px-6 py-3 text-left text-neutral-400 font-medium">Order ID</th>
                                    <th className="px-6 py-3 text-left text-neutral-400 font-medium">Paket</th>
                                    <th className="px-6 py-3 text-left text-neutral-400 font-medium">Jumlah</th>
                                    <th className="px-6 py-3 text-left text-neutral-400 font-medium">Status</th>
                                    <th className="px-6 py-3 text-left text-neutral-400 font-medium">Tanggal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {status.transactions.map((tx: any) => (
                                    <tr key={tx.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs text-neutral-400">{tx.midtrans_order_id}</td>
                                        <td className="px-6 py-4">
                                            <span className="capitalize text-white font-medium">{tx.plan}</span>
                                        </td>
                                        <td className="px-6 py-4 text-white">{formatRupiah(tx.amount)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-bold ${
                                                tx.status === "paid" ? "bg-green-500/20 text-green-400" :
                                                tx.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                                                "bg-red-500/20 text-red-400"
                                            }`}>
                                                {tx.status === "paid" ? "✓ Berhasil" :
                                                 tx.status === "pending" ? "⏳ Menunggu" :
                                                 tx.status === "expired" ? "Kedaluwarsa" : "Gagal"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-400">
                                            {new Date(tx.created_at).toLocaleDateString("id-ID")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
