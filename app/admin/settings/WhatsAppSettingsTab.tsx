"use client";

import { useState, useEffect } from "react";

type WaStatus = "loading" | "disconnected" | "qr_pending" | "connected";

export default function WhatsAppSettingsTab() {
  const [status, setStatus] = useState<WaStatus>("loading");
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, []);

  // Polling ketika qr_pending
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "qr_pending") {
      interval = setInterval(() => {
        fetchStatus();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  // Fetch status — menggunakan HttpOnly cookie secara otomatis (sama seperti halaman lain)
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/status");
      if (!res.ok) {
        setStatus("disconnected");
        return;
      }
      const data = await res.json();

      if (data.status === "connected") {
        setStatus("connected");
        setPhoneNumber(data.phone);
        setQrCode(null);
      } else if (data.status === "qr_pending") {
        setStatus("qr_pending");
        fetchQrCode();
      } else {
        setStatus("disconnected");
        setPhoneNumber(null);
        setQrCode(null);
      }
    } catch (error) {
      console.error("Failed to fetch WA status", error);
      setStatus("disconnected");
    }
  };

  // Fetch QR code
  const fetchQrCode = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/qr");
      const data = await res.json();
      if (data.qr) {
        setQrCode(data.qr);
      }
    } catch (error) {
      console.error("Failed to fetch WA QR", error);
    }
  };

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp/connect", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setStatus("qr_pending");
        fetchQrCode();
      } else {
        alert(data.error || "Gagal menghubungkan WhatsApp");
      }
    } catch (error) {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Apakah Anda yakin ingin memutuskan WhatsApp toko ini?")) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp/disconnect", { method: "POST" });
      await res.json();
      setStatus("disconnected");
      setPhoneNumber(null);
      setQrCode(null);
    } catch (error) {
      alert("Gagal memutuskan koneksi.");
    } finally {
      setActionLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in">
        <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
        <p className="text-neutral-400 text-sm">Memeriksa status WhatsApp...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="p-6 bg-neutral-900/50 rounded-2xl border border-neutral-800 flex items-start gap-5">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
          <span className="text-2xl">📱</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">WhatsApp Notifikasi Toko</h2>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-2xl">
            Hubungkan nomor WhatsApp toko Anda agar notifikasi booking dikirim langsung dari nomor toko.
            Jika tidak dihubungkan, pesan dikirim dari nomor default sistem.
          </p>
        </div>
      </div>

      {status === "disconnected" && (
        <div className="p-8 border border-dashed border-neutral-800 rounded-2xl flex flex-col items-center text-center space-y-4 bg-black/20">
          <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center rotate-12">
            <span className="text-3xl grayscale opacity-50">🔗</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Belum Terhubung</h3>
            <p className="text-neutral-500 text-sm mt-1">Gunakan perangkat lain untuk memindai QR Code.</p>
          </div>
          <button
            onClick={handleConnect}
            disabled={actionLoading}
            className="px-6 py-2.5 bg-[#25D366] hover:bg-[#1DA851] text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 mt-4"
          >
            {actionLoading ? "Memulai..." : "Hubungkan Sekarang"}
          </button>
        </div>
      )}

      {status === "qr_pending" && (
        <div className="p-8 border border-green-500/30 rounded-2xl flex flex-col items-center text-center space-y-6 bg-green-500/5">
          <div>
            <h3 className="text-xl font-bold text-green-400">Scan QR Code Berikut</h3>
            <p className="text-neutral-400 text-sm mt-2 max-w-sm mx-auto">
              Buka WhatsApp di HP toko → {'"'}Perangkat Tertaut{'"'} → {'"'}Tautkan Perangkat{'"'}
            </p>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow-2xl relative w-64 h-64 flex items-center justify-center">
            {qrCode ? (
              <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
            ) : (
              <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
            )}
            <div className="absolute top-2 right-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping block"></span>
            </div>
          </div>

          <p className="text-neutral-500 text-xs">Otomatis merefresh status setiap 3 detik...</p>
        </div>
      )}

      {status === "connected" && (
        <div className="p-8 border border-green-500/50 rounded-2xl flex flex-col sm:flex-row items-center justify-between text-left gap-6 bg-green-500/10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/20">
              <span className="text-2xl text-white">✓</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Terhubung Aktif</h3>
              <p className="text-green-400 font-mono mt-1 text-sm bg-green-500/10 px-2 py-0.5 rounded-md inline-block">
                +{phoneNumber || "Nomor tidak diketahui"}
              </p>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={actionLoading}
            className="px-5 py-2.5 border border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {actionLoading ? "Memproses..." : "Putuskan Koneksi"}
          </button>
        </div>
      )}
    </div>
  );
}
