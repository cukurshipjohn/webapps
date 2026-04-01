"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────
interface DashboardData {
  profile: {
    name: string; email: string | null; phone: string; referral_code: string; tier: string;
    commission_rate: number; commission_type: string; status: string;
    bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null;
    total_clicks: number; total_referrals: number; total_paid_referrals: number;
  };
  balance: { pending: number; available: number; paid_out: number; total_earned: number };
  recent_commissions: any[];
  recent_referrals: any[];
  conversion_rate: number;
  withdrawals: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "Pending",    cls: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" },
    available: { label: "Tersedia",   cls: "bg-green-500/10 border-green-500/30 text-green-400" },
    paid:      { label: "Dibayar",    cls: "bg-neutral-700/50 border-neutral-600 text-neutral-400" },
    registered:{ label: "Mendaftar",  cls: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
    converted: { label: "Sudah Bayar",cls: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
    churned:   { label: "Churn",      cls: "bg-red-500/10 border-red-500/30 text-red-400" },
  };
  const v = map[status] ?? { label: status, cls: "bg-neutral-700 border-neutral-600 text-neutral-400" };
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${v.cls}`}>{v.label}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AffiliateDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "commission" | "referral" | "withdrawal" | "profile">("summary");
  const [commissionFilter, setCommissionFilter] = useState("all");
  const [copied, setCopied] = useState(false);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const BANKS = [
    "BCA", "BNI", "BRI", "Mandiri", "BSI", "CIMB Niaga",
    "OVO", "GoPay", "DANA", "ShopeePay", "SeaBank",
  ];

  const handleEditProfileInit = () => {
    setProfileForm({
      name: data?.profile.name || "",
      email: data?.profile.email || "",
      bank_name: data?.profile.bank_name || "",
      bank_account_number: data?.profile.bank_account_number || "",
      bank_account_name: data?.profile.bank_account_name || "",
    });
    setProfileError("");
    setProfileSuccess("");
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.name) { setProfileError("Nama wajib diisi."); return; }
    
    setProfileLoading(true);
    setProfileError("");
    setProfileSuccess("");
    
    try {
      const token = localStorage.getItem("affiliate_token");
      const res = await fetch("/api/affiliate/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(profileForm)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      
      setProfileSuccess(json.message);
      setIsEditingProfile(false);
      fetchDashboard();
    } catch (err: any) {
      setProfileError(err.message || "Gagal menyimpan profil.");
    } finally {
      setProfileLoading(false);
    }
  };

  // Withdrawal state
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");
  const [withdrawHistory, setWithdrawHistory] = useState<any[]>([]);

  const fetchDashboard = useCallback(async () => {
    const token = localStorage.getItem("affiliate_token");
    if (!token) { router.replace("/affiliate/login"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/affiliate/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.replace("/affiliate/login"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Gagal memuat dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const fetchWithdrawals = useCallback(async () => {
    const token = localStorage.getItem("affiliate_token");
    if (!token) return;
    try {
      const res = await fetch("/api/affiliate/withdraw", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setWithdrawHistory(d.withdrawals || []); }
    } catch {}
  }, []);

  useEffect(() => { if (activeTab === "withdrawal") fetchWithdrawals(); }, [activeTab, fetchWithdrawals]);

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    setWithdrawError(""); setWithdrawSuccess("");
    if (!amount || isNaN(amount)) { setWithdrawError("Masukkan jumlah yang valid."); return; }
    setWithdrawLoading(true);
    try {
      const token = localStorage.getItem("affiliate_token");
      const res = await fetch("/api/affiliate/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setWithdrawSuccess("Request pencairan berhasil dikirim! Proses 1-2 hari kerja.");
      setWithdrawAmount("");
      fetchDashboard(); // Refresh saldo
      fetchWithdrawals();
    } catch (err: any) {
      setWithdrawError(err.message || "Gagal request pencairan.");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("affiliate_token");
    localStorage.removeItem("affiliate");
    router.push("/affiliate/login");
  };

  const handleCopyLink = () => {
    if (!data) return;
    navigator.clipboard.writeText(`https://cukurship.id/register?ref=${data.profile.referral_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!data) return;
    const shareUrl = `https://cukurship.id/register?ref=${data.profile.referral_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Daftar CukurShip", text: "Kelola barbershopmu dengan sistem booking modern!", url: shareUrl });
      } catch {}
    } else {
      window.open(`https://wa.me/?text=Daftar%20CukurShip%20sekarang!%20https%3A%2F%2Fcukurship.id%2Fregister%3Fref%3D${data.profile.referral_code}`, "_blank");
    }
  };

  // ─── Loading / Error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-neutral-400">
          <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p>Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-red-400">⚠️ {error || "Gagal memuat data."}</p>
          <button onClick={fetchDashboard} className="px-6 py-2 bg-amber-500 text-black font-bold rounded-xl">Coba Lagi</button>
        </div>
      </div>
    );
  }

  const { profile, balance, recent_commissions, recent_referrals, conversion_rate, withdrawals } = data;
  const ROOT = "cukurship.id";
  const referralLink = `https://${ROOT}/register?ref=${profile.referral_code}`;

  const tabs = [
    { id: "summary",    label: "Ringkasan",  icon: "📊" },
    { id: "commission", label: "Komisi",     icon: "💰" },
    { id: "referral",   label: "Referral",   icon: "👥" },
    { id: "withdrawal", label: "Pencairan",  icon: "🏦" },
    { id: "profile",    label: "Profil",     icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ─── Sidebar + Main Layout ─────────────────────────────────────────── */}
      <div className="flex min-h-screen">

        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col w-64 bg-neutral-900/80 border-r border-neutral-800 p-6 gap-2 fixed h-full">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">💼</span>
              <span className="font-black text-amber-400 text-lg">Affiliator</span>
            </div>
            <p className="text-neutral-500 text-xs truncate">{profile.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full border mt-1 inline-block ${profile.tier === 'reseller' ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
              {profile.tier === "reseller" ? "🚀 Reseller" : "🎯 Referral"} — {profile.commission_rate}%
            </span>
          </div>

          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === t.id
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-neutral-800">
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all w-full">
              <span>🚪</span> Keluar
            </button>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 lg:ml-64 p-6">
          {/* Mobile Tab Scroll */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-4 mb-6 -mx-6 px-6 scrollbar-hide">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === t.id
                    ? "bg-amber-500 text-black"
                    : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ══ TAB: RINGKASAN ══════════════════════════════════════════════ */}
          {activeTab === "summary" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-white">Halo, {profile.name.split(" ")[0]}! 👋</h1>
                <p className="text-neutral-400 text-sm mt-1">Berikut ringkasan aktivitas affiliasi kamu.</p>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Klik", value: profile.total_clicks.toLocaleString("id-ID"), icon: "👆", color: "blue" },
                  { label: "Pendaftar",  value: profile.total_referrals.toLocaleString("id-ID"), icon: "🏪", color: "amber" },
                  { label: "Sudah Bayar",value: profile.total_paid_referrals.toLocaleString("id-ID"), icon: "✅", color: "green" },
                  { label: "Konversi",   value: `${conversion_rate}%`, icon: "📈", color: "violet" },
                ].map((s) => (
                  <div key={s.label} className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5">
                    <div className="text-2xl mb-2">{s.icon}</div>
                    <p className="text-2xl font-black text-white">{s.value}</p>
                    <p className="text-neutral-500 text-xs mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Saldo Card */}
              <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-white">💰 Saldo Komisi</h2>
                  <span className="text-xs text-neutral-500">Hold 7 hari dari transaksi</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  <div className="text-center p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <p className="text-xs text-neutral-400 mb-1">Tersedia</p>
                    <p className="text-2xl font-black text-green-400">{fmt(balance.available)}</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <p className="text-xs text-neutral-400 mb-1">Pending (Hold)</p>
                    <p className="text-2xl font-black text-yellow-400">{fmt(balance.pending)}</p>
                  </div>
                  <div className="text-center p-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
                    <p className="text-xs text-neutral-400 mb-1">Total Diterima</p>
                    <p className="text-2xl font-black text-white">{fmt(balance.total_earned)}</p>
                  </div>
                </div>

                <button
                  disabled={balance.available < 50000}
                  onClick={() => setActiveTab("withdrawal")}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {balance.available < 50000
                    ? `Cairkan Saldo (Min. ${fmt(50000)})`
                    : `Cairkan ${fmt(balance.available)} →`}
                </button>
              </div>

              {/* Referral Link Card */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">🔗 Link Referral Kamu</h2>
                <div className="flex items-center gap-3 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 mb-4">
                  <p className="flex-1 text-amber-400 font-mono text-sm truncate">{referralLink}</p>
                  <span className="text-neutral-600 text-xs font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg text-amber-400">
                    {profile.referral_code}
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-sm font-medium rounded-xl transition-all"
                  >
                    {copied ? "✅ Tersalin!" : "📋 Salin Link"}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex-1 py-2.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium rounded-xl transition-all"
                  >
                    📤 Bagikan via WA
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ TAB: KOMISI ═════════════════════════════════════════════════ */}
          {activeTab === "commission" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-black text-white">💰 Riwayat Komisi</h1>

              <div className="flex gap-2 flex-wrap">
                {["all", "pending", "available", "paid"].map((f) => (
                  <button key={f} onClick={() => setCommissionFilter(f)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
                      commissionFilter === f ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {f === "all" ? "Semua" : f === "pending" ? "Pending" : f === "available" ? "Tersedia" : "Dibayar"}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {recent_commissions
                  .filter((c) => commissionFilter === "all" || c.status === commissionFilter)
                  .map((c) => (
                    <div key={c.id} className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-white">{(c.tenants as any)?.shop_name || "Toko"}</p>
                          <p className="text-neutral-500 text-xs mt-0.5">
                            Transaksi: {fmt(c.transaction_amount)} — Komisi {c.commission_rate}%
                          </p>
                          <p className="text-neutral-600 text-xs mt-0.5">
                            {new Date(c.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-black text-amber-400">{fmt(c.amount)}</p>
                          <StatusBadge status={c.status} />
                          {c.status === "pending" && c.available_at && (
                            <p className="text-neutral-600 text-xs mt-1">
                              Cair: {new Date(c.available_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                {recent_commissions.filter((c) => commissionFilter === "all" || c.status === commissionFilter).length === 0 && (
                  <div className="text-center py-12 text-neutral-600">
                    <p className="text-4xl mb-2">📭</p>
                    <p>Belum ada komisi.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ TAB: REFERRAL ═══════════════════════════════════════════════ */}
          {activeTab === "referral" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-black text-white">👥 Daftar Referral</h1>
              <div className="space-y-3">
                {recent_referrals.map((r) => (
                  <div key={r.id} className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{(r.tenants as any)?.shop_name || "Toko"}</p>
                        <p className="text-neutral-500 text-xs mt-0.5">{(r.tenants as any)?.slug}.cukurship.id</p>
                        <p className="text-neutral-600 text-xs mt-0.5">
                          Daftar: {new Date(r.registered_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
                {recent_referrals.length === 0 && (
                  <div className="text-center py-12 text-neutral-600">
                    <p className="text-4xl mb-2">🏪</p>
                    <p>Belum ada toko yang daftar via link kamu.</p>
                    <p className="text-xs mt-2">Bagikan link referral ke pemilik barbershop!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ TAB: PENCAIRAN══════════════════════════════════════════════ */}
          {activeTab === "withdrawal" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-black text-white">🏦 Pencairan Komisi</h1>

              {/* Saldo card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 text-center">
                  <p className="text-neutral-400 text-xs mb-1">Saldo Tersedia</p>
                  <p className="text-3xl font-black text-green-400">{fmt(balance.available)}</p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5 text-center">
                  <p className="text-neutral-400 text-xs mb-1">Dalam Proses</p>
                  <p className="text-3xl font-black text-yellow-400">{fmt(balance.pending)}</p>
                </div>
              </div>

              {/* Form pencairan */}
              {!profile.bank_account_number ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
                  <p className="text-amber-400 font-semibold mb-2">⚠️ Data rekening belum lengkap</p>
                  <p className="text-neutral-400 text-sm mb-4">
                    Kamu perlu menambahkan data rekening/e-wallet sebelum bisa mengajukan pencairan.
                  </p>
                  <button
                    onClick={() => setActiveTab("profile")}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-all"
                  >
                    ⚙️ Lengkapi Data Rekening
                  </button>
                </div>
              ) : (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-5">
                  <h2 className="text-lg font-bold text-white">Request Pencairan</h2>

                  {/* Info rekening */}
                  <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 text-sm">
                    <p className="text-neutral-400 text-xs mb-2 font-medium uppercase tracking-wider">Transfer ke:</p>
                    <p className="text-white font-bold">{profile.bank_name}</p>
                    <p className="text-neutral-300">{profile.bank_account_number}</p>
                    <p className="text-neutral-400 text-xs mt-0.5">a.n. {profile.bank_account_name}</p>
                  </div>

                  {/* Input amount */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-300">Jumlah Pencairan</label>
                    <div className="flex items-center gap-3 bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 focus-within:border-amber-500 transition-all">
                      <span className="text-neutral-500 text-sm font-medium">Rp</span>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="50000"
                        min={50000}
                        max={balance.available}
                        className="flex-1 bg-transparent text-white text-lg font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="flex justify-between text-xs text-neutral-600">
                      <span>Minimum: {fmt(50000)}</span>
                      <button
                        onClick={() => setWithdrawAmount(String(balance.available))}
                        className="text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Cairkan Semua ({fmt(balance.available)})
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  {Number(withdrawAmount) >= 50000 && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-sm animate-in fade-in duration-200">
                      <p className="text-neutral-400 text-xs mb-2">Preview Transfer:</p>
                      <p className="text-white">
                        <span className="text-amber-400 font-black text-lg">{fmt(Number(withdrawAmount))}</span>
                        {" → "}
                        {profile.bank_name} {profile.bank_account_number} a.n. {profile.bank_account_name}
                      </p>
                    </div>
                  )}

                  {/* Feedback messages */}
                  {withdrawError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
                      ❌ {withdrawError}
                    </div>
                  )}
                  {withdrawSuccess && (
                    <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl text-sm">
                      ✅ {withdrawSuccess}
                    </div>
                  )}

                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawLoading || balance.available < 50000 || Number(withdrawAmount) < 50000 || Number(withdrawAmount) > balance.available}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed text-black font-extrabold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {withdrawLoading ? (
                      <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Mengirim request...</>
                    ) : "💸 Request Pencairan"}
                  </button>
                </div>
              )}

              {/* Riwayat pencairan */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-white">Riwayat Pencairan</h2>
                {withdrawHistory.map((w: any) => {
                  const wStatusMap: Record<string, { label: string; cls: string }> = {
                    requested:  { label: "Menunggu",   cls: "bg-neutral-700/50 border-neutral-600 text-neutral-300" },
                    processing: { label: "Diproses",   cls: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" },
                    paid:       { label: "Selesai ✓",  cls: "bg-green-500/10 border-green-500/30 text-green-400" },
                    rejected:   { label: "Ditolak",    cls: "bg-red-500/10 border-red-500/30 text-red-400" },
                  };
                  const ws = wStatusMap[w.status] ?? { label: w.status, cls: "bg-neutral-700 border-neutral-600 text-neutral-400" };
                  return (
                    <div key={w.id} className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white text-lg">{fmt(Number(w.amount))}</p>
                          <p className="text-neutral-500 text-xs">{w.bank_name} — {w.bank_account_number}</p>
                          <p className="text-neutral-600 text-xs">
                            {new Date(w.requested_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${ws.cls}`}>{ws.label}</span>
                      </div>
                      {w.status === "rejected" && w.admin_notes && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
                          <span className="font-semibold">Alasan: </span>{w.admin_notes}
                        </div>
                      )}
                    </div>
                  );
                })}
                {withdrawHistory.length === 0 && (
                  <div className="text-center py-10 text-neutral-600">
                    <p className="text-4xl mb-2">📭</p>
                    <p>Belum ada riwayat pencairan.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ TAB: PROFIL ═════════════════════════════════════════════════ */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-black text-white">⚙️ Profil Affiliator</h1>
                {!isEditingProfile && (
                  <button 
                    onClick={handleEditProfileInit}
                    className="px-4 py-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl text-sm font-medium transition-all"
                  >
                    ✏️ Edit Profil
                  </button>
                )}
              </div>

              {profileSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-xl text-sm">
                  ✅ {profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
                  ❌ {profileError}
                </div>
              )}

              {isEditingProfile ? (
                 <form onSubmit={handleSaveProfile} className="space-y-6 animate-in fade-in">
                   <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
                     <h2 className="text-lg font-bold text-white mb-2">Data Diri</h2>
                     
                     <div className="space-y-2">
                       <label className="text-sm text-neutral-400">Nama Lengkap <span className="text-amber-400">*</span></label>
                       <input 
                         type="text" 
                         value={profileForm.name} 
                         onChange={(e) => setProfileForm({...profileForm, name: e.target.value})}
                         className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-2 flex items-center text-white focus:outline-none focus:border-amber-500 text-sm transition-all"
                       />
                     </div>

                     <div className="space-y-2 opacity-50 cursor-not-allowed">
                       <label className="text-sm text-neutral-400">Nomor WhatsApp (Tidak dapat diubah)</label>
                       <input 
                         type="text" 
                         value={profile.phone} 
                         disabled
                         className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-neutral-500 text-sm cursor-not-allowed"
                       />
                     </div>

                     <div className="space-y-2">
                       <label className="text-sm text-neutral-400">Email</label>
                       <input 
                         type="email" 
                         value={profileForm.email} 
                         onChange={(e) => setProfileForm({...profileForm, email: e.target.value})}
                         className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-amber-500 text-sm transition-all"
                         placeholder="Opsional"
                       />
                     </div>
                   </div>

                   <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
                     <h2 className="text-lg font-bold text-white mb-2">Data Rekening/Pencairan</h2>

                     <div className="space-y-2">
                       <label className="text-sm text-neutral-400">Bank / E-Wallet</label>
                       <select 
                         value={profileForm.bank_name} 
                         onChange={(e) => setProfileForm({...profileForm, bank_name: e.target.value})}
                         className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 text-sm transition-all"
                       >
                         <option value="">-- Pilih Bank --</option>
                         {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                       </select>
                     </div>

                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-2">
                         <label className="text-sm text-neutral-400">Nomor Rekening/Akun</label>
                         <input 
                           type="text" 
                           value={profileForm.bank_account_number} 
                           onChange={(e) => setProfileForm({...profileForm, bank_account_number: e.target.value})}
                           className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-amber-500 text-sm transition-all"
                         />
                       </div>
                       <div className="space-y-2">
                         <label className="text-sm text-neutral-400">Nama Pemilik Akun</label>
                         <input 
                           type="text" 
                           value={profileForm.bank_account_name} 
                           onChange={(e) => setProfileForm({...profileForm, bank_account_name: e.target.value})}
                           className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-amber-500 text-sm transition-all"
                         />
                       </div>
                     </div>
                   </div>

                   <div className="flex gap-3">
                     <button 
                       type="button"
                       onClick={() => setIsEditingProfile(false)}
                       disabled={profileLoading}
                       className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
                     >
                       Batal
                     </button>
                     <button 
                       type="submit"
                       disabled={profileLoading}
                       className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all disabled:opacity-50"
                     >
                       {profileLoading ? "Menyimpan..." : "💾 Simpan Perubahan"}
                     </button>
                   </div>
                 </form>
              ) : (
                <>
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
                    {[
                      { label: "Nama Lengkap", value: profile.name },
                      { label: "Email", value: profile.email || "-" },
                      { label: "WhatsApp", value: profile.phone },
                      { label: "Tier", value: profile.tier === "reseller" ? "🚀 Reseller (20% recurring)" : "🎯 Referral (10% one-time)" },
                      { label: "Kode Referral", value: profile.referral_code },
                      { label: "Status Pendaftaran", value: profile.status },
                    ].map((item) => (
                      <div key={item.label} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-neutral-800 last:border-0 gap-1">
                        <span className="text-neutral-500 text-sm">{item.label}</span>
                        <span className="text-white font-medium text-sm sm:text-right break-all">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Data Rekening/E-Wallet</h2>
                    {profile.bank_name || profile.bank_account_number ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex flex-col py-2 border-b border-neutral-800">
                          <span className="text-neutral-500 mb-1">Bank / E-Wallet</span>
                          <span className="text-white">{profile.bank_name || "-"}</span>
                        </div>
                        <div className="flex flex-col py-2 border-b border-neutral-800">
                          <span className="text-neutral-500 mb-1">Nomor Rekening/Akun</span>
                          <span className="text-white font-mono">{profile.bank_account_number || "-"}</span>
                        </div>
                        <div className="flex flex-col py-2">
                          <span className="text-neutral-500 mb-1">Atas Nama Pemilik</span>
                          <span className="text-white">{profile.bank_account_name || "-"}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-neutral-500 text-sm">Belum ada data rekening. Silakan Edit Profil untuk melengkapi agar dapat melakukan Pencairan Dana.</p>
                    )}
                  </div>

                  <button onClick={handleLogout} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-medium rounded-xl transition-all">
                    🚪 Keluar dari Akun
                  </button>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
