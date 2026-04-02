'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatRupiah } from '@/lib/affiliate';

export const dynamic = 'force-dynamic';

function Toast({ msg, isError, onClose }: { msg: string, isError?: boolean, onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);
    return (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 transition-all animate-fade-in-up ${isError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
            <span className="text-lg">{isError ? '❌' : '✅'}</span>
            <p className="font-medium text-sm">{msg}</p>
        </div>
    );
}

export default function PipelinePage() {
    const router = useRouter();

    const [tenants, setTenants] = useState<any[]>([]);
    const [summary, setSummary] = useState({ total: 0, healthy: 0, expiring_soon: 0, at_risk: 0, churned: 0, trial: 0 });
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    
    const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
    const [modalMode, setModalMode] = useState<'detail' | 'send-wa' | 'add-note' | null>(null);
    
    const [toast, setToast] = useState<{ msg: string, isError?: boolean } | null>(null);

    // Modal Send WA State
    const [waCaseType, setWaCaseType] = useState('renewal_reminder');
    const [waCustomNote, setWaCustomNote] = useState('');
    const [waLoading, setWaLoading] = useState(false);

    // Modal Add Note State
    const [noteCaseType, setNoteCaseType] = useState('renewal_reminder');
    const [noteChannel, setNoteChannel] = useState('internal_note');
    const [noteContent, setNoteContent] = useState('');
    const [noteScheduledAt, setNoteScheduledAt] = useState('');
    const [noteChurnReason, setNoteChurnReason] = useState('too_expensive');
    const [noteWinBack, setNoteWinBack] = useState('unknown');
    const [noteLoading, setNoteLoading] = useState(false);

    // Modal Detail State
    const [detailFollowups, setDetailFollowups] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const getToken = () => window.localStorage.getItem('superadmin_token');

    const fetchData = useCallback(async () => {
        const token = getToken();
        if (!token) { router.push('/superadmin/login'); return; }

        setLoading(true);
        try {
            const res = await fetch('/api/superadmin/tenants/pipeline', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) { router.push('/superadmin/login'); return; }
            if (!res.ok) throw new Error('Failed to fetch pipeline data');

            const data = await res.json();
            setTenants(data.tenants || []);
            setSummary(data.summary || { total: 0, healthy: 0, expiring_soon: 0, at_risk: 0, churned: 0, trial: 0 });
        } catch (err: any) {
            setToast({ msg: err.message || 'Error', isError: true });
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSendWA = async () => {
        const token = getToken();
        if (!token || !selectedTenant) return;

        setWaLoading(true);
        try {
            const res = await fetch(`/api/superadmin/tenants/${selectedTenant.id}/send-wa`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    case_type: waCaseType,
                    custom_note: waCaseType === 'custom' ? waCustomNote : undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Gagal mengirim WA');

            if (data.message_sent) {
                setToast({ msg: `Pesan terkirim ke ${selectedTenant.shop_name} ✅` });
            } else {
                setToast({ msg: 'Follow-up tercatat, tapi WA gagal terkirim', isError: true });
            }

            setModalMode(null);
            fetchData();
        } catch (err: any) {
            setToast({ msg: err.message, isError: true });
        } finally {
            setWaLoading(false);
        }
    };

    const handleAddNote = async () => {
        const token = getToken();
        if (!token || !selectedTenant) return;

        setNoteLoading(true);
        try {
            if (noteCaseType === 'churn_prevention') {
                const res = await fetch('/api/superadmin/churn-surveys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        tenant_id: selectedTenant.id,
                        reason: noteChurnReason,
                        detail_note: noteContent,
                        win_back_potential: noteWinBack
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Gagal menyimpan churn survey');
            } else {
                const payload: any = {
                    tenant_id: selectedTenant.id,
                    case_type: noteCaseType,
                    channel: noteChannel,
                    message_sent: noteContent   // kolom aktual di DB
                };
                if (noteScheduledAt) payload.scheduled_at = new Date(noteScheduledAt).toISOString();

                const res = await fetch('/api/superadmin/followups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Gagal menyimpan follow-up');
            }

            setToast({ msg: 'Catatan berhasil disimpan ✅' });
            setModalMode(null);
            fetchData();
        } catch (err: any) {
            setToast({ msg: err.message, isError: true });
        } finally {
            setNoteLoading(false);
        }
    };

    const loadDetailFollowups = async (tenantId: string) => {
        const token = getToken();
        if (!token) return;
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/superadmin/followups?tenant_id=${tenantId}&limit=5`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Gagal load followup');
            const data = await res.json();
            setDetailFollowups(data.followups || []);
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const openModal = (mode: 'detail' | 'send-wa' | 'add-note', tenant: any) => {
        setSelectedTenant(tenant);
        setModalMode(mode);
        if (mode === 'detail') loadDetailFollowups(tenant.id);
        if (mode === 'send-wa') {
            setWaCaseType('renewal_reminder');
            setWaCustomNote('');
        }
        if (mode === 'add-note') {
            setNoteCaseType('renewal_reminder');
            setNoteChannel('internal_note');
            setNoteContent('');
            setNoteScheduledAt('');
            setNoteChurnReason('too_expensive');
            setNoteWinBack('unknown');
        }
    };

    const filteredTenants = activeFilter === 'all' 
        ? tenants 
        : tenants.filter(t => t.lifecycle_status === activeFilter);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}

            {/* HEADER BAR */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-white">Pipeline Tenant</h1>
                    <button onClick={fetchData} className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors" title="Refresh">
                        🔄
                    </button>
                </div>
                <button 
                    disabled={summary.expiring_soon === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg"
                >
                    Kirim Pengingat Massal
                </button>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div onClick={() => setActiveFilter('all')} className={`p-4 bg-neutral-900/60 rounded-xl cursor-pointer border ${activeFilter === 'all' ? 'border-neutral-500' : 'border-neutral-800'}`}>
                    <div className="text-neutral-400 text-xs font-semibold mb-1">Total Tenant</div>
                    <div className="text-2xl font-bold text-white">{summary.total}</div>
                </div>
                <div onClick={() => setActiveFilter('healthy')} className={`p-4 bg-neutral-900/60 rounded-xl cursor-pointer border ${activeFilter === 'healthy' ? 'border-green-500' : 'border-neutral-800'}`}>
                    <div className="text-neutral-400 text-xs font-semibold mb-1">Healthy</div>
                    <div className="text-2xl font-bold text-green-400">{summary.healthy}</div>
                </div>
                <div onClick={() => setActiveFilter('expiring_soon')} className={`p-4 bg-neutral-900/60 rounded-xl cursor-pointer border ${activeFilter === 'expiring_soon' ? 'border-yellow-500' : 'border-neutral-800'}`}>
                    <div className="text-neutral-400 text-xs font-semibold mb-1">Akan Berakhir</div>
                    <div className="text-2xl font-bold text-yellow-500">{summary.expiring_soon}</div>
                </div>
                <div onClick={() => setActiveFilter('at_risk')} className={`p-4 bg-neutral-900/60 rounded-xl cursor-pointer border ${activeFilter === 'at_risk' ? 'border-orange-500' : 'border-neutral-800'}`}>
                    <div className="text-neutral-400 text-xs font-semibold mb-1">Perlu Perhatian</div>
                    <div className="text-2xl font-bold text-orange-400">{summary.at_risk}</div>
                </div>
                <div onClick={() => setActiveFilter('churned')} className={`p-4 bg-neutral-900/60 rounded-xl cursor-pointer border ${activeFilter === 'churned' ? 'border-red-500' : 'border-neutral-800'}`}>
                    <div className="text-neutral-400 text-xs font-semibold mb-1">Tidak Aktif</div>
                    <div className="text-2xl font-bold text-red-500">{summary.churned}</div>
                </div>
            </div>

            {/* FILTER TABS */}
            <div className="flex gap-2 border-b border-neutral-800 overflow-x-auto pb-px">
                {['all', 'expiring_soon', 'at_risk', 'churned', 'trial', 'healthy'].map(ft => (
                    <button
                        key={ft}
                        onClick={() => setActiveFilter(ft)}
                        className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeFilter === ft ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
                    >
                        {ft === 'all' ? 'Semua' : ft === 'expiring_soon' ? 'Akan Berakhir' : ft === 'at_risk' ? 'Perlu Perhatian' : ft === 'churned' ? 'Tidak Aktif' : ft === 'healthy' ? 'Healthy' : 'Trial'}
                    </button>
                ))}
            </div>

            {/* TABEL TENANT */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-neutral-900 text-neutral-400 border-b border-neutral-800">
                        <tr>
                            <th className="px-4 py-3 font-medium">Toko</th>
                            <th className="px-4 py-3 font-medium">Paket</th>
                            <th className="px-4 py-3 font-medium">Harga/bln</th>
                            <th className="px-4 py-3 font-medium">Berakhir</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Follow-up</th>
                            <th className="px-4 py-3 font-medium text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-500">Memuat data...</td></tr>}
                        {!loading && filteredTenants.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-500">Tidak ada tenant ditemukan.</td></tr>}
                        {!loading && filteredTenants.map(t => (
                            <tr key={t.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                                <td className="px-4 py-4">
                                    <div className="font-semibold text-white">{t.shop_name}</div>
                                    <div className="text-xs text-neutral-500">{t.slug}</div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="capitalize">{t.plan}</div>
                                    {t.is_in_promo && <span className="inline-block px-1.5 py-0.5 mt-1 bg-yellow-500/20 text-yellow-500 text-[10px] uppercase font-bold rounded">PROMO</span>}
                                </td>
                                <td className="px-4 py-4 text-neutral-300">{formatRupiah(t.current_price)}</td>
                                <td className="px-4 py-4">
                                    {t.plan !== 'trial' && t.plan_expires_at ? (
                                        <>
                                            <div className="whitespace-nowrap">{new Date(t.plan_expires_at).toLocaleDateString('id-ID')}</div>
                                            <div className={`text-xs mt-1 font-medium ${t.days_until_expiry < 0 ? 'text-red-500' : t.days_until_expiry <= 3 ? 'text-red-400' : t.days_until_expiry <= 7 ? 'text-yellow-400' : 'text-neutral-500'}`}>
                                                {t.days_until_expiry < 0 ? 'Expired' : `${t.days_until_expiry} hari lagi`}
                                            </div>
                                        </>
                                    ) : <div className="text-neutral-500">-</div>}
                                </td>
                                <td className="px-4 py-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-lg border ${
                                        t.lifecycle_status === 'healthy' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                                        t.lifecycle_status === 'expiring_soon' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                        t.lifecycle_status === 'at_risk' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                                        t.lifecycle_status === 'churned' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                        'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                    }`}>
                                        {t.lifecycle_status.replace('_', ' ').toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-4 py-4">
                                    {t.open_followup_count > 0 && <div className="inline-block px-2 py-0.5 mb-1 bg-red-500/20 text-red-500 border border-red-500/30 font-bold text-xs rounded-full">{t.open_followup_count} Open</div>}
                                    {t.last_followup ? (
                                        <div className="text-xs text-neutral-400">
                                            {new Date(t.last_followup.created_at).toLocaleDateString('id-ID')}
                                            <span className="block mt-0.5 bg-neutral-800 px-1 py-0.5 rounded text-[10px] uppercase truncate max-w-[100px]">{t.last_followup.outcome}</span>
                                        </div>
                                    ) : <div className="text-xs text-neutral-600">Belum ada</div>}
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => openModal('send-wa', t)} title="Kirim WA" className="p-1.5 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded border border-green-500/20">📱</button>
                                        <button onClick={() => openModal('add-note', t)} title="Tambah Catatan" className="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded border border-blue-500/20">📝</button>
                                        <button onClick={() => openModal('detail', t)} title="Detail" className="p-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 rounded border border-neutral-700">👁</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MODALS */}
            {modalMode && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in-up">
                        
                        {modalMode === 'send-wa' && (
                            <div className="p-6 space-y-4">
                                <h3 className="text-xl font-bold text-white">Kirim WhatsApp ke {selectedTenant?.shop_name}</h3>
                                
                                <div>
                                    <label className="text-xs text-neutral-400 mb-1 block">Nomor Tujuan</label>
                                    <input type="text" readOnly value={selectedTenant?.owner_phone || 'Tidak ada nomor'} className="w-full bg-neutral-800 text-neutral-300 px-3 py-2 rounded-lg border border-neutral-700 outline-none" />
                                </div>
                                
                                <div>
                                    <label className="text-xs text-neutral-400 mb-1 block">Jenis Follow-up</label>
                                    <select value={waCaseType} onChange={e => setWaCaseType(e.target.value)} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none">
                                        <option value="renewal_reminder">Pengingat Perpanjangan</option>
                                        <option value="usage_coaching">Cek Penggunaan Aplikasi</option>
                                        <option value="churn_prevention">Pencegahan Churn</option>
                                        <option value="reactivation_offer">Penawaran Reaktivasi</option>
                                        <option value="upgrade_offer">Penawaran Upgrade</option>
                                        <option value="general">Pesan Kustom</option>
                                    </select>
                                </div>

                                {waCaseType === 'general' ? (
                                    <div>
                                        <label className="text-xs text-neutral-400 mb-1 block">Tulis Pesan Kustom</label>
                                        <textarea value={waCustomNote} onChange={e => setWaCustomNote(e.target.value)} rows={4} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none" placeholder="Tulis pesan yang akan dikirimkan..."></textarea>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="text-xs text-neutral-400 mb-1 block">Preview Pesan Template</label>
                                        <div className="w-full bg-neutral-800 text-neutral-400 px-3 py-2 rounded-lg border border-neutral-700 whitespace-pre-wrap text-sm italic">
                                            {waCaseType === 'renewal_reminder' ? `Halo kak ${selectedTenant?.shop_name} 👋\nLangganan CukurShip Anda akan berakhir dalam ${selectedTenant?.days_until_expiry} hari.\nPerpanjang sekarang: https://cukurship.id/admin/billing` :
                                             waCaseType === 'usage_coaching' ? `Halo kak ${selectedTenant?.shop_name} 👋\nKami perhatikan aktivitas toko Anda belum maksimal.\nAda yang bisa kami bantu? Balas pesan ini 🙏` :
                                             waCaseType === 'churn_prevention' ? `Halo kak ${selectedTenant?.shop_name} 👋\nKami lihat langganan Anda akan segera berakhir. Yuk, kami bantu 😊` :
                                             waCaseType === 'reactivation_offer' ? `Halo kak ${selectedTenant?.shop_name} 👋\nKami rindu! Ada penawaran khusus reaktivasi untuk Anda.` :
                                             `Halo kak ${selectedTenant?.shop_name} 👋\nAnda bisa upgrade ke paket lebih tinggi dan dapatkan fitur tambahan.`}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 mt-6">
                                    <button onClick={() => setModalMode(null)} className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-300 font-medium hover:bg-neutral-800">Batal</button>
                                    <button onClick={handleSendWA} disabled={waLoading} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium disabled:opacity-50">
                                        {waLoading ? 'Mengirim...' : 'Kirim'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {modalMode === 'add-note' && (
                            <div className="p-6 space-y-4">
                                <h3 className="text-xl font-bold text-white">Tambah Catatan {selectedTenant?.shop_name}</h3>
                                
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-neutral-400 mb-1 block">Jenis Kasus</label>
                                        <select value={noteCaseType} onChange={e => setNoteCaseType(e.target.value)} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none hover:border-neutral-600 focus:border-cyan-500 transition-colors">
                                            <option value="renewal_reminder">Pengingat Perpanjangan</option>
                                            <option value="usage_coaching">Cek Penggunaan</option>
                                            <option value="churn_prevention">Berhenti Berlangganan (Churn)</option>
                                            <option value="reactivation_offer">Penawaran Reaktivasi</option>
                                            <option value="upgrade_offer">Penawaran Upgrade</option>
                                            <option value="general">Lainnya</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-neutral-400 mb-1 block">Saluran</label>
                                        <select value={noteChannel} onChange={e => setNoteChannel(e.target.value)} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none hover:border-neutral-600 focus:border-cyan-500 transition-colors">
                                            <option value="internal_note">Catatan Internal</option>
                                            <option value="whatsapp">WhatsApp</option>
                                            <option value="phone_call">Telepon</option>
                                        </select>
                                    </div>
                                </div>

                                {noteCaseType === 'churn_prevention' && (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-neutral-400 mb-1 block">Alasan Berhenti</label>
                                            <select value={noteChurnReason} onChange={e => setNoteChurnReason(e.target.value)} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none hover:border-neutral-600 focus:border-cyan-500 transition-colors">
                                                <option value="too_expensive">Terlalu Mahal</option>
                                                <option value="not_using_features">Jarang Digunakan</option>
                                                <option value="switched_competitor">Pindah Kompetitor</option>
                                                <option value="temporary_close">Tutup Sementara</option>
                                                <option value="technical_issues">Masalah Teknis</option>
                                                <option value="no_customers">Sepi Pelanggan</option>
                                                <option value="other">Lainnya</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-neutral-400 mb-1 block">Potensi Win-back</label>
                                            <select value={noteWinBack} onChange={e => setNoteWinBack(e.target.value)} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none hover:border-neutral-600 focus:border-cyan-500 transition-colors">
                                                <option value="high">Tinggi — Kemungkinan besar kembali</option>
                                                <option value="medium">Sedang — Ada peluang</option>
                                                <option value="low">Rendah — Kemungkinan kecil</option>
                                                <option value="unknown">Belum dianalisis</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs text-neutral-400 mb-1 block">Catatan (Wajib)</label>
                                    <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={3} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none hover:border-neutral-600 focus:border-cyan-500 transition-colors" placeholder="Deskripsikan detail follow-up..."></textarea>
                                </div>
                                
                                <div>
                                    <label className="text-xs text-neutral-400 mb-1 block">Jadwal Follow-up Selanjutnya (Opsional)</label>
                                    <input type="datetime-local" value={noteScheduledAt} onChange={e => setNoteScheduledAt(e.target.value)} className="w-full bg-neutral-800 text-white px-3 py-2 rounded-lg border border-neutral-700 outline-none hover:border-neutral-600 focus:border-cyan-500 transition-colors" />
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button onClick={() => setModalMode(null)} className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-300 font-medium hover:bg-neutral-800">Batal</button>
                                    <button onClick={handleAddNote} disabled={noteLoading || !noteContent.trim()} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
                                        {noteLoading ? 'Menyimpan...' : 'Simpan'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {modalMode === 'detail' && (
                            <div className="flex flex-col h-full max-h-[80vh]">
                                <div className="p-6 pb-2 border-b border-neutral-800">
                                    <h3 className="text-xl font-bold text-white mb-2">{selectedTenant?.shop_name}</h3>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="bg-neutral-800 px-2 py-1 rounded text-neutral-300">{selectedTenant?.slug}</span>
                                        <span className="bg-neutral-800 px-2 py-1 rounded text-neutral-300 capitalize">{selectedTenant?.plan}</span>
                                        <span className="bg-neutral-800 px-2 py-1 rounded text-neutral-300">{selectedTenant?.lifecycle_status}</span>
                                    </div>
                                </div>
                                
                                <div className="p-6 overflow-y-auto space-y-4">
                                    <h4 className="text-sm font-semibold text-neutral-400">Riwayat Follow-up Terbaru</h4>
                                    
                                    {detailLoading ? (
                                        <div className="text-center text-sm text-neutral-500 py-4">Memuat...</div>
                                    ) : detailFollowups.length === 0 ? (
                                        <div className="text-center text-sm text-neutral-500 py-4 bg-neutral-800/30 rounded-lg">Belum ada riwayat</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {detailFollowups.map(df => (
                                                <div key={df.id} className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-800">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="text-xs text-neutral-400">{new Date(df.created_at).toLocaleDateString('id-ID')} - {df.channel}</div>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 uppercase">{df.outcome}</span>
                                                    </div>
                                                    <div className="text-xs text-neutral-300 font-medium mb-1 capitalize border border-neutral-600 inline-block px-1 rounded">{df.case_type.replace('_', ' ')}</div>
                                                    <p className="text-sm text-neutral-200 line-clamp-2 leading-relaxed">{df.message_sent}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 border-t border-neutral-800 bg-neutral-900/80 flex gap-3">
                                    <button onClick={() => setModalMode(null)} className="flex-1 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-800">Tutup</button>
                                    <button onClick={() => router.push(`/superadmin/followups?tenant_id=${selectedTenant?.id}`)} className="flex-1 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium">Lihat Semua</button>
                                    <button onClick={() => setModalMode('send-wa')} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium">Kirim WA Sekarang</button>
                                </div>
                            </div>
                        )}
                        
                    </div>
                </div>
            )}
        </div>
    );
}
