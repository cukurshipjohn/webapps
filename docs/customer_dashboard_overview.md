# Analisis Komprehensif Portal Pelanggan (Customer Dashboard)
Aplikasi CukurShip SaaS  
*Lokasi File Utama: `app/dashboard/page.tsx`*

Dokumen ini merangkum seluruh arsitektur, fitur, dan logika yang beroperasi di dalam Halaman Portal Pelanggan (Dashboard) yang bertindak sebagai *Storefront* utama bagi setiap Barbershop (Tenant) di platform CukurShip.

Terakhir diperbarui: **2026-04-13** — diselaraskan secara absolut dengan kode aktual `app/dashboard/page.tsx`.

---

## 1. Ikhtisar & Peran Utama

Halaman **Dashboard Pelanggan** adalah titik masuk (*entry point*) utama bagi konsumen akhir. Halaman ini dirancang menjadi **aplikasi web mandiri bergaya mobile (Mobile-first Web App)** dengan pengalaman navigasi layaknya aplikasi natif menggunakan *Sticky Bottom Navigation Bar* dengan 4 tombol tab.

Halaman ini mengusung konsep **White-labeling/Multi-tenant**: tampilan, warna, font, dan konten berubah secara drastis menyesuaikan identitas Barbershop (Tenant) yang sedang dikunjungi pelanggan, berdasarkan pengaturan subdomain yang diproses oleh middleware (`proxy.ts`).

---

## 2. Type System & Interface

Semua tipe data yang digunakan didefinisikan secara lokal di dalam file ini:

```typescript
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
  service_type: string; // 'barbershop' | 'home_service'
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
  timezone?: string;
  timezone_label?: string;
  barbers: Barber[];
  services: Service[];
}

type Tab = "profile" | "home" | "history";
```

---

## 3. State Management

Dashboard menggunakan state lokal React (tanpa Redux/Zustand):

| State | Tipe | Keterangan |
|---|---|---|
| `shop` | `ShopInfo \| null` | Data publik toko dari API |
| `loadingShop` | `boolean` | Loading screen awal |
| `user` | `any` | Data profil pelanggan yang sedang login |
| `stats` | `any` | Statistik member: totalVisits, totalSpent, favoriteBarber, lastVisitAt |
| `history` | `any[]` | Array riwayat booking pelanggan |
| `activeTab` | `Tab` | Tab aktif: `"home"` (default), `"profile"`, `"history"` |
| `isEditing` | `boolean` | Kontrol visibilitas Modal Edit Profil |
| `editData` | `object` | Form data edit: `{ name, address, hobbies, photoUrl }` |
| `savingProfile` | `boolean` | Loading state saat form edit profil disubmit |
| `uploadingPhoto` | `boolean` | Loading state saat upload gambar profil via FormData |
| `loadingStats` | `boolean` | Skeleton loader Tab Statistik Member saat data profiling dimuat |

---

## 4. Font Map

Empat pilihan tipografi dikontrol dari pengaturan admin via field `font_choice`:

```typescript
const FONT_MAP: Record<string, string> = {
  modern: "'Inter', 'DM Sans', sans-serif",
  bold:   "'Poppins', 'Sora', sans-serif",
  classic:"'Playfair Display', 'Lora', serif",
  mono:   "'JetBrains Mono', 'Fira Code', monospace",
};
```

Font dimuat secara dinamis dari Google Fonts melalui `@import` CSS di dalam tag `<style>` JSX.

---

## 5. Logika Pengambilan Data (useEffect)

### 5A. Fetch Data Toko & User (Mount Pertama)

Dijalankan sekali di awal render mengikuti lifecyle React `[]`:

1. **`GET /api/store/info`** — Selalu dijalankan karena data ini bersifat publik (termasuk embed arrays `barbers` dan `services`). Setelah direspon, state `shop` diisi.
2. **Cek cache `localStorage.getItem("user")`**:
   - Langsung set state `user` sebagai *Optimistic UI*.
   - Bila `name` belum ada, di-redirect ke rute on-boarding profil: `/profile/complete`.
   - Melakukan sinkronisasi di *background* memanggil `GET /api/profile/me`.
   - Mengambil histori order dari `GET /api/profile/history` → menyimpan array bookings ke array `history` dan metric stat ke `stats`.

### 5B. Inject Tenant Styles (Style Override Effect)

Sistem merespon *setiap perubahan* state `shop` lalu secara dinamis meng-override variabel CSS dari `<style>` utama.

| CSS Variable | Sumber `shop.*` | Fallback |
|---|---|---|
| `--color-primary` | `color_primary` | `#F59E0B` (Amber) |
| `--color-primary-hover` | `color_primary_hover` | `#D97706` |
| `--color-secondary` | `color_secondary` | `#D97706` |
| `--color-background` | `color_background` | `#0A0A0A` (Dark Background) |
| `--color-surface` | `color_surface` | `#171717` (Dark Surface) |
| `--color-accent` | `color_accent` | `#FFFFFF` |
| `--theme-button-bg` | *Gradient Calculation* | Solid `color_primary` |
| `--theme-button-bg-hover` | *Gradient Calculation* | Solid `color_primary_hover` |

