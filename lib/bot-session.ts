import { supabaseAdmin } from '@/lib/supabase'

// ─── TYPES ────────────────────────────────────
export interface CartItem {
  service_id:   string
  service_name: string
  price:        number
  qty:          number
}

export type BotStep =
  | 'idle'
  | 'awaiting_price'
  | 'awaiting_payment'
  | 'awaiting_customer'
  | 'confirming'
  | 'expense_category'
  | 'expense_description'
  | 'expense_amount'
  | 'expense_receipt'
  | 'expense_confirm'

export interface BotContext {
  // Saat awaiting_price:
  service_id?:    string
  service_name?:  string
  price_min?:     number
  price_max?:     number
  price_type?:    'range' | 'custom'

  // Cart — selalu ada setelah item pertama:
  cart?: CartItem[]

  // Customer (opsional):
  customer_id?:   string | null
  customer_name?: string | null
  customer_phone?: string | null
  crm_action?:    'search' | 'new_name' | 'new_phone'
  new_customer_name?: string

  // Saat awaiting_payment & confirming:
  total_price?:     number
  payment_method?:  'cash' | 'qris' | 'transfer'
  
  // Custom Flow states:
  awaiting_free_input?: boolean
  awaiting_cash_input?: boolean

  // Expense states:
  expense?: {
    category: string
    cat_label?: string
    description?: string
    amount?: number
    receipt_url?: string | null
  }
}

export interface BotSession {
  id:         string
  chat_id:    string
  tenant_id:  string
  barber_id:  string
  step:       BotStep
  context:    BotContext
  expires_at: string
  updated_at: string
}

// ─── GET SESSION ──────────────────────────────
export async function getSession(chatId: string, tenantId: string): Promise<BotSession | null> {
  const { data } = await supabaseAdmin
    .from('telegram_bot_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) return null

  // Cek TTL 15 menit:
  const SESSION_TTL_MS = 15 * 60 * 1000
  const updatedAt = new Date(data.updated_at).getTime()
  const now = Date.now()

  if (now - updatedAt > SESSION_TTL_MS) {
    // Session expired — auto-clear:
    await supabaseAdmin
      .from('telegram_bot_sessions')
      .delete()
      .eq('chat_id', chatId)
      .eq('tenant_id', tenantId)

    return null
  }

  return data as BotSession
}

// ─── UPSERT SESSION ───────────────────────────
export async function upsertSession(
  chatId:   string,
  tenantId: string,
  barberId: string,
  step:     BotStep,
  context:  BotContext
): Promise<void> {
  await supabaseAdmin
    .from('telegram_bot_sessions')
    .upsert({
      chat_id:    chatId,
      tenant_id:  tenantId,
      barber_id:  barberId,
      step,
      context,
      expires_at: new Date(
        Date.now() + 30 * 60 * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'chat_id,tenant_id',
    })
}

// ─── CLEAR SESSION ────────────────────────────
export async function clearSession(
  chatId:   string,
  tenantId: string
): Promise<void> {
  await supabaseAdmin
    .from('telegram_bot_sessions')
    .delete()
    .eq('chat_id', chatId)
    .eq('tenant_id', tenantId)
}

// ─── CART HELPERS ─────────────────────────────
export function addToCart(
  cart: CartItem[],
  item: Omit<CartItem, 'qty'>
): CartItem[] {
  const existing = cart.find(
    c => c.service_id === item.service_id
  )
  if (existing) {
    return cart.map(c =>
      c.service_id === item.service_id
        ? { ...c, qty: c.qty + 1 }
        : c
    )
  }
  return [...cart, { ...item, qty: 1 }]
}

export function removeFromCart(
  cart: CartItem[],
  serviceId: string
): CartItem[] {
  return cart.filter(c => c.service_id !== serviceId)
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, c) => sum + c.price * c.qty, 0)
}

export function formatCart(
  cart: CartItem[],
  timezone: string
): string {
  if (cart.length === 0) return '(kosong)'
  const lines = cart.map(c =>
    `• ${c.service_name}${c.qty > 1 ? ` ×${c.qty}` : ''
    } — Rp ${c.price.toLocaleString('id-ID')}`
  )
  const total = getCartTotal(cart)
  return (
    lines.join('\n') +
    `\n${'─'.repeat(28)}\n` +
    `*Total: Rp ${total.toLocaleString('id-ID')}*`
  )
}
