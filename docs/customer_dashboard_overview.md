# Analisis Komprehensif Portal Pelanggan (Customer Dashboard)
Aplikasi CukurShip SaaS  
*Lokasi File Utama: `app/dashboard/page.tsx`*

Dokumen ini merangkum seluruh arsitektur, fitur, dan logika yang beroperasi di dalam Halaman Portal Pelanggan (Dashboard) yang bertindak sebagai *Storefront* utama bagi setiap Barbershop (Tenant) di platform CukurShip.

Terakhir diperbarui: **2026-04-12** — diselaraskan dengan kode aktual `app/dashboard/page.tsx`.

---

## 1. Ikhtisar & Peran Utama

Halaman **Dashboard Pelanggan** adalah titik masuk (*entry point*) utama bagi konsumen akhir. Halaman ini dirancang menjadi **aplikasi web mandiri bergaya mobile (Mobile-first Web App)** dengan pengalaman navigasi layaknya aplikasi natif menggunakan *Sticky Bottom Navigation Bar* dengan 4 tombol tab.

Halaman ini mengusung konsep **White-labeling/Multi-tenant**: tampilan, warna, font, dan konten berubah secara drastis menyesuaikan identitas Barbershop (Tenant) yang sedang dikunjungi pelanggan, berdasarkan pengaturan subdomain yang diproses oleh middleware (`proxy.ts`).

---

## 2. Type System & Interface

Semua tipe data yang digunakan didefinisikan secara lokal di dalam file ini:

```typescript
type Tab = "profile" | "home" | "history";

interface Barber {
  id, name, specialty, photo_url
}

interface Service {
  id, name, price, duration_minutes, service_type   // service_type: 'BARBERSHOP' | 'HOME'
}

interface ShopInfo {
  shop_name, shop_tagline, logo_url, hero_image_url,
  color_primary, color_primary_hover, color_secondary,
  color_background, color_surface, color_accent,
  use_gradient,                  // boolean — aktifkan efek gradient pada tombol
  font_choice,                   // 'modern' | 'bold' | 'classic' | 'mono'
  whatsapp_owner,
  operating_open, operating_close,
  is_home_service_enabled,
  slug,
  barbers: Barber[],             // embed dari API, sudah termasuk di /api/store/info
  services: Service[]            // embed dari API, sudah termasuk di /api/store/info
}
```

---

## 3. State Management

Dashboard menggunakan state lokal React (tidak ada Redux/Zustand):

| State | Tipe | Keterangan |
|---|---|---|
| `shop` | `ShopInfo \| null` | Data publik toko dari API |
| `loadingShop` | `boolean` | Loading screen awal |
| `user` | `any` | Data profil pelanggan yang sedang login |
| `stats` | `any` | Statistik member: totalVisits, totalSpent, favoriteBarber, lastVisitAt |
| `history` | `any[]` | Array riwayat booking pelanggan |
| `activeTab` | `Tab` | Tab aktif yang ditampilkan: `"home"` (default), `"profile"`, `"history"` |
| `isEditing` | `boolean` | Kontrol visibilitas Modal Edit Profil |
| `editData` | `object` | Form data edit: `{ name, address, hobbies, photoUrl }` |
| `savingProfile` | `boolean` | Loading state saat simpan form edit profil |
| `uploadingPhoto` | `boolean` | Loading state saat upload foto |
| `loadingStats` | `boolean` | Skeleton loader Tab Statistik Member |

---

## 4. Font Map

Empat pilihan tipografi dikontrol dari pengaturan admin via field `font_choice`:

```typescript
const FONT_MAP = {
  modern:  "'Inter', 'DM Sans', sans-serif",
  bold:    "'Poppins', 'Sora', sans-serif",
  classic: "'Playfair Display', 'Lora', serif",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
}
```

Font dimuat dari Google Fonts melalui `@import` CSS yang di-inject secara inline di dalam tag `<style>` di dalam JSX.

---

## 5. Logika Pengambilan Data (useEffect)

### 5A. Fetch Data Toko & User (useEffect pertama)

Dijalankan sekali saat mount (`[]` dengan `router` sebagai dependency):

1. **`GET /api/store/info`** — Selalu dijalankan, bahkan tanpa login. Response berisi:
   - Semua field `ShopInfo` termasuk array `barbers` dan `services` yang sudah ter-embed.
   - Jika berhasil dan ada `shop_name`, state `shop` diisi.

