"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PendingExpensesBannerProps {
  tenantId?: string; // mostly we rely on the token itself for tenantId
  token?: string | null;
}

export function PendingExpensesBanner({ tenantId, token }: PendingExpensesBannerProps) {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We only need local token if one wasn't passed down
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    
    if (!activeToken) {
      setLoading(false);
      return;
    }

    const fetchPending = async () => {
      try {
        const res = await fetch('/api/admin/expenses?status=pending&limit=1', {
          headers: { Authorization: `Bearer ${activeToken}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.summary) {
            setPendingCount(json.summary.pending_count || 0);
            setPendingTotal(json.summary.pending_total || 0);
          }
        }
      } catch (e) {
        console.error("Failed to load pending expenses banner", e);
      } finally {
        setLoading(false);
      }
    };

    fetchPending();
  }, [token]);

  if (loading || pendingCount === 0) {
    return null;
  }

  return (
    <div style={{
      background:   '#7F1D1D',  // merah gelap
      border:       '1px solid #EF4444',
      borderRadius: '8px',
      padding:      '14px 18px',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      gap:          '16px',
      marginBottom: '20px',
      flexWrap:     'wrap'
    }} className="shadow-lg shadow-red-900/20">
      <div className="flex-1">
        <strong style={{ color: '#FCA5A5' }} className="flex items-center gap-2">
          ⚠️ PERINGATAN: LAPORAN KEUANGAN TIDAK AKURAT
        </strong>
        <p style={{ color: '#FCA5A5', margin: '4px 0 0', fontSize: '13px' }} className="leading-relaxed">
          Ada <strong>{pendingCount} pengajuan pengeluaran</strong> senilai total{' '}
          <strong>Rp {pendingTotal.toLocaleString('id-ID')}</strong>{' '}
          yang belum ditinjau. Angka pada laporan keuangan BELUM mencerminkan kondisi real.
        </p>
      </div>
      <Link href="/admin/expenses"
        style={{
          background:   '#EF4444',
          color:        '#fff',
          padding:      '8px 16px',
          borderRadius: '6px',
          whiteSpace:   'nowrap',
          textDecoration: 'none',
          fontSize:     '13px',
          fontWeight:   '600',
        }}
        className="hover:bg-red-400 transition-colors shadow-sm"
      >
        → Tinjau Sekarang
      </Link>
    </div>
  );
}
