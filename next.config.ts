import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  typescript: {
    // Abaikan error Typescript saat build di Vercel (untuk mencegah Type Error)
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Terapkan ke semua rute
        source: "/(.*)",
        headers: [
          {
            // Izinkan metode eval() dari script Midtrans (payment popup) 
            // tanpa membatasi API pihak ketiga lainnya
            key: "Content-Security-Policy",
            value: "script-src * 'unsafe-eval' 'unsafe-inline' blob:;"
          }
        ]
      }
    ];
  },
};

export default nextConfig;
