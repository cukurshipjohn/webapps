// Definisi plan dan harga langganan CukurShip
export const PLANS = {
    starter: {
        key: 'starter',
        name: 'Starter',
        price: 99000,
        max_barbers: 2,
        max_bookings_per_month: 50,
        max_home_service_per_month: 5,   // Home Service dibatasi 5x/bulan di Starter
        blast_wa: false,
        features: [
            'Maks. 2 kapster',
            'Maks. 50 booking/bulan',
            'Home Service maks. 5x/bulan',
            'Notifikasi WhatsApp',
            'Panel Admin lengkap',
        ],
    },
    pro: {
        key: 'pro',
        name: 'Pro',
        price: 199000,
        max_barbers: 5,
        max_bookings_per_month: 9999,
        max_home_service_per_month: 9999, // Tidak terbatas
        blast_wa: true,
        features: [
            'Maks. 5 kapster',
            'Booking tidak terbatas',
            'Home Service tidak terbatas',
            'Blast Notifikasi WA ke pelanggan',
            'Notifikasi WhatsApp',
            'Panel Admin lengkap',
            'Laporan bulanan',
        ],
    },
    business: {
        key: 'business',
        name: 'Business',
        price: 349000,
        max_barbers: 9999,
        max_bookings_per_month: 9999,
        max_home_service_per_month: 9999, // Tidak terbatas
        blast_wa: true,
        features: [
            'Kapster tidak terbatas',
            'Booking tidak terbatas',
            'Home Service tidak terbatas',
            'Blast Notifikasi WA ke pelanggan',
            'WA Priority Support',
            'Panel Admin lengkap',
            'Laporan bulanan & tahunan',
            'Support prioritas',
        ],
    },
} as const;

export type PlanKey = keyof typeof PLANS;

export function getPlan(key: string) {
    return PLANS[key as PlanKey] ?? null;
}

/** Cek apakah plan memiliki fitur blast WA */
export function canBlastWA(planKey: string): boolean {
    return getPlan(planKey)?.blast_wa ?? false;
}

/** Ambil batas home service per bulan. Kembalikan 9999 jika unlimited. */
export function getHomeServiceLimit(planKey: string): number {
    return getPlan(planKey)?.max_home_service_per_month ?? 5;
}
