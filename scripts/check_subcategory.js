const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check({ byId, slug, name, category_id }) {
  if (!byId && !slug && !name) {
    console.error('Provide --id or --slug or --name (and --category when using slug/name)');
    process.exit(1);
  }

  try {
    if (byId) {
      const { data, error, count } = await supabase.from('subcategories').select('*').eq('id', byId).maybeSingle();
      console.log('By ID result:', { data, error });
    }
    if (slug || name) {
      const q = supabase.from('subcategories').select('*', { count: 'exact' }).limit(100);
      if (slug) q.eq('slug', slug);
      if (name) q.eq('name', name);
      if (category_id) q.eq('category_id', category_id);
      const { data, error } = await q;
      console.log('By slug/name+category result count:', Array.isArray(data) ? data.length : 0);
      console.log('By slug/name+category data sample:', data && data.slice(0,5));
      if (error) console.error('Error querying by slug/name:', error);
    }
  } catch (e) {
    console.error('Check failed:', e);
  }
}

// Simple CLI parsing
const argv = require('minimist')(process.argv.slice(2));
const byId = argv.id || argv.i || null;
const slug = argv.slug || argv.s || null;
const category_id = argv.category || argv.c || null;

check({ byId, slug, category_id }).then(() => process.exit(0));
