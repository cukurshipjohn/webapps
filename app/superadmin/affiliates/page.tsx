"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(amount));
}

export default function SuperadminAffiliatesOverview() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = useCallback(async () => {
    const token = localStorage.getItem("superadmin_token");
    if (!token) { router.replace("/admin/login"); return; }

    setLoading(true); setError("");
    try {
      const res = await fetch("/api/superadmin/affiliates/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) { router.replace("/admin/login"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Gagal memuat overview.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
        ⚠️ {error || "Gagal memuat data."}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">📡 Program Affiliate</h1>
          <p className="text-neutral-400 text-sm mt-1">Ringkasan performa seluruh affiliator</p>
        </div>
        <div className="flex gap-2">
          <Link href="/superadmin/affiliates/list"
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl transition-all text-sm border border-neutral-700">
            👥 Semua Affiliator
          </Link>
          <Link href="/superadmin/affiliates/withdrawals"
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-xl transition-all text-sm">
            🏦 Kelola Pencairan
          </Link>
        </div>
      </div>

      {/* ─── Pending Withdrawals Highlight ─── */}
      {data.pending_withdrawals > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-yellow-400">Ada {data.pending_withdrawals} request pencairan baru!</p>
              <p className="text-yellow-500/80 text-sm">Total dana: {fmt(data.pending_withdrawals_amount)}</p>
            </div>
          </div>
          <Link href="/superadmin/affiliates/withdrawals" className="px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg text-sm shrink-0">
            Lihat Request →
          </Link>
        </div>
      )}

      {/* ─── Main Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-5">
          <p className="text-neutral-400 text-xs">Total Affiliator</p>
          <p className="text-2xl font-black text-white mt-1">{data.total_affiliates}</p>
          <p className="text-xs text-neutral-500 mt-1">{data.active_affiliates} aktif</p>
        </div>
        <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-5">
          <p className="text-neutral-400 text-xs">Pending Approval</p>
          <p className="text-2xl font-black text-yellow-400 mt-1">{data.pending_approval}</p>
          <p className="text-xs text-neutral-500 mt-1">Reseller menunggu setuju</p>
        </div>
        <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-5">
          <p className="text-neutral-400 text-xs">Konversi Referrals</p>
          <p className="text-2xl font-black text-white mt-1">{data.overall_conversion_rate}%</p>
          <p className="text-xs text-neutral-500 mt-1">{data.total_paid_referrals} dari {data.total_referrals_all_time}</p>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-5">
          <p className="text-neutral-400 text-xs text-green-400/80">Total Komisi Terbayar</p>
          <p className="text-2xl font-black text-green-400 mt-1">{fmt(data.total_commission_paid)}</p>
          <p className="text-xs text-neutral-500 mt-1">{fmt(data.total_commission_pending)} masih pending</p>
        </div>
      </div>

      {/* ─── Top 5 Affiliates ─── */}
      <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">🏆 Top 5 Affiliator Aktif</h2>
        {data.top_affiliates.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-6">Belum ada data prestasi affiliator.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-neutral-500 uppercase bg-neutral-950/50">
                <tr>
                  <th className="px-4 py-3 rounded-l-xl">Nama</th>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3 text-right">Referral Paid</th>
                  <th className="px-4 py-3 text-right rounded-r-xl">Total Diterima</th>
                </tr>
              </thead>
              <tbody>
                {data.top_affiliates.map((aff: any, i: number) => (
                  <tr key={i} className="border-b border-neutral-800/50 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                       {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "⭐"} {aff.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-400/80 text-xs">{aff.referral_code}</td>
                    <td className="px-4 py-3 text-right font-bold text-white">{aff.total_paid_referrals}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-medium">{fmt(aff.total_earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
