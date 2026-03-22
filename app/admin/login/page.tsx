"use client";

import { Suspense } from "react";
import LoginContent from "../../../components/AdminLoginContent";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 flex items-center justify-center text-amber-500 font-mono">Memuat Panel Admin...</div>}>
      <LoginContent />
    </Suspense>
  );
}
