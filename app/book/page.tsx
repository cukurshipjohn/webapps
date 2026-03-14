"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

    useEffect(() => {
        // Alasan pengecekan Array.isArray(): jika Supabase belum dikonfigurasi
        // atau gagal, API mengembalikan {message: "..."} bukan array.
        // Tanpa pengecekan ini, .map() akan crash dengan "is not a function".
        Promise.all([
            fetch("/api/barbers").then(res => res.json()),
            fetch("/api/services").then(res => res.json())
        ]).then(([bData, sData]) => {
            setBarbers(Array.isArray(bData) ? bData : []);
            setServices(Array.isArray(sData) ? sData : []);
            if (!Array.isArray(bData) || !Array.isArray(sData)) {
                setFetchError(
                    bData?.message || sData?.message ||
                    "Gagal memuat data. Pastikan Supabase sudah dikonfigurasi di .env.local"
                );
            }
        }).catch(err => {
            console.error("Fetch error:", err);
            setFetchError("Tidak dapat terhubung ke server. Coba refresh halaman.");
        });
    }, []);

    useEffect(() => {
        if (date && selectedBarber && serviceType) {
            setFetchingSlots(true);
            setSelectedSlot("");
            fetch(`/api/bookings/availability?date=${date}&barberId=${selectedBarber}&serviceType=${serviceType}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setAvailableSlots(data);
                    } else {
                        setAvailableSlots([]);
                    }
                })
                .catch(() => setAvailableSlots([]))
                .finally(() => setFetchingSlots(false));
        }
    }, [date, selectedBarber, serviceType]);

    const handleBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const token = localStorage.getItem("token");
        if (!token) {
            setError("Please login first before booking.");
            router.push("/login?redirect=/book");
            return;
        }

        if (!selectedBarber || !selectedService || !selectedSlot) {
            setError("Please fill out all required fields.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/bookings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    barberId: selectedBarber,
                    serviceId: selectedService,
                    serviceType: serviceType,
                    startTime: selectedSlot,
                    customerAddress: serviceType === "home" ? customerAddress : undefined
                }),
            });

            const data = await res.json();
            
            if (res.status === 401) {
                // Sesi kadaluarsa atau user terhapus
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                router.push("/login?redirect=/book");
                return;
            }

            if (!res.ok) throw new Error(data.message || "Failed to book appointment");

            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-950 text-white">
                <div className="glass max-w-lg w-full p-10 rounded-3xl text-center space-y-6">
                    <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold">Booking Confirmed!</h2>
                    <p className="text-neutral-400">Your appointment has been successfully scheduled. We have sent a confirmation to your WhatsApp.</p>
                    <Link href="/" className="inline-block px-8 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-full transition-all">
                        Return Home
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen pt-24 pb-12 px-6 bg-neutral-950 text-white">
            <div className="max-w-3xl mx-auto">
                <div className="mb-10 text-center">
                    <Link href="/" className="text-amber-500 hover:underline text-sm font-medium mb-4 inline-block">&larr; Back to Home</Link>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Reserve a <span className="gradient-text">Seat</span></h1>
                    <p className="text-neutral-400 mt-2">Fill in your details below to schedule an appointment.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm text-center mb-8">
                        {error}
                    </div>
                )}

                <div className="glass p-8 rounded-3xl shadow-xl">
                    {/* Tampilkan error jika data awal gagal dimuat */}
                {fetchError && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-3 rounded-lg text-sm mb-6">
                        ⚠️ {fetchError}
                    </div>
                )}

                <form onSubmit={handleBooking} className="space-y-8">
                        {/* Service & Barber Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-neutral-300">Select Service</label>
                                <select
                                    value={selectedService}
                                    onChange={(e) => setSelectedService(e.target.value)}
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    required
                                >
                                    <option value="" disabled>Choose a service</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} - ${s.price}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-neutral-300">Select Barber</label>
                                <select
                                    value={selectedBarber}
                                    onChange={(e) => setSelectedBarber(e.target.value)}
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    required
                                >
                                    <option value="" disabled>Choose your barber</option>
                                    {barbers.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Service Type */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-300">Service Type</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setServiceType("barbershop")}
                                    className={`py-3 rounded-lg border text-sm font-medium transition-all ${serviceType === "barbershop" ? "bg-amber-500/10 border-amber-500 text-amber-500" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"}`}
                                >
                                    At Barbershop
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setServiceType("home")}
                                    className={`py-3 rounded-lg border text-sm font-medium transition-all ${serviceType === "home" ? "bg-amber-500/10 border-amber-500 text-amber-500" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"}`}
                                >
                                    Home Service
                                </button>
                            </div>
                        </div>

                        {/* Address (If Home Service) */}
                        {serviceType === "home" && (
                            <div className="space-y-2 animate-fade-in transition-all">
                                <label className="text-sm font-medium text-neutral-300">Home Address</label>
                                <textarea
                                    value={customerAddress}
                                    onChange={(e) => setCustomerAddress(e.target.value)}
                                    placeholder="Enter your full address"
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[100px]"
                                    required
                                />
                            </div>
                        )}

                        <div className="border-t border-neutral-800 my-8"></div>

                        {/* Date Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-300">Select Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                required
                            />
                        </div>

                        {/* Time Slot Selection */}
                        {date && selectedBarber && (
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-neutral-300">Available Time Slots</label>
                                {fetchingSlots ? (
                                    <div className="text-neutral-500 text-sm py-4">Checking availability...</div>
                                ) : availableSlots.length > 0 ? (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                        {availableSlots.map((slot, i) => {
                                            const dateObj = new Date(slot);
                                            const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => setSelectedSlot(slot)}
                                                    className={`py-2 text-sm rounded-lg border transition-all ${selectedSlot === slot
                                                            ? "bg-amber-500 text-neutral-950 border-amber-500 font-semibold"
                                                            : "bg-neutral-900 border-neutral-800 hover:border-amber-500/50 text-neutral-300 hover:text-amber-500"
                                                        }`}
                                                >
                                                    {timeString}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-red-400 text-sm py-4 bg-red-500/10 px-4 rounded-lg border border-red-500/20">
                                        No slots available for this date. Please select another date or barber.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading || !selectedSlot}
                            className="w-full py-4 mt-8 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-lg font-bold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                        >
                            {loading ? "Processing..." : "Confirm Booking"}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
