// ============================================================
// CukurShip — Single Source of Truth untuk semua Plan Langganan
// Jangan hardcode plan/harga di tempat lain — selalu import dari sini
// ============================================================

export const PLANS = {
  // ── BULANAN ────────────────────────────────────────────────
  trial: {
    id: 'trial',
    name: 'Trial',
    billing_cycle: 'monthly' as const,
    promo_price: null,
    normal_price: 0,
    promo_duration_months: 0,
    price_per_month: 0,
    discount_percent: 0,
    original_annual_price: null as null,
    // Trial = demo penuh Business (architecture.md section 12)
    max_barbers: 999999,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: false,
    subdomain_revisions: 5,
    can_blast_wa: true,
    kasirEnabled: true,
    maxKasirBarbers: null as null,
    features: [
      'Demo lengkap semua fitur Business',
      'Kapster tidak terbatas',
      'Booking tidak terbatas',
      'Kasir Telegram (unlimited)',
      'Blast WA ke pelanggan',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    billing_cycle: 'monthly' as const,
    promo_price: 49000,
    normal_price: 79000,
    promo_duration_months: 2,
    price_per_month: 79000,
    discount_percent: 0,
    original_annual_price: null as null,
    max_barbers: 2,
    max_bookings_per_month: 50,
    max_home_service_per_month: 5,
    custom_subdomain: false,
    subdomain_revisions: 0,
    can_blast_wa: false,
    kasirEnabled: false,
    maxKasirBarbers: 0,
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
    promo_price: 99000,
    normal_price: 149000,
    promo_duration_months: 2,
    price_per_month: 149000,
    discount_percent: 0,
    original_annual_price: null as null,
    max_barbers: 5,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: false,
    subdomain_revisions: 0,
    can_blast_wa: true,
    kasirEnabled: true,
    maxKasirBarbers: 1,
    features: [
      'Semua fitur Starter',
      'Home Service aktif',
      'Maksimal 5 kapster',
      'Booking tidak terbatas',
      'Laporan pendapatan bulanan',
      'Blast WA ke pelanggan',
      'Kasir Telegram (1 barber)',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    billing_cycle: 'monthly' as const,
    promo_price: 199000,
    normal_price: 299000,
    promo_duration_months: 2,
    price_per_month: 299000,
    discount_percent: 0,
    original_annual_price: null as null,
    max_barbers: 999999,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: false,
    subdomain_revisions: 0,
    can_blast_wa: true,
    kasirEnabled: true,
    maxKasirBarbers: null as null,
    features: [
      'Semua fitur Pro',
      'Kapster tidak terbatas',
      'WA session toko sendiri',
      'Priority support',
      'Kasir Telegram (unlimited barber)',
    ],
  },

  // ── TAHUNAN ────────────────────────────────────────────────
  starter_annual: {
    id: 'starter_annual',
    name: 'Starter Tahunan',
    billing_cycle: 'annual' as const,
    promo_price: null,
    normal_price: 852000,
    promo_duration_months: 0,
    price_per_month: 71000,
    discount_percent: 10,
    original_annual_price: 948000,
    max_barbers: 2,
    max_bookings_per_month: 50,
    max_home_service_per_month: 5,
    custom_subdomain: true,
    subdomain_revisions: 0,      // set 1x, tidak bisa diubah
    can_blast_wa: false,
    kasirEnabled: false,
    maxKasirBarbers: 0,
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
    promo_price: null,
    normal_price: 1430400,
    promo_duration_months: 0,
    price_per_month: 119200,
    discount_percent: 20,
    original_annual_price: 1788000,
    max_barbers: 5,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: true,
    subdomain_revisions: 1,      // bisa ganti 1 kali
    can_blast_wa: true,
    kasirEnabled: true,
    maxKasirBarbers: 1,
    features: [
      'Semua fitur Pro Bulanan',
      'Hemat 20% vs bulanan',
      'Custom subdomain (1x revisi)',
      'Harga terkunci 1 tahun',
      'Kasir Telegram (1 barber)',
    ],
  },
  business_annual: {
    id: 'business_annual',
    name: 'Business Tahunan',
    billing_cycle: 'annual' as const,
    promo_price: null,
    normal_price: 2691000,
    promo_duration_months: 0,
    price_per_month: 224250,
    discount_percent: 25,
    original_annual_price: 3588000,
    max_barbers: 999999,
    max_bookings_per_month: 999999,
    max_home_service_per_month: 999999,
    custom_subdomain: true,
    subdomain_revisions: 3,      // bisa ganti 3 kali
    can_blast_wa: true,
    kasirEnabled: true,
    maxKasirBarbers: null as null,
    features: [
      'Semua fitur Business Bulanan',
      'Hemat 25% vs bulanan',
      'Custom subdomain (3x revisi)',
      'Harga terkunci 1 tahun',
      'Priority support',
      'Kasir Telegram (unlimited barber)',
    ],
  },
} as const;

export interface PlanDetails {
  id: string;
  name: string;
  billing_cycle: 'monthly' | 'annual';
  promo_price: number | null;
  normal_price: number;
  promo_duration_months: number;
  price_per_month: number;
  discount_percent: number;
  original_annual_price: number | null;
  max_barbers: number;
  max_bookings_per_month: number;
  max_home_service_per_month: number;
  custom_subdomain: boolean;
  subdomain_revisions: number;
  can_blast_wa: boolean;
  kasirEnabled: boolean;
  maxKasirBarbers: number | null;
  features: readonly string[];
}

export type PlanId = keyof typeof PLANS;

// ── Helper Functions ────────────────────────────────────────

/** Ambil objek plan berdasarkan ID. Return null jika tidak ditemukan. */
export function getPlanById(planId: string) {
  if (!planId) return null;
  return PLANS[planId.toLowerCase() as PlanId] ?? null;
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
  return (plan.original_annual_price ?? 0) - plan.normal_price;
}

export function getPlanPrice(planId: string, paidCyclesCount: number): number {
  const plan = getPlanById(planId);
  if (!plan) return 0;
  if (plan.promo_price !== null && paidCyclesCount < plan.promo_duration_months) {
    return plan.promo_price;
  }
  return plan.normal_price;
}

export function isInPromo(planId: string, paidCyclesCount: number): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;
  if (plan.promo_price === null) return false;
  return paidCyclesCount < plan.promo_duration_months;
}

export function promoMonthsRemaining(planId: string, paidCyclesCount: number): number {
  const plan = getPlanById(planId);
  if (!plan) return 0;
  if (plan.promo_price === null) return 0;
  const remaining = plan.promo_duration_months - paidCyclesCount;
  return remaining > 0 ? remaining : 0;
}

/** Cek apakah plan bisa menggunakan fitur kasir Telegram.
 *  Trial, Pro, Business (dan semua varian annual) → true
 *  Starter (semua varian) → false */
export function canUseKasir(planId: string): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;
  return plan.kasirEnabled ?? false;
}

/** Ambil batas maksimal barber yang bisa aktif di kasir.
 *  null = unlimited (trial, business, business_annual)
 *  1    = pro, pro_annual
 *  0    = starter, starter_annual */
export function getMaxKasirBarbers(planId: string): number | null {
  const plan = getPlanById(planId);
  if (!plan) return 0;
  return plan.maxKasirBarbers === undefined ? 0 : plan.maxKasirBarbers;
}

/** Cek apakah plan adalah Trial.
 *  Gunakan hanya untuk UI display (banner, label), BUKAN untuk gate fitur.
 *  Contoh: "Kamu sedang dalam masa Trial. Fitur ini tetap tersedia
 *  setelah berlangganan Pro atau Business." */
export function isTrialPlan(planId: string): boolean {
  return planId === 'trial';
}
