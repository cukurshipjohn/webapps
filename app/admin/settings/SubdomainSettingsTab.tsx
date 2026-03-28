"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { canCustomSubdomain } from "@/lib/billing-plans";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id";

interface SubdomainData {
    original_slug: string;
    current_effective_slug: string;
    custom_slug: string | null;
    revisions_remaining: number;
    revision_history: Array<{ old_slug: string; new_slug: string; changed_at: string }>;
    can_customize: boolean;
    plan: string;
    current_url: string;
}

interface SlugCheckState {
    status: "idle" | "checking" | "available" | "unavailable" | "invalid";
    message: string;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric",
    });
}

function getRevisionNote(plan: string, revisionsRemaining: number): { text: string; isWarning: boolean } {
    if (plan === "starter_annual") {
        return {
            text: "⚠️ Setelah disimpan, subdomain tidak bisa diubah lagi",
            isWarning: true,
        };
    }
    if (plan === "pro_annual") {
        return {
            text: `ℹ️ Setelah disimpan, kamu masih punya ${revisionsRemaining} kesempatan mengubah`,
            isWarning: false,
        };
    }
    if (plan === "business_annual") {
        return {
            text: `ℹ️ Setelah disimpan, kamu masih punya ${revisionsRemaining} kesempatan mengubah`,
            isWarning: false,
        };
    }
    return { text: "", isWarning: false };
}

