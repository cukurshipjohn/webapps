"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────
type PostType = "promo" | "info" | "status" | "event";

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
  published_at: string;
  expires_at: string | null;
}

// ── Constants ────────────────────────────────────────────
const TYPE_META: Record<PostType, { emoji: string; label: string; badge: string; glow: string }> = {
  promo:  { emoji: "🏷️", label: "Promo",  badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",   glow: "shadow-amber-500/10" },
  info:   { emoji: "📢", label: "Info",   badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",      glow: "shadow-blue-500/10" },
  status: { emoji: "✅", label: "Status", badge: "bg-green-500/20 text-green-400 border-green-500/30",   glow: "shadow-green-500/10" },
  event:  { emoji: "🎉", label: "Event",  badge: "bg-purple-500/20 text-purple-400 border-purple-500/30", glow: "shadow-purple-500/10" },
};

// ── Helpers ──────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) >= 1) return rtf.format(-diffDay, "day");
  if (Math.abs(diffHour) >= 1) return rtf.format(-diffHour, "hour");
  if (Math.abs(diffMin) >= 1) return rtf.format(-diffMin, "minute");
  return "baru saja";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// ── PostCard ─────────────────────────────────────────────
function PostCard({ post }: { post: Post }) {
  const meta = TYPE_META[post.type];
  const [copied, setCopied] = useState(false);

  const copyPromoCode = async () => {
    if (!post.promo_code) return;
    await navigator.clipboard.writeText(post.promo_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <article className={`glass rounded-2xl border overflow-hidden flex-shrink-0 w-[85vw] sm:w-full max-w-sm sm:max-w-none snap-center transition-all
      ${post.is_pinned
        ? "border-amber-500/40 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/10"
        : "border-neutral-800/60 hover:border-neutral-700"}`}>

      {/* Image */}
      {post.image_url && (
        <div className="aspect-video w-full overflow-hidden bg-neutral-900">
          <img src={post.image_url} alt={post.title} loading="lazy" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${meta.badge}`}>
            {meta.emoji} {meta.label}
          </span>
          {post.is_pinned && (
            <span className="px-2.5 py-1 text-xs font-bold rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
              📌 PIN
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-white text-base leading-snug">{post.title}</h3>

        {/* Body */}
        <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>

        {/* Promo Code Block */}
        {post.type === "promo" && post.promo_code && (
          <button onClick={copyPromoCode}
            className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 transition-all text-left group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-amber-500/70 uppercase tracking-widest font-semibold mb-0.5">Kode Promo</p>
                <p className="font-mono font-bold text-amber-400 text-lg tracking-wider">{post.promo_code}</p>
                {post.promo_discount_percent && (
                  <p className="text-xs text-amber-500 mt-0.5">Diskon {post.promo_discount_percent}%</p>
                )}
              </div>
              <div className="text-amber-400 text-2xl group-hover:scale-110 transition-transform">
                {copied ? "✅" : "📋"}
              </div>
            </div>
            <p className="text-[10px] text-amber-500/60 mt-2 text-center">
              {copied ? "Kode promo berhasil disalin!" : "Tap untuk salin kode"}
            </p>
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-neutral-500 pt-1 border-t border-neutral-800/50">
          <span>{relativeTime(post.published_at)}</span>
          {post.expires_at && (
            <span className="text-red-400">⏰ Hingga {fmtDate(post.expires_at)}</span>
          )}
        </div>

        {/* CTA */}
        {post.cta_label && post.cta_url && (
          <Link href={post.cta_url}
            className="block w-full text-center py-2.5 bg-primary text-background font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm">
            {post.cta_label} →
          </Link>
        )}
      </div>
    </article>
  );
}

// ── Skeleton ─────────────────────────────────────────────
function PostSkeleton() {
  return (
    <div className="glass rounded-2xl border border-neutral-800/60 overflow-hidden flex-shrink-0 w-[85vw] sm:w-full max-w-sm sm:max-w-none snap-center animate-pulse">
      <div className="aspect-video bg-neutral-800/50 w-full" />
      <div className="p-4 space-y-3">
        <div className="h-5 w-20 bg-neutral-800 rounded-full" />
        <div className="h-4 w-3/4 bg-neutral-800 rounded-lg" />
        <div className="h-3 w-full bg-neutral-800/60 rounded-lg" />
        <div className="h-3 w-2/3 bg-neutral-800/60 rounded-lg" />
      </div>
    </div>
  );
}

// ── Main: PostFeed ────────────────────────────────────────
interface PostFeedProps {
  tenantId?: string;     // optional override; normally resolved via x-tenant-id header in proxy
  maxItems?: number;     // default: all
  showTitle?: boolean;   // default: true
}

export default function PostFeed({ tenantId, maxItems, showTitle = true }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (tenantId) params.set("tenant_id", tenantId);
      const res = await fetch(`/api/posts?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: Post[] = data.data || data || [];
      setPosts(maxItems ? items.slice(0, maxItems) : items);
    } catch {
      // silent fail — no posts
    } finally {
      setLoading(false);
    }
  }, [tenantId, maxItems]);

  // Initial fetch + auto-refresh every 5 minutes
  useEffect(() => {
    fetchPosts();
    const timer = setInterval(fetchPosts, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchPosts]);

  if (loading) {
    return (
      <section className="space-y-3">
        {showTitle && <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest px-1">Pengumuman & Promo</h2>}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:flex-col sm:overflow-x-visible snap-x snap-mandatory scrollbar-none">
          <PostSkeleton />
          <PostSkeleton />
        </div>
      </section>
    );
  }

  if (posts.length === 0) return null;

  const isCarousel = posts.length > 2;

  return (
    <section className="space-y-3">
      {showTitle && (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest">
            📣 Pengumuman & Promo
          </h2>
          <Link href="/posts" className="text-xs text-primary hover:text-primary-hover transition-colors">
            Lihat semua →
          </Link>
        </div>
      )}

      {/* Desktop: vertical stack | Mobile: horizontal carousel */}
      <div
        ref={scrollRef}
        className={`${isCarousel
          ? "flex gap-3 overflow-x-auto pb-2 sm:flex-col sm:overflow-x-visible snap-x snap-mandatory scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0"
          : "flex flex-col gap-3"}`}>
        {posts.map((post, i) => (
          <div key={post.id}
            className="animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </section>
  );
}