Sistem juga memastikan:
- Mengganti `document.title` sesuai string dari `shop_name`.
- Dinamis mengganti logo di tab browser (`favicon`) lewat script DOM.

---

## 6. Helper Functions

### Waktu dan Status Buka `OpenStatus`
Kalkulasi *real-time* menit dalam sehari secara dinamis menggunakan zona waktu masing-masing tenant. Fungsi absolut kuno `nowWIBMinutes()` telah dipensiunkan penuh dan digantikan oleh `getCurrentTenantMinutes(timezone: string)` yang memperhitungkan letak letak *offset* lintang area (cth: `Asia/Makassar` untuk `UTC+8`).

Komponen `OpenStatus` secara *fluid* sekarang membaca data `timezone` dan `timezoneLabel`. Proses pe-render-an teks tidak akan terjebak `"WIB"` saja lagi, tapi merangkai label spesifik tenant-nya seperti: `Sedang Buka · 09:00 - 21:00 WITA`.

---

## 7. Event Handlers

| Handler | Peran Utama |
|---|---|
| `handleTabChange` | Mengubah state antarmuka `activeTab`. *Guard*: jika bukan `home` dan belum login → Pental ke log-in flow dengan callback query. |
| `handleLogout` | Triggers POST `api/auth/logout`. Membersihkan local storage & reset komponen ke status *home*. |
| `handleBookClick` | Digunakan oleh komponen Anchor `<Link>`. Mencegah event berjalan dan mem-forward ke log-in apabila user object belum di-inisialisasi. |
| `handleEditOpen` | Menyalin payload model dari objek user menuju `editData`. |
| `handlePhotoUpload` | Menangkap file gambar. Jika tipenya image, akan meluncurkan push via FormData ke `api/profile/upload` multipart. |
| `handleEditSave` | Payload PUT `editData` ke endpoint `/api/profile/me`. |

---

## 8. Struktur Tampilan (JSX)

### A. Fallback & Dynamic Tag Injection
Saat payload state `loadingShop=true`, menampilkan skeleton/spinner. Jika berhasil, meng-inject tag kustomisasi inline `<style>` berisi import `GoogleFont` dan map ke root `:root` dan styling `body`.

### B. Navbar Absolut
Sticky navbar di Index. Header `shop_name` plus Image (atau icon `✂️`). 
Memuat Toggle masuk atau log-out di pojok kanan.

### C. Tab Beranda (`home`)
1. **Hero**: Layer dengan `radial-gradient` + `hero_image_url` overlay transparansi 15%.
2. **Post Feed**: Komponen dinamis yang memanggil `<PostFeed showTitle={true} />`.
3. **Pilar Barber**: Scroll list `shop.barbers`.
4. **Pilar Services (Layanan Tipe Bersarang)**: Grouping render `service_type`: Array Filter by `barbershop` dan `home_service`. Mengkonversi prefix label, lalu mencetak *clickable-card* berisi properti `$price` dan duration (Menit). Apabila `services` dari payload backend masih 0/kosong menampilkan Card Fallback `✂️ Barbershop` dan `🏠 Home Service` (jika enabled).

### D. Tab Profil (`profile`)
Memunculkan Form *Info Member* plus **Tombol Edit**. Dilengkapi statistik berdasar load history: `totalVisits`, `totalSpent`, `favoriteBarber`, serta `lastVisitAt` yang diformat dengan struktur `toLocaleDateString`. Saat state edit, memunculkan modal overlay hitam tembus pandang (`bg-black/80 blur-sm`).

### E. Tab History (`history`)
List historikal seluruh traksaksi, *conditional rendering*: Upcoming ditandai badge "Akan Datang". Layout mendefinisikan label waktu, kapster pemproses, nominal fix yang dibayar, serta jenis tempat layanannya (`Home` / `Shop`).

### F. Dock Navigation (Action Bar Mobile Float)
Terdapat *bottom bar blur navigation* merangkum empat modul: `Beranda`, Button Float di luar circle nav untuk `Booking`, lalu ada `Riwayat`, dan `Profil`.

---

## 9. Celah Kesalahan Potensial (*Safeguard*)

- **Belum Login (Guest):** Guest masih bisa mengakses tab Beranda sepenuhnya (Feed, Barber, Shop info), namun menu navigasinya (`/profile`, `/history`) serta action *click trigger Book* tertutup Redirect Logic `handleTabChange`.
- **Tidak ada Service**: Komponen mendeteksi list `services.length === 0` dan merekayasa fallback kartu generik.
- **Data Tidak Komplit**: Apabila login via Auth tapi Nama kosong di localStorage akan dipaksa redirect lewat router hook ke URL Form Update Profile.

## Kesimpulan

Halaman `page.tsx` pada direktori root pelanggan (`app/dashboard/page.tsx`) ini adalah sistem Hibridisasi SPA lengkap (semua route dan navigasi terjadi hanya pada pergerakan State). Sangat modular dan menggunakan teknik optimis untuk menghindari layout shift saat data lokal klien diverifikasi dengan verifikasi API backend. Totalitas kustomisasi White-Label diaplikasikan ke Node CSS tertinggi dan menurun secara otomatis pada antarmuka *Child*-nya.
