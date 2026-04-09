'use client'

import React, { useState, useEffect, useRef, useReducer } from 'react'
import { v4 as uuidv4 } from 'uuid'

// ==========================================
// TYPES
// ==========================================
interface Service {
  id: string
  name: string
  price: number
  price_min: number | null
  price_max: number | null
  price_type: 'fixed' | 'range'
  duration_minutes: number
  category: string | null
  is_active: boolean
}

interface CartItem extends Service {
  cart_id: string
  final_price: number
}

interface Receipt {
  timestamp: string
  customerName: string
  barberName: string
  paymentMethod: string
  items: CartItem[]
  total: number
  id: string
}

interface State {
  screen: 'otp-phone' | 'otp-verify' | 'barber-pick' | 'pos'
  phone: string
  token: string | null
  barberName: string
  barberRole: 'barber' | 'cashier' | null
  shopName: string
  
  selectedBarber: { id: string; name: string } | null
  barbers: { id: string; name: string }[]
  
  services: Service[]
  loadingServices: boolean
  
  cart: CartItem[]
  customerName: string
  paymentMethod: 'cash' | 'qris' | 'transfer' | null
  
  isProcessing: boolean
  lastReceipt: Receipt | null
  showConfirmModal: boolean
  
  todayTxCount: number
  todayTotal: number
  itemCount: number
}

// ==========================================
// REDUCER
// ==========================================
type Action =
  | { type: 'SET_PHONE'; payload: string }
  | { type: 'GOTO_OTP' }
  | { type: 'BACK_TO_PHONE' }
  | { type: 'LOGIN_SUCCESS'; payload: { token: string, barberName: string, barberRole: 'barber'|'cashier', shopName: string } }
  | { type: 'LOGOUT' }
  | { type: 'SET_BARBERS'; payload: any[] }
  | { type: 'SET_SELECTED_BARBER'; payload: any }
  | { type: 'SET_SERVICES'; payload: Service[] }
  | { type: 'SET_LOADING_SERVICES'; payload: boolean }
  | { type: 'START_POS' }
  | { type: 'ADD_TO_CART'; payload: CartItem }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_PAYMENT_METHOD'; payload: any }
  | { type: 'SET_CUSTOMER_NAME'; payload: string }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SHOW_CONFIRM_MODAL'; payload: boolean }
  | { type: 'CHECKOUT_SUCCESS'; payload: Receipt }
  | { type: 'SET_TODAY_STATS'; payload: { count: number, total: number, items: number } }
  | { type: 'NEW_TRANSACTION' }
  | { type: 'CHANGE_BARBER' }

