/**
 * lib/affiliate.ts
 * Utility functions untuk sistem Affiliate & Referral CukurShip.
 */

/**
 * Generate kode referral unik berdasarkan nama affiliator.
 * Format: REF-[6 karakter nama]-[4 karakter random]
 * Contoh: REF-JOHNDOE-X7K2
 */
export function generateReferralCode(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REF-${prefix}-${suffix}`;
}

/**
 * Hitung jumlah komisi berdasarkan nominal transaksi dan persentase.
 * Dibulatkan ke bawah (floor) agar tidak ada pecahan rupiah.
 */
export function calculateCommission(
  transactionAmount: number,
  commissionRate: number
): number {
  return Math.floor((transactionAmount * commissionRate) / 100);
}

/**
 * Hitung tanggal komisi tersedia untuk dicairkan.
 * Default: 7 hari setelah pembayaran (holding period untuk refund window).
 */
export function getCommissionAvailableDate(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Format angka ke format Rupiah Indonesia.
 * Contoh: 150000 → "Rp 150.000"
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

// ─── Auth: Verifikasi token affiliator dari request header / cookie ────────────
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export function getAffiliateFromToken(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token =
    authHeader?.replace('Bearer ', '') ??
    request.cookies.get('affiliate_token')?.value;

  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    if (payload.role !== 'affiliate') return null;
    return {
      affiliateId: payload.affiliate_id as string,
      phone: payload.phone as string,
      name: payload.name as string,
      tier: payload.tier as string,
    };
  } catch {
    return null;
  }
}
