"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PostFeed from "@/components/PostFeed";

// ── Font map ──────────────────────────────────────────────
const FONT_MAP: Record<string, string> = {
  modern: "'Inter', 'DM Sans', sans-serif",
  bold:   "'Poppins', 'Sora', sans-serif",
  classic:"'Playfair Display', 'Lora', serif",
  mono:   "'JetBrains Mono', 'Fira Code', monospace",
};

// ── Types ─────────────────────────────────────────────────
interface Barber {
  id: string;
  name: string;
  specialty: string | null;
  photo_url: string | null;
}

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  service_type: string;
}

interface ShopInfo {
  shop_name: string;
  shop_tagline: string;
  logo_url: string | null;
  hero_image_url: string | null;
  color_primary: string;
  color_primary_hover: string;
  color_secondary: string;
  color_background: string;
  color_surface: string;
  color_accent: string;
  use_gradient: boolean;
  font_choice: string;
  whatsapp_owner: string | null;
  operating_open: string | null;
  operating_close: string | null;
  is_home_service_enabled: boolean;
  slug: string | null;
  barbers: Barber[];
  services: Service[];
}

type Tab = "profile" | "home" | "history";

// ── Helpers ───────────────────────────────────────────────
function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function nowWIBMinutes(): number {
  const d = new Date();
  const utc = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utc + 7 * 60) % (24 * 60);
}

function OpenStatus({ open, close }: { open: string | null; close: string | null }) {
  const isOpen = useMemo(() => {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (o === null || c === null) return null;
    const now = nowWIBMinutes();
    return now >= o && now < c;
  }, [open, close]);

  if (!open || !close) return null;

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-sm
      ${isOpen
        ? "bg-green-500/10 border-green-500/30 text-green-400"
        : "bg-red-500/10 border-red-500/30 text-red-400"
      }`}>
      <span className={`w-2 h-2 rounded-full ${isOpen ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
      {isOpen ? `Sedang Buka · ${open}–${close} WIB` : `Sedang Tutup · Buka ${open} WIB`}
    </div>
  );
}

