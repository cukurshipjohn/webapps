"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export default function BookAppointmentPage() {
  const router = useRouter();
  const [barbers, setBarbers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  const [selectedBarber, setSelectedBarber] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [serviceType, setServiceType] = useState("barbershop");
  const [date, setDate] = useState("");

  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [fetchingSlots, setFetchingSlots] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [success, setSuccess] = useState(false);
  // Jam operasional toko — diisi dari /api/store/info agar label slot sesuai pengaturan tenant
  const [storeHours, setStoreHours] = useState<{ open: string; close: string; timezone: string; timezoneLabel: string }>({ open: '10:00', close: '20:00', timezone: 'Asia/Jakarta', timezoneLabel: 'WIB' });

  // Fetch barbers on mount
  useEffect(() => {
    fetch("/api/barbers")
      .then(res => res.json())
      .then(data => setBarbers(Array.isArray(data) ? data : []))
      .catch(() => setFetchError("Tidak dapat memuat data barber."));
  }, []);

  // Fetch shop details for Title & Favicon & operating hours
  useEffect(() => {
    fetch("/api/store/info")
      .then(res => res.json())
      .then(data => {
        if (data.shop_name) document.title = `Booking – ${data.shop_name}`;
        if (data.logo_url) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = data.logo_url;
        }
        // Ambil jam & timezone operasional toko untuk slot
        setStoreHours({
          open:  data.operating_open  ?? '10:00',
          close: data.operating_close ?? '20:00',
          timezone: data.timezone ?? 'Asia/Jakarta',
          timezoneLabel: data.timezone_label ?? 'WIB'
        });
      })
      .catch(() => {});
  }, []);

  // Fetch services ketika serviceType berubah — barbershop & home sama-sama dari DB per tenant
  // Ini memastikan setiap tenant hanya melihat layanan milik mereka sendiri.
  useEffect(() => {
    setSelectedService("");
    setServices([]);
    const typeParam = serviceType === "barbershop" ? "barbershop" : "home";
    fetch(`/api/services?type=${typeParam}`)
      .then(res => res.json())
      .then(data => {
        setServices(Array.isArray(data) ? data : []);
        if (!Array.isArray(data)) setFetchError(data?.message || "Gagal memuat layanan.");
      })
      .catch(() => setFetchError("Tidak dapat memuat layanan."));
  }, [serviceType]);

  // Fetch available slots
  useEffect(() => {
    if (date && selectedBarber && serviceType) {
      setFetchingSlots(true);
      setSelectedSlot("");
      fetch(`/api/bookings/availability?date=${date}&barberId=${selectedBarber}&serviceType=${serviceType}`)
        .then(res => res.json())
        .then(data => setAvailableSlots(Array.isArray(data) ? data : []))
        .catch(() => setAvailableSlots([]))
        .finally(() => setFetchingSlots(false));
    }
  }, [date, selectedBarber, serviceType]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!localStorage.getItem("user")) {
      router.push("/login?redirect=/book");
      return;
    }

    // Validasi: service harus dipilih untuk semua tipe
    if (!selectedService) {
      setError("Pilih layanan terlebih dahulu.");
      return;
    }
    if (!selectedBarber || !selectedSlot) {
      setError("Lengkapi semua pilihan yang diperlukan.");
      return;
    }
    if (serviceType === "home" && !customerAddress.trim()) {
      setError("Alamat wajib diisi untuk Home Service.");
      return;
    }

    // serviceId langsung dari state — sudah benar per tenant sejak fetch awal
    const serviceIdToSend = selectedService;

    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          barberId: selectedBarber,
          serviceId: serviceIdToSend,
          serviceType,
          startTime: selectedSlot,
          customerAddress: serviceType === "home" ? customerAddress : undefined
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem("user");
        router.push("/login?redirect=/book");
        return;
      }

      if (!res.ok) throw new Error(data.message || "Gagal membuat pesanan.");
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hitung harga yang akan ditampilkan — uniform untuk barbershop & home
  const selectedServicePrice = services.find(s => s.id === selectedService)?.price;

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-accent">
        <div className="glass max-w-lg w-full p-10 rounded-3xl text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
          <h2 className="text-3xl font-bold">Booking Terkonfirmasi!</h2>
          <p className="text-neutral-400">Pesanan Anda berhasil dibuat. Konfirmasi sudah dikirim ke WhatsApp Anda.</p>
          {selectedServicePrice && (
            <p className="text-2xl font-bold text-primary">{formatRupiah(selectedServicePrice)}</p>
          )}
          <button onClick={() => router.push("/dashboard")}
            className="inline-block px-8 py-3 btn-primary text-background font-bold rounded-full transition-all">
            Lihat Riwayat Pesanan
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-16 px-4 bg-background text-accent">
      <div className="max-w-2xl mx-auto">

        {/* Back & Title */}
        <div className="mb-8">
          <button onClick={() => router.push("/dashboard")} className="text-primary hover:underline text-sm font-medium mb-4 inline-block">
            ← Kembali ke Dashboard
          </button>
          <h1 className="text-3xl font-bold tracking-tight">Buat <span className="text-primary">Pesanan</span> Baru</h1>
          <p className="text-neutral-400 mt-1 text-sm">Pilih barber, layanan, dan waktu yang sesuai.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}
        {fetchError && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-3 rounded-lg text-sm mb-6">
            ⚠️ {fetchError}
          </div>
        )}

        <form onSubmit={handleBooking} className="space-y-6">
          {/* === STEP 1: Pilih Tipe Layanan === */}
          <div className="glass p-6 rounded-2xl border border-neutral-800/50">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">1. Tipe Layanan</h2>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setServiceType("barbershop")}
                className={`py-4 rounded-xl border text-sm font-semibold transition-all ${serviceType === "barbershop" ? "bg-primary/10 border-primary text-primary" : "bg-neutral-900/50 border-neutral-800 text-neutral-400 hover:border-neutral-700"}`}>
                💈 Di Barbershop
              </button>
              <button type="button" onClick={() => setServiceType("home")}
                className={`py-4 rounded-xl border text-sm font-semibold transition-all ${serviceType === "home" ? "bg-primary/10 border-primary text-primary" : "bg-neutral-900/50 border-neutral-800 text-neutral-400 hover:border-neutral-700"}`}>
                🏠 Home Service
              </button>
            </div>
          </div>

          {/* === STEP 2: Pilih Layanan & Harga === */}
          <div className="glass p-6 rounded-2xl border border-neutral-800/50">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
              2. Pilih Layanan {serviceType === "home" ? "Home Service" : "Barbershop"}
            </h2>

            {/* Info banner untuk home service */}
            {serviceType === "home" && (
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 px-4 py-2 rounded-lg text-xs mb-3">
                💡 Harga paket sudah termasuk biaya perjalanan barber ke rumah Anda.
              </div>
            )}

            {/* Daftar layanan dari DB — berlaku untuk barbershop & home */}
            <div className="space-y-3">
              {services.length === 0 ? (
                <p className="text-neutral-500 text-sm">
                  {serviceType === "home" ? "Memuat layanan home service..." : "Memuat layanan..."}
                </p>
              ) : (
                services.map(s => {
                  const displayName = s.name.replace("BARBER | ", "");
                  const icon = serviceType === "home" ? "🏠" : "✂️";
                  return (
                    <button type="button" key={s.id} onClick={() => setSelectedService(s.id)}
                      className={`w-full flex justify-between items-center p-4 rounded-xl border text-sm font-medium transition-all ${selectedService === s.id ? "bg-primary/10 border-primary text-primary-hover" : "bg-neutral-900/50 border-neutral-800 text-neutral-300 hover:border-primary/40"}`}>
                      <span className="flex items-center gap-3">
                        <span className="text-xl">{icon}</span>
                        <span className="font-semibold">{displayName}</span>
                      </span>
                      <span className="font-bold text-base">{formatRupiah(s.price)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* === STEP 3: Pilih Barber === */}
          <div className="glass p-6 rounded-2xl border border-neutral-800/50">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">3. Pilih Barber</h2>
            <div className="space-y-3">
              {barbers.length === 0 ? (
                <p className="text-neutral-500 text-sm">Memuat barber...</p>
              ) : (
                barbers.map(b => (
                  <button type="button" key={b.id} onClick={() => setSelectedBarber(b.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border text-sm font-medium transition-all ${selectedBarber === b.id ? "bg-primary/10 border-primary text-primary-hover" : "bg-neutral-900/50 border-neutral-800 text-neutral-300 hover:border-primary/40"}`}>
                    {b.photo_url ? (
                      <img src={b.photo_url} alt={b.name} className="w-10 h-10 rounded-full object-cover border border-neutral-700 flex-shrink-0 bg-neutral-800" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-xl flex-shrink-0 border border-neutral-700">💇</div>
                    )}
                    <div className="text-left">
                      <p className="font-semibold">{b.name}</p>
                      {b.specialty && <p className="text-xs text-neutral-500">✨ {b.specialty}</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* === STEP 4: Alamat (hanya untuk Home Service) === */}
          {serviceType === "home" && (
            <div className="glass p-6 rounded-2xl border border-neutral-800/50">
              <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">4. Alamat Tujuan</h2>
              <textarea
                value={customerAddress}
                onChange={e => setCustomerAddress(e.target.value)}
                placeholder="Masukkan alamat lengkap Anda (termasuk nama jalan, nomor rumah, RT/RW, Kelurahan)..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px] text-sm"
                required
              />
            </div>
          )}

          {/* === STEP 5: Pilih Tanggal & Waktu === */}
          <div className="glass p-6 rounded-2xl border border-neutral-800/50">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
              {serviceType === "home" ? "5" : "4"}. Pilih Tanggal & Waktu
            </h2>

            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              required
            />

            {date && selectedBarber && (
              fetchingSlots ? (
                <p className="text-neutral-500 text-sm">🔍 Mengecek ketersediaan slot...</p>
              ) : availableSlots.length > 0 ? (
                <div>
                  <p className="text-xs text-neutral-500 mb-3">Jam kerja: {storeHours.open} – {storeHours.close} {storeHours.timezoneLabel}</p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {availableSlots.map((slot, i) => {
                      const time = new Date(slot).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: storeHours.timezone });
                      return (
                        <button key={i} type="button" onClick={() => setSelectedSlot(slot)}
                          className={`py-2 text-sm rounded-lg border transition-all ${selectedSlot === slot ? "bg-primary text-background border-primary font-bold" : "bg-neutral-900 border-neutral-800 hover:border-primary/50 text-neutral-300 hover:text-primary-hover"}`}>
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-lg border border-red-500/20">
                  Tidak ada slot tersedia untuk tanggal ini. Pilih tanggal atau barber lain.
                </p>
              )
            )}
          </div>

          {/* === RINGKASAN + TOMBOL === */}
          {selectedService && selectedBarber && selectedSlot && (
            <div className="glass p-5 rounded-2xl border border-primary/20 bg-primary/5">
              <h3 className="text-sm font-semibold text-primary mb-3">📋 Ringkasan Pesanan</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Barber</span>
                  <span className="font-medium">{barbers.find(b => b.id === selectedBarber)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Layanan</span>
                  <span className="font-medium">
                    {services.find(s => s.id === selectedService)?.name.replace("BARBER | ", "")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Waktu</span>
                  <span className="font-medium">
                    {new Date(selectedSlot).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: storeHours.timezone })} {storeHours.timezoneLabel}
                  </span>
                </div>
                <div className="flex justify-between border-t border-primary/20 pt-2 mt-2">
                  <span className="font-bold text-white">Total</span>
                  <span className="font-bold text-primary-hover text-lg">
                    {formatRupiah(selectedServicePrice || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tombol Submit & Batal */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => router.push("/dashboard")}
              className="w-full sm:w-auto px-8 py-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-800">
              Batal
            </button>
            <button type="submit" disabled={loading || !selectedSlot || !selectedService}
              className="flex-1 py-4 btn-primary text-background text-base font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Memproses..." : `✂️ Konfirmasi Booking${selectedServicePrice ? " — " + formatRupiah(selectedServicePrice) : ""}`}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
