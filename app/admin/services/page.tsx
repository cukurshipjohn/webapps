"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  service_type: "BARBERSHOP" | "HOME";
  tenant_id: string;
}

export default function AdminServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Service>>({ name: "", price: 0, duration_minutes: 30, service_type: "BARBERSHOP" });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/services");
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memuat data");
      setServices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setFormData({ name: "", price: 0, duration_minutes: 30, service_type: "BARBERSHOP" });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    // Hilangkan prefix untuk ditampilkan di field edit
    let cleanName = service.name;
    if (cleanName.startsWith('BARBER | ')) cleanName = cleanName.replace('BARBER | ', '');
    if (cleanName.startsWith('HOME | ')) cleanName = cleanName.replace('HOME | ', '');

    setFormData({
      id: service.id,
      name: cleanName,
      price: service.price,
      duration_minutes: service.duration_minutes,
      service_type: service.service_type || (service.name.startsWith('HOME') ? 'HOME' : 'BARBERSHOP')
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const method = isEditing ? "PUT" : "POST";
      const payload = isEditing ? { id: formData.id, ...formData } : formData;
      
      const res = await fetch("/api/admin/services", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Terjadi kesalahan");
      
      showToast(isEditing ? "Layanan berhasil diperbarui" : "Layanan berhasil ditambahkan", "success");
      setIsModalOpen(false);
      fetchServices(); 
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    // Tampilkan nama bersih tanpa prefix di konfirmasi
    const cleanName = name.replace('BARBER | ', '').replace('HOME | ', '');
    if (!confirm(`Apakah Anda yakin ingin menghapus layanan "${cleanName}"?\nPeringatan: Tidak bisa dihapus jika ada pesanan (booking) yang masih aktif menggunakan layanan ini.`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/admin/services", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal menghapus layanan");
      
      showToast("Layanan berhasil dihapus", "success");
      fetchServices();
    } catch (err: any) {
      showToast(err.message, "error");
      setLoading(false);
    }
  };

  const formatRupiah = (number: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(number);
  };

  // Pisahkan layanan berdasarkan tipe
  const barbershopServices = services.filter(s => s.service_type === "BARBERSHOP" || (!s.service_type && !s.name.startsWith("HOME")));
  const homeServices = services.filter(s => s.service_type === "HOME" || (!s.service_type && s.name.startsWith("HOME")));

  return (
    <main className="min-h-screen bg-background text-accent pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
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
               <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Manajemen <span className="text-primary">Layanan</span></h1>
            <p className="text-neutral-400 text-sm mt-1">Kelola harga dan durasi treatment yang Anda tawarkan.</p>
          </div>
          
          <button 
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-background px-5 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/10"
          >
            <span className="text-lg">+</span> Tambah Layanan
          </button>
        </header>

        {loading && services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-12">
            
            {/* Section: Barbershop */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xl">💈</div>
                 <h2 className="text-xl font-bold">Layanan di Barbershop</h2>
              </div>
              
              {barbershopServices.length === 0 ? (
                 <p className="text-neutral-500 text-sm italic py-4">Belum ada layanan Barbershop terdaftar.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {barbershopServices.map(service => (
                    <ServiceCard key={service.id} service={service} onEdit={() => openEditModal(service)} onDelete={() => handleDelete(service.id, service.name)} formatRupiah={formatRupiah} />
                  ))}
                </div>
              )}
            </section>

            {/* Section: Home Service */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xl">🛵</div>
                 <h2 className="text-xl font-bold">Layanan Home Service</h2>
              </div>
              
              {homeServices.length === 0 ? (
                 <p className="text-neutral-500 text-sm italic py-4">Belum ada layanan Home Service terdaftar.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {homeServices.map(service => (
                    <ServiceCard key={service.id} service={service} onEdit={() => openEditModal(service)} onDelete={() => handleDelete(service.id, service.name)} formatRupiah={formatRupiah} isHome />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !submitting && setIsModalOpen(false)}></div>
          
          <div className="relative z-10 w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-neutral-800/50">
              <h2 className="text-xl font-bold">{isEditing ? "✏️ Edit Layanan" : "➕ Tambah Layanan"}</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Tipe Layanan <span className="text-red-500">*</span></label>
                <select 
                  value={formData.service_type} 
                  onChange={(e) => setFormData({...formData, service_type: e.target.value as "BARBERSHOP" | "HOME"})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                  disabled={submitting}
                >
                  <option value="BARBERSHOP">💈 Di Barbershop</option>
                  <option value="HOME">🛵 Home Service (Panggilan)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Nama Layanan <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="Contoh: Premium Haircut"
                  required 
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Harga (Rp) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" 
                    min="0"
                    step="5000"
                    value={formData.price || ""} 
                    onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono"
                    placeholder="50000"
                    required
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Estimasi Waktu <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input 
                      type="number" 
                      min="5"
                      step="5"
                      value={formData.duration_minutes || ""} 
                      onChange={(e) => setFormData({...formData, duration_minutes: Number(e.target.value)})}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors font-mono pr-12"
                      required
                      disabled={submitting}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">Menit</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-neutral-800/50">
                <button type="button" onClick={() => setIsModalOpen(false)} disabled={submitting} className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800">
                  Batal
                </button>
                <button type="submit" disabled={submitting || !formData.name || !formData.price || !formData.duration_minutes} className="flex-1 py-3 bg-primary hover:bg-primary-hover text-background font-bold rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                  {submitting ? <><span className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin"></span> Menyimpan...</> : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

// Komponen Card Terpisah untuk Layanan
function ServiceCard({ service, onEdit, onDelete, formatRupiah, isHome = false }: any) {
  const cleanName = service.name.replace('BARBER | ', '').replace('HOME | ', '');
  
  return (
    <div className="glass p-5 rounded-2xl border border-neutral-800/50 flex flex-col relative group">
       <div className="absolute top-4 right-4 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="w-7 h-7 rounded-md bg-neutral-900/80 border border-neutral-700 text-neutral-400 hover:text-primary hover:border-primary/50 flex items-center justify-center transition-all text-xs" title="Edit">✏️</button>
          <button onClick={onDelete} className="w-7 h-7 rounded-md bg-neutral-900/80 border border-neutral-700 text-neutral-400 hover:text-red-500 hover:border-red-500/50 flex items-center justify-center transition-all text-xs" title="Hapus">🗑️</button>
       </div>
       <h3 className="text-lg font-bold text-white mb-3 pr-16 leading-tight">{cleanName}</h3>
       
       <div className="mt-auto space-y-2">
         <div className="flex items-center justify-between bg-neutral-900/40 p-3 rounded-lg border border-neutral-800/30">
            <span className="text-xs text-neutral-500 font-medium">Tarif</span>
            <span className="text-primary font-bold font-mono">{formatRupiah(service.price)}</span>
         </div>
         <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-neutral-500 flex items-center gap-1">⏱️ Estimasi Pengerjaan</span>
            <span className="text-xs text-neutral-300 font-mono">{service.duration_minutes} Menit</span>
         </div>
       </div>
    </div>
  )
}
