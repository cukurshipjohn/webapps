"use strict";
// ============================================================
// CukurShip — Single Source of Truth untuk semua Plan Langganan
// Jangan hardcode plan/harga di tempat lain — selalu import dari sini
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANS = void 0;
exports.getPlanById = getPlanById;
exports.getPlan = getPlan;
exports.isAnnualPlan = isAnnualPlan;
exports.getPlanDurationDays = getPlanDurationDays;
exports.getBasePlanId = getBasePlanId;
exports.canCustomSubdomain = canCustomSubdomain;
exports.getSubdomainRevisions = getSubdomainRevisions;
exports.canBlastWA = canBlastWA;
exports.getHomeServiceLimit = getHomeServiceLimit;
exports.getAnnualSavings = getAnnualSavings;
exports.getPlanPrice = getPlanPrice;
exports.isInPromo = isInPromo;
exports.promoMonthsRemaining = promoMonthsRemaining;
exports.PLANS = {
    // ── BULANAN ────────────────────────────────────────────────
    trial: {
        id: 'trial',
        name: 'Trial',
        billing_cycle: 'monthly',
        promo_price: null,
        normal_price: 0,
        promo_duration_months: 0,
        price_per_month: 0,
        discount_percent: 0,
        original_annual_price: null,
        max_barbers: 1,
        max_bookings_per_month: 10,
        max_home_service_per_month: 0,
        custom_subdomain: false,
        subdomain_revisions: 0,
        can_blast_wa: false,
        features: [
            'Fitur dasar uji coba gratis'
        ],
    },
    starter: {
        id: 'starter',
        name: 'Starter',
        billing_cycle: 'monthly',
        promo_price: 49000,
        normal_price: 79000,
        promo_duration_months: 2,
        price_per_month: 79000,
        discount_percent: 0,
        original_annual_price: null,
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
        billing_cycle: 'monthly',
        promo_price: 99000,
        normal_price: 149000,
        promo_duration_months: 2,
        price_per_month: 149000,
        discount_percent: 0,
        original_annual_price: null,
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
        billing_cycle: 'monthly',
        promo_price: 199000,
        normal_price: 299000,
        promo_duration_months: 2,
        price_per_month: 299000,
        discount_percent: 0,
        original_annual_price: null,
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
        billing_cycle: 'annual',
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
        subdomain_revisions: 0, // set 1x, tidak bisa diubah
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
        billing_cycle: 'annual',
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
        subdomain_revisions: 1, // bisa ganti 1 kali
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
        billing_cycle: 'annual',
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
        subdomain_revisions: 3, // bisa ganti 3 kali
        can_blast_wa: true,
        features: [
            'Semua fitur Business Bulanan',
            'Hemat 25% vs bulanan',
            'Custom subdomain (3x revisi)',
            'Harga terkunci 1 tahun',
            'Priority support',
        ],
    },
};
// ── Helper Functions ────────────────────────────────────────
/** Ambil objek plan berdasarkan ID. Return null jika tidak ditemukan. */
function getPlanById(planId) {
    var _a;
    return (_a = exports.PLANS[planId]) !== null && _a !== void 0 ? _a : null;
}
/** @deprecated Gunakan getPlanById(). Alias untuk backward compatibility. */
function getPlan(key) {
    return getPlanById(key);
}
/** Cek apakah plan adalah paket tahunan. */
function isAnnualPlan(planId) {
    return planId.endsWith('_annual');
}
/** Durasi plan dalam hari: 365 untuk tahunan, 30 untuk bulanan. */
function getPlanDurationDays(planId) {
    return isAnnualPlan(planId) ? 365 : 30;
}
/** Ambil base plan ID dari annual plan (misal: 'pro_annual' → 'pro'). */
function getBasePlanId(planId) {
    return planId.replace('_annual', '');
}
/** Cek apakah plan mendukung custom subdomain. */
function canCustomSubdomain(planId) {
    var _a, _b;
    return (_b = (_a = getPlanById(planId)) === null || _a === void 0 ? void 0 : _a.custom_subdomain) !== null && _b !== void 0 ? _b : false;
}
/** Jumlah revisi custom subdomain yang diizinkan. */
function getSubdomainRevisions(planId) {
    var _a, _b;
    return (_b = (_a = getPlanById(planId)) === null || _a === void 0 ? void 0 : _a.subdomain_revisions) !== null && _b !== void 0 ? _b : 0;
}
/** Cek apakah plan memiliki fitur Blast WA. */
function canBlastWA(planKey) {
    var _a, _b;
    return (_b = (_a = getPlanById(planKey)) === null || _a === void 0 ? void 0 : _a.can_blast_wa) !== null && _b !== void 0 ? _b : false;
}
/** Ambil batas home service per bulan. Kembalikan 999999 jika unlimited. */
function getHomeServiceLimit(planKey) {
    var _a, _b;
    return (_b = (_a = getPlanById(planKey)) === null || _a === void 0 ? void 0 : _a.max_home_service_per_month) !== null && _b !== void 0 ? _b : 5;
}
/** Ambil jumlah penghematan tahunan dalam Rupiah. */
function getAnnualSavings(planId) {
    var _a;
    var plan = getPlanById(planId);
    if (!plan || plan.billing_cycle !== 'annual')
        return 0;
    return ((_a = plan.original_annual_price) !== null && _a !== void 0 ? _a : 0) - plan.normal_price;
}
function getPlanPrice(planId, paidCyclesCount) {
    var plan = getPlanById(planId);
    if (!plan)
        return 0;
    if (plan.promo_price !== null && paidCyclesCount < plan.promo_duration_months) {
        return plan.promo_price;
    }
    return plan.normal_price;
}
function isInPromo(planId, paidCyclesCount) {
    var plan = getPlanById(planId);
    if (!plan)
        return false;
    if (plan.promo_price === null)
        return false;
    return paidCyclesCount < plan.promo_duration_months;
}
function promoMonthsRemaining(planId, paidCyclesCount) {
    var plan = getPlanById(planId);
    if (!plan)
        return 0;
    if (plan.promo_price === null)
        return 0;
    var remaining = plan.promo_duration_months - paidCyclesCount;
    return remaining > 0 ? remaining : 0;
}
