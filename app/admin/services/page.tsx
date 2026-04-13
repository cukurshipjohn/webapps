"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ServiceBarberModal from "@/components/admin/ServiceBarberModal";
import { SERVICE_TYPES, ServiceType } from "@/lib/service-types";

// ── Types ──
interface Service {
  id: string;
  name: string;
  price: number;
  price_type: "fixed" | "range" | "custom";
  price_min: number | null;
  price_max: number | null;
  duration_minutes: number;
  service_type: ServiceType;
  is_active: boolean;
  show_in_pos: boolean;
  tenant_id: string;
}

interface PlanInfo {
  planId: string;
  kasirEnabled: boolean;
  maxKasirBarbers: number | null;
}

interface FormData {
  id?: string;
  name: string;
  price: number;
  price_type: "fixed" | "range" | "custom";
  price_min: number | null;
  price_max: number | null;
  duration_minutes: number;
  service_type: ServiceType;
  is_active: boolean;
}

type TabId = ServiceType;

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: SERVICE_TYPES.BARBERSHOP, label: "Layanan Barbershop", icon: "💈" },
  { id: SERVICE_TYPES.HOME_SERVICE, label: "Home Service", icon: "🏠" },
  { id: SERVICE_TYPES.POS_KASIR, label: "Layanan Kasir", icon: "🧾" },
];

const EMPTY_FORM: FormData = {
  name: "", price: 0, price_type: "fixed",
  price_min: null, price_max: null,
  duration_minutes: 30, service_type: SERVICE_TYPES.BARBERSHOP, is_active: true,
};

