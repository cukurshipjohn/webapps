"use client";

import { useEffect, useState } from "react";

function formatRp(n: number) {
    return `Rp ${n.toLocaleString("id-ID")}`;
}

interface PromoStatus {
    is_in_promo: boolean;
    promo_months_remaining: number;
    current_price: number;
    normal_price: number;
    paid_cycles: number;
}

export default function PromoStatusBanner() {
    const [promoStatus, setPromoStatus] = useState<PromoStatus | null>(null);

    useEffect(() => {
        const fetchPromo = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                
                const res = await fetch("/api/admin/billing/promo-status", {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.is_in_promo) {
                        setPromoStatus(data);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch promo status", error);
                // silent error
            }
        };
        fetchPromo();
    }, []);

    if (!promoStatus || !promoStatus.is_in_promo) {
        return null; // Tidak tampilkan banner apapun jika tidak promo
    }

    const { current_price, normal_price, promo_months_remaining, paid_cycles } = promoStatus;
    const normalPriceMonth = promo_months_remaining + paid_cycles + 1;

    return (
        <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-900/20 px-6 py-4 flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1">
                <h3 className="text-emerald-400 font-bold text-lg mb-1 flex items-center gap-2">
                    <span className="text-xl">✨</span> Kamu masih dalam harga perkenalan!
                </h3>
                <p className="text-emerald-100/80 text-sm">
                    Tagihan saat ini: <strong className="text-white">{formatRp(current_price)}/bulan</strong>. 
                </p>
                <p className="text-emerald-200/60 text-xs mt-1">
                    Harga normal ({formatRp(normal_price)}/bln) berlaku mulai bulan ke-{normalPriceMonth}.
                </p>
            </div>
        </div>
    );
}
