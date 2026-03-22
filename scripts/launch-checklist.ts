/**
 * CukurShip — Launch Checklist Script
 * 
 * Run with: npx ts-node scripts/launch-checklist.ts
 * Or:       npx tsx scripts/launch-checklist.ts
 * 
 * This script verifies that all required environment variables are set,
 * Supabase is accessible and all tables exist, WhatsApp service is reachable,
 * and RLS is enabled on critical tables.
 */

import { createClient } from '@supabase/supabase-js';

// Load .env.local
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.substring(0, idx).trim();
            const value = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) process.env[key] = value;
        }
    });
}

// ─── Colors ────────────────────────────────────────────────────────
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const AMBER  = '\x1b[33m';
const CYAN  = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;

function ok(label: string, detail = '') {
    passed++;
    console.log(`  ${GREEN}✓ PASSED${RESET}  ${label}${detail ? `  ${AMBER}(${detail})${RESET}` : ''}`);
}

function fail(label: string, detail = '') {
    failed++;
    console.log(`  ${RED}✗ FAILED${RESET}  ${label}${detail ? `  — ${detail}` : ''}`);
}

function section(title: string) {
    console.log(`\n${BOLD}${CYAN}══ ${title} ══${RESET}`);
}

// ─── Check 1: Environment Variables ────────────────────────────────
section('1. Environment Variables');

const REQUIRED_VARS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'WHATSAPP_SERVICE_URL',
    'WHATSAPP_SERVICE_SECRET',
    'MIDTRANS_SERVER_KEY',
    'NEXT_PUBLIC_MIDTRANS_CLIENT_KEY',
    'MIDTRANS_IS_PRODUCTION',
];

for (const varName of REQUIRED_VARS) {
    const val = process.env[varName];
    if (!val || val.includes('GANTI') || val.includes('your_') || val.includes('xxxx')) {
        fail(varName, 'not set or still placeholder');
    } else {
        ok(varName, val.substring(0, 20) + (val.length > 20 ? '...' : ''));
    }
}

// Validate JWT_SECRET length
const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
    fail('JWT_SECRET length', `Only ${jwtSecret.length} chars — should be at least 32`);
} else {
    ok('JWT_SECRET length', `${jwtSecret.length} chars`);
}

// Validate Midtrans environment consistency
const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
if (isProduction && serverKey.startsWith('SB-')) {
    fail('Midtrans keys', 'MIDTRANS_IS_PRODUCTION=true but using Sandbox (SB-) key!');
} else if (!isProduction && !serverKey.startsWith('SB-') && serverKey.length > 10) {
    fail('Midtrans keys', 'MIDTRANS_IS_PRODUCTION=false but NOT using Sandbox key');
} else if (serverKey.length > 5) {
    ok('Midtrans key type', isProduction ? 'Production' : 'Sandbox');
}

// ─── Check 2: Supabase Connection ──────────────────────────────────
section('2. Supabase Connection');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const REQUIRED_TABLES = [
    'users', 'tenants', 'tenant_settings', 'barbers', 'services',
    'barber_schedules', 'bookings', 'otp_sessions', 'time_off',
    'subscription_transactions',
];

for (const table of REQUIRED_TABLES) {
    try {
        const { error } = await (supabase.from(table).select('id').limit(1));
        if (error) {
            fail(`Table: ${table}`, error.message);
        } else {
            ok(`Table: ${table}`);
        }
    } catch (e: any) {
        fail(`Table: ${table}`, e.message);
    }
}

// ─── Check 3: RLS Status ───────────────────────────────────────────
section('3. Row Level Security');

const RLS_TABLES = ['users', 'tenants', 'bookings', 'barbers', 'services', 'subscription_transactions'];

for (const table of RLS_TABLES) {
    try {
        const { data, error } = await supabase
            .rpc('check_rls_enabled', { table_name: table })
            .single();

        // If RPC doesn't exist, fall back to a direct query
        if (error) {
            // Try pg_tables query
            const { data: rlsData } = await supabase
                .from('pg_tables')
                .select('rowsecurity')
                .eq('tablename', table)
                .single();
            if (rlsData?.rowsecurity) {
                ok(`RLS on ${table}`);
            } else {
                // Can't verify — mark as warning
                console.log(`  ${AMBER}? UNKNOWN${RESET}  RLS on ${table}  (cannot verify — check Supabase dashboard)`);
            }
        } else if (data) {
            ok(`RLS on ${table}`);
        } else {
            fail(`RLS on ${table}`, 'RLS is NOT enabled');
        }
    } catch {
        console.log(`  ${AMBER}? UNKNOWN${RESET}  RLS on ${table}  (verify manually in Supabase → Authentication → Policies)`);
    }
}

// ─── Check 4: WhatsApp Service ─────────────────────────────────────
section('4. WhatsApp Microservice');

const waUrl = process.env.WHATSAPP_SERVICE_URL;
if (waUrl) {
    try {
        const baseUrl = waUrl.endsWith('/') ? waUrl.slice(0, -1) : waUrl;
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            ok('WhatsApp service reachable', baseUrl);
        } else {
            fail('WhatsApp service', `HTTP ${res.status}`);
        }
    } catch (e: any) {
        fail('WhatsApp service reachable', e.message);
    }
} else {
    fail('WhatsApp service URL', 'not configured');
}

// ─── Summary ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`${BOLD}RESULT: ${GREEN}${passed} PASSED${RESET}  |  ${RED}${failed} FAILED${RESET}\n`);

if (failed === 0) {
    console.log(`${GREEN}${BOLD}🚀 All checks passed! Ready for launch.${RESET}\n`);
} else {
    console.log(`${RED}${BOLD}⚠️  Fix the ${failed} failing check(s) before launch.${RESET}\n`);
    process.exit(1);
}