2. **Cek `localStorage.getItem("user")`** — Jika ada:
   - Langsung set state `user` dari cache (optimistic UI — terasa cepat).
   - Jika `cachedUser.name` kosong/null → **redirect paksa ke `/profile/complete`** (incomplete registration guard).
   - Di background: `GET /api/profile/me` — refresh data profil. Jika 200, update state dan `localStorage`.
   - Sekaligus: `GET /api/profile/history` — dapatkan `{ stats, history }`. Data statistik diisi ke `stats`, array booking ke `history`.

### 5B. Apply Tema Toko ke CSS `:root` (useEffect kedua)

Berjalan setiap kali `shop` berubah. Menyuntikkan **8 CSS Custom Properties** ke `:root` via `document.documentElement.style.setProperty()`:

| CSS Variable | Sumber Data |
|---|---|
| `--color-primary` | `shop.color_primary` (default: `#F59E0B`) |
| `--color-primary-hover` | `shop.color_primary_hover` (default: `#D97706`) |
| `--color-secondary` | `shop.color_secondary` (default: `#D97706`) |
| `--color-background` | `shop.color_background` (default: `#0A0A0A`) |
| `--color-surface` | `shop.color_surface` (default: `#171717`) |
| `--color-accent` | `shop.color_accent` (default: `#FFFFFF`) |
| `--theme-button-bg` | Gradient jika `use_gradient=true`, solid jika `false` |
| `--theme-button-bg-hover` | Gradient hover atau `color_primary_hover` |
| `--font-family` | Dari `FONT_MAP[shop.font_choice]` |

Tambahan efek:
- `document.title` di-set ke nama toko.
- Jika `shop.logo_url` ada, favicon halaman diganti dinamis.
- Cleanup: semua CSS custom property dihapus saat komponen unmount.

---

## 6. Helper Functions

### `toMinutes(hhmm: string | null): number | null`
Mengubah string `"HH:MM"` menjadi total menit sejak tengah malam. Digunakan untuk membandingkan jam operasional.

### `nowWIBMinutes(): number`
Menghitung menit saat ini dalam WIB (UTC+7) menggunakan rumus:
```typescript
const utc = d.getUTCHours() * 60 + d.getUTCMinutes();
return (utc + 7 * 60) % (24 * 60);
```
Tidak bergantung pada timezone browser — selalu WIB.

### `<OpenStatus />` Component
Komponen inline yang menampilkan indikator Buka/Tutup toko:
- Menggunakan `useMemo` agar hanya dikalkulasi saat `open`/`close` berubah.
- Jika buka: badge hijau berkedip (animate-pulse) `"Sedang Buka · HH:MM–HH:MM WIB"`.
- Jika tutup: badge merah `"Sedang Tutup · Buka HH:MM WIB"`.
- Jika `operating_open` atau `operating_close` null: tidak ditampilkan sama sekali.

---

## 7. Event Handlers

| Handler | Dipicu Oleh | Logika |
|---|---|---|
| `handleTabChange(tab)` | Klik tab navigasi | Jika `!user` dan tab bukan `"home"` → redirect ke `/login?redirect=/dashboard`. Jika tidak, set `activeTab`. |
| `handleLogout()` | Klik tombol Keluar | `POST /api/auth/logout`, lalu hapus `localStorage.user`, reset `user=null`, `activeTab="home"`. |
| `handleBookClick(e)` | Klik tombol Booking / Link layanan | Jika `!user` → `e.preventDefault()` + redirect ke `/login?redirect=/book`. |
| `handleEditOpen()` | Klik tombol Edit Profil | Isi `editData` dari data `user` saat ini, set `isEditing=true`. |
| `handlePhotoUpload(e)` | Input file foto | Upload via `FormData` ke `POST /api/profile/upload`. Jika sukses, update `editData.photoUrl`, `user`, `localStorage`. |
| `handleEditSave(e)` | Submit form edit profil | `PUT /api/profile/me` dengan body `editData`. Jika sukses, update `user` dan `localStorage`, tutup modal. |

---

## 8. Struktur Tampilan (JSX)

### A. Loading State
Saat `loadingShop=true` → tampilkan spinner animasi dengan latar `#0A0A0A`. Menunggu `GET /api/store/info` selesai sebelum merender konten apapun.

