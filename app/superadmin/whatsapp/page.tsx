"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Status = "loading" | "service_unreachable" | "qr_pending" | "connected" | "disconnected" | "connecting" | "logged_out";

interface QRData {
  status: Status;
  qr?: string | null;
  phone?: string | null;
}

function getAuthHeader() {
  const token = typeof window !== "undefined" ? localStorage.getItem("superadmin_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SuperadminWhatsAppPage() {
  const [qrData, setQrData] = useState<QRData>({ status: "loading" });
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);
  const [isInitLoading, setIsInitLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const fetchQR = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/whatsapp/qr?session_id=default", {
        headers: getAuthHeader() as HeadersInit,
      });
      const data: QRData = await res.json();
      setQrData(data);
      setLastRefresh(new Date());

      // Stop polling if connected
      if (data.status === "connected") {
        stopPolling();
        return;
      }

      // Keep polling every 3 seconds if not connected
      pollingRef.current = setTimeout(fetchQR, 3000);
    } catch {
      setQrData({ status: "service_unreachable" });
      pollingRef.current = setTimeout(fetchQR, 5000);
    }
  }, []);

  useEffect(() => {
    fetchQR();
    return () => stopPolling();
  }, [fetchQR]);

  const handleInitSession = async () => {
    setIsInitLoading(true);
    try {
      await fetch("/api/superadmin/whatsapp/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getAuthHeader() as HeadersInit) },
        body: JSON.stringify({ session_id: "default" }),
      });
      stopPolling();
      setTimeout(fetchQR, 1500);
    } finally {
      setIsInitLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Yakin ingin memutus sesi WhatsApp default? OTP dan notifikasi tidak akan terkirim sampai scan QR ulang.")) return;
    setIsLogoutLoading(true);
    try {
      await fetch("/api/superadmin/whatsapp/qr?session_id=default", {
        method: "DELETE",
        headers: getAuthHeader() as HeadersInit,
      });
      setQrData({ status: "disconnected" });
      stopPolling();
      setTimeout(fetchQR, 2000);
    } finally {
      setIsLogoutLoading(false);
    }
  };

  // ── UI helpers ─────────────────────────────────────────
  const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
    loading:             { label: "Memuat...",            color: "text-neutral-400", dot: "bg-neutral-500" },
    connecting:          { label: "Menghubungkan...",     color: "text-amber-400",   dot: "bg-amber-400 animate-pulse" },
    qr_pending:          { label: "Menunggu Scan QR",     color: "text-amber-400",   dot: "bg-amber-400 animate-pulse" },
    connected:           { label: "Terhubung ✓",          color: "text-green-400",   dot: "bg-green-400" },
    disconnected:        { label: "Terputus",             color: "text-red-400",     dot: "bg-red-500" },
    logged_out:          { label: "Logout",               color: "text-red-400",     dot: "bg-red-500" },
    service_unreachable: { label: "Service Tidak Aktif",  color: "text-red-400",     dot: "bg-red-500 animate-pulse" },
  };

  const cfg = statusConfig[qrData.status] || statusConfig.loading;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <span>💬</span> WhatsApp Default Session
        </h1>
        <p className="text-neutral-500 text-sm mt-1">
          Kelola koneksi WhatsApp platform — digunakan untuk OTP dan notifikasi semua tenant yang belum punya sesi sendiri.
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-[#071120] border border-cyan-900/30 rounded-2xl p-6 space-y-6">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
          </div>
          {lastRefresh && (
            <span className="text-xs text-neutral-600">
              Update: {lastRefresh.toLocaleTimeString("id-ID")}
            </span>
          )}
        </div>

        {/* Connected State */}
        {qrData.status === "connected" && (
          <div className="text-center space-y-4">
            <div className="inline-flex flex-col items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-2xl px-8 py-6">
              <span className="text-5xl">✅</span>
              <p className="text-green-400 font-bold text-lg">WhatsApp Terhubung</p>
              {qrData.phone && (
                <p className="text-neutral-300 font-mono bg-neutral-900 px-4 py-2 rounded-lg text-sm">
                  📱 +{qrData.phone}
                </p>
              )}
            </div>
            <p className="text-sm text-neutral-500">
              OTP dan notifikasi akan terkirim melalui nomor di atas.
            </p>
            <button
              onClick={handleLogout}
              disabled={isLogoutLoading}
              className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {isLogoutLoading ? "Memutus..." : "🔓 Putuskan Sesi"}
            </button>
          </div>
        )}

        {/* QR Code State */}
        {(qrData.status === "qr_pending") && (
          <div className="text-center space-y-4">
            {qrData.qr ? (
              <>
                <div className="inline-block p-3 bg-white rounded-2xl shadow-2xl shadow-amber-500/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrData.qr} alt="QR Code WhatsApp" width={260} height={260} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <p className="text-amber-400 font-semibold">📱 Scan QR dengan WhatsApp</p>
                  <p className="text-neutral-500 text-sm">
                    Buka WhatsApp → Settings → Linked Devices → Link a Device
                  </p>
                  <p className="text-neutral-600 text-xs">QR diperbarui otomatis setiap 3 detik</p>
                </div>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <p className="text-neutral-400 text-sm">Menunggu QR dari server...</p>
              </div>
            )}
          </div>
        )}

        {/* Disconnected / Error State */}
        {(qrData.status === "disconnected" || qrData.status === "logged_out" || qrData.status === "loading" || qrData.status === "connecting") && (
          <div className="text-center space-y-4 py-4">
            <div className="text-5xl">
              {qrData.status === "connecting" ? "⏳" : "📵"}
            </div>
            <p className="text-neutral-400">
              {qrData.status === "connecting"
                ? "Sedang menghubungkan ke WhatsApp..."
                : "Sesi WhatsApp tidak aktif. Inisiasi untuk mulai scan QR."}
            </p>
            {qrData.status !== "connecting" && (
              <button
                onClick={handleInitSession}
                disabled={isInitLoading}
                className="px-6 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              >
                {isInitLoading ? "Menginisiasi..." : "🔄 Inisiasi Sesi & Tampilkan QR"}
              </button>
            )}
          </div>
        )}

        {/* Service Unreachable */}
        {qrData.status === "service_unreachable" && (
          <div className="text-center space-y-3 py-4">
            <div className="text-5xl">⚠️</div>
            <p className="text-red-400 font-semibold">WhatsApp Service Tidak Dapat Dijangkau</p>
            <p className="text-neutral-500 text-sm">
              Pastikan <code className="bg-neutral-800 px-2 py-0.5 rounded text-amber-400 text-xs">whatsapp-service</code> sudah berjalan dan variabel{" "}
              <code className="bg-neutral-800 px-2 py-0.5 rounded text-amber-400 text-xs">WHATSAPP_SERVICE_URL</code> sudah dikonfigurasi dengan benar.
            </p>
            <button
              onClick={() => { stopPolling(); fetchQR(); }}
              className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-sm transition-all"
            >
              🔁 Coba Lagi
            </button>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-[#071120] border border-cyan-900/20 rounded-2xl p-5 space-y-3 text-sm">
        <p className="text-cyan-400 font-semibold">ℹ️ Tentang Default Session</p>
        <ul className="text-neutral-500 space-y-2 list-disc list-inside">
          <li>Sesi ini digunakan sebagai <strong className="text-neutral-300">fallback</strong> untuk semua tenant yang belum mengatur sesi WA sendiri.</li>
          <li>Jika sesi disconnect, <strong className="text-neutral-300">OTP login pelanggan tidak akan terkirim</strong>.</li>
          <li>Setelah scan QR, sesi tersimpan secara permanen di server sampai logout atau session rusak.</li>
          <li>Gunakan nomor WA yang <strong className="text-neutral-300">tidak dipakai di HP manapun</strong> sebagai nomor utama (disarankan nomor khusus bisnis).</li>
        </ul>
      </div>
    </div>
  );
}