// ── Main Unified Dashboard ────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  
  // Public Store State
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);

  // Private User State
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", address: "", hobbies: "", photoUrl: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // 1. Fetch data
  useEffect(() => {
    // 1A. Fetch shop info (selalu jalan meskipun belum login)
    fetch("/api/store/info")
      .then(r => r.json())
      .then(data => { if (data.shop_name) setShop(data); })
      .catch(() => {})
      .finally(() => setLoadingShop(false));

    // 1B. Fetch user info (jika ada token di localstorage)
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const cachedUser = JSON.parse(userStr);
      setUser(cachedUser);
      
      if (!cachedUser.name) {
        router.push("/profile/complete");
        return;
      }

      // Refresh profil
      fetch("/api/profile/me")
        .then(res => res.json())
        .then(freshUser => {
          if (freshUser && freshUser.id) {
            setUser(freshUser);
            localStorage.setItem("user", JSON.stringify(freshUser));
          }
        })
        .catch(() => {});

      // Refresh history
      fetch("/api/profile/history")
        .then(res => res.json())
        .then(data => {
          if (data.stats) {
            setStats(data.stats);
            setHistory(data.history || []);
          }
        })
        .catch(() => {});
    }
  }, [router]);

  // 2. Apply tenant theme as CSS custom properties on :root
  // This makes ALL child components (PostFeed, nav, forms, etc.) inherit the correct colors.
  useEffect(() => {
    if (!shop) return;
    const root = document.documentElement;
    const primary = shop.color_primary || '#F59E0B';
    const primHov = shop.color_primary_hover || '#D97706';
    const secondary = shop.color_secondary || '#D97706';
    const bg = shop.color_background || '#0A0A0A';
    const surface = shop.color_surface || '#171717';
    const accent = shop.color_accent || '#FFFFFF';
    const useGrad = shop.use_gradient ?? false;

    const btnBg = useGrad
      ? `linear-gradient(to right, ${primary}, ${secondary})`
      : primary;
    const btnBgHover = useGrad
      ? `linear-gradient(to right, ${primHov}, ${secondary})`
      : primHov;

    root.style.setProperty('--color-primary', primary);
    root.style.setProperty('--color-primary-hover', primHov);
    root.style.setProperty('--color-secondary', secondary);
    root.style.setProperty('--color-background', bg);
    root.style.setProperty('--color-surface', surface);
    root.style.setProperty('--color-accent', accent);
    root.style.setProperty('--theme-button-bg', btnBg);
    root.style.setProperty('--theme-button-bg-hover', btnBgHover);
    root.style.setProperty('--font-family', FONT_MAP[shop.font_choice || 'modern'] || FONT_MAP.modern);

    // Set page title to tenant shop name
    document.title = shop.shop_name || 'Barbershop';

    // Set favicon to tenant logo
    if (shop.logo_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = shop.logo_url;
    }

    // Cleanup: reset when component unmounts
    return () => {
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--color-primary-hover');
      root.style.removeProperty('--color-secondary');
      root.style.removeProperty('--color-background');
      root.style.removeProperty('--color-surface');
      root.style.removeProperty('--color-accent');
      root.style.removeProperty('--theme-button-bg');
      root.style.removeProperty('--theme-button-bg-hover');
      root.style.removeProperty('--font-family');
    };
  }, [shop]);

  // 2. Handlers
  const handleTabChange = (tab: Tab) => {
    // Jika belum login dan mencoba akses Profil / History
    if (!user && tab !== "home") {
      router.push("/login?redirect=/dashboard");
      return;
    }
    setActiveTab(tab);
  };

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" })
      .finally(() => {
        localStorage.removeItem("user");
        setUser(null);
        setActiveTab("home");
      });
  };

  const handleBookClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      router.push("/login?redirect=/book");
    }
  };

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

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/profile/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      setEditData(prev => ({ ...prev, photoUrl: data.photoUrl }));
      const updatedUser = { ...user, photoUrl: data.photoUrl };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
    } catch (err: any) {
      alert("Gagal upload: " + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
      setIsEditing(false);
    } catch (err: any) {
      alert("Gagal menyimpan profil: " + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // 3. Loading State (Hanya menunggu shop info)
  if (loadingShop) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
        <div className="space-y-3 text-center">
          <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 text-sm">Memuat halaman…</p>
        </div>
      </div>
    );
  }

  // 4. Dynamic Theming
  const bg       = shop?.color_background  || "#0A0A0A";
  const surface  = shop?.color_surface     || "#171717";
  const primary  = shop?.color_primary     || "#F59E0B";
  const primHov  = shop?.color_primary_hover || "#D97706";
  const secondary= shop?.color_secondary   || "#D97706";
  const accent   = shop?.color_accent      || "#FFFFFF";
  const useGrad  = shop?.use_gradient      ?? false;
  const fontFam  = FONT_MAP[shop?.font_choice || "modern"] || FONT_MAP.modern;

  const heroBg = useGrad
    ? `linear-gradient(135deg, ${bg} 0%, ${surface} 60%, ${bg} 100%)`
    : bg;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Poppins:wght@400;600;700;800&family=Playfair+Display:wght@400;700&family=JetBrains+Mono:wght@400;700&display=swap');
        :root {
          --color-primary: ${primary};
          --color-primary-hover: ${primHov};
          --color-secondary: ${secondary};
          --color-background: ${bg};
          --color-surface: ${surface};
          --color-accent: ${accent};
        }
        body {
          font-family: ${fontFam};
          background: ${bg};
          color: ${accent};
        }
        .btn-primary, [class*='bg-primary'] { background: ${useGrad ? `linear-gradient(to right, ${primary}, ${secondary})` : primary} !important; }
        .text-primary { color: ${primary} !important; }
        .border-primary { border-color: ${primary} !important; }
      `}</style>

      <main className="min-h-screen pb-32 text-white" style={{ background: heroBg, color: accent }}>
        
        {/* ── TOP NAV BAR (Universal) ──────────────────────── */}
        <nav className="sticky top-0 z-40 flex items-center justify-between px-5 py-3 border-b backdrop-blur-xl"
          style={{ background: `${bg}e0`, borderColor: `${surface}80` }}>
          <div className="flex items-center gap-2.5">
            {shop?.logo_url ? (
              <img src={shop.logo_url} alt="logo" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                style={{ background: `${primary}20`, color: primary }}>✂️</div>
            )}
            <span className="font-bold text-sm truncate max-w-[160px]" style={{ color: accent }}>
              {shop?.shop_name || "Barbershop"}
            </span>
          </div>
          {!user ? (
            <Link href="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
              style={{ borderColor: `${primary}50`, color: primary, background: `${primary}10` }}>
              Masuk / Daftar
            </Link>
          ) : (
            <button onClick={handleLogout}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all focus:outline-none"
              style={{ borderColor: `#ef444450`, color: '#ef4444', background: `#ef444410` }}>
              Keluar
            </button>
          )}
        </nav>

        {/* =========================================================
            TAB: HOME (Store Page View)
            ========================================================= */}
        {activeTab === "home" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
            {/* HERO */}
            <section className="relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${primary}25 0%, transparent 65%)` }} />
              {shop?.hero_image_url && (
                <div className="absolute inset-0 z-0">
                  <img src={shop.hero_image_url} alt="Hero" className="w-full h-full object-cover opacity-15" />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${bg}60, ${bg}cc, ${bg})` }} />
                </div>
              )}
              <div className="relative z-10 max-w-lg mx-auto px-5 pt-12 pb-8 text-center space-y-5">
                <div className="relative inline-flex">
                  {shop?.logo_url ? (
                    <img src={shop.logo_url} alt="Logo" className="w-24 h-24 rounded-3xl object-cover border-2 shadow-2xl" style={{ borderColor: `${primary}40` }} />
                  ) : (
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl border shadow-2xl" style={{ background: `${primary}18`, borderColor: `${primary}30` }}>✂️</div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 flex items-center justify-center" style={{ borderColor: bg }}><span className="text-[9px]">✓</span></span>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight" style={{ color: accent }}>{shop?.shop_name || "Barbershop"}</h1>
                  <p className="mt-2 text-sm sm:text-base leading-relaxed" style={{ color: `${accent}90` }}>{shop?.shop_tagline || "Tampil Kece, Harga Terjangkau"}</p>
                </div>
                <OpenStatus open={shop?.operating_open ?? null} close={shop?.operating_close ?? null} />
              </div>
            </section>

            {/* POST FEED */}
            <section className="max-w-lg mx-auto px-5 pb-6">
              <div className="border-t pt-6" style={{ borderColor: `${surface}80` }}>
                <PostFeed showTitle={true} />
              </div>
            </section>

            {/* BARBERS */}
            {shop?.barbers && shop.barbers.length > 0 && (
              <section className="max-w-lg mx-auto px-5 pb-6">
                <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: `${accent}50` }}>Tim Barber</p>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                  {shop.barbers.map(barber => (
                    <Link key={barber.id} href="/book" onClick={handleBookClick} className="flex-shrink-0 w-24 text-center space-y-2 group active:scale-95 transition-all">
                      <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden border-2" style={{ borderColor: `${primary}30`, background: surface }}>
                        {barber.photo_url ? <img src={barber.photo_url} alt={barber.name} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" /> : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: `${primary}10` }}>👤</div>}
                      </div>
                      <p className="text-xs font-semibold leading-tight truncate" style={{ color: accent }}>{barber.name}</p>
                      {barber.specialty && <p className="text-[10px] leading-tight truncate" style={{ color: `${accent}50` }}>{barber.specialty}</p>}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* SERVICES */}
            <section className="max-w-lg mx-auto px-5 pb-6">
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-3" style={{ color: `${accent}50` }}>Layanan Kami</p>
              {shop?.services && shop.services.length > 0 ? (
                <div className="space-y-2">
                  {/* Group by type: BARBERSHOP first, HOME second */}
                  {['BARBERSHOP', 'HOME'].map(type => {
                    const typeServices = shop.services.filter(s => s.service_type === type);
                    if (typeServices.length === 0) return null;
                    const typeEmoji = type === 'HOME' ? '🏠' : '✂️';
                    const typeLabel = type === 'HOME' ? 'Home Service' : 'Di Barbershop';
                    return (
                      <div key={type}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: `${accent}40` }}>
                          {typeEmoji} {typeLabel}
                        </p>
                        <div className="space-y-1.5">
                          {typeServices.map(svc => {
                            const cleanName = svc.name.replace('HOME | ', '').replace('BARBER | ', '');
                            const bookHref = `/book?type=${type === 'HOME' ? 'home' : 'barbershop'}&service=${svc.id}`;
                            return (
                              <Link key={svc.id} href={bookHref} onClick={handleBookClick}
                                className="flex items-center justify-between p-3 rounded-xl border transition-all active:scale-95"
                                style={{ background: surface, borderColor: `${primary}20` }}>
                                <div>
                                  <p className="font-semibold text-sm leading-tight" style={{ color: accent }}>{cleanName}</p>
                                  <p className="text-[11px] mt-0.5" style={{ color: `${accent}50` }}>⏱ {svc.duration_minutes} menit</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-sm" style={{ color: primary }}>
                                    Rp {svc.price.toLocaleString('id-ID')}
                                  </p>
                                  <p className="text-[10px]" style={{ color: `${accent}40` }}>Pesan →</p>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback if no services in DB yet */
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/book?type=barbershop" onClick={handleBookClick} className="group p-4 rounded-2xl border flex items-center gap-3 transition-all active:scale-95" style={{ background: surface, borderColor: `${primary}25` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${primary}15` }}>✂️</div>
                    <div>
                      <p className="font-bold text-sm" style={{ color: accent }}>Barbershop</p>
                      <p className="text-xs mt-0.5" style={{ color: `${accent}60` }}>Potong di tempat →</p>
                    </div>
                  </Link>
                  {shop?.is_home_service_enabled && (
                    <Link href="/book?type=home" onClick={handleBookClick} className="group p-4 rounded-2xl border flex items-center gap-3 transition-all active:scale-95" style={{ background: surface, borderColor: `${secondary}25` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${secondary}15` }}>🏠</div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: accent }}>Home Service</p>
                        <p className="text-xs mt-0.5" style={{ color: `${accent}60` }}>Panggil ke rumah →</p>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* =========================================================
            TAB: PROFIL (Hanya terlihat jika login)
            ========================================================= */}
        {activeTab === "profile" && user && (
          <div className="max-w-lg mx-auto px-5 py-6 space-y-4 animate-in fade-in duration-300">
            {/* Profile Card */}
            <div className="p-6 rounded-2xl border shadow-lg" style={{ background: surface, borderColor: `${surface}80` }}>
              <div className="flex justify-between items-start mb-5">
                <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: primary }}>👤 Profil Saya</h2>
                <button onClick={handleEditOpen} className="text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5"
                  style={{ color: primary, borderColor: `${primary}30` }}>
                  ✏️ Edit Profil
                </button>
              </div>
              <div className="flex items-center gap-4 mb-5">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 shadow-lg" style={{ borderColor: `${primary}50` }} />
                ) : (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl border-2" style={{ background: `${bg}`, borderColor: `${surface}80` }}>👤</div>
                )}
                <div>
                  <h3 className="font-bold text-xl">{user.name}</h3>
                  <p className="text-xs font-mono mt-1" style={{ color: `${accent}70` }}>📱 {user.phoneNumber}</p>
                  <span className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: primary, background: `${primary}10`, borderColor: `${primary}20` }}>Member</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 rounded-xl border" style={{ background: bg, borderColor: `${surface}80` }}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${accent}50` }}>📍 Alamat</p>
                  <p className="text-sm">{user.address || <span className="italic" style={{ color: `${accent}40` }}>Belum diisi</span>}</p>
                </div>
                <div className="p-3 rounded-xl border" style={{ background: bg, borderColor: `${surface}80` }}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${accent}50` }}>🎯 Hobi</p>
                  <p className="text-sm">{user.hobbies || <span className="italic" style={{ color: `${accent}40` }}>Belum diisi</span>}</p>
                </div>
              </div>
            </div>

            {/* Stats Card */}
            <div className="p-6 rounded-2xl border shadow-lg" style={{ background: surface, borderColor: `${surface}80` }}>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: primary }}>🏆 Statistik Member</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border text-center" style={{ background: bg, borderColor: `${surface}80` }}>
                  <p className="text-3xl font-bold">{stats?.totalHaircuts || 0}</p>
                  <p className="text-xs uppercase tracking-wider font-semibold mt-1" style={{ color: `${accent}50` }}>Total Cukur</p>
                </div>
                <div className="p-4 rounded-xl border text-center" style={{ background: bg, borderColor: `${surface}80` }}>
                  <p className="text-base font-bold truncate" style={{ color: primary }}>{stats?.favoriteBarber || "—"}</p>
                  <p className="text-xs uppercase tracking-wider font-semibold mt-1" style={{ color: `${accent}50` }}>Barber Favorit</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB: HISTORY (Hanya terlihat jika login)
            ========================================================= */}
        {activeTab === "history" && user && (
          <div className="max-w-lg mx-auto px-5 py-6 animate-in fade-in duration-300">
            <div className="p-6 rounded-2xl border shadow-lg" style={{ background: surface, borderColor: `${surface}80` }}>
              <h2 className="text-xl font-semibold mb-5 flex items-center gap-2" style={{ color: primary }}>📜 Riwayat Pesanan</h2>
              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center space-y-3" style={{ color: `${accent}50` }}>
                    <span className="text-5xl">💈</span>
                    <p className="text-sm">Belum ada riwayat pesanan.</p>
                    <Link href="/book" className="mt-2 text-sm px-4 py-2 rounded-lg border transition-all" style={{ color: primary, borderColor: `${primary}30` }}>
                      Buat Pesanan Pertama
                    </Link>
                  </div>
                ) : (
                  history.map((booking, index) => {
                    const date = new Date(booking.start_time);
                    const isUpcoming = date > new Date() && booking.status !== 'cancelled';
                    return (
                      <div key={booking.id || index} className="p-4 rounded-xl border" style={{ background: isUpcoming ? `${primary}10` : bg, borderColor: isUpcoming ? `${primary}30` : `${surface}80` }}>
                        <div className="flex justify-between items-start mb-2 gap-4">
                          <span className="font-semibold">{booking.services?.name || 'Paket Cukur'}</span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-bold whitespace-nowrap" style={{ color: primary }}>${booking.services?.price || '-'}</span>
                            {isUpcoming && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ color: primary, background: `${primary}20` }}>Akan Datang</span>}
                          </div>
                        </div>
                        <div className="text-sm space-y-1" style={{ color: `${accent}70` }}>
                          <p className="flex justify-between">
                            <span>👤 By {booking.barbers?.name || 'Barber'}</span>
                            <span className="text-xs w-[60px] text-right">{booking.service_type === 'home' ? '🏠 Home' : '💈 Shop'}</span>
                          </p>
                          <p className="flex items-center gap-1 mt-1 text-xs" style={{ color: `${accent}50` }}>
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

      </main>

      {/* ── STICKY BOTTOM NAVIGATION BAR ────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t px-4 py-2 pb-safe shadow-2xl"
        style={{ background: `${bg}F2`, backdropFilter: "blur(12px)", borderColor: `${surface}90` }}>
        <div className="max-w-lg mx-auto flex justify-around items-end">
          
          {/* Tab: Home */}
          <button onClick={() => handleTabChange("home")} className="flex flex-col items-center justify-end h-14 w-16 transition-all group">
            <div className="h-8 w-8 flex items-center justify-center mb-1">
              <span className={`text-2xl transition-transform ${activeTab === "home" ? "scale-110 grayscale-0" : "grayscale saturate-0 opacity-60 group-hover:opacity-100"}`}>🏠</span>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider transition-colors" style={{ color: activeTab === "home" ? primary : `${accent}60` }}>Beranda</span>
            <div className={`h-1 w-1 rounded-full bg-current transition-all mt-0.5 ${activeTab === "home" ? "opacity-100" : "opacity-0"}`} style={{ color: primary }} />
          </button>

          {/* Floating Action / Tab: Booking */}
          <Link href="/book" onClick={handleBookClick} className="relative flex flex-col items-center justify-end h-14 w-16 transition-all active:scale-95 group">
            <div className="absolute -top-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 z-10"
              style={{ background: primary, color: "#000", borderColor: bg, boxShadow: `0 8px 20px ${primary}40` }}>
              <span className="text-2xl group-hover:scale-110 transition-transform">✂️</span>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: primary }}>Booking</span>
            <div className="h-1 w-1 rounded-full opacity-0 mt-0.5" />
          </Link>

          {/* Tab: Riwayat */}
          <button onClick={() => handleTabChange("history")} className="flex flex-col items-center justify-end h-14 w-16 transition-all group">
            <div className="h-8 w-8 flex items-center justify-center mb-1">
              <span className={`text-2xl transition-transform ${activeTab === "history" ? "scale-110 grayscale-0" : "grayscale saturate-0 opacity-60 group-hover:opacity-100"}`}>📜</span>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider transition-colors" style={{ color: activeTab === "history" ? primary : `${accent}60` }}>Riwayat</span>
            <div className={`h-1 w-1 rounded-full bg-current transition-all mt-0.5 ${activeTab === "history" ? "opacity-100" : "opacity-0"}`} style={{ color: primary }} />
          </button>

          {/* Tab: Profil */}
          <button onClick={() => handleTabChange("profile")} className="flex flex-col items-center justify-end h-14 w-16 transition-all group">
            <div className="h-8 w-8 flex items-center justify-center mb-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 transition-transform ${activeTab === "profile" ? "scale-110" : "opacity-70 group-hover:opacity-100"}`}
                style={{ borderColor: activeTab === "profile" ? primary : "transparent", background: user ? "transparent" : `${accent}20` }}>
                {user?.photoUrl ? <img src={user.photoUrl} alt="P" className="w-full h-full rounded-full object-cover" /> : "👤"}
              </div>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider transition-colors" style={{ color: activeTab === "profile" ? primary : `${accent}60` }}>Profil</span>
            <div className={`h-1 w-1 rounded-full bg-current transition-all mt-0.5 ${activeTab === "profile" ? "opacity-100" : "opacity-0"}`} style={{ color: primary }} />
          </button>

        </div>
      </nav>

      {/* ── EDIT PROFILE MODAL ──────────────────────────────── */}
      {isEditing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl border" style={{ background: surface, borderColor: `${surface}80` }}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">✏️ Edit Profil Saya</h2>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: `${accent}70` }}>Nama Lengkap</label>
                <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})}
                  className="w-full rounded-xl px-4 py-3 border focus:outline-none transition-colors"
                  style={{ background: bg, color: accent, borderColor: `${surface}80`, outlineColor: primary }} required />
              </div>
              <div>
                <label className="block text-xs mb-2" style={{ color: `${accent}70` }}>Foto Profil</label>
                <div className="flex items-center gap-4">
                  {editData.photoUrl ? (
                    <img src={editData.photoUrl} alt="Preview" className="w-14 h-14 rounded-full object-cover border-2" style={{ borderColor: `${primary}50` }} />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl" style={{ background: bg }}>👤</div>
                  )}
                  <label className="cursor-pointer text-sm py-2 px-4 rounded-xl border transition-all"
                    style={{ background: bg, borderColor: `${surface}80` }}>
                    {uploadingPhoto ? '⏳ Mengupload...' : '📷 Pilih Foto'}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: `${accent}70` }}>Hobi / Ketertarikan</label>
                <input type="text" value={editData.hobbies} onChange={e => setEditData({...editData, hobbies: e.target.value})}
                  placeholder="Opsional: Sepakbola, Musik" className="w-full rounded-xl px-4 py-3 border focus:outline-none transition-colors"
                  style={{ background: bg, color: accent, borderColor: `${surface}80`, outlineColor: primary }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: `${accent}70` }}>Alamat (Home Service)</label>
                <textarea value={editData.address} onChange={e => setEditData({...editData, address: e.target.value})}
                  className="w-full rounded-xl px-4 py-3 border focus:outline-none min-h-[80px] transition-colors"
                  style={{ background: bg, color: accent, borderColor: `${surface}80`, outlineColor: primary }} />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setIsEditing(false)} className="px-5 py-2.5 rounded-xl font-medium" style={{ color: `${accent}70` }}>Batal</button>
                <button type="submit" disabled={savingProfile} className="px-6 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 text-black shadow-lg"
                  style={{ background: primary, boxShadow: `0 4px 15px ${primary}40` }}>
                  {savingProfile ? 'Meyimpan...' : 'Simpan Profil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