### B. Dynamic Theming (Inline `<style>`)
Sebelum tag `<main>`, di-inject `<style>` yang berisi:
- `@import` font dari Google Fonts (Inter, Poppins, Playfair Display, JetBrains Mono).
- `:root` custom properties untuk warna.
- CSS `body` menyertakan `font-family` dan warna background.
- Override kelas `.btn-primary` dan `.text-primary` / `.border-primary`.

### C. Top Navigation Bar
Sticky top bar (z-40) dengan backdrop-blur. Berisi:
- Kiri: Logo toko (img atau fallback emoji ✂️) + Nama toko (truncate 160px).
- Kanan: "Masuk / Daftar" (`Link /login`) jika belum login, atau tombol "Keluar" (merah) jika sudah login.

### D. Tab: Beranda (Home) — *Public Access*

Muncul saat `activeTab === "home"`. Tiga sub-section:

**1. Hero Section**
- Radial gradient overlay dari warna `color_primary`.
- Jika `hero_image_url` tersedia: gambar fullscreen dengan opacity 15%, di-overlay gradient gelap ke bawah.
- Logo toko (24x24 rounded-3xl) + nama toko (h1) + tagline + badge `<OpenStatus />`.

**2. Post Feed (`<PostFeed showTitle={true} />`)** 
- Komponen `PostFeed` diimpor dari `@/components/PostFeed`.
- Ditempatkan di bawah Hero, di atas Tim Barber.

**3. Tim Barber (Horizontal Scroll)**
- Hanya muncul jika `shop.barbers.length > 0`.
- Ditampilkan sebagai slider horizontal scrollable.
- Setiap barber adalah `<Link href="/book">` yang memanggil `handleBookClick`.
- Foto barber (rounded-2xl) atau avatar fallback 👤.

**4. Katalog Layanan**
- Dikelompokkan berdasarkan `service_type`: `'BARBERSHOP'` ditampilkan lebih dulu, `'HOME'` setelahnya.
- Nama layanan dibersihkan dari prefix `'HOME | '` dan `'BARBER | '` sebelum ditampilkan.
- Setiap layanan adalah `<Link>` ke `/book?type=...&service={svc.id}`.
- **Fallback (Empty State):** Jika array `services` kosong, tampilkan 2 kartu navigasi pintas statis: "Barbershop" dan "Home Service" (Home Service hanya muncul jika `is_home_service_enabled=true`).

### E. Tab: Profil — *Private Access*

Muncul saat `activeTab === "profile" && user`. Dua kartu utama:

**Kartu Profil Pengguna**
- Foto profil (`user.photoUrl`) atau avatar 👤.
- Nama (`user.name`), nomor HP (`user.phoneNumber`), badge "Member".
- Tampilan field: Alamat dan Hobi (atau teks italic "Belum diisi").
- Tombol "✏️ Edit Profil" → membuka Modal Edit Profil.

**Kartu Statistik Member**
- Judul: "🏆 Statistik Member" + note "Hanya menghitung transaksi yang sudah selesai".
- Saat `loadingStats=true`: skeleton loader 4 kotak animasi pulse.
- 4 metrik dalam grid 2 kolom:
  1. **Total Kunjungan** — `stats.totalVisits`
  2. **Total Bayar** — `stats.totalSpent` (format Rupiah `id-ID`)
  3. **Barber Favorit** — `stats.favoriteBarber` (atau `'—'`)
  4. **Terakhir Hadir** — `stats.lastVisitAt` (format `dd MMM yyyy` atau `'—'`)

### F. Tab: Riwayat — *Private Access*

Muncul saat `activeTab === "history" && user"`.

- Jika `history.length === 0`: tampilkan empty state dengan emoji 💈 + tombol "Buat Pesanan Pertama".
- Setiap booking ditampilkan sebagai kartu:
  - **Upcoming** (waktu > sekarang dan status bukan `cancelled`): background `${primary}10`, border `${primary}30`, badge "Akan Datang".
  - **Past**: background netral.
  - Konten kartu: Nama layanan (`booking.services.name`), harga (`booking.services.price`), nama barber (`booking.barbers.name`), tipe (`home` atau `shop`), waktu (`toLocaleString` dengan `dateStyle:'medium'`, `timeStyle:'short'`).

### G. Sticky Bottom Navigation Bar

