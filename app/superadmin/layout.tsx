"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
interface PipelineSummary {
    expiring_soon: number;
    churned: number;
}

const navLinks = [
    { name: "Overview",   href: "/superadmin",             icon: "📡", exact: true },
    { name: "Semua Toko", href: "/superadmin/tenants",     icon: "🏪", exact: false },
    { name: "Pipeline",   href: "/superadmin/pipeline",    icon: "🎯", exact: true, hasBadge: true },
    { name: "Follow-up",  href: "/superadmin/followups",   icon: "📋", exact: false },
    { name: "Affiliates", href: "/superadmin/affiliates",  icon: "👥", exact: false },
    { name: "WhatsApp",   href: "/superadmin/whatsapp",    icon: "💬", exact: false },
];



export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [summary, setSummary] = useState<PipelineSummary | null>(null);

    useEffect(() => {
        document.title = 'CukurShip | Super Admin';
        
        // Fetch pipeline summary once on mount
        const token = localStorage.getItem("superadmin_token");
        if (token) {
            fetch('/api/superadmin/pipeline', {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.summary) setSummary(data.summary);
            }).catch(e => console.error("Failed to load pipeline summary", e));
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("superadmin_token");
        localStorage.removeItem("superadmin_user");
        router.push("/superadmin/login");
    };

    return (
        <div className="min-h-screen bg-[#060d1a] text-white flex flex-col md:flex-row font-sans"
            style={{ backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.04) 0%, transparent 70%)' }}>

            {/* Sidebar Desktop */}
            <aside className="hidden md:flex flex-col w-60 border-r border-cyan-900/30 bg-[#071120] relative">
                {/* Logo */}
                <div className="px-6 py-5 border-b border-cyan-900/30">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🛰️</span>
                        <div>
                            <p className="text-sm font-bold text-white">CukurShip</p>
                            <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-widest">Super Admin</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 py-5 px-3 space-y-1">
                    {navLinks.map(link => {
                        const isActive = link.exact ? pathname === link.href : pathname?.startsWith(link.href);
                        const badgeCount = link.hasBadge && summary ? (summary.expiring_soon + summary.churned) : 0;
                        return (
                            <Link key={link.name} href={link.href}
                                className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                                    ${isActive
                                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                        : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                                    }`}>
                                <div className="flex items-center gap-3">
                                    <span className="text-base opacity-80">{link.icon}</span>
                                    {link.name}
                                </div>
                                {badgeCount > 0 && (
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {badgeCount}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-cyan-900/30">
                    <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs text-neutral-500 hover:text-cyan-400 hover:bg-white/5 transition-all">
                        <span>↰</span> Admin Panel
                    </Link>
                    <button onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-all mt-1">
                        <span>🚪</span> Keluar
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile header */}
                <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-cyan-900/30 bg-[#071120]">
                    <div className="flex items-center gap-2">
                        <span>🛰️</span>
                        <span className="text-sm font-bold text-cyan-400">Super Admin</span>
                    </div>
                    <button onClick={() => setMobileOpen(!mobileOpen)}
                        className="w-9 h-9 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400">
                        {mobileOpen ? "✖" : "☰"}
                    </button>
                </header>

                {/* Mobile nav dropdown */}
                {mobileOpen && (
                    <div className="md:hidden bg-[#071120] border-b border-cyan-900/30 px-4 pb-4 space-y-1 pt-2">
                        {navLinks.map(link => (
                            <Link key={link.name} href={link.href} onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:text-cyan-400">
                                <span>{link.icon}</span> {link.name}
                            </Link>
                        ))}
                        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 text-left">
                            <span>🚪</span> Keluar
                        </button>
                    </div>
                )}

                {/* Page content */}
                <div className="flex-1 p-6">{children}</div>
            </div>
        </div>
    );
}
