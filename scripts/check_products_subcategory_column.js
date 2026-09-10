const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeWVpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  try {
    // 1) Try selecting subcategory_id directly
    const q1 = await supabase.from('products').select('id, subcategory_id').limit(1);
    console.log('select id, subcategory_id result:', JSON.stringify(q1, null, 2));

    // 2) Try selecting only id to ensure products accessible
    const q2 = await supabase.from('products').select('id').limit(1);
    console.log('select id result:', JSON.stringify(q2, null, 2));

    // 3) Try calling Postgres function to get column info via pg_catalog (may fail)
    const q3 = await supabase.rpc('pg_table_def_products', {});
    console.log('rpc pg_table_def_products result:', JSON.stringify(q3, null, 2));
  } catch (e) {
    console.error('Error during checks:', e.message || e);
  }
}
run();
