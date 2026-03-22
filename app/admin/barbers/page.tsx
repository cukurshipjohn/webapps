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
  tenant_id: string;
  created_at: string;
}

export default function AdminBarbersPage() {
  const router = useRouter();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Barber>>({ name: "", phone: "", specialty: "", photo_url: "" });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    setFormData({ name: "", phone: "", specialty: "", photo_url: "" });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (barber: Barber) => {
    setFormData({
      id: barber.id,
      name: barber.name,
      phone: barber.phone || "",
      specialty: barber.specialty || "",
      photo_url: barber.photo_url || ""
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
    if (!confirm(`Apakah Anda yakin ingin menghapus kapster "${name}"?
Peringatan: Tidak bisa dihapus jika ada pesanan (booking) yang masih aktif.`)) {
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
      setLoading(false); // Enable UI back if failed
    }
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Form */}
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
    </main>
  );
}
