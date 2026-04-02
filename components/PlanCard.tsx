"use client";

import { PLANS, type PlanId } from "@/lib/billing-plans";

interface PlanCardProps {
    planId: PlanId;
    billingCycle: "monthly" | "annual";
    isCurrentPlan: boolean;
    onSelect: () => void;
    isLoading: boolean;
}

export default function PlanCard({
    planId,
    billingCycle,
    isCurrentPlan,
    onSelect,
    isLoading,
}: PlanCardProps) {
    const plan = PLANS[planId];
    if (!plan) return null;

    const isAnnual = billingCycle === "annual";
    const isPopular = planId === "pro" || planId === "pro_annual";

    // Savings info (only for annual plans)
    const savedAmount =
        isAnnual && plan.original_annual_price
            ? plan.original_annual_price - plan.normal_price
            : 0;

    const formatRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

    return (
        <div className="relative flex flex-col">
            {/* Badge di atas kartu */}
            {isCurrentPlan && (
                <div className="mb-2 flex justify-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/60 px-3 py-1 text-xs font-bold text-amber-400">
                        ✓ Plan Aktif
                    </span>
                </div>
            )}
            {isPopular && !isCurrentPlan && (
                <div className="mb-2 flex justify-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-black">
                        ⭐ Paling Populer
                    </span>
                </div>
            )}
            {!isCurrentPlan && !isPopular && (
                <div className="mb-2 h-7" /> /* spacer agar kartu sejajar */
            )}

            {/* Kartu */}
            <div
                className={`relative flex flex-col flex-1 rounded-2xl border p-6 transition-all duration-300 ${
                    isCurrentPlan
                        ? "border-amber-400 bg-amber-950/30 shadow-lg shadow-amber-500/10"
                        : isPopular
                        ? "border-amber-500/60 bg-gradient-to-b from-amber-950/30 to-neutral-900 shadow-lg shadow-amber-900/20"
                        : "border-neutral-700 bg-neutral-900 hover:border-neutral-500"
                }`}
            >
                {/* Badge diskon (pojok kanan atas, hanya annual) */}
                {isAnnual && plan.discount_percent > 0 && (
                    <div className="absolute -top-3 right-4">
                        <span className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-black shadow-md shadow-amber-500/30">
                            Hemat {plan.discount_percent}%
                        </span>
                    </div>
                )}

                {/* Nama Plan */}
                <h3 className="text-lg font-bold text-white mb-1">
                    {plan.name}
                </h3>

                {/* Harga */}
                <div className="mb-4">
                    {isAnnual && plan.original_annual_price ? (
                        <>
                            {/* Harga asli dicoret */}
                            <p className="text-sm text-neutral-500 line-through">
                                {formatRp(plan.original_annual_price)}/tahun
                            </p>
                            {/* Harga diskon */}
                            <p className="text-3xl font-black text-white">
                                {formatRp(plan.normal_price)}
                                <span className="text-base font-normal text-neutral-400">/tahun</span>
                            </p>
                            {/* Efektif per bulan */}
                            <p className="text-sm text-emerald-400 font-medium mt-0.5">
                                = {formatRp(plan.price_per_month)}/bulan
                            </p>
                            {/* Total hemat */}
                            {savedAmount > 0 && (
                                <p className="text-xs text-amber-400 font-semibold mt-1">
                                    Hemat {formatRp(savedAmount)} 🎉
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-3xl font-black text-white">
                                {formatRp(plan.normal_price)}
                                <span className="text-base font-normal text-neutral-400">/bulan</span>
                            </p>
                        </>
                    )}
                </div>

                {/* Divider */}
                <div className="border-t border-neutral-700/60 mb-4" />

                {/* Fitur */}
                <ul className="flex-1 space-y-2.5 mb-6">
                    {plan.features.map((feat, i) => {
                        const isCustomSubdomain = feat.toLowerCase().includes("custom subdomain");
                        return (
                            <li
                                key={i}
                                className={`flex items-start gap-2 text-sm ${
                                    isCustomSubdomain
                                        ? "text-amber-300 font-semibold"
                                        : "text-neutral-300"
                                }`}
                            >
                                <span
                                    className={`mt-0.5 flex-shrink-0 text-xs ${
                                        isCustomSubdomain ? "text-amber-400" : "text-emerald-400"
                                    }`}
                                >
                                    {isCustomSubdomain ? "✨" : "✓"}
                                </span>
                                <span>{feat}</span>
                            </li>
                        );
                    })}
                </ul>

                {/* Tombol */}
                <button
                    onClick={onSelect}
                    disabled={isCurrentPlan || isLoading}
                    className={`w-full rounded-xl py-3 text-sm font-bold transition-all duration-200 ${
                        isCurrentPlan
                            ? "bg-amber-500/20 text-amber-400 cursor-not-allowed border border-amber-500/30"
                            : isLoading
                            ? "bg-amber-500/50 text-black cursor-wait"
                            : isPopular
                            ? "bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/30 hover:shadow-amber-400/40"
                            : "bg-neutral-700 hover:bg-neutral-600 text-white border border-neutral-600"
                    }`}
                >
                    {isCurrentPlan ? (
                        "Plan Aktif"
                    ) : isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Memproses...
                        </span>
                    ) : isAnnual ? (
                        `Pilih ${plan.name} Tahunan`
                    ) : (
                        `Pilih ${plan.name}`
                    )}
                </button>
            </div>
        </div>
    );
}
