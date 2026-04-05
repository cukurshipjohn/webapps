"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Tipe Barber
export interface Barber {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
  photo_url: string | null;
  telegram_username: string | null;
  telegram_chat_id: string | null;
  tenant_id: string;
  created_at: string;
}

export default function AdminBarbersPage() {
  const router = useRouter();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states (Add/Edit Barber)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Barber>>({ name: "", phone: "", specialty: "", photo_url: "", telegram_username: "", telegram_chat_id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Telegram Modal states
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramBarber, setTelegramBarber] = useState<Barber | null>(null);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [telegramSubmitting, setTelegramSubmitting] = useState(false);
  const [telegramError, setTelegramError] = useState("");

  // Disconnect confirmation modal
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnectBarber, setDisconnectBarber] = useState<Barber | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Toast / Notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchBarbers();
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchBarbers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/barbers");
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memuat data");
      setBarbers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setFormData({ name: "", phone: "", specialty: "", photo_url: "", telegram_username: "", telegram_chat_id: "" });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (barber: Barber) => {
    setFormData({
      id: barber.id,
      name: barber.name,
      phone: barber.phone || "",
      specialty: barber.specialty || "",
      photo_url: barber.photo_url || "",
      telegram_username: barber.telegram_username || "",
      telegram_chat_id: barber.telegram_chat_id || ""
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { 
      showToast("Pilih file gambar yang valid!", "error"); 
      return; 
    }
    
    setUploadingPhoto(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      
      const res = await fetch("/api/admin/barbers/upload", {
        method: "POST",
        body: uploadData
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message);
      
      setFormData({ ...formData, photo_url: data.photoUrl });
      showToast("Foto berhasil diunggah", "success");
    } catch (err: any) {
      showToast(err.message || "Gagal mengunggah foto", "error");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const method = isEditing ? "PUT" : "POST";
      const payload = isEditing ? { id: formData.id, ...formData } : formData;
      
      const res = await fetch("/api/admin/barbers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Terjadi kesalahan");
      
      showToast(isEditing ? "Data berhasil diperbarui" : "Kapster berhasil ditambahkan", "success");
      setIsModalOpen(false);
      fetchBarbers(); // Refresh daftar
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus kapster "${name}"?\nPeringatan: Tidak bisa dihapus jika ada pesanan (booking) yang masih aktif.`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/admin/barbers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal menghapus kapster");
      
      showToast("Kapster berhasil dihapus", "success");
      fetchBarbers();
    } catch (err: any) {
      showToast(err.message, "error");
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // TELEGRAM MODAL HANDLERS
  // ═══════════════════════════════════════════════════════════

  const openTelegramModal = (barber: Barber) => {
    setTelegramBarber(barber);
    setTelegramChatId(barber.telegram_chat_id || "");
    setTelegramUsername(barber.telegram_username || "");
    setTelegramError("");
    setTelegramModalOpen(true);
  };

  const handleTelegramSubmit = async () => {
    if (!telegramBarber) return;
    setTelegramError("");

    // Client-side validation
    const chatIdClean = telegramChatId.trim();
    if (!chatIdClean) {
      setTelegramError("Chat ID wajib diisi.");
      return;
    }
    if (!/^\d{5,15}$/.test(chatIdClean)) {
      setTelegramError("Chat ID harus berupa angka saja (5-15 digit). Jangan ketik @username, ketik angkanya.");
      return;
    }

    setTelegramSubmitting(true);
    try {
      const res = await fetch(`/api/admin/barbers/${telegramBarber.id}/telegram`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: chatIdClean,
          telegram_username: telegramUsername.trim() || null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "CHAT_ID_DUPLICATE") {
          setTelegramError("Chat ID ini sudah terdaftar untuk barber lain di toko ini. Pastikan angkanya benar.");
        } else if (data.error === "CHAT_ID_TAKEN") {
          setTelegramError("Chat ID ini sudah digunakan di toko lain.");
        } else if (data.error === "INVALID_CHAT_ID") {
          setTelegramError("Chat ID harus berupa angka saja. Jangan ketik @username, ketik angkanya.");
        } else {
          setTelegramError(data.message || "Terjadi kesalahan.");
        }
        return;
      }

      // Sukses → update state lokal langsung tanpa reload
      setBarbers(prev => prev.map(b =>
        b.id === telegramBarber.id
          ? { ...b, telegram_chat_id: chatIdClean, telegram_username: telegramUsername.trim().replace(/^@/, '') || null }
          : b
      ));
      setTelegramModalOpen(false);
      showToast(`✅ Telegram ${telegramBarber.name} berhasil dihubungkan!`, "success");
    } catch (err: any) {
      setTelegramError(err.message || "Gagal menghubungkan Telegram.");
    } finally {
      setTelegramSubmitting(false);
    }
  };

  const openDisconnectModal = (barber: Barber) => {
    setDisconnectBarber(barber);
    setDisconnectModalOpen(true);
  };

  const handleDisconnect = async () => {
    if (!disconnectBarber) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/admin/barbers/${disconnectBarber.id}/telegram`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memutuskan Telegram");

      // Update state lokal langsung
      setBarbers(prev => prev.map(b =>
        b.id === disconnectBarber.id
          ? { ...b, telegram_chat_id: null, telegram_username: null }
          : b
      ));
      setDisconnectModalOpen(false);
      showToast(`Telegram ${disconnectBarber.name} berhasil diputuskan`, "success");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setDisconnecting(false);
    }
  };

  // Helper: Sensor Chat ID
  const maskChatId = (chatId: string) => {
    if (chatId.length <= 4) return chatId;
    return '••••' + chatId.slice(-4);
  };

  return (
    <main className="min-h-screen bg-background text-accent pb-24 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-neutral-800/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl border text-sm shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-top-4 fade-in duration-300
          ${toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
          <span className="text-lg">{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto relative z-10 px-4">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <Link href="/admin" className="text-primary hover:text-primary-hover text-sm font-medium transition-colors">← Kembali</Link>
               <span className="text-neutral-600 text-sm">•</span>
               <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Manajemen <span className="text-primary">Kapster</span></h1>
            <p className="text-neutral-400 text-sm mt-1">Kelola data barber, spesialisasi, dan kru Anda.</p>
          </div>
          
          <button 
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-background px-5 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/10"
          >
            <span className="text-lg">+</span> Tambah Kapster
          </button>
        </header>

        {/* Content */}
        {loading && barbers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-neutral-500 text-sm animate-pulse tracking-wider">MEMUAT DATA...</p>
          </div>
        ) : barbers.length === 0 ? (
          <div className="glass p-12 rounded-3xl border border-neutral-800/50 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center text-4xl mb-4 border border-neutral-800">
              💇‍♂️
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Belum ada Kapster</h3>
            <p className="text-neutral-400 text-sm mb-6 max-w-sm">
              Anda belum menambahkan kru barber apapun. Tambahkan sekarang agar pelanggan bisa mulai melakukan pemesanan.
            </p>
            <button onClick={openAddModal} className="text-primary font-medium hover:text-primary-hover underline">Tambah Barber Pertama</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {barbers.map(barber => (
              <div key={barber.id} className="glass p-5 rounded-2xl border border-neutral-800/50 relative group">
                {/* Actions (Edit / Delete) */}
                <div className="absolute top-4 right-4 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                   <button onClick={() => openEditModal(barber)} className="w-8 h-8 rounded-lg bg-neutral-900/80 border border-neutral-700 text-neutral-400 hover:text-primary hover:border-primary/50 flex items-center justify-center transition-all" title="Edit">
                      ✏️
                   </button>
                   <button onClick={() => handleDelete(barber.id, barber.name)} className="w-8 h-8 rounded-lg bg-neutral-900/80 border border-neutral-700 text-neutral-400 hover:text-red-500 hover:border-red-500/50 flex items-center justify-center transition-all" title="Hapus">
                      🗑️
                   </button>
                </div>

                <div className="flex flex-col items-center text-center mt-2">
                  {barber.photo_url ? (
                    <img src={barber.photo_url} alt={barber.name} className="w-24 h-24 object-cover rounded-full border-2 border-primary/30 mb-4 shadow-lg shadow-primary/5" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-4xl mb-4">
                      ✂️
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-white mb-1">{barber.name}</h3>
                  <span className="text-xs font-medium uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 mb-3">
                    {barber.specialty || "General Barber"}
                  </span>
                  <div className="w-full bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50 mt-2">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">📞 Kontak</p>
                    <p className="text-sm text-neutral-300 font-mono">{barber.phone || "-"}</p>
                  </div>

                  {/* ═══ TELEGRAM STATUS BADGE ═══ */}
                  <div className="w-full mt-3">
                    {barber.telegram_chat_id ? (
                      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          <span className="text-xs font-semibold text-green-400">Telegram Terhubung</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 font-mono mb-2.5">
                          {barber.telegram_username ? `@${barber.telegram_username}` : `ID: ${maskChatId(barber.telegram_chat_id)}`}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openTelegramModal(barber)}
                            className="flex-1 text-[11px] py-1.5 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors border border-neutral-700"
                          >
                            ⚙️ Ganti
                          </button>
                          <button
                            onClick={() => openDisconnectModal(barber)}
                            className="flex-1 text-[11px] py-1.5 bg-neutral-800/80 hover:bg-red-500/20 text-neutral-300 hover:text-red-400 rounded-lg transition-colors border border-neutral-700 hover:border-red-500/30"
                          >
                            🔌 Putuskan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-xl p-3">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <span className="w-2 h-2 bg-neutral-500 rounded-full"></span>
                          <span className="text-xs font-semibold text-neutral-500">Belum Terhubung</span>
                        </div>
                        <p className="text-[10px] text-neutral-600 mb-2.5">Barber belum bisa pakai kasir</p>
                        <button
                          onClick={() => openTelegramModal(barber)}
                          className="w-full text-[11px] py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors border border-blue-500/20 hover:border-blue-500/40 font-medium"
                        >
                          📱 Hubungkan Telegram
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ Modal: Add/Edit Barber (EXISTING) ═══════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !submitting && setIsModalOpen(false)}></div>
          
          {/* Modal Box */}
          <div className="relative z-10 w-full max-w-md bg-neutral-950 border border-neutral-800 max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-neutral-800/50">
              <h2 className="text-xl font-bold">{isEditing ? "✏️ Edit Kapster" : "➕ Tambah Kapster"}</h2>
              <p className="text-xs text-neutral-500 mt-1">Lengkapi informasi kru barber Anda.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Photo Upload area */}
              <div className="flex flex-col items-center gap-3">
                {formData.photo_url ? (
                  <img src={formData.photo_url} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-primary/50" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-neutral-900 border-2 border-dashed border-neutral-700 flex items-center justify-center text-2xl">
                    📷
                  </div>
                )}
                
                <label className="cursor-pointer bg-neutral-900 hover:bg-neutral-800 text-xs px-4 py-2 rounded-lg transition-colors border border-neutral-800 flex items-center gap-2">
                  {uploadingPhoto ? (
                    <>
                      <span className="w-3 h-3 border-2 border-neutral-500 border-t-primary rounded-full animate-spin"></span> 
                      Mengunggah...
                    </>
                  ) : (
                    "Pilih Foto"
                  )}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto || submitting} />
                </label>
              </div>

              {/* Inputs */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="Contoh: Budi Santoso"
                  required 
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Nomor WhatsApp</label>
                <input 
                  type="tel" 
                  value={formData.phone || ""} 
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  placeholder="Contoh: 08123456789"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Spesialisasi</label>
                <input 
                  type="text" 
                  value={formData.specialty || ""} 
                  onChange={(e) => setFormData({...formData, specialty: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="Contoh: Fade Expert, Classic Pompadour"
                  disabled={submitting}
                />
              </div>

              {/* CTA */}
              <div className="flex gap-3 pt-4 border-t border-neutral-800/50">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={submitting || !formData.name}
                  className="flex-1 py-3 bg-primary hover:bg-primary-hover text-background font-bold rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {submitting ? (
                    <><span className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin"></span> Menyimpan...</>
                  ) : "Simpan Data"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ Modal: Hubungkan Telegram ═══════════ */}
      {telegramModalOpen && telegramBarber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !telegramSubmitting && setTelegramModalOpen(false)}></div>
          
          <div className="relative z-10 w-full max-w-md bg-neutral-950 border border-neutral-800 max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-neutral-800/50">
              <h2 className="text-xl font-bold">📱 Hubungkan Telegram</h2>
              <p className="text-sm text-neutral-400 mt-1">
                {telegramBarber.telegram_chat_id ? `Ganti koneksi Telegram ${telegramBarber.name}` : `Hubungkan ${telegramBarber.name} ke kasir Telegram`}
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Instruksi */}
              <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-400 mb-2.5">📋 Cara mendapatkan Chat ID barber:</p>
                <ol className="text-xs text-neutral-400 space-y-1.5 list-decimal list-inside">
                  <li>Minta <span className="text-white font-medium">{telegramBarber.name}</span> buka Telegram</li>
                  <li>Cari bot kasir toko kamu</li>
                  <li>Ketik perintah: <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-blue-300">/daftar</code></li>
                  <li>Bot akan membalas dengan Chat ID berupa angka</li>
                  <li>Minta <span className="text-white font-medium">{telegramBarber.name}</span> kirimkan angka tersebut ke kamu</li>
                  <li>Masukkan angka itu di kolom bawah ini</li>
                </ol>
              </div>

              {/* Form Chat ID */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Chat ID Telegram <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  value={telegramChatId}
                  onChange={(e) => {
                    setTelegramChatId(e.target.value);
                    setTelegramError("");
                  }}
                  className={`w-full bg-neutral-900 border rounded-xl px-4 py-3 text-white focus:outline-none transition-colors font-mono text-sm ${
                    telegramError ? 'border-red-500/50 focus:border-red-500' : 'border-neutral-800 focus:border-primary'
                  }`}
                  placeholder="Contoh: 123456789"
                  disabled={telegramSubmitting}
                />
                <p className="text-[10px] text-neutral-600 mt-1">Chat ID berupa angka saja, bukan @username</p>
              </div>

              {/* Form Username */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Username Telegram (opsional)</label>
                <input
                  type="text"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors text-sm"
                  placeholder="@namabarber"
                  disabled={telegramSubmitting}
                />
                <p className="text-[10px] text-neutral-600 mt-1">Isi jika barber punya username Telegram</p>
              </div>

              {/* Inline Error */}
              {telegramError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                  <span className="text-red-500 text-sm mt-0.5">⚠️</span>
                  <p className="text-xs text-red-400">{telegramError}</p>
                </div>
              )}

              {/* CTA */}
              <div className="flex gap-3 pt-4 border-t border-neutral-800/50">
                <button
                  type="button"
                  onClick={() => setTelegramModalOpen(false)}
                  disabled={telegramSubmitting}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleTelegramSubmit}
                  disabled={telegramSubmitting || !telegramChatId.trim()}
                  className="flex-1 py-3 bg-primary hover:bg-primary-hover text-background font-bold rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {telegramSubmitting ? (
                    <><span className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin"></span> Menyimpan...</>
                  ) : "💾 Simpan & Hubungkan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Modal: Konfirmasi Putuskan Telegram ═══════════ */}
      {disconnectModalOpen && disconnectBarber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !disconnecting && setDisconnectModalOpen(false)}></div>

          <div className="relative z-10 w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-red-500/20">
                ⚠️
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Putuskan Telegram {disconnectBarber.name}?</h3>
              <p className="text-sm text-neutral-400 mb-6">
                Setelah diputuskan, <span className="text-white font-medium">{disconnectBarber.name}</span> tidak bisa menggunakan kasir Telegram sampai dihubungkan kembali.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDisconnectModalOpen(false)}
                  disabled={disconnecting}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {disconnecting ? (
                    <><span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span> Memutuskan...</>
                  ) : "Ya, Putuskan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