export default function SubdomainSettingsTab() {
    const router = useRouter();
    const [token, setToken] = useState("");
    const [data, setData] = useState<SubdomainData | null>(null);
    const [loading, setLoading] = useState(true);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [slugInput, setSlugInput] = useState("");
    const [slugCheck, setSlugCheck] = useState<SlugCheckState>({ status: "idle", message: "" });
    const [showConfirm, setShowConfirm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const [copied, setCopied] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load token
    useEffect(() => {
        const t = localStorage.getItem("token") || "";
        setToken(t);
    }, []);

    const fetchData = useCallback(async (tok: string) => {
        if (!tok) return;
        try {
            const res = await fetch("/api/admin/subdomain", {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (res.ok) setData(await res.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchData(token);
    }, [token, fetchData]);

    const showToast = (msg: string, type: "success" | "error") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Debounced slug check
    const handleSlugInput = (val: string) => {
        const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
        setSlugInput(clean);
        setSlugCheck({ status: "idle", message: "" });

        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!clean || clean.length < 2) return;

        debounceRef.current = setTimeout(async () => {
            setSlugCheck({ status: "checking", message: "" });
            try {
                const res = await fetch(
                    `/api/admin/subdomain/check?slug=${encodeURIComponent(clean)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const d = await res.json();
                if (d.available) {
                    setSlugCheck({ status: "available", message: `✅ ${clean}.${APP_DOMAIN} tersedia!` });
                } else {
                    setSlugCheck({ status: d.error?.includes("Format" ) || d.error?.includes("karakter") || d.error?.includes("huruf") || d.error?.includes("tanda") || d.error?.includes("tidak tersedia") ? "invalid" : "unavailable", message: d.error || "Tidak tersedia" });
                }
            } catch {
                setSlugCheck({ status: "unavailable", message: "Gagal mengecek ketersediaan" });
            }
        }, 1500);
    };

    const handleSave = async () => {
        if (!slugInput || slugCheck.status !== "available") return;
        setSaving(true);
        setShowConfirm(false);
        try {
            const res = await fetch("/api/admin/subdomain", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ new_slug: slugInput }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);

            showToast(`Subdomain berhasil disimpan! URL baru: ${slugInput}.${APP_DOMAIN}`, "success");
            setSlugInput("");
            setSlugCheck({ status: "idle", message: "" });
            setShowForm(false);

            // Konfetti 🎉
            try {
                const confetti = (await import("canvas-confetti")).default;
                confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors: ["#F59E0B", "#ffffff", "#FCD34D"] });
            } catch (_) {}

            // Refresh data
            await fetchData(token);
        } catch (err: any) {
            showToast(err.message || "Gagal menyimpan", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = (url: string) => {
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const canSave = slugInput.length >= 3 && slugCheck.status === "available" && !saving;

    if (loading) {
        return (
            <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
        );
    }

    // ── Slug check indicator ──────────────────────────────────────────────────
    const SlugIndicator = () => {
        if (!slugInput || slugInput.length < 2) return null;
        if (slugCheck.status === "checking") {
            return (
                <p className="text-xs text-neutral-400 flex items-center gap-1 mt-1">
                    <span className="inline-block w-3 h-3 border border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    Mengecek ketersediaan...
                </p>
            );
        }
        if (slugCheck.status === "available") {
            return <p className="text-xs text-emerald-400 mt-1">{slugCheck.message}</p>;
        }
        if (slugCheck.status === "unavailable") {
            return <p className="text-xs text-red-400 mt-1">❌ {slugCheck.message}</p>;
        }
        if (slugCheck.status === "invalid") {
            return <p className="text-xs text-amber-400 mt-1">⚠️ {slugCheck.message}</p>;
        }
        return null;
    };

    // ── Input form (shared between first-set and change) ─────────────────────
    const SlugForm = ({ isChanging }: { isChanging: boolean }) => {
        const revNote = data ? getRevisionNote(data.plan, data.revisions_remaining) : null;

        return (
            <div className="space-y-4 mt-4">
                {/* Warning jika ganti slug */}
                {isChanging && data?.custom_slug && (
                    <div className="rounded-xl border border-amber-600/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
                        ⚠️ Subdomain lama (<strong>{data.custom_slug}</strong>) akan dinonaktifkan dan tidak bisa dipakai siapapun selama 30 hari. Sisa revisi akan berkurang menjadi <strong>{(data.revisions_remaining - 1)}</strong> kali.
                    </div>
                )}

                {/* Input dengan suffix */}
                <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                        Subdomain baru
                    </label>
                    <div className="flex items-center rounded-xl border border-neutral-700 bg-black/40 overflow-hidden focus-within:border-amber-500 transition-colors">
                        <input
                            type="text"
                            value={slugInput}
                            onChange={(e) => handleSlugInput(e.target.value)}
                            placeholder="namatoko"
                            maxLength={30}
                            className="flex-1 bg-transparent px-4 py-3 text-white placeholder-neutral-600 focus:outline-none font-mono"
                        />
                        <span className="px-3 py-3 text-neutral-500 text-sm border-l border-neutral-700 bg-neutral-900/60 whitespace-nowrap">
                            .{APP_DOMAIN}
                        </span>
                    </div>
                    <SlugIndicator />
                    {slugInput && slugCheck.status === "available" && (
                        <p className="text-xs text-neutral-400 mt-1">
                            Preview URL: <span className="text-amber-300 font-mono">https://{slugInput}.{APP_DOMAIN}</span>
                        </p>
                    )}
                </div>

                {/* Revisi info */}
                {revNote && revNote.text && (
                    <p className={`text-sm ${revNote.isWarning ? "text-amber-400" : "text-neutral-400"}`}>
                        {revNote.text}
                    </p>
                )}

                {/* Warning keras untuk starter_annual */}
                {data?.plan === "starter_annual" && (
                    <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                        ⚠️ <strong>Perhatian:</strong> Paket Starter Tahunan tidak memiliki revisi. Subdomain yang kamu simpan tidak bisa diubah lagi selamanya. Pastikan nama ini sudah benar.
                    </div>
                )}

                {/* Tombol simpan */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowConfirm(true)}
                        disabled={!canSave}
                        className="flex-1 py-3 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        {saving ? "Menyimpan..." : "Simpan Subdomain"}
                    </button>
                    {isChanging && (
                        <button
                            onClick={() => { setShowForm(false); setSlugInput(""); setSlugCheck({ status: "idle", message: "" }); }}
                            className="px-4 py-3 rounded-xl font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-white transition-all"
                        >
                            Batal
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // ── Riwayat Perubahan ─────────────────────────────────────────────────────
    const RevisionHistory = () => {
        if (!data || data.revision_history.length === 0) {
            return <p className="text-xs text-neutral-500 mt-4">Belum ada riwayat perubahan</p>;
        }
        return (
            <div className="mt-5">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Riwayat Perubahan</p>
                <div className="overflow-x-auto rounded-xl border border-neutral-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800 text-left">
                                <th className="px-3 py-2 text-neutral-500 font-medium">Tanggal</th>
                                <th className="px-3 py-2 text-neutral-500 font-medium">Dari</th>
                                <th className="px-3 py-2 text-neutral-500 font-medium">Ke</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.revision_history.map((h, i) => (
                                <tr key={i} className="border-b border-neutral-800/60 last:border-0">
                                    <td className="px-3 py-2 text-neutral-400 whitespace-nowrap">{formatDate(h.changed_at)}</td>
                                    <td className="px-3 py-2 font-mono text-neutral-300">{h.old_slug}</td>
                                    <td className="px-3 py-2 font-mono text-amber-400">{h.new_slug}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ── Determine which condition to render ───────────────────────────────────
    const renderContent = () => {
        if (!data) return null;

        // Kondisi A: Plan bulanan — tidak bisa custom subdomain
        if (!data.can_customize) {
            return (
                <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🔒</span>
                        <h3 className="text-lg font-bold text-white">Custom Subdomain</h3>
                    </div>

                    <div>
                        <p className="text-sm text-neutral-400 mb-2">URL toko kamu saat ini:</p>
                        <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-3">
                            <span className="font-mono text-neutral-300 text-sm">
                                {data.original_slug}.{APP_DOMAIN}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-neutral-700 bg-neutral-900/30 px-4 py-4 space-y-2">
                        <p className="text-sm font-semibold text-white">✨ Manfaat Custom Subdomain</p>
                        <ul className="space-y-1">
                            {["URL profesional yang mudah diingat pelanggan", "Identitas toko yang lebih kuat", "Atur sendiri nama subdomain sesuai brand"].map((b, i) => (
                                <li key={i} className="text-sm text-neutral-400 flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>{b}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <button
                        onClick={() => router.push("/admin/billing?cycle=annual")}
                        className="w-full py-3 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-black transition-all flex items-center justify-center gap-2"
                    >
                        🚀 Upgrade ke Paket Tahunan
                    </button>
                </div>
            );
        }

        // Kondisi B: Tahunan, belum pernah set custom slug
        if (!data.custom_slug) {
            return (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">✨</span>
                        <h3 className="text-lg font-bold text-white">Atur Custom Subdomain</h3>
                    </div>

                    <div>
                        <p className="text-sm text-neutral-400 mb-1">URL saat ini (default):</p>
                        <p className="font-mono text-neutral-400 text-sm">{data.original_slug}.{APP_DOMAIN}</p>
                    </div>

                    <SlugForm isChanging={false} />
                    <RevisionHistory />
                </div>
            );
        }

        // Kondisi C: Custom slug sudah diset, masih ada revisi
        if (data.revisions_remaining > 0) {
            const activeUrl = `https://${data.custom_slug}.${APP_DOMAIN}`;
            return (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-400">
                            ✅ Custom Subdomain Aktif
                        </span>
                        <span className="text-xs text-neutral-400">Sisa revisi: <strong className="text-white">{data.revisions_remaining} kali</strong></span>
                    </div>

                    {/* URL aktif + copy */}
                    <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-3">
                        <span className="flex-1 font-mono text-amber-300 text-sm truncate">{activeUrl}</span>
                        <button onClick={() => handleCopy(activeUrl)} className="text-xs text-neutral-400 hover:text-white transition-colors whitespace-nowrap">
                            {copied ? "✓ Disalin" : "📋 Salin"}
                        </button>
                    </div>

                    {/* Tombol ganti */}
                    {!showForm && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                        >
                            ✏️ Ganti Subdomain
                        </button>
                    )}

                    {showForm && <SlugForm isChanging={true} />}
                    <RevisionHistory />
                </div>
            );
        }

        // Kondisi D: Custom slug diset, revisi habis
        const activeUrl = `https://${data.custom_slug}.${APP_DOMAIN}`;
        return (
            <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-400">
                        ✅ Custom Subdomain Aktif
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-700/50 border border-neutral-600 px-3 py-1 text-xs font-semibold text-neutral-400">
                        🔒 Tidak bisa diubah lagi
                    </span>
                </div>

                {/* URL aktif + copy */}
                <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-3">
                    <span className="flex-1 font-mono text-amber-300 text-sm truncate">{activeUrl}</span>
                    <button onClick={() => handleCopy(activeUrl)} className="text-xs text-neutral-400 hover:text-white transition-colors whitespace-nowrap">
                        {copied ? "✓ Disalin" : "📋 Salin"}
                    </button>
                </div>

                <p className="text-xs text-red-400">Sisa revisi: 0 (habis)</p>

                <button
                    onClick={() => router.push("/admin/billing?cycle=annual")}
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                    Lihat Opsi Upgrade →
                </button>

                <RevisionHistory />
            </div>
        );
    };

    return (
        <div className="animate-in fade-in duration-300">
            {/* Toast */}
            {toast && (
                <div className={`mb-4 rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${
                    toast.type === "success"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}>
                    {toast.type === "success" ? "✅" : "⚠️"} {toast.msg}
                </div>
            )}

            {renderContent()}

            {/* Dialog Konfirmasi */}
            {showConfirm && data && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-white">Konfirmasi Custom Subdomain</h3>

                        <div className="rounded-xl bg-neutral-800/60 px-4 py-3 space-y-1">
                            <p className="text-sm text-neutral-400">URL yang akan aktif:</p>
                            <p className="font-mono text-amber-300 text-sm font-bold">
                                https://{slugInput}.{APP_DOMAIN}
                            </p>
                        </div>

                        {data.plan === "starter_annual" ? (
                            <p className="text-sm text-red-300">⚠️ Ini tidak bisa diubah lagi setelah disimpan.</p>
                        ) : (
                            <p className="text-sm text-neutral-400">
                                Kamu masih punya <strong className="text-white">{data.custom_slug ? data.revisions_remaining - 1 : data.revisions_remaining}</strong> revisi setelah ini.
                            </p>
                        )}

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-white transition-all"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-3 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-60 transition-all"
                            >
                                {saving ? "Menyimpan..." : "✅ Ya, Simpan Sekarang"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
