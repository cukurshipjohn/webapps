import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Abaikan error ESLint saat build di Vercel agar tidak gagal karena bug circular structure
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
