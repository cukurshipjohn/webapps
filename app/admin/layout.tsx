"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [shopName, setShopName] = useState("...");
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "cukurship.id";

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(r => r.json())
      .then(d => {
        if (d.shop_name) setShopName(d.shop_name);
        if (d.slug) setShopSlug(d.slug);
      })
      .catch(() => {});
  }, []);

  const shopUrl = shopSlug ? `https://${shopSlug}.${appDomain}` : null;

  const handleCopy = () => {
    if (!shopUrl) return;
    navigator.clipboard.writeText(shopUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch (e) {
      console.error(e);
      router.push('/admin/login');
    }
  };

  const navLinks = [
    { name: "Dashboard Utama", href: "/admin", icon: "🏠", exact: true },
    { name: "Manajemen Kapster", href: "/admin/barbers", icon: "✂️", exact: false },
    { name: "Manajemen Layanan", href: "/admin/services", icon: "💈", exact: false },
    { name: "Monitor Booking", href: "/admin/bookings", icon: "📅", exact: false },
    { name: "Langganan & Billing", href: "/admin/billing", icon: "💳", exact: false },
    { name: "Pengaturan Toko", href: "/admin/settings", icon: "⚙️", exact: false },
  ];

  return (
    <div className="min-h-screen bg-background text-accent flex flex-col md:flex-row font-sans selection:bg-primary/30">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-neutral-800/50 bg-background relative z-20">
        <div className="p-6 border-b border-neutral-800/50">
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent">
            {shopName}
          </h2>
          <p className="text-xs text-neutral-500 font-mono mt-1 tracking-widest">ADMIN PANEL</p>

          {/* Shop URL Card */}
          {shopUrl && (
            <div className="mt-3 p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl space-y-1.5">
              <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Link Halaman Toko</p>
              <p className="text-xs font-mono text-primary truncate">{shopUrl}</p>
              <div className="flex gap-1.5">
                <a
                  href={shopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-1.5 text-center text-[11px] font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-all"
                >
                  ↗ Buka
                </a>
                <button
                  onClick={handleCopy}
                  className={`flex-1 py-1.5 text-center text-[11px] font-semibold border rounded-lg transition-all
                    ${copied
                      ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700"
                    }`}
                >
                  {copied ? "✓ Tersalin!" : "⧉ Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2 relative">
          {navLinks.map((link) => {
            const isActive = link.exact ? pathname === link.href : pathname?.startsWith(link.href);
            return (
              <Link 
                key={link.name} 
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium text-sm
                  ${isActive 
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]" 
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent"
                  }`}
              >
                <span className="text-lg opacity-80">{link.icon}</span>
                {link.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-800/50">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-neutral-400 font-medium text-sm hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 border border-transparent transition-all"
          >
            <span>🚪</span> Keluar Sistem
          </button>
        </div>
      </aside>


      {/* Header & Mobile Content Area */}
      <div className="flex-1 flex flex-col min-h-screen max-w-full overflow-x-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-neutral-800/50 bg-background/80 backdrop-blur-md sticky top-0 z-30">
          <div>
            <h2 className="font-bold text-primary">{shopName}</h2>
            <p className="text-[10px] text-neutral-500 font-mono tracking-widest">ADMIN</p>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="w-10 h-10 flex items-center justify-center bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400"
          >
            {isMobileMenuOpen ? "✖" : "☰"}
          </button>
        </header>

        {/* Mobile Flyout Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-20 bg-background animate-in slide-in-from-top-4 pt-20 px-4 pb-4 flex flex-col border-b border-primary/20">
            <nav className="flex-1 space-y-2">
               {navLinks.map((link) => {
                const isActive = link.exact ? pathname === link.href : pathname?.startsWith(link.href);
                return (
                  <Link 
                    key={link.name} 
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-medium text-lg
                      ${isActive 
                        ? "bg-primary/10 text-primary border border-primary/20" 
                        : "text-neutral-400"
                      }`}
                  >
                    <span>{link.icon}</span> {link.name}
                  </Link>
                );
              })}
            </nav>
            <button 
              onClick={handleLogout}
              className="mt-6 w-full py-4 rounded-xl text-red-500 font-medium border border-red-500/20 bg-red-500/10"
            >
              Keluar
            </button>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 relative z-10 w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
