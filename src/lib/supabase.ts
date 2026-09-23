import { createClient } from '@supabase/supabase-js';

const envUrl = (process.env.REACT_APP_SUPABASE_URL || '').trim();
const envAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

export const SUPABASE_URL = envUrl || 'https://sabidzkqratdhbyqdouv.supabase.co';
const SUPABASE_ANON_KEY = envAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYmlkemtxcmF0ZGhieXFkb3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNzcyMTMsImV4cCI6MjEwNTc1MzIxM30.zNM5zGuC-WR-ny9_j56Hrevt7gC9Usf7lqyEdJhCZYc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