Fixed bottom nav (z-50) dengan backdrop-blur `blur(12px)`. Layout: 4 tombol dalam flex justify-around.

| Posisi | Tab | Ikon | Catatan |
|---|---|---|---|
| Kiri | Beranda | 🏠 | `handleTabChange("home")` |
| Tengah-kiri | Booking (FAB) | ✂️ | `<Link href="/book">` dengan `handleBookClick`. FAB menonjol ke atas `-top-4` dari bar, rounded-full dengan shadow primary |
| Tengah-kanan | Riwayat | 📜 | `handleTabChange("history")` |
| Kanan | Profil | Foto user / 👤 | `handleTabChange("profile")`. Avatar mini dalam circle; border primary jika aktif |

Indikator aktif: dot kecil 1x1 dengan warna `primary`, opacity 100% jika aktif, 0% jika tidak.

### H. Modal Edit Profil

Overlay penuh layar (`fixed inset-0 z-[60]`) dengan backdrop `bg-black/80 blur-sm`. Muncul saat `isEditing=true`.

Form berisi 4 field:
1. **Nama Lengkap** — text input (required).
2. **Foto Profil** — preview gambar + tombol "📷 Pilih Foto" sebagai label untuk `<input type="file" accept="image/*">`. Upload firedan-handled oleh `handlePhotoUpload`.
3. **Hobi / Ketertarikan** — text input (opsional).
4. **Alamat (Home Service)** — textarea.

Tombol: "Batal" (reset `isEditing=false`) dan "Simpan Profil" (submit → `handleEditSave`).

---

## 9. Alur API Lengkap

| Endpoint | Method | Kapan Dipanggil | Data Dikembalikan |
|---|---|---|---|
| `/api/store/info` | `GET` | Mount awal, selalu | `ShopInfo` termasuk `barbers[]` dan `services[]` |
| `/api/profile/me` | `GET` | Setelah cek localStorage | Data profil terkini (name, address, hobbies, photoUrl, dll) |
| `/api/profile/history` | `GET` | Setelah cek localStorage | `{ stats: { totalVisits, totalSpent, favoriteBarber, lastVisitAt }, history: Booking[] }` |
| `/api/profile/me` | `PUT` | Submit form edit profil | `{ user: UserProfile }` |
| `/api/profile/upload` | `POST` | Upload foto profil (FormData multipart) | `{ photoUrl: string }` |
| `/api/auth/logout` | `POST` | Klik tombol Keluar | — (hanya menghapus cookie) |

---

## 10. Kondisi & Guard

| Kondisi | Pemicu | Aksi |
|---|---|---|
| **Belum Login** | Tab Profil/Riwayat diklik | Redirect ke `/login?redirect=/dashboard` |
| **Klik Booking Tanpa Login** | Klik tombol ✂️ atau Link layanan | `e.preventDefault()` + redirect ke `/login?redirect=/book` |
| **Profil Tidak Lengkap** | `cachedUser.name` null atau kosong | Redirect paksa ke `/profile/complete` |
| **Empty State Layanan** | `shop.services.length === 0` | Tampilkan 2 kartu navigasi pintas statis |
| **Empty State Riwayat** | `history.length === 0` | Tampilkan placeholder + tombol "Buat Pesanan Pertama" |
| **Logout** | Klik "Keluar" | Hapus cookie (`/api/auth/logout`) + hapus `localStorage.user` + reset state ke tamu |

---

## 11. Kesimpulan Arsitektur

Portal Pelanggan `dashboard/page.tsx` mengusung pola arsitektur **PWA (Progressive Web Application) SPA hibrida**:

- **Multi-tenant theming** real-time via CSS Custom Properties yang disuntikkan dari data API toko.
- **Optimistic UI** dengan cache `localStorage` agar terasa instan, diverifikasi asinkron di background.
- **Single-page navigation** via state `activeTab` tanpa page reload — 4 tab (Beranda, Booking, Riwayat, Profil).
- **Incremental data loading**: shop info dimuat pertama, user stats dimuat paralel hanya jika user sudah login.
- **Tenant isolation** dijamin oleh middleware `proxy.ts` yang menyuntikkan header `x-tenant-id` sebelum request mencapai API.

Seluruh alur bermuara pada satu tujuan akhir: menekan tombol **"✂️ Booking"**.