const initialState: State = {
  screen: 'otp-phone',
  phone: '',
  token: null,
  barberName: '',
  barberRole: null,
  shopName: '',
  selectedBarber: null,
  barbers: [],
  services: [],
  loadingServices: false,
  cart: [],
  customerName: '',
  paymentMethod: null,
  isProcessing: false,
  lastReceipt: null,
  showConfirmModal: false,
  todayTxCount: 0,
  todayTotal: 0,
  itemCount: 0
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PHONE': return { ...state, phone: action.payload }
    case 'GOTO_OTP': return { ...state, screen: 'otp-verify' }
    case 'BACK_TO_PHONE': return { ...state, screen: 'otp-phone', phone: '' }
    case 'LOGIN_SUCCESS':
      if (typeof window !== 'undefined') {
        localStorage.setItem('pos_token', action.payload.token)
        localStorage.setItem('pos_barberName', action.payload.barberName)
        localStorage.setItem('pos_barberRole', action.payload.barberRole)
        localStorage.setItem('pos_shopName', action.payload.shopName)
      }
      return { 
        ...state, 
        token: action.payload.token, 
        barberName: action.payload.barberName, 
        barberRole: action.payload.barberRole, 
        shopName: action.payload.shopName,
        screen: 'pos'
      }
    case 'LOGOUT':
      if (typeof window !== 'undefined') {
        localStorage.removeItem('pos_token')
        localStorage.removeItem('pos_barberName')
        localStorage.removeItem('pos_barberRole')
        localStorage.removeItem('pos_shopName')
      }
      return initialState
    case 'SET_BARBERS': return { ...state, barbers: action.payload }
    case 'SET_SELECTED_BARBER': return { ...state, selectedBarber: action.payload }
    case 'SET_SERVICES': return { ...state, services: action.payload, loadingServices: false }
    case 'SET_LOADING_SERVICES': return { ...state, loadingServices: action.payload }
    case 'START_POS': return { ...state, screen: 'pos' }
    case 'ADD_TO_CART': return { ...state, cart: [...state.cart, action.payload] }
    case 'REMOVE_FROM_CART': return { ...state, cart: state.cart.filter(item => item.cart_id !== action.payload) }
    case 'CLEAR_CART': return { ...state, cart: [], customerName: '', paymentMethod: null, showConfirmModal: false }
    case 'SET_PAYMENT_METHOD': return { ...state, paymentMethod: action.payload }
    case 'SET_CUSTOMER_NAME': return { ...state, customerName: action.payload }
    case 'SET_PROCESSING': return { ...state, isProcessing: action.payload }
    case 'SHOW_CONFIRM_MODAL': return { ...state, showConfirmModal: action.payload }
    case 'CHECKOUT_SUCCESS': return { ...state, lastReceipt: action.payload, isProcessing: false, showConfirmModal: false, cart: [], paymentMethod: null, customerName: '', selectedBarber: state.barberRole === 'cashier' ? null : state.selectedBarber }
    case 'NEW_TRANSACTION': return { ...state, lastReceipt: null, screen: 'pos' }
    case 'CHANGE_BARBER': return { ...state, selectedBarber: null }
    case 'SET_TODAY_STATS': return { ...state, todayTxCount: action.payload.count, todayTotal: action.payload.total, itemCount: action.payload.items }
    default: return state
  }
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function PosPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isDarkMode, setIsDarkMode] = useState(true)

  // API Helpers
  const fetchWithToken = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'application/json' }
    })
  }

  const loadTodayStats = async () => {
    try {
      const res = await fetchWithToken('/api/pos/today')
      if (res.ok) {
        const data = await res.json()
        dispatch({ type: 'SET_TODAY_STATS', payload: { count: data.tx_count, total: data.total_omset, items: data.item_count } })
      }
    } catch {}
  }

  const loadData = async () => {
    if (state.screen === 'pos') {
      if (state.barberRole === 'cashier') {
        const bRes = await fetchWithToken('/api/pos/barbers')
        if (bRes.ok) {
          const data = await bRes.json()
          dispatch({ type: 'SET_BARBERS', payload: data.barbers })
        }
      }
      
      dispatch({ type: 'SET_LOADING_SERVICES', payload: true })
      const res = await fetchWithToken('/api/pos/services')
      if (res.status === 401) {
        dispatch({ type: 'LOGOUT' })
        return
      }
      if (res.ok) {
        const data = await res.json()
        dispatch({ type: 'SET_SERVICES', payload: data.services })
      }
      loadTodayStats()
    }
  }

  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
    if (savedToken && !state.token) {
      dispatch({ type: 'LOGIN_SUCCESS', payload: {
         token: savedToken,
         barberName: localStorage.getItem('pos_barberName') || '',
         barberRole: localStorage.getItem('pos_barberRole') as any,
         shopName: localStorage.getItem('pos_shopName') || ''
      }})
    } else if (state.token) {
      loadData()
    }
  }, [state.token, state.screen])

  // Screen Renders
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0f0f0f] text-white' : 'bg-[#f5f5f3] text-gray-900'} font-sans transition-colors duration-200`}>
      {state.screen === 'otp-phone' && <PhoneScreen dispatch={dispatch} />}
      {state.screen === 'otp-verify' && <VerifyScreen state={state} dispatch={dispatch} />}
      {state.screen === 'pos' && !state.lastReceipt && <MainPosScreen state={state} dispatch={dispatch} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} fetchWithToken={fetchWithToken} loadTodayStats={loadTodayStats} />}
      {state.showConfirmModal && <ConfirmModal state={state} dispatch={dispatch} isDarkMode={isDarkMode} fetchWithToken={fetchWithToken} loadTodayStats={loadTodayStats} />}
      {state.lastReceipt && <ReceiptModal receipt={state.lastReceipt} dispatch={dispatch} isDarkMode={isDarkMode} />}
    </div>
  )
}

// ==========================================
// PHONE SCREEN
// ==========================================
function PhoneScreen({ dispatch }: any) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePhone = (e: any) => {
    const val = e.target.value.replace(/\D/g, '')
    setPhone(val)
  }

  const submit = async (e: any) => {
    e.preventDefault()
    if (phone.length < 10) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pos/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      dispatch({ type: 'SET_PHONE', payload: phone })
      dispatch({ type: 'GOTO_OTP' })
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm rounded-[24px] bg-[#161616] p-8 shadow-2xl text-center border border-white/5">
        <h1 className="text-2xl font-bold mb-2 text-white/90">Masuk Kasir</h1>
        <p className="text-sm text-gray-400 mb-8">Masukkan nomor WhatsApp yang terdaftar sebagai barber</p>
        
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input
            type="tel"
            value={phone}
            onChange={handlePhone}
            placeholder="0812..."
            className="w-full h-14 bg-black/40 border border-white/10 rounded-xl px-4 text-center text-xl text-white outline-none focus:border-teal-400 transition-colors"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button 
            type="submit" 
            disabled={phone.length < 10 || loading}
            className="h-14 mt-4 w-full bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? 'Mengirim...' : 'Kirim Kode OTP'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ==========================================
// OTP SCREEN
// ==========================================
function VerifyScreen({ state, dispatch }: any) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(60)
  const inputs = useRef<any[]>([])

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  const handleChange = (e: any, index: number) => {
    const val = e.target.value.replace(/\D/g, '')
    if (!val) return
    const newOtp = [...otp]
    newOtp[index] = val[val.length - 1]
    setOtp(newOtp)
    if (index < 5) inputs.current[index + 1].focus()
  }

  const handleKeyDown = (e: any, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1].focus()
    } else if (e.key === 'Backspace') {
      const newOtp = [...otp]
      newOtp[index] = ''
      setOtp(newOtp)
    }
  }

  const submit = async () => {
    const code = otp.join('')
    if (code.length < 6) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pos/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: state.phone, otp: code })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      dispatch({ type: 'LOGIN_SUCCESS', payload: data })
    } catch (err: any) {
      setError(err.message || 'OTP Salah')
      setOtp(['', '', '', '', '', ''])
      inputs.current[0].focus()
      // animation fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (otp.join('').length === 6) {
      submit()
    }
  }, [otp])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm rounded-[24px] bg-[#161616] p-8 shadow-2xl text-center border border-white/5">
        <h1 className="text-2xl font-bold mb-2 text-white/90">Verifikasi</h1>
        <p className="text-sm text-gray-400 mb-8">Kode 6 digit dikirim ke WhatsApp</p>
        
        <div className="flex gap-2 justify-center mb-4">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              type="tel"
              maxLength={1}
              value={d}
              onChange={e => handleChange(e, i)}
              onKeyDown={e => handleKeyDown(e, i)}
              className="w-12 h-14 bg-black/40 border border-white/10 rounded-xl text-center text-xl text-white outline-none focus:border-teal-400 transition-colors"
            />
          ))}
        </div>
        
        {error && <p className="text-red-400 text-sm mb-4 animate-bounce">{error}</p>}
        
        <button 
          onClick={submit}
          disabled={otp.join('').length < 6 || loading}
          className="h-14 w-full bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl transition-all disabled:opacity-50 mb-4"
        >
          {loading ? 'Memverifikasi...' : 'Verifikasi'}
        </button>

        <div className="flex justify-between items-center text-sm">
          <button onClick={() => dispatch({type: 'BACK_TO_PHONE'})} className="text-gray-400 hover:text-white">← Ganti nomor</button>
          <span className="text-gray-500">{countdown > 0 ? `Kirim ulang (${countdown}s)` : <button className="text-teal-400" onClick={() => setCountdown(60)}>Kirim ulang</button>}</span>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// BARBER PICK SCREEN (Cashier only)