export default function AdminServicesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(SERVICE_TYPES.BARBERSHOP);

  // Data per tab
  const [barbershopServices, setBarbershopServices] = useState<Service[]>([]);
  const [homeServices, setHomeServices] = useState<Service[]>([]);
  const [kasirServices, setKasirServices] = useState<Service[]>([]);
  const [planInfo, setPlanInfo] = useState<PlanInfo>({ planId: 'trial', kasirEnabled: true, maxKasirBarbers: null });

  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  // Barber config modal (delegated to ServiceBarberModal)
  const [barberModalOpen, setBarberModalOpen] = useState(false);
  const [barberModalService, setBarberModalService] = useState<Service | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const formatRupiah = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  // ═══════════════════════════════════════════════════════════
  // FETCH
  // ═══════════════════════════════════════════════════════════
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [resBs, resHs, resKs] = await Promise.all([
        fetch(`/api/admin/services?type=${SERVICE_TYPES.BARBERSHOP}`),
        fetch(`/api/admin/services?type=${SERVICE_TYPES.HOME_SERVICE}`),
        fetch(`/api/admin/services?type=${SERVICE_TYPES.POS_KASIR}`),
      ]);

      if (resBs.status === 401 || resHs.status === 401 || resKs.status === 401) {
        router.push("/admin/login");
        return;
      }

      const dataBs = await resBs.json();
      const dataHs = await resHs.json();
      const dataKs = await resKs.json();

      setBarbershopServices(dataBs.services || []);
      setHomeServices(dataHs.services || []);
      setKasirServices(dataKs.services || []);
      setPlanInfo(dataKs.planInfo || { planId: 'trial', kasirEnabled: true, maxKasirBarbers: null });
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  };

  const getActiveServices = (): Service[] => {
    switch (activeTab) {
      case SERVICE_TYPES.BARBERSHOP: return barbershopServices;
      case SERVICE_TYPES.HOME_SERVICE: return homeServices;
      case SERVICE_TYPES.POS_KASIR: return kasirServices;
    }
  };

  const getServiceCount = (tab: TabId): number => {
    switch (tab) {
      case SERVICE_TYPES.BARBERSHOP: return barbershopServices.filter(s => s.is_active).length;
      case SERVICE_TYPES.HOME_SERVICE: return homeServices.filter(s => s.is_active).length;
      case SERVICE_TYPES.POS_KASIR: return kasirServices.filter(s => s.is_active).length;
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ADD / EDIT
  // ═══════════════════════════════════════════════════════════
  const openAddModal = () => {
    setFormData({ ...EMPTY_FORM, service_type: activeTab });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    setFormData({
      id: service.id,
      name: service.name,
      price: service.price,
      price_type: service.price_type || "fixed",
      price_min: service.price_min,
      price_max: service.price_max,
      duration_minutes: service.duration_minutes,
      service_type: service.service_type,
      is_active: service.is_active,
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isEditing && formData.id) {
        // PATCH
        const res = await fetch(`/api/admin/services/${formData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            price: formData.price,
            price_type: formData.price_type,
            price_min: formData.price_min,
            price_max: formData.price_max,
            duration_minutes: formData.duration_minutes,
            is_active: formData.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memperbarui");
        showToast("Layanan berhasil diperbarui", "success");
      } else {
        // POST
        const res = await fetch("/api/admin/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal menambahkan");
        showToast("Layanan berhasil ditambahkan", "success");
      }

      setIsModalOpen(false);
      fetchAll();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (service: Service) => {
    if (!confirm(`Hapus layanan "${service.name}" secara permanen?\n\nRiwayat booking yang sudah ada tetap tersimpan.`)) return;
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus layanan");
      showToast(data.message || "Layanan berhasil dihapus", "success");
      fetchAll();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ═══════════════════════════════════════════════════════════
  // BARBER CONFIG MODAL (delegated to ServiceBarberModal)
  // ═══════════════════════════════════════════════════════════
  const openBarberModal = (service: Service) => {
    setBarberModalService(service);
    setBarberModalOpen(true);
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <main className="min-h-screen bg-background text-accent pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-neutral-800/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl border text-sm shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-top-4 fade-in duration-300 ${toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
          <span className="text-lg">{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto relative z-10 px-4">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-primary hover:text-primary-hover text-sm font-medium transition-colors">← Kembali</Link>
              <span className="text-neutral-600 text-sm">•</span>
              <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Manajemen <span className="text-primary">Layanan</span></h1>
            <p className="text-neutral-400 text-sm mt-1">Kelola harga dan durasi treatment yang Anda tawarkan.</p>
          </div>

          {/* Add button — hidden for kasir tab if plan not eligible */}
          {!(activeTab === SERVICE_TYPES.POS_KASIR && !planInfo.kasirEnabled) && (
            <button
              onClick={openAddModal}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-background px-5 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/10"
            >
              <span className="text-lg">+</span> Tambah Layanan
            </button>
          )}
        </header>

        {/* Tabs */}
        <div className="flex gap-1 bg-neutral-900/50 p-1 rounded-2xl border border-neutral-800/50 mb-8">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-neutral-500 hover:text-neutral-300 border border-transparent"
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="bg-neutral-800 text-neutral-400 text-[10px] px-1.5 py-0.5 rounded-full font-mono min-w-[20px] text-center">
                {getServiceCount(tab.id)}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-neutral-500 text-sm animate-pulse tracking-wider">MEMUAT DATA...</p>
          </div>
        ) : (
          <>
            {/* ═══ TAB: KASIR — 3 States ═══ */}
            {activeTab === SERVICE_TYPES.POS_KASIR && !planInfo.kasirEnabled ? (
              /* ── State 1: Starter — blokir total ── */
              <div className="glass p-8 rounded-3xl border border-neutral-800/50 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center text-4xl mb-4 border border-neutral-800">
                  🔒
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Fitur Kasir Bot Telegram</h3>
                <p className="text-neutral-400 text-sm mb-2 max-w-md">
                  Tersedia untuk plan <b className="text-primary">Pro</b> dan <b className="text-primary">Business</b>.
                </p>
                <p className="text-neutral-500 text-xs mb-6 max-w-md">
                  Plan Starter tidak mendukung fitur kasir. Upgrade agar kapster bisa mencatat transaksi walk-in langsung dari Telegram.
                </p>
                <Link
                  href="/admin/billing"
                  className="bg-primary hover:bg-primary-hover text-background px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/10"
                >
                  🚀 Upgrade Sekarang
                </Link>
              </div>
            ) : (
              <>
                {/* ── State 2: Trial — akses penuh + banner konteks ── */}
                {activeTab === SERVICE_TYPES.POS_KASIR && planInfo.planId === "trial" && (
                  <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <span className="text-amber-400 text-lg mt-0.5">🎯</span>
                      <div>
                        <p className="text-sm font-medium text-amber-300">Kamu sedang dalam masa Trial</p>
                        <p className="text-xs text-neutral-400 mt-1">
                          Fitur kasir aktif penuh seperti plan Business.
                          Setelah trial berakhir, fitur ini membutuhkan plan{" "}
                          <b className="text-primary">Pro</b> (1 barber kasir) atau{" "}
                          <b className="text-primary">Business</b> (unlimited).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── State 2 & 3: Plan info badge ── */}
                {activeTab === SERVICE_TYPES.POS_KASIR && planInfo.kasirEnabled && (
                  <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 mb-6 flex items-center gap-3">
                    <span className="text-blue-400 text-lg">ℹ️</span>
                    <p className="text-xs text-neutral-400">
                      {planInfo.planId === "trial"
                        ? <span>Trial: <b className="text-blue-400">Akses kasir unlimited</b> (setara Business)</span>
                        : planInfo.maxKasirBarbers === null
                          ? <span>Plan Business: <b className="text-blue-400">Barber kasir tidak terbatas</b></span>
                          : <span>Plan Pro: Maks <b className="text-blue-400">{planInfo.maxKasirBarbers} barber</b> kasir aktif</span>
                      }
                    </p>
                  </div>
                )}

                {/* Service list */}
                {getActiveServices().length === 0 ? (
                  <div className="glass p-12 rounded-3xl border border-neutral-800/50 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center text-3xl mb-4 border border-neutral-800">
                      {TABS.find(t => t.id === activeTab)?.icon}
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Belum ada layanan</h3>
                    <p className="text-neutral-400 text-sm mb-4">
                      {activeTab === SERVICE_TYPES.POS_KASIR ? "Tambahkan layanan kasir agar kapster bisa mencatat transaksi." : "Tambahkan layanan agar pelanggan bisa mulai booking."}
                    </p>
                    <button onClick={openAddModal} className="text-primary font-medium hover:text-primary-hover underline text-sm">Tambah Layanan Pertama</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {getActiveServices().map(service => (
                      <ServiceRow
                        key={service.id}
                        service={service}
                        formatRupiah={formatRupiah}
                        isKasir={activeTab === SERVICE_TYPES.POS_KASIR}
                        onEdit={() => openEditModal(service)}
                        onDeactivate={() => handleDeactivate(service)}
                        onBarberConfig={activeTab === SERVICE_TYPES.POS_KASIR ? () => openBarberModal(service) : undefined}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ Modal: Add/Edit Service ═══ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !submitting && setIsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md bg-neutral-950 border border-neutral-800 max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-neutral-800/50">
              <h2 className="text-xl font-bold">{isEditing ? "✏️ Edit Layanan" : "➕ Tambah Layanan"}</h2>
              <p className="text-xs text-neutral-500 mt-1">
                {isEditing ? "Ubah detail layanan." : `Tipe: ${TABS.find(t => t.id === formData.service_type)?.label}`}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Service Type (hanya saat tambah) */}
              {!isEditing && (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Tipe Layanan</label>
                  <select
                    value={formData.service_type}
                    onChange={(e) => setFormData({ ...formData, service_type: e.target.value as any })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                    disabled={submitting}
                  >
                    <option value={SERVICE_TYPES.BARBERSHOP}>💈 Barbershop</option>
                    <option value={SERVICE_TYPES.HOME_SERVICE}>🏠 Home Service</option>
                    {planInfo.kasirEnabled && <option value={SERVICE_TYPES.POS_KASIR}>🧾 Kasir POS</option>}
                  </select>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Nama Layanan <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="Contoh: Premium Haircut"
                  required disabled={submitting}
                />
              </div>

              {/* Price Type */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-2">Tipe Harga</label>
                <div className="flex gap-2">
                  {[
                    { value: "fixed", label: "💰 Tetap", desc: "Harga pasti" },
                    { value: "range", label: "📊 Rentang", desc: "Min – Maks" },
                    { value: "custom", label: "✏️ Bebas", desc: "Input saat transaksi" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, price_type: opt.value as any })}
                      className={`flex-1 py-2.5 px-2 rounded-xl text-center transition-all border ${
                        formData.price_type === opt.value
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300"
                      }`}
                      disabled={submitting}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[10px] opacity-70">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price fields — conditional by price_type */}
              {formData.price_type === "fixed" && (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Harga (Rp) <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="0" step="1000"
                    value={formData.price || ""}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono"
                    placeholder="50000" required disabled={submitting}
                  />
                </div>
              )}

              {formData.price_type === "range" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Harga Min <span className="text-red-500">*</span></label>
                    <input
                      type="number" min="0" step="1000"
                      value={formData.price_min ?? ""}
                      onChange={(e) => setFormData({ ...formData, price_min: Number(e.target.value) })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono"
                      placeholder="30000" required disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Harga Maks <span className="text-red-500">*</span></label>
                    <input
                      type="number" min="0" step="1000"
                      value={formData.price_max ?? ""}
                      onChange={(e) => setFormData({ ...formData, price_max: Number(e.target.value) })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono"
                      placeholder="80000" required disabled={submitting}
                    />
                  </div>
                </div>
              )}

              {formData.price_type === "custom" && (
                <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-xl p-3">
                  <p className="text-xs text-neutral-400">✏️ Barber akan menginput harga secara manual saat mencatat transaksi di kasir.</p>
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Estimasi Durasi (menit)</label>
                <div className="relative">
                  <input
                    type="number" min="5" step="5"
                    value={formData.duration_minutes || ""}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono pr-14"
                    disabled={submitting}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">Menit</span>
                </div>
              </div>

              {/* Active toggle (only for edit) */}
              {isEditing && (
                <div className="flex items-center justify-between bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50">
                  <span className="text-sm text-neutral-300">Status Aktif</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                    className={`w-12 h-7 rounded-full transition-colors relative ${formData.is_active ? "bg-green-500" : "bg-neutral-700"}`}
                    disabled={submitting}
                  >
                    <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              )}

              {/* CTA */}
              <div className="flex gap-3 pt-4 border-t border-neutral-800/50">
                <button type="button" onClick={() => setIsModalOpen(false)} disabled={submitting}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800">
                  Batal
                </button>
                <button type="submit" disabled={submitting || !formData.name || (formData.price_type === "fixed" && !formData.price)}
                  className="flex-1 py-3 bg-primary hover:bg-primary-hover text-background font-bold rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                  {submitting
                    ? <><span className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin" /> Menyimpan...</>
                    : "💾 Simpan"
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Modal: Barber Config (standalone component) ═══ */}
      {barberModalService && (
        <ServiceBarberModal
          isOpen={barberModalOpen}
          onClose={() => setBarberModalOpen(false)}
          service={{
            id: barberModalService.id,
            name: barberModalService.name,
            price: barberModalService.price,
            price_type: barberModalService.price_type,
            price_min: barberModalService.price_min,
            price_max: barberModalService.price_max,
          }}
          maxKasirBarbers={planInfo.maxKasirBarbers}
          onSaved={() => fetchAll()}
        />
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════
// Service Row Component
// ═══════════════════════════════════════════════════════════
function ServiceRow({
  service, formatRupiah, isKasir, onEdit, onDeactivate, onBarberConfig
}: {
  service: Service;
  formatRupiah: (n: number) => string;
  isKasir: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onBarberConfig?: () => void;
}) {
  const priceLabel = () => {
    if (service.price_type === "range") {
      return `${formatRupiah(service.price_min || 0)} – ${formatRupiah(service.price_max || 0)}`;
    }
    if (service.price_type === "custom") return "Bebas Input";
    return formatRupiah(service.price);
  };

  const priceTypeLabel = () => {
    if (service.price_type === "range") return "Rentang";
    if (service.price_type === "custom") return "Bebas";
    return "Tetap";
  };

  return (
    <div className="glass p-4 rounded-2xl border border-neutral-800/50 flex flex-col sm:flex-row sm:items-center gap-4 group transition-all">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-white truncate">{service.name}</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          {isKasir && <span className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400">{priceTypeLabel()}</span>}
          <span className="font-mono text-primary font-medium">{priceLabel()}</span>
          {service.duration_minutes > 0 && <span>⏱️ {service.duration_minutes}m</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onEdit} className="px-3 py-2 text-xs bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded-lg transition-colors border border-neutral-700 hover:border-primary/50 hover:text-primary">
          ✏️ Edit
        </button>
        {isKasir && onBarberConfig && (
          <button onClick={onBarberConfig} className="px-3 py-2 text-xs bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded-lg transition-colors border border-neutral-700 hover:border-blue-500/50 hover:text-blue-400">
            ⚙️ Barber
          </button>
        )}
        <button onClick={onDeactivate} className="px-3 py-2 text-xs bg-neutral-900/80 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 rounded-lg transition-colors border border-neutral-700 hover:border-red-500/30" title="Hapus layanan">
          🗑️
        </button>
      </div>
    </div>
  );
}
