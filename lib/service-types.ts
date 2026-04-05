// lib/service-types.ts
// Konstanta terpusat untuk nilai service_type
// Gunakan ini di seluruh codebase, 
// JANGAN hardcode string langsung

export const SERVICE_TYPES = {
  BARBERSHOP:   'barbershop',
  HOME_SERVICE: 'home_service',
  POS_KASIR:    'pos_kasir',
} as const

export type ServiceType = 
  typeof SERVICE_TYPES[keyof typeof SERVICE_TYPES]

// Type guard
export function isValidServiceType(
  value: string
): value is ServiceType {
  return Object.values(SERVICE_TYPES).includes(
    value as ServiceType
  )
}

// Booking-safe types (tidak termasuk kasir)
export const BOOKING_SERVICE_TYPES: ServiceType[] = [
  SERVICE_TYPES.BARBERSHOP,
  SERVICE_TYPES.HOME_SERVICE,
]
