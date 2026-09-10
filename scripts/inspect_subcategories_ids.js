const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  try {
    const { data, error } = await supabase.from('subcategories').select('id,slug,name').limit(5);
    if (error) return console.error('Error selecting subcategories:', error.message || error);
    console.log('subcategories sample rows:', JSON.stringify(data, null, 2));
  } catch (e) { console.error(e); }
}
run();