// ==========================================
function BarberPickScreen({ state, dispatch }: any) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-lg rounded-[24px] bg-[#161616] p-8 shadow-2xl border border-white/5">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white/90">Pilih Barber</h1>
            <p className="text-sm text-gray-400">Siapa yang mengerjakan pelanggan ini?</p>
          </div>
          <button onClick={() => dispatch({type: 'LOGOUT'})} className="text-sm bg-white/10 px-3 py-1 rounded-full text-white/70 hover:bg-white/20">Keluar</button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {state.barbers.map((b: any) => (
            <button
              key={b.id}
              onClick={() => { dispatch({ type: 'SET_SELECTED_BARBER', payload: b }); dispatch({ type: 'START_POS' }) }}
              className="flex items-center gap-3 p-4 bg-black/40 border border-white/10 rounded-2xl hover:border-teal-500 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold uppercase">
                {b.name.charAt(0)}
              </div>
              <span className="font-semibold">{b.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ==========================================
// MAIN POS SCREEN
// ==========================================
function MainPosScreen({ state, dispatch, isDarkMode, setIsDarkMode, fetchWithToken, loadTodayStats }: any) {
  const [filter, setFilter] = useState('Semua')
  const [search, setSearch] = useState('')
  const [rangeModal, setRangeModal] = useState<Service | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)

  // ── Pending Online Bookings State ────────────────────────────
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingList, setPendingList] = useState<any[]>([])
  const [showPendingDrawer, setShowPendingDrawer] = useState(false)

  // ── Expense State ────────────────────────────
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseForm, setExpenseForm] = useState<{
    category: string
    description: string
    amount: string
    receipt: File | null
  }>({ category: '', description: '', amount: '', receipt: null })
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)

  const [completingId, setCompletingId] = useState<string | null>(null)
  const [pendingPayModal, setPendingPayModal] = useState<string | null>(null) // booking id
  const [toast, setToast] = useState<string | null>(null)

  const fetchPendingBookings = async () => {
    try {
      const res = await fetchWithToken('/api/pos/pending-bookings')
      if (res.ok) {
        const d = await res.json()
        setPendingCount(d.pending_count ?? 0)
        setPendingList(d.bookings ?? [])
      }
    } catch {}
  }

  // Fetch saat screen POS aktif, lalu polling setiap 30 detik
  useEffect(() => {
    fetchPendingBookings()
    const interval = setInterval(fetchPendingBookings, 30_000)
    return () => clearInterval(interval)
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleCompleteBooking = async (bookingId: string, payMethod: string) => {
    setCompletingId(bookingId)
    try {
      const res = await fetchWithToken(`/api/pos/pending-bookings/${bookingId}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_method: payMethod })
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Gagal')
      }
      // Update lokal
      const newList = pendingList.filter(b => b.id !== bookingId)
      setPendingList(newList)
      setPendingCount(newList.length)
      setPendingPayModal(null)
      showToast('✅ Booking berhasil diselesaikan!')
      if (newList.length === 0) setShowPendingDrawer(false)
      loadTodayStats()
    } catch (err: any) {
      showToast('❌ ' + (err.message || 'Gagal menyelesaikan booking'))
    } finally {
      setCompletingId(null)
    }
  }
  
  async function handleSubmitExpense() {
    setIsSubmittingExpense(true)

    const formData = new FormData()
    formData.append('category', expenseForm.category)
    formData.append('description', expenseForm.description)
    formData.append('amount', expenseForm.amount)
    if (expenseForm.receipt) {
      formData.append('receipt', expenseForm.receipt)
    }

    const res = await fetch('/api/pos/expenses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: formData,
    })

    setIsSubmittingExpense(false)

    if (!res.ok) {
      const d = await res.json()
      alert(d.error ?? 'Gagal mengajukan')
      return
    }

    setShowExpenseModal(false)
    setExpenseForm({
      category: '', description: '',
      amount: '', receipt: null
    })
    alert('✅ Pengeluaran diajukan ke owner!')
  }

  
  const cats = ['Semua', ...Array.from(new Set(state.services.map((s:any) => s.service_type === 'pos_kasir' ? 'POS' : (s.service_type || 'Umum'))))]
  
  const filtered = state.services.filter((s:any) => {
    const sType = s.service_type === 'pos_kasir' ? 'POS' : (s.service_type || 'Umum')
    if (filter !== 'Semua' && sType !== filter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const cartTotal = state.cart.reduce((sum: number, itm: CartItem) => sum + itm.final_price, 0)
  
  const onServiceTap = (srv: Service) => {
    if (srv.price_type === 'range') setRangeModal(srv)
    else dispatch({ type: 'ADD_TO_CART', payload: { ...srv, cart_id: uuidv4(), final_price: srv.price } })
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      {/* LEFT PANEL: SERVICES */}
      <div className={`flex-1 flex flex-col ${isDarkMode ? 'bg-[#0f0f0f]' : 'bg-[#f5f5f3]'} overflow-hidden`}>
        {/* Header */}
        <header className={`p-4 md:p-6 flex justify-between items-center border-b ${isDarkMode ? 'border-white/5' : 'border-black/5'} sticky top-0 z-10 backdrop-blur-md`}>
          <div>
            <h1 className="text-xl md:text-2xl font-bold truncate">{state.shopName} POS</h1>
            <div className="flex gap-4 text-xs md:text-sm mt-1 opacity-60">
              <span>HARI INI: {state.todayTxCount} Tx</span>
              <span>•</span>
              <span className="font-mono text-teal-500">Rp {state.todayTotal.toLocaleString('id-ID')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex flex-col text-right mr-2">
              <span className="font-bold text-sm">{state.barberName}</span>
              <span className="text-[10px] uppercase text-teal-500">{state.barberRole}</span>
            </div>
            <button
              onClick={() => setShowExpenseModal(true)}
              title="Catat Pengeluaran"
              style={{
                background: 'transparent',
                border:     '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding:    '6px 12px',
                color:      isDarkMode ? '#9ca3af' : '#4b5563',
                fontSize:   '13px',
                cursor:     'pointer',
              }}
            >
              💸 Pengeluaran
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              {isDarkMode ? '⛅' : '🌙'}
            </button>
            <button onClick={() => dispatch({type: 'LOGOUT'})} className="p-2 rounded-full hover:bg-white/10 transition-colors text-red-400">
              Log out
            </button>
          </div>
        </header>

        {/* ── PENDING BOOKINGS ALERT BANNER ─────────────────────────────
            Muncul hanya jika pendingCount > 0. Tidak ada tombol Close/X.
            Banner hanya hilang saat semua booking sudah diselesaikan.
        ──────────────────────────────────────────────────────────────── */}
        {pendingCount > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #92400e, #78350f)',
            color: '#fff',
            padding: '12px 16px',
            margin: '0 16px 12px 16px',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 15px rgba(146,64,14,0.4)',
            border: '1px solid rgba(251,191,36,0.3)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span>{pendingCount} Booking Online hari ini belum diselesaikan!</span>
            </div>
            <button
              onClick={() => setShowPendingDrawer(true)}
              style={{
                background: 'rgba(251,191,36,0.25)',
                border: '1px solid rgba(251,191,36,0.5)',
                borderRadius: 8,
                color: '#fef3c7',
                padding: '6px 12px',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Lihat ({pendingCount})
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 hide-scrollbar flex flex-col">
          {state.barberRole === 'cashier' && (
            <div className="relative mb-6 z-10 w-full shrink-0">
               <select 
                 value={state.selectedBarber?.id || ''}
                 onChange={e => {
                   const b = state.barbers.find((x:any) => x.id === e.target.value);
                   dispatch({type: 'SET_SELECTED_BARBER', payload: b});
                 }}
                 className={`w-full h-14 pl-4 pr-10 rounded-xl text-md outline-none transition-colors appearance-none font-bold ${isDarkMode ? 'bg-teal-500/10 border border-teal-500/20 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 text-teal-400' : 'bg-teal-50 border border-teal-200 focus:border-teal-500 text-teal-800'}`}
               >
                 <option value="" disabled>PILIH KAPSTER / BARBER...</option>
                 {state.barbers.map((b:any) => (
                   <option key={b.id} value={b.id}>✂️ {b.name}</option>
                 ))}
               </select>
               <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-teal-500 text-xl">▼</span>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 mb-6 shrink-0">
            <input 
              placeholder="Cari Layanan..." 
              value={search} onChange={e=>setSearch(e.target.value)}
              className={`flex-1 h-12 rounded-xl px-4 outline-none transition-all ${isDarkMode ? 'bg-[#1a1a1a] border border-white/10 focus:border-teal-400' : 'bg-white border border-gray-200 focus:border-teal-500 shadow-sm'}`}
            />
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {cats.map((c: any) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-4 h-12 rounded-xl whitespace-nowrap font-medium transition-all ${filter === c ? 'bg-teal-500 text-black' : isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-white shadow-sm border border-gray-100 hover:border-teal-500/30'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {!state.loadingServices && filtered.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30">
              <span className="text-4xl mb-4">🔍</span>
              <p>Layanan tidak ditemukan</p>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-0">
            {filtered.map((s: any) => {
              const countInCart = state.cart.filter((c:any) => c.id === s.id).length
              return (
                <button 
                  key={s.id}
                  onClick={() => onServiceTap(s)}
                  className={`relative flex flex-col justify-between text-left p-4 rounded-xl min-h-[100px] transition-all transform hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-[#1a1a1a] border border-white/5 hover:border-teal-500/50' : 'bg-white border border-gray-100 shadow-sm hover:border-teal-500/50 hover:shadow-teal-500/10'}`}
                >
                  {countInCart > 0 && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-teal-500 text-black rounded-full flex items-center justify-center text-xs font-bold shadow-md z-10">
                      {countInCart}
                    </div>
                  )}
                  <div className="font-semibold text-sm leading-tight mb-2 pr-4">{s.name}</div>
                  <div className={`font-bold font-mono text-xs md:text-sm ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}>
                    {s.price_type === 'fixed' ? `Rp ${s.price.toLocaleString('id-ID')}` : `Rp ${s.price_min?.toLocaleString('id-ID')} - ${s.price_max?.toLocaleString('id-ID')}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: CART */}
      <div className={`w-full md:w-[400px] shrink-0 flex flex-col border-l shadow-2xl z-40 transition-transform duration-300 md:translate-y-0 ${isDarkMode ? 'bg-[#161616] border-white/5' : 'bg-gray-50 border-black/5'} 
        ${isCartOpen ? 'h-[85vh] md:h-screen fixed bottom-0 left-0 rounded-t-3xl md:rounded-none md:relative translate-y-0' : 'h-screen fixed md:relative bottom-0 left-0 translate-y-full hidden md:flex'}
      `}>
        {/* Cart Header */}
        <div className={`p-4 border-b flex justify-between items-center ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg">Keranjang</h2>
            <span className="bg-teal-500/20 text-teal-500 text-xs px-2 py-0.5 rounded-full font-bold">{state.cart.length}</span>
          </div>
          <div className="flex items-center gap-4">
            {state.cart.length > 0 && <button onClick={() => dispatch({type: 'CLEAR_CART'})} className="text-sm text-red-400 hover:text-red-300">Kosongkan</button>}
            <button onClick={() => setIsCartOpen(false)} className="md:hidden text-gray-400 p-2 -mr-2 text-xl font-bold">✕</button>
          </div>
        </div>

        {/* Customer Detail */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-white/5' : 'border-black/5'} shrink-0  mt-2 mb-2`}>
          <div className="relative">
            <input 
              placeholder="Nama Pelanggan (Opsional)" 
              value={state.customerName} onChange={e=>dispatch({type:'SET_CUSTOMER_NAME', payload:e.target.value})}
              className={`w-full h-11 px-4 pr-16 rounded-xl text-sm outline-none transition-colors ${isDarkMode ? 'bg-black/30 border border-white/10 focus:border-teal-400' : 'bg-white border border-gray-200 focus:border-teal-500'}`}
            />
            <button onClick={()=>dispatch({type:'SET_CUSTOMER_NAME', payload:'Tamu'})} className="absolute right-1 top-1.5 px-3 py-1.5 text-xs bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg cursor-pointer hover:bg-teal-500/20">👤 Tamu</button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 hide-scrollbar">
          {state.cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30">
              <div className="text-4xl mb-4">🛒</div>
              <p>Keranjang masih kosong</p>
            </div>
          ) : (
            state.cart.map((item: CartItem) => (
              <div key={item.cart_id} className={`flex justify-between items-center p-3 rounded-xl border animate-slide-in ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-white shadow-sm border-transparent'}`}>
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-semibold text-sm truncate">{item.name}</div>
                  <div className="font-mono text-xs opacity-70">Rp {item.final_price.toLocaleString('id-ID')}</div>
                </div>
                <button onClick={() => dispatch({type: 'REMOVE_FROM_CART', payload: item.cart_id})} className="w-8 h-8 flex items-center justify-center text-red-400 bg-red-400/10 rounded-lg hover:bg-red-400/20 shrink-0">✕</button>
              </div>
            ))
          )}
        </div>

        {/* Checkout Footer */}
        <div className={`p-4 border-t flex flex-col gap-4 bg-gradient-to-t ${isDarkMode ? 'border-white/5 from-[#161616] to-[#161616]/90' : 'border-black/5 from-gray-50 to-white'}`}>
          <div className="flex justify-between items-end">
            <span className="text-sm font-medium opacity-60 uppercase tracking-wider">Total</span>
            <span className="text-3xl font-extrabold tabular-nums tracking-tight">Rp {cartTotal.toLocaleString('id-ID')}</span>
          </div>
          
          <div className="flex gap-2">
            {['cash', 'qris', 'transfer'].map(method => (
              <button 
                key={method}
                onClick={() => dispatch({type: 'SET_PAYMENT_METHOD', payload: method})}
                className={`flex-1 h-12 rounded-xl font-bold uppercase text-xs tracking-wider transition-all border flex flex-col items-center justify-center gap-1 leading-none ${state.paymentMethod === method ? 'bg-teal-500 text-black border-teal-500 shadow-[0_0_15px_rgba(45,212,191,0.3)]' : isDarkMode ? 'border-white/10 hover:border-white/30 text-white/70' : 'border-gray-200 bg-white hover:border-gray-400'}`}
              >
                <span>{method === 'cash' ? '💵' : method === 'qris' ? '📱' : '🏦'}</span>
                <span>{method === 'cash' ? 'Tunai' : method === 'qris' ? 'QRIS' : 'Trf'}</span>
              </button>
            ))}
          </div>

          <button 
            disabled={state.cart.length === 0 || !state.paymentMethod || state.isProcessing || (state.barberRole === 'cashier' && !state.selectedBarber)}
            onClick={() => dispatch({type: 'SHOW_CONFIRM_MODAL', payload: true})}
            className="w-full h-14 bg-teal-500 hover:bg-teal-400 text-black text-lg font-extrabold rounded-xl transition-all disabled:opacity-30 disabled:scale-100 active:scale-95 shadow-[0_4px_14px_0_rgba(45,212,191,0.39)] uppercase tracking-wide flex justify-center items-center"
          >
            SIMPAN & PROSES BAYAR
          </button>
        </div>
      </div>

      {/* FLOATING MOBILE CART BUTTON */}
      {!isCartOpen && state.cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:hidden z-30 animate-slide-up-fast">
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full h-14 bg-teal-500 hover:bg-teal-400 text-black text-lg font-extrabold rounded-2xl shadow-2xl shadow-teal-500/30 flex justify-between items-center px-6 transition-all active:scale-95"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">🛒</span>
              <span>{state.cart.length} Item</span>
            </div>
            <span className="font-mono">Rp {cartTotal.toLocaleString('id-ID')}</span>
          </button>
        </div>
      )}

      {rangeModal && <RangePriceModal srv={rangeModal} onClose={()=>setRangeModal(null)} dispatch={dispatch} isDarkMode={isDarkMode} />}

      {/* ── TOAST NOTIFICATION ────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: '#fff', padding: '12px 20px', borderRadius: 12,
          fontWeight: 600, fontSize: 14, zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      {/* ── PENDING BOOKINGS DRAWER ───────────────────────────────── */}
      {showPendingDrawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex' }}>
          {/* Overlay */}
          <div
            style={{ flex: 1, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => { setShowPendingDrawer(false); setPendingPayModal(null) }}
          />
          {/* Drawer Panel */}
          <div style={{
            width: '100%', maxWidth: 420, background: '#161616',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            overflowY: 'auto',
          }}>
            {/* Drawer Header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>📋 Booking Online Hari Ini</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>Tap "Selesaikan" untuk konfirmasi pembayaran</p>
              </div>
              <button onClick={() => { setShowPendingDrawer(false); setPendingPayModal(null) }} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            {/* Booking List */}
            <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <p>Semua booking sudah diselesaikan!</p>
                </div>
              ) : pendingList.map((booking: any) => {
                const time = new Date(booking.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                const isCompleting = completingId === booking.id
                const showPay = pendingPayModal === booking.id
                return (
                  <div key={booking.id} style={{ background: '#1e1e1e', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {booking.customer}</p>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 2px' }}>✂️ {booking.barber} · {booking.service}</p>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>🕐 Jam {time}</p>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: booking.status === 'confirmed' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                        color: booking.status === 'confirmed' ? '#4ade80' : '#facc15',
                        border: booking.status === 'confirmed' ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(250,204,21,0.3)',
                        flexShrink: 0, marginLeft: 8,
                      }}>
                        {booking.status === 'confirmed' ? '🟢 Konfirmasi' : '🟡 Menunggu'}
                      </span>
                    </div>

                    {showPay ? (
                      // Mini payment method selector
                      <div>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Pilih metode pembayaran:</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[{k:'cash',l:'💵 Tunai'},{k:'qris',l:'📱 QRIS'},{k:'transfer',l:'🏦 Transfer'}].map(m => (
                            <button
                              key={m.k}
                              disabled={isCompleting}
                              onClick={() => handleCompleteBooking(booking.id, m.k)}
                              style={{
                                flex: 1, padding: '8px 4px', borderRadius: 8, border: '1px solid rgba(20,184,166,0.4)',
                                background: 'rgba(20,184,166,0.1)', color: '#2dd4bf', fontWeight: 600, fontSize: 12,
                                cursor: isCompleting ? 'not-allowed' : 'pointer', opacity: isCompleting ? 0.5 : 1,
                              }}
                            >
                              {isCompleting ? '⏳' : m.l}
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setPendingPayModal(null)} style={{ marginTop: 8, width: '100%', padding: '6px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 12 }}>Batal</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingPayModal(booking.id)}
                        style={{
                          width: '100%', padding: '10px', borderRadius: 8,
                          background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)',
                          color: '#2dd4bf', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        ✅ Selesaikan
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowExpenseModal(false)}>
          <div className={`w-full max-w-sm rounded-[24px] p-6 shadow-2xl border animate-slide-up-fast ${isDarkMode ? 'bg-[#1a1a1a] border-white/5 text-white' : 'bg-white border-black/5 text-black'}`} onClick={e => e.stopPropagation()}>
            <div className="mb-5">
              <h3 className="text-xl font-bold">💸 Catat Pengeluaran</h3>
              <p className={`text-[13px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Diajukan ke owner untuk disetujui</p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-bold opacity-70 mb-1">Kategori</label>
                <select
                  value={expenseForm.category}
                  onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                  className={`w-full h-12 px-4 rounded-xl text-md outline-none transition-colors border ${isDarkMode ? 'bg-black/50 border-white/10 focus:border-teal-500 text-white' : 'bg-gray-50 border-gray-200 focus:border-teal-500 text-black'}`}
                >
                  <option value="">Pilih kategori...</option>
                  <option value="supplies">🧴 Produk/Alat</option>
                  <option value="utility">💡 Utilitas</option>
                  <option value="other">🔧 Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold opacity-70 mb-1">Keterangan</label>
                <input
                  type="text"
                  placeholder="Contoh: Beli pomade Murray's"
                  value={expenseForm.description}
                  onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                  className={`w-full h-12 px-4 rounded-xl text-md outline-none transition-colors border ${isDarkMode ? 'bg-black/50 border-white/10 focus:border-teal-500 text-white placeholder-white/30' : 'bg-gray-50 border-gray-200 focus:border-teal-500 text-black placeholder-black/30'}`}
                />
              </div>

              <div>
                <label className="block text-sm font-bold opacity-70 mb-1">Nominal (Rp)</label>
                <input
                  type="tel"
                  placeholder="150000"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))}
                  className={`w-full h-12 px-4 rounded-xl text-md outline-none transition-colors border ${isDarkMode ? 'bg-black/50 border-white/10 focus:border-teal-500 text-white placeholder-white/30' : 'bg-gray-50 border-gray-200 focus:border-teal-500 text-black placeholder-black/30'}`}
                />
                {expenseForm.amount && (
                  <small className="text-teal-400 mt-1 block font-bold">
                    {'Rp ' + parseInt(expenseForm.amount || '0').toLocaleString('id-ID')}
                  </small>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold opacity-70 mb-1">Foto Struk <span className="font-normal opacity-60">(opsional)</span></label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setExpenseForm(f => ({ ...f, receipt: e.target.files?.[0] ?? null }))}
                  className={`w-full text-sm ${isDarkMode ? 'file:bg-white/10 file:text-white' : 'file:bg-black/10 file:text-black'} file:border-0 file:rounded-lg file:px-4 file:py-2 file:cursor-pointer file:font-semibold hover:file:opacity-80 transition-opacity`}
                />
              </div>

              <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className={`flex-1 h-12 rounded-xl font-bold transition-all border ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-white/80' : 'border-gray-200 hover:bg-gray-50 text-gray-800'}`}
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmitExpense}
                  disabled={!expenseForm.category || !expenseForm.description || !expenseForm.amount || isSubmittingExpense}
                  className="flex-[2] h-12 bg-teal-500 hover:bg-teal-400 text-black font-extrabold rounded-xl shadow-[0_4px_14px_0_rgba(45,212,191,0.39)] uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSubmittingExpense ? '⏳...' : '✅ Ajukan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ==========================================
// RANGE MODAL
// ==========================================
function RangePriceModal({ srv, onClose, dispatch, isDarkMode }: any) {
  const min = srv.price_min || 0
  const max = srv.price_max || 0
  const mid = Math.round((min + max) / 2)
  const [val, setVal] = useState(min.toString())

  const add = () => {
    let num = parseInt(val.replace(/\D/g, ''), 10) || min
    if (num < min) num = min
    if (num > max) num = max
    dispatch({ type: 'ADD_TO_CART', payload: { ...srv, cart_id: uuidv4(), final_price: num } })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border ${isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-black/5'} transform scale-100 transition-all`}>
        <h3 className="text-xl font-bold mb-1">{srv.name}</h3>
        <p className="text-sm opacity-60 font-mono mb-6">Rp {min.toLocaleString()} - Rp {max.toLocaleString()}</p>
        
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVal(min.toString())} className={`flex-1 py-2 rounded-lg text-sm border ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>Min</button>
          <button onClick={() => setVal(mid.toString())} className={`flex-1 py-2 rounded-lg text-sm border ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>Tengah</button>
          <button onClick={() => setVal(max.toString())} className={`flex-1 py-2 rounded-lg text-sm border ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>Maks</button>
        </div>

        <div className="relative mb-6">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono opacity-50">Rp</span>
          <input 
            type="tel"
            value={val}
            onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))}
            className={`w-full h-14 pl-12 pr-4 rounded-xl font-mono text-xl outline-none ${isDarkMode ? 'bg-black/40 border border-white/10 focus:border-teal-400' : 'bg-gray-50 border border-gray-200 focus:border-teal-500'}`}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className={`flex-1 h-12 rounded-xl font-bold ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>Batal</button>
          <button onClick={add} className="flex-1 h-12 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl shadow-lg shadow-teal-500/20">Tambah</button>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// CONFIRMATION MODAL (Lapis 2 Telegram Equivalent)
// ==========================================
function ConfirmModal({ state, dispatch, isDarkMode, fetchWithToken, loadTodayStats }: any) {
  const cartTotal = state.cart.reduce((sum: number, itm: CartItem) => sum + itm.final_price, 0)
  const barberName = state.barberRole === 'cashier' && state.selectedBarber ? state.selectedBarber.name : state.barberName

  const processTransaction = async () => {
    dispatch({ type: 'SET_PROCESSING', payload: true })
    
    const barber_id = state.barberRole === 'cashier' && state.selectedBarber ? state.selectedBarber.id : null
    
    const payload = {
      items: state.cart.map((c: any) => ({ service_id: c.id, service_name: c.name, final_price: c.final_price })),
      customer_name: state.customerName,
      payment_method: state.paymentMethod,
      booking_group_id: uuidv4(),
      barber_id: barber_id
    }

    try {
      const res = await fetchWithToken('/api/pos/checkout', { method: 'POST', body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan transaksi')
      
      const receiptId = (data.booking_group_id || payload.booking_group_id).split('-')[0].toUpperCase()
      
      dispatch({ type: 'CHECKOUT_SUCCESS', payload: {
        timestamp: data.timestamp || new Date().toISOString(),
        customerName: state.customerName || 'Pelanggan Umum',
        barberName: barberName,
        paymentMethod: state.paymentMethod,
        items: state.cart,
        total: cartTotal,
        id: receiptId
      }})
      loadTodayStats()
    } catch (err: any) {
      alert(err.message)
      dispatch({ type: 'SET_PROCESSING', payload: false })
      dispatch({ type: 'SHOW_CONFIRM_MODAL', payload: false })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center z-50 animate-fade-in p-4">
      <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl border animate-slide-up-fast ${isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-black/5'} `}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-500/20 text-teal-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-teal-500/30">
            📋
          </div>
          <h2 className="text-2xl font-bold">Konfirmasi Transaksi</h2>
          <p className="text-sm opacity-60">Mohon periksa kembali detail pesanan ini</p>
        </div>

        <div className={`p-4 rounded-xl space-y-3 mb-6 ${isDarkMode ? 'bg-black/50 border border-white/5' : 'bg-gray-50 border border-gray-200'}`}>
          <div className="flex justify-between items-center text-sm">
            <span className="opacity-70">Pelanggan</span>
            <span className="font-semibold">{state.customerName || 'Tamu / Pelanggan Umum'}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="opacity-70">Ditangani Oleh</span>
            <span className="font-semibold">{barberName}</span>
          </div>
          <div className="flex justify-between items-center text-sm mb-2 border-b border-white/10 pb-2">
            <span className="opacity-70">Metode Pembayaran</span>
            <span className="font-semibold px-2 py-1 bg-teal-500/20 text-teal-400 rounded uppercase text-xs">
              {state.paymentMethod === 'cash' ? 'Tunai' : state.paymentMethod === 'qris' ? 'QRIS' : 'Transfer'}
            </span>
          </div>
          
          <div className="space-y-1">
            <span className="text-xs opacity-70 mb-1 block">Layanan:</span>
             {state.cart.map((itm: CartItem, idx: number) => (
               <div key={idx} className="flex justify-between items-center text-sm">
                 <span className="truncate pr-2">- {itm.name}</span>
                 <span className="font-mono opacity-80 shrink-0">Rp {itm.final_price.toLocaleString('id-ID')}</span>
               </div>
             ))}
          </div>

          <div className="border-t border-white/10 pt-3 mt-3 flex justify-between items-center">
            <span className="font-bold">TOTAL</span>
            <span className="text-xl font-bold text-teal-400">Rp {cartTotal.toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button 
            disabled={state.isProcessing}
            onClick={() => dispatch({type: 'SHOW_CONFIRM_MODAL', payload: false})}
            className={`flex-1 h-14 rounded-xl font-bold uppercase tracking-wider transition-all border ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            ← Batal
          </button>
          <button 
            disabled={state.isProcessing}
            onClick={processTransaction}
            className="flex-[2] h-14 bg-teal-500 hover:bg-teal-400 text-black font-extrabold rounded-xl shadow-[0_4px_14px_0_rgba(45,212,191,0.39)] uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {state.isProcessing ? (
               <><span className="animate-spin text-lg">⏳</span> Memproses...</>
            ) : (
               <><span className="text-lg">✓</span> Ya, Simpan</>
            )}
          </button>
      </div>
      </div>
    </div>
  )
}

// ==========================================
// RECEIPT MODAL
// ==========================================
function ReceiptModal({ receipt, dispatch, isDarkMode }: any) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 font-mono ${isDarkMode ? 'bg-black/90 text-white' : 'bg-gray-900/80 text-black'}`}>
      <div className="w-full max-w-sm rounded shadow-2xl p-6 relative bg-[#fdfcf5] text-gray-800 border-2 border-gray-200 animate-slide-in">
        {/* Jagged edges via css clip path or pseudo would be cool, keeping it simple block for now */}
        <div className="text-center mb-6 border-b-2 border-dashed border-gray-300 pb-4">
          <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto mb-3 shadow-lg">✓</div>
          <h2 className="text-xl font-bold uppercase tracking-widest text-green-600">Lunas</h2>
          <p className="text-xs text-gray-500 mt-1">{new Date(receipt.timestamp).toLocaleString('id-ID')}</p>
          <p className="text-xs text-gray-500 uppercase mt-1">REF: #{receipt.id || 'CUKUR'}</p>
        </div>

        <div className="flex text-xs justify-between mb-1"><span>Customer:</span><span className="font-bold truncate max-w-[150px]">{receipt.customerName}</span></div>
        <div className="flex text-xs justify-between mb-1"><span>Barber:</span><span className="font-bold truncate max-w-[150px]">{receipt.barberName}</span></div>
        <div className="flex text-xs justify-between mb-4"><span>Metode:</span><span className="font-bold uppercase">{receipt.paymentMethod}</span></div>
        
        <div className="border-t border-b border-dashed border-gray-300 py-3 mb-4 flex flex-col gap-2">
          {receipt.items.map((itm: any, idx: number) => (
            <div key={idx} className="flex justify-between items-start text-xs leading-tight">
              <span className="flex-1 pr-4">{itm.name}</span>
              <span className="font-bold shrink-0">{itm.final_price.toLocaleString('id-ID')}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-end mb-8">
          <span className="text-sm font-bold">TOTAL BAYAR</span>
          <span className="text-xl font-bold">Rp {receipt.total.toLocaleString('id-ID')}</span>
        </div>

        <button 
          onClick={() => dispatch({type: 'NEW_TRANSACTION'})} 
          className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded shadow-xl tracking-widest uppercase transition-all active:scale-95"
        >
          Trans Baru ➜
        </button>
      </div>
    </div>
  )
}
