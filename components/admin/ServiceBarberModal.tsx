"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ──
export interface ServiceBarberModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: {
    id: string;
    name: string;
    price: number;
    price_type: "fixed" | "range" | "custom";
    price_min: number | null;
    price_max: number | null;
  };
  maxKasirBarbers: number | null; // null = unlimited
  onSaved?: () => void; // callback setelah berhasil simpan
}

interface BarberConfig {
  barber_id: string;
  barber_name: string;
  is_visible: boolean;
  price_override: number | null;
  price_min_override: number | null;
  price_max_override: number | null;
  sort_order: number;
  has_config: boolean;
  _editing?: boolean; // local UI state
}

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function ServiceBarberModal({
  isOpen,
  onClose,
  service,
  maxKasirBarbers,
  onSaved,
}: ServiceBarberModalProps) {
  const [configs, setConfigs] = useState<BarberConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Fetch configs saat modal buka
  useEffect(() => {
    if (isOpen && service.id) {
      fetchConfigs();
    }
    // Reset state saat tutup
    if (!isOpen) {
      setConfigs([]);
      setError("");
      setToast(null);
    }
  }, [isOpen, service.id]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/service-barber-pricing?service_id=${service.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat konfigurasi");
      setConfigs((data || []).map((c: any) => ({ ...c, _editing: false })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Hitung barber visible saat ini ──
  const visibleCount = configs.filter(c => c.is_visible).length;
  const isAtLimit = maxKasirBarbers !== null && visibleCount >= maxKasirBarbers;

  // ── Toggle visible ──
  const toggleVisible = useCallback((idx: number) => {
    setConfigs(prev => {
      const next = [...prev];
      const target = next[idx];

      // Jika mau ON dan sudah at limit
      if (!target.is_visible && maxKasirBarbers !== null) {
        const currentVisibles = next.filter(c => c.is_visible).length;
        if (currentVisibles >= maxKasirBarbers) {
          // Tampilkan warning — tapi jangan block (biar owner switch)
          showToast(
            `⚠️ Batas maksimal ${maxKasirBarbers} barber kasir untuk plan ini. Nonaktifkan barber lain terlebih dahulu.`,
            "error"
          );
          return prev; // Jangan toggle
        }
      }

      next[idx] = { ...target, is_visible: !target.is_visible };
      return next;
    });
  }, [maxKasirBarbers]);

  // ── Toggle edit mode ──
  const toggleEditing = (idx: number) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, _editing: !c._editing } : c));
  };

  // ── Update field ──
  const updateField = (idx: number, field: string, value: any) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  // ── Clear override (kembali ke harga toko) ──
  const clearOverride = (idx: number) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? {
      ...c,
      price_override: null,
      price_min_override: null,
      price_max_override: null,
      _editing: false,
    } : c));
  };

  // ── Simpan ──
  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      // Validasi client-side untuk range
      if (service.price_type === "range") {
        for (const c of configs) {
          if (c.price_min_override !== null && c.price_max_override !== null) {
            if (c.price_min_override >= c.price_max_override) {
              throw new Error(`Harga min harus lebih kecil dari maks untuk barber ${c.barber_name}.`);
            }
          }
        }
      }

      const res = await fetch("/api/admin/service-barber-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: service.id,
          configurations: configs.map(c => ({
            barber_id: c.barber_id,
            is_visible: c.is_visible,
            price_override: c.price_override,
            price_min_override: c.price_min_override,
            price_max_override: c.price_max_override,
            sort_order: c.sort_order,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan konfigurasi");

      showToast("✅ Konfigurasi barber berhasil disimpan", "success");
      onSaved?.();

      // Tutup setelah delay singkat biar toast keliatan
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setError(err.message);
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Render harga display ──
  const renderPriceDisplay = (config: BarberConfig) => {
    if (!config.is_visible) return <span className="text-neutral-600">—</span>;

    if (service.price_type === "custom") {
      return <span className="text-neutral-400 text-xs italic">Bebas input saat transaksi</span>;
    }

    if (service.price_type === "range") {
      const pMin = config.price_min_override ?? service.price_min ?? 0;
      const pMax = config.price_max_override ?? service.price_max ?? 0;
      const isOverridden = config.price_min_override !== null || config.price_max_override !== null;
      return (
        <span className={`text-xs font-mono ${isOverridden ? "text-blue-400" : "text-neutral-400"}`}>
          {formatIDR(pMin)} – {formatIDR(pMax)}
          {!isOverridden && <span className="text-neutral-600 ml-1">(toko)</span>}
        </span>
      );
    }

    // fixed
    const displayPrice = config.price_override ?? service.price;
    const isOverridden = config.price_override !== null;
    return (
      <span className={`text-xs font-mono ${isOverridden ? "text-blue-400" : "text-neutral-400"}`}>
        {formatIDR(displayPrice)}
        {!isOverridden && <span className="text-neutral-600 ml-1">(toko)</span>}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl bg-neutral-950 border border-neutral-800 max-h-[90vh] flex flex-col rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* ═══ Header ═══ */}
        <div className="p-6 border-b border-neutral-800/50 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                ⚙️ Setting Barber
              </h2>
              <p className="text-sm text-neutral-400 mt-1">
                <b className="text-white">{service.name}</b>
                <span className="mx-2 text-neutral-700">•</span>
                <span className="text-primary font-mono">
                  {service.price_type === "range"
                    ? `${formatIDR(service.price_min || 0)} – ${formatIDR(service.price_max || 0)}`
                    : service.price_type === "custom"
                      ? "Bebas Input"
                      : formatIDR(service.price)
                  }
                </span>
              </p>
            </div>
            <button
              onClick={() => !saving && onClose()}
              className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-600 flex items-center justify-center transition-all text-sm"
            >
              ✕
            </button>
          </div>

          {/* Plan limit badge */}
          <div className="mt-3 flex items-center gap-2">
            <div className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${
              isAtLimit
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                : "bg-green-500/5 border border-green-500/15 text-green-400"
            }`}>
              {maxKasirBarbers === null
                ? `${visibleCount} barber aktif (unlimited)`
                : `${visibleCount} / ${maxKasirBarbers} barber aktif`
              }
            </div>
          </div>
        </div>

        {/* ═══ Body ═══ */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Toast inside modal */}
          {toast && (
            <div className={`mb-4 px-3 py-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              toast.type === "success"
                ? "bg-green-500/10 border-green-500/20 text-green-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}>
              <span>{toast.type === "success" ? "✅" : "⚠️"}</span>
              <span>{toast.message}</span>
            </div>
          )}

          {/* Error banner */}
          {error && !toast && (
            <div className="mb-4 px-3 py-2.5 rounded-xl border bg-red-500/10 border-red-500/20 text-xs text-red-400 flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="text-neutral-500 text-xs">Memuat barber...</span>
            </div>
          ) : configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-3xl mb-3">💈</span>
              <p className="text-neutral-500 text-sm">Belum ada barber di toko ini.</p>
              <p className="text-neutral-600 text-xs mt-1">Tambah barber terlebih dahulu di menu Kapster.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_60px_1fr_40px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-600 font-semibold">
                <span>Barber</span>
                <span className="text-center">Tampil</span>
                <span>Harga di Bot Kasir</span>
                <span></span>
              </div>

              {/* Rows */}
              {configs.map((config, idx) => (
                <div
                  key={config.barber_id}
                  className={`rounded-xl border transition-all ${
                    config.is_visible
                      ? "bg-neutral-900/30 border-neutral-800/50"
                      : "bg-neutral-900/10 border-neutral-800/30"
                  }`}
                >
                  {/* Main row */}
                  <div className="grid grid-cols-[1fr_60px_1fr_40px] gap-3 p-3 items-center">
                    {/* Barber name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm font-medium truncate ${config.is_visible ? "text-white" : "text-neutral-600"}`}>
                        {config.barber_name}
                      </span>
                      {config.has_config && (
                        <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded shrink-0">✓</span>
                      )}
                    </div>

                    {/* Toggle */}
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleVisible(idx)}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          config.is_visible ? "bg-green-500" : "bg-neutral-700"
                        }`}
                        disabled={saving}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          config.is_visible ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>

                    {/* Price */}
                    <div>{renderPriceDisplay(config)}</div>

                    {/* Edit button */}
                    <div className="flex justify-center">
                      {config.is_visible && service.price_type !== "custom" && (
                        <button
                          type="button"
                          onClick={() => toggleEditing(idx)}
                          className={`w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all border ${
                            config._editing
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-neutral-900/80 border-neutral-700 text-neutral-500 hover:text-primary hover:border-primary/50"
                          }`}
                          disabled={saving}
                          title="Edit harga"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded edit row */}
                  {config._editing && config.is_visible && service.price_type !== "custom" && (
                    <div className="px-3 pb-3 pt-0">
                      <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800/30 space-y-2">
                        {service.price_type === "fixed" && (
                          <div>
                            <label className="text-[10px] text-neutral-500 font-medium mb-0.5 block">
                              Harga override <span className="text-neutral-600">(kosongkan = ikut toko: {formatIDR(service.price)})</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="5000"
                              value={config.price_override ?? ""}
                              onChange={(e) => updateField(idx, "price_override", e.target.value ? Number(e.target.value) : null)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-primary"
                              placeholder="Kosong = ikut harga toko"
                              disabled={saving}
                            />
                          </div>
                        )}

                        {service.price_type === "range" && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-neutral-500 font-medium mb-0.5 block">
                                Min <span className="text-neutral-600">(toko: {formatIDR(service.price_min || 0)})</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="5000"
                                value={config.price_min_override ?? ""}
                                onChange={(e) => updateField(idx, "price_min_override", e.target.value ? Number(e.target.value) : null)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-primary"
                                placeholder="Default"
                                disabled={saving}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-neutral-500 font-medium mb-0.5 block">
                                Maks <span className="text-neutral-600">(toko: {formatIDR(service.price_max || 0)})</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="5000"
                                value={config.price_max_override ?? ""}
                                onChange={(e) => updateField(idx, "price_max_override", e.target.value ? Number(e.target.value) : null)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-primary"
                                placeholder="Default"
                                disabled={saving}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => clearOverride(idx)}
                            className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                            disabled={saving}
                          >
                            🔄 Reset ke harga toko
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleEditing(idx)}
                            className="text-[10px] text-primary hover:text-primary-hover transition-colors font-medium"
                          >
                            Selesai ✓
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ Footer ═══ */}
        <div className="p-6 border-t border-neutral-800/50 shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || configs.length === 0}
              className="flex-1 py-3 bg-primary hover:bg-primary-hover text-background font-bold rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "💾 Simpan Perubahan"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
