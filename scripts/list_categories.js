const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async function(){
  try{
    const { data, error } = await supabase.from('categories').select('*').limit(50);
    if(error) { console.error('Error fetching categories', error); process.exit(1); }
    console.log('categories sample:', data && data.slice(0,20));
  } catch(e){ console.error(e); }
})();
