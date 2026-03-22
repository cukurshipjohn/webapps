# CukurShip — Deployment Guide

## Prerequisites
- Node.js 18+
- Supabase project (PostgreSQL)
- Midtrans account (Sandbox for dev, Production for live)
- WhatsApp microservice running
- Domain with wildcard DNS for subdomains (`*.cukurship.id`)

---

## Environment Variables

Create `.env.local` (development) or set these in your hosting platform (Vercel, etc.):

```env
# ─── SUPABASE ───────────────────────────────────────────────────────
# Supabase Project URL (public, safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co

# Supabase Anon Key (public, read-only with RLS applied)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# Supabase Service Role Key (PRIVATE — bypass RLS — never expose to client)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# ─── AUTH ───────────────────────────────────────────────────────────
# JWT Secret for signing/verifying tokens — use a long random string
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
JWT_SECRET=your_jwt_secret_at_least_64_chars_long

# ─── WHATSAPP MICROSERVICE ──────────────────────────────────────────
# URL of the WhatsApp microservice (e.g., http://localhost:3001 for dev)
WHATSAPP_SERVICE_URL=http://localhost:3001

# Internal secret to authenticate requests between Next.js and WA service
# Must match the INTERNAL_SECRET in the WhatsApp microservice
WHATSAPP_SERVICE_SECRET=your_shared_internal_secret

# ─── MIDTRANS PAYMENT GATEWAY ───────────────────────────────────────
# Server Key (PRIVATE — never expose to client)
# Sandbox: starts with SB-Mid-server-
# Production: starts with Mid-server-
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxx

# Client Key (public, used in Snap.js on frontend)
# Sandbox: starts with SB-Mid-client-
# Production: starts with Mid-client-
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxxxxx

# Set to 'true' for production Midtrans, 'false' for sandbox
MIDTRANS_IS_PRODUCTION=false

# ─── PLATFORM CONFIG ────────────────────────────────────────────────
# Root domain for generating subdomain URLs
NEXT_PUBLIC_APP_DOMAIN=cukurship.id

# WhatsApp number of the developer/superadmin (format: 628xxxxxxxxxx)
SUPERADMIN_PHONE=628xxxxxxxxxx
```

---

## Database Migrations

Run in order in **Supabase SQL Editor**:

| File | Description |
|---|---|
| `migration_01_add_roles_tenants.sql` | Base roles and tenant columns |
| `migration_02_*.sql` | ... |
| `migration_08_phase3_multitenancy.sql` | Tenants table + RLS + multi-tenancy |
| `migration_09_subscription_transactions.sql` | Billing transactions table |

---

## Midtrans Configuration

1. Login to [dashboard.sandbox.midtrans.com](https://dashboard.sandbox.midtrans.com)
2. Go to **Settings → Configuration**
3. Set **Payment Notification URL**: `https://yourdomain.com/api/billing/webhook`
4. Set redirect URLs to your domain
5. For local testing: use `ngrok http 3000` and set ngrok URL as notification URL

---

## DNS Configuration (Production)

Add these records to your domain:

| Type | Name | Value |
|---|---|---|
| A | `@` | Your server IP / Vercel IP |
| A | `*` | Your server IP / Vercel IP (wildcard for subdomains) |
| CNAME | `www` | `cukurship.id` |

---

## Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set env vars via CLI or Vercel Dashboard
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add JWT_SECRET
# ... etc for all env vars above
```

Add `*.cukurship.id` as a wildcard domain in Vercel project settings.

---

## Initial Setup After First Deploy

1. Set one user as superadmin in Supabase:
   ```sql
   UPDATE users SET role = 'superadmin' WHERE phone_number = '628xxxxxxxxxx';
   ```

2. Switch Midtrans to production:
   - Set `MIDTRANS_IS_PRODUCTION=true`
   - Replace keys with production Midtrans keys
   - Update Notification URL to production domain

3. Run the launch checklist:
   ```bash
   npx ts-node scripts/launch-checklist.ts
   ```

---

## Launch Checklist (Manual)

- [ ] All environment variables set
- [ ] Database migrations run
- [ ] Supabase RLS enabled on all tables
- [ ] Superadmin account created
- [ ] Midtrans production keys configured
- [ ] Webhook URL set in Midtrans dashboard
- [ ] WhatsApp service running and connected
- [ ] Wildcard DNS propagated
- [ ] Test full booking flow end-to-end
- [ ] Test payment flow with Midtrans sandbox
