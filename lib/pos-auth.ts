import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

const POS_SECRET = process.env.POS_JWT_SECRET!

export interface PosTokenPayload {
  barberId:   string
  tenantId:   string
  barberName: string
  barberRole: 'barber' | 'cashier'
  phone:      string
  shopName:   string
}

export function generatePosToken(
  payload: PosTokenPayload
): string {
  const hours = parseInt(process.env.POS_SESSION_HOURS || '12', 10)
  return jwt.sign(payload, POS_SECRET, {
    expiresIn: hours * 3600, // Token expiry in seconds
  })
}

export function getPosTokenFromRequest(
  req: NextRequest
): PosTokenPayload | null {
  try {
    const auth = req.headers.get('Authorization')
    const token = auth?.startsWith('Bearer ')
      ? auth.slice(7)
      : null
    if (!token) return null
    const payload = jwt.verify(token, POS_SECRET)
    return payload as PosTokenPayload
  } catch {
    return null
  }
}
