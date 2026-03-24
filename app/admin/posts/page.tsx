"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ────────────────────────────────────────────────
type PostType = "promo" | "info" | "status" | "event";
type FilterTab = "all" | PostType;

interface Post {
  id: string;
  type: PostType;
  title: string;
  body: string;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  promo_code: string | null;
  promo_discount_percent: number | null;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  notification_sent_count: number; // dari notification_logs
}

interface PostFormData {
  type: PostType;
  title: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  promo_code: string;
  promo_discount_percent: string;
  is_pinned: boolean;
  is_published: boolean;
  expires_at: string;
}

// ── Constants ────────────────────────────────────────────
const TYPE_META: Record<PostType, { label: string; color: string; badge: string; icon: string }> = {
  promo:  { label: "Promo",  color: "amber",  badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",   icon: "🏷️" },
  info:   { label: "Info",   color: "blue",   badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",      icon: "ℹ️" },
  status: { label: "Status", color: "green",  badge: "bg-green-500/20 text-green-400 border-green-500/30",   icon: "🟢" },
  event:  { label: "Event",  color: "purple", badge: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: "🎉" },
};

const EMPTY_FORM: PostFormData = {
  type: "info", title: "", body: "", image_url: "", cta_label: "Pesan Sekarang",
  cta_url: "/book", promo_code: "", promo_discount_percent: "",
  is_pinned: false, is_published: true, expires_at: "",
};

// ── Helpers ──────────────────────────────────────────────
function isExpired(expires_at: string | null): boolean {
  if (!expires_at) return false;
  return new Date(expires_at) < new Date();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ── Main Page ────────────────────────────────────────────
export default function AdminPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [showDraft, setShowDraft] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [form, setForm] = useState<PostFormData>(EMPTY_FORM);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [planKey, setPlanKey] = useState<string>("starter");
  // blast state: { postId, step: 'preview'|'confirm'|'sending'|'done', preview? }
  const [blastState, setBlastState] = useState<{
    postId: string; step: string;
    preview?: { total_target: number; already_sent: number };
    result?: { total_sent: number; total_failed: number; total_target: number; message?: string; background?: boolean };
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("type", activeTab);
      const res = await fetch(`/api/admin/posts?${params}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      // API returns { posts, plan_key }
      setPosts(data.posts || data || []);
      if (data.plan_key) setPlanKey(data.plan_key);
    } catch {
      showToast("Gagal memuat posts.", "error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, router]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ── Modal logic ────────────────────────────────────────
  const openCreate = () => {
    setEditingPost(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (post: Post) => {
    setEditingPost(post);
    setForm({
      type: post.type, title: post.title, body: post.body,
      image_url: post.image_url || "", cta_label: post.cta_label || "Pesan Sekarang",
      cta_url: post.cta_url || "/book", promo_code: post.promo_code || "",
      promo_discount_percent: post.promo_discount_percent?.toString() || "",
      is_pinned: post.is_pinned, is_published: post.is_published,
      expires_at: post.expires_at ? post.expires_at.slice(0, 16) : "",
    });
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingPost(null); };

  // ── Image upload ───────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/posts/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setForm(f => ({ ...f, image_url: data.url }));
      showToast("Gambar berhasil diunggah!");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setUploadingImg(false);
    }
  };

  // ── Submit form ────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { showToast("Judul wajib diisi.", "error"); return; }
    if (!form.body.trim())  { showToast("Isi conten wajib diisi.", "error"); return; }
    if (form.cta_url && !form.cta_url.startsWith("/") && !form.cta_url.startsWith("http")) {
      showToast("URL CTA harus dimulai dengan '/' atau 'http'.", "error"); return;
    }

    setSubmitting(true);
    const payload = {
      ...(editingPost ? { id: editingPost.id } : {}),
      type: form.type, title: form.title.trim(), body: form.body.trim(),
      image_url: form.image_url || null,
      cta_label: form.cta_label || null, cta_url: form.cta_url || null,
      promo_code: form.type === "promo" ? (form.promo_code || null) : null,
      promo_discount_percent: form.type === "promo" && form.promo_discount_percent
        ? parseInt(form.promo_discount_percent) : null,
      is_pinned: form.is_pinned, is_published: form.is_published,
      expires_at: form.expires_at || null,
    };

    try {
      const res = await fetch("/api/admin/posts", {
        method: editingPost ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(form.is_published ? "Post berhasil dipublish!" : "Post disimpan sebagai draft.");
      closeModal();
      fetchPosts();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Action handlers ────────────────────────────────────
  const handleTogglePin = async (id: string) => {
    await fetch(`/api/admin/posts/${id}/toggle-pin`, { method: "PATCH" });
    fetchPosts();
  };

  const handleTogglePublish = async (id: string) => {
    await fetch(`/api/admin/posts/${id}/toggle-publish`, { method: "PATCH" });
    fetchPosts();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Hapus post "${title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    await fetch("/api/admin/posts", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    showToast("Post berhasil dihapus.");
    fetchPosts();
  };

  // ── Blast WA ───────────────────────────────────────────
  const handleBlastPreview = async (postId: string) => {
    setBlastState({ postId, step: "loading" });
    try {
      const res = await fetch(`/api/admin/posts/${postId}/blast?preview=true`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade_required) {
          showToast(`Fitur Blast WA hanya untuk paket Pro/Business. Upgrade diperlukan.`, "error");
          setBlastState(null);
          return;
        }
        throw new Error(data.message);
      }
      setBlastState({ postId, step: "confirm", preview: data });
    } catch (err: any) {
      showToast(err.message, "error");
      setBlastState(null);
    }
  };

  const handleBlastSend = async () => {
    if (!blastState) return;
    setBlastState(prev => prev ? { ...prev, step: "sending" } : null);
    try {
      const res = await fetch(`/api/admin/posts/${blastState.postId}/blast`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setBlastState(prev => prev ? { ...prev, step: "done", result: data } : null);
      showToast(data.message || `Blast selesai!`);
      fetchPosts(); // refresh notification count
    } catch (err: any) {
      showToast(err.message, "error");
      setBlastState(null);
    }
  };

  // ── Filter posts ───────────────────────────────────────
  const filteredPosts = posts.filter(p => {
    if (!showDraft && !p.is_published) return false;
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",    label: "Semua" },
    { key: "promo",  label: "🏷️ Promo" },
    { key: "info",   label: "ℹ️ Info" },
    { key: "status", label: "🟢 Status" },
    { key: "event",  label: "🎉 Event" },
  ];

  // ── Render ─────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-accent)] pb-24">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-3 rounded-xl border text-sm shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-top-4
          ${toast.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          <span>{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* HEADER */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-neutral-400 text-sm font-mono uppercase tracking-widest mb-1">Admin Panel</p>
            <h1 className="text-3xl font-bold">Post & Promo</h1>
            <p className="text-neutral-400 text-sm mt-1">Kelola konten, promo, dan pengumuman toko Anda.</p>
          </div>
          <button onClick={openCreate}
            className="px-5 py-3 btn-primary text-background font-bold rounded-xl transition-all shadow-lg whitespace-nowrap">
            ✏️ Buat Post Baru
          </button>
        </header>

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex gap-1 p-1 bg-neutral-900/50 rounded-2xl border border-neutral-800 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all whitespace-nowrap
                  ${activeTab === t.key ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm" : "text-neutral-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer ml-auto">
            <span className="text-sm text-neutral-400">Tampilkan Draft</span>
            <div className="relative">
              <input type="checkbox" className="sr-only peer" checked={showDraft} onChange={e => setShowDraft(e.target.checked)} />
              <div className="w-9 h-5 bg-neutral-700 rounded-full peer peer-checked:bg-[var(--color-primary)] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </div>
          </label>
        </div>

        {/* POST LIST */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-neutral-800 rounded-3xl">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-neutral-400">Belum ada post. Klik "Buat Post Baru" untuk memulai.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map(post => {
              const meta = TYPE_META[post.type];
              const expired = isExpired(post.expires_at);
              return (
                <div key={post.id} className={`glass p-5 rounded-2xl border transition-all
                  ${post.is_pinned ? "border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/20" : "border-neutral-800/60 hover:border-neutral-700"}`}>
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    {post.image_url && (
                      <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-neutral-900">
                        <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${meta.badge}`}>
                          {meta.icon} {meta.label}
                        </span>
                        {post.is_pinned && (
                          <span className="px-2 py-0.5 text-xs font-bold rounded-full border bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30">
                            📌 PIN
                          </span>
                        )}
                        {!post.is_published && (
                          <span className="px-2 py-0.5 text-xs font-bold rounded-full border bg-neutral-800 text-neutral-400 border-neutral-700">
                            DRAFT
                          </span>
                        )}
                        {expired && (
                          <span className="px-2 py-0.5 text-xs font-bold rounded-full border bg-red-500/15 text-red-400 border-red-500/30">
                            ⚠️ KADALUARSA
                          </span>
                        )}
                      </div>

                      {/* Title & Body */}
                      <h3 className="font-bold text-white mb-1 truncate">{post.title}</h3>
                      <p className="text-neutral-400 text-sm leading-relaxed line-clamp-2">
                        {post.body.slice(0, 120)}{post.body.length > 120 ? "..." : ""}
                      </p>

                      {/* Footer meta */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-neutral-500">
                        <span>📅 {fmtDate(post.published_at)}</span>
                        {post.expires_at && (
                          <span className={expired ? "text-red-400" : ""}>
                            ⏰ Kadaluarsa: {fmtDate(post.expires_at)}
                          </span>
                        )}
                        {post.promo_code && (
                          <span className="text-amber-400">🏷️ {post.promo_code} {post.promo_discount_percent ? `(-${post.promo_discount_percent}%)` : ""}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <button onClick={() => openEdit(post)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition-colors">
                        ✏️ Edit
                      </button>
                      <button onClick={() => handleTogglePin(post.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                          ${post.is_pinned ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}>
                        {post.is_pinned ? "📌 Unpin" : "📌 Pin"}
                      </button>
                      <button onClick={() => handleTogglePublish(post.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                          ${post.is_published ? "bg-neutral-800 hover:bg-red-500/20 text-neutral-300 hover:text-red-400" : "bg-green-500/20 hover:bg-green-500/30 text-green-400"}`}>
                        {post.is_published ? "⬇ Draft" : "🚀 Publish"}
                      </button>
                      {/* Blast WA — hanya untuk published post & plan pro/business */}
                      {post.is_published && (
                        <button
                          onClick={() => planKey === 'starter'
                            ? showToast('Fitur Blast WA hanya untuk paket Pro & Business.', 'error')
                            : handleBlastPreview(post.id)}
                          disabled={blastState?.postId === post.id && blastState.step === 'loading'}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                            ${planKey === 'starter'
                              ? 'bg-neutral-800/50 text-neutral-600 cursor-not-allowed'
                              : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20'}`}>
                          {blastState?.postId === post.id && blastState.step === 'loading' ? '...' : '📣 Blast WA'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(post.id, post.title)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors">
                        🗑️ Hapus
                      </button>
                    </div>
                  </div>

                  {/* Notification Sent Count */}
                  {post.notification_sent_count > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-800/50 text-xs text-neutral-500 flex items-center gap-1.5">
                      <span>📨</span>
                      <span>Terkirim ke <span className="text-green-400 font-semibold">{post.notification_sent_count}</span> pelanggan</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── BLAST CONFIRM MODAL ────────────────────────────── */}
      {blastState && blastState.step !== 'loading' && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => blastState.step === 'sending' ? null : setBlastState(null)} />
          <div className="relative bg-[var(--color-surface)] border border-neutral-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl z-10 text-center space-y-4">

            {blastState.step === 'confirm' && blastState.preview && (
              <>
                <div className="text-4xl">📣</div>
                <h3 className="text-lg font-bold text-white">Kirim Notifikasi WA?</h3>
                <p className="text-neutral-400 text-sm">
                  Notifikasi akan dikirim ke
                  <span className="text-white font-bold"> {blastState.preview.total_target} pelanggan</span> yang belum menerima.
                  {blastState.preview.already_sent > 0 && (
                    <span className="block text-xs text-neutral-500 mt-1">{blastState.preview.already_sent} pelanggan sudah pernah dinotifikasi sebelumnya (akan dilewati).</span>
                  )}
                </p>
                {blastState.preview.total_target === 0 ? (
                  <p className="text-amber-400 text-sm">Semua pelanggan sudah dinotifikasi untuk post ini.</p>
                ) : null}
                <div className="flex gap-3">
                  <button onClick={() => setBlastState(null)}
                    className="flex-1 py-2.5 border border-neutral-700 text-neutral-300 hover:bg-neutral-800 rounded-xl text-sm font-semibold transition-colors">
                    Batal
                  </button>
                  <button onClick={handleBlastSend} disabled={blastState.preview.total_target === 0}
                    className="flex-1 py-2.5 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl text-sm transition-colors disabled:opacity-40">
                    Ya, Kirim Sekarang
                  </button>
                </div>
              </>
            )}

            {blastState.step === 'sending' && (
              <>
                <div className="w-10 h-10 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mx-auto" />
                <h3 className="text-lg font-bold text-white">Mengirim...</h3>
                <p className="text-neutral-400 text-sm">Harap tunggu, notifikasi sedang dikirim ke pelanggan.</p>
              </>
            )}

            {blastState.step === 'done' && blastState.result && (
              <>
                <div className="text-4xl">✅</div>
                <h3 className="text-lg font-bold text-white">{blastState.result.background ? 'Diproses di Background' : 'Blast Selesai!'}</h3>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/20">
                    <p className="text-2xl font-bold text-green-400">{blastState.result.total_sent ?? blastState.result.total_target}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">Terkirim</p>
                  </div>
                  <div className="p-3 bg-neutral-800 rounded-xl border border-neutral-700">
                    <p className="text-2xl font-bold text-neutral-300">{blastState.result.total_target}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">Total Target</p>
                  </div>
                </div>
                <button onClick={() => setBlastState(null)}
                  className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl transition-colors">
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ─────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative bg-[var(--color-surface)] border border-neutral-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl z-10">
            {/* Modal Header */}
            <div className="sticky top-0 bg-[var(--color-surface)] border-b border-neutral-800 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
              <h2 className="text-lg font-bold">{editingPost ? "Edit Post" : "Buat Post Baru"}</h2>
              <button onClick={closeModal} className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">

              {/* Type Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-neutral-300">Tipe Post</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["promo", "info", "status", "event"] as PostType[]).map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`py-2.5 rounded-xl text-sm font-bold border transition-all
                        ${form.type === t ? TYPE_META[t].badge + " ring-1 ring-current" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600"}`}>
                      {TYPE_META[t].icon}<br /><span className="text-xs">{TYPE_META[t].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-neutral-300">Judul *</label>
                  <span className={`text-xs ${form.title.length > 90 ? "text-amber-400" : "text-neutral-500"}`}>{form.title.length}/100</span>
                </div>
                <input type="text" maxLength={100} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Judul singkat yang menarik perhatian"
                  className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
              </div>

              {/* Body */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-neutral-300">Isi Konten *</label>
                  <span className={`text-xs ${form.body.length > 900 ? "text-amber-400" : "text-neutral-500"}`}>{form.body.length}/1000</span>
                </div>
                <textarea maxLength={1000} rows={5} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Tulis detail informasi, promo, atau pengumuman..."
                  className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none" />
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Gambar (Opsional)</label>
                <div className="flex items-center gap-3">
                  {form.image_url && (
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-neutral-800 shrink-0">
                      <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <label className="cursor-pointer flex-1 border border-dashed border-neutral-700 rounded-xl p-3 text-center text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 transition-colors">
                    {uploadingImg ? "Mengunggah..." : form.image_url ? "Ganti Gambar" : "📷 Pilih Gambar"}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingImg} onChange={handleImageUpload} />
                  </label>
                  {form.image_url && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                      className="px-3 py-2 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors">
                      Hapus
                    </button>
                  )}
                </div>
              </div>

              {/* Promo Fields (conditional) */}
              {form.type === "promo" && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-400">Kode Promo</label>
                    <input type="text" value={form.promo_code} onChange={e => setForm(f => ({ ...f, promo_code: e.target.value.toUpperCase() }))}
                      placeholder="HEMAT50"
                      className="w-full bg-black/40 border border-amber-500/30 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-400">% Diskon</label>
                    <input type="number" min="1" max="100" value={form.promo_discount_percent} onChange={e => setForm(f => ({ ...f, promo_discount_percent: e.target.value }))}
                      placeholder="20"
                      className="w-full bg-black/40 border border-amber-500/30 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors" />
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300">Label Tombol CTA</label>
                  <input type="text" value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))}
                    placeholder="Pesan Sekarang"
                    className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300">URL Tombol CTA</label>
                  <input type="text" value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))}
                    placeholder="/book"
                    className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                </div>
              </div>

              {/* Expiry */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Tanggal Kadaluarsa <span className="text-neutral-500">(kosong = tidak ada)</span></label>
                <input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full bg-black/40 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors color-scheme-dark" />
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <div className="p-4 bg-black/30 rounded-2xl border border-neutral-800 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-white">📌 Pin di atas feed</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Hanya 1 post yang bisa di-pin. Pin lama akan dilepas otomatis.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} />
                    <div className="w-9 h-5 bg-neutral-700 rounded-full peer-checked:bg-[var(--color-primary)] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>

                <div className="p-4 bg-black/30 rounded-2xl border border-neutral-800 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-white">🚀 Langsung Publish</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Jika off, post disimpan sebagai draft dan tidak terlihat publik.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                    <div className="w-9 h-5 bg-neutral-700 rounded-full peer-checked:bg-green-500 after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-3 border border-neutral-700 text-neutral-300 hover:bg-neutral-800 font-semibold rounded-xl transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-3 btn-primary text-background font-bold rounded-xl transition-all disabled:opacity-50">
                  {submitting ? "Menyimpan..." : form.is_published ? "🚀 Publish" : "💾 Simpan Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
