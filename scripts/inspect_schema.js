const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
  const tables = ['products', 'brands', 'categories', 'subcategories'];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (error) {
        console.error(`Error selecting from ${t}:`, error.message || error);
        continue;
      }
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`${t}: no rows returned; cannot infer columns from data (table may be empty).`);
      } else {
        const row = data[0];
        console.log(`${t}: columns =>`, Object.keys(row));
      }
    } catch (e) {
      console.error(`Exception fetching ${t}:`, e.message || e);
    }
  }
}

inspect().catch(e=>{console.error(e); process.exit(1);});
