"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function fmt(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

export default function SuperadminAffiliateDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchDetail = useCallback(async () => {
    const token = localStorage.getItem("superadmin_token");
    if (!token) { router.replace("/admin/login"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/superadmin/affiliates/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) { router.replace("/admin/login"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Gagal memuat detail affiliator.");
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleUpdateStatus = async (action: string) => {
    if (!confirm(`Yakin ingin melakukan action: ${action}?`)) return;
    setIsUpdating(true);
    try {
      const token = localStorage.getItem("superadmin_token");
      const res = await fetch("/api/superadmin/affiliates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ affiliate_id: params.id, action })
      });
      if (!res.ok) throw new Error("Gagal update status");
      fetchDetail();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateRate = async () => {
    const rateStr = prompt("Masukkan rate komisi baru (%)", data?.profile?.commission_rate);
    if (!rateStr) return;
    const rate = Number(rateStr);
    if (isNaN(rate) || rate < 1 || rate > 100) { alert("Rate tidak valid"); return; }
    
    setIsUpdating(true);
    try {
      const token = localStorage.getItem("superadmin_token");
      const res = await fetch("/api/superadmin/affiliates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ affiliate_id: params.id, action: "update_rate", commission_rate: rate })
      });
      if (!res.ok) throw new Error("Gagal update rate");
      fetchDetail();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"/></div>;
  }
  if (error || !data) {
    return <div className="bg-red-500/10 text-red-400 p-4 rounded-xl text-sm">{error || "Data tidak ditemukan"}</div>;
  }

  const { profile, commissions, referrals, clicks_by_week, withdrawals } = data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between border-b border-cyan-900/30 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/superadmin/affiliates/list" className="text-neutral-400 hover:text-white transition-colors">← Kembali</Link>
          <h1 className="text-2xl font-black text-white ml-2">Profil Affiliator</h1>
        </div>
        <div className="flex gap-2">
           {profile.status === 'active' && (
             <button onClick={() => handleUpdateStatus('suspend')} disabled={isUpdating} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium rounded-xl text-sm border border-red-500/20">Suspend</button>
           )}
           {profile.status === 'suspended' && (
             <button onClick={() => handleUpdateStatus('activate')} disabled={isUpdating} className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 font-medium rounded-xl text-sm border border-green-500/20">Aktifkan</button>
           )}
           {profile.status === 'pending' && profile.tier === 'reseller' && (
             <button onClick={() => handleUpdateStatus('approve')} disabled={isUpdating} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-xl text-sm">Setujui Reseller</button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Kolom Kiri: Profil & Bank ─── */}
        <div className="space-y-6">
          <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">👤</span>
              <div>
                <p className="font-bold text-white text-lg">{profile.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${profile.tier === 'reseller' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                    {profile.tier}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${profile.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/30' : profile.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                    {profile.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-cyan-900/20 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-neutral-500">Telepon</span><span className="text-white">{profile.phone}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Kode Referral</span><span className="font-mono text-cyan-400 bg-cyan-500/10 px-2 rounded">{profile.referral_code}</span></div>
              <div className="flex justify-between items-center"><span className="text-neutral-500">Rate Komisi</span>
                <span className="text-white flex items-center gap-2">
                  {profile.commission_rate}% {profile.commission_type}
                  <button onClick={handleUpdateRate} className="text-cyan-500 text-xs hover:underline">Ubah</button>
                </span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-6">
            <h2 className="font-bold text-white mb-4">Informasi Rekening</h2>
            {profile.bank_account_number ? (
              <div className="text-sm space-y-1 bg-[#071120] p-4 rounded-xl border border-cyan-900/20">
                <p className="text-neutral-400 text-xs">Bank / E-Wallet</p>
                <p className="text-white font-bold">{profile.bank_name}</p>
                <p className="text-neutral-300 mt-2">{profile.bank_account_number}</p>
                <p className="text-neutral-500 text-xs">a.n. {profile.bank_account_name}</p>
              </div>
            ) : (
              <p className="text-sm text-neutral-600 italic">Belum ada rekening didaftarkan.</p>
            )}
          </div>

          <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-6">
             <h2 className="font-bold text-white mb-4">Klik per Minggu</h2>
             <div className="space-y-2">
               {clicks_by_week.length === 0 ? (
                 <p className="text-xs text-neutral-600">Belum ada klik dicatat.</p>
               ) : (
                 clicks_by_week.map((w: any, i: number) => (
                   <div key={i} className="flex justify-between text-sm py-1 border-b border-neutral-800/50 last:border-0">
                     <span className="text-neutral-400">{w.week}</span>
                     <span className="text-white">{w.clicks} klik {w.conversions > 0 ? <span className="text-cyan-400 text-xs border border-cyan-500/20 px-1 ml-1 rounded">+{w.conversions}</span> : ''}</span>
                   </div>
                 ))
               )}
             </div>
          </div>
        </div>

        {/* ─── Kolom Kanan: Stats, Referral, Komisi ─── */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-4 text-center">
              <p className="text-neutral-400 text-xs">Total Klik</p>
              <p className="text-xl font-black text-white mt-1">{profile.total_clicks}</p>
            </div>
            <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-4 text-center">
              <p className="text-neutral-400 text-xs">Referral Aktif</p>
              <p className="text-xl font-black text-cyan-400 mt-1">{profile.total_paid_referrals}</p>
            </div>
            <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-4 text-center">
              <p className="text-neutral-400 text-xs">Konversi</p>
              <p className="text-xl font-black text-white mt-1">{profile.conversion_rate}%</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
              <p className="text-neutral-400 text-xs text-green-400">Total Diterima</p>
              <p className="text-xl font-black text-green-400 mt-1">{fmt(profile.total_earned)}</p>
            </div>
          </div>

          <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-6">
            <h2 className="font-bold text-white mb-4">Daftar Referral ({referrals.length})</h2>
            <div className="overflow-x-auto max-h-80 relative">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-neutral-500 bg-[#071120] sticky top-0 shadow-md">
                  <tr>
                    <th className="px-4 py-2">Toko</th>
                    <th className="px-4 py-2 text-right">Tanggal Daftar</th>
                    <th className="px-4 py-2">Plan</th>
                    <th className="px-4 py-2">Status Affiliate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {referrals.map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <p className="font-bold text-white text-xs">{r.tenants.shop_name}</p>
                        <p className="text-[10px] text-cyan-500/80">{r.tenants.slug}.cukurship.id</p>
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-400 text-xs">
                        {new Date(r.registered_at).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-300 capitalize">{r.tenants.plan}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${
                          r.status === 'converted' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                          r.status === 'churned' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                          'bg-neutral-800 text-neutral-400 border-neutral-700'
                        }`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                  {referrals.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-neutral-600">Belum ada referral</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white">Riwayat Komisi ({commissions.length})</h2>
              {profile.pending_balance > 0 && <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">Pending: {fmt(profile.pending_balance)}</span>}
            </div>
            <div className="overflow-x-auto max-h-80 relative">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-neutral-500 bg-[#071120] sticky top-0 shadow-md">
                  <tr>
                    <th className="px-4 py-2">Toko</th>
                    <th className="px-4 py-2 text-right">Nilai Trx</th>
                    <th className="px-4 py-2 text-right">Komisi</th>
                    <th className="px-4 py-2 text-center">Tipe</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {commissions.map((c: any) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-xs text-white">{c.tenants.shop_name}</td>
                      <td className="px-4 py-2 text-right text-xs text-neutral-400">{fmt(c.transaction_amount)}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-amber-400">{fmt(c.amount)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.type === 'recurring' ? 'bg-violet-500/20 text-violet-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{c.type}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase border ${
                          c.status === 'paid' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                          c.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                          c.status === 'processing' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                          c.status === 'available' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                  {commissions.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-neutral-600">Belum ada komisi</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
