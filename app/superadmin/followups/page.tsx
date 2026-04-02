'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

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

const OUTCOME_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'no_response', label: 'Tidak Respons' },
    { value: 'interested', label: 'Tertarik' },
    { value: 'renewed', label: 'Diperpanjang' },
    { value: 'churned_confirmed', label: 'Konfirmasi Churn' }
];

function FollowupsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [followups, setFollowups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [filterCaseType, setFilterCaseType] = useState('all');
    const [filterOutcome, setFilterOutcome] = useState('all');
    const [filterSearch, setFilterSearch] = useState('');

    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string, isError?: boolean } | null>(null);

    const getToken = () => window.localStorage.getItem('superadmin_token');

    const fetchData = useCallback(async () => {
        const token = getToken();
        if (!token) { router.push('/superadmin/login'); return; }

        setLoading(true);
        try {
            const params = new URLSearchParams();
            const tenantIdParams = searchParams?.get('tenant_id');
            const caseTypeParams = searchParams?.get('case_type');
            const outcomeParams = searchParams?.get('outcome');
            
            if (tenantIdParams) params.append('tenant_id', tenantIdParams);
            if (caseTypeParams) params.append('case_type', caseTypeParams);
            if (outcomeParams) params.append('outcome', outcomeParams);
            
            params.append('limit', '200'); // Higher limit for client-side filtering support

            const res = await fetch(`/api/superadmin/followups?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) { router.push('/superadmin/login'); return; }
            if (!res.ok) throw new Error('Gagal mengambil data follow-up');

            const data = await res.json();
            setFollowups(data.followups || []);
            
            // set initial filters if from url
            if (caseTypeParams && VALID_CASES.includes(caseTypeParams)) setFilterCaseType(caseTypeParams);
            if (outcomeParams) setFilterOutcome(outcomeParams);

        } catch (err: any) {
            setToast({ msg: err.message, isError: true });
        } finally {
            setLoading(false);
        }
    }, [router, searchParams]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleUpdateOutcome = async (id: string, newOutcome: string) => {
        const token = getToken();
        if (!token) return;

        // Optimistic UI Update setup if desired, but we'll wait for server first to be safe
        setUpdatingId(id);
        
        try {
            const res = await fetch(`/api/superadmin/followups/${id}`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ outcome: newOutcome })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Gagal update status');

            // local state update
            setFollowups(prev => prev.map(f => f.id === id ? { ...f, outcome: newOutcome, done_at: data.updated.done_at } : f));
            setToast({ msg: 'Status berhasil diperbarui ✅' });

        } catch (err: any) {
            setToast({ msg: err.message, isError: true });
        } finally {
            setUpdatingId(null);
        }
    };

    const VALID_CASES = ['renewal', 'usage_check', 'churn', 'upgrade_offer', 'custom'];

    const filteredData = followups.filter(f => {
        if (filterCaseType !== 'all' && f.case_type !== filterCaseType) return false;
        if (filterOutcome !== 'all' && f.outcome !== filterOutcome) return false;
        if (filterSearch) {
            const sn = f.shop_name?.toLowerCase() || '';
            const ds = filterSearch.toLowerCase();
            if (!sn.includes(ds)) return false;
        }
        return true;
    });

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}

            {/* HEADER BAR */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-white">Riwayat Follow-up</h1>
                <Link href="/superadmin/pipeline" className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
                    <span>←</span> Pipeline
                </Link>
            </div>

            {/* FILTER BAR */}
            <div className="flex flex-col sm:flex-row gap-4 bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                <input 
                    type="text" 
                    placeholder="Cari nama toko..." 
                    value={filterSearch} 
                    onChange={e => setFilterSearch(e.target.value)}
                    className="flex-1 bg-neutral-900 text-white px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:border-cyan-500 outline-none"
                />
                
                <select value={filterCaseType} onChange={e => setFilterCaseType(e.target.value)} className="flex-1 bg-neutral-900 text-white px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:border-cyan-500 outline-none">
                    <option value="all">Semua Jenis Kasus</option>
                    <option value="renewal">Perpanjangan</option>
                    <option value="usage_check">Cek Penggunaan</option>
                    <option value="churn">Churn</option>
                    <option value="upgrade_offer">Penawaran Upgrade</option>
                    <option value="custom">Lainnya</option>
                </select>

                <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className="flex-1 bg-neutral-900 text-white px-3 py-2 border border-neutral-700 rounded-lg text-sm focus:border-cyan-500 outline-none">
                    <option value="all">Semua Status</option>
                    <option value="pending">Pending</option>
                    <option value="interested">Tertarik</option>
                    <option value="renewed">Diperpanjang</option>
                    <option value="churned_confirmed">Konfirmasi Churn</option>
                    <option value="no_response">Tidak Respons</option>
                </select>
            </div>

            {/* TABLE / EMPTY STATE */}
            {loading ? (
                <div className="text-center py-20 text-neutral-500">Memuat data riwayat follow-up...</div>
            ) : followups.length === 0 ? (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-16 flex flex-col items-center justify-center text-center">
                    <div className="text-5xl mb-4">📋</div>
                    <h3 className="text-lg font-bold text-white mb-2">Belum ada riwayat follow-up.</h3>
                    <p className="text-neutral-400 mb-6 text-sm">Mulai dari halaman Pipeline untuk mencatat follow-up tenant.</p>
                    <Link href="/superadmin/pipeline" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors">
                        Buka Pipeline
                    </Link>
                </div>
            ) : (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-neutral-900 text-neutral-400 border-b border-neutral-800">
                            <tr>
                                <th className="px-4 py-3 font-medium">Toko</th>
                                <th className="px-4 py-3 font-medium">Tanggal</th>
                                <th className="px-4 py-3 font-medium">Kasus</th>
                                <th className="px-4 py-3 font-medium">Saluran</th>
                                <th className="px-4 py-3 font-medium max-w-[200px]">Catatan</th>
                                <th className="px-4 py-3 font-medium">Jadwal</th>
                                <th className="px-4 py-3 font-medium w-48">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-500">Tidak ada riwayat yang sesuai filter.</td></tr>
                            ) : filteredData.map(f => (
                                <tr key={f.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                                    <td className="px-4 py-3">
                                        <Link href={`/superadmin/pipeline?tenant=${f.tenant_id}`} className="font-semibold text-cyan-500 hover:text-cyan-400">
                                            {f.shop_name || 'Toko N/A'}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-neutral-300">
                                        {new Date(f.created_at).toLocaleDateString('id-ID', {
                                            day: '2-digit', month: 'short', year: 'numeric'
                                        })} <br/>
                                        <span className="text-xs text-neutral-500">{new Date(f.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded border ${
                                            f.case_type === 'renewal' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                            f.case_type === 'usage_check' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                                            f.case_type === 'churn' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                            f.case_type === 'upgrade_offer' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                                            'bg-neutral-500/10 border-neutral-500/20 text-neutral-400'
                                        }`}>
                                            {f.case_type.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {f.channel === 'whatsapp' ? '📱 WhatsApp' : 
                                         f.channel === 'phone' ? '📞 Telepon' : 
                                         f.channel === 'email' ? '📧 Email' : 
                                         '📋 Catatan'}
                                    </td>
                                    <td className="px-4 py-3 max-w-[200px]">
                                        <div title={f.note || ''} className="truncate text-neutral-400 cursor-help">
                                            {f.note || <span className="italic text-neutral-600">Kosong</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-neutral-400">
                                        {f.scheduled_at ? new Date(f.scheduled_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <select 
                                                value={f.outcome}
                                                onChange={e => handleUpdateOutcome(f.id, e.target.value)}
                                                disabled={updatingId === f.id}
                                                className={`text-xs px-2 py-1.5 rounded outline-none border focus:border-cyan-500 transition-colors w-full cursor-pointer appearance-none ${
                                                    f.outcome === 'pending' ? 'bg-neutral-800 text-neutral-400 border-neutral-700' :
                                                    f.outcome === 'no_response' ? 'bg-pink-500/10 text-pink-400 border-pink-500/30' :
                                                    f.outcome === 'interested' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                                                    f.outcome === 'renewed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                                    'bg-red-900/30 text-red-400 border-red-500/30'
                                                } ${updatingId === f.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {OUTCOME_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value} className="bg-neutral-800 text-white">
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {updatingId === f.id && <div className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function FollowupsPage() {
    return (
        <Suspense fallback={<div className="text-center py-20 text-neutral-500">Memuat antarmuka...</div>}>
            <FollowupsContent />
        </Suspense>
    );
}
