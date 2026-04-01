import { NextRequest, NextResponse } from "next/server";
import { getAffiliateFromToken } from "@/lib/affiliate";
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(request: NextRequest) {
  try {
    // 1. Verifikasi Otorisasi Token
    const authData = getAffiliateFromToken(request);
    if (!authData) {
      return NextResponse.json(
        { message: "Akses ditolak: Token tidak valid atau kedaluwarsa." },
        { status: 401 }
      );
    }

    // 2. Parsel Body Request
    const body = await request.json();
    const { name, email, bank_name, bank_account_number, bank_account_name } = body;

    // Validasi Field Penting (Contoh: Nama tidak boleh kosong)
    if (!name || name.trim() === "") {
      return NextResponse.json(
        { message: "Nama tidak boleh kosong." },
        { status: 400 }
      );
    }

    // 3. Persiapkan Data Update (Hanya Field yang Diizinkan)
    const updateData: any = {
      name: name.trim(),
    };

    if (email !== undefined) updateData.email = email.trim() || null;
    if (bank_name !== undefined) updateData.bank_name = bank_name.trim() || null;
    if (bank_account_number !== undefined)
      updateData.bank_account_number = bank_account_number.trim() || null;
    if (bank_account_name !== undefined)
      updateData.bank_account_name = bank_account_name.trim() || null;

    // 4. Lakukan Update via Supabase Admin (Bypass RLS)
    const { data: updatedAffiliate, error } = await supabaseAdmin
      .from("affiliates")
      .update(updateData)
      .eq("id", authData.affiliateId)
      .select("name, email, bank_name, bank_account_number, bank_account_name")
      .single();

    if (error) {
      console.error("[Affiliate Profile Update] DB Error:", error);
      return NextResponse.json(
        { message: "Terjadi kesalahan sistem saat memperbarui profil." },
        { status: 500 }
      );
    }

    // 5. Kembalikan Response Berhasil
    return NextResponse.json({
      message: "Profil sukses diperbarui.",
      profile: updatedAffiliate,
    });
  } catch (error: any) {
    console.error("[Affiliate Profile Update] Fatal Error:", error);
    return NextResponse.json(
      { message: "Terjadi kesalahan internal server." },
      { status: 500 }
    );
  }
}
