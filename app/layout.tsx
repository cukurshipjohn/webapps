import type { Metadata } from "next";
import { Outfit, Merriweather, Montserrat } from "next/font/google";
import "./globals.css";
import { supabaseAdmin } from "@/lib/supabase";
import { headers } from 'next/headers';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'cukurship.id';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';

    // Extract subdomain slug
    let slug: string | null = null;
    if (!host.includes('localhost') && !host.includes('127.0.0.1') && host.endsWith(`.${ROOT_DOMAIN}`)) {
      slug = host.replace(`.${ROOT_DOMAIN}`, '');
    }

    if (slug) {
      // Fetch tenant shop_name by slug
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('shop_name')
        .eq('slug', slug)
        .single();
      if (tenant?.shop_name) {
        return { title: tenant.shop_name, description: `Booking online di ${tenant.shop_name}.` };
      }
    }
  } catch { /* silent */ }

  // Default: root domain or localhost
  return { title: 'CukurShip', description: 'Platform booking barbershop multi-tenant.' };
}

// Fungsi Helper untuk fetch CSS Settings
async function getTenantSettings() {
  try {
    // HARCODED DULU: mengambil tenant_settings pertama yang ada di DB
    // Di Fase 3 ini akan membaca dari `headers().get('host')` (Subdomain)
    const { data } = await supabaseAdmin
      .from("tenant_settings")
      .select("*")
      .limit(1)
      .single();

    return data || null;
  } catch (e) {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const settings = await getTenantSettings();

  // Ambil Custom Theme Colors
  const colorPrimary = settings?.color_primary || "#f59e0b";
  const colorPrimaryHover = settings?.color_primary_hover || "#d97706";
  const colorBg = settings?.color_background || "#0a0a0a";
  const colorSurface = settings?.color_surface || "#171717";
  const colorAccent = settings?.color_accent || "#ffffff";
  const colorSecondary = settings?.color_secondary || "#d97706";
  const useGradient = settings?.use_gradient || false;

  // Gradient computation for buttons
  const btnBg = useGradient 
    ? `linear-gradient(to right, ${colorPrimary}, ${colorSecondary})` 
    : colorPrimary;
  const btnBgHover = useGradient 
    ? `linear-gradient(to right, ${colorPrimaryHover}, ${colorSecondary})` 
    : colorPrimaryHover;

  // Ambil font presert
  const fontChoice = settings?.font_choice || "modern";
  const fontClass = fontChoice === 'classic' ? 'font-classic' : fontChoice === 'bold' ? 'font-bold' : 'font-modern';

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --color-primary: ${colorPrimary};
              --color-primary-hover: ${colorPrimaryHover};
              --color-background: ${colorBg};
              --color-surface: ${colorSurface};
              --color-accent: ${colorAccent};
              --color-secondary: ${colorSecondary};
              
              /* Derived Gradient or Solid Button Styles */
              --theme-button-bg: ${btnBg};
              --theme-button-bg-hover: ${btnBgHover};
            }
          `
        }} />
      </head>
      <body
        className={`${fontClass} antialiased bg-background text-accent selection:bg-primary/30 selection:text-white transition-colors duration-300 min-h-screen flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
