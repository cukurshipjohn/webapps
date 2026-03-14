"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", address: "", hobbies: "", photoUrl: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    // Pastikan user sudah login dan punya data lengkap
    const userStr = localStorage.getItem("user");
    if (!userStr || !localStorage.getItem("token")) {
      router.push("/login");
      return;
    }

    const userData = JSON.parse(userStr);
    
    // Jika belum punya nama, arahkan kembali ke isi profil
    if (!userData.name) {
      router.push("/profile/complete");
      return;
    }

    setUser(userData);
    
    // Fetch History Data
    fetch("/api/profile/history", {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
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

    if (!file.type.startsWith('image/')) {
        alert("Pilih file gambar yang valid!");
        return;
    }

    setUploadingPhoto(true);

    try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/profile/upload', {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
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
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: editData.name,
          address: editData.address,
          hobbies: editData.hobbies,
          photoUrl: editData.photoUrl
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Update local storage and state
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      setIsEditing(false);
    } catch (err) {
      alert("Gagal menyimpan profil: " + err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (!user || loading) return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-amber-500 gap-4">
      <div className="w-8 h-8 border-4 border-amber-500/20 border-t-amber-500 inline-block rounded-full animate-spin" />
      <span className="text-sm font-medium tracking-wider animate-pulse">MEMUAT PROFIL...</span>
    </div>
  );

  return (
    <main className="min-h-screen p-6 relative bg-neutral-950 text-white">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-4xl mx-auto space-y-8 relative z-10 pt-10">
        <header className="flex justify-between items-center glass p-6 rounded-2xl">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Halo, <span className="text-amber-500">{user.name}</span>! 👋</h1>
            <p className="text-neutral-400 mt-1">Selamat datang di Dashboard John CukurShip Anda.</p>
          </div>
          <button 
            onClick={handleLogout}
            className="px-6 py-2 bg-neutral-900 hover:bg-red-500/20 text-neutral-300 hover:text-red-400 border border-neutral-800 hover:border-red-500/30 rounded-lg transition-all"
          >
            Keluar
          </button>
        </header>

          {/* Left Column - Booking & Profile Stats */}
          <div className="space-y-6">
            <div className="glass p-8 rounded-2xl border border-neutral-800/50">
              <h2 className="text-xl font-semibold mb-4 text-amber-500 flex items-center gap-2">
                <span>📅</span> Pesan Jadwal Baru
              </h2>
              <p className="text-neutral-400 mb-6 text-sm leading-relaxed">
                Moro Lungguh Mulih Ngguanteng! Jadwalkan potong rambut dengan barber favorit Anda di barbershop atau langsung di rumah Anda.
              </p>
              <Link href="/book" className="inline-block w-full text-center py-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl transition-all shadow-lg hover:shadow-amber-500/20">
                Pesan Layanan Sekarang
              </Link>
            </div>

            <div className="glass p-8 rounded-2xl border border-neutral-800/50 relative overflow-hidden">
               <div className="absolute -right-10 -bottom-10 opacity-5 text-[100px]">✂️</div>
              <h2 className="text-xl font-semibold mb-6 text-amber-500 flex items-center gap-2">
                <span>🏆</span> Statistik Member
              </h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/50">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Total Cukur</p>
                  <p className="text-2xl font-bold text-white">{stats?.totalHaircuts || 0} <span className="text-sm text-neutral-400 font-normal">x</span></p>
                </div>
                <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/50">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Barber Favorit</p>
                  <p className="text-lg font-medium text-amber-400 truncate" title={stats?.favoriteBarber}>{stats?.favoriteBarber || "Belum Ada"}</p>
                </div>
              </div>
            </div>
            
            <div className="glass p-6 rounded-2xl border border-neutral-800/50 relative">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Identitas</h3>
                    <button onClick={handleEditOpen} className="text-xs text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:border-amber-400 px-3 py-1 rounded-full transition-all">
                        Edit Profil
                    </button>
                </div>
                
                <div className="flex items-center gap-4 mb-6">
                    {user.photoUrl ? (
                         <img src={user.photoUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-amber-500/50" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-2xl">
                            👤
                        </div>
                    )}
                    <div>
                        <h4 className="font-bold text-lg">{user.name}</h4>
                        <p className="text-xs text-neutral-400 font-mono">{user.phoneNumber}</p>
                    </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Alamat Default</span>
                      <span className="text-sm text-white line-clamp-2">{user.address || '-'}</span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Hobi / Catatan</span>
                      <span className="text-sm text-emerald-400 line-clamp-2">{user.hobbies || '-'}</span>
                  </div>
                </div>
            </div>
          </div>

          {/* Right Column - Booking History */}
          <div className="glass p-8 rounded-2xl border border-neutral-800/50 h-[calc(100vh-12rem)] min-h-[500px] flex flex-col">
            <h2 className="text-xl font-semibold mb-6 text-amber-500 flex items-center gap-2">
              <span>📜</span> Riwayat Pesanan
            </h2>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-3">
                  <span className="text-4xl">💈</span>
                  <p className="text-sm">Belum ada riwayat pesanan.</p>
                </div>
              ) : (
                history.map((booking, index) => {
                  const date = new Date(booking.start_time);
                  const isUpcoming = date > new Date() && booking.status !== 'cancelled';
                  
                  return (
                    <div key={booking.id || index} className={`p-4 rounded-xl border ${isUpcoming ? 'bg-amber-500/5 border-amber-500/20' : 'bg-neutral-900/30 border-neutral-800/50'}`}>
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <span className="font-semibold text-white">{booking.services?.name || 'Paket Cukur'}</span>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-amber-400 font-bold whitespace-nowrap">${booking.services?.price || '-'}</span>
                          {isUpcoming && <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md whitespace-nowrap">Akan Datang</span>}
                        </div>
                      </div>
                      
                      <div className="text-sm text-neutral-400 space-y-1">
                        <p className="flex justify-between">
                          <span>👤 By {booking.barbers?.name || 'Barber'}</span>
                          <span className="text-xs">{booking.service_type === 'home' ? '🏠 Home' : '💈 Shop'}</span>
                        </p>
                        <p className="flex items-center gap-1 mt-2 text-xs text-neutral-500">
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

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold mb-6">Edit Profil Saya</h2>
            
            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Nama Lengkap</label>
                <input 
                  type="text" 
                  value={editData.name} 
                  onChange={e => setEditData({...editData, name: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-2">Foto Profil</label>
                <div className="flex items-center gap-4">
                  {editData.photoUrl ? (
                    <img src={editData.photoUrl} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-amber-500/50" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-2xl">👤</div>
                  )}
                  <div className="flex-1">
                    <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-sm py-2 px-4 rounded-lg inline-block transition-colors border border-neutral-700">
                      {uploadingPhoto ? 'Mengupload...' : 'Pilih Foto dari HP/PC'}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                        className="hidden" 
                        disabled={uploadingPhoto}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Hobi / Ketertarikan</label>
                <input 
                  type="text" 
                  value={editData.hobbies} 
                  onChange={e => setEditData({...editData, hobbies: e.target.value})}
                  placeholder="Misal: Sepakbola, Modifikasi Motor, Musik"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Alamat Rumah (Home Service)</label>
                <textarea 
                  value={editData.address} 
                  onChange={e => setEditData({...editData, address: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 min-h-[80px]"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={savingProfile}
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg transition-colors disabled:opacity-50"
                >
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
