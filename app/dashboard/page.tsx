"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PostFeed from "@/components/PostFeed";

type Tab = "profile" | "home" | "history";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile"); // Mulai di tab profil

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", address: "", hobbies: "", photoUrl: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
      return;
    }

    const cachedUser = JSON.parse(userStr);
    if (!cachedUser.name) {
      router.push("/profile/complete");
      return;
    }

    // Tampilkan dulu data dari localStorage agar UI tidak kosong
    setUser(cachedUser);

    // Lalu fetch data TERBARU dari database untuk memastikan foto, alamat, dsb selalu up-to-date
    fetch("/api/profile/me")
      .then(res => res.json())
      .then(freshUser => {
        if (freshUser && freshUser.id) {
          // Update state dan localStorage dengan data terbaru
          setUser(freshUser);
          localStorage.setItem("user", JSON.stringify(freshUser));
        }
      })
      .catch(err => console.error("Gagal refresh profil dari DB:", err));

    // Fetch history & stats paralel
    fetch("/api/profile/history")
      .then(res => res.json())
      .then(data => {
        if (data.stats) {
          setStats(data.stats);
          setHistory(data.history || []);
        }
      })
      .catch(err => console.error("Gagal load history:", err))
      .finally(() => setLoading(false));
  }, [router]);


  const handleEditOpen = () => {
    setEditData({
      name: user?.name || "",
      address: user?.address || "",
      hobbies: user?.hobbies || "",
      photoUrl: user?.photoUrl || ""
    });
    setIsEditing(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert("Pilih file gambar yang valid!"); return; }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/profile/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEditData({ ...editData, photoUrl: data.photoUrl });
    } catch (err: any) {
      alert("Gagal mengupload foto: " + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: editData.name, address: editData.address, hobbies: editData.hobbies, photoUrl: editData.photoUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      setIsEditing(false);
    } catch (err) {
      alert("Gagal menyimpan profil: " + err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (!user || loading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary gap-4">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary inline-block rounded-full animate-spin" />
      <span className="text-sm font-medium tracking-wider animate-pulse">MEMUAT PROFIL...</span>
    </div>
  );

  return (
    <main className="min-h-screen bg-background text-accent pb-24">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-2xl mx-auto relative z-10">

        {/* ===== TOP HEADER ===== */}
        <header className="flex justify-between items-center p-6 pt-10 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">John<span className="text-primary">CukurShip</span></h1>
            <p className="text-neutral-400 text-sm mt-0.5">Selamat datang, <span className="text-white font-medium">{user.name}</span> 👋</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-1.5 bg-neutral-900 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-500/30 rounded-lg text-sm transition-all"
          >
            Keluar
          </button>
        </header>

        {/* ===== TAB CONTENT ===== */}

        {/* --- TAB: PROFIL --- */}
        {activeTab === "profile" && (
          <div className="px-4 space-y-4 animate-in fade-in duration-300">
            {/* Profile Card */}
            <div className="glass p-6 rounded-2xl border border-neutral-800/50">
              <div className="flex justify-between items-start mb-5">
                <h2 className="text-base font-semibold text-primary flex items-center gap-2">👤 Profil Saya</h2>
                <button onClick={handleEditOpen} className="text-xs text-primary hover:text-primary-hover border border-primary/30 hover:border-primary-hover px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5">
                  ✏️ Edit Profil
                </button>
              </div>

              <div className="flex items-center gap-4 mb-5">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-primary/50 shadow-lg shadow-primary/10" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-3xl">👤</div>
                )}
                <div>
                  <h3 className="font-bold text-xl">{user.name}</h3>
                  <p className="text-xs text-neutral-400 font-mono mt-1">📱 {user.phoneNumber}</p>
                  <span className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Member</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">📍 Alamat</p>
                  <p className="text-sm text-white">{user.address || <span className="text-neutral-500 italic">Belum diisi</span>}</p>
                </div>
                <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/50">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">🎯 Hobi</p>
                  <p className="text-sm text-emerald-400">{user.hobbies || <span className="text-neutral-500 italic">Belum diisi</span>}</p>
                </div>
              </div>
            </div>

            {/* Stats Card */}
            <div className="glass p-6 rounded-2xl border border-neutral-800/50">
              <h2 className="text-base font-semibold mb-4 text-primary flex items-center gap-2">🏆 Statistik Member</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/50 text-center">
                  <p className="text-3xl font-bold text-white">{stats?.totalHaircuts || 0}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mt-1">Total Cukur</p>
                </div>
                <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/50 text-center">
                  <p className="text-base font-bold text-primary-hover truncate">{stats?.favoriteBarber || "—"}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mt-1">Barber Favorit</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: BERANDA --- */}
        {activeTab === "home" && (
          <div className="px-4 space-y-4 animate-in fade-in duration-300">

            {/* Pengumuman & Promo */}
            <PostFeed showTitle={true} />

            <div className="glass p-8 rounded-2xl border border-neutral-800/50">
              <h2 className="text-xl font-semibold mb-3 text-primary flex items-center gap-2">📅 Pesan Jadwal Baru</h2>
              <p className="text-neutral-400 mb-6 text-sm leading-relaxed">
                Moro Lungguh Mulih Ngguanteng! Jadwalkan potong rambut dengan barber favorit Anda di barbershop atau langsung di rumah Anda.
              </p>
              <Link href="/book" className="inline-block w-full text-center py-4 btn-primary text-background font-bold rounded-xl transition-all shadow-lg hover:shadow-primary/20 text-lg">
                ✂️ Pesan Layanan Sekarang
              </Link>
            </div>

            {/* Quick Tip */}
            <div className="glass p-5 rounded-2xl border border-neutral-800/50">
              <h3 className="text-sm font-semibold text-neutral-300 mb-2 flex items-center gap-2">💡 Tips</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Pesan minimal H-1 sebelum jadwal Anda. Barber kami aktif 7 hari seminggu. Untuk Home Service, pastikan alamat profil Anda sudah diperbarui.
              </p>
            </div>
          </div>
        )}

        {/* --- TAB: RIWAYAT --- */}
        {activeTab === "history" && (
          <div className="px-4 animate-in fade-in duration-300">
            <div className="glass p-6 rounded-2xl border border-neutral-800/50">
              <h2 className="text-xl font-semibold mb-5 text-primary flex items-center gap-2">📜 Riwayat Pesanan</h2>
              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center text-neutral-500 space-y-3">
                    <span className="text-5xl">💈</span>
                    <p className="text-sm">Belum ada riwayat pesanan.</p>
                    <button onClick={() => setActiveTab("home")} className="mt-2 text-sm text-primary hover:text-primary-hover border border-primary/30 px-4 py-2 rounded-lg transition-all">
                      Buat Pesanan Pertama
                    </button>
                  </div>
                ) : (
                  history.map((booking, index) => {
                    const date = new Date(booking.start_time);
                    const isUpcoming = date > new Date() && booking.status !== 'cancelled';
                    return (
                      <div key={booking.id || index} className={`p-4 rounded-xl border ${isUpcoming ? 'bg-primary/5 border-primary/20' : 'bg-neutral-900/30 border-neutral-800/50'}`}>
                        <div className="flex justify-between items-start mb-2 gap-4">
                          <span className="font-semibold text-white">{booking.services?.name || 'Paket Cukur'}</span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-primary-hover font-bold whitespace-nowrap">${booking.services?.price || '-'}</span>
                            {isUpcoming && <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md whitespace-nowrap">Akan Datang</span>}
                          </div>
                        </div>
                        <div className="text-sm text-neutral-400 space-y-1">
                          <p className="flex justify-between">
                            <span>👤 By {booking.barbers?.name || 'Barber'}</span>
                            <span className="text-xs">{booking.service_type === 'home' ? '🏠 Home' : '💈 Shop'}</span>
                          </p>
                          <p className="flex items-center gap-1 mt-1 text-xs text-neutral-500">
                            <span>🕒</span> {date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== BOTTOM NAVIGATION BAR ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-lg border-t border-neutral-800/60 px-4 py-2 safe-area-bottom">
        <div className="max-w-2xl mx-auto flex justify-around items-center">

          {/* Tab: Profil */}
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center gap-1 py-2 px-6 rounded-xl transition-all duration-200 ${activeTab === "profile" ? "text-primary" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            <span className="text-2xl">{user.photoUrl ? <img src={user.photoUrl} alt="" className={`w-7 h-7 rounded-full object-cover ${activeTab === "profile" ? "ring-2 ring-primary" : "ring-1 ring-neutral-700"}`} /> : "👤"}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${activeTab === "profile" ? "text-primary" : ""}`}>Profil</span>
            {activeTab === "profile" && <span className="absolute bottom-2 w-1 h-1 bg-primary rounded-full" />}
          </button>

          {/* Tab: Pesan (center - highlighted) */}
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-1 py-2 px-6 rounded-xl transition-all duration-200 relative`}
          >
            <span className={`text-3xl block transition-transform duration-200 ${activeTab === "home" ? "scale-110" : ""}`}>✂️</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${activeTab === "home" ? "text-primary" : "text-neutral-500"}`}>Pesan</span>
          </button>

          {/* Tab: Riwayat */}
          <button
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center gap-1 py-2 px-6 rounded-xl transition-all duration-200 ${activeTab === "history" ? "text-primary" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            <span className="text-2xl">📜</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${activeTab === "history" ? "text-primary" : ""}`}>Riwayat</span>
          </button>

        </div>
      </nav>

      {/* ===== EDIT PROFILE MODAL ===== */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">✏️ Edit Profil Saya</h2>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Nama Lengkap</label>
                <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary" required />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-2">Foto Profil</label>
                <div className="flex items-center gap-4">
                  {editData.photoUrl ? (
                    <img src={editData.photoUrl} alt="Preview" className="w-14 h-14 rounded-full object-cover border-2 border-primary/50" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-xl">👤</div>
                  )}
                  <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-sm py-2 px-4 rounded-lg inline-block transition-colors border border-neutral-700">
                    {uploadingPhoto ? '⏳ Mengupload...' : '📷 Pilih Foto dari HP/PC'}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Hobi / Ketertarikan</label>
                <input type="text" value={editData.hobbies} onChange={e => setEditData({...editData, hobbies: e.target.value})}
                  placeholder="Misal: Sepakbola, Modifikasi Motor, Musik"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary" />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Alamat (Home Service)</label>
                <textarea value={editData.address} onChange={e => setEditData({...editData, address: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary min-h-[80px]" />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-neutral-400 hover:text-white transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={savingProfile}
                  className="px-6 py-2 btn-primary text-background font-bold rounded-lg transition-colors disabled:opacity-50">
                  {savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
