// Definisi plan dan harga langganan
export const PLANS = {
    starter: {
        key: 'starter',
        name: 'Starter',
        price: 99000,
        max_barbers: 2,
        max_bookings_per_month: 50,
        features: [
            'Maks. 2 kapster',
            'Maks. 50 booking/bulan',
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
        features: [
            'Maks. 5 kapster',
            'Booking tidak terbatas',
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
        features: [
            'Kapster tidak terbatas',
            'Booking tidak terbatas',
            'Notifikasi WhatsApp Priority',
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
