import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client using service role key (bypasses RLS - use carefully)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Client-side client using anon key (respects RLS, good for public unauthenticated access)
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Membuat instance Supabase yang terikat dengan tenant_id spesifik.
 * Cocok untuk dipanggil di dalam API route Server-Side (Next.js).
 * Data tenant_id akan disisipkan dengan aman ke dalam custom JWT.
 * Di sisi database, RLS dapat mengambilnya menggunakan `current_setting('request.jwt.claims')`
 */
export function createTenantClient(tenantId: string) {
    if (!process.env.SUPABASE_JWT_SECRET) {
        throw new Error("SUPABASE_JWT_SECRET must be configured to use createTenantClient.");
    }

    // Sign a custom JWT using Supabase's actual JWT secret. 
    // This allows PostgREST to recognize the user and extract claims.
    const customJwt = jwt.sign(
        {
            role: 'authenticated', // Memicu role authenticated di Supabase
            app_metadata: {
                tenant_id: tenantId // Disimpan di app_metadata sesuai best practice Supabase
            }
        }, 
        process.env.SUPABASE_JWT_SECRET,
        { expiresIn: '1h' } // Token short-lived untuk 1 request cycle
    );

    // Initialisasi client Supabase MENGGUNAKAN ANON KEY tapi dengan JWT KHUSUS
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${customJwt}`
            }
        }
    });
}

