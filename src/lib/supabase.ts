import { createClient } from '@supabase/supabase-js';

const envUrl = (process.env.REACT_APP_SUPABASE_URL || '').trim();
const envAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

export const SUPABASE_URL = envUrl || 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = envAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
