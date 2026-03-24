import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";

interface Post {
  id: string;
  type: "promo" | "info" | "status" | "event";
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

const TYPE_META = {
  promo:  { emoji: "🏷️", label: "Promo" },
  info:   { emoji: "📢", label: "Info" },
  status: { emoji: "✅", label: "Status" },
  event:  { emoji: "🎉", label: "Event" },
};

async function getPost(id: string): Promise<Post | null> {
  try {
    const headersList = await headers();
    const tenantId = headersList.get("x-tenant-id") || "";
    const host = headersList.get("host") || "";

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || `http://${host}`}/api/posts/${id}`,
      {
        headers: { "x-tenant-id": tenantId },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const post = await getPost(params.id);
  if (!post) return { title: "Post Tidak Ditemukan" };
  return {
    title: post.title,
    description: post.body.slice(0, 160),
    openGraph: {
      title: post.title,
      description: post.body.slice(0, 160),
      images: post.image_url ? [post.image_url] : [],
    },
  };
}

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id);
  if (!post) notFound();

  const meta = TYPE_META[post.type];
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* Hero Image */}
      {post.image_url && (
        <div className="w-full aspect-video max-h-[50vh] overflow-hidden">
          <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 to-transparent pointer-events-none" />
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Back Button */}
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors">
          ← Kembali ke Beranda
        </Link>

        {/* Badges */}
        <div className="flex gap-2 flex-wrap">
          <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {meta.emoji} {meta.label}
          </span>
          {post.is_pinned && (
            <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              📌 PIN
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{post.title}</h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-neutral-500 border-b border-neutral-800 pb-4">
          <span>📅 {fmtDate(post.published_at)}</span>
          {post.expires_at && (
            <span className="text-red-400">⏰ Berlaku hingga {fmtDate(post.expires_at)}</span>
          )}
        </div>

        {/* Body */}
        <div className="text-neutral-300 leading-relaxed whitespace-pre-wrap text-base">
          {post.body}
        </div>

        {/* Promo Code */}
        {post.type === "promo" && post.promo_code && (
          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-2">
            <p className="text-[10px] text-amber-500/70 uppercase tracking-widest font-semibold">Kode Promo</p>
            <p className="font-mono font-bold text-amber-400 text-3xl tracking-widest">{post.promo_code}</p>
            {post.promo_discount_percent && (
              <p className="text-amber-400 font-semibold">Diskon {post.promo_discount_percent}%</p>
            )}
            <p className="text-xs text-amber-500/60">Salin kode ini dan tunjukkan ke kasir.</p>
          </div>
        )}

        {/* CTA */}
        {post.cta_label && post.cta_url && (
          <Link href={post.cta_url}
            className="block w-full text-center py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-2xl transition-all text-lg shadow-lg shadow-amber-500/20">
            {post.cta_label} →
          </Link>
        )}
      </div>
    </main>
  );
}
