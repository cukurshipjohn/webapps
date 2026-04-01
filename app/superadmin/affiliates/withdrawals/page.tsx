"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(amount));
}

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Semua" },
  { value: "requested", label: "Menunggu" },
  { value: "processing", label: "Diproses" },
  { value: "paid", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  requested:  { label: "Menunggu",  cls: "bg-neutral-700/60 border-neutral-600 text-neutral-300" },
  processing: { label: "Diproses",  cls: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" },
  paid:       { label: "Selesai ✓", cls: "bg-green-500/10 border-green-500/30 text-green-400" },
  rejected:   { label: "Ditolak",   cls: "bg-red-500/10 border-red-500/30 text-red-400" },
};

type Withdrawal = {
  id: string;
  amount: number;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
  status: string;
  requested_at: string;
  processed_at: string | null;
  admin_notes: string | null;
  transfer_proof_url: string | null;
  commission_ids: string[];
  affiliates: { id: string; name: string; phone: string; tier: string };
};

// ─── Modal ────────────────────────────────────────────────────────────────────
function ActionModal({
  withdrawal,
  action,
  onClose,
  onDone,
}: {
  withdrawal: Withdrawal;
  action: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const [adminNotes, setAdminNotes] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (action === "reject" && !adminNotes.trim()) {
      setError("Alasan penolakan wajib diisi."); return;
    }
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("superadmin_token") || localStorage.getItem("token");
      const res = await fetch("/api/superadmin/affiliates/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          withdrawal_id: withdrawal.id,
          action,
          admin_notes: adminNotes || undefined,
          transfer_proof_url: proofUrl || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal memproses.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {action === "approve" ? "✅ Konfirmasi Transfer" : "❌ Tolak Request"}
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors text-xl">×</button>
        </div>

        {/* Ringkasan */}
        <div className="bg-neutral-800/60 border border-neutral-700 rounded-xl p-4 text-sm space-y-1">
          <p className="text-white font-bold text-lg">{fmt(withdrawal.amount)}</p>
          <p className="text-neutral-300">{withdrawal.affiliates.name} — {withdrawal.affiliates.phone}</p>
          <p className="text-neutral-400">{withdrawal.bank_name} {withdrawal.bank_account_number}</p>
          <p className="text-neutral-500 text-xs">a.n. {withdrawal.bank_account_name}</p>
        </div>

        {action === "approve" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">URL Bukti Transfer (opsional)</label>
            <input
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500 transition-all"
            />
          </div>
        )}

        {action === "reject" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">
              Alasan Penolakan <span className="text-red-400">*</span>
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Rekening tidak valid, saldo tidak cukup, dll..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 transition-all resize-none"
            />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium rounded-xl transition-all text-sm"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex-1 py-3 font-bold rounded-xl transition-all text-sm disabled:opacity-40 flex items-center justify-center gap-2 ${
              action === "approve"
                ? "bg-green-500 hover:bg-green-400 text-black"
                : "bg-red-500 hover:bg-red-400 text-white"
            }`}
          >
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
            {action === "approve" ? "Konfirmasi Selesai" : "Tolak Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperadminWithdrawalsPage() {
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<{ withdrawal: Withdrawal; action: "approve" | "reject" } | null>(null);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("superadmin_token") || localStorage.getItem("token");
    if (!token) { router.replace("/admin/login"); return; }

    setLoading(true); setError("");
    try {
      const url = `/api/superadmin/affiliates/withdrawals${statusFilter ? `?status=${statusFilter}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) { router.replace("/admin/login"); return; }
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setWithdrawals(d.withdrawals || []);
    } catch (err: any) {
      setError(err.message || "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = {
    requested: withdrawals.filter((w) => w.status === "requested").length,
    processing: withdrawals.filter((w) => w.status === "processing").length,
    totalAmount: withdrawals.filter((w) => ["requested", "processing"].includes(w.status)).reduce((s, w) => s + Number(w.amount), 0),
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto p-6 space-y-8">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">💸 Request Pencairan</h1>
            <p className="text-neutral-400 text-sm mt-1">Kelola semua request pencairan komisi affiliator</p>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-sm font-medium rounded-xl transition-all"
          >
            🔄 Refresh
          </button>
        </div>

        {/* ─── Stats ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
            <p className="text-neutral-400 text-xs">Menunggu Diproses</p>
            <p className="text-3xl font-black text-amber-400">{stats.requested}</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5">
            <p className="text-neutral-400 text-xs">Sedang Diproses</p>
            <p className="text-3xl font-black text-yellow-400">{stats.processing}</p>
          </div>
          <div className="bg-neutral-800/60 border border-neutral-700 rounded-2xl p-5">
            <p className="text-neutral-400 text-xs">Total Pending Amount</p>
            <p className="text-2xl font-black text-white">{fmt(stats.totalAmount)}</p>
          </div>
        </div>

        {/* ─── Filter ─── */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                statusFilter === opt.value
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ─── Error ─── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* ─── Loading ─── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-20 text-neutral-600">
            <p className="text-5xl mb-3">📭</p>
            <p className="text-lg">Tidak ada request pencairan.</p>
          </div>
        ) : (
          /* ─── Table ─── */
          <div className="space-y-3">
            {withdrawals.map((w) => {
              const sb = STATUS_BADGE[w.status] ?? { label: w.status, cls: "bg-neutral-700 border-neutral-600 text-neutral-400" };
              const isActionable = w.status === "requested" || w.status === "processing";
              return (
                <div
                  key={w.id}
                  className={`bg-neutral-900/60 border rounded-2xl p-5 transition-all ${
                    isActionable ? "border-neutral-700 hover:border-neutral-600" : "border-neutral-800/60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Left info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-2xl font-black text-white">{fmt(w.amount)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${sb.cls}`}>{sb.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${w.affiliates.tier === "reseller" ? "bg-violet-500/10 border-violet-500/30 text-violet-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"}`}>
                          {w.affiliates.tier}
                        </span>
                      </div>
                      <p className="text-white font-semibold">{w.affiliates.name}
                        <span className="text-neutral-500 font-normal text-sm ml-2">— {w.affiliates.phone}</span>
                      </p>
                      <p className="text-neutral-400 text-sm">
                        {w.bank_name} <span className="text-neutral-300 font-medium">{w.bank_account_number}</span> a.n. {w.bank_account_name}
                      </p>
                      <p className="text-neutral-600 text-xs">
                        Request: {new Date(w.requested_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {w.admin_notes && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-xs text-red-300 mt-2">
                          <span className="font-semibold">Catatan Admin: </span>{w.admin_notes}
                        </div>
                      )}
                    </div>

                    {/* Right actions */}
                    {isActionable && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setModal({ withdrawal: w, action: "reject" })}
                          className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium rounded-xl transition-all"
                        >
                          ❌ Tolak
                        </button>
                        <button
                          onClick={() => setModal({ withdrawal: w, action: "approve" })}
                          className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-bold rounded-xl transition-all"
                        >
                          ✅ Proses
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Modal ─── */}
      {modal && (
        <ActionModal
          withdrawal={modal.withdrawal}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
