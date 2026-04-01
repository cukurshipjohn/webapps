"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function fmt(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(amount));
}

const TABS = [
  { id: "", label: "Semua" },
  { id: "pending", label: "Menunggu" },
  { id: "active", label: "Aktif" },
  { id: "suspended", label: "Di-suspend" },
];

export default function SuperadminAffiliatesList() {
  const router = useRouter();
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchAffiliates = useCallback(async () => {
    const token = localStorage.getItem("superadmin_token");
    if (!token) { router.replace("/admin/login"); return; }

    setLoading(true); setError("");
    try {
      const url = `/api/superadmin/affiliates${statusFilter ? `?status=${statusFilter}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) { router.replace("/admin/login"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setAffiliates(json.affiliates || []);
    } catch (err: any) {
      setError(err.message || "Gagal memuat list.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => { fetchAffiliates(); }, [fetchAffiliates]);

  const updateStatus = async (affiliateId: string, action: string) => {
    if (!confirm(`Yakin ingin melakukan action: ${action}?`)) return;
    try {
      const token = localStorage.getItem("superadmin_token");
      const res = await fetch("/api/superadmin/affiliates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ affiliate_id: affiliateId, action }),
      });
      if (res.ok) fetchAffiliates();
      else alert("Gagal update status.");
    } catch (err) { alert("Error saat update."); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/superadmin/affiliates" className="text-neutral-400 hover:text-white transition-colors">← Kembali</Link>
        <h1 className="text-2xl font-black text-white ml-2">Daftar Affiliator</h1>
      </div>

      <div className="flex gap-2 border-b border-cyan-900/30 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setStatusFilter(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0 ${
              statusFilter === t.id ? "border-cyan-500 text-cyan-400" : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"/></div>
      ) : error ? (
        <div className="bg-red-500/10 text-red-400 p-4 rounded-xl text-sm">{error}</div>
      ) : affiliates.length === 0 ? (
        <div className="text-center py-20 text-neutral-600">Tidak ada data.</div>
      ) : (
        <div className="bg-neutral-900/60 border border-cyan-900/30 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#071120] text-neutral-400">
                <tr>
                  <th className="px-5 py-4">Nama & Kontak</th>
                  <th className="px-5 py-4">Tier</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Referral Paid</th>
                  <th className="px-5 py-4 text-right">Konversi</th>
                  <th className="px-5 py-4 text-right">Saldo Pending</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {affiliates.map(a => (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <p className="font-bold text-white">{a.name}</p>
                      <p className="text-neutral-500 text-xs">{a.phone}</p>
                      <span className="inline-block mt-1 text-[10px] font-mono bg-neutral-800 text-cyan-400 px-2 py-0.5 rounded">
                        {a.referral_code}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {a.tier === 'reseller' 
                        ? <span className="text-violet-400 font-medium">Reseller</span> 
                        : <span className="text-amber-400 font-medium">Referral</span>}<br/>
                      <span className="text-xs text-neutral-500">{a.commission_rate}% {a.commission_type}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded text-xs border ${
                        a.status === 'active' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                        a.status === 'pending' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                        'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-white font-medium">{a.total_paid_referrals}</td>
                    <td className="px-5 py-4 text-right text-neutral-400">{a.conversion_rate}%</td>
                    <td className="px-5 py-4 text-right text-yellow-400">{fmt(a.pending_balance)}</td>
                    <td className="px-5 py-4 text-right flex gap-2 justify-end">
                      {a.status === 'pending' && a.tier === 'reseller' && (
                        <button onClick={() => updateStatus(a.id, 'approve')} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-bold">Approve</button>
                      )}
                      {a.status === 'active' && (
                        <button onClick={() => updateStatus(a.id, 'suspend')} className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded text-xs border border-red-500/30">Suspend</button>
                      )}
                      {a.status === 'suspended' && (
                        <button onClick={() => updateStatus(a.id, 'activate')} className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded text-xs border border-green-500/30">Activate</button>
                      )}
                      <Link href={`/superadmin/affiliates/${a.id}`} className="px-3 py-1.5 bg-neutral-800 text-white rounded text-xs hover:bg-neutral-700">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
