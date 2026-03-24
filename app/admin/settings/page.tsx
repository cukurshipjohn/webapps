"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import WhatsAppSettingsTab from "./WhatsAppSettingsTab";

// Tipe Data untuk Settings
interface TenantSettings {
  shop_name: string;
  shop_tagline: string;
  logo_url: string | null;
  hero_image_url: string | null;
  color_primary: string;
  color_primary_hover: string;
  color_background: string;
  color_surface: string;
  color_accent: string;
  color_secondary: string;
  use_gradient: boolean;
  font_choice: 'modern' | 'classic' | 'bold';
  whatsapp_owner: string | null;
  operating_open: string;
  operating_close: string;
  is_home_service_enabled: boolean;
}

type TabType = 'identity' | 'appearance' | 'operational' | 'whatsapp' | 'preview';

export default function AdminSettingsPage() {
  const router = useRouter();
  
  // States
  const [activeTab, setActiveTab] = useState<TabType>('identity');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  const [settings, setSettings] = useState<TenantSettings>({
    shop_name: "My Barbershop",
    shop_tagline: "Tampil Kece, Harga Terjangkau",
    logo_url: "",
    hero_image_url: "",
    color_primary: "#F59E0B",
    color_primary_hover: "#D97706",
    color_background: "#0A0A0A",
    color_surface: "#171717",
    color_accent: "#FFFFFF",
    color_secondary: "#D97706",
    use_gradient: false,
    font_choice: "modern",
    whatsapp_owner: "",
    operating_open: "10:00",
    operating_close: "20:00",
    is_home_service_enabled: true
  });

  // Init Data
  useEffect(() => {
    fetchSettings();
  }, []);

  // Memaksa Live Preview CSS ketika `settings` diubah
  useEffect(() => {
    if (loading) return; // Tunggu data db dulu
    const root = document.documentElement;
    root.style.setProperty('--color-primary', settings.color_primary);
    root.style.setProperty('--color-primary-hover', settings.color_primary_hover);
    root.style.setProperty('--color-background', settings.color_background);
    root.style.setProperty('--color-surface', settings.color_surface);
    root.style.setProperty('--color-accent', settings.color_accent);
    root.style.setProperty('--color-secondary', settings.color_secondary);
    
    // Derived
    const btnBg = settings.use_gradient 
      ? `linear-gradient(to right, ${settings.color_primary}, ${settings.color_secondary})` 
      : settings.color_primary;
      
    const btnBgHover = settings.use_gradient 
      ? `linear-gradient(to right, ${settings.color_primary_hover}, ${settings.color_secondary})` 
      : settings.color_primary_hover;

    root.style.setProperty('--theme-button-bg', btnBg);
    root.style.setProperty('--theme-button-bg-hover', btnBgHover);
  }, [settings, loading]);


  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memuat pengaturan");
      setSettings(data);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal menyimpan pengaturan");
      
      showToast("✅ Tampilan berhasil diterbitkan! Tamu akan melihat perubahan segera.", "success");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'hero') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast("Hanya file gambar yang diizinkan.", "error"); 
        return; 
    }

    if (field === 'logo') setUploadingLogo(true);
    else setUploadingHero(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', field === 'logo' ? 'logos' : 'heroes');

      const res = await fetch('/api/admin/settings/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      if (field === 'logo') setSettings(s => ({ ...s, logo_url: data.url }));
      if (field === 'hero') setSettings(s => ({ ...s, hero_image_url: data.url }));
      
      showToast("Gambar berhasil diunggah!", "success");
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, "error");
    } finally {
      if (field === 'logo') setUploadingLogo(false);
      else setUploadingHero(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-accent)] pb-24 relative overflow-x-hidden">
      
      {/* TOAST SYSTEM */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-xl border text-sm shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-top-4 fade-in duration-300
          ${toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
          <span className="text-lg">{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* HEADER */}
        <header className="mb-8 border-b border-neutral-800/60 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <span className="text-neutral-400 text-sm font-mono uppercase tracking-wider">Admin Panel</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Setelan Visual Editor</h1>
            <p className="text-neutral-400 text-sm mt-1">Ubah tampilan toko secara real-time sebelum menyimpannya.</p>
          </div>
          <button 
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 btn-primary text-background font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
            >
            {saving ? "Menyimpan..." : "💾 Simpan & Terapkan"}
          </button>
        </header>

        {/* EDITOR LAYOUT: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* COLUMN 1: CONTROLS (TABS & FORMS) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
                
                {/* TAB NAVIGATION */}
                <div className="flex overflow-x-auto hide-scrollbar gap-2 p-1 bg-neutral-900/50 rounded-2xl border border-neutral-800/80">
                    <button onClick={() => setActiveTab('identity')} className={`flex-1 min-w-[120px] px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'identity' ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}>
                        📝 Identitas
                    </button>
                    <button onClick={() => setActiveTab('appearance')} className={`flex-1 min-w-[120px] px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'appearance' ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}>
                        🎨 Tampilan
                    </button>
                    <button onClick={() => setActiveTab('operational')} className={`flex-1 min-w-[120px] px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'operational' ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}>
                        ⚙️ Operasional
                    </button>
                    <button onClick={() => setActiveTab('whatsapp')} className={`flex-1 min-w-[120px] px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'whatsapp' ? 'bg-[var(--color-surface)] text-green-500 shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}>
                        💬 WhatsApp
                    </button>
                    <button onClick={() => setActiveTab('preview')} className={`flex-1 min-w-[120px] px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'} lg:hidden`}>
                        📱 Pratinjau
                    </button>
                </div>

                {/* TAB PANELS */}
                <div className="glass p-6 md:p-8 rounded-3xl border border-[var(--color-primary)]/10 shadow-2xl">
                    
                    {/* TAB 1: IDENTITY */}
                    {activeTab === 'identity' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-neutral-300">Nama Toko</label>
                                    <input type="text" value={settings.shop_name} onChange={e => setSettings({...settings, shop_name: e.target.value})}
                                        className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-neutral-300">Tagline Singkat</label>
                                    <input type="text" value={settings.shop_tagline || ""} onChange={e => setSettings({...settings, shop_tagline: e.target.value})}
                                        className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="block text-sm font-medium text-neutral-300">Nomor WhatsApp Owner</label>
                                    <input type="text" value={settings.whatsapp_owner || ""} onChange={e => setSettings({...settings, whatsapp_owner: e.target.value})}
                                        className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                                </div>
                            </div>
                            
                            <hr className="border-neutral-800 my-6" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Logo Upload */}
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-neutral-300">Logo Barbershop (Square)</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-black border border-neutral-800 flex items-center justify-center overflow-hidden shrink-0">
                                            {settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <span className="text-2xl">💈</span>}
                                        </div>
                                        <label className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 px-4 py-2 rounded-xl text-sm transition-colors text-white">
                                            {uploadingLogo ? 'Mengunggah...' : 'Pilih File Logo'}
                                            <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={(e) => handleFileUpload(e, 'logo')} />
                                        </label>
                                    </div>
                                </div>

                                {/* Hero Upload */}
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-neutral-300">Hero Banner Banner (Landscape)</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="w-full h-24 rounded-2xl bg-black border border-neutral-800 flex items-center justify-center overflow-hidden shrink-0">
                                            {settings.hero_image_url ? <img src={settings.hero_image_url} alt="Hero" className="w-full h-full object-cover" /> : <span className="text-neutral-600 text-xs">Belum ada banner</span>}
                                        </div>
                                        <label className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 px-4 py-2 rounded-xl text-sm transition-colors text-white text-center">
                                            {uploadingHero ? 'Mengunggah...' : 'Pilih File Banner'}
                                            <input type="file" accept="image/*" className="hidden" disabled={uploadingHero} onChange={(e) => handleFileUpload(e, 'hero')} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: APPEARANCE */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            
                            {/* Color Presets */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-neutral-300 mb-3">Pola Warna Cepat (Quick Picks)</label>
                                <div className="flex flex-wrap gap-3">
                                    <button onClick={() => setSettings({...settings, color_primary: '#F59E0B', color_primary_hover: '#D97706', use_gradient: false})} className="px-4 py-2 rounded-xl border border-neutral-800 bg-neutral-900 flex gap-2 items-center hover:bg-neutral-800">
                                        <div className="w-4 h-4 rounded-full bg-[#f59e0b]"></div> Classic Amber
                                    </button>
                                    <button onClick={() => setSettings({...settings, color_primary: '#3B82F6', color_primary_hover: '#2563EB', use_gradient: false})} className="px-4 py-2 rounded-xl border border-neutral-800 bg-neutral-900 flex gap-2 items-center hover:bg-neutral-800">
                                        <div className="w-4 h-4 rounded-full bg-[#3B82F6]"></div> Royal Blue
                                    </button>
                                    <button onClick={() => setSettings({...settings, color_primary: '#10B981', color_primary_hover: '#059669', color_secondary: '#3B82F6', use_gradient: true})} className="px-4 py-2 rounded-xl border border-neutral-800 bg-neutral-900 flex gap-2 items-center hover:bg-neutral-800">
                                        <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[#10b981] to-[#3b82f6]"></div> Ocean Gradient
                                    </button>
                                    <button onClick={() => setSettings({...settings, color_primary: '#f43f5e', color_primary_hover: '#e11d48', color_secondary: '#f97316', use_gradient: true})} className="px-4 py-2 rounded-xl border border-neutral-800 bg-neutral-900 flex gap-2 items-center hover:bg-neutral-800">
                                        <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[#f43f5e] to-[#f97316]"></div> Sunset Gradient
                                    </button>
                                </div>
                            </div>

                            <hr className="border-neutral-800" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-neutral-300 text-primary">Warna Utama (Brand Color)</label>
                                        <div className="flex gap-3 items-center">
                                            <input type="color" value={settings.color_primary} onChange={e => setSettings({...settings, color_primary: e.target.value})} className="w-14 h-14 bg-transparent rounded-xl cursor-pointer border-0 p-0 shadow-lg" />
                                            <input type="text" value={settings.color_primary} onChange={e => setSettings({...settings, color_primary: e.target.value})} className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 font-mono" />
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 bg-black/30 rounded-2xl border border-neutral-800 flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-sm text-white flex items-center gap-2">Gunakan Gradien</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={settings.use_gradient} onChange={(e) => setSettings({...settings, use_gradient: e.target.checked})} />
                                            <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                                        </label>
                                    </div>

                                    {settings.use_gradient && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-sm font-medium text-neutral-300">Warna Sekunder (Gradient)</label>
                                        <div className="flex gap-3 items-center">
                                            <input type="color" value={settings.color_secondary} onChange={e => setSettings({...settings, color_secondary: e.target.value})} className="w-14 h-14 bg-transparent rounded-xl cursor-pointer border-0 p-0" />
                                            <input type="text" value={settings.color_secondary} onChange={e => setSettings({...settings, color_secondary: e.target.value})} className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 font-mono" />
                                        </div>
                                    </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                     <div className="space-y-2">
                                        <label className="block text-sm font-medium text-neutral-300">Warna Background (Dasar)</label>
                                        <div className="flex gap-3 items-center">
                                            <input type="color" value={settings.color_background} onChange={e => setSettings({...settings, color_background: e.target.value})} className="w-10 h-10 bg-transparent rounded-lg cursor-pointer border-0 p-0" />
                                            <input type="text" value={settings.color_background} onChange={e => setSettings({...settings, color_background: e.target.value})} className="w-full bg-black/40 border border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-neutral-300">Warna Surface (Kartu)</label>
                                        <div className="flex gap-3 items-center">
                                            <input type="color" value={settings.color_surface} onChange={e => setSettings({...settings, color_surface: e.target.value})} className="w-10 h-10 bg-transparent rounded-lg cursor-pointer border-0 p-0" />
                                            <input type="text" value={settings.color_surface} onChange={e => setSettings({...settings, color_surface: e.target.value})} className="w-full bg-black/40 border border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <hr className="border-neutral-800" />
                            
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-neutral-300">Pilihan Tipografi</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div onClick={() => setSettings({...settings, font_choice: 'modern'})} className={`p-4 rounded-xl border cursor-pointer transition-all ${settings.font_choice === 'modern' ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-neutral-800 hover:border-neutral-600'}`}>
                                        <p className="text-xs text-neutral-400 mb-2">Modern (Outfit)</p>
                                        <p className="text-xl font-bold font-sans">Barbershop Style</p>
                                    </div>
                                    <div onClick={() => setSettings({...settings, font_choice: 'classic'})} className={`p-4 rounded-xl border cursor-pointer transition-all ${settings.font_choice === 'classic' ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-neutral-800 hover:border-neutral-600'}`}>
                                        <p className="text-xs text-neutral-400 mb-2">Classic (Serif)</p>
                                        <p className="text-xl font-bold" style={{fontFamily: "Merriweather, serif"}}>Barbershop Style</p>
                                    </div>
                                    <div onClick={() => setSettings({...settings, font_choice: 'bold'})} className={`p-4 rounded-xl border cursor-pointer transition-all ${settings.font_choice === 'bold' ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-neutral-800 hover:border-neutral-600'}`}>
                                        <p className="text-xs text-neutral-400 mb-2">Bold (Montserrat)</p>
                                        <p className="text-xl font-bold tracking-wider" style={{fontFamily: "Montserrat, sans-serif"}}>Barbershop Style</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: OPERATIONAL */}
                    {activeTab === 'operational' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-neutral-300">Jam Buka (WIB)</label>
                                    <input type="time" value={settings.operating_open} onChange={e => setSettings({...settings, operating_open: e.target.value})} className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 color-scheme-dark" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-neutral-300">Jam Tutup (WIB)</label>
                                    <input type="time" value={settings.operating_close} onChange={e => setSettings({...settings, operating_close: e.target.value})} className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 color-scheme-dark" />
                                </div>
                            </div>

                            <div className="p-5 bg-neutral-900/50 rounded-2xl border border-[var(--color-primary)]/20 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                                <div>
                                    <p className="font-bold text-white text-lg">Layanan Panggilan (Home Service)</p>
                                    <p className="text-sm text-neutral-400 mt-1">Izinkan pelanggan untuk memesan kapster dan potong rambut di rumah mereka sendiri.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input type="checkbox" className="sr-only peer" checked={settings.is_home_service_enabled} onChange={(e) => setSettings({...settings, is_home_service_enabled: e.target.checked})} />
                                    <div className="w-14 h-7 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[var(--color-primary)] shadow-inner"></div>
                                </label>
                            </div>
                            
                            <div className="p-5 border border-dashed border-neutral-800 rounded-2xl text-center">
                                <span className="text-2xl mb-2 block">🏖️</span>
                                <h3 className="font-bold mb-1">Pengaturan Hari Libur</h3>
                                <p className="text-sm text-neutral-500 mb-4">Kelola jadwal tutup toko dan cuti kapster Anda di sini.</p>
                                <Link href="/admin/time-off" className="inline-block px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors">
                                    Kelola Jadwal Libur →
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: WHATSAPP */}
                    {activeTab === 'whatsapp' && (
                        <WhatsAppSettingsTab />
                    )}
                </div>
            </div>

            {/* COLUMN 2: LIVE PREVIEW WIDGET */}
            <div className={`lg:col-span-5 xl:col-span-4 ${activeTab === 'preview' ? 'block' : 'hidden lg:block'}`}>
                <div className="sticky top-8">
                    <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Live Preview 
                    </h2>
                    
                    {/* PHONE FRAME SIMULATION */}
                    <div className="w-full max-w-[360px] mx-auto bg-[var(--color-background)] rounded-[2.5rem] border-[8px] border-neutral-900 shadow-2xl overflow-hidden relative" style={{ height: '650px', fontFamily: settings.font_choice === 'classic' ? 'Merriweather, serif' : settings.font_choice === 'bold' ? 'Montserrat, sans-serif' : 'var(--font-sans)' }}>
                        <div className="absolute top-0 w-full h-6 bg-transparent z-50 flex justify-center">
                            <div className="w-32 h-6 bg-neutral-900 rounded-b-3xl"></div>
                        </div>

                        {/* MOCKUP CONTENT */}
                        <div className="h-full overflow-y-auto hide-scrollbar text-[var(--color-accent)] relative">
                             {/* Mockup Hero */}
                             <div className="h-48 bg-neutral-900 relative">
                                 {settings.hero_image_url ? (
                                     <img src={settings.hero_image_url} alt="hero" className="w-full h-full object-cover opacity-60 mix-blend-overlay" />
                                 ) : (
                                     <div className="absolute inset-0 bg-gradient-to-tr from-[var(--color-background)] to-[var(--color-primary)] opacity-20"></div>
                                 )}
                                 <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-background)] to-transparent"></div>
                                 
                                 <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3">
                                     <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-[var(--color-surface)] bg-black shrink-0">
                                         {settings.logo_url ? <img src={settings.logo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">💈</div>}
                                     </div>
                                 </div>
                             </div>

                             <div className="px-5 py-2">
                                <h3 className="text-2xl font-bold tracking-tight mb-1">{settings.shop_name || "Nama Toko"}</h3>
                                <p className="text-xs text-[var(--color-primary)] italic font-semibold">{settings.shop_tagline || "Tagline toko..."}</p>
                             </div>

                             <div className="px-5 mt-6 space-y-4">
                                
                                <button className="w-full py-3.5 btn-primary rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 text-sm text-black shadow-[var(--color-primary)]/20">
                                    ✂️ Book Appointment
                                </button>

                                <div className="p-4 rounded-2xl glass space-y-3 mt-4">
                                     <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Pricing</h4>
                                     <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                         <span className="text-sm font-medium">Haircut & Styling</span>
                                         <span className="text-sm font-bold text-[var(--color-primary)]">Rp 50k</span>
                                     </div>
                                     <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                         <span className="text-sm font-medium flex items-center gap-2">Home Service </span>
                                         <span className="text-[10px] font-bold bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded uppercase">{settings.is_home_service_enabled ? 'ON' : 'OFF'}</span>
                                     </div>
                                </div>
                             </div>

                        </div>
                    </div>

                </div>
            </div>

        </div>

      </div>
    </main>
  );
}
