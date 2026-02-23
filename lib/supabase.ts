import { createClient } from '@supabase/supabase-js';

// Use internal URL for server-side, public URL for client-side
const supabaseUrl = typeof window === 'undefined' 
  ? (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!)
  : process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
