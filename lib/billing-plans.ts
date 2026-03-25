// ============================================================
// CukurShip — Single Source of Truth untuk semua Plan Langganan
// Jangan hardcode plan/harga di tempat lain — selalu import dari sini
// ============================================================

export const PLANS = {
  // ── BULANAN ────────────────────────────────────────────────
  starter: {
    id: 'starter',
    name: 'Starter',
    billing_cycle: 'monthly' as const,
    price: 99000,
    price_per_month: 99000,
    discount_percent: 0,
    original_annual_price: null as null,
    max_barbers: 2,
    max_bookings_per_month: 50,
    max_home_service_per_month: 5,
    custom_subdomain: false,
    subdomain_revisions: 0,
    can_blast_wa: false,
    features: [
      'Halaman booking pelanggan',
      'Notifikasi WA otomatis',
      'Maksimal 2 kapster',
      '50 booking per bulan',
      'Panel admin lengkap',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    billing_cycle: 'monthly' as const,
    price: 199000,
    price_per_month: 199000,
    discount_percent: 0,
    original_annual_price: null as null,
    max_barbers: 5,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: false,
    subdomain_revisions: 0,
    can_blast_wa: true,
    features: [
      'Semua fitur Starter',
      'Home Service aktif',
      'Maksimal 5 kapster',
      'Booking tidak terbatas',
      'Laporan pendapatan bulanan',
      'Blast WA ke pelanggan',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    billing_cycle: 'monthly' as const,
    price: 349000,
    price_per_month: 349000,
    discount_percent: 0,
    original_annual_price: null as null,
    max_barbers: 999999,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: false,
    subdomain_revisions: 0,
    can_blast_wa: true,
    features: [
      'Semua fitur Pro',
      'Kapster tidak terbatas',
      'WA session toko sendiri',
      'Priority support',
    ],
  },

  // ── TAHUNAN ────────────────────────────────────────────────
  starter_annual: {
    id: 'starter_annual',
    name: 'Starter Tahunan',
    billing_cycle: 'annual' as const,
    price: 1069200,              // 99.000 × 12 × 0.90
    price_per_month: 89100,      // efektif per bulan
    discount_percent: 10,
    original_annual_price: 1188000, // 99.000 × 12
    max_barbers: 2,
    max_bookings_per_month: 50,
    max_home_service_per_month: 5,
    custom_subdomain: true,
    subdomain_revisions: 0,      // set 1x, tidak bisa diubah
    can_blast_wa: false,
    features: [
      'Semua fitur Starter Bulanan',
      'Hemat 10% vs bulanan',
      'Custom subdomain (set 1x, tidak bisa diubah)',
      'Harga terkunci 1 tahun',
    ],
  },
  pro_annual: {
    id: 'pro_annual',
    name: 'Pro Tahunan',
    billing_cycle: 'annual' as const,
    price: 1910400,              // 199.000 × 12 × 0.80
    price_per_month: 159200,
    discount_percent: 20,
    original_annual_price: 2388000,
    max_barbers: 5,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: true,
    subdomain_revisions: 1,      // bisa ganti 1 kali
    can_blast_wa: true,
    features: [
      'Semua fitur Pro Bulanan',
      'Hemat 20% vs bulanan',
      'Custom subdomain (1x revisi)',
      'Harga terkunci 1 tahun',
    ],
  },
  business_annual: {
    id: 'business_annual',
    name: 'Business Tahunan',
    billing_cycle: 'annual' as const,
    price: 3141000,              // 349.000 × 12 × 0.75
    price_per_month: 261750,
    discount_percent: 25,
    original_annual_price: 4188000,
    max_barbers: 999999,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: true,
    subdomain_revisions: 3,      // bisa ganti 3 kali
    can_blast_wa: true,
    features: [
      'Semua fitur Business Bulanan',
      'Hemat 25% vs bulanan',
      'Custom subdomain (3x revisi)',
      'Harga terkunci 1 tahun',
      'Priority support',
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;

// ── Helper Functions ────────────────────────────────────────

/** Ambil objek plan berdasarkan ID. Return null jika tidak ditemukan. */
export function getPlanById(planId: string) {
  return PLANS[planId as PlanId] ?? null;
}

/** @deprecated Gunakan getPlanById(). Alias untuk backward compatibility. */
export function getPlan(key: string) {
  return getPlanById(key);
}

/** Cek apakah plan adalah paket tahunan. */
export function isAnnualPlan(planId: string): boolean {
  return planId.endsWith('_annual');
}

/** Durasi plan dalam hari: 365 untuk tahunan, 30 untuk bulanan. */
export function getPlanDurationDays(planId: string): number {
  return isAnnualPlan(planId) ? 365 : 30;
}

/** Ambil base plan ID dari annual plan (misal: 'pro_annual' → 'pro'). */
export function getBasePlanId(planId: string): string {
  return planId.replace('_annual', '');
}

/** Cek apakah plan mendukung custom subdomain. */
export function canCustomSubdomain(planId: string): boolean {
  return getPlanById(planId)?.custom_subdomain ?? false;
}

/** Jumlah revisi custom subdomain yang diizinkan. */
export function getSubdomainRevisions(planId: string): number {
  return getPlanById(planId)?.subdomain_revisions ?? 0;
}

/** Cek apakah plan memiliki fitur Blast WA. */
export function canBlastWA(planKey: string): boolean {
  return getPlanById(planKey)?.can_blast_wa ?? false;
}

/** Ambil batas home service per bulan. Kembalikan 999999 jika unlimited. */
export function getHomeServiceLimit(planKey: string): number {
  return getPlanById(planKey)?.max_home_service_per_month ?? 5;
}

/** Ambil jumlah penghematan tahunan dalam Rupiah. */
export function getAnnualSavings(planId: string): number {
  const plan = getPlanById(planId);
  if (!plan || plan.billing_cycle !== 'annual') return 0;
  return (plan.original_annual_price ?? 0) - plan.price;
}
